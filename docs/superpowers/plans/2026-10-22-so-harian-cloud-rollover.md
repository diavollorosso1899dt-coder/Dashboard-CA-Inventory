# SO Harian Cloud Storage & Daily Rollover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyimpan sesi SO Harian di Supabase (sumber data bersama), mengisi stok awal sesi baru secara otomatis dari sesi COMPLETED terakhir, dan menampilkan stok SO yang benar di modal Kelola RO.

**Architecture:** Route handler Next.js di `/api/so-harian/*` memakai `getAdminClient()` untuk membaca/menulis Supabase. `localStorage` tetap menjadi cache offline. Modul murni `rollover.ts` menangani aturan closing stock dan penggabungan baseline; dipakai oleh halaman SO maupun modal RO.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Supabase JS, Tailwind, Node 24 built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-10-22-so-harian-cloud-rollover-design.md`

## Global Constraints

- Satu gudang: `Gudang Utama`. Baseline bersifat global (tanpa filter gudang).
- Baseline hanya dari sesi berstatus `COMPLETED`.
- Closing stock per SKU = `qty_fisik` bila tidak null/undefined dan valid; jika tidak, `stok_sistem`; jika keduanya tidak valid, `0`.
- ID detail deterministik: `"{session.id}::{kode_barang}"`, upsert `onConflict: 'id'`.
- Item duplikat dalam satu payload di-dedupe, nilai terakhir menang.
- Tidak ada framework test di repo. Test unit memakai `node --test` pada file `.test.mjs` yang mengimpor `.ts` langsung (Node 24 type stripping). Jangan menambahkan Vitest/Jest.
- File test `.mjs` tidak masuk `tsconfig` (hanya `**/*.ts`/`**/*.tsx`), jadi import `./rollover.ts` aman dari `tsc`.
- Di Windows/PowerShell gunakan `npm.cmd`, bukan `npm`.
- Route handler dinamis Next 15: `{ params }: { params: Promise<{ id: string }> }`, lalu `const { id } = await params`.
- Semua route baru: `export const dynamic = 'force-dynamic';` dan respons `{ success, data? , error? }`.
- Jangan mengubah formula `calculateSystemStock` atau aturan RO/penerimaan.
- `localStorage` tidak boleh dihapus otomatis setelah migrasi.

## Interfaces (kontrak lintas task)

```ts
// src/lib/so-harian/rollover.ts
export interface BaselineItem {
  kode_barang: string;
  nama_barang?: string | null;
  satuan?: string | null;
  stok_sistem?: number | null;
  qty_fisik?: number | null;
}
export function closingStock(item: Pick<BaselineItem, 'qty_fisik' | 'stok_sistem'>): number;
export function toBaselineMap(items: BaselineItem[]): Map<string, number>;
export function applyBaselineToStock(
  initialStock: Map<string, number>,
  baseline: Map<string, number>
): Map<string, number>;

// src/lib/so-harian/storageService.ts
export interface SaveSessionResult { id: string; synced: boolean }
export interface BaselineFetchResult {
  session: SOSession | null;
  items: BaselineItem[];
  source: 'server' | 'local' | 'none';
}
export async function fetchBaseline(): Promise<BaselineFetchResult>;
export async function pushLocalSessionsToServer(): Promise<{
  total: number; migrated: number; failed: number; errors: string[];
}>;

// server hanya
// src/lib/so-harian/server-store.ts
export interface BaselineData { session: SoSessionRow; items: SoDetailRow[] }
```

`saveSession` berubah dari `Promise<string>` menjadi `Promise<SaveSessionResult>`; satu-satunya pemanggil adalah `StockOpnameView.tsx` (sudah diverifikasi dengan grep).

---

### Task 0: Skema Supabase

**Files:**
- Create: `supabase/so-harian-cloud.sql`

**Interfaces:**
- Menghasilkan tabel `public.so_sessions` dan `public.so_details` yang dipakai semua task berikutnya.

- [ ] **Step 1: Tulis file SQL**

Buat `supabase/so-harian-cloud.sql`:

```sql
-- SO Harian: cloud storage + daily rollover
-- Jalankan sekali di Supabase Dashboard -> SQL Editor.

