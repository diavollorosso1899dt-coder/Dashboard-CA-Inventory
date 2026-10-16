import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SOItem } from './inventoryEngine';

/**
 * Storage & Cloud Sync Service for SO Harian
 * Features:
 * 1. Fast LocalStorage fallback (works 100% offline or without cloud setup)
 * 2. Optional Supabase integration for multi-device sync (HP & PC)
 */

export interface SOSession {
  id: string;
  tanggal: string;
  gudang: string;
  petugas: string;
  total_items?: number;
  item_match?: number;
  item_minus?: number;
  item_plus?: number;
  item_selisih?: number;
  akurasi_persen?: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

const STORAGE_KEYS = {
  SESSIONS: 'so_harian_sessions',
  SESSION_DETAIL_PREFIX: 'so_harian_session_',
  SUPABASE_CONFIG: 'so_harian_supabase_config',
  ACTIVE_SESSION_ID: 'so_harian_active_session_id',
};

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

function getSafeStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return new MemoryStorage();
}

let supabaseClient: SupabaseClient | null = null;

export function configureSupabase(url: string, anonKey: string): { isConfigured: boolean; client?: SupabaseClient; error?: string } {
  const safeStorage = getSafeStorage();
  if (!url || !anonKey) {
    supabaseClient = null;
    safeStorage.removeItem(STORAGE_KEYS.SUPABASE_CONFIG);
    return { isConfigured: false };
  }

  try {
    const client = createClient(url, anonKey);
    supabaseClient = client;
    safeStorage.setItem(STORAGE_KEYS.SUPABASE_CONFIG, JSON.stringify({ url, anonKey }));
    return { isConfigured: true, client };
  } catch (err: any) {
    console.error('Failed to configure Supabase client:', err);
    return { isConfigured: false, error: err.message };
  }
}

export function getSupabaseConfig(): { url: string; anonKey: string; isConfigured: boolean } {
  const safeStorage = getSafeStorage();
  const raw = safeStorage.getItem(STORAGE_KEYS.SUPABASE_CONFIG);
  if (!raw) return { url: '', anonKey: '', isConfigured: false };
  try {
    const parsed = JSON.parse(raw);
    return {
      url: parsed.url || '',
      anonKey: parsed.anonKey || '',
      isConfigured: !!(parsed.url && parsed.anonKey),
    };
  } catch {
    return { url: '', anonKey: '', isConfigured: false };
  }
}

export function initSupabaseFromStorage() {
  if (typeof window === 'undefined') return;
  const saved = getSupabaseConfig();
  if (saved.isConfigured && !supabaseClient) {
    try {
      supabaseClient = createClient(saved.url, saved.anonKey);
    } catch (e) {
      console.warn('Could not auto-initialize Supabase client:', e);
    }
  }
}

export async function saveSession(sessionData: Partial<SOSession>, items: SOItem[] = []): Promise<string> {
  const safeStorage = getSafeStorage();
  initSupabaseFromStorage();

  const sessionId = sessionData.id || `so-${Date.now()}`;
  const now = new Date().toISOString();

  const completeSession: SOSession = {
    tanggal: new Date().toISOString().split('T')[0],
    gudang: 'Gudang Utama',
    petugas: 'Petugas Gudang',
    ...sessionData,
    id: sessionId,
    updated_at: now,
    created_at: sessionData.created_at || now,
    total_items: items.length,
    item_match: items.filter(i => i.status_selisih === 'MATCH').length,
    item_minus: items.filter(i => i.status_selisih === 'MINUS').length,
    item_plus: items.filter(i => i.status_selisih === 'PLUS').length,
  };

  const sessions = getAllSessionsSync();
  const existingIdx = sessions.findIndex(s => s.id === sessionId);
  if (existingIdx >= 0) {
    sessions[existingIdx] = completeSession;
  } else {
    sessions.unshift(completeSession);
  }
  try {
    safeStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    safeStorage.setItem(`${STORAGE_KEYS.SESSION_DETAIL_PREFIX}${sessionId}`, JSON.stringify(items));
    safeStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, sessionId);
  } catch (storageErr) {
    console.warn('LocalStorage quota reached, pruning older session caches:', storageErr);
    try {
      if (sessions.length > 2) {
        for (let i = 2; i < sessions.length; i++) {
          safeStorage.removeItem(`${STORAGE_KEYS.SESSION_DETAIL_PREFIX}${sessions[i].id}`);
        }
      }
      safeStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
      safeStorage.setItem(`${STORAGE_KEYS.SESSION_DETAIL_PREFIX}${sessionId}`, JSON.stringify(items));
      safeStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, sessionId);
    } catch (e2) {
      console.warn('Could not store full item cache locally, relying on cloud sync if configured:', e2);
    }
  }

  if (supabaseClient) {
    try {
      await supabaseClient.from('so_sessions').upsert({
        id: sessionId,
        tanggal: completeSession.tanggal,
        gudang: completeSession.gudang,
        petugas: completeSession.petugas,
        total_items: completeSession.total_items,
        item_match: completeSession.item_match,
        item_selisih: (completeSession.item_minus || 0) + (completeSession.item_plus || 0),
        akurasi_persen: completeSession.akurasi_persen,
        status: completeSession.status || 'DRAFT',
        updated_at: now,
      });

      if (items.length > 0) {
        const detailPayload = items.map(i => ({
          id: i.id,
          session_id: sessionId,
          kode_barang: i.kode_barang,
          nama_barang: i.nama_barang,
          kategori: i.kategori || 'Peralatan',
          satuan: i.satuan,
          stok_awal: i.stok_awal,
          qty_penerimaan: i.qty_penerimaan,
          qty_ro: i.qty_ro,
          stok_sistem: i.stok_sistem,
          qty_fisik: i.qty_fisik,
          selisih: i.selisih,
          status_selisih: i.status_selisih,
          catatan: i.catatan,
        }));

        // Batch upsert in chunks of 300 for blazing speed and zero timeout
        const BATCH_SIZE = 300;
        for (let idx = 0; idx < detailPayload.length; idx += BATCH_SIZE) {
          const chunk = detailPayload.slice(idx, idx + BATCH_SIZE);
          await supabaseClient.from('so_details').upsert(chunk);
        }
      }
    } catch (cloudErr) {
      console.warn('Cloud sync failed, data saved locally:', cloudErr);
    }
  }

  return sessionId;
}

