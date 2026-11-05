# Sync Engine HANTARAN — Desain

- Tanggal: 2026-11-05
- Status: menunggu review
- Pemilik: Dashboard CA

## 1. Latar belakang

Saat ini sinkronisasi Google Sheets → Supabase tersebar di beberapa tempat:

- `syncGoogleSheetsToSupabase()` dan `syncRequestOrdersFromSheet()` di `src/lib/supabase/server.ts`, dipanggil `/api/sync`.
- `syncMasterAssetCatalogFromSheet()` di file yang sama, dipanggil `/api/items/sync-sheet`.
- `/api/distribution/ro/sync-sheet` memanggil ulang RO sync dengan opsi filter.
- Pemicu tersebar: tombol di `/sync`, tombol di Navbar, tabel aset, webhook Apps Script, dan tidak ada jadwal otomatis.
- Hanya sync aset yang menulis `sync_logs`; RO dan katalog tidak punya riwayat terpusat.
- Tidak ada lock, sehingga dua pemicu bersamaan bisa saling menimpa.
- Tidak ada mekanisme menandai baris yang sudah hilang dari spreadsheet.

Akibatnya operasi sync sulit dipantau, rawan dobel, dan status yang diubah di HANTARAN berisiko tertimpa.

## 2. Tujuan

Membangun satu engine sync terpusat dengan alur:

```
Google Sheets → Sync Engine → Supabase → Aplikasi HANTARAN
```

Engine harus:

1. Menyatukan ketiga kelompok sumber data yang sudah ada.
2. Mencegah dua sync berjalan bersamaan.
3. Menyimpan status dan riwayat setiap sumber per eksekusi.
4. Mendukung dry-run tanpa menulis ke database.
5. Menjaga data yang diubah di HANTARAN agar tidak ditimpa spreadsheet.
6. Menandai baris yang hilang dari spreadsheet sebagai `stale`, bukan menghapusnya.
7. Bisa dipicu manual, cron harian, dan webhook Apps Script.

## 3. Non-goals

- Tidak menulis balik ke Google Sheets. Sync bersifat **satu arah**: Sheet → Supabase.
- Tidak menghapus baris saat baris hilang dari spreadsheet.
- Tidak memecah seluruh parser di `server.ts` (dilakukan bertahap setelah engine stabil).
- Tidak mengganti Google Sheets sebagai sumber input utama.
- Tidak menyediakan sync per sel real-time.

## 4. Keputusan yang sudah disepakati

| Topik | Keputusan |
|---|---|
| Cakupan | Menyatukan sync yang sudah ada |
| Pemicu | Manual + cron harian + webhook Apps Script |
| Konflik | Data HANTARAN menang; baris hilang ditandai `stale` |
| Arah data | Satu arah, Sheet → Supabase |
| Status HANTARAN | Cukup tersimpan di Supabase, tidak dikirim balik ke sheet |
| Lokasi engine | Modul di aplikasi Next.js |
| Monitoring | Perluas halaman `/sync` |
| Pendekatan | Orchestrator + registry, memakai fungsi sync yang sudah ada |

## 5. Arsitektur

```
┌──────────────────────────────┐
│ Google Sheets                │
│ - Aset JABO / KALBAR         │
│ - RO JABO / KALBAR           │
│ - Master Aset                │
└──────────────┬───────────────┘
               │ fetch CSV (no-store)
               ▼
┌──────────────────────────────┐
│ Sync Engine                  │
│ src/lib/sync-engine/         │
│  - registry + dependensi     │
│  - runner + lock             │
│  - policy merge/stale        │
│  - history                   │
└──────────────┬───────────────┘
               │ service role
               ▼
┌──────────────────────────────┐
│ Supabase                     │
│ - asset_requests             │
│ - request_orders             │
│ - sync_runs / sync_run_src   │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ HANTARAN                     │
│ /sync, /items, /distribution │
└──────────────────────────────┘
```

Engine berjalan di runtime Node.js yang sama dengan aplikasi. Tidak ada service worker terpisah.

## 6. Registry sumber

Setiap sumber didefinisikan sebagai `SyncSource`:

```ts
interface SyncSource {
  key: 'asset-requests' | 'request-orders' | 'master-catalog';
  label: string;
  dependsOn: string[];
  run(ctx: SyncContext): Promise<SourceRunResult>;
}

interface SourceRunResult {
  success: boolean;
  rowsFetched: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsStale: number;
  durationMs: number;
  message?: string;
  details?: Record<string, unknown>;
}
```

