# Stock Opname Harian per Region — Design

Tanggal: 2026-11-06
Status: Disetujui untuk implementasi
Menggantikan keputusan "satu gudang / baseline global" pada spec
`2026-10-22-so-harian-cloud-rollover-design.md`.

## 1. Tujuan

1. Stock Opname Harian berjalan terpisah untuk **JABODETABEK** dan **KALBAR**.
2. Setiap region punya sesi, stok awal, RO, penerimaan, rollover, dan riwayat sendiri.
3. Region ditentukan otomatis dari profil pengguna; Super User dapat berpindah region.
4. Link master yang sekarang dipakai menjadi milik **KALBAR**. Link master
   **JABODETABEK** sudah tersedia dan menjadi default region tersebut.
5. Penerimaan Harian mengambil **PR Ready Stock** untuk kedua region, difilter
   berdasarkan region.

## 2. Keputusan yang Disetujui

| Topik | Keputusan |
|---|---|
| Cakupan region | Seluruh sesi SO: stok awal, RO, penerimaan, rollover, riwayat |
| Region yang didukung | `JABODETABEK` dan `KALBAR` (tanpa `ALL` untuk sesi SO) |
| Sumber region | Profil pengguna (`allowedRegion`); Super User / akses ALL dapat memilih |
| Sumber penerimaan | PR Ready Stock untuk kedua region, difilter `region` |
| Sumber stok awal | Master terpisah per region |
| Link lama | Menjadi default **KALBAR** |
| Link JABODETABEK | Sudah tersedia (Peralatan & Perlengkapan), menjadi default region JABO |
| Sesi lama tanpa region | Tetap terlihat sebagai "Sesi lama", tidak dipakai rollover |
| Identitas sesi | `so-<slug-region>-<YYYY-MM-DD>` |
| Penyimpanan region | Kolom `region` di `so_sessions` + derivasi dari ID sebagai fallback |

## 3. Kondisi Saat Ini

- `src/components/so-harian/StockOpnameView.tsx` memakai satu sesi global
  `so-YYYY-MM-DD`, dengan `gudang: "Gudang Utama"`.
- `src/components/so-harian/UploadSection.tsx` memakai satu set URL untuk
  Penerimaan, Peralatan, dan Perlengkapan (`DEFAULT_SHEET_URLS`) yang disimpan
  di `localStorage` dengan key `so_sheet_urls`.
- Penerimaan memiliki tiga mode: `PR_READY_STOCK`, `FILE`, dan `LINK`.
  `PR_READY_STOCK` memanggil `/api/stock-opname/pr-ready-items` tanpa filter region.
- RO memiliki empat mode: `MONITORING_SLA`, `INTERNAL_SJ`, `FILE`, dan `LINK`.
  `MONITORING_SLA` memanggil `/api/stock-opname/sla-items` tanpa filter region;
  `INTERNAL_SJ` memuat semua Surat Jalan lalu memfilternya berdasarkan status saja.
- `src/lib/so-harian/rollover.ts` memilih sesi sebelumnya hanya berdasarkan tanggal.
- `src/lib/so-harian/storageService.ts` belum memiliki field `region` pada
  `SOSession`; ID sesi dibuat di `StockOpnameView`.
- Tabel `so_sessions` saat ini tidak memiliki kolom `region` dan berisi 0 baris.
  Kolom yang ada: `id, tanggal, gudang, petugas, total_items, item_match,
  item_minus, item_plus, item_selisih, akurasi_persen, status, created_at,
  updated_at`.
- `src/components/distribution/RoManagerView.tsx` mengambil stok SO terbaru
  lintas region lewat `/api/so/stock` dan `getAllSessionsSync()`.

## 4. Arsitektur

