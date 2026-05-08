import "server-only";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { boms } from "@/db/schema";

type Db = typeof defaultDb;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function touchBom(
  client: Db | Tx,
  bomId: string,
  userId: string,
): Promise<void> {
  await client
    .update(boms)
    .set({ lastModifiedById: userId, updatedAt: new Date() })
    .where(eq(boms.id, bomId));
}
