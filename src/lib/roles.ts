export const USER_ROLES = ["admin", "member", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles that may create or change data; everyone else is read-only. */
export const EDITOR_ROLES = ["admin", "member"] as const satisfies readonly UserRole[];

/** Anything that isn't explicitly an admin or a viewer is treated as a member. */
export function roleOf(user: { role?: unknown } | null | undefined): UserRole {
  if (user?.role === "admin") return "admin";
  if (user?.role === "viewer") return "viewer";
  return "member";
}

export function isAdmin(user: { role?: unknown } | null | undefined): boolean {
  return roleOf(user) === "admin";
}

/** Viewers (site managers, PMs) can look at everything but change nothing. */
export function canEdit(user: { role?: unknown } | null | undefined): boolean {
  return roleOf(user) !== "viewer";
}

/** Returned by `{ ok, error }`-style actions when a member tries an admin-only change. */
export const ADMIN_ONLY_ERROR = "Only an admin can do this.";

/** Returned by `{ ok, error }`-style actions when a viewer tries to change anything. */
export const READ_ONLY_ERROR = "Viewers have read-only access.";
