/** The constraint (or unique index) a Postgres error names, wrapped or not. */
export function constraintName(e: unknown): string | null {
  const name = (x: unknown) =>
    typeof x === "object" && x && "constraint_name" in x ? String((x as { constraint_name: unknown }).constraint_name) : null;
  return name(e) ?? name((e as { cause?: unknown } | null)?.cause);
}

/** Postgres `unique_violation`, whether drizzle throws it directly or wraps it as `cause`. */
export function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown) => (typeof x === "object" && x && "code" in x ? (x as { code: unknown }).code : null);
  return code(e) === "23505" || code((e as { cause?: unknown } | null)?.cause) === "23505";
}
