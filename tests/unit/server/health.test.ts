import { afterEach, expect, test, vi } from "vitest";
import { db } from "@/db/client";
import { GET } from "@/app/api/health/route";

afterEach(() => vi.restoreAllMocks());

test("reports ok and the build version when Postgres answers", async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const body = await res.json();
  expect(body).toMatchObject({ ok: true, version: expect.any(String) });
  expect(Object.keys(body).sort()).toEqual(["ok", "revision", "version"]);
});

test("answers 503 when the database check fails", async () => {
  vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("connection refused"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const res = await GET();
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ ok: false });
});
