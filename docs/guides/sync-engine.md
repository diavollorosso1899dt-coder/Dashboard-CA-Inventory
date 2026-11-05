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