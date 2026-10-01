import type { AuditKind } from "@/server/queries/audit";

/**
 * Security and administration events. They only appear on the admin Audit log
 * page (/audit), never in History → Activity.
 */
export const ADMIN_ONLY_KINDS = [
  "auth.signin",
  "auth.signin.failed",
  "user.created",
  "user.disabled",
  "user.role.changed",
  "user.password.changed",
  "user.password.reset",
  "user.password.reset.requested",
  "settings.procurement.updated",
  // Every time someone opens a drawing PDF — kept for document control, too noisy for Activity.
  "drawing.file.downloaded",
] as const satisfies readonly AuditKind[];

const ADMIN_ONLY = new Set<string>(ADMIN_ONLY_KINDS);

export function isAdminOnlyKind(kind: AuditKind): boolean {
  return ADMIN_ONLY.has(kind);
}

/** Everything that removes, archives or discards something. */
export const DELETION_KINDS = [
  "project.deleted",
  "bom.deleted",
  "drawing.deleted",
  "vendor.deleted",
  "item.deleted",
  "bom.line.removed",
  "bom.section.deleted",
  "bom.revision.discarded",
  "bom.drawing.unlinked",
  "drawing.time.deleted",
  "drawing.file.removed",
  "approval.cancelled",
] as const satisfies readonly AuditKind[];

export const SETTINGS_KINDS = [
  "settings.procurement.updated",
  "drawing.settings.updated",
] as const satisfies readonly AuditKind[];

export type AuditPreset = "all" | "deletions" | "security" | "users" | "settings";

export const AUDIT_PRESETS: Array<{ id: AuditPreset; label: string; kinds: readonly AuditKind[] | null }> = [
  { id: "all", label: "All events", kinds: null },
  { id: "deletions", label: "Deletions", kinds: DELETION_KINDS },
  {
    id: "security",
    label: "Sign-ins & passwords",
    kinds: ["auth.signin", "auth.signin.failed", "user.password.changed", "user.password.reset", "user.password.reset.requested"],
  },
  { id: "users", label: "Users & roles", kinds: ["user.created", "user.disabled", "user.role.changed"] },
  { id: "settings", label: "Settings", kinds: SETTINGS_KINDS },
];
