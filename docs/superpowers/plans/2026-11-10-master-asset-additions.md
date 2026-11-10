# Master Asset Additions dari RO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Item aset dari Kelola RO yang belum ada di master otomatis dicatat ke katalog item dan master stok SO di Supabase saat proses RO disimpan, tanpa mengubah Google Sheets.

**Architecture:** Tabel baru `master_asset_additions` menyimpan item tambahan per region. Setelah PATCH RO berhasil, `RoManagerView` memanggil `POST /api/master/additions`. Route itu menyimpan item baru ke tabel, lalu menambahkannya ke sesi SO `IN_PROGRESS` region yang sama dengan qty 0/`UNCHECKED`. Katalog item (`getMasterAssetCatalog`) dan stok SO (`/api/so/stock`, kompilasi `UploadSection`) membaca tabel tambahan ini secara segar. Penyimpanan ulang sesi SO mempertahankan item tambahan agar tidak terhapus oleh `staleIds`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Supabase JS (service role), Tailwind, Node built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-11-10-master-asset-additions-design.md`

## Global Constraints

- Region hanya `JABODETABEK` dan `KALBAR`. Jangan mencampur item, stok, RO, penerimaan, rollover, atau riwayat antar-region.
- Auto-add hanya dipanggil saat proses RO **disimpan**, bukan saat modal dibuka.
- Item yang dicatat adalah semua item non-cancel, baik `GUDANG_SCGA`, `PR_VENDOR`, maupun `ON_PROSES`.
- Cabang “semua item dibatalkan” **tidak** memanggil auto-add.
- Pencocokan hanya exact normalized name atau SKU. Tidak ada fuzzy/substring.
- Google Sheets tidak diubah. Sheet tetap menang bila item yang sama sudah ada di sana.
- RO save tidak boleh gagal karena auto-add. Semua kegagalan sinkronisasi master hanya menjadi peringatan.
- Tidak ada backfill RO lama.
- Sesi SO yang diubah hanya sesi `IN_PROGRESS`. Sesi selesai/legacy tidak boleh ditambahi item baru.
- Item baru selalu `stok_awal = 0`, `qty_penerimaan = 0`, `qty_ro = 0`, `stok_sistem = 0`, `qty_fisik = null`, `selisih = null`, `status_selisih = 'UNCHECKED'`.
- Jangan mengubah formula `stok_sistem = stok_awal + qty_penerimaan - qty_ro`.
- Jangan mengubah alur login, RLS, atau model izin pengguna.
- Jangan men-stage file yang tidak disebut di task. Khususnya jangan stage:
  `src/lib/distribution/confirm-surat-jalan.ts` dan
  `src/lib/distribution/ro-sync-merge.ts`.
- Semua route API baru tetap `export const dynamic = 'force-dynamic';`.
- Di Windows/PowerShell gunakan `npm.cmd` / `npx.cmd`, bukan `npm` / `npx`.
- Jangan menjalankan `npm run build` selama dev server masih berjalan. Verifikasi tipe memakai `npx.cmd tsc --noEmit`.
- Test memakai `node --test` pada file `.test.mjs` yang mengimpor `.ts` langsung. Import runtime antar-file di `src/lib` memakai ekstensi `.ts` agar test Node bisa me-resolve modul.
- DDL tidak bisa dijalankan lewat service role dari aplikasi. Migration dijalankan manual sekali di Supabase SQL Editor.
- Dev dan production memakai database Supabase yang sama. Aksi verifikasi mengubah data nyata; gunakan RO-104995 yang sudah ada.

## Interfaces (kontrak lintas task)

```ts
// src/lib/master/additions.ts
export type MasterAdditionRegion = 'JABODETABEK' | 'KALBAR';

export interface MasterAdditionDraft {
  region: MasterAdditionRegion;
  item_name: string;
  normalized_name: string;
  sku: string | null;
  unit: string;
  classification: string;
  specification: string | null;
  photo_url: string | null;
  source: 'RO';
  source_ro_number: string | null;
  is_active: true;
}

export function buildMasterAdditionDrafts(options: {
  region: MasterAdditionRegion;
  roNumber?: string | null;
  items?: MasterAdditionInput[];
  catalog?: CatalogEnrichment[];
}): MasterAdditionDraft[];

export function selectNewAdditionDrafts(
  drafts: MasterAdditionDraft[],
  existing: ExistingAdditionLike[]
): MasterAdditionDraft[];

export function planSessionAppend(options: {
  sessionId: string;
  roNumber?: string | null;
  additions: MasterAdditionDraft[];
  existingDetails?: SessionDetailLike[];
}): SessionAppendRow[];

export function mergeMasterStockAdditions(options: {
  stock: Map<string, number>;
  details: Map<string, OpeningStockDetailLike>;
  additions: MasterAdditionDraft[];
}): {
  stock: Map<string, number>;
  details: Map<string, OpeningStockDetailLike>;
  added: number;
};

export function mergeSoStockWithAdditions(
  items: SoStockItemLike[],
  additions: MasterAdditionDraft[]
): SoStockItemLike[];

export function mergeSoStockItemLists<T extends SoStockItemLike>(
  primary: T[],
  secondary: T[]
): T[];

export function selectCatalogAdditions(
  catalog: CatalogEnrichment[],
  additions: MasterAdditionDraft[]
): MasterAdditionDraft[];

// src/lib/supabase/server.ts
export function getCachedMasterAssetCatalog(): MasterAssetItem[];

// src/app/api/master/additions/route.ts
export async function POST(req: NextRequest): Promise<NextResponse>;
export async function GET(req: NextRequest): Promise<NextResponse>;
```

---

### Task 1: Migration tabel `master_asset_additions`

**Files:**
- Create: `supabase/master-asset-additions.sql`
- Modify: `docs/superpowers/specs/2026-11-10-master-asset-additions-design.md` (status saja)

**Interfaces:**
- Menghasilkan tabel `public.master_asset_additions` dengan unique `(region, normalized_name)`.
- Tidak ada policy publik; akses hanya lewat service role.

- [ ] **Step 1: Tulis file migration**

Buat `supabase/master-asset-additions.sql`:

```sql
-- Master Asset Additions dari RO
-- Item aset yang ada di Kelola RO tetapi belum ada di master aset / master stok SO.
-- Jalankan sekali di Supabase SQL Editor.

create table if not exists public.master_asset_additions (
  id uuid primary key default gen_random_uuid(),
  region text not null check (region in ('JABODETABEK', 'KALBAR')),
  item_name text not null,
  normalized_name text not null,
  sku text,
  unit text not null default 'unit',
  classification text not null default 'Perlengkapan Tetap',
  specification text,
  photo_url text,
  source text not null default 'RO',
  source_ro_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region, normalized_name)
);

create index if not exists master_asset_additions_region_active_idx
  on public.master_asset_additions (region, is_active);

alter table public.master_asset_additions enable row level security;

comment on table public.master_asset_additions is
  'Item master tambahan dari RO yang disimpan di Supabase, bukan di Google Sheets.';
