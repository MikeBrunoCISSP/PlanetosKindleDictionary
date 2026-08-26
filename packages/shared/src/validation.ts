import { z } from "zod";

const HTML_TAG_PATTERN = /<[^>]*>/;

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
export function plainText({ min = 1, max, minMessage }: PlainTextOptions) {
  return z
    .string()
    .trim()
    .min(min, minMessage ?? `Must be at least ${min} character${min === 1 ? "" : "s"} long`)
    .max(max, `Must be at most ${max} characters long`)
    .refine((value) => !HTML_TAG_PATTERN.test(value), {
      message: "Must not contain HTML markup",
    });
}

/** Case-insensitive, whitespace-trimmed normalization for word-uniqueness comparisons. */
export function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
}
