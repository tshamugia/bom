// What seed-e2e.ts creates, shared with the specs so names and codes stay in one place.
// Every project name starts with "E2E ": the seed deletes and recreates exactly those.

export type E2EScenario = {
  key: "builder" | "sections" | "columns" | "versioning" | "preview" | "approval";
  project: string;
  projectCode: string;
  bom: string;
  lines: { sku: string; qty: number }[];
};

const LINES = [
  { sku: "BMS-DDC-16", qty: 2 },
  { sku: "BMS-TS-ROOM", qty: 12 },
  { sku: "BMS-PSU-24DC", qty: 2 },
];

export const E2E_SCENARIOS: E2EScenario[] = [
  { key: "builder", project: "E2E Builder", projectCode: "E2E-001", bom: "Builder BOM", lines: LINES },
  { key: "sections", project: "E2E Sections", projectCode: "E2E-002", bom: "Sections BOM", lines: LINES },
  { key: "columns", project: "E2E Columns", projectCode: "E2E-003", bom: "Columns BOM", lines: LINES },
  { key: "versioning", project: "E2E Versioning", projectCode: "E2E-004", bom: "Versioning BOM", lines: LINES },
  { key: "preview", project: "E2E Preview", projectCode: "E2E-005", bom: "Preview BOM", lines: LINES },
  { key: "approval", project: "E2E Approval", projectCode: "E2E-006", bom: "Approval BOM", lines: LINES },
];

export function scenario(key: E2EScenario["key"]): E2EScenario {
  return E2E_SCENARIOS.find(s => s.key === key)!;
}

/** A catalog item the specs add to a BOM through the builder's search (not in LINES). */
export const ADD_ITEM = { sku: "BMS-KNX-IP", description: "KNX/IP interface router" };

/**
 * Drawings for drawings-shared.spec.ts (shared remark and shared time, issue #17):
 * three in one project and one in another, each with revision P01. Their names
 * all contain "E2E Shared", so the spec filters the register down to them.
 */
export const E2E_DRAWINGS = {
  project: "E2E Drawings",
  projectCode: "E2E-007",
  drawings: [
    { code: "SHR-001", name: "E2E Shared cameras L1" },
    { code: "SHR-002", name: "E2E Shared cameras L2" },
    { code: "SHR-003", name: "E2E Shared cameras L3" },
  ],
  otherProject: "E2E Drawings Other",
  otherProjectCode: "E2E-008",
  other: { code: "SHL-001", name: "E2E Shared lobby" },
};
