# Master Asset Additions dari RO — Design

Tanggal: 2026-11-10
Status: Disetujui untuk implementasi
Terkait: `2026-11-06-stock-opname-per-region-design.md`,
`2026-10-22-so-harian-cloud-rollover-design.md`

## 1. Tujuan

1. Item aset yang ada di **Kelola RO** tetapi belum ada di master aset/master stok
   SO otomatis dicatat saat user menyimpan proses RO.
2. Item baru disimpan permanen di **Supabase**, tanpa perlu menambah baris ke
   Google Sheets master.
3. Item baru muncul di:
   - katalog **Kelola Item & Spek**;
   - master stok **SO Harian** region terkait;
   - sesi SO yang sedang `IN_PROGRESS`, sehingga bisa langsung dihitung.
4. Badge **Stok SO** di Kelola RO tidak lagi menampilkan “Belum terdata” untuk
   item yang sudah ditambahkan; item baru tampil sebagai `Sistem SO: 0`
   sampai dihitung fisik.
5. Tidak ada pencampuran data antar-region.

## 2. Keputusan yang Disetujui

| Topik | Keputusan |
|---|---|
| Master yang diisi | Katalog item **dan** master stok SO |
| Waktu pencatatan | Saat proses RO disimpan, bukan saat modal dibuka |
| Item yang dicatat | Semua item non-cancel, baik Ready Stock maupun Butuh PR |
| Sesi SO berjalan | Item baru langsung dimasukkan ke sesi `IN_PROGRESS` dengan qty 0/`UNCHECKED` |
| Stok awal item baru | `0`, status `UNCHECKED` |
| Penyimpanan | Tabel Supabase baru `master_asset_additions` |
| Pencocokan | Exact normalized name atau SKU; tanpa fuzzy/partial |
| Region | Item tambahan bersifat per region |
| Google Sheets | Tidak diubah; tetap menjadi master utama untuk item yang sudah ada |
| Backfill | Tidak otomatis untuk RO yang sudah pernah diproses |

## 3. Kondisi Saat Ini

- Master stok SO dibaca dari Google Sheets `PERALATAN` dan `PERLENGKAPAN`
  per region melalui `UploadSection`.
- `mergeDailyInventory()` menggabungkan stok awal, RO harian, dan penerimaan.
  Item RO yang tidak ada di master tetap bisa muncul di kompilasi, tetapi tidak
  otomatis masuk sesi SO yang sudah tersimpan.
- `GET /api/so/stock` hanya membaca `so_sessions`/`so_details` terbaru per
  region. Item yang tidak ada di sesi ditampilkan “Belum terdata” di modal
  Pilih Proses.
- `getMasterAssetCatalog()` di `src/lib/supabase/server.ts` menyusun katalog
  dari sheet master, sheet RO, dan baris `asset_requests` ber-ID `MASTER-...`.
  Katalog ini belum memakai tabel tambahan dan belum menjadi sumber stok SO.
- `POST /api/so/sessions` menghapus detail yang tidak ada di payload
  (`staleIds`), sehingga item yang ditambahkan server bisa terhapus saat user
  menyimpan ulang sesi SO.
- `RoManagerView.fetchSoStock()` memilih data lokal jika tanggal sesi sama
  dengan cloud. Ini bisa menyembunyikan item yang baru ditambahkan ke cloud.

## 4. Arsitektur

```
Simpan Proses RO
      |
      v
POST /api/master/additions
      |
      +--> master_asset_additions (upsert per region + normalized_name)
      +--> so_details sesi IN_PROGRESS (qty 0, UNCHECKED, catatan asal RO)
      +--> update total_items sesi
      +--> audit_logs (entity ITEM)
      |
      v
Response: addedToMaster, addedToSession, skipped, migrationRequired

Katalog Item & Spek
      getMasterAssetCatalog()
      +--> katalog sheet (cache)
      +--> master_asset_additions (query segar, dedupe nama)

SO Harian
      GET /api/master/additions?region=...
      +--> merge ke stok awal qty 0 saat kompilasi

Kelola RO
      GET /api/so/stock?region=...
      +--> detail sesi terbaru
      +--> union master_asset_additions yang belum ada di sesi (qty 0)
```