```

- [ ] **Step 2: Review SQL**

Pastikan:
- `gen_random_uuid()` tersedia di Supabase (default PostgreSQL 13+).
- Unique constraint `(region, normalized_name)` ada; ini dipakai `onConflict` di API.
- RLS aktif dan tidak ada policy publik.
- Tidak ada `drop table` atau operasi destruktif.

- [ ] **Step 3: Update status spec**

Ubah baris status di `docs/superpowers/specs/2026-11-10-master-asset-additions-design.md`:

```md
Status: Disetujui untuk implementasi
```

- [ ] **Step 4: Commit**

```powershell
git add -- supabase/master-asset-additions.sql docs/superpowers/specs/2026-11-10-master-asset-additions-design.md
git commit -m "feat(db): tambah tabel master asset additions dari ro"
```

Jangan jalankan migration dari agent. Migration dijalankan user pada Task 9.

---

### Task 2: Helper murni + unit test

**Files:**
- Create: `src/lib/master/additions.ts`
- Create: `src/lib/master/additions.test.mjs`

**Interfaces:**
- Semua fungsi pada blok `src/lib/master/additions.ts` di bagian Interfaces.
- Modul tidak boleh mengimpor Supabase, React, atau API browser.
- Satu-satunya import runtime: `normalizeInventoryKey` dari `../so-harian/inventoryEngine.ts`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `src/lib/master/additions.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMasterAdditionDrafts,
  selectNewAdditionDrafts,
  planSessionAppend,
  mergeMasterStockAdditions,
  mergeSoStockWithAdditions,
  mergeSoStockItemLists,
  selectCatalogAdditions,
} from './additions.ts';

const draft = (overrides = {}) => ({
  region: 'KALBAR',
  item_name: 'Keset karet mie',
  normalized_name: 'keset karet mie',
  sku: null,
  unit: 'bh',
  classification: 'Perlengkapan Tetap',
  specification: null,
  photo_url: null,
  source: 'RO',
  source_ro_number: 'RO-104995',
  is_active: true,
  ...overrides,
});

test('buildMasterAdditionDrafts melewati item cancel dan nama kosong', () => {
  const drafts = buildMasterAdditionDrafts({
    region: 'KALBAR',
    roNumber: 'RO-104995',
    items: [
      {
        item_name: 'Keset karet mie',
        sku: '',
        unit: 'bh',
        item_type: 'Perlengkapan Tetap',
        stock_source: 'PR_VENDOR',
      },
      { item_name: '   ', sku: 'X', stock_source: 'GUDANG_SCGA' },
      { item_name: 'Item Batal', sku: 'B-1', stock_source: 'CANCELLED' },
    ],
  });

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].item_name, 'Keset karet mie');
  assert.equal(drafts[0].normalized_name, 'keset karet mie');
  assert.equal(drafts[0].unit, 'bh');
  assert.equal(drafts[0].source_ro_number, 'RO-104995');
  assert.equal(drafts[0].is_active, true);
});

test('buildMasterAdditionDrafts dedupe nama dan SKU dalam satu batch', () => {
  const drafts = buildMasterAdditionDrafts({
    region: 'JABODETABEK',
    items: [
      { item_name: 'Kursi', sku: 'K-1' },
      { item_name: 'kursi', sku: 'K-2' },
      { item_name: 'Meja', sku: 'K-1' },
      { item_name: 'Lemari', sku: '' },
    ],
  });

  assert.deepEqual(
    drafts.map((item) => item.item_name),
    ['Kursi', 'Lemari']
  );
  assert.equal(drafts[0].classification, 'Perlengkapan Tetap');
  assert.equal(drafts[0].unit, 'unit');
});

test('buildMasterAdditionDrafts memakai katalog hanya untuk exact name atau SKU', () => {
  const catalog = [
    {
      item_name: 'Keset Karet Bolong - 60x40cm',
      sku: 'BGPTK-P00472',
      unit: 'pcs',
      classification: 'Perlengkapan Tetap',
      specification: 'Karet',
      photo_url: '/uploads/karet.png',
    },
    {
      item_name: 'Akrilik Sign Wastafel',
      sku: 'AKR-1',
      unit: 'set',
      classification: 'Peralatan',
      specification: 'Akrilik 3mm',
      photo_url: null,
    },
  ];

  const drafts = buildMasterAdditionDrafts({
    region: 'KALBAR',
    items: [
      { item_name: 'Keset karet mie', sku: '' },
      { item_name: 'akrilik sign wastafel', sku: '' },
      { item_name: 'Nama Berbeda', sku: 'AKR-1' },
    ],
  });

  // Tidak boleh fuzzy-match ke "Keset Karet Bolong - 60x40cm".
  assert.equal(drafts[0].sku, null);
  assert.equal(drafts[0].unit, 'unit');
  assert.equal(drafts[0].specification, null);

  // Exact normalized name dan exact SKU boleh memperkaya metadata.
  assert.equal(drafts[1].unit, 'set');
  assert.equal(drafts[1].classification, 'Peralatan');
  assert.equal(drafts[2].classification, 'Peralatan');
  assert.equal(drafts[2].unit, 'set');
});

test('region tetap terpisah untuk nama yang sama', () => {
  const jabo = buildMasterAdditionDrafts({
    region: 'JABODETABEK',
    items: [{ item_name: 'Kursi' }],
  });
  const kalbar = buildMasterAdditionDrafts({
    region: 'KALBAR',
    items: [{ item_name: 'Kursi' }],
  });

  assert.equal(jabo[0].region, 'JABODETABEK');
  assert.equal(kalbar[0].region, 'KALBAR');
});

test('selectNewAdditionDrafts melewati yang sudah ada dan menghormati region', () => {
  const drafts = [
    draft({ region: 'KALBAR', normalized_name: 'keset karet mie' }),
    draft({
      region: 'KALBAR',
      item_name: 'Meja',
      normalized_name: 'meja',
      sku: 'M-1',
    }),
  ];
  const existing = [
    { region: 'KALBAR', normalized_name: 'keset karet mie', sku: null },
    { region: 'JABODETABEK', normalized_name: 'meja', sku: null },
  ];

  const result = selectNewAdditionDrafts(drafts, existing);

  assert.deepEqual(result.map((item) => item.item_name), ['Meja']);
});

test('planSessionAppend menghasilkan id deterministik, qty 0, dan melewati item yang sudah ada', () => {
  const options = {
    sessionId: 'so-kalbar-2026-11-10',
    additions: [
      draft({
        item_name: 'Keset karet mie',
        sku: null,
        normalized_name: 'keset karet mie',
      }),
      draft({
        item_name: 'Akrilik Sign Wastafel',
        sku: 'AKR-1',
        normalized_name: 'akrilik sign wastafel',
      }),
    ],
    existingDetails: [
      { kode_barang: 'Keset karet mie', nama_barang: 'Keset karet mie' },
    ],
  };

  const rows = planSessionAppend(options);

  assert.equal(rows.length, 1);
  assert.match(rows[0].id, /^so-kalbar-2026-11-10-auto-[0-9a-f]{8}$/);
  assert.equal(rows[0].kode_barang, 'AKR-1');
  assert.equal(rows[0].stok_awal, 0);
  assert.equal(rows[0].qty_penerimaan, 0);
  assert.equal(rows[0].qty_ro, 0);
  assert.equal(rows[0].stok_sistem, 0);
  assert.equal(rows[0].qty_fisik, null);
  assert.equal(rows[0].selisih, null);
  assert.equal(rows[0].status_selisih, 'UNCHECKED');
  assert.equal(rows[0].catatan, 'Ditambahkan otomatis dari RO-104995');

  const again = planSessionAppend(options);
  assert.equal(again[0].id, rows[0].id);
});

test('planSessionAppend memakai nama sebagai kode bila SKU kosong', () => {
  const rows = planSessionAppend({
    sessionId: 'so-kalbar-2026-11-10',
    additions: [draft({ sku: null })],
    existingDetails: [],
  });

  assert.equal(rows[0].kode_barang, 'Keset karet mie');
  assert.equal(rows[0].kategori, 'Perlengkapan Tetap');
  assert.equal(rows[0].lokasi, 'Gedung / Kantor');
});

