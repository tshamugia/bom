import { createUserDirect, findUserByEmail } from "@/server/lib/create-user-direct";
import { roleOf, type UserRole } from "@/lib/roles";

/**
 * Add a single user with a correctly-hashed (better-auth scrypt) password.
 * Idempotent: if the email already exists it does nothing.
 *
 * Credentials come from env so they never live in source:
 *   NEW_USER_EMAIL, NEW_USER_PASSWORD, NEW_USER_NAME, NEW_USER_ROLE
 *
 * Run (prod example, over a temporary proxy):
 *   DATABASE_URL=... NEW_USER_EMAIL=... NEW_USER_PASSWORD=... \
 *     NEW_USER_NAME=... NEW_USER_ROLE=admin \
 *     npx tsx --env-file=.env.local src/db/add-user.ts
 */

async function main() {
  const email = process.env.NEW_USER_EMAIL;
  const password = process.env.NEW_USER_PASSWORD;
  const name = process.env.NEW_USER_NAME ?? email ?? "";
  const role: UserRole = roleOf({ role: process.env.NEW_USER_ROLE });

  if (!email || !password) {
    console.error("NEW_USER_EMAIL and NEW_USER_PASSWORD are required");
    process.exit(1);
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`User already exists, skipping: ${email}`);
    process.exit(0);
  }

  const { id } = await createUserDirect({ email, password, name, role });
  console.log(`Created user ${email} (role: ${role}, id: ${id})`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