CREATE TABLE IF NOT EXISTS public.so_sessions (
  id TEXT PRIMARY KEY,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  gudang VARCHAR(100) DEFAULT 'Gudang Utama',
  petugas VARCHAR(100) DEFAULT 'Petugas Gudang',
  total_items INTEGER DEFAULT 0,
  item_match INTEGER DEFAULT 0,
  item_minus INTEGER DEFAULT 0,
  item_plus INTEGER DEFAULT 0,
  item_selisih INTEGER DEFAULT 0,
  akurasi_persen NUMERIC(5,2) DEFAULT 0.00,
  status VARCHAR(50) DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.so_details (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.so_sessions(id) ON DELETE CASCADE,
  kode_barang VARCHAR(100) NOT NULL,
  nama_barang VARCHAR(255),
  kategori VARCHAR(100) DEFAULT 'Peralatan',
  satuan VARCHAR(50) DEFAULT 'PCS',
  lokasi VARCHAR(100) DEFAULT 'Gudang Utama',
  stok_awal NUMERIC(12,2) DEFAULT 0,
  qty_penerimaan NUMERIC(12,2) DEFAULT 0,
  qty_ro NUMERIC(12,2) DEFAULT 0,
  stok_sistem NUMERIC(12,2) DEFAULT 0,
  qty_fisik NUMERIC(12,2),
  selisih NUMERIC(12,2),
  status_selisih VARCHAR(50) DEFAULT 'UNCHECKED',
  catatan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kompatibilitas bila tabel lama sudah pernah dibuat sebagian.
ALTER TABLE public.so_sessions ADD COLUMN IF NOT EXISTS item_minus INTEGER DEFAULT 0;
ALTER TABLE public.so_sessions ADD COLUMN IF NOT EXISTS item_plus INTEGER DEFAULT 0;
ALTER TABLE public.so_details ADD COLUMN IF NOT EXISTS lokasi VARCHAR(100) DEFAULT 'Gudang Utama';

CREATE UNIQUE INDEX IF NOT EXISTS uq_so_details_session_kode
  ON public.so_details(session_id, kode_barang);
CREATE INDEX IF NOT EXISTS idx_so_sessions_tanggal ON public.so_sessions(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_so_sessions_status ON public.so_sessions(status, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_so_details_session_id ON public.so_details(session_id);
```

- [ ] **Step 2: Terapkan di Supabase (manual, sekali)**

Buka Supabase Dashboard project yang dipakai `.env.local` → SQL Editor → tempel isi file → Run. Catatan: repo tidak punya migration runner, jadi langkah ini tidak bisa dilakukan otomatis dari terminal.

Jika `.env.local` tidak punya `SUPABASE_SERVICE_ROLE_KEY`, `getAdminClient()` jatuh ke anon key. Tabel baru tanpa RLS dapat ditulis oleh anon key; bila RLS diaktifkan, tambahkan policy yang sesuai atau isi service role key. Jangan commit kredensial.

- [ ] **Step 3: Verifikasi tabel ada**

Jalankan di PowerShell (isi dari `.env.local`; jangan commit nilainya):

```powershell
$envFile = Get-Content .env.local
$url = ($envFile | Select-String '^NEXT_PUBLIC_SUPABASE_URL=').ToString() -split '=',2 | Select-Object -Last 1
$keyLine = $envFile | Select-String '^SUPABASE_SERVICE_ROLE_KEY='
if (-not $keyLine) { $keyLine = $envFile | Select-String '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' }
$key = $keyLine.ToString() -split '=',2 | Select-Object -Last 1
Invoke-RestMethod -Uri "$url/rest/v1/so_sessions?select=id&limit=1" -Headers @{ apikey = $key; Authorization = "Bearer $key" }
```

Expected: `[]` (HTTP 200), **bukan** error `PGRST205`.

- [ ] **Step 4: Commit**

```powershell
git add supabase/so-harian-cloud.sql
git commit -m "feat(so-harian): add cloud schema for sessions and details"
```

---

### Task 1: Modul rollover murni + unit test

**Files:**
- Create: `src/lib/so-harian/rollover.ts`
- Create: `src/lib/so-harian/rollover.test.mjs`

**Interfaces:**
- Produces: `BaselineItem`, `closingStock`, `toBaselineMap`, `applyBaselineToStock` (dipakai Task 4, 5, 6, 7).

- [ ] **Step 1: Tulis test lebih dulu**

Buat `src/lib/so-harian/rollover.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closingStock,
  toBaselineMap,
  applyBaselineToStock,
} from './rollover.ts';

test('closingStock memprioritaskan qty_fisik termasuk 0', () => {
  assert.equal(closingStock({ qty_fisik: 0, stok_sistem: 9 }), 0);
  assert.equal(closingStock({ qty_fisik: 3, stok_sistem: 9 }), 3);
});

test('closingStock memakai stok_sistem bila qty_fisik null/undefined', () => {
  assert.equal(closingStock({ qty_fisik: null, stok_sistem: 7 }), 7);
  assert.equal(closingStock({ stok_sistem: 4 }), 4);
  assert.equal(closingStock({ qty_fisik: Number.NaN, stok_sistem: 2 }), 2);
});

test('closingStock mengembalikan 0 bila semua kosong', () => {
  assert.equal(closingStock({}), 0);
  assert.equal(closingStock({ qty_fisik: null, stok_sistem: null }), 0);
});

test('toBaselineMap trim kode, lewati kode kosong, item terakhir menang', () => {
  const map = toBaselineMap([
    { kode_barang: ' A ', stok_sistem: 1 },
    { kode_barang: 'A', stok_sistem: 2 },
    { kode_barang: '', stok_sistem: 5 },
    { kode_barang: 'B', qty_fisik: 0, stok_sistem: 8 },
  ]);
  assert.equal(map.size, 2);
  assert.equal(map.get('A'), 2);
  assert.equal(map.get('B'), 0);
});

test('applyBaselineToStock tidak menimpa stok dari sheet dan menambah SKU baru', () => {
  const sheet = new Map([['A', 10], ['B', 0]]);
  const baseline = new Map([['A', 99], ['B', 5], ['C', 7]]);
  const merged = applyBaselineToStock(sheet, baseline);
  assert.equal(merged.get('A'), 10);
  assert.equal(merged.get('B'), 0);
  assert.equal(merged.get('C'), 7);
  assert.equal(sheet.size, 2, 'map input tidak boleh berubah');
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```powershell
node --test src/lib/so-harian/rollover.test.mjs
```

Expected: FAIL karena `src/lib/so-harian/rollover.ts` belum ada (ERR_MODULE_NOT_FOUND).

- [ ] **Step 3: Implementasi**

Buat `src/lib/so-harian/rollover.ts`:

```ts
export interface BaselineItem {
  kode_barang: string;
  nama_barang?: string | null;
  satuan?: string | null;
  stok_sistem?: number | null;
  qty_fisik?: number | null;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Closing stock: qty_fisik bila ada, selain itu stok_sistem, default 0. */
export function closingStock(
  item: Pick<BaselineItem, 'qty_fisik' | 'stok_sistem'>
): number {
  const fisik = toFiniteNumber(item.qty_fisik);
  if (fisik !== null) return fisik;
  return toFiniteNumber(item.stok_sistem) ?? 0;
}

/** Map SKU -> closing stock; kode kosong dilewati, duplikat: terakhir menang. */
export function toBaselineMap(items: BaselineItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const code = String(item.kode_barang || '').trim();
    if (!code) continue;
    map.set(code, closingStock(item));
  }
  return map;
}

/** Isi stok awal hanya untuk SKU yang belum ada di sheet. */
export function applyBaselineToStock(
  initialStock: Map<string, number>,
  baseline: Map<string, number>
): Map<string, number> {
  const merged = new Map(initialStock);
  for (const [code, qty] of baseline) {
    if (!merged.has(code)) merged.set(code, qty);
  }
  return merged;
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

```powershell
node --test src/lib/so-harian/rollover.test.mjs
```

Expected: `pass 5`, `fail 0`. Warning `MODULE_TYPELESS_PACKAGE_JSON` boleh diabaikan.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/so-harian/rollover.ts src/lib/so-harian/rollover.test.mjs
git commit -m "feat(so-harian): add pure rollover helpers with tests"
```

---

### Task 2: Server store Supabase

**Files:**
- Create: `src/lib/so-harian/server-store.ts`
- Read: `src/lib/supabase/server.ts` (`getAdminClient`), `src/lib/so-harian/inventoryEngine.ts` (`SOItem`)

**Interfaces:**
- Produces:
  - `upsertSoSession(session, items): Promise<SoSessionRow>`
  - `listSoSessions(limit?): Promise<SoSessionRow[]>`
  - `getSoSession(id): Promise<{ session: SoSessionRow; items: SoDetailRow[] } | null>`
  - `deleteSoSession(id): Promise<void>`
  - `getLatestCompletedBaseline(): Promise<BaselineData | null>`
  - `migrateSoSessions(entries): Promise<{ migrated; failed; errors }>`

- [ ] **Step 1: Implementasi `server-store.ts`**

```ts
import { getAdminClient } from '@/lib/supabase/server';
import type { SOItem } from './inventoryEngine';

export interface SoSessionRow {
  id: string;
  tanggal: string;
  gudang: string | null;
  petugas: string | null;
  total_items: number | null;
  item_match: number | null;
  item_minus: number | null;
  item_plus: number | null;
  item_selisih: number | null;
  akurasi_persen: number | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SoDetailRow {
  id: string;
  session_id: string;
  kode_barang: string;
  nama_barang: string | null;
  kategori: string | null;
  satuan: string | null;
  lokasi: string | null;
  stok_awal: number | null;
  qty_penerimaan: number | null;
  qty_ro: number | null;
  stok_sistem: number | null;
  qty_fisik: number | null;
  selisih: number | null;
  status_selisih: string | null;
  catatan: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SessionEntry {
  session: Partial<SoSessionRow> & { id: string };
  items: SOItem[];
}

export interface BaselineData {
  session: SoSessionRow;
  items: SoDetailRow[];
}

const BATCH_SIZE = 300;

function clientOrThrow() {
  const client = getAdminClient();
  if (!client) {
    throw new Error(
      'Supabase server belum dikonfigurasi. Periksa NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  return client;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSession(
  session: Partial<SoSessionRow> & { id: string }
): SoSessionRow {
  const now = new Date().toISOString();
  const minus = num(session.item_minus);
  const plus = num(session.item_plus);
  return {
    id: session.id,
    tanggal: session.tanggal || now.split('T')[0],
    gudang: session.gudang || 'Gudang Utama',
    petugas: session.petugas || 'Petugas Gudang',
    total_items: num(session.total_items),
    item_match: num(session.item_match),
    item_minus: minus,
    item_plus: plus,
    item_selisih:
      session.item_selisih === undefined || session.item_selisih === null
        ? minus + plus
        : num(session.item_selisih),
    akurasi_persen: num(session.akurasi_persen),
    status: session.status || 'DRAFT',
    created_at: session.created_at || now,
    updated_at: now,
  };
}

function toDetailRows(sessionId: string, items: SOItem[]): SoDetailRow[] {
  const deduped = new Map<string, SOItem>();
  for (const item of items) {
    const code = String(item.kode_barang || '').trim();
    if (!code) continue;
    deduped.set(code, item);
  }
  const now = new Date().toISOString();
  return Array.from(deduped.entries()).map(([code, item]) => ({
    id: `${sessionId}::${code}`,
    session_id: sessionId,
    kode_barang: code,
    nama_barang: item.nama_barang || code,
    kategori: item.kategori || 'Peralatan',
    satuan: item.satuan || 'PCS',
    lokasi: item.lokasi || 'Gudang Utama',
    stok_awal: num(item.stok_awal),
    qty_penerimaan: num(item.qty_penerimaan),
    qty_ro: num(item.qty_ro),
    stok_sistem: num(item.stok_sistem),
    qty_fisik:
      item.qty_fisik === null || item.qty_fisik === undefined
        ? null
        : num(item.qty_fisik),
    selisih:
      item.selisih === null || item.selisih === undefined
        ? null
        : num(item.selisih),
    status_selisih: item.status_selisih || 'UNCHECKED',
    catatan: item.catatan || null,
    created_at: null, // biarkan default DB saat insert
    updated_at: now,
  }));
}

async function fetchDetails(sessionId: string): Promise<SoDetailRow[]> {
  const client = clientOrThrow();
  const rows: SoDetailRow[] = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('so_details')
      .select('*')
      .eq('session_id', sessionId)
      .order('kode_barang')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data || []) as SoDetailRow[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function upsertSoSession(
  session: Partial<SoSessionRow> & { id: string },
  items: SOItem[]
): Promise<SoSessionRow> {
  const client = clientOrThrow();
  const id = String(session?.id || '').trim();
  if (!id) throw new Error('session.id wajib diisi');
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('items tidak boleh kosong');
  }

  const sessionRow = normalizeSession({ ...session, id });
  const detailRows = toDetailRows(id, items);
  if (detailRows.length === 0) {
    throw new Error('Tidak ada item dengan kode_barang yang valid');
  }

  const { error: sessionError } = await client
    .from('so_sessions')
    .upsert(sessionRow, { onConflict: 'id' });
  if (sessionError) throw new Error(sessionError.message);

  for (let i = 0; i < detailRows.length; i += BATCH_SIZE) {
    // created_at tidak dikirim agar baris lama mempertahankan nilai aslinya.
    const chunk = detailRows
      .slice(i, i + BATCH_SIZE)
      .map(({ created_at: _createdAt, ...row }) => row);
    const { error } = await client
      .from('so_details')
      .upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  // Hapus detail lama yang tidak ada di payload terbaru (resave sesi yang sama).
  const { data: existing, error: existingError } = await client
    .from('so_details')
    .select('kode_barang')
    .eq('session_id', id);
  if (existingError) throw new Error(existingError.message);
  const keep = new Set(detailRows.map((row) => row.kode_barang));
  const removed = ((existing || []) as Array<{ kode_barang: string }>)
    .map((row) => row.kode_barang)
    .filter((code) => !keep.has(code));
  if (removed.length > 0) {
    const { error } = await client
      .from('so_details')
      .delete()
      .eq('session_id', id)
      .in('kode_barang', removed);
    if (error) throw new Error(error.message);
  }

  return sessionRow;
}

export async function listSoSessions(limit = 50): Promise<SoSessionRow[]> {
  const client = clientOrThrow();
  const { data, error } = await client
    .from('so_sessions')
    .select('*')
    .order('tanggal', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as SoSessionRow[];
}

export async function getSoSession(
  id: string
): Promise<{ session: SoSessionRow; items: SoDetailRow[] } | null> {
  const client = clientOrThrow();
  const { data, error } = await client
    .from('so_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { session: data as SoSessionRow, items: await fetchDetails(id) };
}

export async function deleteSoSession(id: string): Promise<void> {
  const client = clientOrThrow();
  const { error: detailError } = await client
    .from('so_details')
    .delete()
    .eq('session_id', id);
  if (detailError) throw new Error(detailError.message);
  const { error } = await client.from('so_sessions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getLatestCompletedBaseline(): Promise<BaselineData | null> {
  const client = clientOrThrow();
  const { data, error } = await client
    .from('so_sessions')
    .select('*')
    .eq('status', 'COMPLETED')
    .order('tanggal', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const session = data as SoSessionRow;
  return { session, items: await fetchDetails(session.id) };
}

export async function migrateSoSessions(
  entries: SessionEntry[]
): Promise<{ migrated: number; failed: number; errors: string[] }> {
  let migrated = 0;
  const errors: string[] = [];
  for (const entry of entries) {
    try {
      if (!entry?.session?.id) throw new Error('session.id kosong');
      if (!Array.isArray(entry.items) || entry.items.length === 0) {
        throw new Error('items kosong');
      }
      await upsertSoSession(entry.session, entry.items);
      migrated += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${entry?.session?.id || 'unknown'}: ${message}`);
    }
  }
  return { migrated, failed: errors.length, errors };
}
```

Catatan: `created_at` pada `toDetailRows` bernilai `null` lalu dibuang saat upsert (destructuring), sehingga insert memakai default DB dan update tidak menimpa timestamp lama.

- [ ] **Step 2: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: tidak ada error baru dari `server-store.ts`. Jika muncul `Property 'lokasi' does not exist on type 'SOItem'`, periksa `src/lib/so-harian/inventoryEngine.ts` baris 10-30 — `SOItem` sudah punya `lokasi`.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/so-harian/server-store.ts
git commit -m "feat(so-harian): add server store for cloud sessions"
```

---

### Task 3: API routes

**Files:**
- Create: `src/app/api/so-harian/sessions/route.ts`
- Create: `src/app/api/so-harian/sessions/[id]/route.ts`
- Create: `src/app/api/so-harian/baseline/route.ts`
- Create: `src/app/api/so-harian/migrate/route.ts`

**Interfaces:**
- Consumes Task 2.
- Endpoints:
  - `GET /api/so-harian/sessions?limit=50`
  - `POST /api/so-harian/sessions` body `{ session, items }`
  - `GET /api/so-harian/sessions/[id]`
  - `DELETE /api/so-harian/sessions/[id]`
  - `GET /api/so-harian/baseline`
  - `POST /api/so-harian/migrate` body `{ sessions: [{ session, items }] }`

- [ ] **Step 1: `sessions/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { listSoSessions, upsertSoSession } from '@/lib/so-harian/server-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const limitParam = Number(req.nextUrl.searchParams.get('limit'));
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), 200)
      : 50;
    const data = await listSoSessions(limit);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat sesi SO';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = body?.session;
    const items = body?.items;

    if (!session || typeof session.id !== 'string' || !session.id.trim()) {
      return NextResponse.json(
        { success: false, error: 'session.id wajib diisi' },
        { status: 400 }
      );
    }
    if (!session.tanggal) {
      return NextResponse.json(
        { success: false, error: 'session.tanggal wajib diisi' },
        { status: 400 }
      );
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'items tidak boleh kosong' },
        { status: 400 }
      );
    }

    const saved = await upsertSoSession(session, items);
    return NextResponse.json({ success: true, data: { id: saved.id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menyimpan sesi SO';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: `sessions/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteSoSession, getSoSession } from '@/lib/so-harian/server-store';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getSoSession(id);
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Sesi SO tidak ditemukan' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat sesi SO';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteSoSession(id);
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menghapus sesi SO';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: `baseline/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getLatestCompletedBaseline } from '@/lib/so-harian/server-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getLatestCompletedBaseline();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Gagal memuat baseline SO';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: `migrate/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { migrateSoSessions } from '@/lib/so-harian/server-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessions = body?.sessions;
    if (!Array.isArray(sessions)) {
      return NextResponse.json(
        { success: false, error: 'sessions harus berupa array' },
        { status: 400 }
      );
    }
    const result = await migrateSoSessions(sessions);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Gagal memigrasikan sesi SO';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 5: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: lulus.

