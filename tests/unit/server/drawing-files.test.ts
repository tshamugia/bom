import { beforeEach, expect, test, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { auditLog, drawingEvents, drawingFiles, drawingRevisions, drawingTransmittals, drawings, projects } from "@/db/schema";
import type { DrawingStatus } from "@/lib/drawing-status";

const store = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));
vi.mock("@/lib/s3", () => ({
  presignUpload: vi.fn(async (key: string) => ({ url: "https://bucket.example/", fields: { key } })),
  headObject: vi.fn(async (key: string) => {
    const bytes = store.get(key);
    return bytes ? { size: bytes.length, contentType: "application/pdf" } : null;
  }),
  readObjectStart: vi.fn(async (key: string) => store.get(key)?.subarray(0, 1024) ?? null),
  deleteObject: vi.fn(async (key: string) => { store.delete(key); }),
  presignDownload: vi.fn(async (key: string, _ttl: number, as?: { fileName: string; disposition: string }) =>
    `https://bucket.example/${key}?as=${as?.disposition}&name=${as?.fileName}`),
}));

import {
  cancelDrawingFileUpload, confirmDrawingFileUpload, removeDrawingFile, requestDrawingFileUpload,
} from "@/server/actions/drawing-files";
import { setDrawingFileGate } from "@/server/actions/drawing-settings";
import { listDrawingFiles } from "@/server/queries/drawing-files";
import { getStatusFeed } from "@/server/queries/status-overview";
import { requireSession } from "@/server/auth-context";
import { GET as download } from "@/app/api/drawings/files/[id]/route";

const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n");
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

beforeEach(async () => {
  await resetDb();
  store.clear();
});

/** A drawing owned by the signed-in member, with rev1 in `status`. */
async function setup(status: DrawingStatus = "approved-a") {
  const { user: owner } = await mockSession("member");
  const [p] = await db.insert(projects).values({ code: "HLT", name: "Hilton" }).returning();
  const [d] = await db.insert(drawings).values({ projectId: p.id, code: "ELV-101", name: "CCTV layout", ownerId: owner.id }).returning();
  const [rev] = await db.insert(drawingRevisions).values({ drawingId: d.id, number: 1, commitMessage: "Initial", status }).returning();
  return { owner, project: p, drawing: d, rev };
}

/** What the browser does: ask for the form, post the bytes to the bucket, confirm. */
async function upload(revisionId: string, bytes = PDF, fileName = "layout final.pdf") {
  const req = await requestDrawingFileUpload({ revisionId, fileName, contentType: "application/pdf", size: bytes.length });
  if (!req.ok) return req;
  store.set(req.fields.key, bytes);
  return confirmDrawingFileUpload({ fileId: req.fileId });
}

const get = (fileId: string, query = "") =>
  download(new NextRequest(`http://localhost/api/drawings/files/${fileId}${query}`), { params: Promise.resolve({ id: fileId }) });

test("the owner uploads the PDF of an approved revision, filed under project, drawing and revision", async () => {
  const { drawing, rev } = await setup();

  expect(await upload(rev.id)).toEqual({ ok: true });

  const [file] = await db.select().from(drawingFiles);
  expect(file).toMatchObject({ status: "ready", originalName: "layout final.pdf", sizeBytes: PDF.length, archivedAt: null });
  expect(file.objectKey).toMatch(/^drawings\/HLT\/ELV-101\/rev1\/ELV-101_rev1_\w+\.pdf$/);
  expect(store.has(file.objectKey)).toBe(true);

  const [event] = await db.select().from(drawingEvents).where(eq(drawingEvents.drawingId, drawing.id));
  expect(event).toMatchObject({ kind: "file", revisionId: rev.id, body: `Uploaded layout final.pdf (${PDF.length} B)` });
  const [log] = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.file.uploaded"));
  expect(log.summary).toBe("ELV-101 rev1 PDF uploaded");
});

test("a revision the client hasn't approved takes no PDF under the default rule", async () => {
  for (const status of ["in-progress", "need-approval", "awaiting-approval"] as const) {
    await resetDb();
    const { rev } = await setup(status);
    expect(await upload(rev.id)).toEqual({
      ok: false,
      error: "The PDF can be uploaded once the revision is Approved A, Approved B or As Built.",
    });
  }
  expect(await db.select().from(drawingFiles)).toEqual([]);
});

test("only the drawing owner or an admin uploads; viewers can't", async () => {
  const { rev } = await setup();

  await mockSession("member");
  expect(await upload(rev.id)).toEqual({ ok: false, error: "Only the drawing owner or an admin uploads the PDF." });
  await mockSession("viewer");
  expect(await upload(rev.id)).toEqual({ ok: false, error: "Viewers have read-only access." });
  await mockSession("admin");
  expect(await upload(rev.id)).toEqual({ ok: true });
});

test("once a newer revision exists, the older one takes no PDF", async () => {
  const { drawing, rev } = await setup();
  await db.insert(drawingRevisions).values({ drawingId: drawing.id, number: 2, commitMessage: "Moved cameras", status: "approved-a" });

  expect(await upload(rev.id)).toEqual({ ok: false, error: "Only the latest revision takes a PDF — older revisions are locked." });
});

test("bytes that aren't a PDF are thrown away, whatever the file was called", async () => {
  const { rev } = await setup();

  expect(await upload(rev.id, HTML, "drawing.pdf")).toEqual({ ok: false, error: "This file isn't a PDF." });
  expect(await db.select().from(drawingFiles)).toEqual([]);
  expect(store.size).toBe(0);
});

