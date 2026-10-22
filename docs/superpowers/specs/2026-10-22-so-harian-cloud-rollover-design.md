# SO Harian Cloud Storage & Daily Rollover — Design

Tanggal: 2026-10-22
Status: Disetujui untuk implementasi
Pendekatan: A — Supabase sebagai sumber data bersama + API server

## 1. Tujuan

1. Data SO Harian disimpan di server (Supabase), bukan hanya `localStorage`, sehingga:
   - Modal **Kelola RO → Pilih Proses** menampilkan stok gudang yang benar, di device mana pun.
   - Riwayat SO tidak hilang saat browser/device berganti.
2. Rollover harian otomatis: hasil SO hari ini menjadi **stok awal** sesi berikutnya, berulang setiap hari.
3. Data lokal lama dapat dimigrasikan sekali lewat tombol.

## 2. Keputusan yang Disetujui

| Topik | Keputusan |
|---|---|
| Nilai closing stock | `qty_fisik` bila sudah dihitung; jika tidak, `stok_sistem` |
| Sesi sumber rollover | Hanya sesi berstatus **COMPLETED** |
| Data lokal lama | Migrasi manual via tombol "Unggah sesi lokal ke server" |
| Jumlah gudang | Satu gudang (`Gudang Utama`); baseline global |
| Stok untuk modal RO | `stok_sistem` dari sesi COMPLETED terakhir |

## 3. Kondisi Saat Ini

- `src/lib/so-harian/storageService.ts` menyimpan sesi + detail ke `localStorage`, dengan cloud sync **opsional** yang butuh konfigurasi manual (`CloudSettingsModal`) di `localStorage` (`so_harian_supabase_config`).
- Tabel `so_sessions` / `so_details` didokumentasikan di `DocViewerModal.tsx`, tetapi **belum ada di database** (`PGRST205`).
- `RoManagerView.tsx` (`fetchSoStock`) hanya membaca sesi lokal via `getAllSessionsSync()`, sehingga menampilkan "Stok SO: Belum terdata" pada device yang belum pernah menjalankan SO.
- `StockOpnameView.tsx` sudah menyiapkan rollover lokal: `previousSessionStock` dari sesi terakhir (`qty_fisik ?? stok_sistem`) dan `UploadSection` memakainya sebagai fallback `stok_awal` bila SKU tidak ada di sheet.
- `saveSession` menyimpan lokal lalu (jika terkonfigurasi) push ke Supabase. Sesi yang sama (`id = so-YYYY-MM-DD`) di-upsert.

## 4. Arsitektur

```
Browser (SO Harian)                    Browser (Kelola RO)
        |                                      |
        | POST/GET /api/so-harian/*            | GET /api/so-harian/baseline
        v                                      v
Next.js route handlers  --->  server-store.ts  --->  Supabase
   (admin client)                                  so_sessions / so_details
        ^
        |
localStorage (cache offline, tetap dipertahankan)
```

- **Server adalah sumber kebenaran.** `localStorage` menjadi cache/offline fallback.
- Semua akses tulis/baca memakai `getAdminClient()` di server, mengikuti pola route API yang sudah ada.
- Tidak ada perubahan pada alur login/otorisasi aplikasi.

## 5. Data Model

Tabel baru (menggantikan skema dokumentasi, ditambah kolom `lokasi` dan unique key):

```sql
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
  status VARCHAR(50) DEFAULT 'DRAFT',      -- DRAFT | IN_PROGRESS | COMPLETED
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
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, kode_barang)
);

CREATE INDEX IF NOT EXISTS idx_so_sessions_tanggal ON public.so_sessions(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_so_sessions_status ON public.so_sessions(status, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_so_details_session_id ON public.so_details(session_id);
```

Catatan: server membuat `id` deterministik `"{session.id}::{kode_barang}"` untuk setiap detail lalu upsert `onConflict: 'id'`; unique `(session_id, kode_barang)` menjaga integritas. Item dengan kode sama dalam satu payload di-dedupe (nilai terakhir menang).