- [ ] **Step 6: Smoke test endpoint (butuh Task 0 selesai)**

Dev server: `npm.cmd run dev` (sudah berjalan di `http://localhost:3000`). Lalu:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/so-harian/baseline"
```

Expected: `success=True`, `data=$null` (belum ada sesi COMPLETED) atau data baseline bila sudah ada.

- [ ] **Step 7: Commit**

```powershell
git add src/app/api/so-harian
git commit -m "feat(so-harian): expose sessions, baseline, and migrate APIs"
```

---

### Task 4: Sinkronisasi client di `storageService`

**Files:**
- Modify: `src/lib/so-harian/storageService.ts`

**Interfaces:**
- Add: `SaveSessionResult`, `BaselineFetchResult`, `fetchBaseline`, `pushLocalSessionsToServer`.
- Change: `saveSession` return type.
- Keep: `configureSupabase`, `getSupabaseConfig`, `initSupabaseFromStorage` exports (dipakai `CloudSettingsModal`), tetapi tidak lagi dipanggil dari alur simpan/baca.

- [ ] **Step 1: Import helper rollover**

Di bagian atas file, tambahkan:

```ts
import type { BaselineItem } from './rollover';
```

- [ ] **Step 2: Ubah `saveSession`**

Ganti signature menjadi:

```ts
export interface SaveSessionResult {
  id: string;
  synced: boolean;
}

