/**
 * Deterministic UUIDv5 dc:identifier for a series, per SPEC.md §5.5 - the
 * same series id always yields the same identifier, so rebuilds do not look
 * like a "new" dictionary on-device.
 */
export declare function deriveDictionaryUuid(seriesId: string): string;
//# sourceMappingURL=identifier.d.ts.map