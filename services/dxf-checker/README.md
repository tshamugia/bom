# dxf-checker

Checks one DXF against the drawing standards (NAMING 0.0.3, DRAFTING 0.0.5) and
posts the findings back to Revline (issue #18). Python + ezdxf, built from the
`drawing-standard-checker` skill. It runs as its own Railway service with no
public domain: only the app calls it, over the private network.

- No AI and no state. The app sends the enabled rules, severity overrides and
  parameters with every request, so a Settings change applies to the next check.
- The service never writes to the database. It returns findings; the app turns
  them into Remarks, audits and revalidates.
- The DXF is deleted when the run ends. Only name, size and SHA-256 come back.

## API

All calls except `/healthz` need `Authorization: Bearer $DXF_CHECKER_SECRET`.

### `POST /v1/checks` → 202

```jsonc
{
  "runId": "abc123",                       // [A-Za-z0-9_-]{1,100}; a repeat while running is a no-op
  "file": { "url": "<presigned GET>", "name": "INS-26TBL-ZZ-00-FA-102.dxf", "sizeBytes": 1234 },
  "context": { "role": "wip", "originators": ["ARC"] },   // role: wip | issued | null
  "rules": {
    "enabled": ["N-FORMAT", "…"],          // omitted = all 60; unknown ids are ignored and listed back
    "severity": { "D07-SKU": "ERROR" },
    "params": { "drafting": { "insunits_required": 4 } }   // merged over rules.yaml (e.g. naming.project_pattern)
  },
  "callbackUrl": "http://bom.railway.internal:<port>/api/internal/drawing-checks/abc123/result"
}
```

Refusals: `401` bad secret, `413` declared size over the limit, `422` bad body,
disallowed download/callback host or a parameter that doesn't compile (the
message names it, in Georgian), `503` + `Retry-After` when the queue is full.

`role` stands in for the folder: the app derives it from the drawing status
(`in-progress`, `paused`, `need-approval` → `wip`; `awaiting-approval`,
`approved-a`, `approved-b`, `as-built` → `issued`).

### Callback → `POST callbackUrl`

Same bearer secret. Retried at 0/2/5/15/30 s on network errors, 5xx, 408 and
429; any other 4xx is final (e.g. 409 when the app already closed the run).

```jsonc
{
  "runId": "abc123",
  "status": "done",                        // or "failed"
  "errorCode": null,                       // failed: NOT_DXF | X-READ | DOWNLOAD | TOO_LARGE | TIMEOUT | MEMORY | INTERNAL
  "error": null,                           // failed: Georgian text for the user
  "engineVersion": "1.0.0",
  "standards": { "naming": "0.0.3", "drafting": "0.0.5" },
  "file": { "name": "…", "sizeBytes": 1234, "sha256": "…" },
  "durationMs": 840,
  "counts": { "ERROR": 9, "WARNING": 7, "INFO": 1 },
  "findings": [{
    "rule": "T-SHEET", "group": "title-block", "severity": "ERROR", "ref": "NAMING §10, §11.2",
    "title": "…", "message": "…", "recommendation": "…", "evidence": ""
  }],
  "parsedName": { "project": "26TBL", "sheetCode": "ZZ-00-FA-102", "sheet": "FA-102", "revision": null, "…": "…" },
  "titleblock": { "source": "block", "block": "…", "values": { "sheet_no": "FA-104", "revision": "P01", "…": "…" } },
  "stats": { "devices": { "SD-ADDR": 5 }, "cablesM": { "CBL-FIRE-FP200": 33.2 }, "insunits": 4, "layouts": ["Layout1"] },
  "ignoredRules": []
}
```

One rule can produce more than one finding (e.g. `D02-COPY-BLOCK`); the app
groups by `rule` because it keeps one Remark per rule per drawing. `parsedName`
and `titleblock.values.sheet_no` are what the app needs to tie a bulk upload to
a drawing and to compare the title block with `drawing.sheet_code`.

An empty or truncated DXF fails with `X-READ`: an empty drawing would otherwise
pass most rules and close open Remarks.

### `POST /v1/params/validate` → 200 / 422

`{ "params": { … } }` as in `rules.params` of a check. 200 `{ "ok": true }` when a
check would accept them, 422 with the Georgian message naming the bad parameter
otherwise. Revline's Settings asks before it saves, so a pattern Python can't
compile is never stored.

`params` merge over rules.yaml key by key and lists are replaced; the code tables
`naming.originators`, `naming.systems`, `naming.series` and `naming.extension_series`
are replaced whole, so a code removed in Settings is gone here too.

### `GET /v1/catalog`

The 60 rules in the 12 Settings groups (id, default severity, standard
reference, Georgian title) and the default parameters from `rules.yaml`, for
seeding Settings.

## Limits and safety

Each check runs in its own process with a wall-clock timeout and, on Linux, an
address-space and CPU limit; the child gets no secrets in its environment.
Downloads go only to `ALLOWED_DOWNLOAD_HOSTS` over https without redirects,
callbacks only to `ALLOWED_CALLBACK_HOSTS`. Logs never contain the presigned URL.

| Variable | Default | |
|---|---|---|
| `DXF_CHECKER_SECRET` | — | required, ≥ 32 chars, same value in the app |
| `ALLOWED_DOWNLOAD_HOSTS` | — | required, comma-separated bucket host(s) |
| `ALLOWED_CALLBACK_HOSTS` | — | required, e.g. `bom.railway.internal` |
| `ALLOW_HTTP_DOWNLOAD` | off | local MinIO only |
| `MAX_FILE_MB` | 150 | refine with the team's real files |
| `MAX_CONCURRENCY` | 2 | checks running at once |
| `MAX_QUEUE` | 50 | running + waiting; more → 503 |
| `CHECK_TIMEOUT_SECONDS` | 300 | per check |
| `CHECK_MEMORY_MB` | 2048 | per check (Linux) |
| `PORT` | 8080 | |

## Develop

```bash
cd services/dxf-checker
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # .venv/bin/python on Linux/macOS
.venv/Scripts/python -m pytest
```

`rules.yaml` and the checks are a copy of the skill's (NAMING 0.0.3: project code = two-digit year + three letters, `25TGT`; a legacy `26017` or `BS005` still parses and gets `N-PROJECT`). When the standard
changes, update both (the skill's `validate_standards.py` keeps the yaml and the
documents in sync); the Settings export should produce the same yaml.

CI (`.github/workflows/ci.yml`) runs the same pytest suite on every pull request.

## Deploy

Railway service `dxf-checker` in project `bom`, no public domain. It runs the
image `ghcr.io/tshamugia/bom-dxf-checker:<version>`, which the release workflow
builds from this folder and deploys together with the app (see the repository
README, "CI/CD"). Railway's healthcheck is `/healthz`.

`railway.json` only applies to a manual upload, which is for emergencies; the
next release puts the service back on the image:

```bash
railway up services/dxf-checker --path-as-root --service dxf-checker --detach
```
