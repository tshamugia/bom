-- BOM revisions move to the drawing standard's P/C labels (NAMING §6), stored in "letter":
-- the first revision the client approved becomes C01 and every revision after it continues
-- the C series; the ones before it become P01, P02…  Only numeric letters (migration 0030) change.
WITH first_c AS (
  SELECT "bom_id", min("letter"::int) AS "n"
  FROM "bom_revision"
  WHERE "letter" ~ '^[0-9]+$' AND "status" IN ('approved', 'locked')
  GROUP BY "bom_id"
)
UPDATE "bom_revision" r
SET "letter" = CASE
  WHEN f."n" IS NOT NULL AND r."letter"::int >= f."n"
    THEN 'C' || lpad((r."letter"::int - f."n" + 1)::text, greatest(2, length((r."letter"::int - f."n" + 1)::text)), '0')
  ELSE 'P' || lpad(r."letter", greatest(2, length(r."letter")), '0')
END
FROM "bom_revision" r2
LEFT JOIN first_c f ON f."bom_id" = r2."bom_id"
WHERE r."id" = r2."id" AND r."letter" ~ '^[0-9]+$';
