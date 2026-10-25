/**
 * Every date in this app is a Europe/London calendar date, and weeks run
 * Monday to Sunday. The server may sit in UTC and the phone may be anywhere,
 * so the zone is always stated rather than inherited.
 */

export const TZ = "Europe/London";

/** Today's London calendar date as YYYY-MM-DD. */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** London wall-clock time as HH:MM. */
export function londonTime(at: Date | string = new Date()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** "Saturday" for a YYYY-MM-DD date string. */
export function weekdayName(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "long",
  }).format(parseIsoDate(isoDate));
}

/** "25 October 2026" for a YYYY-MM-DD date string. */
export function longDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseIsoDate(isoDate));
}

/** Monday of the ISO week containing the given date. */
export function weekStart(isoDate: string): string {
  const d = parseIsoDate(isoDate);
  const isoDow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (isoDow - 1));
  return d.toISOString().slice(0, 10);
}

/** Whole days between two YYYY-MM-DD dates. */
export function daysBetween(fromIso: string, toIso: string): number {
  const ms = parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime();
  return Math.round(ms / 86_400_000);
}

/** Minutes between two timestamps, rounded, or null if either is missing. */
export function minutesBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / 60_000);
}

/** "1 h 35 min" / "40 min". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes < 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Noon UTC, so a date-only string never shifts a day under any offset. */
function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}