test('mergeMasterStockAdditions tidak menimpa master sheet dan menambah qty 0', () => {
  const stock = new Map([['SKU-1', 7]]);
  const details = new Map([
    [
      'SKU-1',
      {
        nama_barang: 'Kursi',
        satuan: 'UNIT',
        lokasi: 'Ruang Peralatan',
        kategori: 'Peralatan',
      },
    ],
  ]);

  const result = mergeMasterStockAdditions({
    stock,
    details,
    additions: [
      draft({ item_name: 'Kursi', normalized_name: 'kursi', sku: 'SKU-1' }),
      draft({
        item_name: 'Keset karet mie',
        normalized_name: 'keset karet mie',
        sku: null,
      }),
    ],
  });

  assert.equal(result.stock.get('SKU-1'), 7);
  assert.equal(result.stock.get('Keset karet mie'), 0);
  assert.equal(result.details.get('Keset karet mie').kategori, 'Perlengkapan Tetap');
  assert.equal(result.added, 1);

  // Map input tidak boleh berubah.
  assert.equal(stock.size, 1);
  assert.equal(details.size, 1);

  const again = mergeMasterStockAdditions({
    stock: result.stock,
    details: result.details,
    additions: [draft({ sku: null })],
  });
  assert.equal(again.added, 0);
});

test('mergeSoStockWithAdditions menambah item baru dengan stok sistem 0', () => {
  const items = [
    {
      kode_barang: 'SKU-1',
      nama_barang: 'Kursi',
      stok_sistem: 4,
      qty_fisik: 3,
      satuan: 'UNIT',
    },
  ];

  const result = mergeSoStockWithAdditions(items, [
    draft({ item_name: 'Kursi', normalized_name: 'kursi', sku: 'SKU-1' }),
    draft(),
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].stok_sistem, 4);
  assert.deepEqual(result[1], {
    kode_barang: 'Keset karet mie',
    nama_barang: 'Keset karet mie',
    stok_sistem: 0,
    qty_fisik: null,
    satuan: 'bh',
  });
});

test('mergeSoStockItemLists mempertahankan item lokal dan item cloud-only', () => {
  const local = [
    { kode_barang: 'A', nama_barang: 'Kursi', stok_sistem: 5, qty_fisik: 5 },
  ];
  const cloud = [
    { kode_barang: 'A', nama_barang: 'Kursi', stok_sistem: 4, qty_fisik: 4 },
    {
      kode_barang: 'Keset karet mie',
      nama_barang: 'Keset karet mie',
      stok_sistem: 0,
      qty_fisik: null,
    },
  ];

  const merged = mergeSoStockItemLists(local, cloud);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].stok_sistem, 5);
  assert.equal(merged[1].nama_barang, 'Keset karet mie');
});

test('selectCatalogAdditions melewati katalog yang sudah ada dan dedupe antar region', () => {
  const catalog = [
    { item_name: 'Kursi', system_item_name: 'Kursi', sku: 'SKU-1' },
  ];
  const additions = [
    draft({ item_name: 'Kursi', normalized_name: 'kursi', sku: null }),
    draft({
      item_name: 'Meja',
      normalized_name: 'meja',
      sku: 'SKU-9',
      region: 'KALBAR',
    }),
    draft({
      item_name: 'Meja',
      normalized_name: 'meja',
      sku: 'SKU-9',
      region: 'JABODETABEK',
    }),
  ];

  const result = selectCatalogAdditions(catalog, additions);

  assert.equal(result.length, 1);
  assert.equal(result[0].item_name, 'Meja');
});
```

- [ ] **Step 2: Jalankan test dan pastikan gagal**

```powershell
node --test src/lib/master/additions.test.mjs
```

Expected: gagal karena modul `./additions.ts` belum ada.

- [ ] **Step 3: Implementasikan helper**

Buat `src/lib/master/additions.ts`:

```ts
/**
 * Helper murni untuk master asset additions dari RO.
 *
 * Modul ini tidak boleh mengimpor Supabase, React, atau API browser supaya
 * bisa diuji langsung dengan `node --test`.
 */

import { normalizeInventoryKey } from '../so-harian/inventoryEngine.ts';

export type MasterAdditionRegion = 'JABODETABEK' | 'KALBAR';

export interface MasterAdditionInput {
  item_name?: string | null;
  sku?: string | null;
  unit?: string | null;
  classification?: string | null;
  item_type?: string | null;
  specification?: string | null;
  photo_url?: string | null;
  stock_source?: string | null;
}

export interface CatalogEnrichment {
  item_name?: string | null;
  system_item_name?: string | null;
  sku?: string | null;
  unit?: string | null;
  classification?: string | null;
  specification?: string | null;
  photo_url?: string | null;
}

export interface MasterAdditionDraft {
  region: MasterAdditionRegion;
  item_name: string;
  normalized_name: string;
  sku: string | null;
  unit: string;
  classification: string;
  specification: string | null;
  photo_url: string | null;
  source: 'RO';
  source_ro_number: string | null;
  is_active: true;
}

export interface ExistingAdditionLike {
  region?: string | null;
  normalized_name?: string | null;
  sku?: string | null;
}

export interface SessionDetailLike {
  kode_barang?: string | null;
  nama_barang?: string | null;
}

export interface SessionAppendRow {
  id: string;
  session_id: string;
  kode_barang: string;
  nama_barang: string;
  kategori: string;
  satuan: string;
  lokasi: string;
  stok_awal: number;
  qty_penerimaan: number;
  qty_ro: number;
  stok_sistem: number;
  qty_fisik: null;
  selisih: null;
  status_selisih: 'UNCHECKED';
  catatan: string;
}

export interface SoStockItemLike {
  kode_barang?: string | null;
  nama_barang?: string | null;
  stok_sistem?: number | null;
  qty_fisik?: number | null;
  satuan?: string | null;
}

export interface OpeningStockDetailLike {
  nama_barang: string;
  satuan: string;
  lokasi: string;
  kategori: string;
}

export function isCancelledStockSource(value?: string | null): boolean {
  return String(value || '').trim().toUpperCase() === 'CANCELLED';
}

function findCatalogMatch(
  catalog: CatalogEnrichment[],
  normalizedName: string,
  normalizedSku: string
): CatalogEnrichment | null {
  if (normalizedSku) {
    const bySku = catalog.find(
      (row) => normalizeInventoryKey(row.sku) === normalizedSku
    );
    if (bySku) return bySku;
  }

  return (
    catalog.find((row) => {
      const name = normalizeInventoryKey(row.item_name || row.system_item_name);
      return Boolean(name) && name === normalizedName;
    }) || null
  );
}

export function buildMasterAdditionDrafts(options: {
  region: MasterAdditionRegion;
  roNumber?: string | null;
  items?: MasterAdditionInput[];
  catalog?: CatalogEnrichment[];
}): MasterAdditionDraft[] {
  const catalog = options.catalog || [];
  const seenNames = new Set<string>();
  const seenSkus = new Set<string>();
  const drafts: MasterAdditionDraft[] = [];

  for (const item of options.items || []) {
    if (isCancelledStockSource(item.stock_source)) continue;

    const itemName = String(item.item_name || '').trim();
    const normalizedName = normalizeInventoryKey(itemName);
    if (!normalizedName) continue;

    const rawSku = String(item.sku || '').trim();
    const sku = rawSku || null;
    const normalizedSku = normalizeInventoryKey(rawSku);

    if (seenNames.has(normalizedName)) continue;
    if (normalizedSku && seenSkus.has(normalizedSku)) continue;

    const match = findCatalogMatch(catalog, normalizedName, normalizedSku);
    const classification =
      String(
        item.classification || item.item_type || match?.classification || ''
      ).trim() || 'Perlengkapan Tetap';
    const unit = String(item.unit || match?.unit || '').trim() || 'unit';

    seenNames.add(normalizedName);
    if (normalizedSku) seenSkus.add(normalizedSku);

    drafts.push({
      region: options.region,
      item_name: itemName,
      normalized_name: normalizedName,
      sku,
      unit,
      classification,
      specification: match?.specification || item.specification || null,
      photo_url: match?.photo_url || item.photo_url || null,
      source: 'RO',
      source_ro_number: options.roNumber
        ? String(options.roNumber).trim()
        : null,
      is_active: true,
    });
  }

  return drafts;
}

