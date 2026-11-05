import type { SyncRunOptions, SyncTrigger } from './types.ts';

export interface SyncRequestInput {
  query: Record<string, string | null | undefined>;
  body: any;
  authorization: string | null;
}

const TRIGGERS: SyncTrigger[] = ['MANUAL', 'CRON', 'WEBHOOK'];

function asBool(value: unknown): boolean | undefined {
  if (value === true || value === '1' || value === 'true') return true;
  if (value === false || value === '0' || value === 'false') return false;
  return undefined;
}

function asSources(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

export function parseSyncRequest(input: SyncRequestInput): {
  options: SyncRunOptions;
} {
  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const sources = asSources(body.sources) ?? asSources(input.query.sources);
  const dryRun = asBool(body.dryRun) ?? asBool(input.query.dryRun) ?? false;
  const force = asBool(body.force) ?? asBool(input.query.force) ?? false;

  const cronSecret = process.env.CRON_SECRET;
  const isCron = Boolean(cronSecret && input.authorization === `Bearer ${cronSecret}`);

  const rawTrigger = String(body.trigger || input.query.trigger || '').toUpperCase();
  const trigger: SyncTrigger = TRIGGERS.includes(rawTrigger as SyncTrigger)
    ? (rawTrigger as SyncTrigger)
    : isCron
      ? 'CRON'
      : 'MANUAL';

  return {
    options: {
      sources,
      dryRun,
      force,
      trigger,
      actorName: typeof body.actorName === 'string' ? body.actorName : undefined,
      sourceOptions: body.sourceOptions,
    },
  };
}