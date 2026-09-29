/**
 * Shared catalog seed data (vendors, categories, ~100 equipment items across
 * Fire / El / BMS). Consumed by `seed-items.ts` in both reset and insert-only
 * modes so there is a single source of truth.
 */

export type VendorSeed = {
  code: string;
  name: string;
  country: string;
  leadTime: string;
  rating: number;
  status: "preferred" | "approved" | "review";
};

export const VENDORS: VendorSeed[] = [
  { code: "HON", name: "Honeywell", country: "USA", leadTime: "4-6 weeks", rating: 4.7, status: "preferred" },
  { code: "SIE", name: "Siemens", country: "Germany", leadTime: "6-8 weeks", rating: 4.8, status: "preferred" },
  { code: "SCH", name: "Schneider Electric", country: "France", leadTime: "3-5 weeks", rating: 4.6, status: "preferred" },
  { code: "ABB", name: "ABB", country: "Switzerland", leadTime: "5-7 weeks", rating: 4.5, status: "approved" },
  { code: "BOS", name: "Bosch Security", country: "Germany", leadTime: "4-6 weeks", rating: 4.4, status: "approved" },
  { code: "JCI", name: "Johnson Controls", country: "Ireland", leadTime: "6-8 weeks", rating: 4.3, status: "approved" },
  { code: "LEG", name: "Legrand", country: "France", leadTime: "3-4 weeks", rating: 4.4, status: "approved" },
  { code: "TYC", name: "Tyco / Johnson Controls", country: "USA", leadTime: "5-7 weeks", rating: 4.2, status: "approved" },
  { code: "KNX", name: "KNX Systems Ltd", country: "UK", leadTime: "2-4 weeks", rating: 4.0, status: "review" },
  { code: "PHO", name: "Phoenix Contact", country: "Germany", leadTime: "3-5 weeks", rating: 4.5, status: "approved" },
];

export type CategorySeed = {
  name: string;
  subcategories: string[];
};

export const CATEGORIES: CategorySeed[] = [
  { name: "Fire", subcategories: ["Detection", "Alarm & Notification", "Control Panels", "Suppression"] },
  { name: "El", subcategories: ["Distribution", "Protection", "Cabling", "Wiring Devices", "Lighting"] },
  { name: "BMS", subcategories: ["Controllers", "Sensors", "Actuators & Valves", "Network & Gateways"] },
];

export type ItemSeed = {
  sku: string;
  description: string;
  manufacturer: string;
  unit: string;
  category: string;
  subcategory: string;
  vendor: string; // vendor code
};

