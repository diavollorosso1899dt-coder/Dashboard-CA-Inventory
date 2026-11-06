# Stock Opname Harian per Region — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memisahkan seluruh Stock Opname Harian per region (JABODETABEK dan KALBAR): sesi, stok awal, RO, penerimaan, rollover, riwayat, cetak, dan ekspor.

**Architecture:** Region menjadi properti sesi. ID sesi mengikuti pola `so-<slug-region>-<YYYY-MM-DD>` dan kolom `region` ditambahkan ke `so_sessions` sebagai sumber utama, dengan parsing ID sebagai fallback. Halaman SO membaca region dari profil/URL, me-remount `UploadSection` saat region berubah, dan memfilter sesi, PR Ready Stock, Monitoring SLA, Surat Jalan, serta stok di Kelola RO.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Supabase JS, Tailwind, Node 24 built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-11-06-stock-opname-per-region-design.md`

## Global Constraints

- Region SO hanya `JABODETABEK` dan `KALBAR`. Tidak ada opsi `ALL` untuk sesi SO.
- ID sesi: `so-jabodetabek-YYYY-MM-DD` dan `so-kalbar-YYYY-MM-DD`. ID lama `so-YYYY-MM-DD` adalah sesi legacy tanpa region.
- Sesi legacy tidak boleh dipakai untuk rollover dan tidak boleh ditimpa oleh sesi region.
- Region aktif tidak boleh mencampur stok, RO, penerimaan, rollover, atau riwayat dengan region lain.
- Default region bila tidak ada URL, profil, atau nilai tersimpan: `JABODETABEK`.
- Link master KALBAR memakai link lama; link master JABODETABEK memakai gid `1721157388` (Peralatan) dan `737037942` (Perlengkapan).
- Parser master yang ada **tidak diubah**: sheet Perlengkapan JABO sudah diperbaiki dan `Jumlah` berisi angka.
- Jangan mengubah formula `stok_sistem = stok_awal + qty_penerimaan - qty_ro`.
- Jangan mengubah alur login, RLS, atau model izin pengguna.
- Tidak ada framework test baru. Test memakai `node --test` pada file `.test.mjs` yang mengimpor `.ts` langsung (Node 24 type stripping).
- Import runtime antar-file di `src/lib` memakai ekstensi `.ts` (pola yang sudah dipakai `src/lib/sync-engine`), agar test Node bisa me-resolve modul.
- Di Windows/PowerShell gunakan `npm.cmd`, bukan `npm`.
- Jangan menjalankan `npm run build` selama dev server masih berjalan.
- **Jangan pernah men-stage** file milik user yang belum di-commit:
  `src/lib/distribution/confirm-surat-jalan.ts`,
  `src/lib/distribution/ro-sync-merge.ts`,
  `src/lib/supabase/server.ts`.
  Stage hanya file yang disebut di setiap task.
- Semua route API tetap `export const dynamic = 'force-dynamic';`.
- `localStorage` key lama tidak boleh dihapus otomatis.

## Interfaces (kontrak lintas task)

```ts
// src/lib/so-harian/region.ts
export type SoRegion = 'JABODETABEK' | 'KALBAR';
export const SO_REGIONS: SoRegion[];
export const SO_ACTIVE_REGION_KEY: string;
export function normalizeSoRegion(value?: string | null): SoRegion | null;
export function soRegionSlug(region: SoRegion): 'jabodetabek' | 'kalbar';
export function buildSoSessionId(region: SoRegion, date: string): string;
export function parseSoSessionId(id?: string | null): {
  region: SoRegion | null;
  date: string | null;
  legacy: boolean;
};
export function resolveSessionRegion(session: {
  region?: string | null;
  id?: string | null;
}): SoRegion | null;
export function filterSessionsByRegion<
  T extends { region?: string | null; id?: string | null }
>(sessions: T[], region: SoRegion): T[];
export function resolveActiveSoRegion(options: {
  requested?: string | null;
  allowedRegion?: string | null;
  isRegionLocked?: boolean;
  stored?: string | null;
}): SoRegion;

// src/lib/so-harian/rollover.ts
export function pickPreviousSession<T extends SessionLike>(
  sessions: T[],
  currentDate?: string | null,
  region?: SoRegion | null
): T | null;

// src/lib/so-harian/storageService.ts
export interface SOSession {
  // ...field lama tetap...
  region?: SoRegion | null;
}
export function getAllSessionsSync(region?: SoRegion): SOSession[];
export async function getAllSessions(region?: SoRegion): Promise<SOSession[]>;

// src/components/so-harian/UploadSection.tsx
interface UploadSectionProps {
  region: SoRegion;
  // ...props lama tetap...
}

// src/components/so-harian/HistorySection.tsx
interface HistorySectionProps {
  region: SoRegion;
  onOpenSession: (sessionId: string) => void;
  onPrintSession: (session: SOSession, items: any[]) => void;
}
```

---

### Task 1: Region helper module

**Files:**
- Create: `src/lib/so-harian/region.ts`
- Create: `src/lib/so-harian/region.test.mjs`

**Interfaces:**
- Produces semua fungsi di blok `region.ts` pada bagian Interfaces.
- Tidak mengimpor React, browser API, atau Supabase.

- [ ] **Step 1: Tulis test yang gagal**

Buat `src/lib/so-harian/region.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSoRegion,
  soRegionSlug,
  buildSoSessionId,
  parseSoSessionId,
  resolveSessionRegion,
  filterSessionsByRegion,
  resolveActiveSoRegion,
} from './region.ts';
import { matchesRegion } from '../utils/region-helper.ts';

test('normalizeSoRegion menerima variasi nama region dan menolak ALL', () => {
  assert.equal(normalizeSoRegion('JABO'), 'JABODETABEK');
  assert.equal(normalizeSoRegion('jabodetabek'), 'JABODETABEK');
  assert.equal(normalizeSoRegion(' KALBAR '), 'KALBAR');
  assert.equal(normalizeSoRegion('Kalimantan Barat'), 'KALBAR');
  assert.equal(normalizeSoRegion('ALL'), null);
  assert.equal(normalizeSoRegion(''), null);
  assert.equal(normalizeSoRegion(null), null);
});

test('slug dan ID sesi memisahkan dua region pada tanggal yang sama', () => {
  assert.equal(soRegionSlug('JABODETABEK'), 'jabodetabek');
  assert.equal(soRegionSlug('KALBAR'), 'kalbar');
  assert.equal(buildSoSessionId('JABODETABEK', '2026-11-06'), 'so-jabodetabek-2026-11-06');
  assert.equal(buildSoSessionId('KALBAR', '2026-11-06'), 'so-kalbar-2026-11-06');
});

test('parseSoSessionId mengenali sesi region dan sesi legacy', () => {
  assert.deepEqual(parseSoSessionId('so-jabodetabek-2026-11-06'), {
    region: 'JABODETABEK',
    date: '2026-11-06',
    legacy: false,
  });
  assert.deepEqual(parseSoSessionId('so-kalbar-2026-11-06'), {
    region: 'KALBAR',
    date: '2026-11-06',
    legacy: false,
  });
  assert.deepEqual(parseSoSessionId('so-2026-11-06'), {
    region: null,
    date: '2026-11-06',
    legacy: true,
  });
  assert.deepEqual(parseSoSessionId('sesi-lain'), {
    region: null,
    date: null,
    legacy: false,
  });
});

test('resolveSessionRegion memprioritaskan kolom region lalu ID', () => {
  assert.equal(resolveSessionRegion({ region: 'KALBAR', id: 'so-jabodetabek-2026-11-06' }), 'KALBAR');
  assert.equal(resolveSessionRegion({ region: null, id: 'so-kalbar-2026-11-06' }), 'KALBAR');
  assert.equal(resolveSessionRegion({ region: 'ALL', id: 'so-jabodetabek-2026-11-06' }), 'JABODETABEK');
  assert.equal(resolveSessionRegion({ id: 'so-2026-11-06' }), null);
});

test('filterSessionsByRegion tidak mencampur region dan mengabaikan legacy', () => {
  const sessions = [
    { id: 'so-jabodetabek-2026-11-06', tanggal: '2026-11-06' },
    { id: 'so-kalbar-2026-11-06', tanggal: '2026-11-06' },
    { id: 'so-2026-11-05', tanggal: '2026-11-05' },
  ];

  assert.deepEqual(
    filterSessionsByRegion(sessions, 'JABODETABEK').map((s) => s.id),
    ['so-jabodetabek-2026-11-06']
  );
  assert.deepEqual(
    filterSessionsByRegion(sessions, 'KALBAR').map((s) => s.id),
    ['so-kalbar-2026-11-06']
  );
});

