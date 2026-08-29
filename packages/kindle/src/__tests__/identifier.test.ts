import { describe, it, expect } from "vitest";
import { deriveDictionaryUuid } from "../identifier.js";

describe("deriveDictionaryUuid", () => {
  it("is deterministic for the same series id", () => {
    expect(deriveDictionaryUuid("series-1")).toBe(deriveDictionaryUuid("series-1"));
  });

  it("differs for different series ids", () => {
    expect(deriveDictionaryUuid("series-1")).not.toBe(deriveDictionaryUuid("series-2"));
  });

  it("produces a well-formed UUID", () => {
    const uuid = deriveDictionaryUuid("series-1");
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
