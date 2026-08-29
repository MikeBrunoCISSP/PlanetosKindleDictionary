const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function sanitizeForFilename(input: string): string {
  return input.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildDictionaryFilename(title: string, buildDate: Date): string {
  const day = String(buildDate.getDate()).padStart(2, "0");
  const month = MONTH_ABBR[buildDate.getMonth()];
  const year = buildDate.getFullYear();
  const hour = String(buildDate.getHours()).padStart(2, "0");
  const minute = String(buildDate.getMinutes()).padStart(2, "0");
  return `${sanitizeForFilename(title)}_${day}${month}${year}${hour}${minute}.epub`;
}
