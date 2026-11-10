"""Drawing-content checks for one DXF (DRAFTING rules 1–17, NAMING §10 title block).

Ported from the skill's scripts/check_dxf.py. Differences:
- DXF only: DWG conversion (subprocess) is not carried over; the engine
  rejects DWG before this module runs.
- An unreadable file raises CheckFailed("X-READ") instead of adding a finding,
  so the run fails and no Remark changes (issue #18).
- Expensive passes are skipped when their rules are switched off.
- The title block values are returned so the app can compare the sheet number
  with the drawing it is linked to.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional

import ezdxf  # noqa: F401  (registers entity types used by recover)
from ezdxf import bbox as ezbbox
from ezdxf import recover

from .common import SHEET_RE, CheckFailed, Collector, ParsedName, expected_floor_code

FIELD_KA = {
    "sheet_no": "ფურცლის ნომერი", "title": "ნახაზის დასახელება", "file_name": "ფაილის სრული სახელი",
    "revision": "რევიზია", "project": "პროექტი და ობიექტი", "drawn": "შეასრულა", "checked": "შეამოწმა",
    "approved": "დაამტკიცა", "scale": "მასშტაბი", "format": "ფორმატი", "typical": "ტიპიური ×N",
}
UNITS_KA = {0: "ერთეულის გარეშე", 1: "დუიმი", 2: "ფუტი", 4: "მილიმეტრი", 5: "სანტიმეტრი", 6: "მეტრი"}
GEOM_TYPES = {"CIRCLE", "ARC", "HATCH", "LWPOLYLINE", "POLYLINE", "LINE", "SOLID", "ELLIPSE", "SPLINE"}


# --------------------------------------------------------------------------
# loading
# --------------------------------------------------------------------------

def load_doc(path: Path):
    try:
        doc, _auditor = recover.readfile(str(path))
    except Exception as exc:  # noqa: BLE001
        raise CheckFailed(
            "X-READ",
            f"DXF ვერ წავიკითხე: {str(exc)[:300]}. გადაინახე DXF ფორმატში (AutoCAD: SAVEAS → DXF) და თავიდან სცადე.",
        ) from exc
    # recover() accepts almost anything and returns an empty drawing for a truncated
    # or broken file. An empty drawing would "pass" most rules and close open Remarks,
    # so treat it as unreadable.
    if not any(True for lo in doc.layouts for _ in lo):
        raise CheckFailed(
            "X-READ",
            "ფაილში ნახაზი ვერ ვიპოვე: DXF ცარიელია ან დაზიანებულია. გადაინახე DXF ფორმატში (AutoCAD: SAVEAS → DXF) და თავიდან სცადე.",
        )
    return doc


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def eff_name(doc, ins) -> str:
    """Real block name, resolving anonymous dynamic-block references (*U…)."""
    name = ins.dxf.name
    if name.startswith("*"):
        br = doc.block_records.get(name)
        try:
            if br is not None and br.has_xdata("AcDbBlockRepBTag"):
                for code, val in br.get_xdata("AcDbBlockRepBTag"):
                    if code == 1005:
                        orig = doc.entitydb.get(val)
                        if orig is not None:
                            return orig.dxf.name
        except Exception:  # noqa: BLE001
            pass
    return name


def entity_text(e) -> str:
    t = e.dxftype()
    try:
        if t == "TEXT":
            return e.dxf.text
        if t == "MTEXT":
            return e.plain_text()
        if t in ("ATTRIB", "ATTDEF"):
            return e.dxf.text
    except Exception:  # noqa: BLE001
        return ""
    return ""


def paper_layouts(doc):
    return [lo for lo in doc.layouts if not lo.is_modelspace]


def non_trivial(layout) -> list:
    return [e for e in layout if not (e.dxftype() == "VIEWPORT" and e.dxf.get("id", 2) == 1)]


def path_len(e) -> float:
    try:
        if e.dxftype() == "LINE":
            s_, e_ = e.dxf.start, e.dxf.end
            return math.hypot(e_[0] - s_[0], e_[1] - s_[1])
        from ezdxf import path as ezpath
        p = ezpath.make_path(e)
        pts = list(p.flattening(1.0))
        return sum(math.hypot(b.x - a.x, b.y - a.y) for a, b in zip(pts, pts[1:]))
    except Exception:  # noqa: BLE001
        return 0.0


def matches_any(s: str, pats) -> bool:
    return any(re.search(p, s) for p in pats or [])


def visibility_blocks(doc) -> set[str]:
    """Names of block definitions that carry a visibility parameter (DRAFTING rule 4)."""
    out = set()
    for obj in doc.objects:
        try:
            if obj.dxftype() != "BLOCKVISIBILITYPARAMETER":
                continue
        except Exception:  # noqa: BLE001
            continue
        h = obj.dxf.get("owner")
        for _ in range(8):
            o = doc.entitydb.get(h) if h else None
            if o is None:
                break
            if o.dxftype() == "BLOCK_RECORD":
                out.add(o.dxf.name)
                break
            h = o.dxf.get("owner")
    return out


# --------------------------------------------------------------------------
# title block
# --------------------------------------------------------------------------

def find_title_block(doc, rules: dict):
    tb = rules["titleblock"]
    alias = {a.upper(): f for f, al in tb["fields"].items() for a in al}
    best = None
    spaces = [(lo, True) for lo in paper_layouts(doc)] + [(doc.modelspace(), False)]
    for lo, is_paper in spaces:
        for ins in lo.query("INSERT"):
            tags = [a.dxf.tag.upper() for a in ins.attribs]
            matched = {alias[t] for t in tags if t in alias}
            name_hit = matches_any(eff_name(doc, ins), tb["block_name_patterns"])
            score = (len(matched) + (2 if name_hit else 0), is_paper)
            if (len(matched) >= tb["min_matched_fields"] or name_hit) and (best is None or score > best[0]):
                best = (score, ins, lo)
    if not best:
        return None
    ins = best[1]
    values, revtable, tags = {}, {}, {}
    for a in ins.attribs:
        tag = a.dxf.tag.upper()
        text = (a.dxf.text or "").strip()
        tags[tag] = text
        if tag in alias and alias[tag] not in values:
            values[alias[tag]] = text
        if re.match(tb["revision_table_tag_pattern"], tag):
            revtable[tag] = text
    return {"insert": ins, "layout": best[2].name, "name": eff_name(doc, ins), "values": values,
            "revtable": revtable, "tags": tags, "has_attribs": bool(ins.attribs)}


# --------------------------------------------------------------------------
# main check
# --------------------------------------------------------------------------

def check_drawing(dxf_path: Path, display: str, parsed: Optional[ParsedName], role: Optional[str], rules: dict, col: Collector) -> dict:
    """Run every content check on one DXF. Returns facts the app can use (title block, device counts)."""
    info: dict = {"devices": {}, "cablesM": {}, "titleblock": None}
    doc = load_doc(dxf_path)
    dr, tbr = rules["drafting"], rules["titleblock"]
    msp = doc.modelspace()
    legend_layer = dr["legend_layer"].upper()
    cbl = dr["cable_layer_prefix"].upper()
    info["dxfVersion"] = doc.dxfversion

    xref_blocks = {}
    for b in doc.blocks:
        try:
            if b.block is not None and b.block.is_xref:
                xref_blocks[b.name] = b.block.dxf.get("xref_path", "")
        except Exception:  # noqa: BLE001
            pass

    # ---- rule 15: units / scale
    ins_units = doc.header.get("$INSUNITS", 0)
    info["insunits"] = ins_units
    if ins_units != dr["insunits_required"]:
        col.add("D15-UNITS", display, f"INSUNITS = {ins_units} ({UNITS_KA.get(ins_units, '?')}), საჭიროა {dr['insunits_required']} ({UNITS_KA.get(dr['insunits_required'], '?')}).",
                "UNITS ბრძანებით დააყენე Millimeters; თუ ნახაზი სხვა ერთეულშია დახაზული, ჯერ SCALE-ით გადაიყვანე 1:1 მმ-ში.")

    # ---- rule 16: one layout
    sheets = [lo.name for lo in paper_layouts(doc) if non_trivial(lo)]
    info["layouts"] = sheets
    if len(sheets) > dr["max_paper_layouts"]:
        col.add("D16-LAYOUTS", display, f"ფაილში {len(sheets)} layout-ია: {', '.join(sheets)}.",
                "ერთი ფურცელი = ერთი DWG = ერთი layout. დანარჩენი ცალკე ფაილებად გაიტანე, თითო თავისი ნომრით.")

    # ---- title block
    tb = find_title_block(doc, rules)
    tb_handle = tb["insert"].dxf.handle if tb else None
    values = tb["values"] if tb else {}
    if tb is None:
        texts = []
        for lo in paper_layouts(doc) or [msp]:
            texts += [entity_text(e).strip() for e in lo.query("TEXT MTEXT")]
        found_sheet = [t for t in texts if SHEET_RE.fullmatch(t)]
        if found_sheet:
            col.add("T-NO-ATTRIBS", display, f"ატრიბუტებიანი შტამპი ვერ ვიპოვე; ფურცლის ნომერი უბრალო ტექსტადაა ({', '.join(found_sheet[:3])}).",
                    "შტამპი ატრიბუტებით ან Sheet Set Manager-ის ველებით შეავსე, რომ ნომერი და რევიზია ორ ადგილას ხელით არ იწერებოდეს (§10.2).")
            values = {"sheet_no": found_sheet[0]}
            info["titleblock"] = {"source": "text", "values": values, "sheetCandidates": found_sheet[:10]}
            if parsed and parsed.sheet not in found_sheet:
                col.add("T-SHEET", display, f"ნახაზზე ფურცლის ნომერი {', '.join(found_sheet[:3])}, ფაილის სახელში კი {parsed.sheet}.",
                        "ფურცლის ნომერი შტამპში და ფაილის სახელში ერთი უნდა იყოს.")
        else:
            col.add("T-MISSING", display, "შტამპი (title block) ვერ მოიძებნა: არც ატრიბუტებიანი ბლოკი, არც ფურცლის ნომრის ტექსტი.",
                    "ჩასვი სტანდარტული შტამპი paper space-ში და შეავსე §10.1-ის ველები. თუ შტამპი არსებობს, მისი tag-ები Settings-ში შტამპის ველებს უნდა დაემატოს.")
    else:
        info["titleblock"] = {"source": "block", "block": tb["name"], "layout": tb["layout"], "values": values,
                              "revisionTable": tb["revtable"], "tags": tb["tags"]}
        missing = [f for f in tbr["required"] if f not in values]
        if missing:
            col.add("T-FIELD-MISSING", display, f"შტამპს ({tb['name']}) აკლია ველები: {', '.join(FIELD_KA.get(f, f) for f in missing)}.",
                    "§10.1-ის ყველა სავალდებულო ველი შტამპში უნდა იყოს. თუ ველი არსებობს სხვა tag-ით, დაამატე Settings-ში შტამპის ველებს.")
        for f in tbr["required"]:
            if f in values and not values[f]:
                sev = None
                if f in tbr["signature_fields"] and role == "wip":
                    sev = "INFO"
                elif f in ("sheet_no", "file_name", "revision"):
                    sev = "ERROR"
                col.add("T-FIELD-EMPTY", display, f"შტამპის ველი „{FIELD_KA.get(f, f)}“ ცარიელია.", "შეავსე ველი გაცემამდე.", severity=sev)
        if not tb["revtable"]:
            col.add("T-REVTABLE", display, "შტამპში რევიზიების ცხრილი (REV1… ატრიბუტები) ვერ ვიპოვე.",
                    "რევიზიების ცხრილში იწერება რევიზია, თარიღი, აღწერა, შეასრულა, შეამოწმა (§6, §10.1).")
        elif parsed and parsed.rev and parsed.rev not in " ".join(tb["revtable"].values()):
            col.add("T-REVTABLE", display, f"რევიზიების ცხრილში {parsed.rev}-ის ჩანაწერი არ არის.", "ყოველ გაცემაზე ცხრილში ახალი სტრიქონი ემატება.")
        sc = values.get("scale")
        if sc and not re.match(tbr["scale_pattern"], sc.replace(" ", "")):
            col.add("T-SCALE", display, f"მასშტაბი „{sc}“ ფორმატს არ მიჰყვება.", "მაგ. 1:100")
        fm = values.get("format")
        if fm and not re.match(tbr["format_pattern"], fm.replace(" ", "")):
            col.add("T-FORMAT", display, f"ფორმატი „{fm}“ ფორმატს არ მიჰყვება.", "მაგ. A1")

    title = values.get("title", "")
    if parsed and values:
        sn = (values.get("sheet_no") or "").replace(" ", "").upper()
        if sn and sn != parsed.sheet:
            col.add("T-SHEET", display, f"შტამპში ფურცლის ნომერი {sn}, ფაილის სახელში {parsed.sheet}.",
                    "ფურცლის ნომერი შტამპში ფაილის სახელს უნდა ემთხვეოდეს (§11.2). თუ ნომერი უკვე გაცემულია, ის არ იცვლება.")
        fnv = (values.get("file_name") or "").strip().upper()
        if fnv:
            fnv_base = re.sub(r"\.(DWG|DXF|PDF)$", "", fnv)
            fnv_base = re.sub(r"_[PC]\d{2}(\.\d{2})?$", "", fnv_base)
            if fnv_base != parsed.base:
                col.add("T-FILENAME", display, f"შტამპში ფაილის სახელი „{values['file_name']}“, რეალური კი {parsed.base}.",
                        f"შტამპში ჩაწერე {parsed.base} (ან Field-ით ფაილის სახელიდან აიღე).")
        rv = (values.get("revision") or "").strip().upper()
        if parsed.rev and rv and rv != parsed.rev:
            col.add("T-REV", display, f"შტამპში რევიზია {rv}, ფაილის სახელში {parsed.rev}.", "რევიზია ერთნაირი უნდა იყოს სახელში, შტამპში, რეესტრში და Revline-ში.")
        pv = values.get("project", "")
        if pv:
            if parsed.proj not in pv.upper():
                col.add("T-PROJECT", display, f"შტამპის პროექტის ველში ({pv}) პროექტის კოდი {parsed.proj} არ ჩანს.", f"ჩაწერე პროექტის კოდი {parsed.proj} და ობიექტის დასახელება.")
        non_level = rules["naming"]["floors"]["non_level"]
        if parsed.floor not in non_level and parsed.ext in ("dwg", "dxf"):
            exp = expected_floor_code(title)
            if exp and exp != parsed.floor:
                col.add("T-FLOOR", display, f"დასახელება „{title}“ სართულ {exp}-ს შეესაბამება, ფაილის სახელში კი {parsed.floor}-ია.",
                        "შესასვლელი დონე („სართული 1“, ±0.000) = 00, „სართული 2“ = 01, „სართული -1“ = B1. გაასწორე სახელი ან დასახელება.")
            elif exp is None and parsed.series == rules["naming"]["plan_series"] and title:
                col.add("T-FLOOR", display, f"გეგმის დასახელებაში („{title}“) სართული ვერ ამოვიცანი.",
                        "შტამპში არქიტექტორის სართულის დასახელებაც იწერება (მაგ. „სართული 1, ნიშნ. ±0.000“).", severity="WARNING")

    # ---- rule 17: typical floors
    if matches_any(title, dr["typical_keywords"]) or "typical" in values:
        tv = values.get("typical", "")
        if not tv:
            col.add("D17-TYPICAL", display, "ნახაზი ტიპიურ სართულს ეხება, მაგრამ შტამპში „ტიპიური ×N“ შევსებული არ არის.",
                    "შეავსე მამრავლი (მაგ. ×4) ან ყველა სართული სრულად დახაზე.")

    # ---- collect inserts
    non_dev = dr["non_device_block_patterns"]
    devices = []
    for ins in msp.query("INSERT"):
        nm = eff_name(doc, ins)
        if nm in xref_blocks or ins.dxf.handle == tb_handle:
            continue
        if ins.dxf.layer.upper() == legend_layer or nm.startswith("*") or matches_any(nm, non_dev):
            continue
        devices.append((nm, ins))
    dev_names = Counter(nm for nm, _ in devices)
    info["devices"] = dict(dev_names)

    # ---- rule 5: xrefs, paper-space devices
    info["xrefs"] = sorted(xref_blocks)
    if len(xref_blocks) > 1:
        col.add("D05-XREF-COUNT", display, f"მიმაგრებულია {len(xref_blocks)} xref: {', '.join(sorted(xref_blocks))}.",
                "xref მხოლოდ არქიტექტურული ფონისთვისაა; სხვა xref-ის შიგთავსი ძირითად ფაილში უნდა იყოს ან მოიხსნას.")
    for nm, p in xref_blocks.items():
        if p and re.match(r"^[A-Za-z]:[\\/]|^\\\\|^/", p):
            col.add("D05-XREF-ABS", display, f"xref „{nm}“ აბსოლუტური მისამართითაა: {p}", "XREF პალიტრაში Path type → Relative (§10.2), ფონი 04_RECEIVED-იდან.")
    if col.is_on("D05-PAPER-DEVICE"):
        paper_dev = []
        for lo in paper_layouts(doc):
            for ins in lo.query("INSERT"):
                nm = eff_name(doc, ins)
                if ins.dxf.handle == tb_handle or nm in xref_blocks or ins.dxf.layer.upper() == legend_layer or matches_any(nm, non_dev) or nm.startswith("*"):
                    continue
                if tb and matches_any(nm, tbr["block_name_patterns"]):
                    continue
                paper_dev.append(nm)
        if paper_dev:
            c = Counter(paper_dev)
            col.add("D05-PAPER-DEVICE", display, f"paper space-ში ბლოკებია: {', '.join(f'{k}×{v}' for k, v in c.most_common(10))}.",
                    "მოწყობილობები მხოლოდ model space-შია. თუ ეს ლოგო/ისარია, დაამატე Settings-ში არა-მოწყობილობის ბლოკებს.")

    # ---- rule 6: duplicates
    tol = float(dr["duplicate_tolerance_mm"]) or 1.0
    grid = Counter()
    where = {}
    for nm, ins in devices:
        x, y = ins.dxf.insert[0], ins.dxf.insert[1]
        k = (nm, round(x / tol), round(y / tol))
        grid[k] += 1
        where[k] = (x, y)
    dups = {k: v for k, v in grid.items() if v > 1}
    if dups:
        extra = sum(v - 1 for v in dups.values())
        ev = "; ".join(f"{k[0]} @ ({where[k][0]:.0f}, {where[k][1]:.0f}) ×{v}" for k, v in list(dups.items())[:8])
        col.add("D06-DUPLICATE", display, f"{extra} ზედმეტი ბლოკი დგას ერთმანეთზე ({len(dups)} ადგილას).",
                "OVERKILL ბრძანებით წაშალე დუბლიკატები; თორემ რაოდენობა გაიზრდება.", ev)
        info["devicesAfterDedup"] = {nm: c - sum(v - 1 for k, v in dups.items() if k[0] == nm) for nm, c in dev_names.items()}

    # ---- rule 2 / 3: copies, approved library
    copy_hits = sorted({nm for nm in dev_names if matches_any(nm, dr["copy_block_patterns"])})
    if copy_hits:
        col.add("D02-COPY-BLOCK", display, f"ბლოკის სახელები ასლს/ძველ ვერსიას ჰგავს: {', '.join(copy_hits[:15])}.",
                "მოწყობილობის ერთ ტიპს ერთი ბლოკი აქვს; ჩაანაცვლე ბიბლიოთეკის ბლოკით (BLOCKREPLACE) და PURGE.")
    norm = defaultdict(set)
    for nm in dev_names:
        base = nm
        for pat in dr["copy_block_patterns"]:
            base = re.sub(pat, "", base)
        norm[base.upper()].add(nm)
    pairs = [sorted(v) for v in norm.values() if len(v) > 1]
    if pairs:
        col.add("D02-COPY-BLOCK", display, "ერთი ტიპის რამდენიმე ბლოკი: " + "; ".join(" / ".join(p) for p in pairs[:10]) + ".",
                "დატოვე ერთი დამტკიცებული ბლოკი; ზედმეტი ჩაანაცვლე.")
    if dr.get("approved_blocks"):
        appr = {b.upper() for b in dr["approved_blocks"]}
        bad = sorted(nm for nm in dev_names if nm.upper() not in appr)
        if bad:
            col.add("D03-UNAPPROVED", display, f"ბლოკები ბიბლიოთეკის გარეთაა: {', '.join(bad[:15])}.", "გამოიყენე მხოლოდ დამტკიცებული ბიბლიოთეკის ბლოკები.")

    # ---- rule 4: dynamic visibility
    if col.is_on("D04-DYNAMIC"):
        vis = visibility_blocks(doc)
        used_vis = sorted(v for v in vis if v in dev_names) or sorted(vis)
        if used_vis:
            col.add("D04-DYNAMIC", display, f"dynamic block-ები visibility state-ით: {', '.join(used_vis[:10])}.",
                    "სხვადასხვა ტიპი სხვადასხვა ბლოკით: visibility state-ები ცალკე ბლოკებად გაიტანე.")

    # ---- rule 1: exploded symbols
    if col.is_on("D01-EXPLODED"):
        dev_layers = {ins.dxf.layer for _, ins in devices}
        loose = Counter()
        for e in msp:
            if e.dxftype() in GEOM_TYPES and e.dxf.layer in dev_layers and not e.dxf.layer.upper().startswith(cbl):
                loose[e.dxf.layer] += 1
        if loose:
            col.add("D01-EXPLODED", display, "მოწყობილობების ლეიერებზე ბლოკის გარეთ გეომეტრიაა: " + ", ".join(f"{k}: {v}" for k, v in loose.most_common(8)) + ".",
                    "შეამოწმე, ხომ არ არის დაშლილი (EXPLODE) მოწყობილობა; თუ ასეა, ბიბლიოთეკის ბლოკით ჩაანაცვლე.")
        radii = set()
        for nm in dev_names:
            blk = doc.blocks.get(nm)
            if blk is not None:
                radii |= {round(c.dxf.radius, 1) for c in blk.query("CIRCLE")}
        if radii:
            circ = Counter()
            for c in msp.query("CIRCLE"):
                if "|" in c.dxf.layer or c.dxf.layer in dev_layers or c.dxf.layer.upper() == legend_layer:
                    continue
                r = round(c.dxf.radius, 1)
                if r in radii:
                    circ[(c.dxf.layer, r)] += 1
            hits = [(k, v) for k, v in circ.items() if v >= 3]
            if hits:
                col.add("D01-EXPLODED", display, "ბლოკის გარეთ წრეები მოწყობილობის სიმბოლოს რადიუსით: " + ", ".join(f"{k[0]} R{k[1]} ×{v}" for k, v in hits[:6]) + ".",
                        "სავარაუდოდ დაშლილი სიმბოლოებია; ჩაანაცვლე ბლოკით, თორემ COUNT მათ ვერ დაითვლის.")

    # ---- cables: rules 13–14
    layer_names = [ly.dxf.name for ly in doc.layers]
    cable_layers = [n for n in layer_names if n.upper().startswith(cbl)]
    # "{systems}" in the pattern = any system code from NAMING §4.5
    cable_pat = dr["cable_layer_pattern"].replace("{systems}", "(?:" + "|".join(map(re.escape, rules["naming"]["systems"])) + ")")
    for n in cable_layers:
        if not re.match(cable_pat, n.upper()):
            col.add("D13-CABLE-LAYER-NAME", display, f"კაბელის ლეიერი „{n}“ ფორმატს არ მიჰყვება ({dr['cable_layer_pattern'].replace('{systems}', '<სისტემის კოდი>').strip('^$')}).", "იხ. DRAFTING წესი 13; კაბელის ყოველ ტიპს ერთი ლეიერი.")
    bad_on_cable = Counter()
    cable_len = defaultdict(float)
    used_cable_layers = set()
    for lo in doc.layouts:
        for e in lo:
            ly = e.dxf.get("layer", "0")
            if not ly.upper().startswith(cbl):
                continue
            used_cable_layers.add(ly)
            if e.dxftype() in dr["cable_allowed_types"]:
                if lo.is_modelspace:
                    cable_len[ly] += path_len(e)
            else:
                bad_on_cable[(ly, e.dxftype())] += 1
    if bad_on_cable:
        col.add("D14-CABLE-CONTENT", display, "კაბელის ლეიერებზე ტრასის გარდა ობიექტებია: " + ", ".join(f"{k[0]}: {k[1]}×{v}" for k, v in bad_on_cable.most_common(10)) + ".",
                "კაბელის ლეიერზე მხოლოდ ხაზი/პოლილაინია; ტექსტი, ისარი და გამოძახება სხვა ლეიერზე გადაიტანე (LAYISO-თი შეამოწმე).")
    info["cablesM"] = {k: round(v / 1000.0, 1) for k, v in cable_len.items()}
    off = Counter()
    for e in msp.query("LINE LWPOLYLINE POLYLINE"):
        ly = e.dxf.layer
        if "|" not in ly and not ly.upper().startswith(cbl) and matches_any(ly, dr["cable_like_layer_hints"]):
            off[ly] += 1
    if off:
        col.add("D13-CABLE-OFF-LAYER", display, "კაბელის მსგავსი ტრასები CBL- ლეიერის გარეთ: " + ", ".join(f"{k}: {v}" for k, v in off.most_common(6)) + ".",
                "კაბელის ყოველ ტიპს საკუთარი CBL-<სისტემა>-<ტიპი> ლეიერი აქვს.")

    # ---- scale sanity (rule 15)
    if col.is_on("D15-SCALE") and devices and ins_units == 4:
        try:
            ents = [e for e in msp if not (e.dxftype() == "INSERT" and e.dxf.name in xref_blocks)]
            ext = ezbbox.extents(ents, fast=True)
            if ext.has_data and max(ext.size.x, ext.size.y) < dr["min_model_extent_mm"]:
                col.add("D15-SCALE", display, f"model space-ის ზომა მხოლოდ {max(ext.size.x, ext.size.y):.1f} ერთეულია.",
                        "სავარაუდოდ ნახაზი მეტრებშია ან დაპატარავებულია; model space 1:1, მმ-ში უნდა იყოს.")
        except Exception:  # noqa: BLE001
            pass

    # ---- legend: rules 8–12
    legend_ents = []
    for lo in doc.layouts:
        for e in lo:
            if e.dxf.get("layer", "").upper() == legend_layer:
                legend_ents.append((lo, e))
    if not legend_ents:
        col.add("D08-LEGEND-MISSING", display, f"{dr['legend_layer']} ლეიერზე ობიექტები არ არის: ლეგენდა ან არ არის, ან სხვა ლეიერზეა.",
                f"ააწყე ლეგენდა {dr['legend_layer']} ლეიერზე სამი სვეტით: სიმბოლო (იგივე ბლოკი), აღწერა, ერთეული.")
    else:
        leg_blocks = {eff_name(doc, e) for _, e in legend_ents if e.dxftype() == "INSERT"}
        leg_text = " ".join(entity_text(e) for _, e in legend_ents if e.dxftype() in ("TEXT", "MTEXT"))
        leg_text += " " + " ".join(a.dxf.text for _, e in legend_ents if e.dxftype() == "INSERT" for a in e.attribs)
        if not leg_blocks:
            col.add("D09-LEGEND-SYMBOL", display, "ლეგენდაში ერთი ბლოკიც არ არის: სიმბოლოები ხელითაა დახაზული.", "სიმბოლოს სვეტში იგივე ბლოკი ჩასვი, რაც გეგმაზეა.")
        missing = sorted(set(dev_names) - leg_blocks)
        if missing:
            col.add("D11-LEGEND-BLOCK", display, f"გეგმაზე გამოყენებული ბლოკები ლეგენდაში არ არის: {', '.join(missing[:20])}.",
                    "დაამატე ლეგენდაში თითო ბლოკი აღწერით და ერთეულით.")
        if col.is_on("D11-LEGEND-CABLE"):
            drawn_on = {e.dxf.layer for e in msp.query("LINE LWPOLYLINE POLYLINE")}
            for ly in sorted(l for l in used_cable_layers if l in drawn_on):
                tail = ly.split("-")[-1]
                if ly.upper() not in leg_text.upper() and tail.upper() not in leg_text.upper():
                    col.add("D11-LEGEND-CABLE", display, f"კაბელის ლეიერი {ly} ლეგენდაში არ ჩანს.", "ლეგენდაში დაამატე კაბელის სტრიქონი (ტიპი, კვეთი, ერთეული „მ“).")
        if not re.search(r"(^|\s)(ც\.?|ცალი|მ\.?|pcs|m)(\s|$)", leg_text):
            col.add("D11-LEGEND-UNITS", display, "ლეგენდაში ერთეულის სვეტი (ც., მ) ვერ ვიპოვე.", "ლეგენდას სამი სვეტი აქვს: სიმბოლო, აღწერა, ერთეული.")
        # rule 12: other-layer objects inside the legend's area
        if col.is_on("D12-LEGEND-LAYER"):
            by_lo = defaultdict(list)
            for lo, e in legend_ents:
                by_lo[lo.name].append(e)
            stray = Counter()
            for lo in doc.layouts:
                ents = by_lo.get(lo.name)
                if not ents:
                    continue
                try:
                    lb = ezbbox.extents(ents, fast=True)
                except Exception:  # noqa: BLE001
                    continue
                if not lb.has_data:
                    continue
                handles = {e.dxf.handle for e in ents}
                for e in lo:
                    if e.dxf.handle in handles or e.dxftype() in ("VIEWPORT",) or (e.dxftype() == "INSERT" and (e.dxf.name in xref_blocks or e.dxf.handle == tb_handle)):
                        continue
                    try:
                        b = ezbbox.extents([e], fast=True)
                    except Exception:  # noqa: BLE001
                        continue
                    if b.has_data and lb.inside(b.extmin) and lb.inside(b.extmax):
                        stray[e.dxf.layer] += 1
            if stray:
                col.add("D12-LEGEND-LAYER", display, "ლეგენდის არეში სხვა ლეიერის ობიექტებია: " + ", ".join(f"{k}: {v}" for k, v in stray.most_common(8)) + ".",
                        f"ლეგენდა მთლიანად (ბლოკები, ტექსტი, ცხრილის ხაზები) {dr['legend_layer']} ლეიერზე გადაიტანე; LAYOFF-ით შეამოწმე.")

    # ---- rule 7: SKU / model numbers
    if col.is_on("D07-SKU") or col.is_on("D07-SKU-STRONG"):
        tb_texts = set(values.values()) | set((tb or {}).get("revtable", {}).values())
        texts = []
        for lo in doc.layouts:
            for e in lo.query("TEXT MTEXT"):
                texts.append((lo.name, entity_text(e)))
            for ins in lo.query("INSERT"):
                if ins.dxf.handle == tb_handle:
                    continue
                texts += [(lo.name, a.dxf.text) for a in ins.attribs]
        texts += [("block name", nm) for nm in dev_names]
        strong, generic = Counter(), Counter()
        wl = {w.upper() for w in dr["sku_whitelist"]}
        layer_up = {n.upper() for n in layer_names}
        gen_re = re.compile(dr["sku_generic_pattern"])
        for _where, t in texts:
            if not t or t in tb_texts:
                continue
            for pat in dr["sku_strong_patterns"]:
                for m in re.finditer(pat, t):
                    strong[m.group(0)] += 1
            for m in gen_re.finditer(t):
                tok = m.group(0).strip("-./")
                u = tok.upper()
                if u in wl or u in layer_up or any(re.match(p, u) for p in dr["sku_exclude_patterns"]):
                    continue
                if any(tok in s for s in strong):
                    continue
                generic[tok] += 1
        if strong:
            col.add("D07-SKU-STRONG", display, f"ნახაზზე მწარმოებლის მოდელის კოდებია: {', '.join(k for k, _ in strong.most_common(15))}.",
                    "SKU და მოდელის ნომერი ნახაზზე არ იწერება (არც ბლოკში, ატრიბუტში, ტექსტში, ლეგენდაში); ის მხოლოდ BOM-შია (Revline).")
        if generic:
            col.add("D07-SKU", display, f"შესაძლო SKU/მოდელის კოდები (გადაამოწმე): {', '.join(k for k, _ in generic.most_common(15))}.",
                    "თუ ეს მოდელის კოდია, წაშალე ნახაზიდან. თუ ჩვეულებრივი აღნიშვნაა, დაამატე Settings-ში SKU-ს გამონაკლისებს.")
    return info
