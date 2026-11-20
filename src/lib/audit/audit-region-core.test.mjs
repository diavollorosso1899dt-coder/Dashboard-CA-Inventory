import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyAuditRegionLookups,
  filterAuditLogsByRegion,
  normalizeKnownAuditRegion,
  resolveAuditLogRegion,
} from './audit-region-core.ts';

const log = (overrides = {}) => ({
  entity_type: 'ASET',
  entity_id: undefined,
  entity_title: '',
  previous_state: undefined,
  new_state: undefined,
  ...overrides,
});

const lookups = () => createEmptyAuditRegionLookups();

test('normalizeKnownAuditRegion menerima JABO/KALBAR dan menolak nilai lain', () => {
  assert.equal(normalizeKnownAuditRegion('JABO'), 'JABODETABEK');
  assert.equal(normalizeKnownAuditRegion(' jabodetabek '), 'JABODETABEK');
  assert.equal(normalizeKnownAuditRegion('Kalimantan Barat'), 'KALBAR');
  assert.equal(normalizeKnownAuditRegion('ALL'), null);
  assert.equal(normalizeKnownAuditRegion(null), null);
});

test('region diambil dari snapshot state dan dinormalisasi', () => {
  const data = lookups();
  assert.equal(
    resolveAuditLogRegion(log({ previous_state: { region: 'JABO' } }), data),
    'JABODETABEK'
  );
  assert.equal(
    resolveAuditLogRegion(log({ new_state: { region: 'KALBAR' } }), data),
    'KALBAR'
  );
});

test('ASET dengan ID sintetis ro-pr-<uuid> dipetakan lewat RO', () => {
  const data = lookups();
  data.roById.set('a87681bb-a246-4b9f-8fa4-e11a394852e2', {
    region: 'JABODETABEK',
    branch_name: 'HEAD OFFICE',
  });

  assert.equal(
    resolveAuditLogRegion(
      log({
        entity_id:
          'ro-pr-a87681bb-a246-4b9f-8fa4-e11a394852e2-roi-105318-7-1',
      }),
      data
    ),
    'JABODETABEK'
  );
});

test('RO dan ITEM dipetakan lewat nomor RO', () => {
  const data = lookups();
  data.roByNumber.set('RO-105318', { region: 'KALBAR' });

  assert.equal(
    resolveAuditLogRegion(
      log({ entity_type: 'RO', entity_title: 'RO-105318 (Bakso)' }),
      data
    ),
    'KALBAR'
  );
  assert.equal(
    resolveAuditLogRegion(
      log({ entity_type: 'ITEM', entity_id: 'RO-105318' }),
      data
    ),
    'KALBAR'
  );
});

test('SURAT_JALAN memakai region dokumen atau fallback branch outlet', () => {
  const data = lookups();
  data.sjById.set('sj-1', { region: null, branch_name: 'Bebek Boedjang Siantan' });
  data.outletByBranch.set('BEBEK BOEDJANG SIANTAN', { region: 'KALBAR' });

  assert.equal(
    resolveAuditLogRegion(
      log({ entity_type: 'SURAT_JALAN', entity_id: 'sj-1' }),
      data
    ),
    'KALBAR'
  );
});

test('TRANSFER memakai region surat jalan dengan ID yang sama', () => {
  const data = lookups();
  data.sjById.set('doc-1', { region: 'JABODETABEK' });

  assert.equal(
    resolveAuditLogRegion(
      log({ entity_type: 'TRANSFER', entity_id: 'doc-1' }),
      data
    ),
    'JABODETABEK'
  );
});

test('PENGGUNA membaca token [REGION:...] pada branch', () => {
  const data = lookups();
  data.userById.set('user-1', {
    branch_name:
      '[REGION:KALBAR][FEATURES:dashboard,so_harian,assets_tracking]',
  });

  assert.equal(
    resolveAuditLogRegion(
      log({ entity_type: 'PENGGUNA', entity_id: 'user-1' }),
      data
    ),
    'KALBAR'
  );
});

test('SYSTEM dan referensi hilang menghasilkan null (Global)', () => {
  const data = lookups();
  assert.equal(
    resolveAuditLogRegion(
      log({
        entity_type: 'SYSTEM',
        entity_title: 'Retensi audit log 7 hari',
      }),
      data
    ),
    null
  );
  assert.equal(
    resolveAuditLogRegion(
      log({ entity_type: 'ASET', entity_id: 'ro-pr-tidak-ada' }),
      data
    ),
    null
  );
});

test('fallback judul hanya dipakai bila hasilnya satu region', () => {
  const data = lookups();
  data.outletByBranch.set('BEBEK BOEDJANG SIANTAN', { region: 'KALBAR' });
  data.outletByBranch.set('SOP MAK GARANG JOHAR', { region: 'JABODETABEK' });

  assert.equal(
    resolveAuditLogRegion(
      log({ entity_type: 'TRANSFER', entity_title: 'Mutasi ke Bebek Boedjang Siantan' }),
      data
    ),
    'KALBAR'
  );

  assert.equal(
    resolveAuditLogRegion(
      log({
        entity_type: 'TRANSFER',
        entity_title: 'Mutasi Bebek Boedjang Siantan -> Sop Mak Garang Johar',
      }),
      data
    ),
    null
  );
});

test('filterAuditLogsByRegion membuang log global saat region dipilih', () => {
  const logs = [
    { id: '1', region: 'JABODETABEK' },
    { id: '2', region: 'KALBAR' },
    { id: '3', region: null },
  ];

  assert.deepEqual(
    filterAuditLogsByRegion(logs, 'JABO').map((entry) => entry.id),
    ['1']
  );
  assert.deepEqual(
    filterAuditLogsByRegion(logs, 'KALBAR').map((entry) => entry.id),
    ['2']
  );
  assert.equal(filterAuditLogsByRegion(logs, 'ALL').length, 3);
});
