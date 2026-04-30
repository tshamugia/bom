import { db } from "./client";
import { organizations, vendors, categories, subcategories, items } from "./schema";
import { sql } from "drizzle-orm";

const VENDORS = [
  { name: "Mouser Components",     code: "MSR", country: "US", leadTime: "3-5d",  rating: 4.8, status: "preferred" as const, itemsCount: 412 },
  { name: "DigiSource Electronics",code: "DGS", country: "US", leadTime: "2-4d",  rating: 4.7, status: "preferred" as const, itemsCount: 388 },
  { name: "Arrow Northbridge",     code: "ARW", country: "US", leadTime: "5-7d",  rating: 4.5, status: "approved"  as const, itemsCount: 254 },
  { name: "Farnell EU",            code: "FNL", country: "UK", leadTime: "4-6d",  rating: 4.6, status: "approved"  as const, itemsCount: 301 },
  { name: "RS Components",         code: "RSC", country: "UK", leadTime: "5-8d",  rating: 4.4, status: "approved"  as const, itemsCount: 198 },
  { name: "TaiwanTech Supply",     code: "TWT", country: "TW", leadTime: "10-14d",rating: 4.2, status: "approved"  as const, itemsCount: 145 },
  { name: "Shenzhen Direct",       code: "SZD", country: "CN", leadTime: "12-18d",rating: 3.9, status: "review"    as const, itemsCount: 220 },
  { name: "PCBWay Components",     code: "PCB", country: "CN", leadTime: "10-15d",rating: 4.3, status: "approved"  as const, itemsCount: 167 },
];

const CATEGORIES: Array<{ name: string; subs: string[] }> = [
  { name: "Passive Components", subs: ["Resistors", "Capacitors", "Inductors", "Ferrites"] },
  { name: "Semiconductors",     subs: ["MCUs", "MOSFETs", "Diodes", "Voltage Regulators", "Op-Amps"] },
  { name: "Connectors",         subs: ["Headers", "USB", "JST", "Terminal Blocks", "RF"] },
  { name: "Electromechanical",  subs: ["Switches", "Relays", "Encoders", "Buzzers"] },
  { name: "Power",              subs: ["Batteries", "DC-DC Converters", "Linear Regulators", "Inductors"] },
  { name: "PCB & Hardware",     subs: ["Standoffs", "Screws", "Enclosures", "Heatsinks"] },
  { name: "Cables & Wires",     subs: ["Ribbon", "Hookup", "Coaxial", "Custom Harness"] },
];