| Key | Sumber | Tujuan | Dependensi |
|---|---|---|---|
| `asset-requests` | Sheet JABO + KALBAR | `asset_requests` | — |
| `request-orders` | Sheet RO JABO + KALBAR | `request_orders` | — |
| `master-catalog` | Sheet Master Aset + supplement RO/DB | cache katalog + Storage | `asset-requests` |

Urutan eksekusi mengikuti dependensi. `master-catalog` selalu berjalan setelah `asset-requests`.

## 7. Alur satu eksekusi

1. Terima permintaan: `sources[]`, `dryRun`, `force`, `trigger`, aktor.
2. Validasi sumber yang diminta.
3. Ambil lock dengan menyisipkan baris `sync_runs` berstatus `RUNNING`.
   - Jika sudah ada `RUNNING` yang masih aktif (<15 menit), tolak dengan `409` dan pesan "sync sedang berjalan".
   - Baris `RUNNING` yang lebih tua dari 15 menit dianggap kedaluwarsa: engine menandainya `FAILED` dengan pesan "run kedaluwarsa", baru menyisipkan run baru.
4. Jalankan sumber sesuai urutan dependensi.
   - Jika sumber dependensi gagal, sumber turunannya ditandai `SKIPPED` (bukan `FAILED`) dan alasannya dicatat.
5. Setiap sumber menulis satu baris `sync_run_sources`.
6. Setelah semua selesai, perbarui `sync_runs`: `SUCCESS`, `PARTIAL`, atau `FAILED`.
7. Kembalikan hasil agregat + hasil per sumber.

Kegagalan satu sumber tidak menghentikan sumber lain yang tidak bergantung padanya. Status run menjadi `PARTIAL` bila ada yang gagal tetapi ada yang berhasil.

## 8. Kebijakan data

### 8.1 Satu arah

Engine tidak pernah menulis ke Google Sheets. Perubahan status, PIC, catatan, tanggal, dan field operasional lain dari HANTARAN hanya disimpan di Supabase.

### 8.2 Field yang dilindungi

Untuk `asset_requests`, field yang diubah dari dashboard dipertahankan saat sync:

- `item_delivery_status`
- `stock_status`
- `pic_receiver`
- `notes`
- `procurement_status`
- `pr_datetime`
- `po_date`
- `received_date`
- `order_datetime`
- `vendor_name`
- `is_system_transfer`

Mekanisme yang ada (`is_manually_edited` + `mergeManualAssetEdit`) tetap dipakai. Engine tidak boleh melonggarkan aturan ini.

Untuk `request_orders`, `mergeRoForSync` yang ada tetap dipakai sehingga status, tahap workflow, catatan, item, dan tanggal hasil update user tidak kembali ke nilai sheet.

### 8.3 Baris stale

Kolom baru pada `asset_requests` dan `request_orders`:

- `last_seen_at TIMESTAMPTZ` — kapan baris terakhir muncul di sheet.
- `is_stale BOOLEAN DEFAULT FALSE` — true bila baris tidak lagi muncul di sheet.

Aturan:

1. Saat upsert, set `last_seen_at = waktu mulai run` dan `is_stale = false`.
2. Setelah run sumber selesai dan **semua region** berhasil diunduh, baris dengan `source_type = 'GOOGLE_SHEET'` (RO) atau `external_id LIKE 'JABO-ROW-%' / 'KALBAR-ROW-%'` (aset) yang `last_seen_at < waktu mulai run` ditandai `is_stale = true`.
3. Bila salah satu region gagal diunduh, penandaan stale dilewati untuk region tersebut.
4. Baris stale tidak dihapus dan tetap bisa dibaca; UI dapat menyaringnya nanti.
5. Dry-run tidak mengubah `last_seen_at` maupun `is_stale`.

Untuk `master-catalog`, katalog dibangun ulang setiap run; tidak ada flag stale karena katalog adalah cache, bukan tabel. Saat dry-run, katalog dihitung tetapi cache yang sedang dipakai tidak diganti.

### 8.4 Manual edit

Jika user mengubah status di HANTARAN, field tersebut menang. Sync berikutnya mempertahankan nilai dashboard meskipun sheet masih berisi nilai lama.

## 9. Skema database

File baru: `supabase/sync-engine.sql`.

