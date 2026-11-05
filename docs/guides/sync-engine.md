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

## Hasil verifikasi

- Unit test: **146 test lulus** (`node --test "src/lib/**/*.test.mjs"`).
- `npx tsc --noEmit`: lulus.
- `npm run build`: lulus.
- Dry-run lokal (`GET /api/sync?dryRun=1`): HTTP 200, status `SUCCESS`.
  - Aset: 47 baris (JABO 43, KALBAR 4).
  - RO: 1.430 baris dipindai, 1.424 item unik, 765 dokumen RO.
  - Master katalog: 2.384 item.
- Tanpa cookie/token: HTTP 401.
- Apply dev (non-dry-run): **belum dijalankan** karena `supabase/sync-engine.sql` menunggu persetujuan.
- Uji lock: belum dijalankan (butuh tabel `sync_runs`).

## Catatan operasional

- Jangan menjalankan dua sync manual saat cron sedang berjalan.
- Jika status `PARTIAL`, periksa sumber yang gagal di halaman `/sync`.
- Baris stale tetap tampil di aplikasi sampai fitur filter stale diaktifkan.
- Migration hanya dijalankan sekali; aman diulang karena memakai `IF NOT EXISTS`.
- Sebelum migration dijalankan, endpoint status/riwayat akan mengembalikan pesan
  "Tabel sync engine belum tersedia". Dry-run tetap aman karena tidak menyentuh tabel.