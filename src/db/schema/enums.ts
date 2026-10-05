import { pgEnum } from "drizzle-orm/pg-core";
import { REVISION_STATUSES } from "../../lib/bom-status";

export const vendorStatusEnum = pgEnum("vendor_status", [
  "preferred",
  "approved",
  "review",
]);

export const revisionStatusEnum = pgEnum("revision_status", REVISION_STATUSES);

export const userRoleEnum = pgEnum("user_role", ["admin", "member", "viewer"]);
