import { describe, expect, it } from "vitest";
import { sanitizeForFilename, buildDictionaryFilename } from "../../src/lib/filename.js";

describe("sanitizeForFilename", () => {
  it("leaves a plain alphanumeric title unchanged", () => {
    expect(sanitizeForFilename("ASOIAF")).toBe("ASOIAF");
  });

  it("collapses spaces and punctuation into single hyphens while preserving case", () => {
    expect(sanitizeForFilename("A Song of Ice & Fire")).toBe("A-Song-of-Ice-Fire");
  });

  it("trims leading and trailing special characters", () => {
    expect(sanitizeForFilename("  !Wheel of Time?!  ")).toBe("Wheel-of-Time");
  });
});

describe("buildDictionaryFilename", () => {
  it("zero-pads day, hour, and minute", () => {
    const date = new Date(2026, 7, 6, 9, 5); // Aug 6 2026, 09:05
    expect(buildDictionaryFilename("ASOIAF", date)).toBe("ASOIAF_06Aug20260905.epub");
  });

  it.each([
    [0, "Jan"], [1, "Feb"], [2, "Mar"], [3, "Apr"], [4, "May"], [5, "Jun"],
    [6, "Jul"], [7, "Aug"], [8, "Sep"], [9, "Oct"], [10, "Nov"], [11, "Dec"],
  ])("produces the correct month abbreviation for month index %i", (monthIndex, abbr) => {
    const date = new Date(2026, monthIndex, 15, 14, 30);
    expect(buildDictionaryFilename("Dict", date)).toBe(`Dict_15${abbr}20261430.epub`);
  });

  it("produces different filenames for different build dates on the same title", () => {
    const first = buildDictionaryFilename("ASOIAF", new Date(2026, 7, 26, 14, 5));
    const second = buildDictionaryFilename("ASOIAF", new Date(2026, 7, 26, 15, 30));
    expect(first).not.toBe(second);
  });

  it("uses 24-hour hour formatting", () => {
    const date = new Date(2026, 7, 26, 23, 59);
    expect(buildDictionaryFilename("ASOIAF", date)).toBe("ASOIAF_26Aug20262359.epub");
  });
});