## 5. Data Model

File migration baru: `supabase/master-asset-additions.sql`.

```sql
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
```

Catatan:
- Tidak ada policy publik; akses hanya lewat service role di server.
- `normalized_name` memakai `normalizeInventoryKey()` yang sudah dipakai SO:
  trim, collapse whitespace, lowercase.
- `sku` boleh null/kosong karena banyak item RO hanya punya nama.
- `gen_random_uuid()` tersedia di Supabase PostgreSQL.
- Tidak ada kolom stok. Stok tetap hidup di sesi SO; item tambahan selalu mulai
  dari 0.

## 6. Normalisasi & Aturan Pencocokan

1. Nama item dinormalisasi dengan `normalizeInventoryKey()`.
2. Item dianggap sudah ada jika:
   - `region + normalized_name` sudah ada di `master_asset_additions`; atau
   - SKU (jika tidak kosong) sudah ada di katalog/sesi region yang sama.
3. Tidak memakai fuzzy matching atau substring. “Keset karet mie” tidak boleh
   dianggap sama dengan “Keset Karet Bolong - 60x40cm”.
4. Master sheet tetap menang:
   - saat kompilasi SO, qty dari master sheet dipakai bila item sudah ada;
   - item tambahan hanya mengisi SKU yang belum ada.
5. Nama sama di region berbeda menghasilkan baris tambahan berbeda.
6. Nama kosong, item `CANCELLED`, dan region tidak valid dilewati.
7. Item dengan SKU sama tetapi nama berbeda dianggap item yang sama; nama baru
   tidak menimpa nama master yang sudah ada.

## 7. Backend

### 7.1 `POST /api/master/additions`

Body:

```json
{
  "region": "KALBAR",
  "ro_number": "RO-104995",
  "items": [
    {
      "item_name": "Keset karet mie",
      "sku": "",
      "unit": "bh",
      "item_type": "Perlengkapan Tetap",
      "stock_source": "PR_VENDOR"
    }
  ]
}
```

Alur server:
1. Validasi `region` dengan `normalizeSoRegion()`.
2. Filter item `CANCELLED`, nama kosong, dan duplikat dalam batch.
3. Baca `master_asset_additions` region tersebut.
4. Baca snapshot katalog yang sudah di-cache (tanpa memicu tarik sheet baru)
   untuk melengkapi `classification`, `unit`, `specification`, dan `photo_url`
   bila nama/SKU cocok. Jika cache kosong, pakai metadata dari item RO.
5. Insert item yang belum ada dengan `onConflict: 'region,normalized_name'`
   dan `ignoreDuplicates: true`.
6. Cari sesi SO terbaru region tersebut dengan status `IN_PROGRESS`
   (urut `tanggal` turun, lalu `updated_at` turun).
7. Baca detail sesi untuk dedupe nama/SKU.
8. Insert detail baru ke `so_details` dengan:
   - `id` deterministik: `<session_id>-auto-<hash>` agar idempotent;
   - `stok_awal = 0`, `qty_penerimaan = 0`, `qty_ro = 0`,
     `stok_sistem = 0`, `qty_fisik = null`, `selisih = null`,
     `status_selisih = 'UNCHECKED'`;
   - `catatan = 'Ditambahkan otomatis dari <ro_number>'`.
9. Hitung ulang jumlah detail dan update `so_sessions.total_items` +
   `updated_at`.
10. Catat audit `entityType: 'ITEM'` berisi jumlah item dan RO asal.
11. Invalidate cache katalog.

Response sukses:

```json
{
  "success": true,
  "addedToMaster": 1,
  "addedToSession": 1,
  "skipped": 0,
  "migrationRequired": false
}
```