export async function saveSession(
  sessionData: Partial<SOSession>,
  items: SOItem[] = []
): Promise<SaveSessionResult> {
```

Hapus `initSupabaseFromStorage();` di awal fungsi. Pada objek `completeSession`, tambahkan `item_selisih` agar histori menampilkan angka yang benar:

```ts
    item_selisih: items.filter(
      (i) => i.status_selisih === 'MINUS' || i.status_selisih === 'PLUS'
    ).length,
```

Hapus seluruh blok `if (supabaseClient) { ... }` (baris ~154-197) yang menulis langsung ke Supabase. Ganti dengan:

```ts
  let synced = false;
  try {
    const res = await fetch('/api/so-harian/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: completeSession, items }),
    });
    const json = await res.json().catch(() => null);
    synced = res.ok && json?.success === true;
    if (!synced) {
      console.warn('SO server sync failed:', json?.error || res.statusText);
    }
  } catch (err) {
    console.warn('SO server sync failed, data saved locally:', err);
  }

  return { id: sessionId, synced };
```

- [ ] **Step 3: Ubah `loadSession` agar memakai API**

Hapus `initSupabaseFromStorage();` dan ganti blok `if (supabaseClient) { ... }` dengan:

```ts
  if (!session || items.length === 0) {
    try {
      const res = await fetch(
        `/api/so-harian/sessions/${encodeURIComponent(sessionId)}`,
        { cache: 'no-store' }
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.data) {
        const serverSession = json.data.session as SOSession;
        const serverItems = (json.data.items || []) as SOItem[];
        const cached = getAllSessionsSync();
        if (!cached.some((s) => s.id === serverSession.id)) {
          cached.unshift(serverSession);
          safeStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(cached));
        }
        safeStorage.setItem(
          `${STORAGE_KEYS.SESSION_DETAIL_PREFIX}${sessionId}`,
          JSON.stringify(serverItems)
        );
        safeStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, sessionId);
        return { session: serverSession, items: serverItems };
      }
    } catch (err) {
      console.warn('Failed to load session from server:', err);
    }
  }
