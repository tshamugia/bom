import { eq } from "drizzle-orm";
import { db } from "./client";
import { user } from "./schema";
import { createUserDirect, findUserByEmail } from "@/server/lib/create-user-direct";

const EMAIL = "t.shamugia@insta.ge";
const PASSWORD = "Password123";
const NAME = "T. Shamugia";

async function main() {
  const existing = await findUserByEmail(EMAIL);
  if (existing) {
    await db.update(user).set({ role: "admin", disabled: false }).where(eq(user.id, existing.id));
    console.log(`User already present: ${EMAIL}`);
  } else {
    await createUserDirect({ email: EMAIL, password: PASSWORD, name: NAME, role: "admin" });
    console.log(`Created user ${EMAIL}`);
  }
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
