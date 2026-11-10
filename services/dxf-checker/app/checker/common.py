"""Shared helpers: rule catalogue, findings, file-name parsing.

Ported from the `drawing-standard-checker` skill (scripts/common.py). The
service checks one uploaded DXF at a time, so the folder, set and register
helpers of the skill are left out. All user-facing text stays Georgian; rule
IDs are stable ASCII so the app can switch rules and tune severities by ID.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Optional

ERROR, WARNING, INFO = "ERROR", "WARNING", "INFO"
SEVERITIES = (ERROR, WARNING, INFO)
SEVERITY_ORDER = {ERROR: 0, WARNING: 1, INFO: 2}

# rule id -> (default severity, standard reference, short title)
RULES: dict[str, tuple[str, str, str]] = {
    # ---- NAMING: ერთი ფაილის სახელი
    "N-LATIN": (ERROR, "NAMING §3, §8", "არალათინური სიმბოლოები სახელში"),
    "N-SPACE": (ERROR, "NAMING §3", "ცარიელი ადგილი სახელში"),
    "N-LOWER": (ERROR, "NAMING §3", "პატარა ასოები სახელში"),
    "N-FORBIDDEN": (ERROR, "NAMING §8", "აკრძალული სიტყვა სახელში"),
    "N-DATE": (ERROR, "NAMING §8, §11.1", "თარიღი სახელში"),
    "N-FORMAT": (ERROR, "NAMING §3", "სახელი 7-ველიან ფორმატს არ მიჰყვება"),
    "N-ORDER": (ERROR, "NAMING §3, §11.1", "ველების ძველი რიგი"),
    "N-EXTRA-FIELD": (ERROR, "NAMING §2, §11.1", "ზედმეტი ველი (დოკუმენტის ტიპი)"),
    "N-PROJECT-DASH": (ERROR, "NAMING §3, §4.2", "ტირე პროექტის კოდში"),
    "N-EXTRA-SUFFIX": (ERROR, "NAMING §3, §8", "ზედმეტი სუფიქსი რევიზიის შემდეგ"),
    "N-ORIG": (ERROR, "NAMING §4.1", "შემსრულებლის კოდი არასწორია"),
    "N-ORIG-UNKNOWN": (WARNING, "NAMING §4.1", "შემსრულებლის კოდი ცნობილ სიაში არ არის"),
    "N-PROJECT": (ERROR, "NAMING §4.2", "პროექტის კოდი არასწორია"),
    "N-ZONE": (ERROR, "NAMING §4.3", "ზონის კოდი სიაში არ არის"),
    "N-FLOOR": (ERROR, "NAMING §4.4", "სართულის კოდი სიაში არ არის"),
    "N-SYSTEM": (ERROR, "NAMING §4.5", "სისტემის კოდი სიაში არ არის"),
    "N-NUMBER": (ERROR, "NAMING §5", "ნომერი სამნიშნა არ არის"),
    "N-SEQ00": (ERROR, "NAMING §5", "რიგითი ნომერი 00"),
    "N-SERIES-RESERVED": (WARNING, "NAMING §5", "სარეზერვო სერია 8xx"),
    "N-REV": (ERROR, "NAMING §6", "რევიზიის ფორმატი არასწორია"),
    "N-REV-WIP": (ERROR, "NAMING §8", "სამუშაო ფაილს რევიზია სახელში აქვს"),
    "N-REV-MISSING": (ERROR, "NAMING §8", "გაცემულ ფაილს რევიზია აკლია"),
    "N-SUBREV-ISSUED": (ERROR, "NAMING §6", "შიდა ქვერევიზია გაცემულ ფაილში"),
    "N-EXT-SERIES": (WARNING, "NAMING §2, §7.1, §10.3", "გაფართოება და სერია არ შეესაბამება"),
    "N-PLAN-FLOOR": (WARNING, "NAMING §4.4, §5", "გეგმას (1xx) კონკრეტული სართული არ აქვს"),
    # ---- TITLE BLOCK
    "T-MISSING": (ERROR, "NAMING §10.1; DRAFTING წესი 16", "შტამპი ვერ მოიძებნა"),
    "T-NO-ATTRIBS": (WARNING, "NAMING §10.2", "შტამპი ატრიბუტების/fields-ის გარეშეა"),
    "T-FIELD-MISSING": (ERROR, "NAMING §10.1", "შტამპს სავალდებულო ველი აკლია"),
    "T-FIELD-EMPTY": (WARNING, "NAMING §10.1", "შტამპის ველი ცარიელია"),
    "T-SHEET": (ERROR, "NAMING §10, §11.2", "ფურცლის ნომერი შტამპში ფაილის სახელს არ ემთხვევა"),
    "T-FILENAME": (ERROR, "NAMING §10.1", "ფაილის სახელი შტამპში არ ემთხვევა"),
    "T-REV": (ERROR, "NAMING §11.2", "რევიზია შტამპში ფაილის სახელს არ ემთხვევა"),
    "T-PROJECT": (WARNING, "NAMING §10.1", "პროექტის ნომერი შტამპში არ ჩანს/არ ემთხვევა"),
    "T-FLOOR": (ERROR, "NAMING §4.4, §11.2", "სართულის კოდი და შტამპის დასახელება არ შეესაბამება"),
    "T-REVTABLE": (WARNING, "NAMING §6, §10.1", "რევიზიების ცხრილი აკლია ან არასრულია"),
    "T-SCALE": (WARNING, "NAMING §10.1", "მასშტაბის ჩანაწერი არასწორია"),
    "T-FORMAT": (WARNING, "NAMING §10.1", "ფორმატის ჩანაწერი არასწორია"),
    # ---- DRAFTING
    "D01-EXPLODED": (WARNING, "DRAFTING წესი 1", "შესაძლოა მოწყობილობის ბლოკი დაშლილია"),
    "D02-COPY-BLOCK": (WARNING, "DRAFTING წესი 2", "ბლოკის ჩაკოპირებული/ძველი ასლი"),
    "D03-UNAPPROVED": (ERROR, "DRAFTING წესი 3", "ბლოკი დამტკიცებულ ბიბლიოთეკაში არ არის"),
    "D04-DYNAMIC": (WARNING, "DRAFTING წესი 4", "dynamic block visibility state-ით"),
    "D05-XREF-COUNT": (WARNING, "DRAFTING წესი 5", "xref-ი არქიტექტურული ფონის გარდა"),
    "D05-XREF-ABS": (WARNING, "NAMING §10.2", "xref-ი აბსოლუტური მისამართით"),
    "D05-PAPER-DEVICE": (WARNING, "DRAFTING წესი 5", "ბლოკი paper space-ში"),
    "D06-DUPLICATE": (ERROR, "DRAFTING წესი 6", "ერთმანეთზე დადებული დუბლიკატი ბლოკები"),
    "D07-SKU": (WARNING, "DRAFTING წესი 7", "შესაძლო SKU / მოდელის კოდი ნახაზზე"),
    "D07-SKU-STRONG": (ERROR, "DRAFTING წესი 7", "მწარმოებლის მოდელის კოდი ნახაზზე"),
    "D08-LEGEND-MISSING": (ERROR, "DRAFTING წესი 8, 12", "ლეგენდა (LEGEND ლეიერი) არ არის"),
    "D09-LEGEND-SYMBOL": (WARNING, "DRAFTING წესი 9", "ლეგენდაში სიმბოლოები ბლოკებით არ არის"),
    "D11-LEGEND-BLOCK": (ERROR, "DRAFTING წესი 11", "გეგმის ბლოკი ლეგენდაში არ არის"),
    "D11-LEGEND-CABLE": (WARNING, "DRAFTING წესი 11", "კაბელის ლეიერი ლეგენდაში არ ჩანს"),
    "D11-LEGEND-UNITS": (INFO, "DRAFTING წესი 8", "ლეგენდაში ერთეულის სვეტი არ ჩანს"),
    "D12-LEGEND-LAYER": (WARNING, "DRAFTING წესი 12", "ლეგენდის ობიექტები სხვა ლეიერზეა"),
    "D13-CABLE-LAYER-NAME": (WARNING, "DRAFTING წესი 13", "კაბელის ლეიერის სახელი ფორმატს არ მიჰყვება"),
    "D13-CABLE-OFF-LAYER": (WARNING, "DRAFTING წესი 13", "კაბელის მსგავსი ლეიერი CBL- პრეფიქსის გარეშე"),
    "D14-CABLE-CONTENT": (ERROR, "DRAFTING წესი 14", "კაბელის ლეიერზე ტრასის გარდა სხვა ობიექტია"),
    "D15-UNITS": (ERROR, "DRAFTING წესი 15", "ერთეული მილიმეტრი არ არის (INSUNITS≠4)"),
    "D15-SCALE": (WARNING, "DRAFTING წესი 15", "მოდელი ძალიან პატარაა: შესაძლოა 1:1 არ არის"),
    "D16-LAYOUTS": (ERROR, "DRAFTING წესი 16; NAMING §8", "ერთ ფაილში ერთზე მეტი layout"),
    "D17-TYPICAL": (ERROR, "DRAFTING წესი 17", "ტიპიური სართულის მამრავლი შევსებული არ არის"),
}

# Settings groups (issue #18). Every rule above belongs to exactly one group.
GROUPS: list[tuple[str, str, list[str]]] = [
    ("file-name", "ფაილის სახელი", ["N-LATIN", "N-SPACE", "N-LOWER", "N-FORBIDDEN", "N-DATE", "N-FORMAT",
                                    "N-ORDER", "N-EXTRA-FIELD", "N-PROJECT-DASH", "N-EXTRA-SUFFIX"]),
    ("name-codes", "კოდები სახელში", ["N-ORIG", "N-ORIG-UNKNOWN", "N-PROJECT", "N-ZONE", "N-FLOOR", "N-SYSTEM",
                                      "N-NUMBER", "N-SEQ00", "N-SERIES-RESERVED", "N-EXT-SERIES", "N-PLAN-FLOOR"]),
    ("name-revision", "რევიზია სახელში", ["N-REV", "N-REV-WIP", "N-REV-MISSING", "N-SUBREV-ISSUED"]),
    ("title-block", "შტამპი", ["T-MISSING", "T-NO-ATTRIBS", "T-FIELD-MISSING", "T-FIELD-EMPTY", "T-SHEET", "T-FILENAME",
                              "T-REV", "T-PROJECT", "T-FLOOR", "T-REVTABLE", "T-SCALE", "T-FORMAT"]),
    ("legend", "ლეგენდა", ["D08-LEGEND-MISSING", "D09-LEGEND-SYMBOL", "D11-LEGEND-BLOCK", "D11-LEGEND-CABLE",
                          "D11-LEGEND-UNITS", "D12-LEGEND-LAYER"]),
    ("layouts", "Layout-ები", ["D16-LAYOUTS", "D05-PAPER-DEVICE"]),
    ("blocks", "ბლოკები", ["D01-EXPLODED", "D02-COPY-BLOCK", "D03-UNAPPROVED", "D04-DYNAMIC", "D06-DUPLICATE"]),
    ("xref", "Xref", ["D05-XREF-COUNT", "D05-XREF-ABS"]),
    ("sku", "SKU ნახაზზე", ["D07-SKU", "D07-SKU-STRONG"]),
    ("cables", "კაბელის ლეიერები", ["D13-CABLE-LAYER-NAME", "D13-CABLE-OFF-LAYER", "D14-CABLE-CONTENT"]),
    ("units", "ერთეული და მასშტაბი", ["D15-UNITS", "D15-SCALE"]),
    ("typical", "ტიპიური სართული", ["D17-TYPICAL"]),
]
RULE_GROUP = {rule: gid for gid, _, rules in GROUPS for rule in rules}


class CheckFailed(Exception):
    """The file could not be checked at all. The run fails and no Remark changes."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Finding:
    rule: str
    file: str
    message: str
    recommendation: str = ""
    evidence: str = ""
    severity: str = ""
    ref: str = ""
    title: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class Collector:
    """Collects findings, keeping only enabled rules and applying severity overrides.

    Severity precedence: the request's `severity` map, then rules.yaml
    `severity_overrides`, then the severity a check passes for one finding,
    then the rule's default.
    """

    def __init__(self, rules: dict, enabled: Optional[Iterable[str]] = None, severity: Optional[dict] = None):
        self.items: list[Finding] = []
        self.enabled = set(enabled) if enabled is not None else None
        self.overrides = {**((rules or {}).get("severity_overrides") or {}), **(severity or {})}

    def is_on(self, rule: str) -> bool:
        return self.enabled is None or rule in self.enabled

    def add(self, rule: str, file: str, message: str, recommendation: str = "", evidence: str = "", severity: Optional[str] = None):
        if not self.is_on(rule):
            return
        default_sev, ref, title = RULES.get(rule, (WARNING, "—", rule))
        sev = self.overrides.get(rule) or severity or default_sev
        self.items.append(Finding(rule, str(file), message, recommendation, evidence, sev, ref, title))

    def sorted(self) -> list[Finding]:
        return sorted(self.items, key=lambda f: (SEVERITY_ORDER.get(f.severity, 9), f.rule))


