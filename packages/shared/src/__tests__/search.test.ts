import { describe, expect, it } from "vitest";
import { seriesIdsFilterSchema } from "../search.js";

describe("seriesIdsFilterSchema", () => {
  it("leaves undefined as undefined", () => {
    expect(seriesIdsFilterSchema.parse(undefined)).toBeUndefined();
  });

  it("normalizes a bare string (Fastify's single-value case) into a one-element array", () => {
    expect(seriesIdsFilterSchema.parse("abc")).toEqual(["abc"]);
  });

  it("passes an array through unchanged", () => {
    expect(seriesIdsFilterSchema.parse(["a", "b"])).toEqual(["a", "b"]);
  });

  it("rejects an empty array", () => {
    expect(() => seriesIdsFilterSchema.parse([])).toThrow();
  });
});
