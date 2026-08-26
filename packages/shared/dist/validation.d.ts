import { z } from "zod";
export interface PlainTextOptions {
    min?: number;
    max: number;
    minMessage?: string;
}
/**
 * A free-text field that must not contain HTML-like markup.
 * Fields built with this are plain text by design (e.g. titles,
 * descriptions) - markup is rejected rather than stripped so the
 * caller sees a clear validation error instead of a silent mutation.
 */
export declare function plainText({ min, max, minMessage }: PlainTextOptions): z.ZodEffects<z.ZodString, string, string>;
/** Case-insensitive, whitespace-trimmed normalization for word-uniqueness comparisons. */
export declare function normalizeWord(value: string): string;
//# sourceMappingURL=validation.d.ts.map