export async function loadSession(sessionId: string): Promise<{ session: SOSession | null; items: SOItem[] }> {
  const safeStorage = getSafeStorage();
  initSupabaseFromStorage();

  const rawItems = safeStorage.getItem(`${STORAGE_KEYS.SESSION_DETAIL_PREFIX}${sessionId}`);
  const sessions = getAllSessionsSync();
  const session = sessions.find(s => s.id === sessionId) || null;
  const items: SOItem[] = rawItems ? JSON.parse(rawItems) : [];

  if (session && items.length > 0) {
    safeStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, sessionId);
    return { session, items };
  }

  if (supabaseClient) {
    try {
      const { data: cloudSession, error: sErr } = await supabaseClient
        .from('so_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (!sErr && cloudSession) {
        const finalItems: SOItem[] = [];
        const PAGE_SIZE = 1000;
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data: chunk, error: cErr } = await supabaseClient
            .from('so_details')
            .select('*')
            .eq('session_id', sessionId)
            .order('kode_barang')
            .range(from, from + PAGE_SIZE - 1);

          if (cErr || !chunk || chunk.length === 0) break;
          finalItems.push(...chunk);
          if (chunk.length < PAGE_SIZE) break;
        }

        safeStorage.setItem(`${STORAGE_KEYS.SESSION_DETAIL_PREFIX}${sessionId}`, JSON.stringify(finalItems));
        safeStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, sessionId);
        return { session: cloudSession, items: finalItems };
      }
    } catch (err) {
      console.warn('Failed to load session from cloud:', err);
    }
  }

  return { session, items };
}

export function getAllSessionsSync(): SOSession[] {
  const safeStorage = getSafeStorage();
  const raw = safeStorage.getItem(STORAGE_KEYS.SESSIONS);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function getAllSessions(): Promise<SOSession[]> {
  initSupabaseFromStorage();
  const localList = getAllSessionsSync();

  if (supabaseClient) {
    try {
      const { data: cloudList, error } = await supabaseClient
        .from('so_sessions')
        .select('*')
        .order('tanggal', { ascending: false });

      if (!error && Array.isArray(cloudList)) {
        const map = new Map<string, SOSession>();
        for (const s of localList) map.set(s.id, s);
        for (const s of cloudList) map.set(s.id, s);
        const merged = Array.from(map.values()).sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
        getSafeStorage().setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(merged));
        return merged;
      }
    } catch (err) {
      console.warn('Cloud session list fetch failed:', err);
    }
  }

  return localList;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const safeStorage = getSafeStorage();
  initSupabaseFromStorage();

  const sessions = getAllSessionsSync().filter(s => s.id !== sessionId);
  safeStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  safeStorage.removeItem(`${STORAGE_KEYS.SESSION_DETAIL_PREFIX}${sessionId}`);

  if (safeStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION_ID) === sessionId) {
    safeStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
  }

  if (supabaseClient) {
    try {
      await supabaseClient.from('so_details').delete().eq('session_id', sessionId);
      await supabaseClient.from('so_sessions').delete().eq('id', sessionId);
    } catch (e) {
      console.warn('Cloud delete failed:', e);
    }
  }

  return true;
}

export function getActiveSessionId(): string | null {
  return getSafeStorage().getItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
}

export function setActiveSessionId(id: string | null): void {
  const safeStorage = getSafeStorage();
  if (id) safeStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, id);
  else safeStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
}