```
Profil pengguna (allowedRegion)
        |
        v
StockOpnameView  --- region aktif --->  UploadSection (remount per region)
        |                                   |
        |                                   +--> /api/stock-opname/pr-ready-items?region=...
        |                                   +--> /api/stock-opname/sla-items?region=...
        |                                   +--> Surat Jalan (filter region di klien)
        |
        +--> storageService (localStorage + /api/so/sessions)
        +--> rollover per region
        +--> HistorySection (filter region)
```

- Region adalah properti sesi, bukan filter tampilan.
- Mengganti region me-remount `UploadSection` (`key={region}`) sehingga data
  yang belum dikompilasi tidak tercampur.
- Tidak ada perubahan pada alur login, RLS, atau formula stok.

## 5. Data Model

### 5.1 Tipe dan helper baru

File baru: `src/lib/so-harian/region.ts`

```ts
export type SoRegion = 'JABODETABEK' | 'KALBAR';

export const SO_REGIONS: SoRegion[] = ['JABODETABEK', 'KALBAR'];

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
```

Aturan:

- Slug: `JABODETABEK` → `jabodetabek`, `KALBAR` → `kalbar`.
- ID: `so-jabodetabek-2026-11-06`, `so-kalbar-2026-11-06`.
- ID lama `so-2026-11-06` dikenali sebagai `legacy: true`, `region: null`.
- `resolveSessionRegion` memprioritaskan kolom `region`, lalu parsing ID.

### 5.2 `SOSession`

Tambahkan `region?: SoRegion` pada `SOSession` di
`src/lib/so-harian/storageService.ts`.

### 5.3 Migration Supabase

File baru: `supabase/so-region.sql`

```sql
alter table public.so_sessions
  add column if not exists region text;

create index if not exists so_sessions_region_tanggal_idx
  on public.so_sessions (region, tanggal desc);

comment on column public.so_sessions.region is
  'JABODETABEK atau KALBAR. NULL untuk sesi lama sebelum pemisahan region.';
```

- Kolom nullable agar baris lama aman.
- Tidak ada backfill otomatis; baris lama tetap `NULL` dan diperlakukan sebagai
  sesi lama.
- `so_details` tidak berubah karena sudah terhubung lewat `session_id`.

## 6. Penentuan Region

### 6.1 Region otomatis

`StockOpnameView` memakai `useAuth()`:

- `isRegionLocked === true` → region aktif = `allowedRegion`, tanpa pemilih.
- `isRegionLocked === false` → region aktif dapat dipilih.

### 6.2 Pemilih region

- Memakai `AreaFilterPills` yang sudah ada dengan tambahan prop
  `allowAll?: boolean` (default `true`).
- Untuk SO: `allowAll={false}`, `syncUrl={false}`. URL `?region=` diperbarui
  oleh `StockOpnameView` setelah konfirmasi, bukan oleh komponen pil.
- Pilihan region disimpan di URL `?region=` dan di `localStorage`
  (`so_active_region`), sehingga bertahan setelah reload.
- Jika tidak ada URL/profil/nilai tersimpan, default `JABODETABEK`.
- Saat berpindah region dan `items.length > 0`, tampilkan konfirmasi bahwa data
  yang belum disimpan akan ditinggalkan. Jika dibatalkan, region tidak berubah.

### 6.3 Halaman

`src/app/stock-opname/page.tsx` membaca `searchParams` (Promise pada Next.js
versi ini) dan meneruskan `region` sebagai `initialRegion` ke
`StockOpnameView`.

## 7. Sesi, Simpan, dan Rollover

### 7.1 ID sesi

- Saat region/tanggal berubah, `sessionData.id` dihitung ulang dengan
  `buildSoSessionId(region, tanggal)`.
- `handleSaveSession` memakai ID tersebut. Sesi dengan tanggal+region sama
  di-upsert; region lain tidak tersentuh.

### 7.2 `storageService`

- `saveSession` menyertakan `region` di payload lokal dan payload
  `POST /api/so/sessions`.
