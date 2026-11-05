# Sync Engine HANTARAN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun satu sync engine terpusat untuk alur Google Sheets → Engine → Supabase → HANTARAN, dengan lock, riwayat, dry-run, penandaan stale, dan halaman operasi `/sync`.

**Architecture:** Orchestrator di `src/lib/sync-engine/` memanggil fungsi sync legacy yang sudah teruji (`syncGoogleSheetsToSupabase`, `syncRequestOrdersFromSheet`, `syncMasterAssetCatalogFromSheet`) melalui registry sumber. Setiap eksekusi dicatat di `sync_runs` dan `sync_run_sources`. API `/api/sync` menjadi pintu utama; halaman `/sync` menampilkan status, riwayat, dan tombol run.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.7, Supabase JS 2, PostgreSQL, `node:test`, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-11-05-sync-engine-design.md`

## Global Constraints

- Sync bersifat **satu arah**: Google Sheets → Supabase. Tidak ada penulisan balik ke Sheets.
- Data yang diubah di HANTARAN menang; field terlindungi tidak boleh ditimpa sheet.
- Baris yang hilang dari sheet ditandai `is_stale = true`, tidak pernah dihapus.
- Dry-run tidak boleh menulis ke tabel bisnis, Storage, atau cache katalog.
- Dua run tidak boleh berjalan bersamaan; run `RUNNING` >15 menit dianggap kedaluwarsa.
- Jangan menjalankan SQL migration tanpa persetujuan eksplisit pengguna.
- Semua test dijalankan dengan `node --test "src/lib/**/*.test.mjs"`.
- Type check dengan `npx tsc --noEmit`; build dengan `npm run build`.
- Commit ke branch `dev`. Jangan merge ke `main` tanpa persetujuan.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `supabase/sync-engine.sql` | Migration tabel run, kolom stale, index, RLS |
| `src/lib/sync-engine/types.ts` | Semua tipe dan interface engine |
| `src/lib/sync-engine/registry.ts` | Definisi sumber dan urutan dependensi |
| `src/lib/sync-engine/status.ts` | Agregasi status run dan deteksi run kedaluwarsa |
| `src/lib/sync-engine/debounce.ts` | Aturan debounce webhook |
| `src/lib/sync-engine/stale.ts` | Penentuan scope region untuk penandaan stale |
| `src/lib/sync-engine/lock.ts` | Acquire/release lock run |
| `src/lib/sync-engine/store.ts` | Implementasi Supabase dari `SyncStore` |
| `src/lib/sync-engine/engine.ts` | Orkestrasi satu eksekusi |
| `src/lib/sync-engine/request.ts` | Parsing request API menjadi opsi engine |
| `src/lib/sync-engine/stale-store.ts` | Update `is_stale` di Supabase |
| `src/lib/sync-engine/sources/asset-requests.ts` | Adapter sumber aset |
| `src/lib/sync-engine/sources/request-orders.ts` | Adapter sumber RO |
| `src/lib/sync-engine/sources/master-catalog.ts` | Adapter sumber katalog |
| `src/lib/sync-engine/sources/index.ts` | Registry instance sumber |
| `src/lib/sync-engine/index.ts` | Barrel export |
| `src/app/api/sync/route.ts` | Endpoint utama (dimodifikasi) |
| `src/app/api/sync/status/route.ts` | Status terakhir |
| `src/app/api/sync/history/route.ts` | Riwayat run |
| `src/app/api/items/sync-sheet/route.ts` | Delegasi ke engine (dimodifikasi) |
| `src/app/api/distribution/ro/sync-sheet/route.ts` | Delegasi ke engine (dimodifikasi) |
| `src/app/sync/page.tsx` | Halaman operasi (ditulis ulang) |
| `src/components/sync/SyncSourceCard.tsx` | Kartu status per sumber |
| `src/components/sync/SyncHistoryTable.tsx` | Tabel riwayat |
| `src/lib/auth/sync-guard.ts` | Tambah auth `CRON_SECRET` |
| `src/lib/sync/sheet-fetcher.ts` | Tambah health per region |
| `src/lib/supabase/server.ts` | Region health, `last_seen_at`, stale, dry-run |
| `vercel.json` | Cron sync harian |
| `.env.example` | Dokumentasi env baru |
| `docs/guides/sync-engine.md` | Panduan operasional |

---

## Task 1: Schema, konfigurasi, dan cron

**Files:**
- Create: `supabase/sync-engine.sql`
- Create: `docs/guides/sync-engine.md`
- Modify: `tsconfig.json`
- Modify: `vercel.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: tabel `sync_runs`, `sync_run_sources`, kolom `last_seen_at`/`is_stale`; cron `/api/sync`.

- [ ] **Step 1: Tulis migration SQL**

Buat `supabase/sync-engine.sql`:

```sql
-- ==============================================================================
-- SYNC ENGINE HANTARAN
-- Jalankan sekali di Supabase SQL Editor SETELAH disetujui.
-- ==============================================================================

-- 1. Penanda baris yang masih muncul di spreadsheet
ALTER TABLE public.asset_requests
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.request_orders
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_asset_requests_stale
  ON public.asset_requests(is_stale) WHERE is_stale = TRUE;
CREATE INDEX IF NOT EXISTS idx_request_orders_stale
  ON public.request_orders(is_stale) WHERE is_stale = TRUE;

-- 2. Satu baris per eksekusi engine
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  actor_name TEXT,
  total_sources INTEGER NOT NULL DEFAULT 0,
  ok_sources INTEGER NOT NULL DEFAULT 0,
  failed_sources INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  message TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sync_runs_running
  ON public.sync_runs(status) WHERE status = 'RUNNING';

CREATE INDEX IF NOT EXISTS idx_sync_runs_started
  ON public.sync_runs(started_at DESC);

-- 3. Detail per sumber per run
CREATE TABLE IF NOT EXISTS public.sync_run_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  status TEXT NOT NULL,
  rows_fetched INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  rows_stale INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_run_sources_run
  ON public.sync_run_sources(run_id);

-- 4. Hanya service role yang perlu mengakses tabel operasional ini.
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_run_sources ENABLE ROW LEVEL SECURITY;

-- 5. Cek aman sebelum apply (read-only)
SELECT count(*) AS jumlah_sync_runs FROM public.sync_runs;
SELECT count(*) AS jumlah_sync_run_sources FROM public.sync_run_sources;
```

- [ ] **Step 2: Tambah konfigurasi TypeScript untuk test modul TS**

Di `tsconfig.json`, tambahkan tepat setelah `"noEmit": true,`:

```json
    "allowImportingTsExtensions": true,
```

- [ ] **Step 3: Tambah cron sync**

Ubah `vercel.json` menjadi:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/audit/cleanup",
      "schedule": "0 20 * * *"
    },
    {
      "path": "/api/sync",
      "schedule": "0 19 * * *"
    }
  ]
}
```

- [ ] **Step 4: Dokumentasikan env**

Tambahkan di akhir `.env.example`:

```bash
# ==============================================================================
# SYNC ENGINE
# SYNC_TOKEN wajib untuk webhook Apps Script (header x-sync-token).
# CRON_SECRET dipakai Vercel Cron (Authorization: Bearer <CRON_SECRET>).
# ==============================================================================
# SYNC_TOKEN=isi-token-acak-panjang
# CRON_SECRET=isi-secret-acak-panjang
# SYNC_WEBHOOK_DEBOUNCE_MINUTES=5
```

- [ ] **Step 5: Tulis panduan operasional awal**

Buat `docs/guides/sync-engine.md`:

```markdown
# Panduan Operasional Sync Engine

## Urutan deploy

1. Review `supabase/sync-engine.sql`.
2. Jalankan migration di Supabase SQL Editor setelah disetujui.
3. Isi `SYNC_TOKEN` dan `CRON_SECRET` di Vercel.
4. Deploy `main`.
5. Pastikan cron `/api/sync` muncul di Vercel → Settings → Cron Jobs.

## Pemicu

- Manual: tombol di `/sync`.
- Cron: setiap hari 19.00 UTC = 02.00 WIB.
- Webhook: `POST /api/sync` dengan header `x-sync-token`.

## Dry-run

`GET /api/sync?dryRun=1` atau toggle dry-run di `/sync`.

Dry-run tidak mengubah tabel bisnis, Storage, cache katalog, atau riwayat run.

## Troubleshooting

- `401` → token/cookie/CRON_SECRET tidak cocok.
- `409` → masih ada run aktif; tunggu maksimal 15 menit.
- `PARTIAL` → sebagian sumber gagal; lihat detail di `/sync`.
- Baris hilang dari sheet → menjadi `is_stale = true`, tidak dihapus.
```

- [ ] **Step 6: Verifikasi type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add supabase/sync-engine.sql vercel.json .env.example tsconfig.json docs/guides/sync-engine.md
git commit -m "feat(sync): skema dan konfigurasi sync engine"
```

---

## Task 2: Tipe inti dan registry sumber

**Files:**
- Create: `src/lib/sync-engine/types.ts`
- Create: `src/lib/sync-engine/registry.ts`
- Test: `src/lib/sync-engine/registry.test.mjs`

**Interfaces:**
- Produces: `SyncSourceKey`, `SyncRunStatus`, `SyncSourceStatus`, `SyncTrigger`, `RegionHealthMap`, `SourceRunResult`, `SyncSource`, `SyncContext`, `SyncRunOptions`, `RunSyncResponse`, `SyncStore`; `SOURCE_DEFINITIONS`, `resolveSourceOrder`.

- [ ] **Step 1: Tulis test registry yang gagal**

