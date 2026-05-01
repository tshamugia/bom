import { pgEnum } from "drizzle-orm/pg-core";

export const stockStateEnum = pgEnum("stock_state", [
  "in-stock",
  "low-stock",
  "backorder",
  "out-of-stock",
]);

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
  "in-progress",
  "review",
  "approved",
  "locked",
]);
