const WEBHOOK_DEBOUNCE_MS = 5 * 60 * 1000;

export function shouldDebounce(
  lastStartedAt: string | null,
  now: Date = new Date(),
  windowMs: number = WEBHOOK_DEBOUNCE_MS
): boolean {
  if (!lastStartedAt) return false;
  const last = Date.parse(lastStartedAt);
  if (Number.isNaN(last)) return false;
  return now.getTime() - last < windowMs;
}