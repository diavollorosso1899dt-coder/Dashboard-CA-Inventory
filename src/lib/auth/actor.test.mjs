import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actorFromCookieHeader,
  buildActorCookie,
  clearActorCookie,
  resolveActor,
  serializeActorCookie,
} from './actor.ts';

const headers = (init = {}) => new Headers(init);

test('cookie pelaku menyimpan nama, role, dan id user', () => {
  const cookie = serializeActorCookie({
    id: 'u-1',
    full_name: 'Nurul',
    role: 'Admin',
  });
  const parsed = actorFromCookieHeader(`ca_auth=true; ca_user=${cookie}`);
  assert.deepEqual(parsed, { id: 'u-1', name: 'Nurul', role: 'Admin' });
});

test('buildActorCookie menghasilkan atribut cookie yang benar', () => {
  const cookie = buildActorCookie({ full_name: 'Nurul', role: 'Admin' });
  assert.equal(cookie.startsWith('ca_user='), true);
  assert.equal(cookie.includes('path=/'), true);
  assert.equal(cookie.includes('SameSite=Lax'), true);
  assert.equal(clearActorCookie().includes('expires=Thu, 01 Jan 1970'), true);
});

test('header x-user-name diprioritaskan di atas cookie', () => {
  const actor = resolveActor(
    { headers: headers({ cookie: `ca_user=${serializeActorCookie({ full_name: 'Cookie User', role: 'User' })}`, 'x-user-name': 'Header User', 'x-user-role': 'Super User' }) }
  );
  assert.equal(actor.name, 'Header User');
  assert.equal(actor.role, 'Super User');
});

test('body actor dipakai bila header tidak ada', () => {
  const actor = resolveActor({ headers: headers({}) }, { name: 'Bulk Deleter', role: 'Admin' });
  assert.equal(actor.name, 'Bulk Deleter');
  assert.equal(actor.role, 'Admin');
});

test('tanpa identitas apa pun, pelaku tercatat sebagai System', () => {
  const actor = resolveActor({ headers: headers({}) });
  assert.equal(actor.name, 'System');
  assert.equal(actor.role, 'System');
});

test('cookie rusak tidak membuat request gagal', () => {
  const actor = resolveActor({ headers: headers({ cookie: 'ca_user=%7Brusak' }) });
  assert.equal(actor.name, 'System');
});