export function selectNewAdditionDrafts(
  drafts: MasterAdditionDraft[],
  existing: ExistingAdditionLike[]
): MasterAdditionDraft[] {
  const rows = existing || [];

  return (drafts || []).filter((draft) => {
    const sameRegion = rows.filter(
      (row) =>
        !row.region ||
        String(row.region).trim().toUpperCase() === draft.region
    );
    const names = new Set(
      sameRegion
        .map((row) => normalizeInventoryKey(row.normalized_name))
        .filter(Boolean)
    );
    const skus = new Set(
      sameRegion.map((row) => normalizeInventoryKey(row.sku)).filter(Boolean)
    );

    if (names.has(draft.normalized_name)) return false;
    const skuKey = normalizeInventoryKey(draft.sku);
    if (skuKey && skus.has(skuKey)) return false;
    return true;
  });
}

function hashKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildAutoDetailId(
  sessionId: string,
  itemName: string,
  sku?: string | null
): string {
  const seed = `${normalizeInventoryKey(itemName)}|${normalizeInventoryKey(sku)}`;
  return `${sessionId}-auto-${hashKey(seed)}`;
}

function detailMatchesDraft(
  detail: SessionDetailLike,
  draft: MasterAdditionDraft
): boolean {
  const detailCode = normalizeInventoryKey(detail.kode_barang);
  const detailName = normalizeInventoryKey(detail.nama_barang);
  const skuKey = normalizeInventoryKey(draft.sku);

  if (skuKey && detailCode === skuKey) return true;
  if (detailName && detailName === draft.normalized_name) return true;
  if (detailCode && detailCode === draft.normalized_name) return true;
  return false;
}

export function planSessionAppend(options: {
  sessionId: string;
  roNumber?: string | null;
  additions: MasterAdditionDraft[];
  existingDetails?: SessionDetailLike[];
}): SessionAppendRow[] {
  const existing = options.existingDetails || [];
  const rows: SessionAppendRow[] = [];

  for (const draft of options.additions || []) {
    if (existing.some((detail) => detailMatchesDraft(detail, draft))) continue;
    if (rows.some((row) => detailMatchesDraft(row, draft))) continue;

    const origin =
      String(draft.source_ro_number || options.roNumber || '').trim() || 'RO';
    const isPeralatan =
      String(draft.classification || '').toLowerCase() === 'peralatan';

    rows.push({
      id: buildAutoDetailId(options.sessionId, draft.item_name, draft.sku),
      session_id: options.sessionId,
      kode_barang: String(draft.sku || draft.item_name).trim(),
      nama_barang: draft.item_name,
      kategori: isPeralatan ? 'Peralatan' : 'Perlengkapan Tetap',
      satuan: draft.unit || 'UNIT',
      lokasi: isPeralatan ? 'Ruang Peralatan' : 'Gedung / Kantor',
      stok_awal: 0,
      qty_penerimaan: 0,
      qty_ro: 0,
      stok_sistem: 0,
      qty_fisik: null,
      selisih: null,
      status_selisih: 'UNCHECKED',
      catatan: `Ditambahkan otomatis dari ${origin}`,
    });
  }

  return rows;
}

export function mergeMasterStockAdditions(options: {
  stock: Map<string, number>;
  details: Map<string, OpeningStockDetailLike>;
  additions: MasterAdditionDraft[];
}): {
  stock: Map<string, number>;
  details: Map<string, OpeningStockDetailLike>;
  added: number;
} {
  const stock = new Map(options.stock || []);
  const details = new Map(options.details || []);
  const known = new Set<string>();

  const register = (value: unknown) => {
    const key = normalizeInventoryKey(value);
    if (key) known.add(key);
  };

  for (const key of stock.keys()) register(key);
  for (const [key, detail] of details.entries()) {
    register(key);
    register(detail?.nama_barang);
  }

  let added = 0;

  for (const draft of options.additions || []) {
    const skuKey = normalizeInventoryKey(draft.sku);
    if (known.has(draft.normalized_name) || (skuKey && known.has(skuKey))) {
      continue;
    }

    const key = String(draft.sku || draft.item_name).trim();
    if (!key) continue;

    const isPeralatan =
      String(draft.classification || '').toLowerCase() === 'peralatan';

    stock.set(key, 0);
    details.set(key, {
      nama_barang: draft.item_name,
      satuan: draft.unit || 'UNIT',
      lokasi: isPeralatan ? 'Ruang Peralatan' : 'Gedung / Kantor',
      kategori: isPeralatan ? 'Peralatan' : 'Perlengkapan Tetap',
    });

    register(key);
    register(draft.item_name);
    if (skuKey) register(skuKey);
    added += 1;
  }

  return { stock, details, added };
}

function stockItemsMatch(a: SoStockItemLike, b: SoStockItemLike): boolean {
  const codeA = normalizeInventoryKey(a.kode_barang);
  const codeB = normalizeInventoryKey(b.kode_barang);
  const nameA = normalizeInventoryKey(a.nama_barang);
  const nameB = normalizeInventoryKey(b.nama_barang);

  if (codeA && codeB && codeA === codeB) return true;
  if (nameA && nameB && nameA === nameB) return true;
  if (codeA && nameB && codeA === nameB) return true;
  if (codeB && nameA && codeB === nameA) return true;
  return false;
}

export function mergeSoStockWithAdditions(
  items: SoStockItemLike[],
  additions: MasterAdditionDraft[]
): SoStockItemLike[] {
  const result = [...(items || [])];

  for (const draft of additions || []) {
    const candidate: SoStockItemLike = {
      kode_barang: String(draft.sku || draft.item_name).trim(),
      nama_barang: draft.item_name,
      stok_sistem: 0,
      qty_fisik: null,
      satuan: draft.unit || 'UNIT',
    };

    if (result.some((item) => stockItemsMatch(item, candidate))) continue;
    result.push(candidate);
  }

  return result;
}

export function mergeSoStockItemLists<T extends SoStockItemLike>(
  primary: T[],
  secondary: T[]
): T[] {
  const result = [...(primary || [])];

  for (const item of secondary || []) {
    if (result.some((existing) => stockItemsMatch(existing, item))) continue;
    result.push(item);
  }

  return result;
}

export function selectCatalogAdditions(
  catalog: CatalogEnrichment[],
  additions: MasterAdditionDraft[]
): MasterAdditionDraft[] {
  const result: MasterAdditionDraft[] = [];
  const seen = new Set<string>();

  for (const draft of additions || []) {
    if (seen.has(draft.normalized_name)) continue;

    const skuKey = normalizeInventoryKey(draft.sku);
    const exists = (catalog || []).some((item) => {
      const catalogName = normalizeInventoryKey(
        item.item_name || item.system_item_name
      );
      if (catalogName && catalogName === draft.normalized_name) return true;

      const catalogSku = normalizeInventoryKey(item.sku);
      return Boolean(skuKey && catalogSku && skuKey === catalogSku);
    });

    if (exists) continue;
    seen.add(draft.normalized_name);
    result.push(draft);
  }

  return result;
}
```

- [ ] **Step 4: Jalankan test dan pastikan lulus**

```powershell
node --test src/lib/master/additions.test.mjs
```

Expected: semua test baru lulus.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/master/additions.ts src/lib/master/additions.test.mjs
git commit -m "feat(master): helper pencatatan item tambahan dari ro"
```