## 6. API

Semua route `dynamic = 'force-dynamic'`, mengembalikan `{ success, data?, error? }`.

| Method & Path | Body / Query | Fungsi |
|---|---|---|
| `POST /api/so-harian/sessions` | `{ session, items }` | Upsert sesi + detail. 400 bila `session.id`/`tanggal` kosong atau `items` kosong. |
| `GET /api/so-harian/sessions` | `?limit=50` | Daftar sesi (terbaru dulu) tanpa detail. |
| `GET /api/so-harian/sessions/[id]` | — | Sesi + seluruh detail. 404 bila tidak ada. |
| `DELETE /api/so-harian/sessions/[id]` | — | Hapus sesi (cascade detail). |
| `GET /api/so-harian/baseline` | — | Sesi **COMPLETED** terakhir + detail ringkas. |
| `POST /api/so-harian/migrate` | `{ sessions: [{ session, items }] }` | Upsert batch untuk migrasi lokal. |

`GET /api/so-harian/baseline` mengembalikan:

```json
{
  "success": true,
  "data": {
    "session": { "id": "so-2026-10-21", "tanggal": "2026-10-21", "gudang": "Gudang Utama", "status": "COMPLETED" },
    "items": [
      { "kode_barang": "BRG-001", "nama_barang": "Mesin air jetpump", "satuan": "PCS", "stok_sistem": 4, "qty_fisik": 3 }
    ]
  }
}
```

Bila tidak ada sesi COMPLETED: `{ success: true, data: null }`.

## 7. Aturan Rollover

1. **Baseline** = sesi COMPLETED terakhir (urut `tanggal DESC`, lalu `updated_at DESC`).
2. **Closing stock** per SKU = `qty_fisik ?? stok_sistem` (0 bila keduanya null).
3. Saat kompilasi sesi baru:
   - `stok_awal` = nilai dari sheet yang diunggah bila ada;
   - jika SKU tidak ada di sheet → `stok_awal` = closing stock baseline;
   - SKU yang hanya ada di baseline tetap dimasukkan.
4. `stok_sistem = stok_awal + qty_penerimaan - qty_ro` (fungsi `calculateSystemStock` yang sudah ada).
5. Bila belum ada sesi COMPLETED, baseline kosong dan UI menampilkan info bahwa stok awal berasal dari sheet.
6. Tidak ada toggle manual: rollover selalu aktif. UI menampilkan banner sumber baseline (tanggal + jumlah SKU).

## 8. Perubahan Kode

### Baru
- `src/lib/so-harian/server-store.ts` — fungsi server: `upsertSession`, `listSessions`, `getSession`, `deleteSession`, `getLatestCompletedBaseline`, `migrateSessions`.
- `src/app/api/so-harian/sessions/route.ts` (GET, POST)
- `src/app/api/so-harian/sessions/[id]/route.ts` (GET, DELETE)
- `src/app/api/so-harian/baseline/route.ts` (GET)
- `src/app/api/so-harian/migrate/route.ts` (POST)

### Diubah
- `src/lib/so-harian/storageService.ts`
  - `saveSession`: tetap simpan lokal, lalu `POST /api/so-harian/sessions`; mengembalikan hasil sinkron (`synced: boolean`).
  - Tambah `fetchBaseline()` (memanggil API, fallback ke sesi COMPLETED lokal).
  - Tambah `pushLocalSessionsToServer()` untuk migrasi.
- `src/components/so-harian/StockOpnameView.tsx`
  - Muat baseline dari `fetchBaseline()` saat mount (bukan dari sesi lokal).
  - Setelah simpan, tampilkan peringatan bila sinkron server gagal.
  - Tambah tombol migrasi + dialog konfirmasi + hasil.
- `src/components/so-harian/UploadSection.tsx`
  - Ganti toggle "Gunakan hasil SO kemarin" menjadi banner informasi baseline (selalu dipakai).