```sql
-- Kolom penanda baris yang masih ada di sheet
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

-- Satu baris per eksekusi engine
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  trigger TEXT NOT NULL,              -- MANUAL | CRON | WEBHOOK
  status TEXT NOT NULL DEFAULT 'RUNNING', -- RUNNING | SUCCESS | PARTIAL | FAILED
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  actor_name TEXT,
  total_sources INTEGER NOT NULL DEFAULT 0,
  ok_sources INTEGER NOT NULL DEFAULT 0,
  failed_sources INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  message TEXT
);

-- Cegah dua run aktif bersamaan
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sync_runs_running
  ON public.sync_runs(status) WHERE status = 'RUNNING';

-- Detail per sumber
CREATE TABLE IF NOT EXISTS public.sync_run_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  status TEXT NOT NULL,               -- SUCCESS | FAILED | SKIPPED
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
```

Catatan: unique partial index pada `status = 'RUNNING'` hanya mengizinkan satu baris. Karena itu, run yang gagal diperbarui ke status akhir di blok `finally`, termasuk saat proses dibatalkan.

## 10. API

### 10.1 `POST/GET /api/sync`

Pintu utama engine. Kompatibel dengan pemanggil lama.

Input:

```json
{
  "sources": ["asset-requests", "request-orders"],
  "dryRun": false,
  "force": false,
  "trigger": "MANUAL"
}
```

- Tanpa `sources` berarti semua sumber.
- `dryRun=true` menjalankan fetch dan perhitungan, tetapi tidak menulis ke Supabase maupun Storage.
- `force=true` mengabaikan short-circuit hash untuk aset.
- `rowsInserted` / `rowsUpdated` untuk sumber lama bersifat best-effort: fungsi legacy melaporkan jumlah baris yang ditulis, bukan selisih insert/update yang presisi.
- Respons berisi agregat run + array hasil per sumber.
- Status HTTP: `200` sukses/partial, `401` tidak berwenang, `409` sync sedang berjalan, `500` gagal total.

### 10.2 `GET /api/sync/status`

Mengembalikan:

- run terakhir,
- status terakhir per sumber,
- apakah saat ini ada run `RUNNING`.

### 10.3 `GET /api/sync/history?limit=20`

Mengembalikan daftar run terbaru beserta detail sumber. Default 20, maksimal 100.

### 10.4 Endpoint lama

`/api/items/sync-sheet` dan `/api/distribution/ro/sync-sheet` tetap tersedia untuk kompatibilitas. Keduanya memanggil source runner yang sama sehingga lock, riwayat, dan audit konsisten.

## 11. Autentikasi

`isSyncRequestAllowed` diperluas:

1. `x-sync-token` atau `?token=` sama dengan `SYNC_TOKEN`.
2. Cookie `ca_auth=true` untuk sesi dashboard.
3. `Authorization: Bearer <CRON_SECRET>` untuk Vercel Cron.

Webhook Apps Script tetap memakai `x-sync-token`.

## 12. Pemicu

| Pemicu | Cara | Catatan |
|---|---|---|
| Manual | Tombol di `/sync` | Bisa semua sumber atau per sumber, bisa dry-run |
| Cron | `vercel.json` → `0 19 * * *` | 02.00 WIB, setelah beban malam |
| Webhook | `POST /api/sync` dari Apps Script | Debounce 5 menit |

Debounce webhook: jika run non-dry-run terakhir dimulai <5 menit lalu, webhook mengembalikan `200` dengan `skipped: true` dan alasan `debounced`. Manual dan cron tidak terkena debounce.

Cron retensi audit yang sudah ada (`0 20 * * *`) tidak diubah.

## 13. UI `/sync`

Halaman `/sync` diperluas tanpa menghapus panduan setup yang ada:

1. **Kartu ringkasan** — status run terakhir, waktu, durasi, jumlah sumber OK/gagal, tombol Run All.
2. **Kartu per sumber** — nama, status terakhir, baris dibaca/ditulis/di-skip/stale, durasi, pesan error, tombol Run untuk sumber itu.
3. **Toggle dry-run** — berlaku untuk Run All dan Run per sumber. Hasil dry-run diberi label jelas.
4. **Indikator running** — tombol disable + spinner selama ada run aktif.
5. **Riwayat** — tabel 20 run terakhir: waktu, pemicu, status, sumber OK/gagal, durasi, aktor.
6. **Detail error** — pesan per sumber ditampilkan, tidak hanya di console.

