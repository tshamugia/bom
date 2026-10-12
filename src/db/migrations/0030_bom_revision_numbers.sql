-- BOM revisions are numbered like drawing revisions (Rev1, Rev2…) instead of lettered (A, B…).
-- A→1 … Z→26, AA→27 …: the same order, and still unique per BOM.
UPDATE "bom_revision"
SET "letter" = CASE
  WHEN length("letter") = 1 THEN (ascii("letter") - 64)::text
  ELSE ((ascii(substr("letter", 1, 1)) - 64) * 26 + ascii(substr("letter", 2, 1)) - 64)::text
END
WHERE "letter" ~ '^[A-Z]{1,2}$';