const ITEMS = [
  { sku: "RES-0805-10K-1", desc: "Resistor 10kΩ 1% 0805 SMD", cat: "Passive Components", sub: "Resistors", vendor: "Mouser Components", mfr: "Yageo", unit: "pcs", price: "0.012", stock: "in-stock", qty: 5840 },
  { sku: "RES-0805-1K-1",  desc: "Resistor 1kΩ 1% 0805 SMD",  cat: "Passive Components", sub: "Resistors", vendor: "Mouser Components", mfr: "Yageo", unit: "pcs", price: "0.011", stock: "in-stock", qty: 12400 },
  { sku: "RES-0603-4K7-1", desc: "Resistor 4.7kΩ 1% 0603 SMD",cat: "Passive Components", sub: "Resistors", vendor: "DigiSource Electronics", mfr: "Panasonic", unit: "pcs", price: "0.009", stock: "in-stock", qty: 22000 },
  { sku: "CAP-0603-100N",  desc: "Capacitor 100nF X7R 50V 0603", cat: "Passive Components", sub: "Capacitors", vendor: "DigiSource Electronics", mfr: "Murata", unit: "pcs", price: "0.018", stock: "in-stock", qty: 18650 },
  { sku: "CAP-0805-10U",   desc: "Capacitor 10µF X5R 25V 0805",  cat: "Passive Components", sub: "Capacitors", vendor: "Mouser Components", mfr: "Samsung EM", unit: "pcs", price: "0.044", stock: "in-stock", qty: 9320 },
  { sku: "CAP-EL-470U",    desc: "Electrolytic Cap 470µF 35V Radial", cat: "Passive Components", sub: "Capacitors", vendor: "Farnell EU", mfr: "Nichicon", unit: "pcs", price: "0.32", stock: "low-stock", qty: 240 },
  { sku: "IND-1210-10U",   desc: "Power Inductor 10µH 2.1A 1210", cat: "Passive Components", sub: "Inductors", vendor: "Arrow Northbridge", mfr: "Coilcraft", unit: "pcs", price: "0.41", stock: "in-stock", qty: 1800 },
  { sku: "MCU-STM32G0",    desc: "STM32G031K8T6 ARM Cortex-M0+ 64KB", cat: "Semiconductors", sub: "MCUs", vendor: "Arrow Northbridge", mfr: "STMicro", unit: "pcs", price: "1.84", stock: "in-stock", qty: 412 },
  { sku: "MCU-ESP32-S3",   desc: "ESP32-S3-WROOM-1 Wi-Fi/BLE Module", cat: "Semiconductors", sub: "MCUs", vendor: "Mouser Components", mfr: "Espressif", unit: "pcs", price: "3.20", stock: "in-stock", qty: 680 },
  { sku: "MCU-RP2040",     desc: "RP2040 Dual-Core M0+ 133MHz QFN-56", cat: "Semiconductors", sub: "MCUs", vendor: "DigiSource Electronics", mfr: "Raspberry Pi", unit: "pcs", price: "0.98", stock: "in-stock", qty: 1240 },
  { sku: "FET-N-AO3400",   desc: "N-Channel MOSFET AO3400 30V 5.7A", cat: "Semiconductors", sub: "MOSFETs", vendor: "Shenzhen Direct", mfr: "Alpha & Omega", unit: "pcs", price: "0.06", stock: "in-stock", qty: 8400 },
  { sku: "REG-LM1117-3V3", desc: "LDO Regulator LM1117-3.3 800mA SOT-223", cat: "Semiconductors", sub: "Voltage Regulators", vendor: "Mouser Components", mfr: "TI", unit: "pcs", price: "0.38", stock: "in-stock", qty: 2100 },
  { sku: "REG-AMS1117-5V", desc: "LDO Regulator AMS1117-5.0 1A SOT-223", cat: "Semiconductors", sub: "Voltage Regulators", vendor: "TaiwanTech Supply", mfr: "AMS", unit: "pcs", price: "0.09", stock: "in-stock", qty: 6800 },
  { sku: "OP-MCP6002",     desc: "Dual Op-Amp MCP6002 1MHz Rail-Rail SOIC-8", cat: "Semiconductors", sub: "Op-Amps", vendor: "DigiSource Electronics", mfr: "Microchip", unit: "pcs", price: "0.42", stock: "in-stock", qty: 1430 },
  { sku: "DIO-1N4148",     desc: "Switching Diode 1N4148 100V SOD-123", cat: "Semiconductors", sub: "Diodes", vendor: "RS Components", mfr: "Vishay", unit: "pcs", price: "0.04", stock: "in-stock", qty: 14200 },
  { sku: "CON-USBC-16P",   desc: "USB-C Receptacle 16-pin SMD Mid-mount", cat: "Connectors", sub: "USB", vendor: "PCBWay Components", mfr: "GCT", unit: "pcs", price: "0.84", stock: "in-stock", qty: 920 },
  { sku: "CON-JST-PH-2",   desc: "JST PH 2.0mm 2-pin Right Angle THT", cat: "Connectors", sub: "JST", vendor: "TaiwanTech Supply", mfr: "JST", unit: "pcs", price: "0.18", stock: "in-stock", qty: 3400 },
  { sku: "CON-HDR-2X20",   desc: "Pin Header 2.54mm 2x20 Female Stacking", cat: "Connectors", sub: "Headers", vendor: "Shenzhen Direct", mfr: "Generic", unit: "pcs", price: "0.34", stock: "low-stock", qty: 184 },
  { sku: "CON-TB-3P-5MM",  desc: "Terminal Block 3-pos 5.08mm Pluggable", cat: "Connectors", sub: "Terminal Blocks", vendor: "Farnell EU", mfr: "Phoenix Contact", unit: "pcs", price: "0.92", stock: "in-stock", qty: 1240 },
  { sku: "SW-TACT-6X6",    desc: "Tactile Switch 6x6mm 5mm Through-hole", cat: "Electromechanical", sub: "Switches", vendor: "Shenzhen Direct", mfr: "Generic", unit: "pcs", price: "0.05", stock: "in-stock", qty: 9200 },
  { sku: "SW-SLIDE-SPDT",  desc: "Slide Switch SPDT SMD Right-angle", cat: "Electromechanical", sub: "Switches", vendor: "DigiSource Electronics", mfr: "C&K", unit: "pcs", price: "0.46", stock: "in-stock", qty: 740 },
  { sku: "REL-SRD-5V",     desc: "Relay SPDT 5V Coil 10A 250VAC", cat: "Electromechanical", sub: "Relays", vendor: "Arrow Northbridge", mfr: "Songle", unit: "pcs", price: "0.72", stock: "in-stock", qty: 480 },
  { sku: "ENC-EC11-20D",   desc: "Rotary Encoder EC11 20-detent w/ Switch", cat: "Electromechanical", sub: "Encoders", vendor: "Mouser Components", mfr: "Bourns", unit: "pcs", price: "1.40", stock: "in-stock", qty: 320 },
  { sku: "BUZ-PSE-5V",     desc: "Magnetic Buzzer 5V 85dB SMD", cat: "Electromechanical", sub: "Buzzers", vendor: "PCBWay Components", mfr: "PUI Audio", unit: "pcs", price: "0.62", stock: "in-stock", qty: 540 },
  { sku: "DCDC-MP1584",    desc: "DC-DC Buck Converter MP1584 3A SOIC-8", cat: "Power", sub: "DC-DC Converters", vendor: "Mouser Components", mfr: "MPS", unit: "pcs", price: "0.88", stock: "in-stock", qty: 620 },
  { sku: "BAT-CR2032-HLD", desc: "CR2032 Coin Cell Holder THT", cat: "Power", sub: "Batteries", vendor: "Farnell EU", mfr: "Keystone", unit: "pcs", price: "0.34", stock: "in-stock", qty: 1820 },
  { sku: "PCB-STDOFF-M3-10",desc:"Brass Standoff M3 x 10mm M-F", cat: "PCB & Hardware", sub: "Standoffs", vendor: "RS Components", mfr: "Wurth", unit: "pcs", price: "0.21", stock: "in-stock", qty: 2400 },
  { sku: "PCB-SCR-M3-6",   desc: "Machine Screw M3 x 6mm Phillips SS", cat: "PCB & Hardware", sub: "Screws", vendor: "RS Components", mfr: "Wurth", unit: "pcs", price: "0.04", stock: "in-stock", qty: 12000 },
  { sku: "ENC-ABS-100X68", desc: "ABS Project Enclosure 100x68x40mm Black", cat: "PCB & Hardware", sub: "Enclosures", vendor: "Farnell EU", mfr: "Hammond", unit: "pcs", price: "4.20", stock: "low-stock", qty: 88 },
  { sku: "HSK-TO220-12",   desc: "Heatsink TO-220 Clip-on 12mm Black Anodized", cat: "PCB & Hardware", sub: "Heatsinks", vendor: "Arrow Northbridge", mfr: "Aavid", unit: "pcs", price: "0.68", stock: "in-stock", qty: 460 },
  { sku: "WIR-RIB-10C-1M", desc: "Ribbon Cable 10-conductor 1m Rainbow", cat: "Cables & Wires", sub: "Ribbon", vendor: "TaiwanTech Supply", mfr: "Generic", unit: "m", price: "0.38", stock: "in-stock", qty: 240 },
  { sku: "WIR-HK-22AWG-RED",desc:"Hookup Wire 22AWG Red Stranded 100ft", cat: "Cables & Wires", sub: "Hookup", vendor: "Mouser Components", mfr: "Alpha Wire", unit: "m", price: "0.21", stock: "in-stock", qty: 1840 },
  { sku: "FER-BLM18-600",  desc: "Ferrite Bead 600Ω @ 100MHz 0603", cat: "Passive Components", sub: "Ferrites", vendor: "DigiSource Electronics", mfr: "Murata", unit: "pcs", price: "0.05", stock: "backorder", qty: 0 },
] as const;