- `getAllSessions(region?)` dan `getAllSessionsSync(region?)` memfilter hasil
  berdasarkan `resolveSessionRegion`.
- `loadSession` tidak berubah; region dibaca dari sesi yang dikembalikan.
- `pickPreviousSession(sessions, currentDate, region)` hanya memilih sesi
  dengan region sama dan tanggal lebih lama.

### 7.3 Rollover

- `StockOpnameView` memuat sesi sebelumnya setelah region aktif diketahui.
- `effect` bergantung pada `sessionData.tanggal` dan region aktif.
- Sesi lama tanpa region tidak pernah menjadi sumber rollover.

## 8. Stok Awal per Region

### 8.1 Konfigurasi URL

`DEFAULT_SHEET_URLS` diubah menjadi per region:

```ts
type SoSheetType = 'PENERIMAAN' | 'PERALATAN' | 'PERLENGKAPAN' | 'RO';
type SoSheetUrls = Record<SoRegion, Record<SoSheetType, string>>;
```

Prioritas KALBAR:

```
NEXT_PUBLIC_SO_SHEET_<TYPE>_KALBAR_URL
  ?? NEXT_PUBLIC_SO_SHEET_<TYPE>_URL
  ?? fallback lama
```

Prioritas JABODETABEK:

```
NEXT_PUBLIC_SO_SHEET_<TYPE>_JABO_URL
  ?? fallback JABO
```

Fallback yang sekarang dipakai (menjadi default KALBAR):

- Penerimaan:
  `https://docs.google.com/spreadsheets/d/1neWHHRIjYm3Q4gsoV6Id258jcj5QvOFwhS84PMJL0lE/edit?gid=352107216#gid=352107216`
- Peralatan:
  `https://docs.google.com/spreadsheets/d/1fiRhYHPDgSadKIDLlnqyD9K-ZBXg2_3vlyqI-4jdNfc/edit?gid=1727080084#gid=1727080084`
- Perlengkapan:
  `https://docs.google.com/spreadsheets/d/1fiRhYHPDgSadKIDLlnqyD9K-ZBXg2_3vlyqI-4jdNfc/edit?gid=1129207194#gid=1129207194`

Fallback JABODETABEK:

- Peralatan:
  `https://docs.google.com/spreadsheets/d/1fiRhYHPDgSadKIDLlnqyD9K-ZBXg2_3vlyqI-4jdNfc/edit?gid=1721157388#gid=1721157388`
- Perlengkapan Tetap:
  `https://docs.google.com/spreadsheets/d/1fiRhYHPDgSadKIDLlnqyD9K-ZBXg2_3vlyqI-4jdNfc/edit?gid=737037942#gid=737037942`
- Penerimaan: `''` (memakai PR Ready Stock; link manual opsional)

Catatan: master JABO memakai dokumen yang sama dengan KALBAR tetapi **gid
berbeda**, sehingga keduanya tetap terpisah. Kolom yang terverifikasi:
`SKU, Nama Item Barang, Akun, Jumlah, Harga, Total, Status`.

Tab Perlengkapan JABO sempat memiliki kolom `Satuan` tak berlabel sehingga qty
terbaca 0. Per **2026-11-06** sheet sudah diperbaiki dan diverifikasi: baris
header dan data sama-sama 8 kolom, `Jumlah` berisi angka (mis. `66`), dan kolom
tambahan di kanan (`0`, `Aktif`) diabaikan parser. Tidak diperlukan heuristik
pergeseran kolom; parser `fetch-sheet` yang ada sudah membaca qty dengan benar.

### 8.2 Penyimpanan lokal

- Key baru: `so_sheet_urls_v2`, bentuk
  `{ JABODETABEK: {...}, KALBAR: {...} }`.
- Migrasi sekali: jika `so_sheet_urls_v2` belum ada, isi dari `so_sheet_urls`
  lama ke **KALBAR**, lalu isi JABODETABEK dari ENV/default JABO.