```

- [ ] **Step 4: Ubah `getAllSessions`**

Hapus `initSupabaseFromStorage();` dan blok `if (supabaseClient) { ... }`. Ganti dengan:

```ts
  try {
    const res = await fetch('/api/so-harian/sessions?limit=200', {
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success && Array.isArray(json.data)) {
      const map = new Map<string, SOSession>();
      for (const s of localList) map.set(s.id, s);
      for (const s of json.data as SOSession[]) map.set(s.id, s);
      const merged = Array.from(map.values()).sort((a, b) =>
        (b.tanggal || '').localeCompare(a.tanggal || '')
      );
      getSafeStorage().setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn('Server session list fetch failed:', err);
  }

  return localList;
```

- [ ] **Step 5: Ubah `deleteSession`**

Hapus `initSupabaseFromStorage();` dan blok `if (supabaseClient) { ... }` di akhir. Sebelum menghapus cache lokal, panggil API (best effort):

```ts
  try {
    const res = await fetch(
      `/api/so-harian/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) console.warn('Server delete failed with status', res.status);
  } catch (err) {
    console.warn('Server delete failed:', err);
  }
```

Letakkan sebelum baris `const sessions = getAllSessionsSync().filter(...)`.

- [ ] **Step 6: Tambah `fetchBaseline` + helper lokal**

Tambahkan di akhir file (sebelum/atau setelah `setActiveSessionId`):

```ts
export interface BaselineFetchResult {
  session: SOSession | null;
  items: BaselineItem[];
  source: 'server' | 'local' | 'none';
}

function findLatestCompletedLocal(): {
  session: SOSession;
  items: BaselineItem[];
} | null {
  const sessions = getAllSessionsSync()
    .filter((s) => (s.status || '').toUpperCase() === 'COMPLETED')
    .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
  if (sessions.length === 0) return null;
  const latest = sessions[0];
  const raw = getSafeStorage().getItem(
    `${STORAGE_KEYS.SESSION_DETAIL_PREFIX}${latest.id}`
  );
  if (!raw) return null;
  try {
    return { session: latest, items: JSON.parse(raw) as BaselineItem[] };
  } catch {
    return null;
  }
}

export async function fetchBaseline(): Promise<BaselineFetchResult> {
  try {
    const res = await fetch('/api/so-harian/baseline', { cache: 'no-store' });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success && json.data?.session) {
      return {
        session: json.data.session as SOSession,
        items: (json.data.items || []) as BaselineItem[],
        source: 'server',
      };
    }
  } catch (err) {
    console.warn('Baseline fetch failed, falling back to local cache:', err);
  }

  const local = findLatestCompletedLocal();
  if (local) return { ...local, source: 'local' };
  return { session: null, items: [], source: 'none' };
}

export async function pushLocalSessionsToServer(): Promise<{
  total: number;
  migrated: number;
  failed: number;
  errors: string[];
}> {
  const payload: Array<{ session: SOSession; items: SOItem[] }> = [];
  for (const session of getAllSessionsSync()) {
    const raw = getSafeStorage().getItem(
      `${STORAGE_KEYS.SESSION_DETAIL_PREFIX}${session.id}`
    );
    if (!raw) continue;
    try {
      payload.push({ session, items: JSON.parse(raw) as SOItem[] });
    } catch {
      // lewati detail yang rusak
    }
  }

  if (payload.length === 0) {
    return { total: 0, migrated: 0, failed: 0, errors: [] };
  }

  const res = await fetch('/api/so-harian/migrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions: payload }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || 'Migrasi sesi lokal gagal');
  }
  const result = json.data as {
    migrated: number;
    failed: number;
    errors: string[];
  };
  return { total: payload.length, ...result };
}
```

- [ ] **Step 7: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: error hanya di `StockOpnameView.tsx` karena `saveSession` sekarang mengembalikan objek (akan diperbaiki Task 5). Tidak ada error di `storageService.ts`.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/so-harian/storageService.ts
git commit -m "feat(so-harian): sync sessions and baseline through server API"
```

---

### Task 5: Halaman SO memakai baseline server

**Files:**
- Modify: `src/components/so-harian/StockOpnameView.tsx`

**Interfaces:**
- Consumes `fetchBaseline`, `toBaselineMap`, `saveSession` baru.

- [ ] **Step 1: Perbarui import**

Ganti import `storageService` menjadi:

```ts
import {
  saveSession,
  loadSession,
  fetchBaseline,
  SOSession,
} from '@/lib/so-harian/storageService';
import { toBaselineMap } from '@/lib/so-harian/rollover';
```

Hapus import `getSupabaseConfig` dan `getAllSessionsSync` (tidak dipakai lagi).

- [ ] **Step 2: Ganti state & effect baseline**

Ganti:

```ts
  const [previousSessionStock, setPreviousSessionStock] = useState<Map<string, number>>(new Map());
  const [previousSessionDate, setPreviousSessionDate] = useState<string | null>(null);
```

dengan:

```ts
  const [previousSessionStock, setPreviousSessionStock] = useState<Map<string, number>>(new Map());
  const [previousSessionDate, setPreviousSessionDate] = useState<string | null>(null);
  const [previousSessionSource, setPreviousSessionSource] = useState<'server' | 'local' | 'none'>('none');
```

Ganti seluruh `useEffect` baris 65-83 dengan:

```ts
  useEffect(() => {
    let cancelled = false;
    const loadBaseline = async () => {
      const { session, items, source } = await fetchBaseline();
      if (cancelled) return;
      setPreviousSessionSource(source);
      if (items.length > 0) {
        setPreviousSessionStock(toBaselineMap(items));
        setPreviousSessionDate(session?.tanggal || null);
      } else {
        setPreviousSessionStock(new Map());
        setPreviousSessionDate(null);
      }
    };
    loadBaseline();
    window.addEventListener('ca_so_updated', loadBaseline);
    return () => {
      cancelled = true;
      window.removeEventListener('ca_so_updated', loadBaseline);
    };
  }, []);
```

Dengan listener ini, baseline ikut diperbarui setelah simpan/migrasi tanpa reload halaman.

- [ ] **Step 3: Sesuaikan `handleSaveSession`**

Ganti:

```ts
      const savedId = await saveSession(payload, items);
      setSessionData((prev) => ({ ...prev, id: savedId }));
      showToast('Sesi SO harian berhasil disimpan ke sistem!', 'success');
```

dengan:

```ts
      const { id: savedId, synced } = await saveSession(payload, items);
      setSessionData((prev) => ({ ...prev, id: savedId }));
      window.dispatchEvent(new Event('ca_so_updated'));
      if (synced) {
        showToast('Sesi SO harian tersimpan dan tersinkron ke server!', 'success');
      } else {
        showToast(
          'Tersimpan lokal, tetapi gagal sinkron ke server. Rollover belum melihat sesi ini.',
          'error'
        );
      }
```

- [ ] **Step 4: Ganti tombol Cloud Sync dengan badge server**

Hapus state `isCloudModalOpen`, `isCloudConfigured`, dan `getSupabaseConfig()`. Di toolbar (baris ~213-234), ganti seluruh blok `{/* Cloud Sync Button */}` dengan:

```tsx
          {/* Server Storage Badge */}
          <div className="px-3 py-2 rounded-xl text-xs font-bold border bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 flex items-center space-x-1.5">
            <Cloud className="w-4 h-4 text-emerald-600" />
            <span>Server Storage</span>
          </div>
```

Hapus import `CloudOff`, `Settings`, serta import/render `CloudSettingsModal` (baris ~26 dan ~395-399). Hapus `isCloudModalOpen`/`setIsCloudModalOpen`/`isCloudConfigured`/`setIsCloudConfigured` dari render dan state. Pertahankan `Cloud`.

- [ ] **Step 5: Teruskan sumber baseline ke `UploadSection`**

```tsx
          <UploadSection
            onCompilationSuccess={handleCompilationSuccess}
            previousSessionStock={previousSessionStock}
            previousSessionDate={previousSessionDate}
            previousSessionSource={previousSessionSource}
          />
```

- [ ] **Step 6: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: error tersisa hanya `previousSessionSource` belum ada di props `UploadSection` (Task 6).

- [ ] **Step 7: Commit**

```powershell
git add src/components/so-harian/StockOpnameView.tsx
git commit -m "feat(so-harian): load daily baseline from server"
```

---

### Task 6: UploadSection — rollover otomatis tanpa toggle

**Files:**
- Modify: `src/components/so-harian/UploadSection.tsx`

**Interfaces:**
- Consumes `applyBaselineToStock`, prop `previousSessionSource`.

- [ ] **Step 1: Import helper & tambah prop**

Tambah import:

```ts
import { applyBaselineToStock } from '@/lib/so-harian/rollover';
```

Ubah interface & destructuring:

```ts
interface UploadSectionProps {
  onCompilationSuccess: (compiledItems: SOItem[], metadata: any) => void;
  previousSessionStock?: Map<string, number>;
  previousSessionDate?: string | null;
  previousSessionSource?: 'server' | 'local' | 'none';
}

export default function UploadSection({
  onCompilationSuccess,
  previousSessionStock = new Map(),
  previousSessionDate = null,
  previousSessionSource = 'none',
}: UploadSectionProps) {
```

- [ ] **Step 2: Hapus state toggle**

Hapus baris:

```ts
  const [usePreviousStock, setUsePreviousStock] = useState(previousSessionStock.size > 0);
```

- [ ] **Step 3: Terapkan baseline tanpa syarat**

Ganti blok:

```ts
    if (usePreviousStock && previousSessionStock.size > 0) {
      for (const [sku, qty] of Array.from(previousSessionStock.entries())) {
        if (!initialStockMap.has(sku)) {
          initialStockMap.set(sku, qty);
        }
      }
    }
```

dengan:

```ts
    if (previousSessionStock.size > 0) {
      const mergedStock = applyBaselineToStock(initialStockMap, previousSessionStock);
      initialStockMap.clear();
      for (const [sku, qty] of mergedStock) initialStockMap.set(sku, qty);
    }
```

- [ ] **Step 4: Ganti UI checkbox dengan banner**

Ganti blok `{/* Auto rollover checkbox */}` (baris 1332-1351) dengan:

```tsx
      {/* Auto rollover info */}
      {previousSessionStock.size > 0 && (
        <div
          className={`p-4 border rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-2 ${
            previousSessionSource === 'local'
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
              : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
          }`}
        >
          <div className="flex items-start space-x-3">
            <Sparkles
              className={`w-4 h-4 mt-0.5 ${
                previousSessionSource === 'local'
                  ? 'text-amber-600'
                  : 'text-emerald-600'
              }`}
            />
            <p className="text-xs text-slate-700 dark:text-slate-300">
              Stok awal otomatis memakai closing SO{' '}
              <strong>{previousSessionDate || 'terakhir'}</strong> (
              {previousSessionStock.size} SKU) untuk SKU yang tidak ada di file
              stok awal.
              {previousSessionSource === 'local' && (
                <span className="block text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                  Sumber: cache lokal — server tidak terjangkau.
                </span>
              )}
            </p>
          </div>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border self-start md:self-auto ${
              previousSessionSource === 'local'
                ? 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800'
                : 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800'
            }`}
          >
            {previousSessionSource === 'local' ? 'Cache Lokal' : 'Auto Rollover'}
          </span>
        </div>
      )}
```

- [ ] **Step 5: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: lulus.

- [ ] **Step 6: Commit**

```powershell
git add src/components/so-harian/UploadSection.tsx
git commit -m "feat(so-harian): apply baseline rollover automatically"
```

---

### Task 7: Modal RO membaca baseline server

**Files:**
- Modify: `src/components/distribution/RoManagerView.tsx`

**Interfaces:**
- Consumes `fetchBaseline`, `BaselineItem`.

- [ ] **Step 1: Ganti import SO stock**

Hapus:

```ts
import { getAllSessionsSync, loadSession } from '@/lib/so-harian/storageService';
```

Tambahkan:

```ts
import { fetchBaseline } from '@/lib/so-harian/storageService';
import type { BaselineItem } from '@/lib/so-harian/rollover';
```

Jika `SOItem` hanya dipakai untuk state stok SO, hapus dari import `inventoryEngine`/`types`. Cek dengan grep setelah edit; biarkan bila masih dipakai di tempat lain.

- [ ] **Step 2: Ganti state & fetch**

Ganti:

```ts
  const [soStockItems, setSoStockItems] = useState<SOItem[]>([]);
  const [soSessionDate, setSoSessionDate] = useState<string | null>(null);

  const fetchSoStock = async () => {
    try {
      const sessions = getAllSessionsSync();
      if (sessions.length > 0) {
        const latest = sessions[0];
        setSoSessionDate(latest.tanggal || null);
        const { items } = await loadSession(latest.id);
        if (items && items.length > 0) {
          setSoStockItems(items);
        }
      }
    } catch (e) {
      console.warn('Failed to load SO stock:', e);
    }
  };

  useEffect(() => {
    fetchSoStock();
  }, []);
```

dengan:

```ts
  const [soStockItems, setSoStockItems] = useState<BaselineItem[]>([]);
  const [soSessionDate, setSoSessionDate] = useState<string | null>(null);

  const fetchSoStock = async () => {
    try {
      const { session, items } = await fetchBaseline();
      if (items.length > 0) {
        setSoStockItems(items);
        setSoSessionDate(session?.tanggal || null);
      } else {
        setSoStockItems([]);
        setSoSessionDate(null);
      }
    } catch (e) {
      console.warn('Failed to load SO stock:', e);
    }
  };

  useEffect(() => {
    fetchSoStock();
    const handleSoUpdated = () => {
      fetchSoStock();
    };
    window.addEventListener('ca_so_updated', handleSoUpdated);
    return () => window.removeEventListener('ca_so_updated', handleSoUpdated);
  }, []);
```

- [ ] **Step 3: Sesuaikan tipe `getSoStockForItem`**

Signature tetap, tetapi akses field nullable:

```ts
      const matchSku = soStockItems.find(
        (s) => (s.kode_barang || '').toLowerCase().trim() === cleanSku
      );
```

Ganti semua `s.nama_barang` menjadi `(s.nama_barang || '')`. Tidak ada perubahan lain pada logika pencocokan.

- [ ] **Step 4: Tambah tooltip tanggal**

Pada elemen badge "Stok SO" (sekitar baris 1911-1953), tambahkan `title` pada container badge:

```tsx
title={soSessionDate ? `Sumber closing SO tanggal ${soSessionDate}` : 'Belum ada SO COMPLETED'}
```

- [ ] **Step 5: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: lulus.

- [ ] **Step 6: Commit**

```powershell
git add src/components/distribution/RoManagerView.tsx
git commit -m "feat(ro): read SO stock baseline from server"
```

---

### Task 8: Riwayat & tombol migrasi

**Files:**
- Modify: `src/components/so-harian/HistorySection.tsx`

**Interfaces:**
- Consumes `pushLocalSessionsToServer`, `getAllSessions`, `deleteSession` (sudah API-backed dari Task 4).

- [ ] **Step 1: Tambah import & state**

```ts
import {
  getAllSessions,
  deleteSession,
  loadSession,
  pushLocalSessionsToServer,
  SOSession,
} from '@/lib/so-harian/storageService';
```

Di dalam komponen:

```ts
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);
```

- [ ] **Step 2: Handler migrasi**

```ts
  const handleMigrateLocal = async () => {
    if (
      !window.confirm(
        'Unggah semua sesi SO lokal ke server? Sesi yang sudah ada akan diperbarui (aman diulang).'
      )
    ) {
      return;
    }
    setIsMigrating(true);
    setMigrationMessage(null);
    try {
      const result = await pushLocalSessionsToServer();
      if (result.total === 0) {
        setMigrationMessage(
          'Tidak ada sesi lokal dengan detail untuk diunggah (detail lama mungkin sudah terhapus otomatis oleh cache).'
        );
      } else if (result.failed > 0) {
        setMigrationMessage(
          `${result.migrated}/${result.total} sesi terunggah, ${result.failed} gagal.`
        );
        console.warn('Migrasi sebagian gagal:', result.errors);
      } else {
        setMigrationMessage(
          `${result.migrated} sesi lokal berhasil diunggah ke server.`
        );
      }
      window.dispatchEvent(new Event('ca_so_updated'));
      await fetchSessions();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMigrationMessage(`Migrasi gagal: ${message}`);
    } finally {
      setIsMigrating(false);
    }
  };
```

- [ ] **Step 3: Segarkan baseline setelah hapus**

Di `handleDelete`, tambahkan event setelah penghapusan:

```ts
  const handleDelete = async (id: string, tanggal: string) => {
    if (!window.confirm(`Yakin ingin menghapus riwayat SO tanggal ${tanggal}?`)) return;
    await deleteSession(id);
    window.dispatchEvent(new Event('ca_so_updated'));
    fetchSessions();
  };
```

- [ ] **Step 4: Tombol di header**

Di header (dekat tombol refresh), tambahkan sebelum tombol refresh:

```tsx
          <button
            onClick={handleMigrateLocal}
            disabled={isMigrating}
            className="px-3 py-1.5 border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 rounded-xl text-xs font-bold flex items-center space-x-1 transition-colors disabled:opacity-50"
            title="Unggah sesi SO yang tersimpan di browser ini ke server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isMigrating ? 'animate-spin' : ''}`} />
            <span>{isMigrating ? 'Mengunggah...' : 'Unggah Sesi Lokal'}</span>
          </button>
```

Tambahkan pesan hasil di bawah header card:

```tsx
      {migrationMessage && (
        <div className="text-xs font-semibold px-4 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300">
          {migrationMessage}
        </div>
      )}
```

Letakkan tepat setelah `</div>` penutup header card (sebelum daftar sesi).

- [ ] **Step 5: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: lulus.

- [ ] **Step 6: Commit**

```powershell
git add src/components/so-harian/HistorySection.tsx
git commit -m "feat(so-harian): add local session migration to server"
```

---

### Task 9: Verifikasi end-to-end

**Files:**
- Modify (jika perlu): `docs/superpowers/specs/2026-10-22-so-harian-cloud-rollover-design.md` (bagian tombol migrasi → HistorySection)
- No production code baru.

- [ ] **Step 1: Unit test & typecheck**

```powershell
node --test src/lib/so-harian/rollover.test.mjs
npx tsc --noEmit
```

Expected: 5 test lulus, tsc tanpa error.

- [ ] **Step 2: Uji API simpan → baseline → hapus**

Dengan dev server berjalan:

```powershell
$body = @{
  session = @{ id = 'so-test-rollover'; tanggal = '2099-01-01'; gudang = 'Gudang Utama'; petugas = 'Test'; status = 'COMPLETED' }
  items = @(
    @{ kode_barang = 'TEST-A'; nama_barang = 'Test A'; satuan = 'PCS'; stok_awal = 10; qty_penerimaan = 0; qty_ro = 0; stok_sistem = 10; qty_fisik = 7; status_selisih = 'MINUS' },
    @{ kode_barang = 'TEST-B'; nama_barang = 'Test B'; satuan = 'PCS'; stok_awal = 5; qty_penerimaan = 0; qty_ro = 0; stok_sistem = 5; qty_fisik = $null; status_selisih = 'UNCHECKED' }
  )
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/so-harian/sessions" -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri "http://localhost:3000/api/so-harian/baseline"
```

Expected:
- POST: `success=True`, `data.id='so-test-rollover'`.
- baseline: `session.id='so-test-rollover'`, item `TEST-A.qty_fisik=7`, `TEST-B.qty_fisik=$null`, `TEST-B.stok_sistem=5`.
- `toBaselineMap` (dipakai UI) menghasilkan `TEST-A -> 7`, `TEST-B -> 5`.

- [ ] **Step 3: Uji idempoten**

Ulangi POST yang sama dengan `items` hanya `TEST-A`. Expected di `GET /api/so-harian/sessions/so-test-rollover`: hanya `TEST-A` tersisa (detail `TEST-B` terhapus).

- [ ] **Step 4: Uji UI di browser**

1. Buka `http://localhost:3000/stock-opname`.
2. Tab **1. Tarik Data & Upload**: pastikan banner baseline muncul (bukan checkbox), menyebut tanggal + jumlah SKU. Jika server tidak terjangkau, banner amber "Cache Lokal".
3. Klik **Kompilasi** dengan sheet yang tidak memuat SKU baseline → SKU baseline tetap masuk dengan `stok_awal` = closing stock.
4. Isi beberapa qty fisik, klik **Simpan SO** → toast sukses tersinkron.
5. Buka **Kelola RO → Pilih Proses**: badge "Stok SO" menampilkan angka (bukan "Belum terdata"), tooltip tanggal benar.
6. Buka tab **3. Arsip Riwayat SO** → daftar berasal dari server; klik **Unggah Sesi Lokal** → pesan hasil muncul dan tidak ada duplikat saat diulang.

Catatan: screenshot browser bisa gagal di environment ini; gunakan `browser.evaluate`/snapshot untuk memeriksa teks DOM.

- [ ] **Step 5: Bersihkan data uji**

```powershell
Invoke-RestMethod -Method Delete -Uri "http://localhost:3000/api/so-harian/sessions/so-test-rollover"
Invoke-RestMethod -Uri "http://localhost:3000/api/so-harian/baseline"
```

Expected: `success=True`; baseline kembali ke sesi COMPLETED sebelumnya atau `$null`.

- [ ] **Step 6: Build**

```powershell
npm.cmd run build
```

Expected: build sukses tanpa type error.

- [ ] **Step 7: Perbarui spec (kecil)**

Di `docs/superpowers/specs/2026-10-22-so-harian-cloud-rollover-design.md`, ubah baris:

```
- `src/components/so-harian/StockOpnameView.tsx`
  - Muat baseline dari `fetchBaseline()` saat mount (bukan dari sesi lokal).
  - Setelah simpan, tampilkan peringatan bila sinkron server gagal.
  - Tambah tombol migrasi + dialog konfirmasi + hasil.
```

menjadi:

```
- `src/components/so-harian/StockOpnameView.tsx`
  - Muat baseline dari `fetchBaseline()` saat mount (bukan dari sesi lokal).
  - Setelah simpan, tampilkan peringatan bila sinkron server gagal.
- `src/components/so-harian/HistorySection.tsx`
  - Tambah tombol migrasi "Unggah Sesi Lokal" + dialog konfirmasi + hasil.
```

- [ ] **Step 8: Commit final**

```powershell
git add docs/superpowers/specs/2026-10-22-so-harian-cloud-rollover-design.md
git commit -m "docs(so-harian): note migration entry point in history section"
```

---

## Catatan Eksekusi

- Dev server sudah berjalan di latar belakang (`npm.cmd run dev`, port 3000). Route baru otomatis ter-reload.
- Bila Supabase server env tidak tersedia, endpoint mengembalikan 500 dengan pesan konfigurasi; UI harus jatuh ke cache lokal (banner amber) dan modal RO tetap menampilkan "Belum terdata" alih-alih crash.
- Jangan menambahkan dependency test. Jangan mengubah `CloudSettingsModal.tsx`; komponen itu hanya tidak dirender lagi.
- Setelah semua task, tinjau `git diff --stat` dan pastikan tidak ada file tak terkait yang ikut berubah.
