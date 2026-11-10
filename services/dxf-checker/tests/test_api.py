"""HTTP layer and the full run (download → child process → callback) against a mocked network."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.checker.engine import default_rules
from app.config import Settings
from app.main import create_app
from app.worker import Job, Runner
from dxf_fixtures import BAD_NAME

SECRET = "s" * 40
AUTH = {"Authorization": f"Bearer {SECRET}"}
FILE_URL = "https://bucket.test/drawings/x.dxf?X-Amz-Signature=abc"
CALLBACK = "http://bom.railway.internal:8080/api/internal/drawing-checks/run1/result"


def make_settings(tmp_path: Path, **kw) -> Settings:
    base = dict(secret=SECRET, allowed_download_hosts=frozenset({"bucket.test"}),
                allowed_callback_hosts=frozenset({"bom.railway.internal"}), work_dir=tmp_path / "work",
                check_timeout_seconds=120)
    base.update(kw)
    return Settings(**base)


class RecordingRunner(Runner):
    def __init__(self, settings):
        super().__init__(settings)
        self.submitted: list[Job] = []

    def submit(self, job: Job) -> bool:
        dup = any(j.run_id == job.run_id for j in self.submitted)
        self.submitted.append(job)
        return not dup


def body(**over) -> dict:
    b = {"runId": "run1", "file": {"url": FILE_URL, "name": BAD_NAME, "sizeBytes": 1000},
         "context": {"role": "wip"}, "rules": {}, "callbackUrl": CALLBACK}
    b.update(over)
    return b


@pytest.fixture()
def client(tmp_path):
    settings = make_settings(tmp_path)
    runner = RecordingRunner(settings)
    with TestClient(create_app(settings, runner)) as c:
        c.runner = runner
        yield c


def test_health_needs_no_secret(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_secret_is_required(client):
    assert client.post("/v1/checks", json=body()).status_code == 401
    assert client.post("/v1/checks", json=body(), headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/v1/catalog").status_code == 401
    assert client.get("/v1/catalog", headers=AUTH).status_code == 200


def test_accepts_a_valid_request(client):
    r = client.post("/v1/checks", json=body(rules={"enabled": ["D15-UNITS", "NOPE"], "severity": {"D07-SKU": "ERROR"}}), headers=AUTH)
    assert r.status_code == 202, r.text
    assert r.json()["duplicate"] is False
    [job] = client.runner.submitted
    assert job.enabled == ["D15-UNITS"]
    assert job.ignored_rules == ["NOPE"]
    assert job.severity == {"D07-SKU": "ERROR"}
    assert job.role == "wip"
    # the same runId again is accepted but flagged as a duplicate
    assert client.post("/v1/checks", json=body(), headers=AUTH).json()["duplicate"] is True


@pytest.mark.parametrize("over, status", [
    ({"file": {"url": "https://evil.test/x.dxf", "name": BAD_NAME}}, 422),
    ({"file": {"url": "http://bucket.test/x.dxf", "name": BAD_NAME}}, 422),
    ({"file": {"url": FILE_URL, "name": "../x.dxf"}}, 422),
    ({"callbackUrl": "http://169.254.169.254/latest"}, 422),
    ({"runId": "bad id!"}, 422),
    ({"context": {"role": "draft"}}, 422),
    ({"rules": {"params": {"drafting": {"sku_generic_pattern": "("}}}}, 422),
    ({"file": {"url": FILE_URL, "name": BAD_NAME, "sizeBytes": 10 ** 12}}, 413),
])
def test_refuses_unsafe_or_invalid_requests(client, over, status):
    r = client.post("/v1/checks", json=body(**over), headers=AUTH)
    assert r.status_code == status, r.text
    assert client.runner.submitted == []


def test_full_run_posts_findings_to_the_callback(tmp_path, bad_dxf):
    data = bad_dxf.read_bytes()
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and request.url.host == "bucket.test":
            return httpx.Response(200, content=data, headers={"content-length": str(len(data))})
        if request.method == "POST" and request.url.host == "bom.railway.internal":
            seen["auth"] = request.headers.get("authorization")
            seen["body"] = json.loads(request.content)
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(404)

    settings = make_settings(tmp_path)
    runner = Runner(settings, client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    job = Job(run_id="run1", file_url=FILE_URL, file_name=BAD_NAME, callback_url=CALLBACK,
              rules=default_rules(), role="wip")
    result = asyncio.run(runner.process(job))

    assert result["status"] == "done", result
    assert seen["auth"] == f"Bearer {SECRET}"
    cb = seen["body"]
    assert cb["runId"] == "run1"
    assert cb["file"]["sizeBytes"] == len(data)
    assert len(cb["file"]["sha256"]) == 64
    assert {"D15-UNITS", "T-SHEET"} <= {f["rule"] for f in cb["findings"]}
    assert cb["parsedName"]["sheetCode"] == "ZZ-00-FA-103"
    assert cb["titleblock"]["values"]["sheet_no"] == "FA-104"
    # the DXF does not outlive the run
    assert not any((tmp_path / "work").iterdir())


def test_too_large_download_fails_the_run(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, content=b"0\nSECTION\n" * 200_000)
        return httpx.Response(200)

    settings = make_settings(tmp_path, max_file_bytes=1024)
    runner = Runner(settings, client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    job = Job(run_id="run2", file_url=FILE_URL, file_name=BAD_NAME, callback_url=CALLBACK, rules={}, role="wip")
    result = asyncio.run(runner.process(job))
    assert result["status"] == "failed"
    assert result["errorCode"] == "TOO_LARGE"


def test_refused_callback_is_not_retried(tmp_path, monkeypatch):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.method)
        return httpx.Response(409)

    settings = make_settings(tmp_path)
    runner = Runner(settings, client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    job = Job(run_id="run3", file_url=FILE_URL, file_name=BAD_NAME, callback_url=CALLBACK, rules={})
    ok = asyncio.run(runner.send_callback(job, {"runId": "run3", "status": "failed"}))
    assert ok is False
    assert calls == ["POST"]
