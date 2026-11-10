"""Check queue: download → child process with limits → callback to the app.

The queue is in memory. If the service restarts mid-run the app closes the
stale run itself (issue #18, "stale run-ების დახურვა"); nothing here is
persisted, and the DXF is deleted as soon as the run ends.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import shutil
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import urlsplit

import httpx

from .checker.engine import ENGINE_VERSION
from .config import Settings

log = logging.getLogger("dxf-checker")
SERVICE_ROOT = Path(__file__).resolve().parent.parent
CALLBACK_DELAYS = (0, 2, 5, 15, 30)


class QueueFull(Exception):
    pass


class DownloadError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Job:
    run_id: str
    file_url: str
    file_name: str
    callback_url: str
    rules: dict
    role: Optional[str] = None
    enabled: Optional[list[str]] = None
    severity: dict = field(default_factory=dict)
    originators: list[str] = field(default_factory=list)
    ignored_rules: list[str] = field(default_factory=list)


def url_host(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def _limits(mem_bytes: int, cpu_seconds: int):
    def apply() -> None:  # runs in the child between fork and exec (POSIX only)
        import resource

        resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 5))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

    return apply


def _default_client() -> httpx.AsyncClient:
    # Redirects stay off: a presigned URL never redirects, and following one would
    # step around the host allowlist.
    return httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0), follow_redirects=False)


class Runner:
    def __init__(self, settings: Settings, client_factory: Optional[Callable[[], httpx.AsyncClient]] = None):
        self.settings = settings
        self._client_factory = client_factory or _default_client
        self._sem: Optional[asyncio.Semaphore] = None
        self._jobs: dict[str, asyncio.Task] = {}
        self._running = 0

    # ---- queue -------------------------------------------------------------

    @property
    def active(self) -> int:
        return self._running

    @property
    def queued(self) -> int:
        return len(self._jobs) - self._running

    def submit(self, job: Job) -> bool:
        """Start a run. False when the same runId is already in flight (idempotent retry)."""
        if job.run_id in self._jobs:
            return False
        if len(self._jobs) >= self.settings.max_queue:
            raise QueueFull()
        if self._sem is None:
            self._sem = asyncio.Semaphore(self.settings.max_concurrency)
        task = asyncio.get_running_loop().create_task(self.process(job))
        self._jobs[job.run_id] = task
        task.add_done_callback(lambda _t, rid=job.run_id: self._jobs.pop(rid, None))
        return True

    async def shutdown(self) -> None:
        for task in list(self._jobs.values()):
            task.cancel()

    # ---- one run -----------------------------------------------------------

    async def process(self, job: Job) -> dict:
        started = time.monotonic()
        if self._sem is None:
            self._sem = asyncio.Semaphore(self.settings.max_concurrency)
        try:
            async with self._sem:
                self._running += 1
                try:
                    result = await self.execute(job)
                finally:
                    self._running -= 1
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.exception("run %s crashed", job.run_id)
            result = {"status": "failed", "errorCode": "INTERNAL", "error": f"შემოწმება ჩაიშალა: {type(exc).__name__}"}
        result["runId"] = job.run_id
        result.setdefault("engineVersion", ENGINE_VERSION)
        result["durationMs"] = int((time.monotonic() - started) * 1000)
        result["ignoredRules"] = job.ignored_rules
        log.info(json.dumps({
            "event": "check.finished", "runId": job.run_id, "status": result.get("status"),
            "errorCode": result.get("errorCode"), "counts": result.get("counts"), "durationMs": result["durationMs"],
            "sizeBytes": (result.get("file") or {}).get("sizeBytes"),
        }))
        await self.send_callback(job, result)
        return result

    async def execute(self, job: Job) -> dict:
        s = self.settings
        s.work_dir.mkdir(parents=True, exist_ok=True)
        workdir = Path(tempfile.mkdtemp(prefix="run-", dir=s.work_dir))
        try:
            dxf = workdir / "input.dxf"
            try:
                size, sha = await self.download(job.file_url, dxf)
            except DownloadError as exc:
                return {"status": "failed", "errorCode": exc.code, "error": exc.message, "file": {"name": job.file_name}}
            file_meta = {"name": job.file_name, "sizeBytes": size, "sha256": sha}
            job_path, result_path = workdir / "job.json", workdir / "result.json"
            job_path.write_text(json.dumps({
                "path": str(dxf), "filename": job.file_name, "role": job.role, "rules": job.rules,
                "enabled": job.enabled, "severity": job.severity, "originators": job.originators,
            }, ensure_ascii=False), encoding="utf-8")
            outcome = await self.run_child(workdir, job_path, result_path)
            outcome["file"] = file_meta
            return outcome
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    async def download(self, url: str, dest: Path) -> tuple[int, str]:
        limit = self.settings.max_file_bytes
        sha = hashlib.sha256()
        size = 0
        try:
            async with self._client_factory() as client:
                async with client.stream("GET", url) as resp:
                    if resp.status_code != 200:
                        raise DownloadError("DOWNLOAD", f"ფაილი ვერ ჩამოიტვირთა (HTTP {resp.status_code}).")
                    declared = resp.headers.get("content-length")
                    if declared and declared.isdigit() and int(declared) > limit:
                        raise DownloadError("TOO_LARGE", f"ფაილი {limit // (1024 * 1024)} MB-ზე დიდია.")
                    with open(dest, "wb") as f:
                        async for chunk in resp.aiter_bytes(1024 * 1024):
                            size += len(chunk)
                            if size > limit:
                                raise DownloadError("TOO_LARGE", f"ფაილი {limit // (1024 * 1024)} MB-ზე დიდია.")
                            sha.update(chunk)
                            f.write(chunk)
        except DownloadError:
            raise
        except httpx.HTTPError as exc:
            raise DownloadError("DOWNLOAD", f"ფაილი ვერ ჩამოიტვირთა: {type(exc).__name__}.") from exc
        if size == 0:
            raise DownloadError("DOWNLOAD", "ჩამოტვირთული ფაილი ცარიელია.")
        return size, sha.hexdigest()

    async def run_child(self, workdir: Path, job_path: Path, result_path: Path) -> dict:
        s = self.settings
        # The child gets no secrets: only what Python needs to start.
        env = {
            "PATH": os.environ.get("PATH", ""), "HOME": str(workdir), "TMPDIR": str(workdir),
            "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1",
            "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1",
        }
        if os.name == "nt":  # local development only; production runs on Linux
            env["SYSTEMROOT"] = os.environ.get("SYSTEMROOT", "")
            env["USERPROFILE"] = str(workdir)
        kwargs = {}
        if os.name == "posix":
            kwargs["preexec_fn"] = _limits(s.check_memory_mb * 1024 * 1024, s.check_timeout_seconds)
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "app.checker.cli", str(job_path), str(result_path),
            cwd=str(SERVICE_ROOT), env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, **kwargs,
        )
        try:
            _out, err = await asyncio.wait_for(proc.communicate(), timeout=s.check_timeout_seconds)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return {"status": "failed", "errorCode": "TIMEOUT",
                    "error": f"შემოწმებამ {s.check_timeout_seconds} წამს გადააჭარბა. ფაილი ძალიან დიდი ან რთულია."}
        except asyncio.CancelledError:
            proc.kill()
            raise
        if result_path.exists():
            try:
                return json.loads(result_path.read_text(encoding="utf-8"))
            except ValueError:
                pass
        tail = err.decode("utf-8", "replace")[-1500:]
        if "MemoryError" in tail or proc.returncode in (-9, 137):
            return {"status": "failed", "errorCode": "MEMORY", "error": "ფაილის დამუშავებას მეხსიერება არ ეყო."}
        log.error("child exited %s without a result: %s", proc.returncode, tail)
        return {"status": "failed", "errorCode": "INTERNAL", "error": f"შემოწმების პროცესი ჩაიშალა (კოდი {proc.returncode})."}

    async def send_callback(self, job: Job, result: dict) -> bool:
        body = json.dumps(result, ensure_ascii=False, default=str).encode("utf-8")
        headers = {"Authorization": f"Bearer {self.settings.secret}", "Content-Type": "application/json; charset=utf-8"}
        for attempt, delay in enumerate(CALLBACK_DELAYS, start=1):
            if delay:
                await asyncio.sleep(delay)
            try:
                async with self._client_factory() as client:
                    resp = await client.post(job.callback_url, content=body, headers=headers)
                if resp.status_code < 300:
                    return True
                if 400 <= resp.status_code < 500 and resp.status_code not in (408, 429):
                    log.warning("callback for %s refused with HTTP %s; not retrying", job.run_id, resp.status_code)
                    return False
                log.warning("callback for %s got HTTP %s (attempt %s)", job.run_id, resp.status_code, attempt)
            except httpx.HTTPError as exc:
                log.warning("callback for %s failed (attempt %s): %s", job.run_id, attempt, type(exc).__name__)
        log.error("callback for %s gave up after %s attempts", job.run_id, len(CALLBACK_DELAYS))
        return False
