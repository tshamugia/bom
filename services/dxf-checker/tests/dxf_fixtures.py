"""Synthetic DXF fixtures, ported from the skill's scripts/make_fixtures.py.

good : follows both standards (expect no ERROR)
bad  : the planted problems listed in BAD_PLANTED
"""
from __future__ import annotations

from pathlib import Path

import ezdxf

GOOD_NAME = "INS-26TBL-ZZ-00-FA-102.dxf"
BAD_NAME = "INS-26TBL-ZZ-00-FA-103.dxf"

BAD_PLANTED = [
    "INSUNITS=6 (მეტრი)", "მეორე layout", "შტამპში ფურცელი FA-104 (ფაილი FA-103)",
    "დასახელება 'სართული 3' ≠ სართული 00", "შტამპს აკლია APPROVED და FORMAT",
    "SD-ADDR დუბლიკატი ერთ წერტილში", "SD-ADDR_old ასლი", "MCP-ADDR ლეგენდაში არ არის",
    "ტექსტი CBL-FIRE-FP200 ლეიერზე", "DS-2CD2143G2-I და 'NFX-OPT' ტექსტი", "ლეგენდის ტექსტი 0 ლეიერზე",
    "მეორე xref აბსოლუტური მისამართით", "დაშლილი დეტექტორი (წრე R100 DEV-FIRE ლეიერზე)",
]

TB_TAGS = ["SHEET_NO", "TITLE", "FILE_NAME", "REV", "PROJECT", "DRAWN", "CHECKED", "APPROVED", "SCALE", "FORMAT",
           "REV1", "REV1_DATE", "REV1_DESC"]


