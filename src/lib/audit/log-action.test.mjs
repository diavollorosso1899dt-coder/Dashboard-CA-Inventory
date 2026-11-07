import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canDeleteAuditEntity,
  canRevertAuditLog,
  resolveAuditLogAction,
} from './log-action.ts';

const log = (overrides = {}) => ({
  action_type: 'UPDATE',
  entity_type: 'ASET',
  entity_id: 'aset-1',
  previous_state: { status: 'LAMA' },
  new_state: { status: 'BARU' },
  ...overrides,
});

test('UPDATE/STATUS_CHANGE/REVERT dengan previous_state menampilkan Kembalikan', () => {
  for (const actionType of ['UPDATE', 'STATUS_CHANGE', 'REVERT']) {
    assert.equal(resolveAuditLogAction(log({ action_type: actionType })), 'revert');
  }
});

test('DELETE_TO_TRASH menampilkan Kembalikan selama punya entity_id', () => {
  assert.equal(
    resolveAuditLogAction(log({ action_type: 'DELETE_TO_TRASH', previous_state: undefined })),
    'revert'
  );
});

test('DELETE_TO_TRASH tanpa entity_id jatuh ke Hapus Log', () => {
  assert.equal(
    resolveAuditLogAction(log({ action_type: 'DELETE_TO_TRASH', entity_id: null })),
    'delete-log'
  );
});

test('CREATE dan RESTORE menampilkan Hapus data terkait', () => {
  for (const actionType of ['CREATE', 'RESTORE']) {
    assert.equal(resolveAuditLogAction(log({ action_type: actionType })), 'delete-entity');
  }
});

test('CREATE untuk modul yang tidak punya tabel aktif jatuh ke Hapus Log', () => {
  assert.equal(resolveAuditLogAction(log({ action_type: 'CREATE', entity_type: 'ITEM' })), 'delete-log');
  assert.equal(resolveAuditLogAction(log({ action_type: 'CREATE', entity_type: 'SYSTEM' })), 'delete-log');
});

test('PERMANENT_DELETE dan EMPTY_TRASH selalu Hapus Log', () => {
  for (const actionType of ['PERMANENT_DELETE', 'EMPTY_TRASH']) {
    assert.equal(resolveAuditLogAction(log({ action_type: actionType })), 'delete-log');
  }
});

test('UPDATE tanpa previous_state tidak bisa di-revert', () => {
  assert.equal(
    resolveAuditLogAction(log({ previous_state: undefined, new_state: { status: 'BARU' } })),
    'delete-log'
  );
  assert.equal(canRevertAuditLog(log({ previous_state: [] })), false);
});

test('entity tanpa entity_id tidak bisa dihapus', () => {
  const entry = log({ action_type: 'CREATE', entity_id: undefined });
  assert.equal(canDeleteAuditEntity(entry), false);
  assert.equal(resolveAuditLogAction(entry), 'delete-log');
});

test('modul RO, OUTLET, SURAT_JALAN, TRANSFER, DISPOSISI, PENGGUNA didukung', () => {
  for (const entityType of ['RO', 'OUTLET', 'SURAT_JALAN', 'TRANSFER', 'DISPOSISI', 'PENGGUNA']) {
    assert.equal(resolveAuditLogAction(log({ action_type: 'CREATE', entity_type: entityType })), 'delete-entity');
  }
});