- Key lama tidak dihapus agar bisa dipulihkan manual.

### 8.3 UI

Semua URL bersifat per region dan hanya menampilkan nilai region aktif:

| Kartu | Field |
|---|---|
| Penerimaan Harian | Link Penerimaan |
| Stok Awal: Peralatan | Link Peralatan |
| Stok Awal: Perlengkapan | Link Perlengkapan |
| RO (mode Link) | Link RO |

- Label region ditampilkan jelas, mis. "Stok Awal: Peralatan — KALBAR".
- Kedua region sudah memiliki default link master, sehingga field terisi saat
  pertama dibuka. Peringatan di bawah hanya muncul bila field dikosongkan.
- Jika URL region aktif kosong:
  - Input menampilkan placeholder.
  - Muncul peringatan "Master <REGION> belum disiapkan".
  - Kompilasi tetap diizinkan bila ada RO/Penerimaan, dengan `stok_awal = 0`
    untuk SKU yang tidak punya carry-forward.

## 9. Penerimaan dan RO per Region

### 9.1 Penerimaan (PR Ready Stock)

- `GET /api/stock-opname/pr-ready-items?region=JABODETABEK|KALBAR|ALL`
  (default `ALL` untuk kompatibilitas).
- Server memfilter `asset_requests` memakai `matchesRegion(it.region, region)`
  sebelum `extractPrReadyStockItemsForSo`.
- `handleFetchFromPrReadyStock` mengirim region aktif.
- Mode `FILE` dan `LINK` tetap ada; datanya melekat pada region aktif karena
  `UploadSection` di-remount saat region berubah.
- Link Penerimaan mengikuti konfigurasi URL per region.

### 9.2 RO

- `GET /api/stock-opname/sla-items?filter=...&region=...` memfilter
  `ro.region` sebelum item diproses.
- `handleFetchFromSuratJalan` memfilter `sj.region` dengan `matchesRegion`.
- Mode `FILE` dan `LINK` RO mengikuti region aktif.
- Auto-fetch awal memakai region aktif (efek berjalan saat remount).

### 9.3 Dampak ke Kelola RO

- `GET /api/so/stock?region=JABODETABEK|KALBAR` memilih sesi terbaru untuk
  region tersebut.
- `RoManagerView` mengirim region yang sedang dipilih dan memfilter sesi lokal
  dengan region yang sama, sehingga stok SO tidak tertukar antar region.
- Sebelum migration dijalankan, route mencoba query dengan `region`; bila kolom
  belum ada, query diulang tanpa `region` lalu hasilnya difilter dari ID sesi.

## 10. Riwayat, Cetak, dan Ekspor

### 10.1 Riwayat

- `HistorySection` menerima prop `region` dan hanya menampilkan sesi region itu.
- Tambahkan badge/kolom region.
- Sesi lama tanpa region ditampilkan di bagian terpisah yang bisa dibuka
  ("Sesi lama tanpa region"), beserta keterangan bahwa sesi tersebut tidak
  dipakai rollover.

### 10.2 Cetak dan Excel

- `ReportPrintView` menampilkan baris **Region**.
- `exportSoReportToExcel` menambahkan baris **Region** pada sheet Ringkasan.
- Nama file unduhan menyertakan region.

### 10.3 Audit

- Detail audit menyertakan region:
  `Stock Opname <REGION> <tanggal> — <n> item, status <status>`.

## 11. API dan Kompatibilitas

| Endpoint | Perubahan |
|---|---|
| `POST /api/so/sessions` | Menyimpan `region`; derive dari ID bila payload tidak mengirimnya |
| `GET /api/so/stock` | Menerima `?region=`; fallback tanpa kolom `region` |
| `GET /api/stock-opname/pr-ready-items` | Menerima `?region=` |
| `GET /api/stock-opname/sla-items` | Menerima `?region=` |

Aturan kompatibilitas:

