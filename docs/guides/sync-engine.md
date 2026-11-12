# Panduan Operasional Sync Engine

## Urutan deploy

1. Review `supabase/sync-engine.sql`.
2. Jalankan migration di Supabase SQL Editor setelah disetujui.
3. Jalankan juga `supabase/ro-tombstones.sql` (daftar RO yang diblokir dari sync).
4. Isi `SYNC_TOKEN` dan `CRON_SECRET` di Vercel.
5. Deploy `main`.
6. Pastikan cron `/api/sync` muncul di Vercel → Settings → Cron Jobs.

## Pemicu

- Manual: tombol di `/sync`, "Sync Data" di header, atau "Tarik Spreadsheet RO" di Kelola RO.
- Otomatis dari UI: Kelola RO memeriksa `/api/sync/status` saat halaman dibuka atau
  tab kembali fokus. Bila sync RO terakhir sudah lebih dari 60 detik, halaman memanggil
  `/api/distribution/ro/sync-sheet` sekali. Poll 15 detik hanya membaca Supabase;
  ini pelengkap, bukan pengganti webhook/cron.
- Cron: setiap hari 19.00 UTC = 02.00 WIB (hanya berjalan di deployment Vercel).
- Webhook: `POST /api/sync` dengan header `x-sync-token` dan body
  `{"trigger":"WEBHOOK"}`. Pemicu ini di-debounce sesuai env
  `SYNC_WEBHOOK_DEBOUNCE_MINUTES` (default 5 menit; produksi memakai 1 menit).

Skrip Google Apps Script di halaman `/sync` menyediakan fungsi `pasangTrigger()`
yang memasang tiga trigger sekaligus: `On edit`, `On change`, dan timer 5 menit.
Timer tersebut adalah jaring pengaman bila satu kali edit terlewat atau webhook
sedang di-debounce. Jalankan `pasangTrigger()` sekali setelah mengisi
`WEBHOOK_URL` dan `SYNC_TOKEN`.

Tidak ada penjadwal di lingkungan lokal (`npm run dev`): penjadwal hanya ada di
Vercel Cron atau trigger Apps Script. Agar baris baru langsung masuk setelah sheet
diedit, pasang webhook Apps Script (contoh skrip ada di halaman `/sync`) dan isi
env `SYNC_TOKEN` di server. Tanpa `SYNC_TOKEN`, webhook akan ditolak `401`.
Frekuensi cron dapat dinaikkan di `vercel.json` bila paket Vercel mengizinkan.

## Tombstone (RO yang dihapus manual)

RO yang dihapus dari dashboard tidak boleh muncul lagi walau barisnya masih ada
di sheet. Penandanya disimpan di tabel `sync_tombstones` (migration
`supabase/ro-tombstones.sql`), bukan hanya di memori proses.

- Kunci disimpan dalam bentuk kanonik lewat `canonicalTombstoneKey()`:
  `RO-0005` → `0005`. Sync melewati baris dengan kunci yang cocok.
- Daftar dibaca sekali per sync dengan cache 30 detik (`loadTombstoneKeys`).
  Kalau tabel belum ada, sync tetap jalan tanpa filter dan hanya menulis
  peringatan di log.
- Halaman `/sync` menampilkan daftar blokir. Tombol **Pulihkan** menghapus
  penanda sehingga RO tersebut masuk lagi pada sync berikutnya.
- API: `GET /api/sync/tombstones`, `DELETE /api/sync/tombstones/<id>`.

## Dry-run

`GET /api/sync?dryRun=1` atau toggle dry-run di `/sync`.

Dry-run tidak mengubah tabel bisnis, Storage, cache katalog, atau riwayat run.

## Troubleshooting

- `401` → token/cookie/CRON_SECRET tidak cocok.
- `409` → masih ada run aktif; tunggu maksimal 15 menit.
- `200` dengan `skipped: true` dan alasan `debounced` → webhook masuk saat window
  debounce; timer 5 menit atau edit berikutnya akan menyusul.
- `PARTIAL` → sebagian sumber gagal; lihat detail di `/sync`.
- Baris hilang dari sheet → menjadi `is_stale = true`, tidak dihapus.
- Kelola RO menampilkan "Belum sync" atau jam sync lama → cek `/api/sync/status`;
  halaman akan mencoba auto-sync saat dibuka/fokus bila sync RO terakhir >60 detik.

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
- Uji webhook lokal (`POST /api/sync`, body `{"trigger":"WEBHOOK","sources":["request-orders"]}`):
  - Token salah → HTTP `401`.
  - Panggilan pertama → HTTP `200`, `status: "SUCCESS"`, `trigger: "WEBHOOK"`.
  - Panggilan kedua dalam 5 menit → HTTP `200`, `skipped: true`,
    `reason: "debounced"`, dan tidak membuat run baru.

## Memasang webhook produksi

1. Isi `SYNC_TOKEN` di Vercel → Settings → Environment Variables (Production),
   lalu redeploy. Opsional: `SYNC_WEBHOOK_DEBOUNCE_MINUTES=1` agar edit beruntun
   tidak banyak terlewat (cron harian tetap menjadi jaring pengaman).
2. Buka spreadsheet → Extensions → Apps Script, tempel skrip dari halaman
   `/sync` (`syncKeHantaran`), ganti `webhookUrl` dan `x-sync-token`.
3. Buat trigger: **Triggers → Add Trigger**, function `syncKeHantaran`,
   event source **From spreadsheet**, event type **On edit** (atau
   **On change** / **On form submit**), lalu setujui otorisasi.
4. Verifikasi di `/sync`: run baru harus bertanda `WEBHOOK`. Jika `401`, token
   tidak cocok; jika tidak ada run, cek eksekusi Apps Script dan Deployment
   Protection Vercel.

`On edit` tidak terpicu oleh perubahan programatik atau Google Form; untuk itu
gunakan **On change** atau **On form submit**.

## Catatan operasional

- Jangan menjalankan dua sync manual saat cron sedang berjalan.
- Jika status `PARTIAL`, periksa sumber yang gagal di halaman `/sync`.
- Baris stale tetap tampil di aplikasi sampai fitur filter stale diaktifkan.
- Sync RO dengan filter tanggal tidak menandai baris di luar rentang sebagai stale.
- Sync ulang saat isi sheet belum berubah tidak menulis ulang data dan tidak menandai stale.
- Migration hanya dijalankan sekali; aman diulang karena memakai `IF NOT EXISTS`.
- Sebelum migration dijalankan, endpoint status/riwayat akan mengembalikan pesan
  "Tabel sync engine belum tersedia". Dry-run tetap aman karena tidak menyentuh tabel.