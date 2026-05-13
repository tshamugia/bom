import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, ssl: "require" });
try {
  console.log("Dropping schemas...");
  await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
  await sql.unsafe(`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await sql.unsafe(`CREATE SCHEMA public`);
  console.log("Done.");
} finally {
  await sql.end({ timeout: 5 });
}
