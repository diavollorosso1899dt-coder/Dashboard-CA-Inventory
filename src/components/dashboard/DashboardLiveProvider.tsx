'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssetRequest, RegionType } from '@/lib/supabase/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { matchesRegion, normalizeRegion } from '@/lib/utils/region-helper';
import { applyAssetChange, mergeAssetRows } from '@/lib/realtime/asset-live-merge';

export type AssetLiveStatus = 'disabled' | 'connecting' | 'live' | 'error';

interface AssetLiveStore {
  items: AssetRequest[];
  setItems: Dispatch<SetStateAction<AssetRequest[]>>;
  initialItems: AssetRequest[];
  status: AssetLiveStatus;
}

interface DashboardLiveProviderProps {
  initialItems: AssetRequest[];
  region: RegionType;
  children: ReactNode;
}

const QUERY_PAGE_SIZE = 1000;
const AssetLiveContext = createContext<AssetLiveStore | null>(null);

export function useAssetLiveStore(): AssetLiveStore | null {
  return useContext(AssetLiveContext);
}

function maxUpdatedAt(items: AssetRequest[]): string | null {
  let maxMs = Number.NEGATIVE_INFINITY;
  let max: string | null = null;

  for (const item of items) {
    if (!item.updated_at) continue;
    const ms = Date.parse(item.updated_at);
    if (!Number.isNaN(ms) && ms > maxMs) {
      maxMs = ms;
      max = item.updated_at;
    }
  }

  return max;
}

async function fetchChangedAssets(
  client: SupabaseClient,
  region: string,
  since: string | null
): Promise<AssetRequest[]> {
  const rows: AssetRequest[] = [];
  let from = 0;

  while (true) {
    let query = client
      .from('asset_requests')
      .select('*')
      .order('updated_at', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    if (region !== 'ALL') query = query.eq('region', region);
    if (since) query = query.gte('updated_at', since);

    const { data, error } = await query.range(from, from + QUERY_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data || []) as AssetRequest[];
    rows.push(...page);
    if (page.length < QUERY_PAGE_SIZE) break;
    from += QUERY_PAGE_SIZE;
  }

  return rows;
}

async function fetchAssetIds(client: SupabaseClient, region: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let from = 0;

  while (true) {
    let query = client
      .from('asset_requests')
      .select('id')
      .order('id', { ascending: true });

    if (region !== 'ALL') query = query.eq('region', region);

    const { data, error } = await query.range(from, from + QUERY_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data || []) as Array<{ id: string }>;
    for (const row of page) {
      if (row.id) ids.add(row.id);
    }
    if (page.length < QUERY_PAGE_SIZE) break;
    from += QUERY_PAGE_SIZE;
  }

  return ids;
}

function pruneMissingAssets(
  items: AssetRequest[],
  existingIds: Set<string>,
  shouldContain: (row: AssetRequest) => boolean,
  keepIds: Set<string>
): AssetRequest[] {
  const next = items.filter(
    (item) => shouldContain(item) && (existingIds.has(item.id || item.external_id) || keepIds.has(item.id || item.external_id))
  );
  return next.length === items.length ? items : next;
}

export function DashboardLiveProvider({
  initialItems,
  region,
  children,
}: DashboardLiveProviderProps) {
  const normalizedRegion = normalizeRegion(region);
  const [items, setItems] = useState<AssetRequest[]>(initialItems);
  const [status, setStatus] = useState<AssetLiveStatus>(() =>
    isSupabaseConfigured() && supabase ? 'connecting' : 'disabled'
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const shouldContain = useCallback(
    (row: AssetRequest) => matchesRegion(row.region, normalizedRegion),
    [normalizedRegion]
  );

  const setLiveItems = useCallback<Dispatch<SetStateAction<AssetRequest[]>>>(
    (value) => {
      setItems((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        const filtered = next.filter(shouldContain);
        return filtered.length === next.length ? next : filtered;
      });
    },
    [shouldContain]
  );

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setStatus('disabled');
      return;
    }

    const client = supabase;
    let active = true;
    let catchUpInFlight = false;
    const liveEventIds = new Set<string>();

    const catchUp = async () => {
      if (!active || catchUpInFlight) return;
      catchUpInFlight = true;

      try {
        const since = maxUpdatedAt(itemsRef.current);
        const [changed, existingIds] = await Promise.all([
          fetchChangedAssets(client, normalizedRegion, since),
          fetchAssetIds(client, normalizedRegion),
        ]);

        if (!active) return;

        if (changed.length > 0) {
          setItems((prev) => mergeAssetRows(prev, changed, shouldContain));
        }
        setItems((prev) => pruneMissingAssets(prev, existingIds, shouldContain, liveEventIds));
      } catch (error) {
        console.error('[asset realtime] catch-up failed:', error);
      } finally {
        catchUpInFlight = false;
      }
    };

    setStatus('connecting');

    const channel = client
      .channel(`asset-requests-live-${normalizedRegion}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'asset_requests' },
        (payload) => {
          if (!active) return;

          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id?: string } | undefined;
            if (!oldRow?.id) return;
            liveEventIds.delete(oldRow.id);
            setItems((prev) => applyAssetChange(prev, { type: 'DELETE', id: oldRow.id! }, shouldContain));
            return;
          }

          const row = payload.new as AssetRequest | undefined;
          if (!row?.id) return;
          liveEventIds.add(row.id);
          setItems((prev) => applyAssetChange(prev, { type: 'UPSERT', row }, shouldContain));
        }
      )
      .subscribe((nextStatus) => {
        if (!active) return;

        if (nextStatus === 'SUBSCRIBED') {
          setStatus('live');
          void catchUp();
        } else if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
          setStatus('error');
        } else if (nextStatus === 'CLOSED') {
          setStatus('connecting');
        }
      });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [normalizedRegion, shouldContain]);

  return (
    <AssetLiveContext.Provider value={{ items, setItems: setLiveItems, initialItems, status }}>
      {children}
    </AssetLiveContext.Provider>
  );
}