Data diambil dari `/api/sync/status` dan `/api/sync/history`. Setelah run selesai, halaman memuat ulang status.

## 14. Penanganan error

- Fetch gagal per region: sumber ditandai `FAILED` atau `PARTIAL`, region lain tetap diproses.
- Supabase gagal saat upsert: chunk yang gagal dicatat, sisa chunk dihentikan untuk sumber itu, error disimpan di `sync_run_sources`.
- Run yang crash: status `RUNNING` diperbarui di `finally`; jika proses mati total, run kedaluwarsa setelah 15 menit.
- `sync_logs` lama tetap ditulis untuk sync aset agar halaman lama tidak rusak.
- Audit trail: sync manual mencatat `auditMutation` seperti perilaku sekarang; cron mencatat aktor `System`.

## 15. Testing

Unit test (tanpa database):

- Urutan sumber mengikuti `dependsOn`.
- Dry-run tidak memanggil operasi tulis.
- Perhitungan stale: region lengkap vs region gagal.
- Agregasi status: semua sukses → `SUCCESS`; sebagian gagal → `PARTIAL`; semua gagal → `FAILED`.
- Debounce webhook.
- Normalisasi input `sources` (tidak dikenal ditolak).
- Lock: run aktif menolak run kedua; run kedaluwarsa boleh digantikan.

Uji integrasi:

1. Dry-run semua sumber ke sheet asli; pastikan tidak ada perubahan baris di Supabase.
2. Apply di `dev`; bandingkan jumlah baris sebelum/sesudah.
3. Ubah status satu aset di HANTARAN, jalankan sync, pastikan status tidak kembali.
4. Hapus satu baris dari salinan sheet uji, jalankan sync, pastikan baris menjadi `is_stale = true` dan tidak terhapus.
5. Jalankan dua sync bersamaan; pastikan yang kedua mendapat `409`.
6. Periksa `sync_runs` dan `sync_run_sources` terisi benar.
7. Uji tombol Run All, Run per sumber, dry-run, dan riwayat di `/sync`.

## 16. Rollout

1. Review desain ini.
2. Terapkan `supabase/sync-engine.sql` di Supabase (butuh persetujuan eksplisit karena mengubah skema).
3. Implementasi di branch `dev`.
4. Jalankan test + `tsc --noEmit` + `npm run build`.
5. Uji dry-run dan apply di `dev`.
6. Merge ke `main` setelah disetujui.
7. Aktifkan cron setelah deploy; pastikan `CRON_SECRET` dan `SYNC_TOKEN` sudah diisi di Vercel.

## 17. Risiko

| Risiko | Mitigasi |
|---|---|
| Refactor memecahkan sync yang sudah jalan | Orchestrator memakai fungsi lama; perilaku mapping tidak diubah |
| Webhook memicu sync terlalu sering | Debounce 5 menit + short-circuit hash |
| Baris salah ditandai stale | Stale hanya jika semua region berhasil; dry-run tidak menulis |
| Dua run bersamaan | Unique partial index + validasi 15 menit |
| `server.ts` tetap besar | Ekstraksi parser menjadi fase terpisah setelah engine stabil |
| Master catalog hanya di memori | Katalog dibangun ulang tiap run; tidak ada data permanen yang hilang |

## 18. Kriteria penerimaan

- [ ] Satu endpoint `/api/sync` menjalankan ketiga sumber dengan hasil per sumber.
- [ ] Manual, cron, dan webhook memakai engine yang sama.
- [ ] Dua run bersamaan ditolak dengan `409`.
- [ ] Run yang kedaluwarsa ditandai `FAILED` sebelum run baru dibuat.
- [ ] Sumber turunan menjadi `SKIPPED` bila dependensinya gagal.
- [ ] Dry-run tidak mengubah data apa pun.
- [ ] Status yang diubah di HANTARAN tetap setelah sync.
- [ ] Baris yang hilang dari sheet menjadi `is_stale = true`, tidak terhapus.
- [ ] `sync_runs` dan `sync_run_sources` terisi untuk setiap eksekusi.
- [ ] Halaman `/sync` menampilkan status per sumber, riwayat, dan tombol run.
- [ ] Endpoint lama tetap berfungsi.
- [ ] Unit test, `tsc --noEmit`, dan `npm run build` lulus.