Buat `src/lib/sync-engine/registry.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_DEFINITIONS, resolveSourceOrder } from './registry.ts';

test('registry mendefinisikan tiga sumber', () => {
  assert.deepEqual(
    SOURCE_DEFINITIONS.map((s) => s.key),
    ['asset-requests', 'request-orders', 'master-catalog']
  );
});

test('tanpa permintaan berarti semua sumber', () => {
  assert.deepEqual(resolveSourceOrder(), {
    keys: ['asset-requests', 'request-orders', 'master-catalog'],
  });
});

test('dependensi ikut dimasukkan otomatis', () => {
  assert.deepEqual(resolveSourceOrder(['master-catalog']), {
    keys: ['asset-requests', 'master-catalog'],
  });
});

test('urutan mengikuti dependensi walau diminta terbalik', () => {
  assert.deepEqual(resolveSourceOrder(['master-catalog', 'asset-requests']), {
    keys: ['asset-requests', 'master-catalog'],
  });
});

test('sumber tidak dikenal ditolak', () => {
  const result = resolveSourceOrder(['asset-requests', 'tidak-ada']);
  assert.match(result.error, /tidak-ada/);
});

test('permintaan kosong dianggap semua sumber', () => {
  assert.deepEqual(resolveSourceOrder([]).keys, [
    'asset-requests',
    'request-orders',
    'master-catalog',
  ]);
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --test src/lib/sync-engine/registry.test.mjs`
Expected: FAIL karena `registry.ts` belum ada.

- [ ] **Step 3: Tulis `types.ts`**

```ts
export type SyncSourceKey = 'asset-requests' | 'request-orders' | 'master-catalog';
export type SyncRunStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
export type SyncSourceStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';
export type SyncTrigger = 'MANUAL' | 'CRON' | 'WEBHOOK';
export type SyncRegion = 'JABODETABEK' | 'KALBAR';

export interface RegionHealth {
  ok: boolean;
  count: number;
  error?: string;
}

export type RegionHealthMap = Partial<Record<SyncRegion, RegionHealth>>;

export interface SourceRunResult {
  key: SyncSourceKey;
  label: string;
  status: SyncSourceStatus;
  rowsFetched: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsStale: number;
  durationMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SyncContext {
  dryRun: boolean;
  force: boolean;
  runStartedAt: string;
  sourceOptions?: Record<string, unknown>;
}

export interface SyncSource {
  key: SyncSourceKey;
  label: string;
  dependsOn: SyncSourceKey[];
  run(ctx: SyncContext): Promise<Omit<SourceRunResult, 'key' | 'label' | 'durationMs'>>;
}

export interface SyncRunRecord {
  id: string;
  started_at: string;
  status: SyncRunStatus;
  trigger: SyncTrigger;
  dry_run: boolean;
}

export interface SyncRunSourceRecord extends SourceRunResult {
  id: string;
  run_id: string;
  started_at: string;
  finished_at: string;
}

export interface SyncRunOptions {
  sources?: string[];
  dryRun?: boolean;
  force?: boolean;
  trigger?: SyncTrigger;
  actorName?: string;
  sourceOptions?: Record<string, unknown>;
}

export interface RunSyncResponse {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  retryAfterMs?: number;
  runId?: string;
  status: SyncRunStatus;
  dryRun: boolean;
  trigger: SyncTrigger;
  durationMs: number;
  message: string;
  sources: SourceRunResult[];
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
  changed: boolean;
}

export interface SyncStore {
  findRunning(): Promise<SyncRunRecord | null>;
  expireRun(id: string, finishedAt: string, message: string): Promise<void>;
  createRun(input: {
    trigger: SyncTrigger;
    dryRun: boolean;
    actorName?: string;
    totalSources: number;
    startedAt: string;
  }): Promise<SyncRunRecord>;
  finishRun(
    id: string,
    patch: {
      status: SyncRunStatus;
      finishedAt: string;
      durationMs: number;
      okSources: number;
      failedSources: number;
      message: string;
    }
  ): Promise<void>;
  recordSource(
    runId: string,
    result: SourceRunResult,
    startedAt: string,
    finishedAt: string
  ): Promise<void>;
  lastRunStartedAt(dryRun: boolean): Promise<string | null>;
  getStatus(): Promise<unknown>;
  getHistory(limit: number): Promise<unknown>;
}
```

- [ ] **Step 4: Tulis `registry.ts`**

```ts
import type { SyncSourceKey } from './types.ts';

export interface SourceDefinition {
  key: SyncSourceKey;
  label: string;
  dependsOn: SyncSourceKey[];
}

export const SOURCE_DEFINITIONS: SourceDefinition[] = [
  { key: 'asset-requests', label: 'Aset (JABO + KALBAR)', dependsOn: [] },
  { key: 'request-orders', label: 'Request Order (JABO + KALBAR)', dependsOn: [] },
  { key: 'master-catalog', label: 'Master Katalog Item', dependsOn: ['asset-requests'] },
];

const DEFINITION_BY_KEY = new Map(SOURCE_DEFINITIONS.map((d) => [d.key, d]));

export function resolveSourceOrder(requested?: string[]): {
  keys: SyncSourceKey[];
  error?: string;
} {
  const raw = requested && requested.length > 0 ? requested : SOURCE_DEFINITIONS.map((d) => d.key);
  const invalid = raw.filter((key) => !DEFINITION_BY_KEY.has(key as SyncSourceKey));
  if (invalid.length > 0) {
    return {
      keys: [],
      error: `Sumber tidak dikenal: ${invalid.join(', ')}. Pilihan: ${SOURCE_DEFINITIONS.map((d) => d.key).join(', ')}`,
    };
  }

  const requestedSet = new Set(raw as SyncSourceKey[]);
  const withDependencies = new Set<SyncSourceKey>();
  const addWithDeps = (key: SyncSourceKey) => {
    if (withDependencies.has(key)) return;
    withDependencies.add(key);
    for (const dep of DEFINITION_BY_KEY.get(key)!.dependsOn) addWithDeps(dep);
  };
  for (const key of requestedSet) addWithDeps(key);

  const ordered: SyncSourceKey[] = [];
  const visited = new Set<SyncSourceKey>();
  const visit = (key: SyncSourceKey) => {
    if (visited.has(key)) return;
    for (const dep of DEFINITION_BY_KEY.get(key)!.dependsOn) {
      if (withDependencies.has(dep)) visit(dep);
    }
    visited.add(key);
    ordered.push(key);
  };
  for (const def of SOURCE_DEFINITIONS) {
    if (withDependencies.has(def.key)) visit(def.key);
  }

  return { keys: ordered };
}
```

- [ ] **Step 5: Jalankan test**

Run: `node --test src/lib/sync-engine/registry.test.mjs`
Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync-engine/types.ts src/lib/sync-engine/registry.ts src/lib/sync-engine/registry.test.mjs
git commit -m "feat(sync): tipe inti dan registry sumber"
```

---

## Task 3: Status, debounce, dan scope stale

**Files:**
- Create: `src/lib/sync-engine/status.ts`
- Create: `src/lib/sync-engine/debounce.ts`
- Create: `src/lib/sync-engine/stale.ts`
- Test: `src/lib/sync-engine/status.test.mjs`
- Test: `src/lib/sync-engine/debounce.test.mjs`
- Test: `src/lib/sync-engine/stale.test.mjs`

**Interfaces:**
- Produces: `aggregateRunStatus(results)`, `isRunExpired(startedAt, now, ttlMs)`, `shouldDebounce(lastStartedAt, now, windowMs)`, `staleRegionScope(regions)`.

- [ ] **Step 1: Tulis test status**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRunStatus, isRunExpired } from './status.ts';

const ok = { status: 'SUCCESS' };
const failed = { status: 'FAILED' };
const skipped = { status: 'SKIPPED' };

test('semua sukses menjadi SUCCESS', () => {
  assert.equal(aggregateRunStatus([ok, ok]), 'SUCCESS');
});

test('sebagian gagal menjadi PARTIAL', () => {
  assert.equal(aggregateRunStatus([ok, failed]), 'PARTIAL');
});

test('semua gagal menjadi FAILED', () => {
  assert.equal(aggregateRunStatus([failed, failed]), 'FAILED');
});

test('tidak ada hasil menjadi FAILED', () => {
  assert.equal(aggregateRunStatus([]), 'FAILED');
});

test('sukses dengan skipped tetap SUCCESS', () => {
  assert.equal(aggregateRunStatus([ok, skipped]), 'SUCCESS');
});

test('hanya skipped menjadi FAILED', () => {
  assert.equal(aggregateRunStatus([skipped]), 'FAILED');
});

test('run lebih tua dari 15 menit dianggap kedaluwarsa', () => {
  const now = new Date('2026-11-05T10:00:00.000Z');
  assert.equal(isRunExpired('2026-11-05T09:44:59.000Z', now), true);
  assert.equal(isRunExpired('2026-11-05T09:45:01.000Z', now), false);
});
```

- [ ] **Step 2: Tulis test debounce dan stale**

`debounce.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldDebounce } from './debounce.ts';

test('webhook dalam 5 menit di-debounce', () => {
  const now = new Date('2026-11-05T10:00:00.000Z');
  assert.equal(shouldDebounce('2026-11-05T09:56:00.000Z', now), true);
});

test('webhook setelah 5 menit dijalankan', () => {
  const now = new Date('2026-11-05T10:00:00.000Z');
  assert.equal(shouldDebounce('2026-11-05T09:54:59.000Z', now), false);
});

test('belum pernah run tidak di-debounce', () => {
  assert.equal(shouldDebounce(null, new Date()), false);
});
```

`stale.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { staleRegionScope } from './stale.ts';

test('kedua region sehat berarti scope ALL', () => {
  assert.equal(
    staleRegionScope({
      JABODETABEK: { ok: true, count: 10 },
      KALBAR: { ok: true, count: 20 },
    }),
    'ALL'
  );
});

test('hanya JABO sehat berarti scope JABODETABEK', () => {
  assert.equal(
    staleRegionScope({
      JABODETABEK: { ok: true, count: 10 },
      KALBAR: { ok: false, count: 0, error: 'HTTP 500' },
    }),
    'JABODETABEK'
  );
});

test('hanya KALBAR sehat berarti scope KALBAR', () => {
  assert.equal(
    staleRegionScope({
      JABODETABEK: { ok: false, count: 0 },
      KALBAR: { ok: true, count: 20 },
    }),
    'KALBAR'
  );
});

test('kedua region gagal berarti NONE', () => {
  assert.equal(
    staleRegionScope({
      JABODETABEK: { ok: false, count: 0 },
      KALBAR: { ok: false, count: 0 },
    }),
    'NONE'
  );
});

test('region tidak diketahui berarti NONE', () => {
  assert.equal(staleRegionScope({}), 'NONE');
});
```

