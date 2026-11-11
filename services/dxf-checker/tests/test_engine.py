from __future__ import annotations

from pathlib import Path

import pytest

from app.checker.common import GROUPS, RULES, CheckFailed
from app.checker.engine import build_rules, catalog, run_check, sniff
from dxf_fixtures import BAD_NAME, GOOD_NAME


def rules_of(result: dict) -> set[str]:
    return {f["rule"] for f in result["findings"]}


def test_catalogue_has_the_60_rules_of_issue_18():
    ids = [r for _, _, rs in GROUPS for r in rs]
    assert len(ids) == 60
    assert len(set(ids)) == 60
    assert set(ids) == set(RULES)
    cat = catalog()
    assert [g["id"] for g in cat["groups"]][:3] == ["file-name", "name-codes", "name-revision"]
    assert cat["params"]["drafting"]["insunits_required"] == 4


def test_good_drawing_has_no_errors(good_dxf):
    r = run_check(good_dxf, GOOD_NAME, role="wip")
    assert r["counts"]["ERROR"] == 0
    assert r["counts"]["WARNING"] == 0
    assert r["parsedName"]["sheetCode"] == "ZZ-00-FA-102"
    assert r["parsedName"]["project"] == "26TBL"
    assert r["titleblock"]["values"]["sheet_no"] == "FA-102"
    assert r["stats"]["devices"] == {"SD-ADDR": 5, "HD-ADDR": 1, "MCP-ADDR": 1}


def test_bad_drawing_reports_every_planted_problem(bad_dxf):
    r = run_check(bad_dxf, BAD_NAME, role="wip")
    expected = {
        "D15-UNITS", "D16-LAYOUTS", "T-SHEET", "T-FLOOR", "T-FIELD-MISSING", "D06-DUPLICATE", "D02-COPY-BLOCK",
        "D11-LEGEND-BLOCK", "D14-CABLE-CONTENT", "D07-SKU-STRONG", "D12-LEGEND-LAYER", "D05-XREF-COUNT",
        "D05-XREF-ABS", "D01-EXPLODED",
    }
    assert expected <= rules_of(r)
    # findings come back most severe first
    order = {"ERROR": 0, "WARNING": 1, "INFO": 2}
    sev = [order[f["severity"]] for f in r["findings"]]
    assert sev == sorted(sev)
    assert all(f["group"] for f in r["findings"])


def test_disabled_rules_are_not_reported(bad_dxf):
    enabled = [r for r in RULES if r not in ("D15-UNITS", "D16-LAYOUTS")]
    r = run_check(bad_dxf, BAD_NAME, role="wip", enabled=enabled)
    assert "D15-UNITS" not in rules_of(r)
    assert "D16-LAYOUTS" not in rules_of(r)
    assert "T-SHEET" in rules_of(r)


def test_severity_override_from_request(bad_dxf):
    r = run_check(bad_dxf, BAD_NAME, role="wip", severity={"D05-XREF-COUNT": "ERROR"})
    [f] = [f for f in r["findings"] if f["rule"] == "D05-XREF-COUNT"]
    assert f["severity"] == "ERROR"


def test_params_override_defaults(bad_dxf):
    rules = build_rules({"drafting": {"insunits_required": 6}})
    r = run_check(bad_dxf, BAD_NAME, role="wip", rules=rules)
    assert "D15-UNITS" not in rules_of(r)
    # untouched parameters keep their defaults
    assert rules["drafting"]["legend_layer"] == "LEGEND"


@pytest.mark.parametrize("params", [
    {"drafting": {"sku_generic_pattern": "("}},
    {"naming": {"forbidden_tokens": "final"}},
    {"titleblock": {"block_name_patterns": [1]}},
    {"severity_overrides": {"D07-SKU": "LOUD"}},
])
def test_bad_params_are_refused(params):
    with pytest.raises(ValueError):
        build_rules(params)


