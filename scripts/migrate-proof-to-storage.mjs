#!/usr/bin/env node
/**
 * Migrasi bukti foto & tanda tangan dari base64 inline ke Supabase Storage.
 *
 * Kenapa: kolom `items` di tabel `surat_jalan` dan `asset_transfers` menyimpan
 * foto/TTD sebagai data URL base64. Satu dokumen bisa >6 MB sehingga setiap
 * permintaan ke Supabase mengunduh puluhan MB. Setelah migrasi, kolom hanya
 * menyimpan URL publik Storage (beberapa KB per dokumen).
 *
 * Sifat skrip:
 * - Dry-run secara default. Tidak ada perubahan data tanpa `--apply`.
 * - Idempoten: objek Storage memakai hash SHA-256 isi file, jadi aman diulang.
 * - Sebelum UPDATE, seluruh baris yang terdampak dicadangkan ke scratch/backups.
 * - Ada mode `--verify` dan `--rollback=<file>`.
 *
 * Pemakaian:
 *   node scripts/migrate-proof-to-storage.mjs                # dry-run
 *   node scripts/migrate-proof-to-storage.mjs --apply        # unggah + update
 *   node scripts/migrate-proof-to-storage.mjs --verify       # cek hasil
 *   node scripts/migrate-proof-to-storage.mjs --rollback=scratch/backups/xxx.json
 *
 * Opsi: --bucket=delivery-proofs
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'scratch', 'backups');
const TABLES = ['surat_jalan', 'asset_transfers'];

const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getOption = (name, fallback) => {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const APPLY = hasFlag('--apply');
const VERIFY = hasFlag('--verify');
const ROLLBACK_FILE = getOption('rollback', null);
const BUCKET = getOption('bucket', process.env.PROOF_BUCKET || 'delivery-proofs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  const raw = await readFile(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di .env.local');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      'PERINGATAN: SUPABASE_SERVICE_ROLE_KEY tidak ada; memakai anon key. ' +
        'Upload ke Storage bisa gagal karena RLS. Tambahkan service role key untuk migrasi.'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseDataUrl(value) {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(value);
  if (!match) return null;
  const mime = match[1].toLowerCase().trim();
  if (!mime.startsWith('image/')) return null;
  try {
    const buffer = match[2]
      ? Buffer.from(match[3], 'base64')
      : Buffer.from(decodeURIComponent(match[3]), 'utf8');
    if (buffer.length === 0) return null;
    return { mime, buffer };
  } catch {
    return null;
  }
}

function collectInlineImages(value, pathParts = [], out = []) {
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) out.push({ path: pathParts, value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectInlineImages(entry, [...pathParts, index], out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      collectInlineImages(entry, [...pathParts, key], out);
    }
  }
  return out;
}

function collectStorageUrls(value, prefix, out = new Set()) {
  if (typeof value === 'string') {
    if (value.startsWith(prefix)) out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStorageUrls(entry, prefix, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectStorageUrls(entry, prefix, out);
  }
  return out;
}

function setAtPath(target, pathParts, nextValue) {
  let cursor = target;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    cursor = cursor[pathParts[i]];
  }
  cursor[pathParts[pathParts.length - 1]] = nextValue;
}

function formatPath(pathParts) {
  return pathParts
    .map((part) => (typeof part === 'number' ? `[${part}]` : `.${part}`))
    .join('')
    .replace(/^\./, '');
}

async function selectAll(admin, table) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { data, error } = await admin.from(table).select('*');
    if (!error) return data || [];
    lastError = error;
    console.warn(`[${table}] percobaan ${attempt} gagal: ${error.message}`);
    await sleep(1500 * attempt);
  }
  throw new Error(`[${table}] gagal membaca data: ${lastError?.message}`);
}

async function buildPlan(admin) {
  const rows = [];
  const objects = new Map();
  let totalInlineFields = 0;
  let totalInlineBytes = 0;

  for (const table of TABLES) {
    const data = await selectAll(admin, table);
    for (const row of data) {
      const inlineFields = collectInlineImages(row);
      if (inlineFields.length === 0) continue;

      const nextRow = structuredClone(row);
      const changedKeys = new Set();
      const urls = [];
      let rowInlineBytes = 0;

      for (const field of inlineFields) {
        const parsed = parseDataUrl(field.value);
        if (!parsed) {
          console.warn(
            `[${table} ${row.id}] data URL tidak bisa didekode, dilewati: ${formatPath(field.path)}`
          );
          continue;
        }
        const extension = EXTENSION_BY_MIME[parsed.mime];
        if (!extension) {
          console.warn(
            `[${table} ${row.id}] tipe ${parsed.mime} tidak didukung, dilewati: ${formatPath(field.path)}`
          );
          continue;
        }

        rowInlineBytes += parsed.buffer.length;
        totalInlineFields += 1;
        totalInlineBytes += parsed.buffer.length;

        const hash = createHash('sha256').update(parsed.buffer).digest('hex');
        const objectPath = `proofs/${hash}.${extension}`;
        if (!objects.has(hash)) {
          objects.set(hash, { hash, mime: parsed.mime, buffer: parsed.buffer, objectPath });
        }
        const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
        const publicUrl = publicData.publicUrl;

        setAtPath(nextRow, field.path, publicUrl);
        changedKeys.add(field.path[0]);
        urls.push(publicUrl);
      }

      if (changedKeys.size === 0) continue;
      rows.push({
        table,
        id: row.id,
        original: row,
        next: nextRow,
        changedKeys: [...changedKeys],
        inlineFieldPaths: inlineFields.map((field) => formatPath(field.path)),
        inlineBytes: rowInlineBytes,
        urls,
      });
    }
  }

  return { rows, objects, totalInlineFields, totalInlineBytes };
}

function printPlan(plan) {
  console.log(`\nBucket tujuan : ${BUCKET}`);
  console.log(`Tabel         : ${TABLES.join(', ')}`);
  console.log('');

  const header = ['Tabel', 'Baris', 'Field base64', 'Ukuran base64', 'Ukuran setelah'];
  const tableRows = [];
  for (const table of TABLES) {
    const tablePlans = plan.rows.filter((row) => row.table === table);
    if (tablePlans.length === 0) continue;
    tableRows.push([
      table,
      String(tablePlans.length),
      String(tablePlans.reduce((sum, row) => sum + row.inlineFieldPaths.length, 0)),
      mb(tablePlans.reduce((sum, row) => sum + row.inlineBytes, 0)),
      kb(tablePlans.reduce((sum, row) => sum + JSON.stringify(row.next).length, 0)),
    ]);
  }
  tableRows.push([
    'TOTAL',
    String(plan.rows.length),
    String(plan.totalInlineFields),
    mb(plan.totalInlineBytes),
    kb(plan.rows.reduce((sum, row) => sum + JSON.stringify(row.next).length, 0)),
  ]);

  const widths = header.map((title, index) =>
    Math.max(title.length, ...tableRows.map((row) => String(row[index]).length))
  );
  const renderRow = (row) =>
    row.map((cell, index) => String(cell).padEnd(widths[index])).join('  ');
  console.log(renderRow(header));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  tableRows.forEach((row) => console.log(renderRow(row)));

  console.log(`\nObjek unik di Storage: ${plan.objects.size}`);
  for (const row of plan.rows) {
    console.log(`  - ${row.table} ${row.id}: ${row.inlineFieldPaths.join(', ')}`);
  }
  if (plan.objects.size > 0) {
    console.log('\nObjek yang akan diunggah:');
    for (const object of plan.objects.values()) {
      console.log(`  - ${object.objectPath} (${object.mime}, ${kb(object.buffer.length)})`);
    }
  }

  if (plan.rows.length === 0) {
    console.log('\nTidak ada base64 yang perlu dimigrasikan. Semua bersih.');
  } else if (!APPLY) {
    console.log('\nDRY-RUN: tidak ada data yang diubah. Jalankan dengan --apply untuk migrasi.');
  }
}

async function ensureBucket(admin) {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw new Error(`Gagal membaca daftar bucket: ${error.message}`);
  if ((buckets || []).some((bucket) => bucket.name === BUCKET)) {
    console.log(`Bucket "${BUCKET}" sudah ada.`);
    return;
  }
  const { error: createError } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`Gagal membuat bucket "${BUCKET}": ${createError.message}`);
  }
  console.log(`Bucket "${BUCKET}" dibuat (public).`);
}

async function uploadObjects(admin, plan) {
  let uploaded = 0;
  for (const object of plan.objects.values()) {
    let done = false;
    let lastError = null;
    for (let attempt = 1; attempt <= 3 && !done; attempt += 1) {
      const { error } = await admin.storage.from(BUCKET).upload(object.objectPath, object.buffer, {
        contentType: object.mime,
        upsert: true,
        cacheControl: '31536000',
      });
      if (!error) {
        done = true;
        uploaded += 1;
      } else {
        lastError = error;
        console.warn(`Upload ${object.objectPath} gagal (percobaan ${attempt}): ${error.message}`);
        await sleep(1000 * attempt);
      }
    }
    if (!done) {
      throw new Error(`Gagal mengunggah ${object.objectPath}: ${lastError?.message}`);
    }
  }
  console.log(`Upload selesai: ${uploaded}/${plan.objects.size} objek.`);
}

async function verifyUrl(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method });
      if (res.ok) return true;
      if (method === 'GET') return false;
    } catch {
      if (method === 'GET') return false;
    }
  }
  return false;
}

async function verifyObjects(plan) {
  const urls = new Set(plan.rows.flatMap((row) => row.urls));
  let ok = 0;
  for (const url of urls) {
    const reachable = await verifyUrl(url);
    if (reachable) ok += 1;
    else console.warn(`URL tidak dapat diakses: ${url}`);
  }
  console.log(`Verifikasi objek: ${ok}/${urls.size} URL publik dapat diakses.`);
  if (ok !== urls.size) throw new Error('Ada objek bukti yang tidak dapat diakses publik.');
}

async function applyPlan(admin, plan) {
  if (plan.rows.length === 0) {
    console.log('Tidak ada yang perlu dimigrasikan.');
    return;
  }

  await ensureBucket(admin);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await mkdir(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `proof-migration-${stamp}.json`);
  await writeFile(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        bucket: BUCKET,
        rows: plan.rows.map((row) => ({ table: row.table, row: row.original })),
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`Backup baris asli: ${path.relative(ROOT, backupPath)}`);

  await uploadObjects(admin, plan);
  await verifyObjects(plan);

  let updated = 0;
  const failures = [];
  for (const row of plan.rows) {
    const patch = {};
    for (const key of row.changedKeys) patch[key] = row.next[key];

    let lastError = null;
    let success = false;
    for (let attempt = 1; attempt <= 3 && !success; attempt += 1) {
      const { error } = await admin.from(row.table).update(patch).eq('id', row.id);
      if (!error) {
        success = true;
      } else {
        lastError = error;
        console.warn(
          `Update ${row.table} ${row.id} gagal (percobaan ${attempt}): ${error.message}`
        );
        await sleep(1000 * attempt);
      }
    }

    if (success) {
      updated += 1;
      console.log(`OK   ${row.table} ${row.id} -> ${row.urls.length} URL`);
    } else {
      failures.push(`${row.table} ${row.id}: ${lastError?.message}`);
      console.error(`GAGAL ${row.table} ${row.id}: ${lastError?.message}`);
    }
  }

  console.log(`\nUpdate selesai: ${updated}/${plan.rows.length} baris.`);
  if (failures.length > 0) {
    console.error('Baris gagal (data asli tetap utuh karena update atomik per baris):');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    console.error(`Rollback bila perlu: node scripts/migrate-proof-to-storage.mjs --rollback=${path.relative(ROOT, backupPath)}`);
    process.exitCode = 1;
  }
}

async function runVerify(admin) {
  console.log('\nVerifikasi hasil migrasi...');
  let remainingFields = 0;
  let remainingBytes = 0;
  const storageUrls = new Set();
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

  for (const table of TABLES) {
    const data = await selectAll(admin, table);
    for (const row of data) {
      const inline = collectInlineImages(row);
      if (inline.length > 0) {
        remainingFields += inline.length;
        remainingBytes += inline.reduce((sum, field) => sum + field.value.length, 0);
        console.warn(
          `  ${table} ${row.id}: masih ada ${inline.length} base64 (${inline
            .map((field) => formatPath(field.path))
            .join(', ')})`
        );
      }
      collectStorageUrls(row, prefix, storageUrls);
    }
  }

  let reachable = 0;
  for (const url of storageUrls) {
    if (await verifyUrl(url)) reachable += 1;
    else console.warn(`  URL tidak dapat diakses: ${url}`);
  }

  console.log(`Base64 tersisa : ${remainingFields} field (${mb(remainingBytes)})`);
  console.log(`URL Storage    : ${reachable}/${storageUrls.size} dapat diakses`);

  if (remainingFields > 0) {
    console.error('Migrasi belum tuntas: masih ada base64 di DB.');
    process.exitCode = 1;
  } else if (reachable !== storageUrls.size) {
    console.error('Ada URL bukti yang tidak dapat diakses.');
    process.exitCode = 1;
  } else {
    console.log('Verifikasi lulus: tidak ada base64, semua URL bukti dapat diakses.');
  }
}

async function runRollback(admin, file) {
  const resolved = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const backup = JSON.parse(await readFile(resolved, 'utf8'));
  if (!Array.isArray(backup.rows)) {
    throw new Error('File backup tidak valid: properti "rows" tidak ditemukan.');
  }

  console.log(`Rollback dari ${path.relative(ROOT, resolved)} (${backup.rows.length} baris)...`);
  let restored = 0;
  for (const entry of backup.rows) {
    const { id, ...row } = entry.row;
    const { error } = await admin.from(entry.table).update(row).eq('id', id);
    if (error) {
      console.error(`GAGAL ${entry.table} ${id}: ${error.message}`);
      process.exitCode = 1;
    } else {
      restored += 1;
      console.log(`OK   ${entry.table} ${id}`);
    }
  }
  console.log(`Rollback selesai: ${restored}/${backup.rows.length} baris dipulihkan.`);
  console.log('Objek di Storage tidak dihapus (aman, tidak mengganggu).');
}

async function main() {
  await loadEnvLocal();
  const admin = getClient();

  if (ROLLBACK_FILE) {
    await runRollback(admin, ROLLBACK_FILE);
    return;
  }

  if (VERIFY) {
    await runVerify(admin);
    return;
  }

  const plan = await buildPlan(admin);
  printPlan(plan);

  if (APPLY) {
    await applyPlan(admin, plan);
    if (plan.rows.length > 0) await runVerify(admin);
  }
}

main().catch((err) => {
  console.error('\nGAGAL:', err?.message || err);
  process.exitCode = 1;
});