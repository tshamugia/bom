// Mock data for the BOM application
const VENDORS = [
  { id: "v1", name: "Mouser Components", code: "MSR", country: "US", lead: "3-5d", rating: 4.8, items: 412, status: "preferred" },
  { id: "v2", name: "DigiSource Electronics", code: "DGS", country: "US", lead: "2-4d", rating: 4.7, items: 388, status: "preferred" },
  { id: "v3", name: "Arrow Northbridge", code: "ARW", country: "US", lead: "5-7d", rating: 4.5, items: 254, status: "approved" },
  { id: "v4", name: "Farnell EU", code: "FNL", country: "UK", lead: "4-6d", rating: 4.6, items: 301, status: "approved" },
  { id: "v5", name: "RS Components", code: "RSC", country: "UK", lead: "5-8d", rating: 4.4, items: 198, status: "approved" },
  { id: "v6", name: "TaiwanTech Supply", code: "TWT", country: "TW", lead: "10-14d", rating: 4.2, items: 145, status: "approved" },
  { id: "v7", name: "Shenzhen Direct", code: "SZD", country: "CN", lead: "12-18d", rating: 3.9, items: 220, status: "review" },
  { id: "v8", name: "PCBWay Components", code: "PCB", country: "CN", lead: "10-15d", rating: 4.3, items: 167, status: "approved" },
];

const CATEGORIES = [
  { id: "c1", name: "Passive Components", subs: ["Resistors", "Capacitors", "Inductors", "Ferrites"] },
  { id: "c2", name: "Semiconductors", subs: ["MCUs", "MOSFETs", "Diodes", "Voltage Regulators", "Op-Amps"] },
  { id: "c3", name: "Connectors", subs: ["Headers", "USB", "JST", "Terminal Blocks", "RF"] },
  { id: "c4", name: "Electromechanical", subs: ["Switches", "Relays", "Encoders", "Buzzers"] },
  { id: "c5", name: "Power", subs: ["Batteries", "DC-DC Converters", "Linear Regulators", "Inductors"] },
  { id: "c6", name: "PCB & Hardware", subs: ["Standoffs", "Screws", "Enclosures", "Heatsinks"] },
  { id: "c7", name: "Cables & Wires", subs: ["Ribbon", "Hookup", "Coaxial", "Custom Harness"] },
];

const STOCK_STATES = ["in-stock", "low-stock", "backorder", "out-of-stock"];