test('resolveActiveSoRegion mengunci region untuk user non-super user', () => {
  assert.equal(
    resolveActiveSoRegion({
      requested: 'KALBAR',
      allowedRegion: 'JABODETABEK',
      isRegionLocked: true,
    }),
    'JABODETABEK'
  );
  assert.equal(
    resolveActiveSoRegion({ requested: 'KALBAR', isRegionLocked: false }),
    'KALBAR'
  );
  assert.equal(
    resolveActiveSoRegion({ requested: null, stored: 'KALBAR', isRegionLocked: false }),
    'KALBAR'
  );
  assert.equal(resolveActiveSoRegion({ isRegionLocked: false }), 'JABODETABEK');
});

test('matchesRegion dipakai untuk filter PR/SLA', () => {
  assert.equal(matchesRegion('KALBAR', 'KALBAR'), true);
  assert.equal(matchesRegion('KALBAR', 'JABODETABEK'), false);
  assert.equal(matchesRegion('JABO', 'JABODETABEK'), true);
  assert.equal(matchesRegion(null, 'ALL'), true);
  assert.equal(matchesRegion(null, 'KALBAR'), false);
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --test src/lib/so-harian/region.test.mjs`
Expected: FAIL dengan `Cannot find module .../region.ts`.

- [ ] **Step 3: Tulis implementasi minimal**

Buat `src/lib/so-harian/region.ts`:

```ts
/**
 * Region helpers untuk SO Harian.
 * Satu sesi SO selalu milik satu region: JABODETABEK atau KALBAR.
 */

export type SoRegion = 'JABODETABEK' | 'KALBAR';

export const SO_REGIONS: SoRegion[] = ['JABODETABEK', 'KALBAR'];

export const SO_ACTIVE_REGION_KEY = 'so_active_region';

export function normalizeSoRegion(value?: string | null): SoRegion | null {
  if (!value) return null;
  const upper = String(value).trim().toUpperCase();
  if (upper === 'JABO' || upper === 'JABODETABEK') return 'JABODETABEK';
  if (upper === 'KALBAR' || upper === 'KALIMANTAN BARAT') return 'KALBAR';
  return null;
}

export function soRegionSlug(region: SoRegion): 'jabodetabek' | 'kalbar' {
  return region === 'KALBAR' ? 'kalbar' : 'jabodetabek';
}

export function buildSoSessionId(region: SoRegion, date: string): string {
  const normalizedDate =
    String(date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `so-${soRegionSlug(region)}-${normalizedDate}`;
}

export interface ParsedSoSessionId {
  region: SoRegion | null;
  date: string | null;
  legacy: boolean;
}

export function parseSoSessionId(id?: string | null): ParsedSoSessionId {
  const value = String(id || '').trim();

  const regional = /^so-(jabodetabek|kalbar)-(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (regional) {
    return {
      region: regional[1] === 'kalbar' ? 'KALBAR' : 'JABODETABEK',
      date: regional[2],
      legacy: false,
    };
  }

  const legacy = /^so-(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (legacy) {
    return { region: null, date: legacy[1], legacy: true };
  }

  return { region: null, date: null, legacy: false };
}

export function resolveSessionRegion(session: {
  region?: string | null;
  id?: string | null;
}): SoRegion | null {
  return normalizeSoRegion(session?.region) || parseSoSessionId(session?.id).region;
}

export function filterSessionsByRegion<
  T extends { region?: string | null; id?: string | null }
>(sessions: T[] = [], region: SoRegion): T[] {
  return (sessions || []).filter((session) => resolveSessionRegion(session) === region);
}

export function resolveActiveSoRegion(options: {
  requested?: string | null;
  allowedRegion?: string | null;
  isRegionLocked?: boolean;
  stored?: string | null;
}): SoRegion {
  if (options.isRegionLocked) {
    return normalizeSoRegion(options.allowedRegion) || 'JABODETABEK';
  }
  return (
    normalizeSoRegion(options.requested) ||
    normalizeSoRegion(options.stored) ||
    'JABODETABEK'
  );
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `node --test src/lib/so-harian/region.test.mjs`
Expected: PASS, 7 test lulus.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/so-harian/region.ts src/lib/so-harian/region.test.mjs
git commit -m "feat(so): tambah helper region untuk sesi SO harian"
```

---

### Task 2: Rollover hanya memakai sesi region yang sama

**Files:**
- Modify: `src/lib/so-harian/rollover.ts:12,27-81`
- Test: `src/lib/so-harian/rollover.test.mjs:29-51`

**Interfaces:**
- Consumes: `resolveSessionRegion`, `SoRegion` dari `src/lib/so-harian/region.ts`.
- Produces: `pickPreviousSession(sessions, currentDate, region?)`. Tanpa argumen `region`, perilaku lama tetap dipertahankan.

- [ ] **Step 1: Tambahkan test yang gagal**

Tambahkan di akhir `src/lib/so-harian/rollover.test.mjs`:

```js
test('pickPreviousSession tidak mencampur region', () => {
  const sessions = [
    { id: 'so-jabodetabek-2026-11-05', tanggal: '2026-11-05', region: 'JABODETABEK' },
    { id: 'so-kalbar-2026-11-05', tanggal: '2026-11-05', region: 'KALBAR' },
    { id: 'so-kalbar-2026-11-04', tanggal: '2026-11-04', region: 'KALBAR' },
    { id: 'so-2026-11-03', tanggal: '2026-11-03' },
  ];

  assert.equal(
    pickPreviousSession(sessions, '2026-11-06', 'KALBAR')?.id,
    'so-kalbar-2026-11-05'
  );
  assert.equal(
    pickPreviousSession(sessions, '2026-11-06', 'JABODETABEK')?.id,
    'so-jabodetabek-2026-11-05'
  );
  // Sesi legacy tidak boleh menjadi sumber rollover region mana pun.
  assert.equal(pickPreviousSession(sessions, '2026-11-04', 'KALBAR'), null);
});

test('pickPreviousSession mendeteksi region dari ID sesi', () => {
  const sessions = [
    { id: 'so-kalbar-2026-11-05', tanggal: '2026-11-05' },
    { id: 'so-jabodetabek-2026-11-05', tanggal: '2026-11-05' },
  ];

  assert.equal(
    pickPreviousSession(sessions, '2026-11-06', 'JABODETABEK')?.id,
    'so-jabodetabek-2026-11-05'
  );
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --test src/lib/so-harian/rollover.test.mjs`
Expected: FAIL karena `pickPreviousSession` belum memfilter region (hasil bisa `so-kalbar-2026-11-05` untuk JABO, atau legacy dipakai).

- [ ] **Step 3: Implementasi filter region**

Di `src/lib/so-harian/rollover.ts`, tambahkan import di atas:

```ts
import { resolveSessionRegion, type SoRegion } from './region.ts';
```

Ubah `SessionLike` menjadi:

```ts
export interface SessionLike {
  id: string;
  tanggal?: string | null;
  status?: string | null;
  region?: string | null;
}
```

Ganti `pickPreviousSession` dengan:

```ts
export function pickPreviousSession<T extends SessionLike>(
  sessions: T[] = [],
  currentDate?: string | null,
  region?: SoRegion | null
): T | null {
  const cutoff = normalizeSessionDate(currentDate) || localDateString();
  const candidates = (sessions || [])
    .filter((session) => !region || resolveSessionRegion(session) === region)
    .map((session) => ({ session, date: normalizeSessionDate(session?.tanggal) }))
    .filter((entry): entry is { session: T; date: string } => Boolean(entry.date) && entry.date! < cutoff)
    .sort((a, b) => b.date.localeCompare(a.date));

  return candidates[0]?.session || null;
}
```

- [ ] **Step 4: Jalankan seluruh test rollover**

Run: `node --test src/lib/so-harian/rollover.test.mjs`
Expected: PASS, termasuk test lama (tanpa argumen region) dan 2 test baru.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/so-harian/rollover.ts src/lib/so-harian/rollover.test.mjs
git commit -m "feat(so): rollover hanya memakai sesi region yang sama"
```

---

### Task 3: Storage service menyimpan dan memfilter region

**Files:**
- Modify: `src/lib/so-harian/storageService.ts:1-25,156-250,302-338`

**Interfaces:**
- Consumes: `SoRegion`, `filterSessionsByRegion`, `resolveSessionRegion` dari `region.ts`.
- Produces: `SOSession.region`, `getAllSessionsSync(region?)`, `getAllSessions(region?)`.
- `saveSession` tetap mengembalikan `Promise<string>`.

- [ ] **Step 1: Tambahkan field dan import**

Di `src/lib/so-harian/storageService.ts`:

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SOItem } from './inventoryEngine';
import {
  filterSessionsByRegion,
  resolveSessionRegion,
  type SoRegion,
} from './region.ts';
```

Tambahkan `region` pada `SOSession`:

```ts
export interface SOSession {
  id: string;
  tanggal: string;
  gudang: string;
  petugas: string;
  region?: SoRegion | null;
  total_items?: number;
  item_match?: number;
  item_minus?: number;
  item_plus?: number;
  item_selisih?: number;
  akurasi_persen?: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
}
```

- [ ] **Step 2: Simpan region di `saveSession`**

Di dalam `saveSession`, setelah `const sessionId = ...`, tambahkan:

```ts
const inferredRegion = resolveSessionRegion(sessionData);
```

Lalu ubah `completeSession` agar menulis region hasil normalisasi:

```ts
const completeSession: SOSession = {
  tanggal: new Date().toISOString().split('T')[0],
  gudang: 'Gudang Utama',
  petugas: 'Petugas Gudang',
  ...sessionData,
  id: sessionId,
  region: inferredRegion ?? undefined,
  updated_at: now,
  created_at: sessionData.created_at || now,
  total_items: items.length,
  item_match: items.filter(i => i.status_selisih === 'MATCH').length,
  item_minus: items.filter(i => i.status_selisih === 'MINUS').length,
  item_plus: items.filter(i => i.status_selisih === 'PLUS').length,
};
```

Penting: `getAllSessionsSync()` di dalam `saveSession` tetap **tanpa** argumen region. Jangan memfilter daftar saat menulis, agar sesi region lain tidak terhapus dari cache.

Ubah audit agar menyebut region:

```ts
entityTitle: `Stock Opname ${completeSession.region || 'Tanpa Region'} ${completeSession.tanggal}`,
details: `Menyimpan sesi Stock Opname Harian ${completeSession.region || 'Tanpa Region'} ${completeSession.tanggal} (${completeSession.gudang || 'Gudang'}) — ${completeSession.total_items || items.length} item, status ${completeSession.status || 'DRAFT'}.`,
options: {
  entityId: sessionId,
  newState: {
    region: completeSession.region,
    tanggal: completeSession.tanggal,
    gudang: completeSession.gudang,
    total_items: completeSession.total_items,
    status: completeSession.status || 'DRAFT',
  },
},
```

- [ ] **Step 3: Filter daftar sesi per region**

Ganti `getAllSessionsSync` dan `getAllSessions`:

```ts
export function getAllSessionsSync(region?: SoRegion): SOSession[] {
  const safeStorage = getSafeStorage();
  const raw = safeStorage.getItem(STORAGE_KEYS.SESSIONS);
  if (!raw) return [];
  try {
    const sessions: SOSession[] = JSON.parse(raw);
    return region ? filterSessionsByRegion(sessions, region) : sessions;
  } catch {
    return [];
  }
}

export async function getAllSessions(region?: SoRegion): Promise<SOSession[]> {
  initSupabaseFromStorage();
  const localList = getAllSessionsSync();

  if (supabaseClient) {
    try {
      const { data: cloudList, error } = await supabaseClient
        .from('so_sessions')
        .select('*')
        .order('tanggal', { ascending: false });

      if (!error && Array.isArray(cloudList)) {
        const map = new Map<string, SOSession>();
        for (const s of localList) map.set(s.id, s);
        for (const s of cloudList) map.set(s.id, s);
        const merged = Array.from(map.values()).sort((a, b) =>
          (b.tanggal || '').localeCompare(a.tanggal || '')
        );
        // Simpan daftar penuh, bukan hasil filter, agar cache region lain tetap utuh.
        getSafeStorage().setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(merged));
        return region ? filterSessionsByRegion(merged, region) : merged;
      }
    } catch (err) {
      console.warn('Cloud session list fetch failed:', err);
    }
  }

  return region ? filterSessionsByRegion(localList, region) : localList;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru. `saveSession` dan pemanggil lama tetap kompatibel karena `region` opsional.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/so-harian/storageService.ts
git commit -m "feat(so): simpan dan filter region pada storage sesi"
```

---

### Task 4: Migration Supabase dan API sesi/stok

**Files:**
- Create: `supabase/so-region.sql`
- Modify: `src/app/api/so/sessions/route.ts:1-58`
- Modify: `src/app/api/so/stock/route.ts:1-55`

**Interfaces:**
- Consumes: `normalizeSoRegion`, `resolveSessionRegion`.
- Produces: kolom `so_sessions.region`; `POST /api/so/sessions` menulis region; `GET /api/so/stock?region=` memilih sesi region tersebut.

- [ ] **Step 1: Tulis migration**

Buat `supabase/so-region.sql`:

```sql
-- SO Harian per region
-- Jalankan sekali di Supabase Dashboard -> SQL Editor.

alter table public.so_sessions
  add column if not exists region text;

create index if not exists so_sessions_region_tanggal_idx
  on public.so_sessions (region, tanggal desc);

comment on column public.so_sessions.region is
  'JABODETABEK atau KALBAR. NULL untuk sesi lama sebelum pemisahan region.';
```

- [ ] **Step 2: Tulis region di API simpan sesi**

Di `src/app/api/so/sessions/route.ts`, tambahkan import:

```ts
import { normalizeSoRegion, resolveSessionRegion } from '@/lib/so-harian/region';
```

Setelah `const sessionId = String(session.id);`, hitung region:

```ts
const region =
  normalizeSoRegion(session.region) ||
  resolveSessionRegion({ region: session.region, id: sessionId });
```

Tambahkan `region` ke `sessionPayload`:

```ts
const sessionPayload: any = {
  id: sessionId,
  region,
  tanggal: session.tanggal || now.slice(0, 10),
  // ...field lain tetap...
};
```

Ganti blok `upsert` menjadi:

```ts
let { error: sessionError } = await admin.from('so_sessions').upsert(sessionPayload);

if (
  sessionError &&
  /region/i.test(sessionError.message || '') &&
  /(column|schema cache)/i.test(sessionError.message || '')
) {
  console.warn(
    '[so/sessions] Kolom region belum ada. Menyimpan tanpa region; jalankan supabase/so-region.sql.'
  );
  const fallbackPayload = { ...sessionPayload };
  delete fallbackPayload.region;
  ({ error: sessionError } = await admin.from('so_sessions').upsert(fallbackPayload));
}

if (sessionError) throw new Error(sessionError.message);
```

- [ ] **Step 3: Buat `/api/so/stock` sadar region**

Ganti seluruh isi `src/app/api/so/stock/route.ts` dengan:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';
import { normalizeSoRegion, resolveSessionRegion } from '@/lib/so-harian/region';

export const dynamic = 'force-dynamic';

/**
 * Stok sistem dari sesi Stock Opname Harian terbaru untuk satu region.
 *
 * Dipakai modal "Pilih Proses" di Kelola RO. Dibaca lewat server (service role)
 * supaya tetap tersedia di perangkat yang belum pernah mengatur koneksi
 * Supabase pada modul SO Harian (konfigurasi SO disimpan di localStorage).
 */
export async function GET(req: NextRequest) {
  try {
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ success: true, session: null, items: [] });
    }

    const { searchParams } = new URL(req.url);
    const region = normalizeSoRegion(searchParams.get('region'));

    let sessions: any[] | null = null;

    const withRegion = admin
      .from('so_sessions')
      .select('id,tanggal,gudang,status,total_items,region')
      .order('tanggal', { ascending: false })
      .limit(region ? 20 : 5);

    const firstAttempt = region ? await withRegion.eq('region', region) : await withRegion;

    if (!firstAttempt.error) {
      sessions = firstAttempt.data;
    } else {
      // Kolom region belum ada (migration belum dijalankan). Ambil lebih banyak
      // baris lalu filter dari ID sesi.
      const fallback = await admin
        .from('so_sessions')
        .select('id,tanggal,gudang,status,total_items')
        .order('tanggal', { ascending: false })
        .limit(50);
      if (fallback.error) throw new Error(fallback.error.message);
      sessions = fallback.data;
    }

    const candidates = (sessions || []).filter(
      (session) => !region || resolveSessionRegion(session) === region
    );

    for (const session of candidates) {
      const items: any[] = [];
      const PAGE_SIZE = 1000;
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: chunk, error: chunkErr } = await admin
          .from('so_details')
          .select('kode_barang,nama_barang,stok_sistem,qty_fisik,satuan')
          .eq('session_id', session.id)
          .order('kode_barang')
          .range(from, from + PAGE_SIZE - 1);
        if (chunkErr) throw new Error(chunkErr.message);
        if (!chunk || chunk.length === 0) break;
        items.push(...chunk);
        if (chunk.length < PAGE_SIZE) break;
      }

      if (items.length > 0) {
        return NextResponse.json({ success: true, session, items });
      }
    }

    return NextResponse.json({ success: true, session: candidates[0] ?? null, items: [] });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal memuat stok SO.' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru.

- [ ] **Step 5: Commit**

```powershell
git add -- supabase/so-region.sql src/app/api/so/sessions/route.ts src/app/api/so/stock/route.ts
git commit -m "feat(so): simpan region di sesi dan pilih stok SO per region"
```

---

### Task 5: Filter PR Ready Stock dan Monitoring SLA per region

**Files:**
- Modify: `src/app/api/stock-opname/pr-ready-items/route.ts:1-40`
- Modify: `src/app/api/stock-opname/sla-items/route.ts:8-50,116-122`

**Interfaces:**
- Consumes: `normalizeSoRegion` dari `region.ts`.
- Produces: `GET /api/stock-opname/pr-ready-items?region=JABODETABEK|KALBAR`; `GET /api/stock-opname/sla-items?filter=...&region=...`. Tanpa `region`, perilaku lama (`ALL`) tetap.

- [ ] **Step 1: Filter PR Ready Stock**

Di `src/app/api/stock-opname/pr-ready-items/route.ts`, tambahkan import:

```ts
import { normalizeSoRegion } from '@/lib/so-harian/region';
```

Di awal `GET`:

```ts
const { searchParams } = new URL(req.url);
const region = normalizeSoRegion(searchParams.get('region'));
```

Ganti bagian `const combined = ...` menjadi:

```ts
const combined = Array.from(mergedMap.values()).filter(
  (it) => !region || normalizeSoRegion(it.region) === region
);
```

Tambahkan `region` ke respons:

```ts
return NextResponse.json({
  success: true,
  region: region || 'ALL',
  count: items.length,
  totalQty,
  data: items,
});
```

- [ ] **Step 2: Filter Monitoring SLA**

Di `src/app/api/stock-opname/sla-items/route.ts`, tambahkan import:

```ts
import { normalizeSoRegion } from '@/lib/so-harian/region';
```

Setelah `const filter = ...`, tambahkan:

```ts
const region = normalizeSoRegion(searchParams.get('region'));
```

Di dalam `(roOrders || []).forEach((ro) => {`, tambahkan baris pertama:

```ts
if (region && normalizeSoRegion(ro.region) !== region) return;
```

Tambahkan `region` ke respons:

```ts
return NextResponse.json({
  success: true,
  region: region || 'ALL',
  count: items.length,
  totalQty,
  filter,
  data: items,
});
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru.

- [ ] **Step 4: Smoke test endpoint (dev server menyala di terminal terpisah)**

Run:

```powershell
Invoke-RestMethod "http://localhost:3000/api/stock-opname/pr-ready-items?region=JABODETABEK" | Select-Object success,region,count,totalQty
Invoke-RestMethod "http://localhost:3000/api/stock-opname/pr-ready-items?region=KALBAR" | Select-Object success,region,count,totalQty
Invoke-RestMethod "http://localhost:3000/api/stock-opname/sla-items?filter=fulfilled&region=KALBAR" | Select-Object success,region,count,totalQty
```

Expected: `region` sesuai, dan jumlah JABODETABEK/KALBAR berbeda (data PR saat ini 5 JABO + 1 KALBAR yang lolos ready stock).

- [ ] **Step 5: Commit**

```powershell
git add -- src/app/api/stock-opname/pr-ready-items/route.ts src/app/api/stock-opname/sla-items/route.ts
git commit -m "feat(so): filter PR ready stock dan monitoring SLA per region"
```

---

### Task 6: Opsi tanpa "Semua" pada AreaFilterPills

**Files:**
- Modify: `src/components/ui/AreaFilterPills.tsx:10-17,100-112`

**Interfaces:**
- Produces: prop opsional `allowAll?: boolean` (default `true`). Komponen lain tidak berubah perilakunya.

- [ ] **Step 1: Tambahkan prop**

Ubah interface dan parameter:

```tsx
interface AreaFilterPillsProps {
  value?: string;
  onChange?: (region: StandardRegion) => void;
  syncUrl?: boolean;
  showIcon?: boolean;
  label?: string;
  allowAll?: boolean;
  className?: string;
}

export default function AreaFilterPills({
  value,
  onChange,
  syncUrl = true,
  showIcon = false,
  label,
  allowAll = true,
  className = '',
}: AreaFilterPillsProps) {
```

- [ ] **Step 2: Sembunyikan tombol "Semua" bila diminta**

Bungkus tombol `Semua` dengan kondisi:

```tsx
{allowAll && (
  <button
    type="button"
    onClick={() => handleSelect('ALL')}
    className={`rounded-full px-3 py-1 font-medium transition-all ${
      currentRegion === 'ALL'
        ? 'bg-[#0b57d0] text-white shadow-sm dark:bg-[#a8c7fa] dark:text-[#041e49]'
        : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
    }`}
    title="Tampilkan semua area (Jabodetabek & Kalbar)"
  >
    Semua
  </button>
)}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru. Semua pemanggil lama tetap valid karena prop opsional.

- [ ] **Step 4: Commit**

```powershell
git add -- src/components/ui/AreaFilterPills.tsx
git commit -m "feat(ui): izinkan AreaFilterPills tanpa opsi semua"
```

---

### Task 7: Region aktif dan pemilih region di halaman SO

**Files:**
- Modify: `src/app/stock-opname/page.tsx`
- Modify: `src/components/so-harian/StockOpnameView.tsx:1-75,219-270,411-430`

**Interfaces:**
- Consumes: `resolveActiveSoRegion`, `normalizeSoRegion`, `buildSoSessionId`, `SO_ACTIVE_REGION_KEY`.
- Produces: `StockOpnameView({ initialRegion })`, state `region`, dan `UploadSection key={region} region={region}`.

- [ ] **Step 1: Teruskan region dari URL**

Ganti `src/app/stock-opname/page.tsx` dengan:

```tsx
import React from 'react';
import { StockOpnameView } from '@/components/so-harian/StockOpnameView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Stock Opname Harian | Dashboard CA',
  description:
    'Sistem rekonsiliasi stok harian fisik vs sistem per region untuk kategori Peralatan dan Perlengkapan Tetap',
};

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function StockOpnamePage({ searchParams }: PageProps) {
  const { region } = await searchParams;
  return <StockOpnameView initialRegion={region ?? null} />;
}
```

- [ ] **Step 2: Tambahkan import dan props di StockOpnameView**

Tambahkan import:

```tsx
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import AreaFilterPills from '@/components/ui/AreaFilterPills';
import {
  SO_ACTIVE_REGION_KEY,
  buildSoSessionId,
  normalizeSoRegion,
  resolveActiveSoRegion,
  type SoRegion,
} from '@/lib/so-harian/region';
```

Ganti signature komponen:

```tsx
interface StockOpnameViewProps {
  initialRegion?: string | null;
}

export function StockOpnameView({ initialRegion = null }: StockOpnameViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { allowedRegion, isRegionLocked } = useAuth();
  const todayDate = new Date().toISOString().split('T')[0];

  // Jangan membaca localStorage di initializer: server tidak punya localStorage,
  // sehingga hasil render pertama bisa berbeda dari klien (hydration mismatch).
  const [region, setRegion] = useState<SoRegion>(() =>
    resolveActiveSoRegion({
      requested: initialRegion,
      allowedRegion,
      isRegionLocked,
    })
  );
```

- [ ] **Step 3: Inisialisasi sesi memakai region**

Ganti inisialisasi `sessionData` menjadi:

```tsx
const [sessionData, setSessionData] = useState<Partial<SOSession>>({
  id: buildSoSessionId(region, todayDate),
  tanggal: todayDate,
  region,
  gudang: 'Gudang Utama',
  petugas: 'Petugas Gudang',
  status: 'DRAFT',
});
```

- [ ] **Step 4: Tambahkan handler pindah region**

Setelah `showToast`, tambahkan:

```tsx
const applyRegion = (next: SoRegion) => {
  setRegion(next);
  setItems([]);
  setLoadedSessionMeta(null);
  setActiveTab('UPLOAD');
  setPreviousSessionStock(new Map());
  setPreviousSessionItems([]);
  setPreviousSessionDate(null);
  setPreviousSessionStatus(null);
  setSessionData((prev) => ({
    ...prev,
    region: next,
    id: buildSoSessionId(next, String(prev.tanggal || todayDate).slice(0, 10)),
  }));
  try {
    localStorage.setItem(SO_ACTIVE_REGION_KEY, next);
  } catch {
    // localStorage bisa diblokir; region tetap berlaku untuk sesi ini.
  }
  if (pathname) router.replace(`${pathname}?region=${next}`);
};

const handleRegionChange = (next: string) => {
  const normalized = normalizeSoRegion(next);
  if (!normalized || normalized === region) return;
  // Akun yang dikunci tidak boleh ditanya konfirmasi; region profil memaksa.
  if (!isRegionLocked && items.length > 0) {
    const ok = window.confirm(
      `Pindah ke ${normalized}? ${items.length} item yang belum disimpan akan ditinggalkan.`
    );
    if (!ok) return;
  }
  applyRegion(normalized);
};

// Pulihkan region tersimpan setelah mount. Dilewati bila URL sudah menentukan
// region atau akun dikunci ke satu region.
useEffect(() => {
  if (isRegionLocked) return;
  if (normalizeSoRegion(initialRegion)) return;

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(SO_ACTIVE_REGION_KEY);
  } catch {
    return;
  }

  const next = normalizeSoRegion(stored);
  if (!next || next === region) return;
  applyRegion(next);
  // Hanya berjalan sekali setelah mount; region awal sudah dipakai sebagai basis.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// Profil bisa selesai dimuat setelah render pertama. Untuk akun yang dikunci,
// region profil selalu menang.
useEffect(() => {
  if (!isRegionLocked) return;
  const locked = normalizeSoRegion(allowedRegion);
  if (!locked || locked === region) return;
  setRegion(locked);
  setItems([]);
  setLoadedSessionMeta(null);
  setSessionData((prev) => ({
    ...prev,
    region: locked,
    id: buildSoSessionId(locked, String(prev.tanggal || todayDate).slice(0, 10)),
  }));
  try {
    localStorage.setItem(SO_ACTIVE_REGION_KEY, locked);
  } catch {
    // abaikan
  }
  if (pathname) router.replace(`${pathname}?region=${locked}`);
}, [isRegionLocked, allowedRegion, region, pathname, router, todayDate]);
```

- [ ] **Step 5: Tampilkan pemilih region**

Di baris metadata sesi (setelah input Petugas), tambahkan:

```tsx
<AreaFilterPills
  value={region}
  onChange={handleRegionChange}
  allowAll={false}
  syncUrl={false}
  showIcon
  label="Region:"
/>
```

- [ ] **Step 6: Remount UploadSection per region**

Ganti pemakaian `UploadSection` menjadi:

```tsx
<UploadSection
  key={region}
  region={region}
  onCompilationSuccess={handleCompilationSuccess}
  previousSessionStock={previousSessionStock}
  previousSessionItems={previousSessionItems}
  previousSessionDate={previousSessionDate}
  previousSessionStatus={previousSessionStatus}
/>
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: satu error sementara di `StockOpnameView.tsx` karena `UploadSection` belum menerima prop `region`. Error itu hilang setelah Task 9. Error lain di luar itu harus diperbaiki sekarang.

- [ ] **Step 8: Commit**

```powershell
git add -- src/app/stock-opname/page.tsx src/components/so-harian/StockOpnameView.tsx
git commit -m "feat(so): region aktif dan pemilih region di halaman SO"
```

---

### Task 8: Simpan, rollover, riwayat, cetak, dan ekspor per region

**Files:**
- Modify: `src/components/so-harian/StockOpnameView.tsx`
- Modify: `src/components/so-harian/HistorySection.tsx`
- Modify: `src/components/so-harian/ReportPrintView.tsx:39-42`
- Modify: `src/lib/so-harian/excelService.ts:1-2,350-360`

**Interfaces:**
- Consumes: `buildSoSessionId`, `parseSoSessionId`, `resolveSessionRegion`, `filterSessionsByRegion`, `SO_ACTIVE_REGION_KEY`.
- Produces: sesi disimpan dengan ID dan `region` yang benar; riwayat aktif + bagian legacy; cetak/Excel menyertakan region.

- [ ] **Step 1: Rollover memakai region aktif**

Di `StockOpnameView.tsx`, ubah import region menjadi:

```tsx
import {
  SO_ACTIVE_REGION_KEY,
  buildSoSessionId,
  normalizeSoRegion,
  parseSoSessionId,
  resolveActiveSoRegion,
  resolveSessionRegion,
  type SoRegion,
} from '@/lib/so-harian/region';
```

Di effect pemuatan sesi sebelumnya, ganti dua baris:

```tsx
const sessions = await getAllSessions(region);
const previous = pickPreviousSession(sessions, sessionData.tanggal, region);
```

Dan ubah dependency effect dari `[sessionData.tanggal]` menjadi:

```tsx
}, [sessionData.tanggal, region]);
```

- [ ] **Step 2: Simpan dengan ID dan region yang benar**

Ganti `handleSaveSession` dengan:

```tsx
const handleSaveSession = async () => {
  if (items.length === 0) {
    showToast('Belum ada data barang untuk disimpan.', 'error');
    return;
  }

  if (loadedSessionMeta && parseSoSessionId(loadedSessionMeta.id).legacy) {
    showToast(
      'Sesi lama tanpa region bersifat arsip dan tidak bisa ditimpa. Pilih tanggal/region lain untuk menyimpan sesi baru.',
      'error'
    );
    return;
  }

  setIsSaving(true);
  try {
    const summary = calculateSessionSummary(items);
    const dateKey =
      String(sessionData.tanggal || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const sameAsLoaded =
      loadedSessionMeta && String(loadedSessionMeta.tanggal || '').slice(0, 10) === dateKey;
    const targetId = sameAsLoaded
      ? loadedSessionMeta.id
      : buildSoSessionId(region, dateKey);

    const payload: Partial<SOSession> = {
      ...sessionData,
      id: targetId,
      tanggal: dateKey,
      region,
      akurasi_persen: summary.akurasiPersen,
      status: summary.itemUnchecked === 0 ? 'COMPLETED' : 'IN_PROGRESS',
    };

    const savedId = await saveSession(payload, items);
    setSessionData((prev) => ({ ...prev, id: savedId, tanggal: dateKey, region }));
    setLoadedSessionMeta({ id: savedId, tanggal: dateKey });
    showToast(`Sesi SO ${region} tanggal ${dateKey} berhasil disimpan!`, 'success');
  } catch (err: any) {
    showToast(`Gagal menyimpan: ${err.message}`, 'error');
  } finally {
    setIsSaving(false);
  }
};
```

- [ ] **Step 3: Nama file ekspor menyertakan region**

Ganti pemanggilan unduhan di `handleExportExcel`:

```tsx
downloadBlob(
  blob,
  `Rekap_SO_${region}_${sessionData.tanggal || 'Harian'}_${sessionData.gudang || 'Gudang'}.xlsx`
);
```

- [ ] **Step 4: Buka sesi riwayat dan pindah region otomatis**

Ganti `handleOpenFromHistory` dengan:

```tsx
const handleOpenFromHistory = async (sessionId: string) => {
  const { session, items: loadedItems } = await loadSession(sessionId);
  if (!session) return;

  const sessionRegion = resolveSessionRegion(session);
  if (sessionRegion && sessionRegion !== region) {
    setRegion(sessionRegion);
    try {
      localStorage.setItem(SO_ACTIVE_REGION_KEY, sessionRegion);
    } catch {
      // abaikan
    }
    if (pathname) router.replace(`${pathname}?region=${sessionRegion}`);
  }

  setSessionData({ ...session, region: sessionRegion ?? undefined });
  setItems(loadedItems);
  setLoadedSessionMeta({ id: session.id, tanggal: session.tanggal });
  setActiveTab('SO_TABLE');
  showToast(
    `Memuat sesi SO ${sessionRegion || 'tanpa region'} tanggal ${session.tanggal}`,
    'success'
  );
};
```

- [ ] **Step 5: Teruskan region ke HistorySection**

Ganti pemakaian `HistorySection`:

```tsx
<HistorySection
  region={region}
  onOpenSession={handleOpenFromHistory}
  onPrintSession={handlePrintFromHistory}
/>
```

- [ ] **Step 6: Filter riwayat dan tampilkan sesi legacy**

Di `src/components/so-harian/HistorySection.tsx`, tambahkan import:

```tsx
import {
  filterSessionsByRegion,
  resolveSessionRegion,
  type SoRegion,
} from '@/lib/so-harian/region';
```

Ubah props dan signature:

```tsx
interface HistorySectionProps {
  region: SoRegion;
  onOpenSession: (sessionId: string) => void;
  onPrintSession: (session: SOSession, items: any[]) => void;
}

export default function HistorySection({ region, onOpenSession, onPrintSession }: HistorySectionProps) {
  const [sessions, setSessions] = useState<SOSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showLegacy, setShowLegacy] = useState(false);
```

Ganti blok `filteredSessions` menjadi:

```tsx
const matchesSearch = (s: SOSession) => {
  if (!searchTerm) return true;
  const term = searchTerm.toLowerCase();
  return (
    (s.tanggal || '').toLowerCase().includes(term) ||
    (s.gudang || '').toLowerCase().includes(term) ||
    (s.petugas || '').toLowerCase().includes(term)
  );
};

const regionSessions = filterSessionsByRegion(sessions, region);
const legacySessions = sessions.filter((s) => resolveSessionRegion(s) === null);
const filteredSessions = regionSessions.filter(matchesSearch);
const filteredLegacy = legacySessions.filter(matchesSearch);
```

Tambahkan badge region di kartu sesi, setelah badge `s.gudang`:

```tsx
<span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold px-2 py-0.5 rounded-full">
  {resolveSessionRegion(s) || region}
</span>
```

Ubah nama file ekspor riwayat:

```tsx
downloadBlob(
  blob,
  `Laporan_SO_${resolveSessionRegion(session) || region}_${session.tanggal || 'Harian'}_${session.gudang || 'Gudang'}.xlsx`
);
```

Setelah blok grid kartu sesi (sebelum penutup `</div>` terakhir), tambahkan bagian legacy:

```tsx
{legacySessions.length > 0 && (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-amber-200/90 dark:border-amber-800/60 p-4 shadow-sm">
    <button
      type="button"
      onClick={() => setShowLegacy((value) => !value)}
      className="w-full flex items-center justify-between text-left"
    >
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-white">
          Sesi lama tanpa region ({legacySessions.length})
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          Arsip sebelum pemisahan region. Tidak dipakai untuk rollover region mana pun.
        </p>
      </div>
      <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
        {showLegacy ? 'Sembunyikan' : 'Tampilkan'}
      </span>
    </button>

    {showLegacy && (
      <div className="mt-3 space-y-2">
        {filteredLegacy.length === 0 ? (
          <p className="text-xs text-slate-400">Tidak ada sesi lama yang cocok dengan pencarian.</p>
        ) : (
          filteredLegacy.map((s) => (
            <div
              key={s.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2"
            >
              <div className="text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-100">{s.tanggal}</span>
                <span className="ml-2 text-slate-500 dark:text-slate-400">{s.gudang}</span>
                <span className="ml-2 text-slate-400">{s.total_items ?? 0} SKU</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onOpenSession(s.id)}
                  className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-xl text-xs font-bold"
                >
                  Buka
                </button>
                <button
                  onClick={() => handleDelete(s.id, s.tanggal)}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl"
                  title="Hapus Sesi"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 7: Tampilkan region di cetak dan Excel**

Di `src/components/so-harian/ReportPrintView.tsx`, tambahkan import:

```tsx
import { resolveSessionRegion } from '@/lib/so-harian/region';
```

Tambahkan baris setelah `Gudang`:

```tsx
<p><strong>Region:</strong> {resolveSessionRegion(session) || '—'}</p>
```

Di `src/lib/so-harian/excelService.ts`, tambahkan import:

```ts
import { resolveSessionRegion } from './region.ts';
```

Tambahkan baris pertama pada `summaryRows`:

```ts
{ Informasi: 'Region', Nilai: resolveSessionRegion(session) || '-' },
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru.

- [ ] **Step 9: Commit**

```powershell
git add -- src/components/so-harian/StockOpnameView.tsx src/components/so-harian/HistorySection.tsx src/components/so-harian/ReportPrintView.tsx src/lib/so-harian/excelService.ts
git commit -m "feat(so): simpan, rollover, riwayat, dan ekspor per region"
```

---

### Task 9: URL master dan sumber data per region di UploadSection

**Files:**
- Modify: `src/components/so-harian/UploadSection.tsx:25-163,239-515,736,1025,1155,1249,1325,1378,1454`

**Interfaces:**
- Consumes: `SoRegion`, `matchesRegion`.
- Produces: `UploadSection({ region })`; URL per region di `so_sheet_urls_v2`; PR/SLA/SJ difilter region; label dan peringatan region.

- [ ] **Step 1: Tambahkan import**

Di `src/components/so-harian/UploadSection.tsx`, tambahkan:

```tsx
import { matchesRegion } from '@/lib/utils/region-helper';
import type { SoRegion } from '@/lib/so-harian/region';
```

- [ ] **Step 2: Ganti `DEFAULT_SHEET_URLS` menjadi per region**

Ganti blok `const DEFAULT_SHEET_URLS: Record<string, string> = { ... };` (baris 44-55) dengan:

```tsx
type SoSheetType = 'PENERIMAAN' | 'PERALATAN' | 'PERLENGKAPAN' | 'RO';
type SoSheetUrls = Record<SoSheetType, string>;

const KALBAR_FALLBACKS: SoSheetUrls = {
  RO: '',
  PENERIMAAN:
    'https://docs.google.com/spreadsheets/d/1neWHHRIjYm3Q4gsoV6Id258jcj5QvOFwhS84PMJL0lE/edit?gid=352107216#gid=352107216',
  PERALATAN:
    'https://docs.google.com/spreadsheets/d/1fiRhYHPDgSadKIDLlnqyD9K-ZBXg2_3vlyqI-4jdNfc/edit?gid=1727080084#gid=1727080084',
  PERLENGKAPAN:
    'https://docs.google.com/spreadsheets/d/1fiRhYHPDgSadKIDLlnqyD9K-ZBXg2_3vlyqI-4jdNfc/edit?gid=1129207194#gid=1129207194',
};

const JABO_FALLBACKS: SoSheetUrls = {
  RO: '',
  PENERIMAAN: '',
  PERALATAN:
    'https://docs.google.com/spreadsheets/d/1fiRhYHPDgSadKIDLlnqyD9K-ZBXg2_3vlyqI-4jdNfc/edit?gid=1721157388#gid=1721157388',
  PERLENGKAPAN:
    'https://docs.google.com/spreadsheets/d/1fiRhYHPDgSadKIDLlnqyD9K-ZBXg2_3vlyqI-4jdNfc/edit?gid=737037942#gid=737037942',
};

const DEFAULT_SHEET_URLS: Record<SoRegion, SoSheetUrls> = {
  JABODETABEK: {
    RO: process.env.NEXT_PUBLIC_SO_SHEET_RO_JABO_URL || JABO_FALLBACKS.RO,
    PENERIMAAN:
      process.env.NEXT_PUBLIC_SO_SHEET_PENERIMAAN_JABO_URL || JABO_FALLBACKS.PENERIMAAN,
    PERALATAN:
      process.env.NEXT_PUBLIC_SO_SHEET_PERALATAN_JABO_URL || JABO_FALLBACKS.PERALATAN,
    PERLENGKAPAN:
      process.env.NEXT_PUBLIC_SO_SHEET_PERLENGKAPAN_JABO_URL || JABO_FALLBACKS.PERLENGKAPAN,
  },
  KALBAR: {
    RO:
      process.env.NEXT_PUBLIC_SO_SHEET_RO_KALBAR_URL ||
      process.env.NEXT_PUBLIC_SO_SHEET_RO_URL ||
      KALBAR_FALLBACKS.RO,
    PENERIMAAN:
      process.env.NEXT_PUBLIC_SO_SHEET_PENERIMAAN_KALBAR_URL ||
      process.env.NEXT_PUBLIC_SO_SHEET_PENERIMAAN_URL ||
      KALBAR_FALLBACKS.PENERIMAAN,
    PERALATAN:
      process.env.NEXT_PUBLIC_SO_SHEET_PERALATAN_KALBAR_URL ||
      process.env.NEXT_PUBLIC_SO_SHEET_PERALATAN_URL ||
      KALBAR_FALLBACKS.PERALATAN,
    PERLENGKAPAN:
      process.env.NEXT_PUBLIC_SO_SHEET_PERLENGKAPAN_KALBAR_URL ||
      process.env.NEXT_PUBLIC_SO_SHEET_PERLENGKAPAN_URL ||
      KALBAR_FALLBACKS.PERLENGKAPAN,
  },
};
```

- [ ] **Step 3: Tambahkan prop region**

Ubah interface dan signature:

```tsx
interface UploadSectionProps {
  region: SoRegion;
  onCompilationSuccess: (compiledItems: SOItem[], metadata: any) => void;
  previousSessionStock?: Map<string, number>;
  previousSessionItems?: SOItem[];
  previousSessionDate?: string | null;
  previousSessionStatus?: string | null;
}

export default function UploadSection({
  region,
  onCompilationSuccess,
  previousSessionStock = new Map(),
  previousSessionItems = [],
  previousSessionDate = null,
  previousSessionStatus = null,
}: UploadSectionProps) {
```

- [ ] **Step 4: Inisialisasi URL per region dan migrasi sekali**

Ganti blok state `sheetUrls` (baris 85-120) dengan:

```tsx
const [sheetUrls, setSheetUrls] = useState<SoSheetUrls>(() => {
  const defaults = DEFAULT_SHEET_URLS[region];
  if (typeof window === 'undefined') return defaults;

  try {
    const savedV2 = localStorage.getItem('so_sheet_urls_v2');
    if (savedV2) {
      const parsed = JSON.parse(savedV2);
      const regionUrls = parsed?.[region] || {};
      return {
        RO: regionUrls.RO ?? defaults.RO,
        PENERIMAAN: regionUrls.PENERIMAAN ?? defaults.PENERIMAAN,
        PERALATAN: regionUrls.PERALATAN ?? defaults.PERALATAN,
        PERLENGKAPAN: regionUrls.PERLENGKAPAN ?? defaults.PERLENGKAPAN,
      };
    }

    const legacyRaw = localStorage.getItem('so_sheet_urls');
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const migrated: Record<SoRegion, SoSheetUrls> = {
        JABODETABEK: { ...DEFAULT_SHEET_URLS.JABODETABEK },
        KALBAR: {
          RO: legacy.RO ?? DEFAULT_SHEET_URLS.KALBAR.RO,
          PENERIMAAN: legacy.PENERIMAAN ?? DEFAULT_SHEET_URLS.KALBAR.PENERIMAAN,
          PERALATAN: legacy.PERALATAN ?? DEFAULT_SHEET_URLS.KALBAR.PERALATAN,
          PERLENGKAPAN: legacy.PERLENGKAPAN ?? DEFAULT_SHEET_URLS.KALBAR.PERLENGKAPAN,
        },
      };
      // Key lama tidak dihapus agar masih bisa dipulihkan manual.
      localStorage.setItem('so_sheet_urls_v2', JSON.stringify(migrated));
      return migrated[region];
    }
  } catch {
    // Konfigurasi tersimpan rusak; pakai default region.
  }

  return defaults;
});

const updateSheetUrl = (type: SoSheetType, url: string) => {
  setSheetUrls((prev) => {
    const updated = { ...prev, [type]: url };
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('so_sheet_urls_v2');
        const all = raw
          ? JSON.parse(raw)
          : {
              JABODETABEK: { ...DEFAULT_SHEET_URLS.JABODETABEK },
              KALBAR: { ...DEFAULT_SHEET_URLS.KALBAR },
            };
        all[region] = updated;
        localStorage.setItem('so_sheet_urls_v2', JSON.stringify(all));
      } catch {
        // localStorage bisa diblokir; URL tetap berlaku untuk sesi ini.
      }
    }
    return updated;
  });
};

const resetToDefaultUrl = (type: SoSheetType) => {
  updateSheetUrl(type, DEFAULT_SHEET_URLS[region][type] || '');
};
```

Di `handleFetchFromLink` (baris 239), ubah signature agar hanya menerima tipe sheet yang valid; isi fungsi tidak berubah:

```tsx
const handleFetchFromLink = async (type: SoSheetType) => {
  const url = sheetUrls[type];
  // ...isi lama tetap...
};
```

- [ ] **Step 5: Gunakan default region pada tarik master**

Di `handleFetchAllMasterStock`, ganti:

```tsx
const urlPeralatan = sheetUrls.PERALATAN || DEFAULT_SHEET_URLS[region].PERALATAN;
const urlPerlengkapan = sheetUrls.PERLENGKAPAN || DEFAULT_SHEET_URLS[region].PERLENGKAPAN;
```

- [ ] **Step 6: Filter Surat Jalan per region**

Di `handleFetchFromSuratJalan`, ganti awal filter menjadi:

```tsx
const allSj: any[] = json.data;
const filteredSj = allSj
  .filter((sj) => matchesRegion(sj.region, region))
  .filter((sj) => {
    const st = (sj.status || '').toUpperCase();
    if (sjFilterStatus === 'DELIVERED') {
      return st === 'DELIVERED' || st === 'SELESAI';
    }
    return (
      st === 'DELIVERED' ||
      st === 'SELESAI' ||
      st === 'SHIPPED' ||
      st === 'DALAM PENGIRIMAN'
    );
  });
```

- [ ] **Step 7: Kirim region ke Monitoring SLA dan PR Ready Stock**

Di `handleFetchFromMonitoringSla`, ganti URL:

```tsx
const res = await fetch(`/api/stock-opname/sla-items?filter=${filter}&region=${region}`);
```

Dan pesan kosong:

```tsx
throw new Error(
  filter === 'received'
    ? `Belum ada item berstatus diterima outlet pada fitur Monitoring SLA untuk region ${region}.`
    : `Belum ada item dengan QTY terpenuhi pada fitur Monitoring SLA untuk region ${region}.`
);
```

Di `handleFetchFromPrReadyStock`, ganti URL:

```tsx
const res = await fetch(`/api/stock-opname/pr-ready-items?region=${region}`, {
  cache: 'no-store',
});
```

Dan pesan kosong:

```tsx
throw new Error(
  `Belum ada item PR yang berstatus Selesai / Ready Stock untuk region ${region}.`
);
```

Ubah dependency auto-fetch:

```tsx
}, [region]);
```

- [ ] **Step 8: Sesuaikan perbandingan URL dan label di UI**

Ganti ketiga perbandingan reset:

```tsx
{sheetUrls.PENERIMAAN !== DEFAULT_SHEET_URLS[region].PENERIMAAN && (
{sheetUrls.PERALATAN !== DEFAULT_SHEET_URLS[region].PERALATAN && (
{sheetUrls.PERLENGKAPAN !== DEFAULT_SHEET_URLS[region].PERLENGKAPAN && (
```

Ubah judul kartu:

```tsx
<h4 className="font-bold text-slate-800 dark:text-white text-sm">Data RO Harian — {region}</h4>
<h4 className="font-bold text-slate-800 dark:text-white text-sm">Data Penerimaan Harian — {region}</h4>
<h4 className="font-bold text-slate-800 dark:text-white text-sm">Stok Awal: Peralatan — {region}</h4>
<h4 className="font-bold text-slate-800 dark:text-white text-sm">Stok Awal: Perlengkapan Tetap — {region}</h4>
```

Tambahkan peringatan master kosong tepat setelah input URL Peralatan:

```tsx
{!sheetUrls.PERALATAN && (
  <div className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-2 py-1">
    Master {region} belum disiapkan. Kompilasi tetap bisa jalan dari RO/Penerimaan.
  </div>
)}
```

Dan setelah input URL Perlengkapan:

```tsx
{!sheetUrls.PERLENGKAPAN && (
  <div className="text-[10px] text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2 py-1">
    Master {region} belum disiapkan. Kompilasi tetap bisa jalan dari RO/Penerimaan.
  </div>
)}
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru. Error sementara dari Task 7 (prop `region`) sekarang hilang.

- [ ] **Step 10: Commit**

```powershell
git add -- src/components/so-harian/UploadSection.tsx
git commit -m "feat(so): URL master dan sumber data per region di UploadSection"
```

---

### Task 10: Kelola RO memakai stok SO region yang dipilih

**Files:**
- Modify: `src/components/distribution/RoManagerView.tsx:272-322,506-513`

**Interfaces:**
- Consumes: `getAllSessionsSync(region)` dari Task 3 dan `GET /api/so/stock?region=` dari Task 4.
- Produces: `fetchSoStock(targetRegion)`; lookup stok SO mengikuti `selectedRegion` atau region form RO.

- [ ] **Step 1: Tambahkan parameter region pada `fetchSoStock`**

Ganti signature dan isi awal fungsi:

```tsx
const fetchSoStock = async (targetRegion: 'JABODETABEK' | 'KALBAR') => {
  setIsSoStockLoading(true);
  try {
    // 1. Data lokal perangkat ini untuk region yang sama.
    let localPick: { tanggal: string | null; items: SOItem[] } = { tanggal: null, items: [] };
    try {
      const localSessions = getAllSessionsSync(targetRegion);
      for (const session of localSessions.slice(0, 3)) {
        const { items } = await loadSession(session.id);
        if (items && items.length > 0) {
          localPick = { tanggal: session.tanggal || null, items };
          break;
        }
      }
    } catch (localErr) {
      console.warn('Gagal membaca sesi SO lokal:', localErr);
    }

    // 2. Data dari Supabase lewat server, difilter region.
    let cloudPick: { tanggal: string | null; items: SOItem[] } = { tanggal: null, items: [] };
    try {
      const res = await fetch(`/api/so/stock?region=${targetRegion}`, { cache: 'no-store' });
      const json = await res.json();
      if (json?.success && Array.isArray(json.items) && json.items.length > 0) {
        cloudPick = { tanggal: json.session?.tanggal || null, items: json.items };
      }
    } catch (cloudErr) {
      console.warn('Gagal memuat stok SO dari server:', cloudErr);
    }
```

Sisanya (pemilihan `useCloud`, `setSoSessionDate`, `finally`) tetap sama.

- [ ] **Step 2: Hapus effect lama tanpa region**

Hapus blok:

```tsx
useEffect(() => {
  fetchSoStock();
}, []);
```

- [ ] **Step 3: Panggil ulang saat region berubah**

Setelah state `region` di form RO:

```tsx
const [region, setRegion] = useState<'JABODETABEK' | 'KALBAR'>('JABODETABEK');
```

tambahkan:

```tsx
const soStockRegion: 'JABODETABEK' | 'KALBAR' =
  selectedRegion === 'JABODETABEK' || selectedRegion === 'KALBAR'
    ? selectedRegion
    : region;

useEffect(() => {
  fetchSoStock(soStockRegion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [soStockRegion]);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/distribution/RoManagerView.tsx
git commit -m "feat(ro): stok SO mengikuti region yang dipilih"
```

---

### Task 11: Dokumentasi skema dan ENV

**Files:**
- Modify: `src/components/so-harian/DocViewerModal.tsx:34-71`
- Modify: `.env.example`

**Interfaces:**
- Tidak ada API baru. Dokumentasi harus cocok dengan migration Task 4 dan nama ENV Task 9.

- [ ] **Step 1: Tambahkan region pada SQL di DocViewerModal**

Di `schemaSQL`, tambahkan setelah `petugas`:

```sql
    region TEXT, -- 'JABODETABEK' | 'KALBAR' | NULL (sesi lama)
```

Tambahkan index setelah index tanggal:

```sql
CREATE INDEX IF NOT EXISTS so_sessions_region_tanggal_idx ON public.so_sessions(region, tanggal DESC);
```

- [ ] **Step 2: Dokumentasikan ENV opsional**

Tambahkan di `.env.example` setelah bagian Google Spreadsheet RO:

```bash
# ==============================================================================
# SO HARIAN — LINK MASTER PER REGION (opsional)
# Default link sudah tertanam di kode. ENV hanya dipakai bila ingin menimpa.
# KALBAR juga membaca nama lama NEXT_PUBLIC_SO_SHEET_*_URL bila variabel
# khusus KALBAR kosong.
# ==============================================================================
# NEXT_PUBLIC_SO_SHEET_PENERIMAAN_KALBAR_URL=
# NEXT_PUBLIC_SO_SHEET_PERALATAN_KALBAR_URL=
# NEXT_PUBLIC_SO_SHEET_PERLENGKAPAN_KALBAR_URL=
# NEXT_PUBLIC_SO_SHEET_PENERIMAAN_JABO_URL=
# NEXT_PUBLIC_SO_SHEET_PERALATAN_JABO_URL=
# NEXT_PUBLIC_SO_SHEET_PERLENGKAPAN_JABO_URL=
```

- [ ] **Step 3: Commit**

```powershell
git add -- src/components/so-harian/DocViewerModal.tsx .env.example
git commit -m "docs(so): dokumentasikan region pada skema dan env"
```

---

### Task 12: Verifikasi menyeluruh dan smoke test

**Files:**
- Tidak ada file baru. Perbaiki hanya jika verifikasi menemukan masalah.

**Interfaces:**
- Menguji seluruh kontrak dari Task 1-11.

- [ ] **Step 1: Jalankan seluruh unit test**

Run:

```powershell
node --test "src/lib/**/*.test.mjs"
```

Expected: semua test lulus, termasuk `region.test.mjs` dan `rollover.test.mjs`.

- [ ] **Step 2: Type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: 0 error.

- [ ] **Step 3: Pastikan dev server berhenti, lalu build**

Run:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,ProcessName
```

Jika ada dev server yang berjalan, hentikan dulu. Setelah itu:

```powershell
npm.cmd run build
```

Expected: build sukses. Jangan menjalankan langkah ini bersamaan dengan dev server.

- [ ] **Step 4: Jalankan migration di Supabase**

Buka Supabase Dashboard -> SQL Editor, jalankan isi `supabase/so-region.sql`. Verifikasi:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'so_sessions' and column_name = 'region';
```

Expected: satu baris `region`, `text`, `YES`.

- [ ] **Step 5: Smoke test UI JABODETABEK**

Jalankan dev server di terminal terpisah (`npm.cmd run dev`), lalu buka:

```text
http://localhost:3000/stock-opname?region=JABODETABEK
```

Periksa:

- Pil region menampilkan JABO aktif dan tidak ada tombol "Semua".
- Input master Peralatan berisi gid `1721157388`.
- Input master Perlengkapan berisi gid `737037942`.
- Klik tarik master; jumlah item > 0 dan qty Perlengkapan bukan 0.
- Tarik PR Ready Stock; data hanya JABODETABEK.
- Tarik Monitoring SLA; tidak ada RO KALBAR.

- [ ] **Step 6: Smoke test UI KALBAR dan pemisahan sesi**

Buka:

```text
http://localhost:3000/stock-opname?region=KALBAR
```

Periksa:

- Input master berisi gid KALBAR (`1727080084` dan `1129207194`).
- PR Ready Stock hanya KALBAR.
- Simpan sesi KALBAR. Lalu pindah ke JABODETABEK dan simpan sesi tanggal yang sama.
- Di Supabase, jalankan:

```sql
select id, region, tanggal, total_items
from public.so_sessions
order by tanggal desc, region;
```

Expected: dua baris pada tanggal yang sama, `so-jabodetabek-...` dengan region `JABODETABEK` dan `so-kalbar-...` dengan region `KALBAR`.

- [ ] **Step 7: Smoke test rollover dan riwayat**

- Buat sesi KALBAR tanggal kemarin (bisa dengan mengubah input tanggal), simpan, lalu buka tanggal hari ini untuk JABODETABEK. Pastikan stok awal tidak memakai sesi KALBAR.
- Buka tab Riwayat di JABODETABEK: hanya sesi JABODETABEK yang tampil.
- Jika ada sesi lama `so-YYYY-MM-DD`, pastikan muncul di bagian "Sesi lama tanpa region" dan tidak dipakai rollover.
- Buka sesi KALBAR dari riwayat saat region aktif JABODETABEK; region harus berpindah otomatis ke KALBAR.

- [ ] **Step 8: Smoke test Kelola RO**

- Buka menu Kelola RO, pilih region KALBAR, buka modal "Pilih Proses".
- Stok yang tampil harus berasal dari sesi SO KALBAR, bukan JABODETABEK.
- Ulangi untuk JABODETABEK.

- [ ] **Step 9: Smoke test cetak dan Excel**

- Cetak berita acara: baris **Region** tampil dan sesuai.
- Unduh Excel: sheet Ringkasan memuat baris **Region**; nama file memuat region.

- [ ] **Step 10: Smoke test akun terkunci region**

- Login sebagai user non-super user dengan `allowed_region = KALBAR`.
- Buka `/stock-opname`. Pil region harus terkunci di KALBAR dan tidak bisa berpindah ke JABODETABEK.

- [ ] **Step 11: Cek tidak ada file user yang ikut ter-stage**

Run:

```powershell
git status --short
```

Expected: hanya file fitur yang berubah/ter-commit. Tiga file user berikut tetap `M` dan **tidak** masuk commit:
`src/lib/distribution/confirm-surat-jalan.ts`,
`src/lib/distribution/ro-sync-merge.ts`,
`src/lib/supabase/server.ts`.

- [ ] **Step 12: Commit perbaikan bila ada**

Jika smoke test menemukan bug, perbaiki di file terkait dan commit dengan pesan yang spesifik. Jangan menggabungkan perbaikan bug dengan file user yang belum di-commit.

## Definition of Done

- [ ] `region.test.mjs` dan seluruh test lama lulus.
- [ ] `npx tsc --noEmit` bersih.
- [ ] `npm.cmd run build` sukses (tanpa dev server berjalan).
- [ ] Dua sesi region pada tanggal yang sama tersimpan sebagai dua baris `so_sessions`.
- [ ] Rollover, riwayat, cetak, dan Excel memakai region yang benar.
- [ ] PR Ready Stock, Monitoring SLA, dan Surat Jalan tidak mencampur region.
- [ ] Kelola RO menampilkan stok dari region yang dipilih.
- [ ] Sesi legacy hanya tampil di bagian "Sesi lama" dan tidak dipakai rollover.
- [ ] Tidak ada file user yang tidak terkait ikut ter-stage.