- Client lama yang tidak mengirim `region` tetap diterima; region diambil dari
  ID sesi jika bisa diparsing, selain itu `NULL`.
- `/api/so/sessions` mencoba `upsert` dengan `region`. Jika error menyebut
  kolom `region` tidak ada, ulangi tanpa `region` dan tulis peringatan log.
- Semua route tetap `dynamic = 'force-dynamic'` dan memakai service role.

## 12. Error Handling

| Kondisi | Perilaku |
|---|---|
| Kolom `region` belum ada | Simpan tetap berhasil tanpa region; filter memakai ID sesi |
| Master region kosong | Peringatan di UI; kompilasi tetap bisa dari RO/Penerimaan |
| PR Ready Stock region kosong | Pesan "Belum ada item PR Ready Stock untuk region X" |
| Monitoring SLA region kosong | Pesan serupa, menyebut region |
| Ganti region dengan item belum disimpan | Konfirmasi; batal berarti region tetap |
| Sesi lama tanpa region | Hanya tampil di bagian "Sesi lama"; tidak ikut rollover |
| Gagal simpan cloud | Perilaku lama: tetap lokal + toast peringatan |

## 13. Testing

Unit test baru/updated:

1. `src/lib/so-harian/region.test.mjs`
   - Normalisasi `JABO`, `JABODETABEK`, `KALBAR`, `ALL`, kosong.
   - `buildSoSessionId` dan `parseSoSessionId` untuk dua region + ID legacy.
   - `resolveSessionRegion` memakai kolom lalu ID.
   - `filterSessionsByRegion` tidak mencampur region.
2. `src/lib/so-harian/rollover.test.mjs`
   - `pickPreviousSession` mengabaikan sesi region lain.
   - Sesi tanggal sama tidak dipakai.
3. Test filter PR/SLA (fungsi murni) memakai `matchesRegion`.
4. Verifikasi manual parser master:
   - Tarik master JABO Perlengkapan; qty terbaca > 0 (bukan 0) dan jumlah item
     wajar.
   - Tarik master JABO Peralatan dan kedua master KALBAR; qty tidak berubah
     dari perilaku sebelumnya.

Verifikasi manual:

1. KALBAR dan JABODETABEK: master langsung terisi dari link default masing-masing
   region; nilai tidak saling tertukar. Khusus JABO Perlengkapan, qty harus
   terbaca > 0 (mis. `66`), bukan 0.
2. Tarik PR Ready Stock di JABO dan KALBAR; jumlah/isi berbeda dan sesuai region.
3. Tarik Monitoring SLA di kedua region; tidak ada RO region lain yang masuk.
4. Simpan sesi JABO dan KALBAR pada tanggal yang sama → dua baris `so_sessions`
   dengan ID dan region berbeda.
5. Rollover: sesi KALBAR kemarin tidak muncul sebagai stok awal JABO.
6. Riwayat hanya menampilkan region aktif; sesi lama ada di bagian terpisah.
7. `npx tsc --noEmit`, seluruh test suite, dan `npm run build`.

## 14. Rollout

1. Implementasi di branch `dev`.
2. Jalankan `supabase/so-region.sql` di Supabase SQL Editor.
3. Uji di lokal: kedua region memakai master default-nya masing-masing.
4. Uji simpan dua region dan rollover.
5. Setelah disetujui, merge `dev` → `main` dan deploy.

Deploy boleh dilakukan sebelum SQL dijalankan karena API memiliki fallback
tanpa kolom `region`; namun filter riwayat dari database baru optimal setelah
migration.

## 15. Di Luar Cakupan

- SO per outlet/cabang (hanya per region).
- Backfill otomatis sesi lama ke region tertentu.
- Penulisan balik ke Google Sheets.
- Perubahan formula `stok_sistem = stok_awal + penerimaan - RO`.
- Perubahan login, RLS, atau model izin pengguna.
- Migrasi data `so_details`.