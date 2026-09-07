import { Errors } from "./errors.js";

/**
 * Opaque keyset-pagination cursor (PERF-002) - a position in a list ordered
 * by (createdAt, id), the tie-break existing so two rows created in the
 * same millisecond still have a total order. Opaque so callers only ever
 * echo back what the server gave them, never construct one by hand.
 */
export interface ListCursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): ListCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw Errors.INVALID_CURSOR();
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as ListCursor).createdAt !== "string" ||
    typeof (parsed as ListCursor).id !== "string"
  ) {
    throw Errors.INVALID_CURSOR();
  }
  return parsed as ListCursor;
}