# --------------------------------------------------------------------------
# file-name parsing (NAMING §3)
# --------------------------------------------------------------------------

NAME_RE = re.compile(
    r"^(?P<orig>[A-Z]{3})-(?P<proj>\d{5})-(?P<zone>[A-Z0-9]{2})-(?P<floor>[A-Z0-9]{2})-"
    r"(?P<sys>[A-Z]{2})-(?P<num>\d{3})(?:_(?P<rev>[PC]\d{2}(?:\.\d{2})?))?$"
)
REV_RE = re.compile(r"^(?P<kind>[PC])(?P<major>\d{2})(?:\.(?P<minor>\d{2}))?$")
SHEET_RE = re.compile(r"^[A-Z]{2}-\d{3}$")


@dataclass
class ParsedName:
    orig: str
    proj: str
    zone: str
    floor: str
    sys: str
    num: str
    rev: Optional[str]
    ext: str

    @property
    def sheet(self) -> str:
        return f"{self.sys}-{self.num}"

    @property
    def base(self) -> str:
        return f"{self.orig}-{self.proj}-{self.zone}-{self.floor}-{self.sys}-{self.num}"

    @property
    def series(self) -> str:
        return self.num[0]

    def to_dict(self) -> dict:
        """What the app needs to tie the file to a drawing (issue #18, 2026-11-10 comment)."""
        return {
            "originator": self.orig, "project": self.proj, "zone": self.zone, "floor": self.floor,
            "system": self.sys, "number": self.num, "revision": self.rev, "extension": self.ext,
            "sheet": self.sheet, "sheetCode": f"{self.zone}-{self.floor}-{self.sys}-{self.num}", "base": self.base,
        }


