"""One check run: rules from the request merged over the bundled defaults,
then name checks and content checks on one DXF.

Stateless on purpose (issue #18): the app sends the enabled rules, severity
overrides and parameters with every request, so a Settings change applies to
the next check without a deploy.
"""
from __future__ import annotations

import copy
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Optional

import yaml

from .common import GROUPS, RULE_GROUP, RULES, SEVERITIES, CheckFailed, Collector
from .dxf import check_drawing
from .names import check_name, known_originators

ENGINE_VERSION = "1.0.0"
DEFAULT_RULES_PATH = Path(__file__).with_name("rules.yaml")
ROLES = ("wip", "issued")

# Parameters that hold regular expressions: (path, is_list). Checked before a run
# so a bad pattern from Settings is refused instead of failing every check.
REGEX_PARAMS: list[tuple[tuple[str, ...], bool]] = [
    (("naming", "project_pattern"), False),
    (("naming", "zones", "patterns"), True),
    (("naming", "floors", "patterns"), True),
    (("naming", "forbidden_tokens"), True),
    (("naming", "date_patterns"), True),
    (("titleblock", "block_name_patterns"), True),
    (("titleblock", "revision_table_tag_pattern"), False),
    (("titleblock", "scale_pattern"), False),
    (("titleblock", "format_pattern"), False),
    (("drafting", "cable_layer_pattern"), False),
    (("drafting", "cable_like_layer_hints"), True),
    (("drafting", "copy_block_patterns"), True),
    (("drafting", "non_device_block_patterns"), True),
    (("drafting", "sku_strong_patterns"), True),
    (("drafting", "sku_generic_pattern"), False),
    (("drafting", "sku_exclude_patterns"), True),
    (("drafting", "typical_keywords"), True),
]


@lru_cache(maxsize=1)
def _defaults() -> dict:
    with open(DEFAULT_RULES_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def default_rules() -> dict:
    return copy.deepcopy(_defaults())


def _merge(base: Any, override: Any) -> Any:
    """Dicts merge key by key; anything else (lists included) is replaced."""
    if isinstance(base, dict) and isinstance(override, dict):
        out = dict(base)
        for k, v in override.items():
            out[k] = _merge(base.get(k), v) if k in base else v
        return out
    return copy.deepcopy(override)


def _get(d: dict, path: tuple[str, ...]) -> Any:
    for key in path:
        if not isinstance(d, dict) or key not in d:
            return None
        d = d[key]
    return d


def build_rules(params: Optional[dict]) -> dict:
    """Defaults from rules.yaml with the request's `params` merged over them.

    Raises ValueError (Georgian text, names the parameter) when a value is unusable.
    """
    rules = _merge(default_rules(), params or {}) if params else default_rules()
    for section in ("naming", "titleblock", "drafting"):
        if not isinstance(rules.get(section), dict):
            raise ValueError(f"პარამეტრების ნაწილი „{section}“ ობიექტი უნდა იყოს.")
    for path, is_list in REGEX_PARAMS:
        value = _get(rules, path)
        name = ".".join(path)
        if value is None:
            raise ValueError(f"პარამეტრი „{name}“ აკლია.")
        items = value if is_list else [value]
        if is_list and not isinstance(value, list):
            raise ValueError(f"პარამეტრი „{name}“ სია უნდა იყოს.")
        for pat in items:
            if not isinstance(pat, str):
                raise ValueError(f"პარამეტრი „{name}“: მნიშვნელობა ტექსტი უნდა იყოს.")
            try:
                re.compile(pat.replace("{systems}", "(?:X)"))
            except re.error as exc:
                raise ValueError(f"პარამეტრი „{name}“: არასწორი regex „{pat}“ ({exc}).") from exc
    sev = rules.get("severity_overrides") or {}
    bad = {k: v for k, v in sev.items() if v not in SEVERITIES}
    if bad:
        raise ValueError(f"severity_overrides-ში უცნობი სიმძიმეა: {bad}.")
    return rules


def sniff(path: Path) -> str:
    """'dxf', 'dxf-binary', 'dwg' or 'unknown' from the first bytes."""
    with open(path, "rb") as f:
        head = f.read(64)
    if head.startswith(b"AutoCAD Binary DXF"):
        return "dxf-binary"
    if re.match(rb"^AC\d{4}", head):
        return "dwg"
    text = head.lstrip(b"\xef\xbb\xbf").lstrip()
    if text.startswith(b"0") or text.startswith(b"999"):
        return "dxf"
    return "unknown"


def run_check(
    path: Path,
    filename: str,
    role: Optional[str] = None,
    rules: Optional[dict] = None,
    enabled: Optional[Iterable[str]] = None,
    severity: Optional[dict] = None,
    originators: Optional[Iterable[str]] = None,
) -> dict:
    """Check one DXF. Raises CheckFailed when the file can't be checked at all."""
    rules = rules if rules is not None else default_rules()
    kind = sniff(path)
    if kind == "dwg":
        raise CheckFailed("NOT_DXF", "ფაილი DWG-ია, არა DXF. AutoCAD-ში გადაინახე DXF-ად (SAVEAS → AutoCAD 2018 DXF) და ის ატვირთე.")
    if kind == "unknown":
        raise CheckFailed("NOT_DXF", "ფაილი DXF არ არის. AutoCAD-ში გადაინახე DXF-ად (SAVEAS → AutoCAD 2018 DXF) და ის ატვირთე.")

    col = Collector(rules, enabled, severity)
    origs = known_originators(rules, {o.strip().upper() for o in (originators or []) if o and o.strip()})
    parsed = check_name(filename, role if role in ROLES else None, rules, col, origs)
    info = check_drawing(path, filename, parsed, role, rules, col)

    findings = [
        {k: v for k, v in f.to_dict().items() if k != "file"} | {"group": RULE_GROUP.get(f.rule)}
        for f in col.sorted()
    ]
    counts = {s: 0 for s in SEVERITIES}
    for f in findings:
        counts[f["severity"]] = counts.get(f["severity"], 0) + 1
    return {
        "findings": findings,
        "counts": counts,
        "parsedName": parsed.to_dict() if parsed else None,
        "titleblock": info.pop("titleblock", None),
        "stats": info,
        "standards": rules.get("versions") or {},
    }


def catalog() -> dict:
    """Every rule the service can report, grouped as in Settings, plus the default parameters."""
    rules = default_rules()
    return {
        "engineVersion": ENGINE_VERSION,
        "standards": rules.get("versions") or {},
        "groups": [
            {
                "id": gid,
                "label": label,
                "rules": [
                    {"id": r, "severity": RULES[r][0], "ref": RULES[r][1], "title": RULES[r][2]}
                    for r in ids
                ],
            }
            for gid, label, ids in GROUPS
        ],
        "params": {k: rules[k] for k in ("naming", "titleblock", "drafting", "severity_overrides") if k in rules},
    }
