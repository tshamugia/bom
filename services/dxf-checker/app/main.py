"""dxf-checker HTTP API (issue #18).

    POST /v1/checks           queue a check of one DXF; the result goes to callbackUrl
    POST /v1/params/validate  whether a check would accept these parameters (Settings asks before saving)
    GET  /v1/catalog          rules (grouped as in Settings) and default parameters
    GET  /healthz     liveness for Railway

Only the Revline app talks to this service, over Railway's private network,
with a shared bearer secret. Run with `python -m app.serve` (dual-stack
listen on $PORT), or locally `uvicorn --factory app.main:create_app`.
"""
from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from .checker.common import RULES
from .checker.engine import ENGINE_VERSION, ROLES, build_rules, catalog
from .config import Settings
from .worker import Job, QueueFull, Runner, url_host

log = logging.getLogger("dxf-checker")


class FileRef(BaseModel):
    model_config = ConfigDict(extra="ignore")
    url: str = Field(min_length=8, max_length=8192)
    name: str = Field(min_length=1, max_length=255)
    sizeBytes: Optional[int] = Field(default=None, ge=0)


class CheckContext(BaseModel):
    model_config = ConfigDict(extra="ignore")
    role: Optional[Literal["wip", "issued"]] = None
    originators: list[str] = Field(default_factory=list, max_length=50)


class RulesSpec(BaseModel):
    model_config = ConfigDict(extra="ignore")
    enabled: Optional[list[str]] = Field(default=None, max_length=500)
    severity: dict[str, Literal["ERROR", "WARNING", "INFO"]] = Field(default_factory=dict)
    params: dict = Field(default_factory=dict)


class CheckRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    runId: str = Field(pattern=r"^[A-Za-z0-9_\-]{1,100}$")
    file: FileRef
    context: CheckContext = Field(default_factory=CheckContext)
    rules: RulesSpec = Field(default_factory=RulesSpec)
    callbackUrl: str = Field(min_length=8, max_length=2048)


def create_app(settings: Optional[Settings] = None, runner: Optional[Runner] = None) -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    # httpx logs full URLs at INFO, and a presigned URL carries its signature.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    settings = settings or Settings.from_env()
    runner = runner or Runner(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        log.info("dxf-checker %s up: concurrency=%s queue=%s timeout=%ss memory=%sMB max_file=%sMB",
                 ENGINE_VERSION, settings.max_concurrency, settings.max_queue, settings.check_timeout_seconds,
                 settings.check_memory_mb, settings.max_file_bytes // (1024 * 1024))
        yield
        await runner.shutdown()

    app = FastAPI(title="dxf-checker", version=ENGINE_VERSION, lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.runner = runner

    def require_secret(authorization: str = Header(default="")) -> None:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(token.encode(), settings.secret.encode()):
            raise HTTPException(status_code=401, detail="unauthorized")

    @app.get("/healthz")
    async def healthz():
        return {"ok": True, "engineVersion": ENGINE_VERSION, "active": runner.active, "queued": runner.queued}

    @app.get("/v1/catalog", dependencies=[Depends(require_secret)])
    async def get_catalog():
        return catalog()

    @app.post("/v1/params/validate", dependencies=[Depends(require_secret)])
    async def validate_params(spec: RulesSpec):
        """Settings asks before it saves: 200 when a check would accept these parameters, else 422 naming the bad one."""
        try:
            build_rules(spec.params)
        except ValueError as exc:
            raise HTTPException(422, detail=str(exc)) from exc
        return {"ok": True}

    @app.post("/v1/checks", status_code=202, dependencies=[Depends(require_secret)])
    async def create_check(req: CheckRequest, request: Request):
        name = req.file.name
        if "/" in name or "\\" in name or name.strip() != name:
            raise HTTPException(422, detail="file.name must be a bare file name")
        scheme = req.file.url.split(":", 1)[0].lower()
        if scheme != "https" and not (scheme == "http" and settings.allow_http_download):
            raise HTTPException(422, detail="file.url must be https")
        if url_host(req.file.url) not in settings.allowed_download_hosts:
            raise HTTPException(422, detail="file.url host is not allowed")
        if req.callbackUrl.split(":", 1)[0].lower() not in ("http", "https"):
            raise HTTPException(422, detail="callbackUrl must be http(s)")
        if url_host(req.callbackUrl) not in settings.allowed_callback_hosts:
            raise HTTPException(422, detail="callbackUrl host is not allowed")
        if req.file.sizeBytes is not None and req.file.sizeBytes > settings.max_file_bytes:
            raise HTTPException(413, detail=f"file is larger than {settings.max_file_bytes // (1024 * 1024)} MB")
        try:
            rules = build_rules(req.rules.params)
        except ValueError as exc:
            raise HTTPException(422, detail=str(exc)) from exc

        enabled = None
        ignored: set[str] = set()
        if req.rules.enabled is not None:
            ignored |= {r for r in req.rules.enabled if r not in RULES}
            enabled = sorted({r for r in req.rules.enabled if r in RULES})
        severity = {k: v for k, v in req.rules.severity.items() if k in RULES}
        ignored |= {k for k in req.rules.severity if k not in RULES}

        job = Job(
            run_id=req.runId, file_url=req.file.url, file_name=name, callback_url=req.callbackUrl, rules=rules,
            role=req.context.role if req.context.role in ROLES else None, enabled=enabled, severity=severity,
            originators=[o for o in req.context.originators if isinstance(o, str)][:50], ignored_rules=sorted(ignored),
        )
        try:
            accepted = runner.submit(job)
        except QueueFull:
            return JSONResponse({"detail": "busy"}, status_code=503, headers={"Retry-After": "30"})
        log.info('{"event": "check.accepted", "runId": "%s", "duplicate": %s, "downloadHost": "%s"}',
                 req.runId, str(not accepted).lower(), url_host(req.file.url))
        return {"runId": req.runId, "accepted": True, "duplicate": not accepted,
                "queued": runner.queued, "engineVersion": ENGINE_VERSION}

    return app
