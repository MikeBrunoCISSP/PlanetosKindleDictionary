import { describe, it, expect, beforeAll } from "vitest";
import {
  ensureBucketExists,
  putObject,
  getPresignedDownloadUrl,
  listObjects,
  deleteObjects,
} from "../src/lib/storage.js";

const PREFIX = "test-storage/";

beforeAll(async () => {
  await ensureBucketExists();
});

describe("storage", () => {
  it("ensureBucketExists succeeds against the running MinIO with no thrown error", async () => {
    await expect(ensureBucketExists()).resolves.not.toThrow();
  });

  it("putObject + getPresignedDownloadUrl round-trips real content", async () => {
    const key = `${PREFIX}roundtrip.txt`;
    await putObject(key, Buffer.from("hello dictionary"), "text/plain");

    const url = await getPresignedDownloadUrl(key);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe("hello dictionary");

    await deleteObjects([key]);
  });

  it("getPresignedDownloadUrl with a filename sets a matching content-disposition header", async () => {
    const key = `${PREFIX}named.txt`;
    await putObject(key, Buffer.from("named content"), "text/plain");

    const url = await getPresignedDownloadUrl(key, 300, "My-Dictionary_26Aug20261415.epub");
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="My-Dictionary_26Aug20261415.epub"'
    );

    await deleteObjects([key]);
  });

  it("listObjects and deleteObjects work against a known prefix", async () => {
    const keys = [`${PREFIX}list-a.txt`, `${PREFIX}list-b.txt`];
    for (const key of keys) {
      await putObject(key, Buffer.from("x"), "text/plain");
    }

    const listed = await listObjects(PREFIX);
    const listedKeys = listed.map((o) => o.key);
    expect(listedKeys).toEqual(expect.arrayContaining(keys));

    await deleteObjects(keys);
    const afterDelete = await listObjects(PREFIX);
    expect(afterDelete.map((o) => o.key)).not.toEqual(expect.arrayContaining(keys));
  });
});