- [ ] **Step 3: Jalankan test untuk memastikan gagal**

Run: `node --test src/lib/sync-engine/status.test.mjs src/lib/sync-engine/debounce.test.mjs src/lib/sync-engine/stale.test.mjs`
Expected: FAIL karena modul belum ada.

- [ ] **Step 4: Tulis implementasi**

`status.ts`:

```ts
import type { SyncRunStatus, SyncSourceStatus } from './types.ts';

const RUN_TTL_MS = 15 * 60 * 1000;

export function aggregateRunStatus(
  results: Array<{ status: SyncSourceStatus }>
): SyncRunStatus {
  if (results.length === 0) return 'FAILED';
  const success = results.filter((r) => r.status === 'SUCCESS').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  if (success > 0 && failed > 0) return 'PARTIAL';
  if (failed > 0) return 'FAILED';
  if (success > 0) return 'SUCCESS';
  return 'FAILED';
}

export function isRunExpired(
  startedAt: string,
  now: Date = new Date(),
  ttlMs: number = RUN_TTL_MS
): boolean {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return true;
  return now.getTime() - started > ttlMs;
}
```

`debounce.ts`:

```ts
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
```

`stale.ts`:

```ts
import type { RegionHealthMap } from './types.ts';

export type StaleScope = 'ALL' | 'JABODETABEK' | 'KALBAR' | 'NONE';

export function staleRegionScope(regions: RegionHealthMap): StaleScope {
  const jabo = regions.JABODETABEK?.ok === true;
  const kalbar = regions.KALBAR?.ok === true;
  if (!jabo && !kalbar) return 'NONE';
  if (jabo && kalbar) return 'ALL';
  return jabo ? 'JABODETABEK' : 'KALBAR';
}
```

- [ ] **Step 5: Jalankan test**