Jika tabel belum ada, response tetap `success: true` dengan
`migrationRequired: true`, `addedToMaster: 0`, dan pesan yang jelas. RO tidak
boleh gagal hanya karena fitur tambahan ini belum siap.

### 7.2 `GET /api/master/additions?region=KALBAR`

Mengembalikan item aktif region tersebut:

```json
{
  "success": true,
  "items": [
    {
      "item_name": "Keset karet mie",
      "sku": "",
      "unit": "bh",
      "classification": "Perlengkapan Tetap",
      "specification": null,
      "photo_url": null,
      "source_ro_number": "RO-104995"
    }
  ]
}
```

Jika region tidak valid, kembalikan `400`. Jika tabel belum ada, kembalikan
`items: []` dan `migrationRequired: true`.

### 7.3 Kompilasi SO

`UploadSection.handleCompile()` menjadi async dan mengambil
`GET /api/master/additions?region=...` sebelum `mergeOpeningStock()`.

- Item tambahan dimasukkan ke `masterStock` dengan qty 0 dan ke
  `masterDetails` dengan nama/kategori/satuan dari tabel.
- Jika SKU/nama sudah ada di master sheet, data sheet dipakai.
- Jika endpoint gagal, kompilasi tetap berjalan memakai master sheet dan
  menampilkan peringatan non-blocking.

### 7.4 Penyimpanan sesi SO

`POST /api/so/sessions` harus mempertahankan item tambahan:

1. Sebelum menghapus `staleIds`, baca `master_asset_additions` untuk region
   sesi.
2. Item tambahan yang belum ada di payload **ditambahkan ke payload** dengan
   qty 0/`UNCHECKED`, sehingga tidak dihapus dan tetap terlihat saat sesi
   dibaca ulang.
3. `total_items` dihitung dari detail final, bukan hanya payload client.

Tujuannya agar item yang ditambahkan server tidak hilang saat user menyimpan
ulang sesi SO dari halaman Stock Opname.

### 7.5 `/api/so/stock`

Response tetap memuat detail sesi terbaru, ditambah item dari
`master_asset_additions` region yang belum ada di detail sesi:

- `stok_sistem: 0`
- `qty_fisik: null`
- `satuan` dari tabel tambahan
- `stok_awal: 0`, `qty_penerimaan: 0`, `qty_ro: 0`

Dengan begitu badge Kelola RO langsung menampilkan `Sistem SO: 0` meskipun
sesi SO belum dikompilasi ulang.

### 7.6 Katalog item

`getMasterAssetCatalog()` diubah agar:

- cache lama tetap menyimpan hasil sheet/RO/custom;
- setiap pemanggilan menambahkan baris aktif dari `master_asset_additions`
  (query ringan), lalu dedupe berdasarkan `normalized_name` atau SKU;
- item tambahan diberi `is_new_item: true` agar muncul di tab item baru;
- `photo_url` dan `specification` memakai nilai dari tabel atau helper gambar
  yang sudah ada.

Dengan cara ini item baru muncul tanpa menunggu TTL cache 15 menit.

## 8. Client Flow

### 8.1 Kelola RO

Di `handleSaveProcessDecision`, setelah PATCH RO berhasil:

1. Ambil item non-cancel dari `selectedRoForProcess.items`.
2. Panggil `POST /api/master/additions`.
3. Jika sukses dan ada item baru, tampilkan toast:
   `N item baru ditambahkan ke master dan sesi SO`.
4. Jika `migrationRequired`, tampilkan peringatan:
   `Master tambahan belum aktif. Jalankan supabase/master-asset-additions.sql.`
5. Jika gagal, tampilkan peringatan tetapi jangan membatalkan RO.
6. Panggil ulang `fetchSoStock(region)` agar badge memakai data terbaru.

Cabang “semua item dibatalkan” tidak memanggil endpoint ini.

### 8.2 `fetchSoStock()`

Saat tanggal sesi lokal dan cloud sama, jangan langsung membuang cloud.
Gabungkan item:

