ALTER TABLE "drawing_file" ADD COLUMN "revision_label" text;--> statement-breakpoint
ALTER TABLE "drawing_revision" ADD COLUMN "c_number" integer;--> statement-breakpoint
ALTER TABLE "drawing_revision" ADD COLUMN "label" text GENERATED ALWAYS AS (CASE WHEN "c_number" IS NOT NULL THEN 'C' || lpad("c_number"::text, greatest(2, length("c_number"::text)), '0') ELSE 'P' || lpad("number"::text, greatest(2, length("number"::text)), '0') END) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "drawing_transmittal" ADD COLUMN "revision_label" text;--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_rev_drawing_c_number_uq" ON "drawing_revision" USING btree ("drawing_id","c_number") WHERE "c_number" IS NOT NULL;--> statement-breakpoint
-- NAMING §6: the first revision that reached Approved A/B or As Built becomes C01, and every
-- later revision continues the C series. Revisions before it stay P01, P02… (their number).
WITH first_c AS (
  SELECT "drawing_id", min("number") AS "n"
  FROM "drawing_revision"
  WHERE "status" IN ('approved-a', 'approved-b', 'as-built')
  GROUP BY "drawing_id"
)
UPDATE "drawing_revision" r
SET "c_number" = r."number" - f."n" + 1
FROM first_c f
WHERE r."drawing_id" = f."drawing_id" AND r."number" >= f."n";--> statement-breakpoint
-- Transmittals and PDFs keep the label they went out under: the approved revision itself (C01)
-- was still P until its approval, so anything issued before that moment says P.
UPDATE "drawing_transmittal" t
SET "revision_label" = CASE
  WHEN r."c_number" IS NULL OR r."c_number" > 1 THEN r."label"
  WHEN EXISTS (
    SELECT 1 FROM "drawing_event" e
    WHERE e."revision_id" = r."id" AND e."kind" = 'status'
      AND e."to_status" IN ('approved-a', 'approved-b', 'as-built') AND e."created_at" <= t."created_at"
  ) THEN r."label"
  ELSE 'P' || lpad(r."number"::text, greatest(2, length(r."number"::text)), '0')
END
FROM "drawing_revision" r
WHERE r."id" = t."revision_id";--> statement-breakpoint
UPDATE "drawing_file" f
SET "revision_label" = CASE
  WHEN r."c_number" IS NULL OR r."c_number" > 1 THEN r."label"
  WHEN EXISTS (
    SELECT 1 FROM "drawing_event" e
    WHERE e."revision_id" = r."id" AND e."kind" = 'status'
      AND e."to_status" IN ('approved-a', 'approved-b', 'as-built') AND e."created_at" <= coalesce(f."uploaded_at", f."created_at")
  ) THEN r."label"
  ELSE 'P' || lpad(r."number"::text, greatest(2, length(r."number"::text)), '0')
END
FROM "drawing_revision" r
WHERE r."id" = f."revision_id";