const ITEMS = [
  { sku: "RES-0805-10K-1", desc: "Resistor 10kΩ 1% 0805 SMD", cat: "Passive Components", sub: "Resistors", vendor: "Mouser Components", mfr: "Yageo", unit: "pcs", price: 0.012, stock: "in-stock", qty: 5840 },
  { sku: "RES-0805-1K-1", desc: "Resistor 1kΩ 1% 0805 SMD", cat: "Passive Components", sub: "Resistors", vendor: "Mouser Components", mfr: "Yageo", unit: "pcs", price: 0.011, stock: "in-stock", qty: 12400 },
  { sku: "RES-0603-4K7-1", desc: "Resistor 4.7kΩ 1% 0603 SMD", cat: "Passive Components", sub: "Resistors", vendor: "DigiSource Electronics", mfr: "Panasonic", unit: "pcs", price: 0.009, stock: "in-stock", qty: 22000 },
  { sku: "CAP-0603-100N", desc: "Capacitor 100nF X7R 50V 0603", cat: "Passive Components", sub: "Capacitors", vendor: "DigiSource Electronics", mfr: "Murata", unit: "pcs", price: 0.018, stock: "in-stock", qty: 18650 },
  { sku: "CAP-0805-10U", desc: "Capacitor 10µF X5R 25V 0805", cat: "Passive Components", sub: "Capacitors", vendor: "Mouser Components", mfr: "Samsung EM", unit: "pcs", price: 0.044, stock: "in-stock", qty: 9320 },
  { sku: "CAP-EL-470U", desc: "Electrolytic Cap 470µF 35V Radial", cat: "Passive Components", sub: "Capacitors", vendor: "Farnell EU", mfr: "Nichicon", unit: "pcs", price: 0.32, stock: "low-stock", qty: 240 },
  { sku: "IND-1210-10U", desc: "Power Inductor 10µH 2.1A 1210", cat: "Passive Components", sub: "Inductors", vendor: "Arrow Northbridge", mfr: "Coilcraft", unit: "pcs", price: 0.41, stock: "in-stock", qty: 1800 },
  { sku: "MCU-STM32G0", desc: "STM32G031K8T6 ARM Cortex-M0+ 64KB", cat: "Semiconductors", sub: "MCUs", vendor: "Arrow Northbridge", mfr: "STMicro", unit: "pcs", price: 1.84, stock: "in-stock", qty: 412 },
  { sku: "MCU-ESP32-S3", desc: "ESP32-S3-WROOM-1 Wi-Fi/BLE Module", cat: "Semiconductors", sub: "MCUs", vendor: "Mouser Components", mfr: "Espressif", unit: "pcs", price: 3.20, stock: "in-stock", qty: 680 },
  { sku: "MCU-RP2040", desc: "RP2040 Dual-Core M0+ 133MHz QFN-56", cat: "Semiconductors", sub: "MCUs", vendor: "DigiSource Electronics", mfr: "Raspberry Pi", unit: "pcs", price: 0.98, stock: "in-stock", qty: 1240 },
  { sku: "FET-N-AO3400", desc: "N-Channel MOSFET AO3400 30V 5.7A", cat: "Semiconductors", sub: "MOSFETs", vendor: "Shenzhen Direct", mfr: "Alpha & Omega", unit: "pcs", price: 0.06, stock: "in-stock", qty: 8400 },
  { sku: "REG-LM1117-3V3", desc: "LDO Regulator LM1117-3.3 800mA SOT-223", cat: "Semiconductors", sub: "Voltage Regulators", vendor: "Mouser Components", mfr: "TI", unit: "pcs", price: 0.38, stock: "in-stock", qty: 2100 },
  { sku: "REG-AMS1117-5V", desc: "LDO Regulator AMS1117-5.0 1A SOT-223", cat: "Semiconductors", sub: "Voltage Regulators", vendor: "TaiwanTech Supply", mfr: "AMS", unit: "pcs", price: 0.09, stock: "in-stock", qty: 6800 },
  { sku: "OP-MCP6002", desc: "Dual Op-Amp MCP6002 1MHz Rail-Rail SOIC-8", cat: "Semiconductors", sub: "Op-Amps", vendor: "DigiSource Electronics", mfr: "Microchip", unit: "pcs", price: 0.42, stock: "in-stock", qty: 1430 },
  { sku: "DIO-1N4148", desc: "Switching Diode 1N4148 100V SOD-123", cat: "Semiconductors", sub: "Diodes", vendor: "RS Components", mfr: "Vishay", unit: "pcs", price: 0.04, stock: "in-stock", qty: 14200 },
  { sku: "CON-USBC-16P", desc: "USB-C Receptacle 16-pin SMD Mid-mount", cat: "Connectors", sub: "USB", vendor: "PCBWay Components", mfr: "GCT", unit: "pcs", price: 0.84, stock: "in-stock", qty: 920 },
  { sku: "CON-JST-PH-2", desc: "JST PH 2.0mm 2-pin Right Angle THT", cat: "Connectors", sub: "JST", vendor: "TaiwanTech Supply", mfr: "JST", unit: "pcs", price: 0.18, stock: "in-stock", qty: 3400 },
  { sku: "CON-HDR-2X20", desc: "Pin Header 2.54mm 2x20 Female Stacking", cat: "Connectors", sub: "Headers", vendor: "Shenzhen Direct", mfr: "Generic", unit: "pcs", price: 0.34, stock: "low-stock", qty: 184 },
  { sku: "CON-TB-3P-5MM", desc: "Terminal Block 3-pos 5.08mm Pluggable", cat: "Connectors", sub: "Terminal Blocks", vendor: "Farnell EU", mfr: "Phoenix Contact", unit: "pcs", price: 0.92, stock: "in-stock", qty: 1240 },
  { sku: "SW-TACT-6X6", desc: "Tactile Switch 6x6mm 5mm Through-hole", cat: "Electromechanical", sub: "Switches", vendor: "Shenzhen Direct", mfr: "Generic", unit: "pcs", price: 0.05, stock: "in-stock", qty: 9200 },
  { sku: "SW-SLIDE-SPDT", desc: "Slide Switch SPDT SMD Right-angle", cat: "Electromechanical", sub: "Switches", vendor: "DigiSource Electronics", mfr: "C&K", unit: "pcs", price: 0.46, stock: "in-stock", qty: 740 },
  { sku: "REL-SRD-5V", desc: "Relay SPDT 5V Coil 10A 250VAC", cat: "Electromechanical", sub: "Relays", vendor: "Arrow Northbridge", mfr: "Songle", unit: "pcs", price: 0.72, stock: "in-stock", qty: 480 },
  { sku: "ENC-EC11-20D", desc: "Rotary Encoder EC11 20-detent w/ Switch", cat: "Electromechanical", sub: "Encoders", vendor: "Mouser Components", mfr: "Bourns", unit: "pcs", price: 1.40, stock: "in-stock", qty: 320 },
  { sku: "BUZ-PSE-5V", desc: "Magnetic Buzzer 5V 85dB SMD", cat: "Electromechanical", sub: "Buzzers", vendor: "PCBWay Components", mfr: "PUI Audio", unit: "pcs", price: 0.62, stock: "in-stock", qty: 540 },
  { sku: "DCDC-MP1584", desc: "DC-DC Buck Converter MP1584 3A SOIC-8", cat: "Power", sub: "DC-DC Converters", vendor: "Mouser Components", mfr: "MPS", unit: "pcs", price: 0.88, stock: "in-stock", qty: 620 },
  { sku: "BAT-CR2032-HLD", desc: "CR2032 Coin Cell Holder THT", cat: "Power", sub: "Batteries", vendor: "Farnell EU", mfr: "Keystone", unit: "pcs", price: 0.34, stock: "in-stock", qty: 1820 },
  { sku: "PCB-STDOFF-M3-10", desc: "Brass Standoff M3 x 10mm M-F", cat: "PCB & Hardware", sub: "Standoffs", vendor: "RS Components", mfr: "Wurth", unit: "pcs", price: 0.21, stock: "in-stock", qty: 2400 },
  { sku: "PCB-SCR-M3-6", desc: "Machine Screw M3 x 6mm Phillips SS", cat: "PCB & Hardware", sub: "Screws", vendor: "RS Components", mfr: "Wurth", unit: "pcs", price: 0.04, stock: "in-stock", qty: 12000 },
  { sku: "ENC-ABS-100X68", desc: "ABS Project Enclosure 100x68x40mm Black", cat: "PCB & Hardware", sub: "Enclosures", vendor: "Farnell EU", mfr: "Hammond", unit: "pcs", price: 4.20, stock: "low-stock", qty: 88 },
  { sku: "HSK-TO220-12", desc: "Heatsink TO-220 Clip-on 12mm Black Anodized", cat: "PCB & Hardware", sub: "Heatsinks", vendor: "Arrow Northbridge", mfr: "Aavid", unit: "pcs", price: 0.68, stock: "in-stock", qty: 460 },
  { sku: "WIR-RIB-10C-1M", desc: "Ribbon Cable 10-conductor 1m Rainbow", cat: "Cables & Wires", sub: "Ribbon", vendor: "TaiwanTech Supply", mfr: "Generic", unit: "m", price: 0.38, stock: "in-stock", qty: 240 },
  { sku: "WIR-HK-22AWG-RED", desc: "Hookup Wire 22AWG Red Stranded 100ft", cat: "Cables & Wires", sub: "Hookup", vendor: "Mouser Components", mfr: "Alpha Wire", unit: "m", price: 0.21, stock: "in-stock", qty: 1840 },
  { sku: "FER-BLM18-600", desc: "Ferrite Bead 600Ω @ 100MHz 0603", cat: "Passive Components", sub: "Ferrites", vendor: "DigiSource Electronics", mfr: "Murata", unit: "pcs", price: 0.05, stock: "backorder", qty: 0 },
];