def parse_name(filename: str) -> Optional[ParsedName]:
    p = Path(filename)
    m = NAME_RE.match(p.stem)
    if not m:
        return None
    d = m.groupdict()
    return ParsedName(d["orig"], d["proj"], d["zone"], d["floor"], d["sys"], d["num"], d["rev"], p.suffix.lstrip(".").lower())


def code_ok(code: str, spec: dict) -> bool:
    if code in (spec.get("codes") or []):
        return True
    return any(re.match(p, code) for p in (spec.get("patterns") or []))


def expected_floor_code(text: str) -> Optional[str]:
    """Derive the floor code from a Georgian floor name in a title (NAMING §4.4).

    „სართული 1" / „±0.000" → 00, „სართული 2" → 01, „სართული -1" → B1,
    „ანტრესოლი" → M1, „სახურავი" → RF. Returns None when nothing recognisable.
    """
    if not text:
        return None
    t = text.replace("−", "-")
    if re.search(r"სახურავ", t):
        return "RF"
    if re.search(r"ანტრესოლ", t):
        return "M1"
    m = re.search(r"სართ(?:ული|\.)\s*(-?\d+)(?!\s*[-–]\s*\d)", t)
    if m:
        n = int(m.group(1))
        if n < 0:
            return f"B{-n}"
        if n >= 1:
            return f"{n - 1:02d}"
    if re.search(r"±\s*0[.,]000", t):
        return "00"
    return None


def has_non_ascii(s: str) -> bool:
    return any(ord(ch) > 127 for ch in s)