Run: `node --test src/lib/sync-engine/status.test.mjs src/lib/sync-engine/debounce.test.mjs src/lib/sync-engine/stale.test.mjs`
Expected: semua PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync-engine/status.ts src/lib/sync-engine/debounce.ts src/lib/sync-engine/stale.ts src/lib/sync-engine/*.test.mjs
git commit -m "feat(sync): status run, debounce, dan scope stale"
```

---

## Task 4: Auth cron pada sync guard

**Files:**
- Modify: `src/lib/auth/sync-guard.ts`
- Test: `src/lib/auth/sync-guard.test.mjs`

**Interfaces:**
- Produces: `isSyncRequestAllowed` menerima `Authorization: Bearer <CRON_SECRET>`.

- [ ] **Step 1: Tambah test yang gagal**

Tambahkan ke `src/lib/auth/sync-guard.test.mjs`:

```js
test('CRON_SECRET yang benar mengizinkan cron', () => {
  process.env.CRON_SECRET = 'cron-rahasia';
  assert.equal(
    isSyncRequestAllowed(makeRequest({ authorization: 'Bearer cron-rahasia' })),
    true
  );
  delete process.env.CRON_SECRET;
});

test('CRON_SECRET yang salah ditolak', () => {
  process.env.CRON_SECRET = 'cron-rahasia';
  assert.equal(
    isSyncRequestAllowed(makeRequest({ authorization: 'Bearer salah' })),
    false
  );
  delete process.env.CRON_SECRET;
});
```

Ubah `makeRequest` agar mendukung header authorization:

```js
function makeRequest(options) {
  return {
    headers: {
      get: (name) => {
        const key = name.toLowerCase();
        if (key === 'x-sync-token') return options.tokenHeader ?? null;
        if (key === 'authorization') return options.authorization ?? null;
        return null;
      },
    },
    cookies: {
      get: (name) =>
        name === 'ca_auth' && options.cookie !== undefined ? { value: options.cookie } : undefined,
    },
    nextUrl: {
      searchParams: {
        get: (name) => (name === 'token' ? options.tokenQuery ?? null : null),
      },
    },
  };
}
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --test src/lib/auth/sync-guard.test.mjs`
Expected: test CRON_SECRET FAIL.

- [ ] **Step 3: Implementasi**

Di `src/lib/auth/sync-guard.ts`, tambahkan sebelum pengecekan cookie:

```ts
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) {
    return true;
  }
```

- [ ] **Step 4: Jalankan test**

Run: `node --test src/lib/auth/sync-guard.test.mjs`
Expected: semua PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/sync-guard.ts src/lib/auth/sync-guard.test.mjs
git commit -m "feat(sync): izinkan Vercel Cron lewat CRON_SECRET"
```

---

## Task 5: Store Supabase dan lock run

**Files:**
- Create: `src/lib/sync-engine/lock.ts`
- Create: `src/lib/sync-engine/store.ts`
- Test: `src/lib/sync-engine/lock.test.mjs`

**Interfaces:**
- Consumes: `SyncStore`, `SyncRunRecord`, `isRunExpired`.
- Produces: `acquireRun(store, input, now)` → `{ ok: true; run } | { ok: false; reason: 'locked'; run }`; `SupabaseSyncStore`.

- [ ] **Step 1: Tulis test lock**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireRun } from './lock.ts';

function makeStore(running = null) {
  const state = {
    running,
    expired: [],
    created: [],
  };
  return {
    state,
    async findRunning() {
      return state.running;
    },
    async expireRun(id, finishedAt, message) {
      state.expired.push({ id, finishedAt, message });
      state.running = null;
    },
    async createRun(input) {
      const run = { id: 'run-baru', status: 'RUNNING', ...input };
      state.created.push(run);
      state.running = run;
      return run;
    },
    async finishRun() {},
    async recordSource() {},
    async lastRunStartedAt() {
      return null;
    },
    async getStatus() {
      return null;
    },
    async getHistory() {
      return [];
    },
  };
}

const input = {
  trigger: 'MANUAL',
  dryRun: false,
  actorName: 'Tester',
  totalSources: 3,
};

test('lock berhasil saat tidak ada run aktif', async () => {
  const store = makeStore();
  const result = await acquireRun(store, input, new Date('2026-11-05T10:00:00.000Z'));
  assert.equal(result.ok, true);
  assert.equal(result.run.id, 'run-baru');
});

test('lock menolak saat run aktif masih segar', async () => {
  const running = {
    id: 'run-lama',
    started_at: '2026-11-05T09:55:00.000Z',
    status: 'RUNNING',
    trigger: 'MANUAL',
    dry_run: false,
  };
  const store = makeStore(running);
  const result = await acquireRun(store, input, new Date('2026-11-05T10:00:00.000Z'));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'locked');
});

test('run kedaluwarsa di-expire lalu run baru dibuat', async () => {
  const running = {
    id: 'run-lama',
    started_at: '2026-11-05T09:30:00.000Z',
    status: 'RUNNING',
    trigger: 'MANUAL',
    dry_run: false,
  };
  const store = makeStore(running);
  const result = await acquireRun(store, input, new Date('2026-11-05T10:00:00.000Z'));
  assert.equal(result.ok, true);
  assert.equal(store.state.expired.length, 1);
  assert.equal(store.state.expired[0].id, 'run-lama');
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --test src/lib/sync-engine/lock.test.mjs`
Expected: FAIL karena `lock.ts` belum ada.

- [ ] **Step 3: Tulis `lock.ts`**

```ts
import type { SyncRunRecord, SyncStore, SyncTrigger } from './types.ts';
import { isRunExpired } from './status.ts';

export interface AcquireRunInput {
  trigger: SyncTrigger;
  dryRun: boolean;
  actorName?: string;
  totalSources: number;
}

export async function acquireRun(
  store: SyncStore,
  input: AcquireRunInput,
  now: Date = new Date()
): Promise<{ ok: true; run: SyncRunRecord } | { ok: false; reason: 'locked'; run: SyncRunRecord }> {
  const existing = await store.findRunning();
  if (existing) {
    if (!isRunExpired(existing.started_at, now)) {
      return { ok: false, reason: 'locked', run: existing };
    }
    await store.expireRun(
      existing.id,
      now.toISOString(),
      'Run kedaluwarsa: tidak selesai dalam 15 menit.'
    );
  }

  try {
    const run = await store.createRun({
      trigger: input.trigger,
      dryRun: input.dryRun,
      actorName: input.actorName,
      totalSources: input.totalSources,
      startedAt: now.toISOString(),
    });
    return { ok: true, run };
  } catch (error: any) {
    if (error?.code === '23505') {
      const concurrent = await store.findRunning();
      if (concurrent) return { ok: false, reason: 'locked', run: concurrent };
    }
    throw error;
  }
}
```

- [ ] **Step 4: Tulis `store.ts`**

```ts
import { getAdminClient } from '@/lib/supabase/server';
import type {
  SourceRunResult,
  SyncRunOptions,
  SyncRunRecord,
  SyncStore,
  SyncTrigger,
} from './types.ts';

function client() {
  const admin = getAdminClient();
  if (!admin) throw new Error('Supabase belum dikonfigurasi di server.');
  return admin;
}

export class SupabaseSyncStore implements SyncStore {
  async findRunning(): Promise<SyncRunRecord | null> {
    const { data, error } = await client()
      .from('sync_runs')
      .select('id,started_at,status,trigger,dry_run')
      .eq('status', 'RUNNING')
      .order('started_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SyncRunRecord | null) ?? null;
  }

  async expireRun(id: string, finishedAt: string, message: string): Promise<void> {
    const { error } = await client()
      .from('sync_runs')
      .update({ status: 'FAILED', finished_at: finishedAt, message })
      .eq('id', id)
      .eq('status', 'RUNNING');
    if (error) throw new Error(error.message);
  }

  async createRun(input: {
    trigger: SyncTrigger;
    dryRun: boolean;
    actorName?: string;
    totalSources: number;
    startedAt: string;
  }): Promise<SyncRunRecord> {
    const { data, error } = await client()
      .from('sync_runs')
      .insert({
        trigger: input.trigger,
        dry_run: input.dryRun,
        actor_name: input.actorName || 'System',
        total_sources: input.totalSources,
        started_at: input.startedAt,
        status: 'RUNNING',
      })
      .select('id,started_at,status,trigger,dry_run')
      .single();
    if (error) throw error;
    return data as SyncRunRecord;
  }

  async finishRun(
    id: string,
    patch: {
      status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
      finishedAt: string;
      durationMs: number;
      okSources: number;
      failedSources: number;
      message: string;
    }
  ): Promise<void> {
    const { error } = await client()
      .from('sync_runs')
      .update({
        status: patch.status,
        finished_at: patch.finishedAt,
        duration_ms: patch.durationMs,
        ok_sources: patch.okSources,
        failed_sources: patch.failedSources,
        message: patch.message,
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async recordSource(
    runId: string,
    result: SourceRunResult,
    startedAt: string,
    finishedAt: string
  ): Promise<void> {
    const { error } = await client().from('sync_run_sources').insert({
      run_id: runId,
      source_key: result.key,
      status: result.status,
      rows_fetched: result.rowsFetched,
      rows_inserted: result.rowsInserted,
      rows_updated: result.rowsUpdated,
      rows_skipped: result.rowsSkipped,
      rows_stale: result.rowsStale,
      duration_ms: result.durationMs,
      error_message: result.status === 'FAILED' ? result.message : null,
      details: result.details || {},
      started_at: startedAt,
      finished_at: finishedAt,
    });
    if (error) throw new Error(error.message);
  }

  async lastRunStartedAt(dryRun: boolean): Promise<string | null> {
    const { data, error } = await client()
      .from('sync_runs')
      .select('started_at')
      .eq('dry_run', dryRun)
      .neq('status', 'RUNNING')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.started_at ?? null;
  }

  async getStatus(): Promise<unknown> {
    const admin = client();
    const [{ data: latestRun }, { data: sources }] = await Promise.all([
      admin
        .from('sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10),
      admin
        .from('sync_run_sources')
        .select('*')
        .order('finished_at', { ascending: false })
        .limit(20),
    ]);
    return { runs: latestRun || [], sources: sources || [] };
  }

  async getHistory(limit: number): Promise<unknown> {
    const { data, error } = await client()
      .from('sync_runs')
      .select('*, sync_run_sources(*)')
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  }
}

export type SyncRequestOptions = SyncRunOptions;
```

- [ ] **Step 5: Jalankan test dan type check**

Run: `node --test src/lib/sync-engine/lock.test.mjs`
Expected: 3 tests PASS.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync-engine/lock.ts src/lib/sync-engine/store.ts src/lib/sync-engine/lock.test.mjs
git commit -m "feat(sync): store Supabase dan lock run"
```

---

## Task 6: Orchestrator engine

**Files:**
- Create: `src/lib/sync-engine/engine.ts`
- Test: `src/lib/sync-engine/engine.test.mjs`

**Interfaces:**
- Consumes: `resolveSourceOrder`, `acquireRun`, `aggregateRunStatus`, `shouldDebounce`, `SyncStore`, `SyncSource`.
- Produces: `runSync(options, deps)` → `RunSyncResponse`.

- [ ] **Step 1: Tulis test engine**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSync } from './engine.ts';

function makeStore(overrides = {}) {
  const state = { created: [], sources: [], finished: [], running: null };
  return {
    state,
    async findRunning() {
      return state.running;
    },
    async expireRun() {},
    async createRun(input) {
      const run = { id: 'run-1', status: 'RUNNING', ...input };
      state.created.push(run);
      return run;
    },
    async finishRun(id, patch) {
      state.finished.push({ id, ...patch });
    },
    async recordSource(runId, result) {
      state.sources.push({ runId, ...result });
    },
    async lastRunStartedAt() {
      return overrides.lastRunStartedAt ?? null;
    },
    async getStatus() {
      return null;
    },
    async getHistory() {
      return [];
    },
  };
}

function makeSource(key, dependsOn, runImpl) {
  return {
    key,
    label: key,
    dependsOn,
    async run(ctx) {
      return runImpl ? runImpl(ctx) : {
        status: 'SUCCESS',
        rowsFetched: 1,
        rowsInserted: 1,
        rowsUpdated: 0,
        rowsSkipped: 0,
        rowsStale: 0,
      };
    },
  };
}

const baseSources = [
  makeSource('asset-requests', []),
  makeSource('request-orders', []),
  makeSource('master-catalog', ['asset-requests']),
];

test('menjalankan semua sumber dan mencatat hasil', async () => {
  const store = makeStore();
  const result = await runSync(
    { trigger: 'MANUAL' },
    { store, sources: baseSources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.sources.length, 3);
  assert.equal(store.state.created.length, 1);
  assert.equal(store.state.sources.length, 3);
  assert.equal(store.state.finished.length, 1);
});

test('sumber turunan SKIPPED bila dependensi gagal', async () => {
  const sources = [
    makeSource('asset-requests', [], async () => ({
      status: 'FAILED',
      rowsFetched: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      rowsStale: 0,
      message: 'sheet gagal',
    })),
    makeSource('request-orders', []),
    makeSource('master-catalog', ['asset-requests']),
  ];
  const store = makeStore();
  const result = await runSync(
    { trigger: 'MANUAL' },
    { store, sources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.status, 'PARTIAL');
  const master = result.sources.find((s) => s.key === 'master-catalog');
  assert.equal(master.status, 'SKIPPED');
});

test('error tak terduga menjadi FAILED dan run tetap ditutup', async () => {
  const sources = [
    makeSource('asset-requests', [], async () => {
      throw new Error('boom');
    }),
  ];
  const store = makeStore();
  const result = await runSync(
    { trigger: 'MANUAL', sources: ['asset-requests'] },
    { store, sources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.status, 'FAILED');
  assert.equal(store.state.finished.length, 1);
});

test('dry-run tidak membuat run atau menulis riwayat', async () => {
  const store = makeStore();
  const result = await runSync(
    { trigger: 'MANUAL', dryRun: true },
    { store, sources: baseSources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.dryRun, true);
  assert.equal(store.state.created.length, 0);
  assert.equal(store.state.sources.length, 0);
});

test('webhook dalam 5 menit di-debounce', async () => {
  const store = makeStore({ lastRunStartedAt: '2026-11-05T09:58:00.000Z' });
  const result = await runSync(
    { trigger: 'WEBHOOK' },
    { store, sources: baseSources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'debounced');
  assert.equal(store.state.created.length, 0);
});

test('lock aktif mengembalikan 409-style result', async () => {
  const store = makeStore();
  store.state.running = {
    id: 'run-lama',
    started_at: '2026-11-05T09:59:00.000Z',
    status: 'RUNNING',
    trigger: 'MANUAL',
    dry_run: false,
  };
  const result = await runSync(
    { trigger: 'MANUAL' },
    { store, sources: baseSources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'locked');
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --test src/lib/sync-engine/engine.test.mjs`
Expected: FAIL karena `engine.ts` belum ada.

- [ ] **Step 3: Implementasi `engine.ts`**

```ts
import type {
  RunSyncResponse,
  SourceRunResult,
  SyncContext,
  SyncRunOptions,
  SyncSource,
  SyncStore,
} from './types.ts';
import { resolveSourceOrder } from './registry.ts';
import { acquireRun } from './lock.ts';
import { aggregateRunStatus, isRunExpired } from './status.ts';
import { shouldDebounce } from './debounce.ts';

export interface EngineDeps {
  store: SyncStore;
  sources: SyncSource[];
  now?: () => Date;
}

const DEFAULT_DEBOUNCE_MINUTES = 5;

function debounceMs(): number {
  const minutes = Number(process.env.SYNC_WEBHOOK_DEBOUNCE_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_DEBOUNCE_MINUTES) * 60 * 1000;
}

function emptyResult(
  key: SyncSource['key'],
  label: string,
  status: SourceRunResult['status'],
  message: string
): SourceRunResult {
  return {
    key,
    label,
    status,
    rowsFetched: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    rowsStale: 0,
    durationMs: 0,
    message,
  };
}

function summarize(results: SourceRunResult[]): {
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
  changed: boolean;
  message: string;
} {
  const totalFetched = results.reduce((sum, r) => sum + r.rowsFetched, 0);
  const totalInserted = results.reduce((sum, r) => sum + r.rowsInserted, 0);
  const totalUpdated = results.reduce((sum, r) => sum + r.rowsUpdated, 0);
  const failed = results.filter((r) => r.status === 'FAILED');
  return {
    totalFetched,
    totalInserted,
    totalUpdated,
    changed: totalInserted + totalUpdated > 0,
    message:
      failed.length === 0
        ? `Sync selesai: ${totalFetched} baris dibaca, ${totalInserted + totalUpdated} baris ditulis.`
        : `Sync selesai dengan ${failed.length} sumber gagal: ${failed
            .map((r) => `${r.key} (${r.message || 'error'})`)
            .join('; ')}`,
  };
}

export async function runSync(
  options: SyncRunOptions,
  deps: EngineDeps
): Promise<RunSyncResponse> {
  const now = deps.now || (() => new Date());
  const trigger = options.trigger || 'MANUAL';
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();

  const order = resolveSourceOrder(options.sources);
  const emptyResponse = (message: string): RunSyncResponse => ({
    success: false,
    status: 'FAILED',
    dryRun,
    trigger,
    durationMs: 0,
    message,
    sources: [],
    totalFetched: 0,
    totalInserted: 0,
    totalUpdated: 0,
    changed: false,
  });

  if (order.error) return emptyResponse(order.error);

  const sourceMap = new Map(deps.sources.map((s) => [s.key, s]));
  const missing = order.keys.filter((key) => !sourceMap.has(key));
  if (missing.length > 0) {
    return emptyResponse(`Sumber belum terdaftar di engine: ${missing.join(', ')}`);
  }

  if (trigger === 'WEBHOOK' && !dryRun) {
    const last = await deps.store.lastRunStartedAt(false);
    if (shouldDebounce(last, startedAtDate, debounceMs())) {
      return {
        success: true,
        skipped: true,
        reason: 'debounced',
        retryAfterMs: debounceMs(),
        status: 'SUCCESS',
        dryRun,
        trigger,
        durationMs: 0,
        message: 'Webhook diabaikan karena sync terakhir baru saja berjalan.',
        sources: [],
        totalFetched: 0,
        totalInserted: 0,
        totalUpdated: 0,
        changed: false,
      };
    }
  }

  let runId: string | undefined;
  if (!dryRun) {
    const lock = await acquireRun(
      deps.store,
      {
        trigger,
        dryRun,
        actorName: options.actorName,
        totalSources: order.keys.length,
      },
      startedAtDate
    );
    if (!lock.ok) {
      return {
        success: false,
        skipped: true,
        reason: 'locked',
        status: 'RUNNING',
        dryRun,
        trigger,
        durationMs: 0,
        message: `Sync sedang berjalan sejak ${lock.run.started_at}.`,
        sources: [],
        totalFetched: 0,
        totalInserted: 0,
        totalUpdated: 0,
        changed: false,
      };
    }
    runId = lock.run.id;
  }

  const results: SourceRunResult[] = [];
  const resultByKey = new Map<string, SourceRunResult>();

  const finish = async (finalResults: SourceRunResult[]): Promise<RunSyncResponse> => {
    const status = aggregateRunStatus(finalResults);
    const finishedAt = now().toISOString();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
    const summary = summarize(finalResults);
    const okSources = finalResults.filter((r) => r.status === 'SUCCESS').length;
    const failedSources = finalResults.filter((r) => r.status === 'FAILED').length;

    if (runId) {
      await deps.store.finishRun(runId, {
        status,
        finishedAt,
        durationMs,
        okSources,
        failedSources,
        message: summary.message,
      });
    }

    return {
      success: status === 'SUCCESS' || status === 'PARTIAL',
      runId,
      status,
      dryRun,
      trigger,
      durationMs,
      message: summary.message,
      sources: finalResults,
      ...summary,
    };
  };

  try {
    for (const key of order.keys) {
      const source = sourceMap.get(key)!;
      const blocked = source.dependsOn.some((dep) => {
        const depResult = resultByKey.get(dep);
        return depResult && depResult.status !== 'SUCCESS';
      });
      if (blocked) {
        const skipped = emptyResult(
          key,
          source.label,
          'SKIPPED',
          'Dilewati karena sumber dependensi gagal.'
        );
        results.push(skipped);
        resultByKey.set(key, skipped);
        if (runId) {
          await deps.store.recordSource(runId, skipped, startedAt, now().toISOString());
        }
        continue;
      }

      const sourceStarted = now();
      try {
        const ctx: SyncContext = {
          dryRun,
          force,
          runStartedAt: startedAt,
          sourceOptions: options.sourceOptions,
        };
        const partial = await source.run(ctx);
        const result: SourceRunResult = {
          key,
          label: source.label,
          durationMs: Math.max(0, now().getTime() - sourceStarted.getTime()),
          ...partial,
        } as SourceRunResult;
        results.push(result);
        resultByKey.set(key, result);
        if (runId) {
          await deps.store.recordSource(runId, result, sourceStarted.toISOString(), now().toISOString());
        }
      } catch (error: any) {
        const failed = emptyResult(key, source.label, 'FAILED', error?.message || 'Gagal sync.');
        failed.durationMs = Math.max(0, now().getTime() - sourceStarted.getTime());
        results.push(failed);
        resultByKey.set(key, failed);
        if (runId) {
          await deps.store.recordSource(runId, failed, sourceStarted.toISOString(), now().toISOString());
        }
      }
    }

    return await finish(results);
  } catch (error: any) {
    if (runId) {
      await deps.store.finishRun(runId, {
        status: 'FAILED',
        finishedAt: now().toISOString(),
        durationMs: Math.max(0, now().getTime() - startedAtDate.getTime()),
        okSources: results.filter((r) => r.status === 'SUCCESS').length,
        failedSources: results.filter((r) => r.status === 'FAILED').length,
        message: error?.message || 'Engine gagal.',
      });
    }
    throw error;
  }
}
```

- [ ] **Step 4: Jalankan test**

Run: `node --test src/lib/sync-engine/engine.test.mjs`
Expected: 6 tests PASS.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync-engine/engine.ts src/lib/sync-engine/engine.test.mjs
git commit -m "feat(sync): orchestrator engine dengan lock dan dry-run"
```

---

## Task 7: Region health, `last_seen_at`, dan dry-run di fungsi legacy

**Files:**
- Modify: `src/lib/sync/sheet-fetcher.ts:431-459`
- Modify: `src/lib/supabase/server.ts:424-600`
- Modify: `src/lib/supabase/server.ts:2830-3137`
- Modify: `src/lib/supabase/server.ts:4051-4333`

**Interfaces:**
- Produces: `fetchAllSheetsData()` dengan `regions`; `syncGoogleSheetsToSupabase()` dengan `regions` + payload `last_seen_at`/`is_stale`; `syncRequestOrdersFromSheet({ dryRun })` + `regions`; `syncMasterAssetCatalogFromSheet({ dryRun })`.

- [ ] **Step 1: Tambah region health di `fetchAllSheetsData`**

Ganti blok `Promise.all` dan return di `src/lib/sync/sheet-fetcher.ts` menjadi:

```ts
  const [jaboRes, kalbarRes] = await Promise.all([
    fetchJaboData()
      .then((res) => ({ ok: true, ...res }))
      .catch((err) => {
        console.error('Error fetching JABO sheet:', err);
        return { ok: false, items: [] as AssetRequest[], rawText: '', error: err?.message || String(err) };
      }),
    fetchKalbarData()
      .then((res) => ({ ok: true, ...res }))
      .catch((err) => {
        console.error('Error fetching KALBAR sheet:', err);
        return { ok: false, items: [] as AssetRequest[], rawText: '', error: err?.message || String(err) };
      }),
  ]);

  const combined = [...jaboRes.items, ...kalbarRes.items];
  const contentHash = computeStringHash(jaboRes.rawText + '::' + kalbarRes.rawText);

  return {
    items: combined,
    stats: {
      jaboCount: jaboRes.items.length,
      kalbarCount: kalbarRes.items.length,
      totalCount: combined.length,
    },
    regions: {
      JABODETABEK: { ok: jaboRes.ok, count: jaboRes.items.length, error: 'error' in jaboRes ? jaboRes.error : undefined },
      KALBAR: { ok: kalbarRes.ok, count: kalbarRes.items.length, error: 'error' in kalbarRes ? kalbarRes.error : undefined },
    },
    contentHash,
  };
```

Ubah signature menjadi:

```ts
export async function fetchAllSheetsData(): Promise<{
  items: AssetRequest[];
  stats: { jaboCount: number; kalbarCount: number; totalCount: number };
  regions: {
    JABODETABEK: { ok: boolean; count: number; error?: string };
    KALBAR: { ok: boolean; count: number; error?: string };
  };
  contentHash: string;
}>
```

- [ ] **Step 2: Tambah `regions` dan payload stale di sync aset**

Di `syncGoogleSheetsToSupabase`, tambahkan `regions` ke tipe return:

```ts
  regions?: {
    JABODETABEK: { ok: boolean; count: number; error?: string };
    KALBAR: { ok: boolean; count: number; error?: string };
  };
```

Destructure:

```ts
    const { items, stats, contentHash, regions } = await fetchAllSheetsData();
```

Tambahkan `regions` pada setiap return (hash short-circuit, online, offline, catch):

```ts
        regions,
```

Pada chunk upsert, ubah return map menjadi:

```ts
            return {
              ...mergeManualAssetEdit(rest, manualEdit),
              last_seen_at: syncTimestamp,
              is_stale: false,
              updated_at: syncTimestamp,
            };
```

- [ ] **Step 3: Tambah `regions` dan dry-run di sync RO**

Di `RoSyncResult`, tambahkan:

```ts
  regions?: Partial<Record<'JABODETABEK' | 'KALBAR', { ok: boolean; count: number; error?: string }>>;
```

Di opsi `syncRequestOrdersFromSheet`, tambahkan:

```ts
    dryRun?: boolean;
```

Tambahkan pelacakan region sebelum loop:

```ts
    const regionHealth: Partial<Record<'JABODETABEK' | 'KALBAR', { ok: boolean; count: number; error?: string }>> = {};
```

Di dalam `for (const source of RO_SOURCES)`, catat jumlah baris sebelum loop:

```ts
      const rowsBefore = totalRowsScanned;
```

Pada akhir blok `try` per source, tambahkan:

```ts
        regionHealth[source.region] = {
          ok: true,
          count: totalRowsScanned - rowsBefore,
        };
```

Di blok `catch (sourceErr: any)`, tambahkan:

```ts
        regionHealth[source.region] = {
          ok: false,
          count: totalRowsScanned - rowsBefore,
          error: sourceErr?.message || String(sourceErr),
        };
```

Ubah kondisi tulis database:

```ts
    if (!options.dryRun && admin && uniqueOrders.length > 0) {
```

Ubah `else if` cache:

```ts
    } else if (!options.dryRun && !options.startDate && !options.endDate) {
```

Pada `writeChunks`, ubah map menjadi:

```ts
            .map((row) => ({
              ...row,
              updated_at: writeTimestamp,
              last_seen_at: runStartedAt,
              is_stale: false,
            }));
```

Tambahkan sebelum penulisan:

```ts
        const runStartedAt = new Date().toISOString();
```

dan gunakan `runStartedAt` untuk semua chunk dalam run tersebut (letakkan di luar `writeChunks` agar konsisten):

```ts
      const runStartedAt = new Date().toISOString();
      const writeChunks = async (rows: any[], label: string) => {
```

Tambahkan `regions: regionHealth` dan `dryRun: options.dryRun === true` pada return sukses dan gagal.

- [ ] **Step 4: Tambah dry-run di master catalog**

Ubah signature:

```ts
export async function syncMasterAssetCatalogFromSheet(
  options: { dryRun?: boolean } = {}
): Promise<{
  success: boolean;
  totalItems: number;
  classifications: string[];
  message: string;
}>
```

Bungkus dua blok mutasi cache/override:

```ts
    if (!options.dryRun) {
      cachedMasterCatalog = items;
      masterCatalogLastFetched = Date.now();
    }
```

Untuk setiap pemanggilan `setItemImageOverride` dan `setItemSpecificationOverride`, ubah menjadi:

```ts
if (!options.dryRun) setItemImageOverride(name, url);
```

dan

```ts
if (!options.dryRun) setItemSpecificationOverride(name, spec);
```

Pastikan semua pemanggilan di fungsi tersebut (sekitar baris 4106, 4111, 4183, 4186, 4251, 4252) dibungkus dengan `if (!options.dryRun)`.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0. Perbaiki semua pemanggil yang terdampak bila ada.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync/sheet-fetcher.ts src/lib/supabase/server.ts
git commit -m "feat(sync): region health, last_seen_at, dan dry-run sumber legacy"
```

---

## Task 8: Adapter sumber dan penandaan stale

**Files:**
- Create: `src/lib/sync-engine/stale-store.ts`
- Create: `src/lib/sync-engine/sources/asset-requests.ts`
- Create: `src/lib/sync-engine/sources/request-orders.ts`
- Create: `src/lib/sync-engine/sources/master-catalog.ts`
- Create: `src/lib/sync-engine/sources/index.ts`
- Create: `src/lib/sync-engine/index.ts`

**Interfaces:**
- Produces: `SYNC_SOURCES: SyncSource[]`; `markAssetRowsStale`, `markRoRowsStale`.

- [ ] **Step 1: Tulis `stale-store.ts`**

```ts
import { getAdminClient } from '@/lib/supabase/server';
import type { RegionHealthMap } from './types.ts';
import { staleRegionScope } from './stale.ts';

const NULL_OR_OLDER = (runStartedAt: string) =>
  `last_seen_at.is.null,last_seen_at.lt.${runStartedAt}`;

function isMissingColumnError(message?: string): boolean {
  return Boolean(message && /last_seen_at|is_stale/.test(message));
}

export async function markAssetRowsStale(
  runStartedAt: string,
  regions: RegionHealthMap
): Promise<number> {
  const admin = getAdminClient();
  if (!admin) return 0;
  const scope = staleRegionScope(regions);
  if (scope === 'NONE') return 0;

  const prefixes = scope === 'ALL' ? ['JABO-ROW', 'KALBAR-ROW'] : [
    scope === 'JABODETABEK' ? 'JABO-ROW' : 'KALBAR-ROW',
  ];

  let total = 0;
  for (const prefix of prefixes) {
    const { data, error } = await admin
      .from('asset_requests')
      .update({ is_stale: true })
      .like('external_id', `${prefix}%`)
      .eq('is_stale', false)
      .or(NULL_OR_OLDER(runStartedAt))
      .select('id');
    if (error) {
      if (!isMissingColumnError(error.message)) {
        console.warn('[sync] Gagal menandai aset stale:', error.message);
      }
      continue;
    }
    total += data?.length ?? 0;
  }
  return total;
}

export async function markRoRowsStale(
  runStartedAt: string,
  regions: RegionHealthMap
): Promise<number> {
  const admin = getAdminClient();
  if (!admin) return 0;
  const scope = staleRegionScope(regions);
  if (scope === 'NONE') return 0;

  let query = admin
    .from('request_orders')
    .update({ is_stale: true })
    .eq('source_type', 'GOOGLE_SHEET')
    .eq('is_stale', false)
    .or(NULL_OR_OLDER(runStartedAt));

  if (scope !== 'ALL') {
    query = query.eq('region', scope);
  }

  const { data, error } = await query.select('id');
  if (error) {
    if (!isMissingColumnError(error.message)) {
      console.warn('[sync] Gagal menandai RO stale:', error.message);
    }
    return 0;
  }
  return data?.length ?? 0;
}
```

- [ ] **Step 2: Tulis adapter aset**

`src/lib/sync-engine/sources/asset-requests.ts`:

```ts
import type { SyncSource } from '../types.ts';
import { fetchAllSheetsData } from '@/lib/sync/sheet-fetcher';
import { syncGoogleSheetsToSupabase } from '@/lib/supabase/server';
import { markAssetRowsStale } from '../stale-store.ts';

export const assetRequestsSource: SyncSource = {
  key: 'asset-requests',
  label: 'Aset (JABO + KALBAR)',
  dependsOn: [],
  async run(ctx) {
    if (ctx.dryRun) {
      const { stats, regions } = await fetchAllSheetsData();
      return {
        status: 'SUCCESS',
        rowsFetched: stats.totalCount,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
        rowsStale: 0,
        message: `Dry-run: ${stats.totalCount} baris terbaca.`,
        details: { regions },
      };
    }

    const result = await syncGoogleSheetsToSupabase({ force: ctx.force });
    if (!result.success) {
      return {
        status: 'FAILED',
        rowsFetched: result.totalFetched,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
        rowsStale: 0,
        message: result.message,
        details: { regions: result.regions },
      };
    }

    const rowsStale = await markAssetRowsStale(ctx.runStartedAt, result.regions || {});
    return {
      status: 'SUCCESS',
      rowsFetched: result.totalFetched,
      rowsInserted: result.totalInserted,
      rowsUpdated: result.totalUpdated,
      rowsSkipped: 0,
      rowsStale,
      message: result.message,
      details: { regions: result.regions, changed: result.changed },
    };
  },
};
```

- [ ] **Step 3: Tulis adapter RO**

`src/lib/sync-engine/sources/request-orders.ts`:

```ts
import type { SyncSource } from '../types.ts';
import { syncRequestOrdersFromSheet } from '@/lib/supabase/server';
import { markRoRowsStale } from '../stale-store.ts';

export const requestOrdersSource: SyncSource = {
  key: 'request-orders',
  label: 'Request Order (JABO + KALBAR)',
  dependsOn: [],
  async run(ctx) {
    const options = (ctx.sourceOptions?.['request-orders'] || {}) as Record<string, unknown>;
    const result = await syncRequestOrdersFromSheet({
      ...options,
      dryRun: ctx.dryRun,
    });

    if (!result.success) {
      return {
        status: 'FAILED',
        rowsFetched: result.totalRowsScanned,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsSkipped: result.duplicateRowsFiltered,
        rowsStale: 0,
        message: result.message,
        details: { regions: result.regions },
      };
    }

    const rowsStale = ctx.dryRun
      ? 0
      : await markRoRowsStale(ctx.runStartedAt, result.regions || {});

    return {
      status: 'SUCCESS',
      rowsFetched: result.totalRowsScanned,
      rowsInserted: result.newOrdersAdded,
      rowsUpdated: result.existingOrdersUpdated,
      rowsSkipped: result.duplicateRowsFiltered,
      rowsStale,
      message: result.message,
      details: { regions: result.regions, changed: result.changed },
    };
  },
};
```

- [ ] **Step 4: Tulis adapter master catalog**

`src/lib/sync-engine/sources/master-catalog.ts`:

```ts
import type { SyncSource } from '../types.ts';
import { syncMasterAssetCatalogFromSheet } from '@/lib/supabase/server';

export const masterCatalogSource: SyncSource = {
  key: 'master-catalog',
  label: 'Master Katalog Item',
  dependsOn: ['asset-requests'],
  async run(ctx) {
    const result = await syncMasterAssetCatalogFromSheet({ dryRun: ctx.dryRun });
    return {
      status: result.success ? 'SUCCESS' : 'FAILED',
      rowsFetched: result.totalItems,
      rowsInserted: 0,
      rowsUpdated: ctx.dryRun ? 0 : result.totalItems,
      rowsSkipped: 0,
      rowsStale: 0,
      message: result.message,
      details: { classifications: result.classifications, dryRun: ctx.dryRun },
    };
  },
};
```

- [ ] **Step 5: Tulis registry instance dan barrel**

`src/lib/sync-engine/sources/index.ts`:

```ts
import type { SyncSource } from '../types.ts';
import { assetRequestsSource } from './asset-requests.ts';
import { requestOrdersSource } from './request-orders.ts';
import { masterCatalogSource } from './master-catalog.ts';

export const SYNC_SOURCES: SyncSource[] = [
  assetRequestsSource,
  requestOrdersSource,
  masterCatalogSource,
];
```

`src/lib/sync-engine/index.ts`:

```ts
export * from './types.ts';
export { runSync } from './engine.ts';
export { SYNC_SOURCES } from './sources/index.ts';
export { SupabaseSyncStore } from './store.ts';
```

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sync-engine/
git commit -m "feat(sync): adapter sumber dan penandaan stale"
```

---

## Task 9: API engine, status, riwayat, dan kompatibilitas

**Files:**
- Create: `src/lib/sync-engine/request.ts`
- Test: `src/lib/sync-engine/request.test.mjs`
- Modify: `src/app/api/sync/route.ts`
- Create: `src/app/api/sync/status/route.ts`
- Create: `src/app/api/sync/history/route.ts`
- Modify: `src/app/api/items/sync-sheet/route.ts`
- Modify: `src/app/api/distribution/ro/sync-sheet/route.ts`

**Interfaces:**
- Produces: `parseSyncRequest(input)`; endpoint `/api/sync`, `/api/sync/status`, `/api/sync/history`.

- [ ] **Step 1: Tulis test parser request**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSyncRequest } from './request.ts';

test('query sources dipisah koma', () => {
  const result = parseSyncRequest({
    query: { sources: 'asset-requests,request-orders', dryRun: '1', force: 'true' },
    body: null,
    authorization: null,
  });
  assert.deepEqual(result.options.sources, ['asset-requests', 'request-orders']);
  assert.equal(result.options.dryRun, true);
  assert.equal(result.options.force, true);
  assert.equal(result.options.trigger, 'MANUAL');
});

test('trigger CRON terdeteksi dari Bearer CRON_SECRET', () => {
  process.env.CRON_SECRET = 'rahasia';
  const result = parseSyncRequest({
    query: {},
    body: null,
    authorization: 'Bearer rahasia',
  });
  assert.equal(result.options.trigger, 'CRON');
  delete process.env.CRON_SECRET;
});

test('body JSON menang atas query', () => {
  const result = parseSyncRequest({
    query: { dryRun: '0' },
    body: { sources: ['master-catalog'], dryRun: true, trigger: 'MANUAL' },
    authorization: null,
  });
  assert.deepEqual(result.options.sources, ['master-catalog']);
  assert.equal(result.options.dryRun, true);
});

test('trigger tidak dikenal kembali ke MANUAL', () => {
  const result = parseSyncRequest({
    query: {},
    body: { trigger: 'HACK' },
    authorization: null,
  });
  assert.equal(result.options.trigger, 'MANUAL');
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --test src/lib/sync-engine/request.test.mjs`
Expected: FAIL karena `request.ts` belum ada.

- [ ] **Step 3: Tulis `request.ts`**

```ts
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
    return value.split(',').map((s) => s.trim()).filter(Boolean);
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
```

- [ ] **Step 4: Jalankan test**

Run: `node --test src/lib/sync-engine/request.test.mjs`
Expected: 4 tests PASS.

- [ ] **Step 5: Tulis ulang `/api/sync`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { isSyncRequestAllowed, SYNC_BLOCKED_MESSAGE } from '@/lib/auth/sync-guard';
import { resolveActor } from '@/lib/auth/actor';
import { runSync, SYNC_SOURCES, SupabaseSyncStore } from '@/lib/sync-engine';
import { parseSyncRequest } from '@/lib/sync-engine/request';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(req: NextRequest) {
  try {
    if (!isSyncRequestAllowed(req)) {
      return NextResponse.json({ success: false, message: SYNC_BLOCKED_MESSAGE }, { status: 401 });
    }

    let body: any = null;
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        body = null;
      }
    }

    const parsed = parseSyncRequest({
      query: {
        sources: req.nextUrl.searchParams.get('sources'),
        dryRun: req.nextUrl.searchParams.get('dryRun'),
        force: req.nextUrl.searchParams.get('force'),
        trigger: req.nextUrl.searchParams.get('trigger'),
      },
      body,
      authorization: req.headers.get('authorization'),
    });

    const actor = resolveActor(req);
    const result = await runSync(
      { ...parsed.options, actorName: parsed.options.actorName || actor.name },
      {
        store: new SupabaseSyncStore(),
        sources: SYNC_SOURCES,
        now: () => new Date(),
      }
    );

    const status = result.reason === 'locked' ? 409 : result.success ? 200 : 500;
    return NextResponse.json(result, { status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
```

- [ ] **Step 6: Tulis endpoint status dan riwayat**

`src/app/api/sync/status/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { SupabaseSyncStore } from '@/lib/sync-engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const store = new SupabaseSyncStore();
    const running = await store.findRunning();
    const data = await store.getStatus();
    return NextResponse.json({ success: true, running, ...(data as object) });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message }, { status: 500 });
  }
}
```

`src/app/api/sync/history/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { SupabaseSyncStore } from '@/lib/sync-engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const raw = Number(req.nextUrl.searchParams.get('limit') || 20);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 100) : 20;
    const store = new SupabaseSyncStore();
    const runs = await store.getHistory(limit);
    return NextResponse.json({ success: true, runs });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message }, { status: 500 });
  }
}
```

- [ ] **Step 7: Delegasikan endpoint lama**

`src/app/api/items/sync-sheet/route.ts` — ganti pemanggilan langsung:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { isSyncRequestAllowed, SYNC_BLOCKED_MESSAGE } from '@/lib/auth/sync-guard';
import { runSync, SYNC_SOURCES, SupabaseSyncStore } from '@/lib/sync-engine';
import { getMasterAssetCatalog } from '@/lib/supabase/server';
import { auditMutation } from '@/lib/audit/record-change';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!isSyncRequestAllowed(req)) {
      return NextResponse.json({ success: false, message: SYNC_BLOCKED_MESSAGE }, { status: 401 });
    }
    const result = await runSync(
      { sources: ['master-catalog'], trigger: 'MANUAL' },
      { store: new SupabaseSyncStore(), sources: SYNC_SOURCES }
    );
    const master = result.sources.find((s) => s.key === 'master-catalog');
    if (master?.status === 'SUCCESS') {
      try {
        await auditMutation(req, {
          entityType: 'ITEM',
          entityTitle: 'Sinkronisasi Katalog Item dari Google Sheets',
          actionType: 'UPDATE',
          details: `Sinkronisasi master item: ${master.rowsFetched} item terbaca.`,
          newState: { totalItems: master.rowsFetched },
        });
      } catch (auditErr) {
        console.error('[audit] Gagal mencatat sinkronisasi katalog item:', auditErr);
      }
    }
    return NextResponse.json({
      success: master?.status === 'SUCCESS',
      totalItems: master?.rowsFetched || 0,
      message: master?.message || result.message,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const data = await getMasterAssetCatalog();
    return NextResponse.json({ success: true, count: data.length, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
```

`src/app/api/distribution/ro/sync-sheet/route.ts` — ganti pemanggilan sync dengan engine untuk GET/POST, tetap pertahankan DELETE:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { runSync, SYNC_SOURCES, SupabaseSyncStore } from '@/lib/sync-engine';
import { cleanDuplicateRequestOrders } from '@/lib/supabase/server';
import { isSyncRequestAllowed, SYNC_BLOCKED_MESSAGE } from '@/lib/auth/sync-guard';

export const dynamic = 'force-dynamic';

async function runRo(req: NextRequest, body?: any) {
  if (!isSyncRequestAllowed(req)) {
    return NextResponse.json({ success: false, message: SYNC_BLOCKED_MESSAGE }, { status: 401 });
  }
  const clearOld = req.nextUrl.searchParams.get('clear') === 'true';
  const startDate = body?.startDate ?? req.nextUrl.searchParams.get('startDate') ?? undefined;
  const endDate = body?.endDate ?? req.nextUrl.searchParams.get('endDate') ?? undefined;
  const dateField = body?.dateField ?? req.nextUrl.searchParams.get('dateField') ?? 'order_date';

  const result = await runSync(
    {
      sources: ['request-orders'],
      trigger: 'MANUAL',
      sourceOptions: {
        'request-orders': {
          clearOldSheetData: clearOld,
          startDate,
          endDate,
          dateField: dateField === 'request_date' ? 'request_date' : 'order_date',
        },
      },
    },
    { store: new SupabaseSyncStore(), sources: SYNC_SOURCES }
  );

  const ro = result.sources.find((s) => s.key === 'request-orders');
  return NextResponse.json({
    success: ro?.status === 'SUCCESS',
    totalRowsScanned: ro?.rowsFetched || 0,
    duplicateRowsFiltered: ro?.rowsSkipped || 0,
    uniqueOrdersCount: ro?.details?.uniqueOrdersCount || 0,
    newOrdersAdded: ro?.rowsInserted || 0,
    existingOrdersUpdated: ro?.rowsUpdated || 0,
    changed: result.changed,
    message: ro?.message || result.message,
  });
}

export async function GET(req: NextRequest) {
  return runRo(req);
}

export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  return runRo(req, body);
}

export async function DELETE(req: NextRequest) {
  try {
    const res = await cleanDuplicateRequestOrders();
    return NextResponse.json({
      success: true,
      ...res,
      message: `Berhasil membersihkan ${res.cleanedCount} entri RO duplikat. Total RO unik sekarang: ${res.totalUnique}.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
```

Catatan: `uniqueOrdersCount` tersedia bila adapter RO menyertakan `uniqueOrdersCount` di `details`. Tambahkan di `request-orders.ts`:

```ts
      details: {
        regions: result.regions,
        changed: result.changed,
        uniqueOrdersCount: result.uniqueOrdersCount,
      },
```

- [ ] **Step 8: Type check dan test**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `node --test src/lib/sync-engine/request.test.mjs`
Expected: 4 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sync-engine/request.ts src/lib/sync-engine/request.test.mjs src/app/api/sync/ src/app/api/items/sync-sheet/route.ts src/app/api/distribution/ro/sync-sheet/route.ts src/lib/sync-engine/sources/request-orders.ts
git commit -m "feat(sync): API engine, status, riwayat, dan delegasi endpoint lama"
```

---

## Task 10: Halaman operasi `/sync`

**Files:**
- Create: `src/components/sync/SyncSourceCard.tsx`
- Create: `src/components/sync/SyncHistoryTable.tsx`
- Modify: `src/app/sync/page.tsx`

**Interfaces:**
- Consumes: `/api/sync`, `/api/sync/status`, `/api/sync/history`.
- Produces: UI run all/per sumber, dry-run, status, riwayat.

- [ ] **Step 1: Tulis `SyncSourceCard`**

```tsx
'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, Loader2, Play, MinusCircle } from 'lucide-react';

export interface SyncSourceView {
  key: string;
  label: string;
  status?: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'RUNNING';
  rowsFetched?: number;
  rowsInserted?: number;
  rowsUpdated?: number;
  rowsStale?: number;
  durationMs?: number;
  message?: string;
}

export function SyncSourceCard({
  source,
  running,
  onRun,
}: {
  source: SyncSourceView;
  running: boolean;
  onRun: (key: string) => void;
}) {
  const status = source.status;
  const icon =
    status === 'SUCCESS' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    ) : status === 'FAILED' ? (
      <AlertCircle className="h-4 w-4 text-rose-600" />
    ) : status === 'SKIPPED' ? (
      <MinusCircle className="h-4 w-4 text-slate-400" />
    ) : (
      <Loader2 className={`h-4 w-4 text-blue-600 ${running ? 'animate-spin' : ''}`} />
    );

  return (
    <div className="rounded-2xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
            {icon}
            {source.label}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">{source.key}</div>
        </div>
        <button
          type="button"
          onClick={() => onRun(source.key)}
          disabled={running}
          className="flex items-center gap-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] px-3 py-1.5 text-xs font-semibold hover:bg-[#f0f4f9] disabled:opacity-50"
        >
          <Play className="h-3 w-3" />
          Run
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
        <div>Dibaca: <strong>{source.rowsFetched ?? 0}</strong></div>
        <div>Ditulis: <strong>{(source.rowsInserted ?? 0) + (source.rowsUpdated ?? 0)}</strong></div>
        <div>Stale: <strong>{source.rowsStale ?? 0}</strong></div>
        <div>Durasi: <strong>{source.durationMs ?? 0} ms</strong></div>
      </div>

      {source.message && (
        <p className="text-[11px] text-slate-500 line-clamp-2">{source.message}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Tulis `SyncHistoryTable`**

```tsx
'use client';

import React from 'react';

export interface SyncRunView {
  id: string;
  started_at: string;
  trigger: string;
  status: string;
  ok_sources: number;
  failed_sources: number;
  duration_ms: number;
  actor_name?: string;
  message?: string;
  dry_run?: boolean;
}

export function SyncHistoryTable({ runs }: { runs: SyncRunView[] }) {
  return (
    <div className="rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#f0f4f9] dark:bg-[#282a2c] text-[11px] uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5]">
            <tr>
              <th className="px-4 py-3">Waktu</th>
              <th className="px-3 py-3">Pemicu</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Sumber OK/Gagal</th>
              <th className="px-3 py-3">Durasi</th>
              <th className="px-4 py-3">Aktor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Belum ada riwayat sync.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-3">{new Date(run.started_at).toLocaleString('id-ID')}</td>
                  <td className="px-3 py-3">{run.trigger}{run.dry_run ? ' (dry)' : ''}</td>
                  <td className="px-3 py-3 font-semibold">{run.status}</td>
                  <td className="px-3 py-3">{run.ok_sources}/{run.failed_sources}</td>
                  <td className="px-3 py-3">{run.duration_ms} ms</td>
                  <td className="px-4 py-3">{run.actor_name || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Tulis ulang halaman `/sync`**

Pertahankan bagian panduan setup dan skrip Apps Script; ganti state dan tambahkan panel engine di atas. Gunakan kode lengkap berikut sebagai kerangka (bagian panduan boleh dipertahankan dari file lama):

```tsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Database, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { SyncSourceCard, type SyncSourceView } from '@/components/sync/SyncSourceCard';
import { SyncHistoryTable, type SyncRunView } from '@/components/sync/SyncHistoryTable';

const DEFAULT_SOURCES: SyncSourceView[] = [
  { key: 'asset-requests', label: 'Aset (JABO + KALBAR)' },
  { key: 'request-orders', label: 'Request Order (JABO + KALBAR)' },
  { key: 'master-catalog', label: 'Master Katalog Item' },
];

export default function SyncPage() {
  const [sources, setSources] = useState<SyncSourceView[]>(DEFAULT_SOURCES);
  const [runs, setRuns] = useState<SyncRunView[]>([]);
  const [running, setRunning] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<any>(null);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetch('/api/sync/status', { cache: 'no-store' }),
        fetch('/api/sync/history?limit=20', { cache: 'no-store' }),
      ]);
      const status = await statusRes.json();
      const history = await historyRes.json();

      const latest = new Map<string, any>();
      for (const row of status.sources || []) {
        if (!latest.has(row.source_key)) latest.set(row.source_key, row);
      }
      setSources((prev) =>
        prev.map((s) => {
          const row = latest.get(s.key);
          return row
            ? {
                ...s,
                status: row.status,
                rowsFetched: row.rows_fetched,
                rowsInserted: row.rows_inserted,
                rowsUpdated: row.rows_updated,
                rowsStale: row.rows_stale,
                durationMs: row.duration_ms,
                message: row.error_message || undefined,
              }
            : s;
        })
      );
      setRuns(history.runs || []);
      setRunning(Boolean(status.running));
    } catch (error) {
      console.error('Gagal memuat status sync:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (keys?: string[]) => {
    try {
      setRunning(true);
      setResult(null);
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: keys, dryRun, trigger: 'MANUAL' }),
      });
      const data = await res.json();
      setResult(data);
      await refresh();
    } catch (error: any) {
      setResult({ success: false, message: error?.message || 'Gagal sync' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
            Sinkronisasi dan Basis Data
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] mt-1">
          Engine terpusat: Google Sheets → Supabase → HANTARAN. Satu arah, tanpa tulis balik ke sheet.
        </p>
      </div>

      <div className="rounded-2xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            Dry-run (tidak menulis)
          </label>
          <button
            type="button"
            onClick={() => run()}
            disabled={running}
            className="flex items-center gap-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-5 py-2 text-xs font-semibold text-white dark:text-[#041e49] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Sedang Sync...' : 'Run Semua Sumber'}
          </button>
        </div>

        {result && (
          <div
            className={`rounded-2xl p-3.5 text-xs border ${
              result.success
                ? 'bg-[#e6f4ea] dark:bg-[#0f5223]/50 border-[#ceead6] dark:border-[#0f5223] text-[#137333] dark:text-[#6dd58c]'
                : 'bg-[#fce8e6] dark:bg-[#601410]/50 border-[#f9dedc] dark:border-[#601410] text-[#b3261e] dark:text-[#f2b8b5]'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold mb-0.5">
              {result.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {result.success ? 'Sync selesai' : 'Sync gagal'}
              {result.skipped ? ` (${result.reason})` : ''}
            </div>
            <p>{result.message}</p>
            <p className="mt-0.5 text-[10px] opacity-80">
              Status: {result.status} • Durasi: {result.durationMs} ms
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {sources.map((source) => (
            <SyncSourceCard
              key={source.key}
              source={source}
              running={running}
              onRun={(key) => run([key])}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">Riwayat 20 Run Terakhir</h2>
        <SyncHistoryTable runs={runs} />
      </div>

      <div className="rounded-2xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] p-4">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Database className="h-4 w-4 text-[#0b57d0]" />
          Setup
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Jalankan <code>supabase/sync-engine.sql</code>, isi <code>SYNC_TOKEN</code> dan
          <code>CRON_SECRET</code> di Vercel, lalu deploy. Cron berjalan 02.00 WIB.
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          Webhook Apps Script: <code>POST /api/sync</code> dengan header <code>x-sync-token</code>.
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type check dan build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/app/sync/page.tsx src/components/sync/
git commit -m "feat(sync): halaman operasi engine dengan dry-run dan riwayat"
```

---

## Task 11: Verifikasi menyeluruh dan dokumentasi akhir

**Files:**
- Modify: `docs/guides/sync-engine.md`
- No code changes unless verification finds a bug.

**Interfaces:**
- Produces: bukti verifikasi dan panduan operasional final.

- [ ] **Step 1: Jalankan seluruh unit test**

Run: `node --test "src/lib/**/*.test.mjs"`
Expected: semua test PASS (baseline 110 + test baru).