export const ITEMS: ItemSeed[] = [
  // ---------------------------------------------------------------- Fire (34)
  { sku: "FD-SMK-2251", description: "Photoelectric smoke detector, addressable, 2-wire", manufacturer: "Notifier", unit: "pcs", category: "Fire", subcategory: "Detection", vendor: "HON" },
  { sku: "FD-SMK-CPX", description: "Conventional optical smoke detector", manufacturer: "Notifier", unit: "pcs", category: "Fire", subcategory: "Detection", vendor: "HON" },
  { sku: "FD-HEAT-5251", description: "Fixed temperature heat detector 57°C, addressable", manufacturer: "Notifier", unit: "pcs", category: "Fire", subcategory: "Detection", vendor: "HON" },
  { sku: "FD-HEAT-ROR", description: "Rate-of-rise heat detector, conventional", manufacturer: "System Sensor", unit: "pcs", category: "Fire", subcategory: "Detection", vendor: "HON" },
  { sku: "FD-MULTI-2351", description: "Multi-criteria smoke + heat detector", manufacturer: "System Sensor", unit: "pcs", category: "Fire", subcategory: "Detection", vendor: "HON" },
  { sku: "FD-BEAM-6500", description: "Reflective optical beam smoke detector, 5-100m", manufacturer: "Fireray", unit: "pcs", category: "Fire", subcategory: "Detection", vendor: "TYC" },
  { sku: "FD-ASP-VLF", description: "Aspirating smoke detection unit, single pipe", manufacturer: "Vesda", unit: "pcs", category: "Fire", subcategory: "Detection", vendor: "TYC" },
  { sku: "FD-CO-DET", description: "Carbon monoxide fire detector, addressable", manufacturer: "System Sensor", unit: "pcs", category: "Fire", subcategory: "Detection", vendor: "HON" },
  { sku: "FD-FLAME-IR3", description: "Triple-IR flame detector, ATEX", manufacturer: "Spectrex", unit: "pcs", category: "Fire", subcategory: "Detection", vendor: "BOS" },
  { sku: "FD-DUCT-DNR", description: "Duct smoke detector housing with sampling tube", manufacturer: "System Sensor", unit: "pcs", category: "Fire", subcategory: "Detection", vendor: "HON" },
  { sku: "FD-LHDT-155", description: "Linear heat detection cable 155°F, 100m reel", manufacturer: "Protectowire", unit: "roll", category: "Fire", subcategory: "Detection", vendor: "TYC" },
  { sku: "FA-MCP-KAC", description: "Manual call point, break-glass, addressable", manufacturer: "KAC", unit: "pcs", category: "Fire", subcategory: "Alarm & Notification", vendor: "HON" },
  { sku: "FA-MCP-RES", description: "Resettable manual call point, red", manufacturer: "KAC", unit: "pcs", category: "Fire", subcategory: "Alarm & Notification", vendor: "HON" },
  { sku: "FA-SND-WALL", description: "Wall-mount fire sounder, 100dB, red", manufacturer: "Klaxon", unit: "pcs", category: "Fire", subcategory: "Alarm & Notification", vendor: "BOS" },
  { sku: "FA-SNDVIS-RED", description: "Combined sounder / beacon, red, EN54-23", manufacturer: "Klaxon", unit: "pcs", category: "Fire", subcategory: "Alarm & Notification", vendor: "BOS" },
  { sku: "FA-BEACON-W", description: "Wall VAD strobe beacon, white flash, EN54-23", manufacturer: "Cooper", unit: "pcs", category: "Fire", subcategory: "Alarm & Notification", vendor: "TYC" },
  { sku: "FA-VOICE-SPK", description: "Ceiling voice alarm loudspeaker 6W, EN54-24", manufacturer: "Bosch", unit: "pcs", category: "Fire", subcategory: "Alarm & Notification", vendor: "BOS" },
  { sku: "FA-BELL-6IN", description: "6-inch fire alarm bell, 24VDC", manufacturer: "System Sensor", unit: "pcs", category: "Fire", subcategory: "Alarm & Notification", vendor: "HON" },
  { sku: "FA-STROBE-CLG", description: "Ceiling strobe, 15/30/75/110 cd selectable", manufacturer: "System Sensor", unit: "pcs", category: "Fire", subcategory: "Alarm & Notification", vendor: "HON" },
  { sku: "FP-PANEL-2L", description: "Addressable fire alarm control panel, 2-loop", manufacturer: "Notifier", unit: "pcs", category: "Fire", subcategory: "Control Panels", vendor: "HON" },
  { sku: "FP-PANEL-8L", description: "Addressable fire alarm control panel, 8-loop", manufacturer: "Notifier", unit: "pcs", category: "Fire", subcategory: "Control Panels", vendor: "HON" },
  { sku: "FP-REPEAT", description: "Fire panel repeater / mimic terminal", manufacturer: "Notifier", unit: "pcs", category: "Fire", subcategory: "Control Panels", vendor: "HON" },
  { sku: "FP-PSU-5A", description: "EN54-4 monitored PSU, 5A boxed with batteries", manufacturer: "Elmdene", unit: "pcs", category: "Fire", subcategory: "Control Panels", vendor: "TYC" },
  { sku: "FP-IO-MOD", description: "Addressable input/output interface module", manufacturer: "Notifier", unit: "pcs", category: "Fire", subcategory: "Control Panels", vendor: "HON" },
  { sku: "FP-ZONE-MON", description: "Addressable zone monitor module, single", manufacturer: "Notifier", unit: "pcs", category: "Fire", subcategory: "Control Panels", vendor: "HON" },
  { sku: "FP-BATT-12A", description: "12V 12Ah sealed lead-acid standby battery", manufacturer: "Yuasa", unit: "pcs", category: "Fire", subcategory: "Control Panels", vendor: "TYC" },
  { sku: "FS-SPRK-PEN", description: "Pendant sprinkler head 68°C, K80, brass", manufacturer: "Tyco", unit: "pcs", category: "Fire", subcategory: "Suppression", vendor: "TYC" },
  { sku: "FS-SPRK-UPR", description: "Upright sprinkler head 68°C, K80", manufacturer: "Tyco", unit: "pcs", category: "Fire", subcategory: "Suppression", vendor: "TYC" },
  { sku: "FS-SPRK-SW", description: "Sidewall sprinkler head 68°C, chrome", manufacturer: "Viking", unit: "pcs", category: "Fire", subcategory: "Suppression", vendor: "TYC" },
  { sku: "FS-VALVE-ALM", description: "Wet alarm check valve DN100 with trim", manufacturer: "Viking", unit: "pcs", category: "Fire", subcategory: "Suppression", vendor: "TYC" },
  { sku: "FS-FLOW-SW", description: "Vane-type waterflow switch DN50-200", manufacturer: "System Sensor", unit: "pcs", category: "Fire", subcategory: "Suppression", vendor: "HON" },
  { sku: "FS-EXT-CO2", description: "CO2 fire extinguisher 5kg with wall bracket", manufacturer: "Amerex", unit: "pcs", category: "Fire", subcategory: "Suppression", vendor: "TYC" },
  { sku: "FS-EXT-ABC", description: "ABC dry-powder fire extinguisher 6kg", manufacturer: "Amerex", unit: "pcs", category: "Fire", subcategory: "Suppression", vendor: "TYC" },
  { sku: "FS-HOSE-REEL", description: "Automatic fire hose reel, 30m, swinging arm", manufacturer: "Angus", unit: "pcs", category: "Fire", subcategory: "Suppression", vendor: "TYC" },

  // ------------------------------------------------------------ El / Electrical (34)
  { sku: "EL-MCB-C16", description: "MCB single-pole 16A curve C, 6kA", manufacturer: "Schneider", unit: "pcs", category: "El", subcategory: "Protection", vendor: "SCH" },
  { sku: "EL-MCB-C32", description: "MCB single-pole 32A curve C, 6kA", manufacturer: "Schneider", unit: "pcs", category: "El", subcategory: "Protection", vendor: "SCH" },
  { sku: "EL-MCB-B10-3P", description: "MCB three-pole 10A curve B, 10kA", manufacturer: "ABB", unit: "pcs", category: "El", subcategory: "Protection", vendor: "ABB" },
  { sku: "EL-RCD-40-30", description: "RCD 2-pole 40A 30mA type A", manufacturer: "Schneider", unit: "pcs", category: "El", subcategory: "Protection", vendor: "SCH" },
  { sku: "EL-RCBO-16", description: "RCBO 16A 30mA type A, 1P+N", manufacturer: "Hager", unit: "pcs", category: "El", subcategory: "Protection", vendor: "LEG" },
  { sku: "EL-MCCB-160", description: "MCCB 3-pole 160A adjustable, 36kA", manufacturer: "ABB", unit: "pcs", category: "El", subcategory: "Protection", vendor: "ABB" },
  { sku: "EL-SPD-T2", description: "Surge protection device type 2, 3P+N 40kA", manufacturer: "Schneider", unit: "pcs", category: "El", subcategory: "Protection", vendor: "SCH" },
  { sku: "EL-FUSE-63", description: "NH00 fuse link 63A gG 500V", manufacturer: "ABB", unit: "pcs", category: "El", subcategory: "Protection", vendor: "ABB" },
  { sku: "EL-CONT-25", description: "Contactor 3-pole 25A AC-3, 230V coil", manufacturer: "Schneider", unit: "pcs", category: "El", subcategory: "Protection", vendor: "SCH" },
  { sku: "EL-OLR-16", description: "Thermal overload relay 9-13A", manufacturer: "ABB", unit: "pcs", category: "El", subcategory: "Protection", vendor: "ABB" },
  { sku: "EL-DB-12W", description: "Distribution board 12-way flush, IP30", manufacturer: "Hager", unit: "pcs", category: "El", subcategory: "Distribution", vendor: "LEG" },
  { sku: "EL-DB-24W", description: "Distribution board 24-way surface, IP40", manufacturer: "Hager", unit: "pcs", category: "El", subcategory: "Distribution", vendor: "LEG" },
  { sku: "EL-PANEL-MDB", description: "Main distribution board enclosure 800x2000mm", manufacturer: "Rittal", unit: "pcs", category: "El", subcategory: "Distribution", vendor: "PHO" },
  { sku: "EL-BUSBAR-250", description: "Copper busbar chamber 250A, 4-pole", manufacturer: "ABB", unit: "m", category: "El", subcategory: "Distribution", vendor: "ABB" },
  { sku: "EL-ISO-63-4P", description: "Rotary isolator switch 63A 4-pole, IP65", manufacturer: "ABB", unit: "pcs", category: "El", subcategory: "Distribution", vendor: "ABB" },
  { sku: "EL-METER-3P", description: "3-phase DIN energy meter, MID, Modbus", manufacturer: "Schneider", unit: "pcs", category: "El", subcategory: "Distribution", vendor: "SCH" },
  { sku: "EL-CBL-2.5", description: "Cable XLPE/PVC 3-core 2.5mm², 450/750V", manufacturer: "Prysmian", unit: "m", category: "El", subcategory: "Cabling", vendor: "PHO" },
  { sku: "EL-CBL-4.0", description: "Cable XLPE/PVC 3-core 4.0mm²", manufacturer: "Prysmian", unit: "m", category: "El", subcategory: "Cabling", vendor: "PHO" },
  { sku: "EL-CBL-SWA16", description: "SWA armoured cable 4-core 16mm²", manufacturer: "Prysmian", unit: "m", category: "El", subcategory: "Cabling", vendor: "PHO" },
  { sku: "EL-CBL-FP200", description: "Fire-rated cable FP200 2-core 1.5mm²", manufacturer: "Prysmian", unit: "m", category: "El", subcategory: "Cabling", vendor: "PHO" },
  { sku: "EL-TRAY-300", description: "Cable tray hot-dip galvanised 300mm, 3m", manufacturer: "Legrand", unit: "pcs", category: "El", subcategory: "Cabling", vendor: "LEG" },
  { sku: "EL-TRUNK-100", description: "PVC trunking 100x50mm with lid, 3m", manufacturer: "Legrand", unit: "pcs", category: "El", subcategory: "Cabling", vendor: "LEG" },
  { sku: "EL-COND-25", description: "Galvanised steel conduit 25mm, 3m", manufacturer: "Legrand", unit: "pcs", category: "El", subcategory: "Cabling", vendor: "LEG" },
  { sku: "EL-GLAND-20", description: "Brass cable gland M20 with locknut, IP68", manufacturer: "CMP", unit: "pcs", category: "El", subcategory: "Cabling", vendor: "PHO" },
  { sku: "EL-SOCK-2G", description: "Twin switched socket 13A with USB, white", manufacturer: "MK Electric", unit: "pcs", category: "El", subcategory: "Wiring Devices", vendor: "LEG" },
  { sku: "EL-SOCK-IND", description: "Industrial socket 32A 3P+N+E, IP44", manufacturer: "Legrand", unit: "pcs", category: "El", subcategory: "Wiring Devices", vendor: "LEG" },
  { sku: "EL-SW-1G2W", description: "1-gang 2-way light switch 10A, white", manufacturer: "MK Electric", unit: "pcs", category: "El", subcategory: "Wiring Devices", vendor: "LEG" },
  { sku: "EL-SW-DIM", description: "Rotary LED dimmer switch 5-250W", manufacturer: "Legrand", unit: "pcs", category: "El", subcategory: "Wiring Devices", vendor: "LEG" },
  { sku: "EL-FCU-13", description: "Fused connection unit 13A switched", manufacturer: "MK Electric", unit: "pcs", category: "El", subcategory: "Wiring Devices", vendor: "LEG" },
  { sku: "EL-JB-IP66", description: "Junction box IP66 100x100mm with terminals", manufacturer: "Wiska", unit: "pcs", category: "El", subcategory: "Wiring Devices", vendor: "PHO" },
  { sku: "EL-LUM-LED60", description: "LED panel luminaire 600x600 40W 4000K", manufacturer: "Philips", unit: "pcs", category: "El", subcategory: "Lighting", vendor: "SCH" },
  { sku: "EL-LUM-BATN", description: "LED batten fitting 1.5m 50W IP65", manufacturer: "Philips", unit: "pcs", category: "El", subcategory: "Lighting", vendor: "SCH" },
  { sku: "EL-LUM-DOWN", description: "LED downlight 15W dimmable 3000K, IP44", manufacturer: "Philips", unit: "pcs", category: "El", subcategory: "Lighting", vendor: "SCH" },
  { sku: "EL-EMER-EXIT", description: "Emergency exit sign LED, maintained 3h", manufacturer: "Thorn", unit: "pcs", category: "El", subcategory: "Lighting", vendor: "SCH" },

  // ------------------------------------------------------------------- BMS (33)
  { sku: "BMS-DDC-32", description: "DDC controller 32 I/O, BACnet MS/TP", manufacturer: "Siemens", unit: "pcs", category: "BMS", subcategory: "Controllers", vendor: "SIE" },
  { sku: "BMS-DDC-16", description: "Programmable controller 16 I/O, BACnet IP", manufacturer: "Siemens", unit: "pcs", category: "BMS", subcategory: "Controllers", vendor: "SIE" },
  { sku: "BMS-VAV-CTRL", description: "VAV terminal controller with actuator", manufacturer: "Johnson Controls", unit: "pcs", category: "BMS", subcategory: "Controllers", vendor: "JCI" },
  { sku: "BMS-FCU-CTRL", description: "Fan coil unit controller, 3-speed", manufacturer: "Siemens", unit: "pcs", category: "BMS", subcategory: "Controllers", vendor: "SIE" },
  { sku: "BMS-ROOM-UNIT", description: "Room operator unit with LCD, temp+setpoint", manufacturer: "Siemens", unit: "pcs", category: "BMS", subcategory: "Controllers", vendor: "SIE" },
  { sku: "BMS-IO-8UI", description: "Expansion I/O module 8 universal inputs", manufacturer: "Distech", unit: "pcs", category: "BMS", subcategory: "Controllers", vendor: "JCI" },
  { sku: "BMS-IO-8DO", description: "Expansion module 8 relay outputs", manufacturer: "Distech", unit: "pcs", category: "BMS", subcategory: "Controllers", vendor: "JCI" },
  { sku: "BMS-PLANT-CTRL", description: "Plant controller, 100-point, web server", manufacturer: "Siemens", unit: "pcs", category: "BMS", subcategory: "Controllers", vendor: "SIE" },
  { sku: "BMS-TS-DUCT", description: "Duct temperature sensor, Pt1000, 200mm", manufacturer: "Siemens", unit: "pcs", category: "BMS", subcategory: "Sensors", vendor: "SIE" },
  { sku: "BMS-TS-IMM", description: "Immersion temperature sensor with pocket", manufacturer: "Siemens", unit: "pcs", category: "BMS", subcategory: "Sensors", vendor: "SIE" },
  { sku: "BMS-TS-ROOM", description: "Room temperature sensor NTC10K, flush", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Sensors", vendor: "JCI" },
  { sku: "BMS-TS-OUT", description: "Outside air temperature sensor, IP65", manufacturer: "Siemens", unit: "pcs", category: "BMS", subcategory: "Sensors", vendor: "SIE" },
  { sku: "BMS-HS-DUCT", description: "Duct humidity + temperature sensor 0-10V", manufacturer: "Siemens", unit: "pcs", category: "BMS", subcategory: "Sensors", vendor: "SIE" },
  { sku: "BMS-CO2-ROOM", description: "Room CO2 sensor 0-2000ppm, 0-10V/Modbus", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Sensors", vendor: "JCI" },
  { sku: "BMS-DP-AIR", description: "Air differential pressure sensor 0-1000Pa", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Sensors", vendor: "JCI" },
  { sku: "BMS-DP-SW", description: "Air differential pressure switch, adjustable", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Sensors", vendor: "JCI" },
  { sku: "BMS-FLOW-WTR", description: "Ultrasonic water flow sensor DN50, Modbus", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Sensors", vendor: "JCI" },
  { sku: "BMS-OCC-PIR", description: "Ceiling occupancy PIR sensor, BACnet", manufacturer: "Distech", unit: "pcs", category: "BMS", subcategory: "Sensors", vendor: "JCI" },
  { sku: "BMS-LUX-SEN", description: "Light level sensor 0-2000 lux, 0-10V", manufacturer: "Distech", unit: "pcs", category: "BMS", subcategory: "Sensors", vendor: "JCI" },
  { sku: "BMS-ACT-DMP", description: "Damper actuator 10Nm, 0-10V, spring return", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Actuators & Valves", vendor: "JCI" },
  { sku: "BMS-ACT-DMP20", description: "Damper actuator 20Nm, modulating, non-spring", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Actuators & Valves", vendor: "JCI" },
  { sku: "BMS-VLV-2W15", description: "2-way control valve DN15 Kvs 2.5, PN16", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Actuators & Valves", vendor: "JCI" },
  { sku: "BMS-VLV-3W25", description: "3-way control valve DN25 Kvs 10, PN16", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Actuators & Valves", vendor: "JCI" },
  { sku: "BMS-VLV-ACT", description: "Valve actuator 0-10V modulating, 500N", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Actuators & Valves", vendor: "JCI" },
  { sku: "BMS-PICV-20", description: "Pressure independent control valve DN20", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Actuators & Valves", vendor: "JCI" },
  { sku: "BMS-VLV-ZONE", description: "Motorised zone valve 2-port 22mm", manufacturer: "Honeywell", unit: "pcs", category: "BMS", subcategory: "Actuators & Valves", vendor: "HON" },
  { sku: "BMS-ACT-VAV", description: "VAV box damper actuator, fast-running", manufacturer: "Belimo", unit: "pcs", category: "BMS", subcategory: "Actuators & Valves", vendor: "JCI" },
  { sku: "BMS-GW-BAC", description: "BACnet/IP to MS/TP router / gateway", manufacturer: "Siemens", unit: "pcs", category: "BMS", subcategory: "Network & Gateways", vendor: "SIE" },
  { sku: "BMS-GW-MOD", description: "Modbus RTU to BACnet gateway, 60 devices", manufacturer: "Intesis", unit: "pcs", category: "BMS", subcategory: "Network & Gateways", vendor: "KNX" },
  { sku: "BMS-KNX-IP", description: "KNX/IP interface router, secure", manufacturer: "KNX", unit: "pcs", category: "BMS", subcategory: "Network & Gateways", vendor: "KNX" },
  { sku: "BMS-SW-8P", description: "Managed industrial ethernet switch 8-port", manufacturer: "Phoenix Contact", unit: "pcs", category: "BMS", subcategory: "Network & Gateways", vendor: "PHO" },
  { sku: "BMS-SVR-WEB", description: "BMS web supervisor server, 500 points", manufacturer: "Tridium", unit: "pcs", category: "BMS", subcategory: "Network & Gateways", vendor: "JCI" },
  { sku: "BMS-PSU-24DC", description: "24VDC power supply 5A DIN-rail, regulated", manufacturer: "Phoenix Contact", unit: "pcs", category: "BMS", subcategory: "Network & Gateways", vendor: "PHO" },
];