@pytest.mark.parametrize("name, rule", [
    ("FA plan 2 floor FINAL.dxf", "N-SPACE"),
    ("FA plan 2 floor FINAL.dxf", "N-FORBIDDEN"),
    ("ნახაზი.dxf", "N-LATIN"),
    ("ins-26tbl-zz-00-fa-102.dxf", "N-LOWER"),
    ("26TBL-INS-ZZ-00-FA-102.dxf", "N-ORDER"),
    ("INS-26-TBL-ZZ-00-FA-102.dxf", "N-PROJECT-DASH"),
    ("INS-26017-ZZ-00-FA-102.dxf", "N-PROJECT"),
    ("INS-BS005-ZZ-00-FA-102.dxf", "N-PROJECT"),
    ("INS-26TBL-ZZ-00-DR-FA-102.dxf", "N-EXTRA-FIELD"),
    ("INS-26TBL-ZZ-00-FA-102_P01_2026-10-03.dxf", "N-DATE"),
    ("INS-26TBL-ZZ-00-QQ-102.dxf", "N-SYSTEM"),
    ("INS-26TBL-FA-102.dxf", "N-FORMAT"),
    ("INS-26TBL-ZZ-1-FA-102.dxf", "N-FLOOR"),
    ("ABC-26TBL-ZZ-00-FA-102.dxf", "N-ORIG-UNKNOWN"),
    ("INS-26TBL-ZZ-00-FA-100.dxf", "N-SEQ00"),
    ("INS-26TBL-ZZ-XX-FA-102.dxf", "N-PLAN-FLOOR"),
])
def test_name_rules(good_dxf, name, rule):
    r = run_check(good_dxf, name, role="wip")
    assert rule in rules_of(r)


def test_role_decides_revision_rules(good_dxf):
    assert "N-REV-WIP" in rules_of(run_check(good_dxf, "INS-26TBL-ZZ-00-FA-102_P01.dxf", role="wip"))
    assert "N-REV-MISSING" in rules_of(run_check(good_dxf, GOOD_NAME, role="issued"))
    assert "N-SUBREV-ISSUED" in rules_of(run_check(good_dxf, "INS-26TBL-ZZ-00-FA-102_P01.02.dxf", role="issued"))
    neutral = rules_of(run_check(good_dxf, "INS-26TBL-ZZ-00-FA-102_P01.dxf", role=None))
    assert not neutral & {"N-REV-WIP", "N-REV-MISSING", "N-SUBREV-ISSUED"}


def test_known_extra_originator(good_dxf):
    r = run_check(good_dxf, "ARC-26TBL-ZZ-00-FA-102.dxf", role="wip", originators=["arc"])
    assert "N-ORIG-UNKNOWN" not in rules_of(r)


def test_dwg_is_refused_with_advice(tmp_path: Path):
    p = tmp_path / "x.dxf"
    p.write_bytes(b"AC1032" + b"\x00" * 100)
    assert sniff(p) == "dwg"
    with pytest.raises(CheckFailed) as exc:
        run_check(p, GOOD_NAME)
    assert exc.value.code == "NOT_DXF"
    assert "SAVEAS" in exc.value.message


def test_garbage_is_not_a_dxf(tmp_path: Path):
    p = tmp_path / "x.dxf"
    p.write_bytes(b"%PDF-1.7 not a drawing")
    with pytest.raises(CheckFailed) as exc:
        run_check(p, GOOD_NAME)
    assert exc.value.code == "NOT_DXF"


@pytest.mark.parametrize("data", [
    b"0\n" + bytes(range(1, 255)) * 20,                 # garbage after a DXF-looking start
    b"0\nEOF\n",                                        # nothing in it
    b"0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n",           # truncated upload
])
def test_broken_or_empty_dxf_fails_the_run(tmp_path: Path, data: bytes):
    p = tmp_path / "x.dxf"
    p.write_bytes(data)
    with pytest.raises(CheckFailed) as exc:
        run_check(p, GOOD_NAME)
    assert exc.value.code == "X-READ"


def test_code_tables_from_settings_replace_the_defaults():
    rules = build_rules({"naming": {"systems": {"FA": "ხანძრის სიგნალიზაცია"}, "originators": {"ARC": "Architect"}}})
    # A code removed in Settings is gone, not merged back from rules.yaml.
    assert rules["naming"]["systems"] == {"FA": "ხანძრის სიგნალიზაცია"}
    assert rules["naming"]["originators"] == {"ARC": "Architect"}
    # Structural tables still merge field by field.
    rules = build_rules({"titleblock": {"fields": {"revision": ["REV_X"]}}})
    assert rules["titleblock"]["fields"]["revision"] == ["REV_X"]
    assert "SHEET_NO" in rules["titleblock"]["fields"]["sheet_no"]
