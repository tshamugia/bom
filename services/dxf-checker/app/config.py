"""Service settings from the environment."""
from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path


def _hosts(name: str) -> frozenset[str]:
    raw = os.environ.get(name, "")
    return frozenset(h.strip().lower() for h in raw.split(",") if h.strip())


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw else default


def _bool(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes")


@dataclass(frozen=True)
class Settings:
    secret: str
    # Downloads only from the bucket host(s) and callbacks only to the app (SSRF).
    allowed_download_hosts: frozenset[str]
    allowed_callback_hosts: frozenset[str]
    allow_http_download: bool = False
    max_file_bytes: int = 150 * 1024 * 1024
    max_concurrency: int = 2
    max_queue: int = 50
    check_timeout_seconds: int = 300
    check_memory_mb: int = 2048
    work_dir: Path = field(default_factory=lambda: Path(tempfile.gettempdir()) / "dxf-checker")

    @classmethod
    def from_env(cls) -> "Settings":
        secret = os.environ.get("DXF_CHECKER_SECRET", "")
        if len(secret) < 32:
            raise RuntimeError("DXF_CHECKER_SECRET must be set (at least 32 characters).")
        download = _hosts("ALLOWED_DOWNLOAD_HOSTS")
        callback = _hosts("ALLOWED_CALLBACK_HOSTS")
        if not download or not callback:
            raise RuntimeError("ALLOWED_DOWNLOAD_HOSTS and ALLOWED_CALLBACK_HOSTS must be set.")
        return cls(
            secret=secret,
            allowed_download_hosts=download,
            allowed_callback_hosts=callback,
            allow_http_download=_bool("ALLOW_HTTP_DOWNLOAD"),
            max_file_bytes=_int("MAX_FILE_MB", 150) * 1024 * 1024,
            max_concurrency=max(1, _int("MAX_CONCURRENCY", 2)),
            max_queue=max(1, _int("MAX_QUEUE", 50)),
            check_timeout_seconds=max(10, _int("CHECK_TIMEOUT_SECONDS", 300)),
            check_memory_mb=max(256, _int("CHECK_MEMORY_MB", 2048)),
            work_dir=Path(os.environ.get("WORK_DIR") or Path(tempfile.gettempdir()) / "dxf-checker"),
        )