def _blocks(doc, tb_tags):
    sd = doc.blocks.new("SD-ADDR")
    sd.add_circle((0, 0), 100)
    sd.add_text("S", height=80).set_placement((0, 0), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    hd = doc.blocks.new("HD-ADDR")
    hd.add_circle((0, 0), 100)
    hd.add_text("H", height=80).set_placement((0, 0), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    mcp = doc.blocks.new("MCP-ADDR")
    mcp.add_lwpolyline([(-100, -100), (100, -100), (100, 100), (-100, 100)], close=True)
    tb = doc.blocks.new("TITLE_BLOCK_A1")
    tb.add_lwpolyline([(0, 0), (180, 0), (180, 60), (0, 60)], close=True)
    for i, tag in enumerate(tb_tags):
        tb.add_attdef(tag, (5, 55 - i * 4), dxfattribs={"height": 2.5})
    return tb


def _legend(msp, x0, y0, blocks, cable_rows, layer="LEGEND", text_layer=None):
    msp.add_text("ლეგენდა", height=250, dxfattribs={"layer": layer}).set_placement((x0, y0 + 600))
    rows = len(blocks) + len(cable_rows)
    msp.add_lwpolyline([(x0 - 200, y0 + 400), (x0 + 6000, y0 + 400), (x0 + 6000, y0 - rows * 500), (x0 - 200, y0 - rows * 500)],
                       close=True, dxfattribs={"layer": layer})
    y = y0
    for name, desc in blocks:
        msp.add_blockref(name, (x0 + 200, y), dxfattribs={"layer": layer})
        msp.add_text(desc, height=150, dxfattribs={"layer": text_layer or layer}).set_placement((x0 + 800, y))
        msp.add_text("ც.", height=150, dxfattribs={"layer": layer}).set_placement((x0 + 5200, y))
        y -= 500
    for lay, desc in cable_rows:
        msp.add_line((x0, y), (x0 + 500, y), dxfattribs={"layer": layer})
        msp.add_text(f"{lay}: {desc}", height=150, dxfattribs={"layer": layer}).set_placement((x0 + 800, y))
        msp.add_text("მ", height=150, dxfattribs={"layer": layer}).set_placement((x0 + 5200, y))
        y -= 500


def make_good(path: Path) -> Path:
    doc = ezdxf.new("R2018", setup=True)
    doc.header["$INSUNITS"] = 4
    for ly in ["DEV-FIRE", "LEGEND", "CBL-FIRE-FP200", "TEXT", "A-ARCH"]:
        doc.layers.add(ly)
    _blocks(doc, TB_TAGS)
    doc.blocks.new("ARCH_BG", dxfattribs={"flags": 4, "xref_path": r"..\04_RECEIVED\2026-10-01\ARCH-00.dwg"})
    msp = doc.modelspace()
    msp.add_blockref("ARCH_BG", (0, 0))
    for p in [(2000, 2000), (6000, 2000), (10000, 2000), (2000, 6000), (6000, 6000)]:
        msp.add_blockref("SD-ADDR", p, dxfattribs={"layer": "DEV-FIRE"})
    msp.add_blockref("HD-ADDR", (10000, 6000), dxfattribs={"layer": "DEV-FIRE"})
    msp.add_blockref("MCP-ADDR", (12000, 1000), dxfattribs={"layer": "DEV-FIRE"})
    msp.add_lwpolyline([(2000, 2000), (6000, 2000), (10000, 2000), (10000, 6000), (6000, 6000), (2000, 6000), (2000, 3000), (12000, 1000)],
                       dxfattribs={"layer": "CBL-FIRE-FP200"})
    msp.add_text("ლუპი 1", height=200, dxfattribs={"layer": "TEXT"}).set_placement((2100, 2300))
    _legend(msp, 20000, 8000, [("SD-ADDR", "კვამლის დეტექტორი, ოპტიკური, მისამართიანი"),
                               ("HD-ADDR", "სითბური დეტექტორი 57°C, მისამართიანი"),
                               ("MCP-ADDR", "ხელის ღილაკი, მისამართიანი")],
            [("CBL-FIRE-FP200", "ხანძარგამძლე კაბელი FP200, 2×1.5 მმ²")])
    lo = doc.layouts.get("Layout1")
    tb = lo.add_blockref("TITLE_BLOCK_A1", (600, 10))
    tb.add_auto_attribs({
        "SHEET_NO": "FA-102", "TITLE": "ხანძრის სიგნალიზაცია. გეგმა, სართული 1 (±0.000)",
        "FILE_NAME": "INS-26TBL-ZZ-00-FA-102", "REV": "P01.02", "PROJECT": "26TBL, სატესტო ობიექტი, თბილისი",
        "DRAWN": "გ. ჯღარკავა", "CHECKED": "", "APPROVED": "", "SCALE": "1:100", "FORMAT": "A1",
        "REV1": "P01", "REV1_DATE": "", "REV1_DESC": "",
    })
    doc.saveas(path)
    return path


def make_bad(path: Path) -> Path:
    doc = ezdxf.new("R2018", setup=True)
    doc.header["$INSUNITS"] = 6
    for ly in ["DEV-FIRE", "LEGEND", "CBL-FIRE-FP200", "TEXT"]:
        doc.layers.add(ly)
    tags = [t for t in TB_TAGS if t not in ("APPROVED", "FORMAT")]
    _blocks(doc, tags)
    sd_old = doc.blocks.new("SD-ADDR_old")
    sd_old.add_circle((0, 0), 100)
    doc.blocks.new("ARCH_BG", dxfattribs={"flags": 4, "xref_path": r"..\04_RECEIVED\ARCH-00.dwg"})
    doc.blocks.new("MEP_OTHER", dxfattribs={"flags": 4, "xref_path": r"C:\Users\someone\Desktop\MEP.dwg"})
    msp = doc.modelspace()
    msp.add_blockref("ARCH_BG", (0, 0))
    msp.add_blockref("MEP_OTHER", (0, 0))
    for p in [(2000, 2000), (6000, 2000), (6000, 2000.3), (2000, 6000)]:
        msp.add_blockref("SD-ADDR", p, dxfattribs={"layer": "DEV-FIRE"})
    msp.add_blockref("SD-ADDR_old", (10000, 2000), dxfattribs={"layer": "DEV-FIRE"})
    msp.add_blockref("MCP-ADDR", (12000, 1000), dxfattribs={"layer": "DEV-FIRE"})
    msp.add_circle((8000, 8000), 100, dxfattribs={"layer": "DEV-FIRE"})        # exploded detector
    msp.add_lwpolyline([(2000, 2000), (6000, 2000), (2000, 6000), (12000, 1000)], dxfattribs={"layer": "CBL-FIRE-FP200"})
    msp.add_text("ლუპი 1, FP200", height=200, dxfattribs={"layer": "CBL-FIRE-FP200"}).set_placement((2100, 2300))
    msp.add_text("კამერა DS-2CD2143G2-I", height=200, dxfattribs={"layer": "TEXT"}).set_placement((9000, 9000))
    msp.add_text("მოდული NFX-OPT", height=200, dxfattribs={"layer": "TEXT"}).set_placement((9000, 9500))
    _legend(msp, 20000, 8000, [("SD-ADDR", "კვამლის დეტექტორი, ოპტიკური, მისამართიანი"),
                               ("SD-ADDR_old", "კვამლის დეტექტორი")],
            [("CBL-FIRE-FP200", "ხანძარგამძლე კაბელი FP200, 2×1.5 მმ²")], text_layer="0")
    lo = doc.layouts.get("Layout1")
    tb = lo.add_blockref("TITLE_BLOCK_A1", (600, 10))
    tb.add_auto_attribs({
        "SHEET_NO": "FA-104", "TITLE": "ხანძრის სიგნალიზაცია. გეგმა, სართული 3",
        "FILE_NAME": "INS-26TBL-ZZ-00-FA-103", "REV": "P01", "PROJECT": "სატესტო ობიექტი",
        "DRAWN": "მ. ქასრელიშვილი", "CHECKED": "", "SCALE": "1:100", "REV1": "", "REV1_DATE": "", "REV1_DESC": "",
    })
    lo2 = doc.layouts.new("Layout2")
    lo2.add_text("მეორე ფურცელი", height=5)
    doc.saveas(path)
    return path
