"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { systemSettings, SYSTEM_SETTINGS_ID } from "@/db/schema";
import { requireRole } from "../auth-context";

const EmailList = z.array(z.string().trim().email()).max(50);

const ProcurementSettingsInput = z.object({
  to: EmailList,
  cc: EmailList.default([]),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().max(5000).nullable().optional(),
});

export type ProcurementSettingsInputT = z.infer<typeof ProcurementSettingsInput>;

export async function updateProcurementSettings(input: ProcurementSettingsInputT) {
  const data = ProcurementSettingsInput.parse(input);
  const session = await requireRole("owner", "admin");

  const subject = data.subject?.length ? data.subject : null;
  const body = data.body?.length ? data.body : null;

  await db
    .insert(systemSettings)
    .values({
      id: SYSTEM_SETTINGS_ID,
      procurementTo: data.to,
      procurementCc: data.cc,
      procurementSubject: subject,
      procurementBody: body,
      updatedById: session.user.id,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettings.id,
      set: {
        procurementTo: data.to,
        procurementCc: data.cc,
        procurementSubject: subject,
        procurementBody: body,
        updatedById: session.user.id,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/settings/procurement");
  revalidatePath("/settings");
}
