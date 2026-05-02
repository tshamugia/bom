ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.line.moved' BEFORE 'bom.export.generated';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.section.created' BEFORE 'approval.requested';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.section.renamed' BEFORE 'approval.requested';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.section.reordered' BEFORE 'approval.requested';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.section.deleted' BEFORE 'approval.requested';