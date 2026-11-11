import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoRequestDateIndex,
  collectRoReferences,
  extractRoIdFromAssetId,
  extractRoNumberFromNotes,
  resolveItemRequestDate,
  resolveRoRequestDate,
} from './surat-jalan-request-date.ts';

const RO_ID = 'f5ed487f-8775-4419-98f7-d1747ef137d0';
const OTHER_RO_ID = '43adf9f1-e00f-4034-ae95-27738ac22fff';

test('resolveRoRequestDate memakai target_delivery_date, lalu request_date, lalu created_at', () => {
  assert.equal(
    resolveRoRequestDate({
      id: RO_ID,
      request_date: '2026-11-04',
      target_delivery_date: '2026-11-10',
      created_at: '2026-11-05T06:17:51.776+00:00',
    }),
    '2026-11-10'
  );

  assert.equal(
    resolveRoRequestDate({
      id: RO_ID,
      request_date: '2026-11-04',
      created_at: '2026-11-05T06:17:51.776+00:00',
    }),
    '2026-11-04'
  );

  assert.equal(
    resolveRoRequestDate({
      id: RO_ID,
      created_at: '2026-11-05T06:17:51.776+00:00',
    }),
    '2026-11-05'
  );

  assert.equal(resolveRoRequestDate(null), null);
});

test('extractRoIdFromAssetId hanya mengambil UUID dari prefix ro-', () => {
  assert.equal(
    extractRoIdFromAssetId(`ro-${RO_ID}-roi-0001-29-1`),
    RO_ID
  );
  assert.equal(extractRoIdFromAssetId(`RO-${RO_ID.toUpperCase()}`), RO_ID);
  assert.equal(extractRoIdFromAssetId('roi-0001-29-1'), null);
  assert.equal(extractRoIdFromAssetId(RO_ID), null);
  assert.equal(extractRoIdFromAssetId(null), null);
});

test('extractRoNumberFromNotes membaca No. RO dan format RO: 103863', () => {
  assert.equal(
    extractRoNumberFromNotes('No. RO: RO-103863 • Pemohon: Logistik Kalbar via Spreadsheet'),
    'RO-103863'
  );
  assert.equal(extractRoNumberFromNotes('RO: 103863'), 'RO-103863');
  assert.equal(extractRoNumberFromNotes('Tanpa referensi RO'), null);
  assert.equal(extractRoNumberFromNotes(''), null);
});

test('buildRoRequestDateIndex memetakan UUID dan nomor RO ke tanggal permintaan', () => {
  const index = buildRoRequestDateIndex([
    {
      id: RO_ID,
      ro_number: 'RO-0001',
      request_date: '2026-11-04',
      target_delivery_date: '2026-11-10',
    },
    {
      id: OTHER_RO_ID,
      ro_number: 'RO-103863',
      request_date: '2026-10-30',
      target_delivery_date: null,
    },
  ]);

  assert.equal(index.byId.get(RO_ID), '2026-11-10');
  assert.equal(index.byNumber.get('RO-0001'), '2026-11-10');
  assert.equal(index.byId.get(OTHER_RO_ID), '2026-10-30');
  assert.equal(index.byNumber.get('RO-103863'), '2026-10-30');
});

test('resolveItemRequestDate memprioritaskan field eksplisit, asset_id, lalu notes', () => {
  const index = buildRoRequestDateIndex([
    {
      id: RO_ID,
      ro_number: 'RO-0001',
      request_date: '2026-11-04',
      target_delivery_date: '2026-11-10',
    },
    {
      id: OTHER_RO_ID,
      ro_number: 'RO-103863',
      request_date: '2026-10-30',
      target_delivery_date: null,
    },
  ]);

  assert.equal(
    resolveItemRequestDate({ tgl_permintaan: '2026-11-12' }, index),
    '2026-11-12'
  );
  assert.equal(
    resolveItemRequestDate(
      { asset_id: `ro-${RO_ID}-roi-0001-29-1` },
      index
    ),
    '2026-11-10'
  );
  assert.equal(
    resolveItemRequestDate(
      {
        asset_id: 'ro-00000000-0000-4000-8000-000000000000-roi-x',
        notes: 'No. RO: RO-103863 • Pemohon: Logistik Kalbar',
      },
      index
    ),
    '2026-10-30'
  );
  assert.equal(
    resolveItemRequestDate({ catatan: 'No. RO: RO-103863' }, index),
    '2026-10-30'
  );
  assert.equal(resolveItemRequestDate({ notes: 'di transfer ke gudang' }, index), null);
  assert.equal(resolveItemRequestDate({}, null), null);
});

test('collectRoReferences mengumpulkan UUID dan nomor RO tanpa duplikat', () => {
  const refs = collectRoReferences([
    {
      items: [
        { asset_id: `ro-${RO_ID}-roi-0001-29-1` },
        { asset_id: `ro-${RO_ID}-roi-0001-29-2` },
        {
          asset_id: `ro-${OTHER_RO_ID}-roi-103863-4-1`,
          notes: 'No. RO: RO-103863 • Pemohon: Logistik Kalbar',
        },
      ],
    },
    {
      items: [{ notes: 'RO: 103863' }],
    },
  ]);

  assert.deepEqual(refs.ids.sort(), [RO_ID, OTHER_RO_ID].sort());
  assert.deepEqual(refs.numbers, ['RO-103863']);
});
