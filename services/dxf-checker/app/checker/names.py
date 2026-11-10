"""File-name checks for one uploaded file (NAMING §3–§8).

Ported from the skill's scripts/check_names.py. An upload has no folder, so
the folder role comes from the request (`wip` or `issued`, derived by the app
from the drawing status) and the folder/set/register rules are left out.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from .common import NAME_RE, REV_RE, Collector, ParsedName, code_ok, has_non_ascii, parse_name


def known_originators(rules: dict, extra: Optional[set[str]] = None) -> set[str]:
    return set((rules["naming"].get("originators") or {}).keys()) | set(extra or ())


def validate_fields(f: dict, rules: dict, col: Collector, file: str, originators: set[str]) -> bool:
    """Field-level checks on a 6-part name. f has orig, proj, zone, floor, sys, num, rev (may be None)."""
    n = rules["naming"]
    ok = True
    if not re.fullmatch(r"[A-Z]{3}", f["orig"]):
        col.add("N-ORIG", file, f"შემსრულებლის კოდი „{f['orig']}“ 3 ლათინური ასო არ არის.", "გამოიყენე 3-ასოიანი კოდი §4.1-დან, Insta-სთვის INS.")
        ok = False
    elif f["orig"] not in originators:
        col.add("N-ORIG-UNKNOWN", file, f"შემსრულებლის კოდი „{f['orig']}“ ცნობილ სიაში არ არის.",
                "თუ ეს სხვა მონაწილეა, მისი კოდი რეესტრის ზედა ნაწილში უნდა ეწეროს (§4.1); თუ ჩვენი ფაილია, INS.")
    if not re.fullmatch(n["project_pattern"], f["proj"]):
        col.add("N-PROJECT", file, f"პროექტის კოდი „{f['proj']}“ ფორმატს არ მიჰყვება.",
                "პროექტის კოდი = წლის ბოლო ორი ციფრი + სამი ასო, მაგ. 25TGT (§4.2). ძველი კოდი (26017, BS-005) Revline-ში ადმინისტრატორმა უნდა შეცვალოს.")
        ok = False
    if not code_ok(f["zone"], n["zones"]):
        col.add("N-ZONE", file, f"ზონის კოდი „{f['zone']}“ §4.3-ის სიაში არ არის.", "დასაშვებია ZZ, K1…K9, ST, XX.")
        ok = False
    if not code_ok(f["floor"], n["floors"]):
        hint = ""
        if re.fullmatch(r"\d", f["floor"]):
            hint = f" სართული ერთი სიმბოლოთია; კოდი ორსიმბოლოიანია (მაგ. 0{f['floor']}), გადაამოწმე შტამპის მიხედვით: შესასვლელი დონე = 00."
        col.add("N-FLOOR", file, f"სართულის კოდი „{f['floor']}“ §4.4-ის სიაში არ არის.{hint}", "დასაშვებია B2, B1, 00, 01…, M1, RF, ZZ, XX.")
        ok = False
    if f["sys"] not in n["systems"]:
        col.add("N-SYSTEM", file, f"სისტემის კოდი „{f['sys']}“ §4.5-ის სიაში არ არის.",
                "გამოიყენე კოდი ცხრილიდან (" + ", ".join(n["systems"]) + "). ახალი კოდი მხოლოდ სტანდარტში ჩამატებით შემოდის.")
        ok = False
    if not re.fullmatch(r"\d{3}", f["num"]):
        col.add("N-NUMBER", file, f"ნომერი „{f['num']}“ სამნიშნა არ არის.", "ნომერი = სერიის ციფრი + რიგითი 01–99 (მაგ. 102).")
        ok = False
    else:
        if f["num"][1:] == "00":
            col.add("N-SEQ00", file, f"ნომერი {f['num']}: რიგითი ნომერი 00 არ გამოიყენება.", f"გამოიყენე {f['num'][0]}01 ან სერიის პირველი თავისუფალი ნომერი.")
        if f["num"][0] in (n.get("reserved_series") or []):
            col.add("N-SERIES-RESERVED", file, f"ნომერი {f['num']} სარეზერვო 8xx სერიაშია.", "8xx ახალი სახის ნახაზისთვისაა; ჯერ სერია სტანდარტში უნდა განისაზღვროს.")
    rev = f.get("rev")
    if rev is not None:
        m = REV_RE.match(rev)
        if not m or m["major"] == "00":
            col.add("N-REV", file, f"რევიზია „{rev}“ არასწორია.", "ფორმატი: P01, P02 … ან C01, C02 … (00 არ არსებობს).")
            ok = False
    return ok


def _suggest(parts6: list[str], rev: Optional[str], ext: str) -> str:
    s = "-".join(parts6)
    if rev:
        s += "_" + rev
    return f"{s}.{ext}" if ext else s


def diagnose_bad_name(stem: str, ext: str, rules: dict, col: Collector, file: str, originators: set[str]) -> None:
    """Explain why a name fails §3 and suggest a fix where it can be derived."""
    issues = 0
    if has_non_ascii(stem):
        col.add("N-LATIN", file, "სახელში არალათინური (მაგ. ქართული) სიმბოლოებია.", "მხოლოდ ლათინური დიდი ასოები, ციფრები, ტირე და ქვედა ტირე.")
        issues += 1
    if " " in stem:
        col.add("N-SPACE", file, "სახელში ცარიელი ადგილია.", "ველები მხოლოდ ტირით (-) გამოიყოფა, რევიზია ქვედა ტირით (_).")
        issues += 1
    for pat in rules["naming"]["forbidden_tokens"]:
        m = re.search(pat, stem)
        if m:
            col.add("N-FORBIDDEN", file, f"სახელში აკრძალული სიტყვაა: „{m.group(0).strip(' _-.')}“.", "final/new/old/copy/v2/„ახალი“ არ იწერება: ეს ინფორმაცია რევიზიასა და რეესტრშია (§8).")
            issues += 1
            break
    date_hit = False
    for pat in rules["naming"]["date_patterns"]:
        m = re.search(pat, stem)
        if m:
            col.add("N-DATE", file, f"სახელში თარიღია: {m.group(0)}.", "თარიღი სახელში არ იწერება, ის რეესტრშია (§8, §11.1).")
            issues += 1
            date_hit = True
            break
    ascii_stem = stem.strip()
    if not has_non_ascii(ascii_stem) and re.search(r"[a-z]", ascii_stem) and NAME_RE.match(ascii_stem.upper()):
        col.add("N-LOWER", file, "სახელი პატარა ასოებითაა.", f"სწორი: {ascii_stem.upper()}.{ext}")
        return
    if has_non_ascii(ascii_stem) or " " in ascii_stem:
        if not issues:
            col.add("N-FORMAT", file, "სახელი 7-ველიან ფორმატს არ მიჰყვება.", "ფორმატი: შემსრულებელი-პროექტი-ზონა-სართული-სისტემა-ნომერი_რევიზია, მაგ. INS-26TBL-ZZ-00-FA-102_P01.")
        return

    up = ascii_stem.upper()
    main, _, tail = up.partition("_")
    tail_parts = [t for t in tail.split("_") if t] if tail else []
    rev = tail_parts[0] if tail_parts and REV_RE.match(tail_parts[0]) else None
    extras = tail_parts[1:] if rev else tail_parts
    parts = main.split("-")
    fixed: Optional[list[str]] = None

    if len(parts) == 6 and re.fullmatch(r"\d{2}[A-Z]{3}|\d{5}", parts[0]) and re.fullmatch(r"[A-Z]{3}", parts[1]):
        fixed = [parts[1], parts[0]] + parts[2:]
        col.add("N-ORDER", file, "ველების ძველი რიგი: პროექტი შემსრულებლის წინაა.", f"სწორი: {_suggest(fixed, rev, ext)}")
        issues += 1
    elif len(parts) == 7 and re.fullmatch(r"\d{2}", parts[1]) and re.fullmatch(r"[A-Z]{3}", parts[2]):
        fixed = [parts[0], parts[1] + parts[2]] + parts[3:]
        col.add("N-PROJECT-DASH", file, f"პროექტის კოდში ტირეა ({parts[1]}-{parts[2]}), ამიტომ ველები აირია.", f"სწორი: {_suggest(fixed, rev, ext)}")
        issues += 1
    elif len(parts) == 7 and re.fullmatch(r"[A-Z]{2}", parts[4]) and re.fullmatch(r"[A-Z]{2}", parts[5]) and re.fullmatch(r"\d{3}", parts[6]):
        fixed = parts[:4] + parts[5:]
        col.add("N-EXTRA-FIELD", file, f"ზედმეტი ველი „{parts[4]}“ (დოკუმენტის ტიპი აღარ იწერება).", f"სწორი: {_suggest(fixed, rev, ext)}")
        issues += 1
    elif len(parts) == 6:
        fixed = parts

    if extras:
        hint = f" სწორი: {_suggest(fixed, rev, ext)}" if fixed and len(fixed) == 6 else ""
        date_f = [r for r in col.items if r.rule == "N-DATE" and r.file == file]
        if date_f:
            date_f[0].recommendation += hint
        elif not date_hit:
            col.add("N-EXTRA-SUFFIX", file, f"რევიზიის შემდეგ ზედმეტი ნაწილია: _{'_'.join(extras)}.",
                    "რევიზია სახელის ბოლო ნაწილია; სხვა ინფორმაცია რეესტრში იწერება." + hint)
        issues += 1

    if fixed and len(fixed) == 6:
        f = dict(zip(["orig", "proj", "zone", "floor", "sys", "num"], fixed), rev=rev)
        before = len(col.items)
        ok = validate_fields(f, rules, col, file, originators)
        # a disabled rule adds no finding but the name is still wrong: don't call it N-FORMAT
        issues += (len(col.items) - before) or (0 if ok else 1)
        if tail_parts and not rev:
            col.add("N-REV", file, f"რევიზია „{tail_parts[0]}“ არასწორია.", "ფორმატი: P01 … ან C01 …")
            issues += 1
    if not issues:
        col.add("N-FORMAT", file, "სახელი 7-ველიან ფორმატს არ მიჰყვება.",
                "ფორმატი: შემსრულებელი-პროექტი-ზონა-სართული-სისტემა-ნომერი_რევიზია, მაგ. INS-26TBL-ZZ-00-FA-102_P01.")


def check_name(filename: str, role: Optional[str], rules: dict, col: Collector, originators: set[str]) -> Optional[ParsedName]:
    """Check one file's name. `role` is `wip`, `issued` or None (unknown). Returns the parsed name, if any."""
    n = rules["naming"]
    path = Path(filename)
    ext = path.suffix.lstrip(".").lower()
    parsed = parse_name(path.name)
    if parsed is None:
        diagnose_bad_name(path.stem, ext, rules, col, filename, originators)
        return None

    validate_fields(vars(parsed), rules, col, filename, originators)

    exp = (n.get("extension_series") or {}).get(ext)
    if exp and parsed.series not in exp:
        col.add("N-EXT-SERIES", filename, f".{ext} ფაილი {parsed.num} ნომრითაა, მოსალოდნელია {'/'.join(s + 'xx' for s in exp)} სერია.",
                "ცხრილები, გაანგარიშებები და BOM 6xx სერიაშია; Revit-ის მოდელი 9xx.")
    if ext in n["drawing_extensions"] and parsed.series == n["plan_series"] and parsed.floor in n["floors"]["non_level"]:
        col.add("N-PLAN-FLOOR", filename, f"{parsed.sheet} სართულის გეგმაა (1xx), მაგრამ სართული {parsed.floor}-ია.",
                "გეგმას კონკრეტული სართულის კოდი აქვს (B1, 00, 01 …); სქემები 3xx სერიაშია.")

    # §8: the drawing status stands in for the folder
    if role == "wip" and parsed.rev:
        col.add("N-REV-WIP", filename, f"სამუშაო ფაილს რევიზია ({parsed.rev}) სახელში აქვს.",
                f"სამუშაო ფაილი რევიზიის გარეშე ჰქვია: {parsed.base}.{ext}. სუფიქსი მხოლოდ გაცემულ ასლს ემატება.")
    if role == "issued":
        if not parsed.rev:
            col.add("N-REV-MISSING", filename, "გაცემულ/მოქმედ ფაილს რევიზია სახელში არ აქვს.", f"მაგ. {parsed.base}_P01.{ext}")
        elif "." in parsed.rev:
            col.add("N-SUBREV-ISSUED", filename, f"ქვერევიზია {parsed.rev} შიდა ვერსიაა და ოფისიდან არ გადის.", "გაცემისას რევიზია P01/P02/C01 ფორმისაა.")
    return parsed
