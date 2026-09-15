const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Renders in the caller's local timezone by construction: Date's getMonth/
// getDate/getFullYear/getHours/getMinutes are always local-time, never UTC.
// Built manually rather than via Intl.DateTimeFormat because the target
// format (`Jan 06 2026 14:30`) is a fixed literal shape, not a
// locale-appropriate rendering.
export function formatLastModified(isoString: string): string {
  const d = new Date(isoString);
  return `${MONTHS[d.getMonth()]} ${pad2(d.getDate())} ${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