const PROJECTS = [
  { id: "p1", code: "NB-2412", name: "Northstar Beacon v3.2", owner: "M. Chen", lines: 47, total: 2840.50, status: "in-progress", updated: "2h ago", target: "May 14" },
  { id: "p2", code: "GW-2411", name: "Gateway Hub Rev B", owner: "S. Patel", lines: 82, total: 5120.40, status: "review", updated: "1d ago", target: "May 22" },
  { id: "p3", code: "SN-2410", name: "Sensor Node — Industrial", owner: "A. Rivera", lines: 34, total: 1240.80, status: "approved", updated: "3d ago", target: "Apr 30" },
  { id: "p4", code: "PWR-2410", name: "Power Module 24V/5A", owner: "M. Chen", lines: 28, total: 980.20, status: "in-progress", updated: "5d ago", target: "Jun 02" },
  { id: "p5", code: "DBG-2409", name: "Debug Probe Rev 1.4", owner: "K. Yamato", lines: 41, total: 1620.00, status: "approved", updated: "1w ago", target: "Apr 12" },
  { id: "p6", code: "RIO-2409", name: "Remote I/O Card", owner: "S. Patel", lines: 56, total: 3210.60, status: "draft", updated: "2w ago", target: "Jul 18" },
];

const HISTORY = [
  { id: "h1", code: "NB-2411", name: "Northstar Beacon v3.1", date: "Apr 24, 2026", lines: 46, total: 2740.00, by: "M. Chen", status: "exported" },
  { id: "h2", code: "GW-2410", name: "Gateway Hub Rev A", date: "Apr 18, 2026", lines: 79, total: 4920.10, by: "S. Patel", status: "exported" },
  { id: "h3", code: "SN-2409", name: "Sensor Node v2", date: "Apr 04, 2026", lines: 31, total: 1180.40, by: "A. Rivera", status: "exported" },
  { id: "h4", code: "DBG-2408", name: "Debug Probe Rev 1.3", date: "Mar 22, 2026", lines: 38, total: 1540.00, by: "K. Yamato", status: "exported" },
  { id: "h5", code: "TST-2408", name: "Test Jig — Beacon", date: "Mar 18, 2026", lines: 22, total: 640.20, by: "M. Chen", status: "archived" },
  { id: "h6", code: "PWR-2407", name: "Power Module Rev A", date: "Mar 02, 2026", lines: 24, total: 880.50, by: "M. Chen", status: "exported" },
];

// Initial BOM list (for the builder demo)
const INITIAL_BOM = [
  { sku: "MCU-STM32G0", qty: 1 },
  { sku: "REG-AMS1117-5V", qty: 2 },
  { sku: "CAP-0603-100N", qty: 18 },
  { sku: "CAP-0805-10U", qty: 6 },
  { sku: "RES-0603-4K7-1", qty: 12 },
  { sku: "RES-0805-10K-1", qty: 8 },
  { sku: "CON-USBC-16P", qty: 1 },
  { sku: "SW-TACT-6X6", qty: 4 },
  { sku: "DIO-1N4148", qty: 6 },
  { sku: "IND-1210-10U", qty: 2 },
];

Object.assign(window, { VENDORS, CATEGORIES, STOCK_STATES, ITEMS, PROJECTS, HISTORY, INITIAL_BOM });
