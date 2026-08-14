export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

/**
 * Returns the offset (ms) that, when added to a UTC instant, yields the
 * wall-clock representation of that instant in the given IANA time zone.
 */
function tzOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const hour = get('hour') % 24;
  const wallUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return wallUtc - date.getTime();
}

export function startOfDayInTz(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const offset = tzOffsetMs(timeZone, date);
  const localMs = date.getTime() + offset;
  const localStart = new Date(Math.floor(localMs / 86_400_000) * 86_400_000);
  const utcMs = localStart.getTime() - offset;
  return new Date(utcMs).toISOString();
}

export function endOfDayInTz(iso: string, timeZone: string): string {
  const start = startOfDayInTz(iso, timeZone);
  return addMinutes(start, 24 * 60 - 1); // 23:59 local
}

export function isSameDayInTz(aIso: string, bIso: string, timeZone: string): boolean {
  return startOfDayInTz(aIso, timeZone) === startOfDayInTz(bIso, timeZone);
}
