"""Child-process entry point: `python -m app.checker.cli <job.json> <result.json>`.

Every check runs in its own process (time and memory limits are set by the
parent before exec), so a hostile or broken DXF can't take the server down.
The result file always gets written when Python survives long enough.
"""
from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

from .common import CheckFailed
from .engine import ENGINE_VERSION, run_check


def main(job_path: str, result_path: str) -> int:
    job = json.loads(Path(job_path).read_text(encoding="utf-8"))
    try:
        out = run_check(
            Path(job["path"]),
            job["filename"],
            role=job.get("role"),
            rules=job["rules"],
            enabled=job.get("enabled"),
            severity=job.get("severity") or {},
            originators=job.get("originators") or [],
        )
        result = {"status": "done", "engineVersion": ENGINE_VERSION, **out}
    except CheckFailed as exc:
        result = {"status": "failed", "errorCode": exc.code, "error": exc.message}
    except MemoryError:
        result = {"status": "failed", "errorCode": "MEMORY", "error": "ფაილის დამუშავებას მეხსიერება არ ეყო."}
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        result = {"status": "failed", "errorCode": "INTERNAL", "error": f"შემოწმება ჩაიშალა: {type(exc).__name__}: {str(exc)[:300]}"}
    Path(result_path).write_text(json.dumps(result, ensure_ascii=False, default=str), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
