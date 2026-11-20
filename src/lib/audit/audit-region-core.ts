import type { AuditLogEntry } from '@/lib/supabase/types';

/** Region yang bisa dipetakan secara pasti dari data audit. */
export type KnownAuditRegion = 'JABODETABEK' | 'KALBAR';

export interface AuditRegionEntity {
  region?: string | null;
  branch_name?: string | null;
  ro_number?: string | null;
  sj_number?: string | null;
  email?: string | null;
}

export interface AuditRegionLookups {
  roById: Map<string, AuditRegionEntity>;
  roByNumber: Map<string, AuditRegionEntity>;
  assetRequestById: Map<string, AuditRegionEntity>;
  sjById: Map<string, AuditRegionEntity>;
  sjByNumber: Map<string, AuditRegionEntity>;
  outletById: Map<string, AuditRegionEntity>;
  outletByBranch: Map<string, AuditRegionEntity>;
  userById: Map<string, AuditRegionEntity>;
  userByEmail: Map<string, AuditRegionEntity>;
}

export function createEmptyAuditRegionLookups(): AuditRegionLookups {
  return {
    roById: new Map(),
    roByNumber: new Map(),
    assetRequestById: new Map(),
    sjById: new Map(),
    sjByNumber: new Map(),
    outletById: new Map(),
    outletByBranch: new Map(),
    userById: new Map(),
    userByEmail: new Map(),
  };
}

/** Normalisasi nama region; nilai tak dikenal mengembalikan null (bukan 'ALL'). */
export function normalizeKnownAuditRegion(value?: string | null): KnownAuditRegion | null {
  const upper = String(value ?? '').trim().toUpperCase();
  if (upper === 'JABO' || upper === 'JABODETABEK') return 'JABODETABEK';
  if (upper === 'KALBAR' || upper === 'KALIMANTAN BARAT') return 'KALBAR';
  return null;
}

function regionFromBranch(
  branch: unknown,
  lookups: AuditRegionLookups
): KnownAuditRegion | null {
  const text = typeof branch === 'string' ? branch.trim() : '';
  if (!text) return null;

  const direct = normalizeKnownAuditRegion(text);
  if (direct) return direct;

  const token = text.match(/\[REGION:([A-Z_]+)\]/i)?.[1];
  const tokenRegion = normalizeKnownAuditRegion(token);
  if (tokenRegion) return tokenRegion;

  const outlet = lookups.outletByBranch.get(text.toUpperCase());
  return normalizeKnownAuditRegion(outlet?.region);
}

function entityRegion(
  entity: AuditRegionEntity | undefined,
  lookups: AuditRegionLookups
): KnownAuditRegion | null {
  if (!entity) return null;
  return normalizeKnownAuditRegion(entity.region) ?? regionFromBranch(entity.branch_name, lookups);
}

function extractRoNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/RO-\d+(?:-\d+)*/i);
  return match ? match[0].toUpperCase() : null;
}

function extractSjNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/SJ-[A-Z0-9]+(?:\/[A-Z0-9]+)*/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Fallback terakhir: cocokkan nama branch/outlet yang muncul di judul log.
 * Hanya dipakai bila hasilnya tunggal, supaya transfer lintas region tidak
 * salah diatribusikan.
 */
function regionFromTitle(
  title: string,
  lookups: AuditRegionLookups
): KnownAuditRegion | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  const matches = new Set<KnownAuditRegion>();

  for (const [branch, entity] of lookups.outletByBranch) {
    // Abaikan kode branch pendek seperti "GA" agar tidak salah cocok.
    if (branch.length < 5) continue;
    if (!lower.includes(branch.toLowerCase())) continue;
    const region = normalizeKnownAuditRegion(entity.region);
    if (region) matches.add(region);
  }

  return matches.size === 1 ? [...matches][0] : null;
}

/**
 * Tentukan region sebuah audit log dari snapshot state atau entitas terkait.
 * Mengembalikan null untuk log global/SYSTEM atau referensi yang sudah hilang.
 */
export function resolveAuditLogRegion(
  log: Pick<AuditLogEntry, 'entity_type' | 'entity_id' | 'entity_title' | 'previous_state' | 'new_state'>,
  lookups: AuditRegionLookups
): KnownAuditRegion | null {
  const previousState = log.previous_state;
  const newState = log.new_state;

  const fromState =
    normalizeKnownAuditRegion(newState?.region) ??
    normalizeKnownAuditRegion(previousState?.region) ??
    regionFromBranch(newState?.branch_name, lookups) ??
    regionFromBranch(previousState?.branch_name, lookups);
  if (fromState) return fromState;

  const entityId = typeof log.entity_id === 'string' ? log.entity_id.trim() : '';
  const title = typeof log.entity_title === 'string' ? log.entity_title.trim() : '';

  switch (log.entity_type) {
    case 'ASET': {
      // ID sintetis dari PR: ro-pr-<uuid-ro>-<roi-id>
      const roUuid = entityId.match(
        /^ro-pr-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
      )?.[1];
      if (roUuid) {
        const region = entityRegion(lookups.roById.get(roUuid), lookups);
        if (region) return region;
      }

      const assetRequest = lookups.assetRequestById.get(entityId);
      if (assetRequest) {
        const region = entityRegion(assetRequest, lookups);
        if (region) return region;
      }

      const roNumber = extractRoNumber(entityId) ?? extractRoNumber(title);
      if (roNumber) {
        const region = entityRegion(lookups.roByNumber.get(roNumber), lookups);
        if (region) return region;
      }
      break;
    }

    case 'RO': {
      const ro =
        lookups.roById.get(entityId) ??
        lookups.roByNumber.get(extractRoNumber(entityId) ?? '') ??
        lookups.roByNumber.get(extractRoNumber(title) ?? '');
      const region = entityRegion(ro, lookups);
      if (region) return region;
      break;
    }

    case 'ITEM': {
      const roNumber = extractRoNumber(entityId) ?? extractRoNumber(title);
      if (roNumber) {
        const region = entityRegion(lookups.roByNumber.get(roNumber), lookups);
        if (region) return region;
      }
      break;
    }

    case 'SURAT_JALAN': {
      const sj =
        lookups.sjById.get(entityId) ??
        lookups.sjByNumber.get(extractSjNumber(title) ?? '');
      const region = entityRegion(sj, lookups);
      if (region) return region;
      break;
    }

    case 'TRANSFER': {
      // Transfer dan surat jalan memakai ID dokumen yang sama.
      const region = entityRegion(lookups.sjById.get(entityId), lookups);
      if (region) return region;
      break;
    }

    case 'OUTLET': {
      const outlet =
        lookups.outletById.get(entityId) ??
        lookups.outletByBranch.get(title.toUpperCase());
      const region = entityRegion(outlet, lookups);
      if (region) return region;
      break;
    }

    case 'PENGGUNA': {
      const user =
        lookups.userById.get(entityId) ??
        lookups.userByEmail.get(entityId.toLowerCase()) ??
        lookups.userByEmail.get(title.toLowerCase());
      const region = entityRegion(user, lookups);
      if (region) return region;
      break;
    }

    default:
      break;
  }

  return regionFromTitle(title, lookups);
}

/** Filter log yang sudah punya field `region` hasil resolve. */
export function filterAuditLogsByRegion(
  logs: AuditLogEntry[],
  region?: string | null
): AuditLogEntry[] {
  const filter = normalizeKnownAuditRegion(region);
  if (!filter) return logs;
  return logs.filter((log) => normalizeKnownAuditRegion(log.region) === filter);
}