---

### Task 3: Integrasi katalog item

**Files:**
- Modify: `src/lib/supabase/server.ts`

**Interfaces:**
- `getMasterAssetCatalog()` tetap mengembalikan `MasterAssetItem[]`.
- Tambahan baru: `getCachedMasterAssetCatalog(): MasterAssetItem[]`.
- Item tambahan muncul sebagai `is_new_item: true` tanpa menunggu TTL cache 15 menit.

- [ ] **Step 1: Tambah import helper**

Di bagian import `src/lib/supabase/server.ts`, tambahkan:

```ts
import {
  selectCatalogAdditions,
  type MasterAdditionDraft,
} from '../master/additions';
```

- [ ] **Step 2: Tambah pembacaan tabel tambahan dan refactor katalog**

Ganti fungsi `getMasterAssetCatalog()` yang ada (sekitar baris 4528) dengan:

```ts
export function getCachedMasterAssetCatalog(): MasterAssetItem[] {
  return cachedMasterCatalog ? [...cachedMasterCatalog] : [];
}

async function getActiveMasterAssetAdditions(): Promise<MasterAdditionDraft[]> {
  const admin = getAdminClient();
  if (!admin) return [];

  try {
    const { data, error } = await admin
      .from('master_asset_additions')
      .select(
        'region,item_name,normalized_name,sku,unit,classification,specification,photo_url,source,source_ro_number,is_active'
      )
      .eq('is_active', true);

    if (error) return [];
    return (data || []) as MasterAdditionDraft[];
  } catch (err) {
    console.warn('Gagal membaca master asset additions:', err);
    return [];
  }
}

export async function getMasterAssetCatalog(): Promise<MasterAssetItem[]> {
  let base: MasterAssetItem[];

  if (cachedMasterCatalog && Date.now() - masterCatalogLastFetched < 15 * 60 * 1000) {
    base = cachedMasterCatalog;
  } else {
    await syncMasterAssetCatalogFromSheet();
    base = cachedMasterCatalog || [];
  }

  const additions = await getActiveMasterAssetAdditions();
  if (additions.length === 0) return base;

  const missing = selectCatalogAdditions(base, additions);
  if (missing.length === 0) return base;

  const extra: MasterAssetItem[] = missing.map((draft, index) => ({
    id: `mat-add-${index + 1}`,
    item_name: draft.item_name,
    system_item_name: draft.item_name,
    unit: draft.unit,
    classification: draft.classification,
    specification:
      draft.specification || getItemSpecification(draft.item_name) || '',
    photo_url: draft.photo_url || getItemImageUrl(draft.item_name) || null,
    standard_rab_price: 0,
    total_requests: 0,
    total_units_needed: 0,
    is_new_item: true,
  }));

  return [...base, ...extra].sort((a, b) =>
    a.item_name.localeCompare(b.item_name)
  );
}
```

Catatan:
- Jangan mengubah `syncMasterAssetCatalogFromSheet()` atau isi cache dasarnya.
- Query tambahan harus selalu dieksekusi di setiap pemanggilan, termasuk saat cache sheet masih valid.
- Jika tabel belum ada, query gagal dan katalog tetap memakai cache sheet.

- [ ] **Step 3: Verifikasi tipe**

```powershell
npx.cmd tsc --noEmit
```

Expected: tidak ada error baru.

- [ ] **Step 4: Commit**

```powershell
git add -- src/lib/supabase/server.ts
git commit -m "feat(master): gabungkan item tambahan ke katalog item"
```

---

### Task 4: API `POST`/`GET /api/master/additions`

**Files:**
- Create: `src/app/api/master/additions/route.ts`

**Interfaces:**
- `POST` body: `{ region, ro_number, items: [{ item_name, sku, unit, item_type, classification, stock_source }] }`
- `GET ?region=KALBAR` mengembalikan item aktif region tersebut.
- Tabel belum ada → `success: true`, `migrationRequired: true`.

- [ ] **Step 1: Tulis route**