test("a cancelled upload leaves nothing behind", async () => {
  const { rev } = await setup();
  const req = await requestDrawingFileUpload({ revisionId: rev.id, fileName: "a.pdf", contentType: "application/pdf", size: 10 });
  if (!req.ok) throw new Error(req.error);

  expect(await cancelDrawingFileUpload({ fileId: req.fileId })).toEqual({ ok: true });
  expect(await db.select().from(drawingFiles)).toEqual([]);
  expect(await confirmDrawingFileUpload({ fileId: req.fileId })).toEqual({
    ok: false,
    error: "This upload has expired — upload the PDF again.",
  });
});

test("a new upload replaces the PDF and archives the old one", async () => {
  const { drawing, rev } = await setup();
  await upload(rev.id, PDF, "first.pdf");
  expect(await upload(rev.id, PDF, "second.pdf")).toEqual({ ok: true });

  const rows = await db.select().from(drawingFiles).orderBy(drawingFiles.createdAt);
  expect(rows.map(r => [r.originalName, r.archiveReason])).toEqual([["first.pdf", "Replaced"], ["second.pdf", null]]);
  // Archived, not deleted: both objects are still in the bucket.
  expect(store.size).toBe(2);
  expect((await listDrawingFiles(drawing.id)).map(f => f.originalName)).toEqual(["second.pdf"]);

  const events = await db.select({ body: drawingEvents.body }).from(drawingEvents).orderBy(drawingEvents.createdAt);
  expect(events.at(-1)?.body).toBe(`Replaced first.pdf with second.pdf (${PDF.length} B)`);
});

test("an admin can open uploads from Need to be approved", async () => {
  const { rev } = await setup("need-approval");

  expect(await setDrawingFileGate({ gate: "need-approval" })).toEqual({ ok: false, error: "Only an admin can do this." });
  await mockSession("admin");
  expect(await setDrawingFileGate({ gate: "need-approval" })).toEqual({ ok: true });
  expect(await upload(rev.id)).toEqual({ ok: true });
});

test("only an admin removes a PDF, with a reason, and the object stays in the bucket", async () => {
  const { drawing, rev } = await setup();
  await upload(rev.id);
  const [file] = await db.select().from(drawingFiles);

  expect(await removeDrawingFile({ fileId: file.id, reason: "Wrong sheet" })).toEqual({ ok: false, error: "Only an admin can do this." });
  await mockSession("admin");
  expect(await removeDrawingFile({ fileId: file.id, reason: "Wrong sheet" })).toEqual({ ok: true });

  expect(await listDrawingFiles(drawing.id)).toEqual([]);
  expect(store.has(file.objectKey)).toBe(true);
  const [row] = await db.select().from(drawingFiles);
  expect(row.archiveReason).toBe("Wrong sheet");
});

test("downloads go through a short-lived bucket link named after the drawing", async () => {
  const { drawing, rev } = await setup();
  await upload(rev.id);
  const [file] = await db.select().from(drawingFiles);

  await mockSession("viewer");
  const opened = await get(file.id);
  expect(opened.status).toBe(302);
  expect(opened.headers.get("location")).toBe(`https://bucket.example/${file.objectKey}?as=inline&name=ELV-101_rev1.pdf`);
  expect((await get(file.id, "?download=1")).headers.get("location")).toContain("as=attachment");

  const logs = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.file.downloaded"));
  expect(logs.map(l => l.summary)).toEqual(["ELV-101 rev1 PDF opened", "ELV-101 rev1 PDF downloaded"]);

  // Signed out (e.g. a link from an email): sign in, then land on the drawing.
  vi.mocked(requireSession).mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
  const signedOut = await get(file.id);
  expect(new URL(signedOut.headers.get("location")!).pathname).toBe("/sign-in");
  expect(new URL(signedOut.headers.get("location")!).searchParams.get("next")).toBe(`/drawings/${drawing.id}`);
});

test("viewers can't open a PDF once its revision is no longer approved; editors still can", async () => {
  const { rev } = await setup();
  await upload(rev.id);
  const [file] = await db.select().from(drawingFiles);
  await db.update(drawingRevisions).set({ status: "in-progress" }).where(eq(drawingRevisions.id, rev.id));

  await mockSession("viewer");
  expect((await get(file.id)).status).toBe(404);
  await mockSession("member");
  expect((await get(file.id)).status).toBe(302);
});

test("a revision issued to a viewer carries its PDF only while it is approved", async () => {
  const { drawing, rev } = await setup();
  await upload(rev.id);
  const [file] = await db.select().from(drawingFiles);
  const { user: viewer } = await mockSession("viewer");
  await db.insert(drawingTransmittals).values({
    drawingId: drawing.id, revisionId: rev.id, purpose: "construction", recipientUserId: viewer.id,
  });

  const feed = await getStatusFeed();
  expect(feed.mine.map(t => t.pdfFileId)).toEqual([file.id]);
  expect(feed.issued.map(t => t.pdfFileId)).toEqual([file.id]);

  await db.update(drawingRevisions).set({ status: "in-progress" }).where(and(eq(drawingRevisions.id, rev.id)));
  const later = await getStatusFeed();
  expect(later.mine.map(t => t.pdfFileId)).toEqual([null]);
});
