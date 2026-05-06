import { pgEnum } from "drizzle-orm/pg-core";

export const vendorStatusEnum = pgEnum("vendor_status", [
  "preferred",
  "approved",
  "review",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "in-progress",
  "review",
  "approved",
]);

export const revisionStatusEnum = pgEnum("revision_status", [
  "draft",
  "committed",
  "in-progress",
  "review",
  "approved",
  "locked",
]);

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "member"]);