Buat `src/app/api/master/additions/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminClient,
  getCachedMasterAssetCatalog,
} from '@/lib/supabase/server';
import { normalizeSoRegion } from '@/lib/so-harian/region';
import { auditMutation } from '@/lib/audit/record-change';
import {
  buildMasterAdditionDrafts,
  planSessionAppend,
  selectNewAdditionDrafts,
  type MasterAdditionDraft,
  type SessionDetailLike,
} from '@/lib/master/additions';

export const dynamic = 'force-dynamic';

const ADDITIONS_TABLE = 'master_asset_additions';
const ADDITION_COLUMNS =
  'region,item_name,normalized_name,sku,unit,classification,specification,photo_url,source,source_ro_number,is_active';
const DETAIL_PAGE_SIZE = 1000;

function isMissingTableError(
  error: { code?: string | null; message?: string | null } | null
): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');
  return (
    code === '42P01' ||
    /relation .* does not exist|could not find the table/i.test(message)
  );
}

function migrationResponse(skipped = 0) {
  return NextResponse.json({
    success: true,
    addedToMaster: 0,
    addedToSession: 0,
    skipped,
    migrationRequired: true,
    message:
      'Tabel master_asset_additions belum ada. Jalankan supabase/master-asset-additions.sql.',
  });
}

async function readSessionDetails(
  admin: any,
  sessionId: string
): Promise<SessionDetailLike[]> {
  const details: SessionDetailLike[] = [];

  for (let from = 0; ; from += DETAIL_PAGE_SIZE) {
    const { data, error } = await admin
      .from('so_details')
      .select('id,kode_barang,nama_barang')
      .eq('session_id', sessionId)
      .order('kode_barang')
      .range(from, from + DETAIL_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    details.push(...data);
    if (data.length < DETAIL_PAGE_SIZE) break;
  }

  return details;
}

export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Koneksi Supabase tidak tersedia.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const region = normalizeSoRegion(body?.region);
    if (!region) {
      return NextResponse.json(
        { success: false, error: 'Region harus JABODETABEK atau KALBAR.' },
        { status: 400 }
      );
    }

    const roNumber = String(body?.ro_number || '').trim();
    const items = Array.isArray(body?.items) ? body.items : [];
    const drafts = buildMasterAdditionDrafts({
      region,
      roNumber,
      items,
      catalog: getCachedMasterAssetCatalog(),
    });

    if (drafts.length === 0) {
      return NextResponse.json({
        success: true,
        addedToMaster: 0,
        addedToSession: 0,
        skipped: 0,
        migrationRequired: false,
      });
    }

    const { data: existingRows, error: readError } = await admin
      .from(ADDITIONS_TABLE)
      .select('region,normalized_name,sku')
      .eq('region', region);

    if (readError) {
      if (isMissingTableError(readError)) return migrationResponse(drafts.length);
      throw new Error(readError.message);
    }

    const newDrafts = selectNewAdditionDrafts(drafts, existingRows || []);

    if (newDrafts.length > 0) {
      const { error: insertError } = await admin
        .from(ADDITIONS_TABLE)
        .upsert(newDrafts, {
          onConflict: 'region,normalized_name',
          ignoreDuplicates: true,
        });

      if (insertError) {
        if (isMissingTableError(insertError)) {
          return migrationResponse(drafts.length);
        }
        throw new Error(insertError.message);
      }
    }

    let addedToSession = 0;
    let sessionId: string | null = null;
    let sessionWarning: string | null = null;

    const { data: sessionRows, error: sessionError } = await admin
      .from('so_sessions')
      .select('id,tanggal,status,region')
      .eq('region', region)
      .eq('status', 'IN_PROGRESS')
      .order('tanggal', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(5);

    if (sessionError) {
      sessionWarning = `Sesi SO tidak dapat dibaca: ${sessionError.message}`;
    } else if (sessionRows && sessionRows.length > 0) {
      const session = sessionRows[0];
      sessionId = String(session.id);

      try {
        const existingDetails = await readSessionDetails(admin, sessionId);
        const appendRows = planSessionAppend({
          sessionId,
          roNumber,
          additions: drafts,
          existingDetails,
        });

        if (appendRows.length > 0) {
          const { error: appendError } = await admin
            .from('so_details')
            .upsert(appendRows);
          if (appendError) throw new Error(appendError.message);
          addedToSession = appendRows.length;

          const { count, error: countError } = await admin
            .from('so_details')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', sessionId);
          if (countError) throw new Error(countError.message);

          const { error: updateError } = await admin
            .from('so_sessions')
            .update({
              total_items: count || 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId);
          if (updateError) throw new Error(updateError.message);
        }
      } catch (sessionErr: any) {
        sessionWarning =
          sessionErr?.message || 'Gagal menambahkan item ke sesi SO.';
      }
    }

    try {
      await auditMutation(req, {
        entityType: 'ITEM',
        entityTitle: `Master tambahan dari ${roNumber || 'RO'}`,
        entityId: roNumber || undefined,
        actionType: 'CREATE',
        details:
          `Menambahkan ${newDrafts.length} item ke master ${region}` +
          (addedToSession > 0
            ? ` dan ${addedToSession} item ke sesi SO ${sessionId}`
            : ''),
        next: {
          region,
          roNumber,
          items: newDrafts.map((draft) => draft.item_name),
        },
      });
    } catch (auditErr) {
      console.warn('[master/additions] Gagal mencatat audit:', auditErr);
    }

    return NextResponse.json({
      success: true,
      addedToMaster: newDrafts.length,
      addedToSession,
      skipped: drafts.length - newDrafts.length,
      sessionId,
      migrationRequired: false,
      warning: sessionWarning || undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Gagal menambahkan item ke master.',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const region = normalizeSoRegion(req.nextUrl.searchParams.get('region'));
    if (!region) {
      return NextResponse.json(
        { success: false, error: 'Region harus JABODETABEK atau KALBAR.' },
        { status: 400 }
      );
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({
        success: true,
        items: [],
        migrationRequired: false,
      });
    }

    const { data, error } = await admin
      .from(ADDITIONS_TABLE)
      .select(ADDITION_COLUMNS)
      .eq('region', region)
      .eq('is_active', true)
      .order('item_name', { ascending: true });

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({
          success: true,
          items: [],
          migrationRequired: true,
        });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      items: data || [],
      migrationRequired: false,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal memuat master tambahan.' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verifikasi tipe**

```powershell
npx.cmd tsc --noEmit
```

Expected: tidak ada error baru.

- [ ] **Step 3: Commit**

```powershell
git add -- src/app/api/master/additions/route.ts
git commit -m "feat(api): endpoint master asset additions dari ro"
```

---

### Task 5: Union item tambahan ke `/api/so/stock`

**Files:**
- Modify: `src/app/api/so/stock/route.ts`

**Interfaces:**
- Response tetap `{ success, session, items }`.
- Item tambahan yang belum ada di detail sesi ikut dikembalikan dengan `stok_sistem: 0`, `qty_fisik: null`.
- Jika belum ada sesi sama sekali, item tambahan tetap dikembalikan dengan `session: null`.

- [ ] **Step 1: Tambah import**

```ts
import {
  mergeSoStockWithAdditions,
  type MasterAdditionDraft,
} from '@/lib/master/additions';
```

- [ ] **Step 2: Baca item tambahan setelah region ditentukan**

Sisipkan setelah baris:

```ts
const region = normalizeSoRegion(searchParams.get('region'));
```

menjadi:

```ts
const region = normalizeSoRegion(searchParams.get('region'));

let additions: MasterAdditionDraft[] = [];
if (region) {
  try {
    const { data, error } = await admin
      .from('master_asset_additions')
      .select(
        'region,item_name,normalized_name,sku,unit,classification,specification,photo_url,source,source_ro_number,is_active'
      )
      .eq('region', region)
      .eq('is_active', true);

    if (!error && data) additions = data as MasterAdditionDraft[];
  } catch (err) {
    console.warn('[so/stock] Gagal membaca master tambahan:', err);
  }
}
```

- [ ] **Step 3: Gabungkan item tambahan di dalam loop sesi**

Ganti:

```ts
      if (items.length > 0) {
        return NextResponse.json({ success: true, session, items });
      }
```

dengan:

```ts
      const mergedItems = mergeSoStockWithAdditions(items, additions);
      if (mergedItems.length > 0) {
        return NextResponse.json({
          success: true,
          session,
          items: mergedItems,
        });
      }
```

- [ ] **Step 4: Kembalikan item tambahan saat tidak ada detail sesi**

Ganti baris terakhir:

```ts
    return NextResponse.json({ success: true, session: candidates[0] ?? null, items: [] });
```

dengan:

```ts
    return NextResponse.json({
      success: true,
      session: candidates[0] ?? null,
      items: mergeSoStockWithAdditions([], additions),
    });
```

- [ ] **Step 5: Verifikasi tipe**

```powershell
npx.cmd tsc --noEmit
```

- [ ] **Step 6: Commit**

```powershell
git add -- src/app/api/so/stock/route.ts
git commit -m "feat(so): tampilkan item master tambahan di stok so kelola ro"
```

---

### Task 6: Pertahankan item tambahan saat simpan sesi SO

**Files:**
- Modify: `src/app/api/so/sessions/route.ts`

**Interfaces:**
- Item tambahan region yang belum ada di payload tetap di-upsert ke `so_details`.
- Hanya berlaku saat sesi yang disimpan berstatus `IN_PROGRESS`.
- `total_items`, hitungan status, `keepIds`, dan respons memakai daftar final.

- [ ] **Step 1: Tambah import**

```ts
import {
  planSessionAppend,
  type MasterAdditionDraft,
  type SessionAppendRow,
} from '@/lib/master/additions';
```

- [ ] **Step 2: Bangun daftar final sebelum payload sesi**

Sisipkan setelah blok penentuan `region` (setelah `resolveSessionRegion(...)`) dan sebelum `const sessionPayload`:

```ts
    let preservedRows: SessionAppendRow[] = [];
    if (region) {
      try {
        const { data, error } = await admin
          .from('master_asset_additions')
          .select(
            'region,item_name,normalized_name,sku,unit,classification,specification,photo_url,source,source_ro_number,is_active'
          )
          .eq('region', region)
          .eq('is_active', true);

        if (!error && data) {
          const sessionStatus = String(session.status || 'DRAFT').toUpperCase();
          if (sessionStatus === 'IN_PROGRESS') {
            preservedRows = planSessionAppend({
              sessionId,
              additions: data as MasterAdditionDraft[],
              existingDetails: items.map((item) => ({
                kode_barang: item?.kode_barang,
                nama_barang: item?.nama_barang,
              })),
            });
          }
        }
      } catch (err) {
        console.warn(
          '[so/sessions] Gagal mempertahankan item master tambahan:',
          err
        );
      }
    }

    const finalItems = [...items, ...preservedRows];
```

- [ ] **Step 3: Pakai `finalItems` untuk payload sesi**

Ganti semua referensi `items` pada `sessionPayload`:

```ts
      total_items: items.length,
      item_match: items.filter((i) => i.status_selisih === 'MATCH').length,
      item_minus: items.filter((i) => i.status_selisih === 'MINUS').length,
      item_plus: items.filter((i) => i.status_selisih === 'PLUS').length,
      item_selisih:
        items.filter((i) => i.status_selisih === 'MINUS').length +
        items.filter((i) => i.status_selisih === 'PLUS').length,