- `src/components/so-harian/HistorySection.tsx`
  - Sumber daftar: `GET /api/so-harian/sessions`; fallback ke `getAllSessionsSync()`.
  - Aksi hapus memakai `DELETE /api/so-harian/sessions/[id]`, lalu hapus cache lokal.
- `src/components/distribution/RoManagerView.tsx`
  - `fetchSoStock` → `GET /api/so-harian/baseline`, fallback cache lokal.
  - Simpan `stok_sistem` per SKU; tampilkan tanggal sesi di tooltip.
  - Refresh otomatis saat event `ca_so_updated` (dipancarkan setelah simpan SO).

## 9. Sinkronisasi & Migrasi

- **Simpan sesi:** lokal dulu (cepat) → server. Jika server gagal: sesi tetap lokal, toast peringatan ("Tersimpan lokal; belum tersinkron, rollover belum melihat sesi ini").
- **Status `COMPLETED`** hanya bisa jadi baseline. Sesi IN_PROGRESS/DRAFT tetap tersimpan tetapi diabaikan rollover.
- **Migrasi:** tombol di tab Riwayat/Upload membaca semua sesi lokal (`getAllSessionsSync`), memuat detail tiap sesi, lalu `POST /api/so-harian/migrate`. Laporan: jumlah sesi berhasil/gagal. Upsert idempoten (aman diulang).
- Setelah migrasi sukses, server tetap sumber utama; cache lokal tidak dihapus.

## 10. Error Handling

| Kondisi | Perilaku |
|---|---|
| API/DB gagal saat load baseline | Fallback ke sesi COMPLETED lokal; banner peringatan |
| API/DB gagal saat simpan | Simpan lokal; toast peringatan; percobaan ulang saat migrasi/simpan berikutnya |
| Sesi kosong / id tidak valid | HTTP 400 dengan pesan jelas |
| Item duplikat dalam satu sesi | Upsert per `(session_id, kode_barang)`; item terakhir menang |
| Baseline tidak ada | `data: null`; UI menampilkan "Belum ada SO COMPLETED" |
| Sesi baseline dihapus | Baseline otomatis memakai COMPLETED berikutnya |
| `so_details` > 300 item | Batch upsert 300 per request (pola yang sudah ada) |

## 11. Testing / Verifikasi

1. Jalankan SQL di Supabase; pastikan kedua tabel + index + unique key ada.
2. Simpan sesi COMPLETED baru → cek baris di `so_sessions`/`so_details`.
3. `GET /api/so-harian/baseline` → mengembalikan sesi COMPLETED terakhir dan closing stock yang benar (`qty_fisik` diprioritaskan).
4. Kompilasi sesi baru → SKU tanpa stok awal di sheet memakai closing baseline; SKU dari sheet tidak tertimpa.
5. Buka modal RO → "Stok SO" menampilkan angka dari baseline (bukan "Belum terdata"), tooltip tanggal benar.
6. Migrasi sesi lokal → jumlah sesi/detail di server bertambah; ulangi migrasi → tidak ada duplikat.
7. Simulasikan API down → halaman SO tetap memakai cache lokal + banner; modal RO fallback.
8. `npx tsc --noEmit` (atau build) dan cek halaman di browser.

## 12. Rollout

1. Terapkan SQL (manual di Supabase SQL Editor; tidak ada migration runner di repo).
2. Deploy kode (API + client).
3. Buka SO Harian → klik "Unggah sesi lokal ke server" untuk mengisi baseline pertama.
4. Pastikan sesi pertama yang menjadi baseline berstatus COMPLETED.

## 13. Di Luar Cakupan

- Multi-gudang (baseline per gudang) — baseline saat ini global.
- Penulisan balik ke Google Sheets.
- Perubahan formula `stok_sistem` atau aturan RO/penerimaan.
- Autentikasi/RLS baru (mengikuti pola admin client aplikasi).