- item yang sama: nilai lokal dipertahankan (kemungkinan berisi hitungan
  fisik terbaru);
- item yang hanya ada di cloud: tetap dipakai, termasuk item tambahan;
- item yang hanya ada di lokal: tetap dipakai.

Dedupe memakai SKU/nama ternormalisasi.

### 8.3 Stock Opname

Saat kompilasi, item tambahan masuk sebagai baris baru dengan qty 0 dan
`UNCHECKED`, sehingga user bisa langsung menghitung fisiknya. Catatan baris
menyebut RO asal.

## 9. Error Handling

| Kondisi | Perilaku |
|---|---|
| Tabel migration belum ada | RO tetap tersimpan; fitur tambahan nonaktif; pesan migration |
| Endpoint tambahan gagal | RO tetap tersimpan; toast peringatan |
| Sesi SO bukan `IN_PROGRESS` | Master tetap disimpan; sesi tidak diubah |
| Item sudah ada | Dilewati, tidak duplikat |
| Nama kosong / cancel | Dilewati |
| Region tidak cocok | Ditolak per item / `400` untuk region invalid |
| Simpan ulang sesi SO | Item tambahan dipertahankan |
| Gagal update total sesi | Return sukses sebagian + warning; data detail tetap tersimpan |

## 10. Pengujian

Unit test baru: `src/lib/master/additions.test.mjs`

- normalisasi nama dan dedupe batch;
- filter item cancel dan nama kosong;
- isolasi region;
- exact match tidak mencocokkan nama yang mirip;
- merge katalog: sheet menang, tambahan hanya mengisi yang belum ada;
- merge stok SO: qty 0/`UNCHECKED`;
- perencanaan append sesi: id deterministik dan tidak duplikat.

Verifikasi:
- `node --test "src/lib/**/*.test.mjs"`;
- `npx.cmd tsc --noEmit`;
- dev: simpan RO-104995 → “Keset karet mie” masuk tabel, katalog, sesi SO
  `IN_PROGRESS`, dan badge berubah dari “Belum terdata” menjadi
  `Sistem SO: 0`;
- simpan ulang sesi SO dari halaman Stock Opname → item tambahan tidak hilang;
- region JABODETABEK tidak melihat item KALBAR.

## 11. Migration & Rollout

1. Tambah file `supabase/master-asset-additions.sql`.
2. Jalankan sekali di Supabase SQL Editor (DDL tidak bisa dieksekusi lewat
   service role dari aplikasi).
3. Implementasi dan verifikasi di `dev`.
4. Setelah disetujui, merge `dev` → `main` dan verifikasi produksi.
5. Dev dan produksi memakai database yang sama; migration cukup sekali.

## 12. Non-Goals

- Tidak menulis balik ke Google Sheets.
- Tidak melakukan fuzzy matching otomatis.
- Tidak melakukan backfill untuk RO yang sudah diproses sebelum fitur ini.
- Tidak menambah UI edit/hapus item tambahan pada iterasi ini; item dapat
  dinonaktifkan lewat `is_active` bila diperlukan.
- Tidak mengubah formula stok atau aturan rollover yang sudah ada.
- Tidak menggabungkan item antar-region.

## 13. Acceptance Criteria

1. Menyimpan proses RO dengan item non-cancel yang belum ada di master
   menghasilkan baris baru di `master_asset_additions`.
2. Item tersebut muncul di katalog Kelola Item & Spek.
3. Item tersebut masuk ke sesi SO `IN_PROGRESS` region yang sama dengan
   `stok_sistem = 0` dan `status_selisih = 'UNCHECKED'`.
4. Badge Kelola RO menampilkan `Sistem SO: 0`, bukan “Belum terdata”.
5. Kompilasi SO berikutnya memuat item tersebut dengan qty 0.
6. Menyimpan ulang sesi SO tidak menghapus item tambahan.
7. Region lain tidak terpengaruh.
8. Jika tabel belum ada, penyimpanan RO tetap berhasil dan user mendapat
   peringatan yang jelas.