- [ ] **Step 2: Jalankan type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Jalankan build produksi**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Uji API lokal tanpa menulis data**

Pastikan dev server berjalan, lalu:

```powershell
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$c = New-Object System.Net.Cookie("ca_auth","true","/","localhost")
$s.Cookies.Add($c)
Invoke-WebRequest -Uri "http://localhost:3000/api/sync?dryRun=1" -UseBasicParsing -WebSession $s
```

Expected:
- HTTP 200.
- `dryRun: true`.
- `status: SUCCESS` atau `PARTIAL` bila ada sheet yang tidak dapat diakses.
- Tidak ada baris baru di `sync_runs`.

- [ ] **Step 5: Uji status dan riwayat**

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/sync/status" -UseBasicParsing -WebSession $s
Invoke-WebRequest -Uri "http://localhost:3000/api/sync/history?limit=5" -UseBasicParsing -WebSession $s
```

Expected: HTTP 200 dan JSON valid.

- [ ] **Step 6: Uji UI**

Buka `http://localhost:3000/sync`:
- Tiga kartu sumber tampil.
- Toggle dry-run berfungsi.
- Run All menampilkan hasil.
- Riwayat terisi setelah run non-dry-run.
- Tidak ada error di console browser.

- [ ] **Step 7: Uji apply di dev (setelah SQL dijalankan dan disetujui)**