```

menjadi:

```ts
      total_items: finalItems.length,
      item_match: finalItems.filter((i) => i.status_selisih === 'MATCH').length,
      item_minus: finalItems.filter((i) => i.status_selisih === 'MINUS').length,
      item_plus: finalItems.filter((i) => i.status_selisih === 'PLUS').length,
      item_selisih:
        finalItems.filter((i) => i.status_selisih === 'MINUS').length +
        finalItems.filter((i) => i.status_selisih === 'PLUS').length,
```

- [ ] **Step 4: Pakai `finalItems` untuk detail**

Ganti:

```ts
    if (items.length > 0) {
      const detailPayload = items.map((i) => ({
```

dengan:

```ts
    if (finalItems.length > 0) {
      const detailPayload = finalItems.map((i) => ({
```

- [ ] **Step 5: Pakai `finalItems` di respons**

Ganti:

```ts
    return NextResponse.json({ success: true, sessionId, itemCount: items.length });
```

dengan:

```ts
    return NextResponse.json({
      success: true,
      sessionId,
      itemCount: finalItems.length,
    });
```

- [ ] **Step 6: Verifikasi tipe**

```powershell
npx.cmd tsc --noEmit
```

- [ ] **Step 7: Commit**

```powershell
git add -- src/app/api/so/sessions/route.ts
git commit -m "fix(so): pertahankan item master tambahan saat simpan sesi"
```

---

### Task 7: Gabungkan item tambahan saat kompilasi SO

**Files:**
- Modify: `src/components/so-harian/UploadSection.tsx`

**Interfaces:**
- `handleCompile` menjadi async.
- Item tambahan masuk sebagai stok awal 0 tanpa menimpa master sheet.
- Jika fetch gagal, kompilasi tetap berjalan.

- [ ] **Step 1: Tambah import helper**

Tambahkan di area import `src/components/so-harian/UploadSection.tsx`:

```ts
import { mergeMasterStockAdditions } from '@/lib/master/additions';
```

- [ ] **Step 2: Jadikan `handleCompile` async**

Ganti:

```ts
  const handleCompile = () => {
```

dengan:

```ts
  const handleCompile = async () => {
```

- [ ] **Step 3: Ambil dan gabungkan item tambahan**

Sisipkan setelah blok loop `for (const entry of carryForwardMap.values())` dan sebelum komentar `// Hasil SO hari sebelumnya menjadi acuan stok awal`:

```ts
    // Item yang ditambahkan otomatis dari RO disimpan di Supabase, bukan di
    // Google Sheets. Gabungkan sebagai stok awal 0 tanpa menimpa master sheet.
    let additionStock = masterStock;
    let additionDetails = masterDetails;
    try {
      const res = await fetch(`/api/master/additions?region=${region}`, {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);
      const rows = Array.isArray(json?.items) ? json.items : [];

      if (json?.success && rows.length > 0) {
        const merged = mergeMasterStockAdditions({
          stock: masterStock,
          details: masterDetails,
          additions: rows,
        });
        additionStock = merged.stock;
        additionDetails = merged.details;

        for (const [key, detail] of additionDetails.entries()) {
          const nameNorm = normalizeInventoryKey(detail?.nama_barang);
          const codeNorm = normalizeInventoryKey(key);
          if (nameNorm && !nameToSkuMap.has(nameNorm)) {
            nameToSkuMap.set(nameNorm, key);
          }
          if (codeNorm && !nameToSkuMap.has(codeNorm)) {
            nameToSkuMap.set(codeNorm, key);
          }
        }
      }
    } catch (err) {
      console.warn('Gagal memuat master tambahan dari Supabase:', err);
    }
```

- [ ] **Step 4: Pakai map hasil merge**

Ganti pemanggilan:

```ts
    const opening = mergeOpeningStock({
      master: masterStock,
      masterDetails,
      carryForward: carryForwardMap,
      preferCarryForward,
    });
```

dengan:

```ts
    const opening = mergeOpeningStock({
      master: additionStock,
      masterDetails: additionDetails,
      carryForward: carryForwardMap,
      preferCarryForward,
    });
```

- [ ] **Step 5: Verifikasi tipe**

```powershell
npx.cmd tsc --noEmit
```

Expected: `handleCompile` boleh async karena `onClick` menerima fungsi yang mengembalikan promise.

- [ ] **Step 6: Commit**

```powershell
git add -- src/components/so-harian/UploadSection.tsx
git commit -m "feat(so): gabungkan item master tambahan saat kompilasi"
```

---

### Task 8: Auto-add saat proses RO disimpan + merge stok cloud

**Files:**
- Modify: `src/components/distribution/RoManagerView.tsx`

**Interfaces:**
- `handleSaveProcessDecision` memanggil `POST /api/master/additions` setelah PATCH RO sukses.
- Cabang semua item cancel tidak memanggil API.
- `fetchSoStock` menggabungkan item lokal dan cloud saat tanggal sesi sama.

- [ ] **Step 1: Tambah import helper**

```ts
import { mergeSoStockItemLists } from '@/lib/master/additions';
```

- [ ] **Step 2: Merge item lokal + cloud saat tanggal sama**

Ganti blok:

```ts
      // 3. Pakai sesi dengan tanggal terbaru. Jika tanggalnya sama, data lokal
      //    dianggap lebih baru karena baru saja disimpan di perangkat ini.
      const useCloud =
        cloudPick.items.length > 0 &&
        (!localPick.items.length || (cloudPick.tanggal || '') > (localPick.tanggal || ''));
      const pick = useCloud ? cloudPick : localPick;

      setSoSessionDate(pick.tanggal);
      setSoStockItems(pick.items);
```

dengan:

```ts
      // 3. Pakai sesi dengan tanggal terbaru. Jika tanggalnya sama, gabungkan
      //    keduanya: item lokal menang (hitungan fisik terbaru), item cloud-only
      //    tetap dipertahankan (termasuk item master tambahan dari RO).
      const useCloud =
        cloudPick.items.length > 0 &&
        (!localPick.items.length || (cloudPick.tanggal || '') > (localPick.tanggal || ''));

      let pick = useCloud ? cloudPick : localPick;
      if (
        !useCloud &&
        localPick.items.length > 0 &&
        cloudPick.items.length > 0 &&
        (localPick.tanggal || '') === (cloudPick.tanggal || '')
      ) {
        pick = {
          tanggal: localPick.tanggal,
          items: mergeSoStockItemLists(localPick.items, cloudPick.items),
        };
      }

      setSoSessionDate(pick.tanggal);
      setSoStockItems(pick.items);
```

- [ ] **Step 3: Simpan region target di awal handler**

Ganti:

```ts
  const handleSaveProcessDecision = async () => {
    if (!selectedRoForProcess) return;
    try {
```

dengan:

```ts
  const handleSaveProcessDecision = async () => {
    if (!selectedRoForProcess) return;
    const targetRegion = soStockRegion;
    try {
```

- [ ] **Step 4: Panggil auto-add setelah PATCH RO sukses**

Sisipkan setelah blok broadcast:

```ts
      // Broadcast event real-time ke menu Pemantauan Distribusi & PR
      try {
        localStorage.setItem('ca_ro_last_update', Date.now().toString());
        window.dispatchEvent(new Event('ca_ro_updated'));
      } catch {}
```

dan sebelum blok `if (allDone) {` yang berisi `setToast`:

```ts
      // Catat item non-cancel yang belum ada di master katalog/master stok SO.
      // Kegagalan di sini tidak boleh membatalkan penyimpanan RO.
      let masterFeedback = '';
      try {
        const candidates = selectedRoForProcess.items
          .filter(
            (it) =>
              String(it.stock_source || '').trim().toUpperCase() !== 'CANCELLED'
          )
          .filter((it) => String(it.item_name || '').trim())
          .map((it) => ({
            item_name: it.item_name,
            sku: it.sku || '',
            unit: it.unit || '',
            item_type: it.item_type || '',
            classification: it.item_type || '',
            stock_source: it.stock_source || '',
          }));

        if (candidates.length > 0) {
          const addRes = await fetch('/api/master/additions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              region: targetRegion,
              ro_number: targetRoNo,
              items: candidates,
            }),
          });
          const addJson = await addRes.json().catch(() => null);

          if (addJson?.migrationRequired) {
            masterFeedback =
              ' Master tambahan belum aktif; jalankan supabase/master-asset-additions.sql.';
          } else if (
            addJson?.success &&
            (Number(addJson.addedToMaster) > 0 ||
              Number(addJson.addedToSession) > 0)
          ) {
            masterFeedback = ` ${Number(addJson.addedToMaster) || 0} item baru masuk master, ${
              Number(addJson.addedToSession) || 0
            } masuk sesi SO.`;
          } else if (!addJson?.success) {
            masterFeedback = ' Master tambahan gagal disinkronkan.';
          }
        }
      } catch (err) {
        console.warn('Gagal menyinkronkan master tambahan:', err);
        masterFeedback = ' Master tambahan gagal disinkronkan.';
      }

      try {
        await fetchSoStock(targetRegion);
      } catch {}
```

- [ ] **Step 5: Tambahkan feedback ke toast sukses**

Sisipkan setelah blok `if (allDone) { ... } else { ... }` yang berisi toast, dan sebelum `setSelectedRoForProcess(null);`:

```ts
      if (masterFeedback) {
        setToast((prev) =>
          prev
            ? { ...prev, message: `${prev.message}${masterFeedback}` }
            : prev
        );
      }
```

- [ ] **Step 6: Pastikan cabang semua-cancel tetap tanpa auto-add**

Periksa blok:

```ts
      if (allDone && cancelledItems.length === selectedRoForProcess.items.length) {
```

Blok itu harus `return` sebelum kode auto-add. Jangan menambahkan pemanggilan API di cabang tersebut.

- [ ] **Step 7: Verifikasi tipe**

```powershell
npx.cmd tsc --noEmit
```

- [ ] **Step 8: Commit**

```powershell
git add -- src/components/distribution/RoManagerView.tsx
git commit -m "feat(ro): auto-add item non-cancel ke master saat proses disimpan"
```

---

### Task 9: Verifikasi end-to-end, migration, dan rollout

**Files:**
- Tidak ada file baru.
- Verifikasi memakai data produksi/dev yang sama.

- [ ] **Step 1: Jalankan seluruh unit test**

```powershell
node --test "src/lib/**/*.test.mjs"
```

Expected: semua test lulus (207 test lama + test baru).

- [ ] **Step 2: Verifikasi tipe**

```powershell
npx.cmd tsc --noEmit
```

Expected: bersih.

- [ ] **Step 3: Minta user menjalankan migration**

Agent tidak boleh mengeksekusi DDL. Minta user membuka Supabase Dashboard → SQL Editor → jalankan isi `supabase/master-asset-additions.sql`.

Verifikasi tabel:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'master_asset_additions'
order by ordinal_position;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'master_asset_additions';
```

Expected: tabel dan unique index `(region, normalized_name)` ada.

- [ ] **Step 4: Verifikasi dev — auto-add RO-104995**

Prasyarat: dev server `http://localhost:3000` berjalan.

1. Login `superuser` / `usergacor`.
2. Pilih region `KALBAR`.
3. Buka Kelola RO, cari `RO-104995`.
4. Klik proses, pastikan item `Keset karet mie` berstatus `PR_VENDOR`.
5. Simpan proses.
6. Pastikan toast sukses menyebut item baru masuk master/sesi SO.

Verifikasi database dengan service role (script sementara di folder temp, jangan commit):

```js
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: additions } = await supabase
  .from('master_asset_additions')
  .select('*')
  .eq('region', 'KALBAR')
  .ilike('item_name', '%keset karet mie%');

const { data: details } = await supabase
  .from('so_details')
  .select('*')
  .eq('session_id', 'so-kalbar-2026-11-10')
  .ilike('nama_barang', '%keset karet mie%');

const { data: jaboSessions } = await supabase
  .from('so_sessions')
  .select('id')
  .eq('region', 'JABODETABEK')
  .eq('status', 'IN_PROGRESS');

console.log('additions', additions);
console.log('details', details);
console.log('jabo sessions', jaboSessions);
```

Expected:
- `master_asset_additions` berisi `Keset karet mie` region `KALBAR`, `source_ro_number = 'RO-104995'`.
- `so_details` sesi `so-kalbar-2026-11-10` berisi baris dengan `stok_awal = 0`, `stok_sistem = 0`, `qty_fisik = null`, `status_selisih = 'UNCHECKED'`, catatan menyebut `RO-104995`.
- Tidak ada perubahan pada sesi JABODETABEK.

- [ ] **Step 5: Verifikasi badge dan katalog**

1. Buka ulang modal proses RO-104995. Badge `Keset karet mie` harus `Sistem SO: 0`, bukan “Belum terdata”.
2. Buka `/items`, cari `Keset karet mie`. Item harus muncul dengan `is_new_item` dan kategori `Perlengkapan Tetap`, satuan `bh`.
3. Buka `/api/so/stock?region=KALBAR` di browser, pastikan item muncul.
4. Buka `/api/so/stock?region=JABODETABEK`, pastikan item KALBAR tidak muncul.
5. Buka `/api/master/additions?region=KALBAR`, pastikan item muncul; `?region=JABODETABEK` tidak.

- [ ] **Step 6: Verifikasi simpan ulang sesi SO**

1. Buka Stock Opname Harian KALBAR.
2. Muat sesi `so-kalbar-2026-11-10`.
3. Simpan sesi tanpa mengubah item.
4. Pastikan baris `Keset karet mie` masih ada di `so_details` dan tidak terhapus oleh `staleIds`.

- [ ] **Step 7: Verifikasi idempotensi**

Simpan proses RO-104995 sekali lagi. Expected:
- `master_asset_additions` tidak bertambah duplikat.
- `so_details` tidak bertambah duplikat.
- Toast tidak menyebut item baru bila tidak ada yang baru.

- [ ] **Step 8: Push dev**

Setelah semua verifikasi lulus:

```powershell
git push origin dev
```

- [ ] **Step 9: Merge ke main hanya setelah persetujuan user**

Jangan merge otomatis. Minta persetujuan user, lalu:

```powershell
git checkout main
git merge --ff-only dev
git push origin main
git checkout dev
```

Setelah deploy production (lag ±75–100 detik), ulangi verifikasi badge dan katalog di `https://dashboard-ca-inventory.vercel.app`.

## Catatan Rollback

- Code rollback aman: jika fitur dikembalikan, tabel `master_asset_additions` boleh tetap ada tanpa memengaruhi aplikasi lama karena tidak ada kode lama yang membacanya.
- Jangan `drop table` saat rollback aplikasi; item di sesi SO tetap dipertahankan oleh kode lama karena sudah menjadi bagian `so_details`.
- Jika ingin menonaktifkan fitur tanpa deploy, set `is_active = false` pada baris terkait; item tidak lagi dibaca katalog/stok/kompilasi.