async function main() {
  await db.execute(sql`TRUNCATE "item", "subcategory", "category", "vendor", "membership", "organization" RESTART IDENTITY CASCADE`);

  const [org] = await db.insert(organizations).values({ name: "Halcyon Robotics", slug: "halcyon" }).returning();

  const insertedVendors = await db
    .insert(vendors)
    .values(VENDORS.map(v => ({ ...v, organizationId: org.id })))
    .returning();
  const vByName = new Map(insertedVendors.map(v => [v.name, v.id]));

  const subByName = new Map<string, string>();
  for (const c of CATEGORIES) {
    const [cat] = await db.insert(categories).values({ name: c.name, organizationId: org.id }).returning();
    for (const sn of c.subs) {
      const [sub] = await db.insert(subcategories).values({ name: sn, categoryId: cat.id }).returning();
      subByName.set(`${c.name}::${sn}`, sub.id);
    }
  }
  const catByName = new Map(
    (await db.select().from(categories)).map(c => [c.name, c.id]),
  );

  await db.insert(items).values(
    ITEMS.map(it => ({
      organizationId: org.id,
      sku: it.sku,
      description: it.desc,
      manufacturer: it.mfr,
      unit: it.unit,
      unitPrice: it.price,
      onHand: it.qty,
      stockState: it.stock as any,
      vendorId: vByName.get(it.vendor) ?? null,
      categoryId: catByName.get(it.cat) ?? null,
      subcategoryId: subByName.get(`${it.cat}::${it.sub}`) ?? null,
    })),
  );

  console.log(`Seeded org=${org.id} with ${VENDORS.length} vendors, ${CATEGORIES.length} categories, ${ITEMS.length} items.`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
