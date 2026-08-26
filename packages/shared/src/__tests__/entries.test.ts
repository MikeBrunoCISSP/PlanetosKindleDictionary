import { describe, expect, it } from "vitest";
import { createEntrySchema, submitEntryEditProposalSchema, definitionHtmlSchema } from "../entries.js";

describe("definitionHtmlSchema", () => {
  it("rejects an empty definition", () => {
    expect(definitionHtmlSchema.safeParse("").success).toBe(false);
  });

  it("rejects a whitespace-only definition", () => {
    expect(definitionHtmlSchema.safeParse("   \n\t  ").success).toBe(false);
  });

  it("trims a padded definition", () => {
    const result = definitionHtmlSchema.safeParse("  <p>Hello</p>  ");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("<p>Hello</p>");
  });

  it("rejects a definition over 5,000 characters", () => {
    expect(definitionHtmlSchema.safeParse("a".repeat(5001)).success).toBe(false);
  });
});

describe("createEntrySchema", () => {
  const valid = { headword: "Aes Sedai", definitionHtml: "<p>A channeler.</p>", inflections: [] as string[] };

  it("accepts a valid entry", () => {
    expect(createEntrySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a whitespace-only definition", () => {
    const result = createEntrySchema.safeParse({ ...valid, definitionHtml: "   " });
    expect(result.success).toBe(false);
  });
});

describe("submitEntryEditProposalSchema", () => {
  const valid = { definitionHtml: "<p>Updated definition.</p>", inflections: ["Ran", "Running"] };

  it("accepts a valid edit proposal", () => {
    expect(submitEntryEditProposalSchema.safeParse(valid).success).toBe(true);
  });

  it("has no headword field", () => {
    const result = submitEntryEditProposalSchema.safeParse(valid);
    expect(result.success && "headword" in result.data).toBe(false);
  });

  it("rejects a whitespace-only definition", () => {
    expect(submitEntryEditProposalSchema.safeParse({ ...valid, definitionHtml: "  " }).success).toBe(false);
  });

  it("rejects internally-duplicated inflections", () => {
    const result = submitEntryEditProposalSchema.safeParse({
      ...valid,
      inflections: ["Ran", "ran"],
    });
    expect(result.success).toBe(false);
  });
});