1. Jalankan `POST /api/sync` tanpa dry-run.
2. Periksa `sync_runs` dan `sync_run_sources` terisi.
3. Ubah status satu aset di dashboard, jalankan sync lagi, pastikan status tidak kembali.
4. Bandingkan jumlah baris aset/RO sebelum dan sesudah.
5. Pastikan tidak ada baris yang terhapus.

- [ ] **Step 8: Uji lock**

Jalankan dua request sync bersamaan (PowerShell `Start-Job`), misalnya:

```powershell
$job1 = Start-Job { Invoke-WebRequest -Uri "http://localhost:3000/api/sync" -Method POST -UseBasicParsing }
$job2 = Start-Job { Invoke-WebRequest -Uri "http://localhost:3000/api/sync" -Method POST -UseBasicParsing }
Wait-Job $job1, $job2 | Out-Null
Receive-Job $job1, $job2
```

Expected: salah satu mengembalikan `409` dengan `reason: "locked"` (atau satu sukses dan satu 409).

- [ ] **Step 9: Perbarui panduan**

Tambahkan ke `docs/guides/sync-engine.md`:

```markdown
## Hasil verifikasi

- Unit test: `<isi jumlah>`
- `tsc --noEmit`: lulus
- `npm run build`: lulus
- Dry-run lokal: `<isi status dan jumlah baris>`
- Apply dev: `<isi jumlah run, baris, stale>`
- Lock: `<isi hasil>`

## Catatan operasional

- Jangan menjalankan dua sync manual saat cron sedang berjalan.
- Jika status `PARTIAL`, periksa sumber yang gagal di halaman `/sync`.
- Baris stale tetap tampil di aplikasi sampai fitur filter stale diaktifkan.
- Migration hanya dijalankan sekali; aman diulang karena memakai `IF NOT EXISTS`.
```

- [ ] **Step 10: Commit**

```bash
git add docs/guides/sync-engine.md
git commit -m "docs(sync): panduan operasional dan hasil verifikasi"
```

---

## Self-Review Checklist

- [ ] Setiap requirement spec punya task: registry (Task 2), status/debounce/stale (Task 3), auth (Task 4), lock/store (Task 5), engine (Task 6), legacy policies (Task 7), adapters (Task 8), API/cron (Task 9), UI (Task 10), verification (Task 11).
- [ ] Tidak ada placeholder `TBD`/`TODO`.
- [ ] Nama fungsi konsisten: `runSync`, `acquireRun`, `aggregateRunStatus`, `staleRegionScope`, `parseSyncRequest`, `markAssetRowsStale`, `markRoRowsStale`.
- [ ] Semua import runtime antar modul engine memakai ekstensi `.ts` dan `allowImportingTsExtensions` sudah aktif.
- [ ] Dry-run tidak membuat `sync_runs` dan tidak menulis tabel bisnis.
- [ ] Tidak ada operasi delete baris pada data sheet.
- [ ] Semua perubahan status HANTARAN tetap disimpan di Supabase dan dilindungi dari overwrite.