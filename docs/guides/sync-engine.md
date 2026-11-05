# Panduan Operasional Sync Engine

## Urutan deploy

1. Review `supabase/sync-engine.sql`.
2. Jalankan migration di Supabase SQL Editor setelah disetujui.
3. Isi `SYNC_TOKEN` dan `CRON_SECRET` di Vercel.
4. Deploy `main`.
5. Pastikan cron `/api/sync` muncul di Vercel → Settings → Cron Jobs.

## Pemicu

- Manual: tombol di `/sync` atau "Sync Data" di header.
- Cron: setiap hari 19.00 UTC = 02.00 WIB (hanya berjalan di deployment Vercel).
- Webhook: `POST /api/sync` dengan header `x-sync-token` dan body
  `{"trigger":"WEBHOOK"}`. Pemicu ini di-debounce 5 menit.

Tidak ada sync otomatis di lingkungan lokal (`npm run dev`): penjadwal hanya
ada di Vercel Cron. Agar baris baru langsung masuk setelah sheet diedit,
pasang webhook Apps Script (contoh skrip ada di halaman `/sync`), buat trigger
`On edit`/`On change` untuk fungsi tersebut, dan isi env `SYNC_TOKEN` di server.
Tanpa `SYNC_TOKEN`, webhook akan ditolak `401`.
Frekuensi cron dapat dinaikkan di `vercel.json` bila paket Vercel mengizinkan.

## Dry-run

`GET /api/sync?dryRun=1` atau toggle dry-run di `/sync`.

Dry-run tidak mengubah tabel bisnis, Storage, cache katalog, atau riwayat run.

## Troubleshooting

- `401` → token/cookie/CRON_SECRET tidak cocok.
- `409` → masih ada run aktif; tunggu maksimal 15 menit.
- `PARTIAL` → sebagian sumber gagal; lihat detail di `/sync`.
- Baris hilang dari sheet → menjadi `is_stale = true`, tidak dihapus.

## Hasil verifikasi

- Unit test: **152 test lulus** (`node --test "src/lib/**/*.test.mjs"`).
- `npx tsc --noEmit`: lulus.
- `npm run build`: lulus.
- Dry-run lokal (`GET /api/sync?dryRun=1`): HTTP 200, status `SUCCESS`.
  - Aset: 47 baris (JABO 43, KALBAR 4).
  - RO: 1.430 baris dipindai, 1.424 item unik, 765 dokumen RO.
  - Master katalog: 2.384 item.
- Tanpa cookie/token: HTTP 401.
- Migration `supabase/sync-engine.sql` sudah dijalankan; `/api/sync/status` dan
  `/api/sync/history` mengembalikan HTTP 200.
- Apply dev (non-dry-run) lulus: run `SUCCESS`, 3/3 sumber sukses, riwayat
  `sync_runs` dan `sync_run_sources` terisi.
  - Aset: 47 baris stabil, `is_stale = 0`, `last_seen_at` terisi semua.
  - RO: 765 dari 769 baris cocok dengan sheet (`last_seen_at` terisi), 4 baris
    yang tidak ada lagi di sheet ditandai `is_stale = true` dan tidak dihapus.
  - Progres manual RO tetap 64 baris sebelum dan sesudah sync.
  - Master katalog: 2.384 item disegarkan.
- Uji lock (dua `POST /api/sync` paralel): satu `200 SUCCESS`, satu
  `409` dengan `reason: "locked"`.
- Endpoint lama tetap kompatibel:
  - `POST /api/items/sync-sheet` → `success`, 2.384 item, dependensi aset ikut segar.
  - `POST /api/distribution/ro/sync-sheet` → bentuk respons lama utuh, audit log tertulis.
- Sync ulang tanpa perubahan sheet melaporkan `newOrdersAdded = 0`,
  `existingOrdersUpdated = 0`, dan tidak menandai stale.

## Catatan operasional

- Jangan menjalankan dua sync manual saat cron sedang berjalan.
- Jika status `PARTIAL`, periksa sumber yang gagal di halaman `/sync`.
- Baris stale tetap tampil di aplikasi sampai fitur filter stale diaktifkan.
- Sync RO dengan filter tanggal tidak menandai baris di luar rentang sebagai stale.
- Sync ulang saat isi sheet belum berubah tidak menulis ulang data dan tidak menandai stale.
- Migration hanya dijalankan sekali; aman diulang karena memakai `IF NOT EXISTS`.
- Sebelum migration dijalankan, endpoint status/riwayat akan mengembalikan pesan
  "Tabel sync engine belum tersedia". Dry-run tetap aman karena tidak menyentuh tabel.