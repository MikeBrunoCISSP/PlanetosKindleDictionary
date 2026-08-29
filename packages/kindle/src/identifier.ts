import { v5 as uuidv5 } from "uuid";

// A fixed, arbitrary namespace UUID for this app's dictionary identifiers.
// Never change this value - doing so would change every series' derived
// dc:identifier, which SPEC.md §5.5 requires to stay stable across rebuilds.
const DICTIONARY_NAMESPACE = "8f14e45f-ceea-467e-bd7e-0a5e83c8f4a3";

/**
 * Deterministic UUIDv5 dc:identifier for a series, per SPEC.md §5.5 - the
 * same series id always yields the same identifier, so rebuilds do not look
 * like a "new" dictionary on-device.
 */
export function deriveDictionaryUuid(seriesId: string): string {
  return uuidv5(seriesId, DICTIONARY_NAMESPACE);
}
