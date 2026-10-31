import type { RequestOrder, ROItem, SuratJalan } from '../supabase/types';

export interface GroupedSuratJalanLike {
  key?: string;
  outletName?: string;
  docs?: SuratJalan[];
  items?: any[];
  primarySj?: SuratJalan;
  sjNumbers?: string[];
  roNumbers?: string[];
  totalUnits?: number;
}

export interface GroupConfirmationTargets {
  docIds: string[];
  sjNumbers: string[];
  roNumbers: string[];
  items: any[];
  outletName: string;
  consolidatedSj: SuratJalan;
}

/**
 * Mengumpulkan seluruh ID dokumen, nomor SJ, nomor RO, dan seluruh item
 * dalam 1 baris Surat Jalan (baik tunggal maupun gabungan per outlet).
 */
export function collectGroupConfirmationTargets(
  target: GroupedSuratJalanLike | SuratJalan
): GroupConfirmationTargets {
  const isGroup =
    target &&
    typeof target === 'object' &&
    ('docs' in target || 'primarySj' in target) &&
    Array.isArray((target as GroupedSuratJalanLike).docs);

  const docs: SuratJalan[] = isGroup
    ? ((target as GroupedSuratJalanLike).docs || [])
    : [target as SuratJalan];

  const primary: SuratJalan = isGroup
    ? ((target as GroupedSuratJalanLike).primarySj || docs[0])
    : (target as SuratJalan);

  const docIdsSet = new Set<string>();
  const sjNumbersSet = new Set<string>();
  const roNumbersSet = new Set<string>();
  const allItems: any[] = [];

  for (const doc of docs) {
    if (!doc) continue;
    if (doc.id) docIdsSet.add(doc.id);
    const sjNo = doc.nomor_sj || doc.sj_number;
    if (sjNo) sjNumbersSet.add(sjNo);
    const roNo = doc.ro_nomor || doc.ro_number;
    if (roNo) roNumbersSet.add(roNo);
    if (Array.isArray(doc.items)) {
      for (const it of doc.items) {
        allItems.push(it);
      }
    }
  }

  if (isGroup) {
    const grp = target as GroupedSuratJalanLike;
    for (const s of grp.sjNumbers || []) {
      if (s) sjNumbersSet.add(s);
    }
    for (const r of grp.roNumbers || []) {
      if (r) roNumbersSet.add(r);
    }
  }

  const normalizedItems = normalizeConfirmedSjItems(
    allItems.length > 0
      ? allItems
      : isGroup && Array.isArray((target as GroupedSuratJalanLike).items)
        ? (target as GroupedSuratJalanLike).items!
        : primary?.items || []
  );

  const outletName =
    (isGroup ? (target as GroupedSuratJalanLike).outletName : undefined) ||
    primary?.tujuan_outlet_nama ||
    primary?.branch_name ||
    'Outlet Cabang';

  const sjNumbers = Array.from(sjNumbersSet);
  const roNumbers = Array.from(roNumbersSet);

  const resolvedSignature =
    primary?.tanda_tangan_url ||
    docs.find((d) => d?.tanda_tangan_url)?.tanda_tangan_url ||
    allItems.find((it) => it?.tanda_tangan_url || it?.signature_url)?.tanda_tangan_url ||
    allItems.find((it) => it?.signature_url)?.signature_url;

  const resolvedPhoto =
    primary?.foto_bukti_url ||
    docs.find((d) => d?.foto_bukti_url)?.foto_bukti_url ||
    allItems.find((it) => it?.foto_bukti_url || it?.photo_url)?.foto_bukti_url ||
    allItems.find((it) => it?.photo_url)?.photo_url;

  const resolvedReceiver =
    primary?.receiver_name ||
    primary?.penerima_nama ||
    docs.find((d) => d?.receiver_name || d?.penerima_nama)?.receiver_name ||
    docs.find((d) => d?.penerima_nama)?.penerima_nama;

  const consolidatedSj: SuratJalan = {
    ...primary,
    nomor_sj: sjNumbers.join(', ') || primary?.nomor_sj || primary?.sj_number,
    sj_number: sjNumbers.join(', ') || primary?.sj_number || primary?.nomor_sj,
    ro_nomor: roNumbers.join(', ') || primary?.ro_nomor || primary?.ro_number,
    ro_number: roNumbers.join(', ') || primary?.ro_number || primary?.ro_nomor,
    tujuan_outlet_nama: outletName,
    branch_name: outletName,
    receiver_name: resolvedReceiver || primary?.receiver_name,
    penerima_nama: resolvedReceiver || primary?.penerima_nama,
    tanda_tangan_url: resolvedSignature,
    foto_bukti_url: resolvedPhoto,
    items: normalizedItems,
  };

  return {
    docIds: Array.from(docIdsSet),
    sjNumbers,
    roNumbers,
    items: normalizedItems,
    outletName,
    consolidatedSj,
  };
}

/**
 * Memastikan seluruh item di dalam Surat Jalan memiliki received_quantity
 * saat Surat Jalan dikonfirmasi selesai/tiba.
 */
export function normalizeConfirmedSjItems(
  items: any[] = [],
  proofMeta?: { signatureUrl?: string; photoUrl?: string }
): any[] {
  return (items || []).map((it: any, idx: number) => {
    const orderedQty = Number(it.quantity ?? it.qty ?? it.quantity_ordered ?? it.quantity_needed ?? 1) || 1;
    const rawReceived = it.received_quantity ?? it.received_qty;
    const receivedQty =
      rawReceived !== undefined && rawReceived !== null && Number.isFinite(Number(rawReceived))
        ? Math.max(0, Math.floor(Number(rawReceived)))
        : orderedQty;

    return {
      ...it,
      quantity: orderedQty,
      qty: orderedQty,
      received_quantity: receivedQty,
      received_qty: receivedQty,
      ...(idx === 0 && proofMeta?.signatureUrl
        ? { tanda_tangan_url: proofMeta.signatureUrl, signature_url: proofMeta.signatureUrl }
        : {}),
      ...(idx === 0 && proofMeta?.photoUrl
        ? { foto_bukti_url: proofMeta.photoUrl, photo_url: proofMeta.photoUrl }
        : {}),
    };
  });
}

export interface ConfirmReceiveMeta {
  receivedDate: string;
  receiverName: string;
  notes?: string;
  roNumbers?: string[];
}

export interface RoBatchPatch {
  id: string;
  ro_number: string;
  updates: {
    items: ROItem[];
    arrival_datetime: string;
    received_date: string;
    pic_receiver: string;
    checklist_notes?: string;
    current_stage: string;
    status: string;
  };
}

/**
 * Menyinkronkan seluruh item dalam Surat Jalan yang dikonfirmasi ke dokumen Request Order (RO)
 * secara akumulatif per-RO agar tidak ada item yang saling menimpa (overwrite).
 */
export function applyConfirmedItemsToRequestOrders(
  requestOrders: RequestOrder[],
  confirmedItems: any[],
  destinationOutlet: string,
  meta: ConfirmReceiveMeta
): RoBatchPatch[] {
  const destLower = (destinationOutlet || '').toLowerCase().trim();
  const normalizedItems = normalizeConfirmedSjItems(confirmedItems);
  const isTransferReference = (value: string) => /^(dist|trf|sj|sj-dist|sj-mut|sj-trf|mut)[/_-]/i.test(value);
  const explicitRoRefs = new Set(
    (meta.roNumbers || [])
      .flatMap((r) => String(r || '').split(','))
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && !isTransferReference(s))
  );

  // Map ro.id -> mutable cloned items array
  const touchedRoMap = new Map<string, { ro: RequestOrder; items: ROItem[]; matchedItemIndices: Set<number> }>();

  const getOrInitRoEntry = (ro: RequestOrder) => {
    let entry = touchedRoMap.get(ro.id);
    if (!entry) {
      entry = {
        ro,
        items: (ro.items || []).map((ri) => ({ ...ri })),
        matchedItemIndices: new Set<number>(),
      };
      touchedRoMap.set(ro.id, entry);
    }
    return entry;
  };

  const findMatchingIndices = (
    entry: { items: ROItem[] },
    itemName: string,
    assetId: string
  ): number[] => {
    const indices: number[] = [];
    entry.items.forEach((ri, idx) => {
      if (ri.stock_source === 'CANCELLED') return;
      const riName = (ri.item_name || '').toLowerCase().trim();
      const riId = (ri.id || '').toLowerCase().trim();
      const directItemIdMatch = Boolean(riId && assetId && assetId.endsWith(riId));
      if (directItemIdMatch || (itemName && riName === itemName)) {
        indices.push(idx);
      }
    });
    return indices;
  };

  /**
   * Mencatat kuantitas yang benar-benar diterima pada item RO.
   * - `replace` dipakai saat item berhasil dicocokkan lewat referensi pasti
   *   (asset_id / nomor RO / catatan) sehingga konfirmasi ulang bersifat idempoten.
   * - Tanpa `replace` (fallback per outlet) kuantitas diakumulasi dan dibatasi
   *   oleh quantity_ordered, memakai `received_from` agar konfirmasi dokumen
   *   yang sama tidak dihitung dua kali.
   */
  const applyReceivedQuantity = (
    entry: { items: ROItem[]; matchedItemIndices: Set<number> },
    idx: number,
    receivedQty: number,
    replace: boolean,
    ref?: string
  ) => {
    const currentRi = entry.items[idx];
    if (!currentRi || currentRi.stock_source === 'CANCELLED') return;

    const ordered = Math.max(1, Number(currentRi.quantity_ordered) || 1);
    const existing = Math.max(0, Number(currentRi.quantity_fulfilled) || 0);

    if (replace) {
      const nextQty = Math.min(ordered, Math.max(0, receivedQty));
      entry.items[idx] = {
        ...currentRi,
        quantity_fulfilled: nextQty,
        received_qty: nextQty,
        stock_source: 'GUDANG_SCGA',
      };
      entry.matchedItemIndices.add(idx);
      return;
    }

    const appliedRefs = Array.isArray(currentRi.received_from) ? [...currentRi.received_from] : [];
    if (ref && appliedRefs.includes(ref)) {
      entry.matchedItemIndices.add(idx);
      return;
    }

    const nextQty = Math.min(ordered, existing + Math.max(0, receivedQty));
    entry.items[idx] = {
      ...currentRi,
      quantity_fulfilled: nextQty,
      received_qty: nextQty,
      stock_source: 'GUDANG_SCGA',
      ...(ref ? { received_from: [...appliedRefs, ref] } : {}),
    };
    entry.matchedItemIndices.add(idx);
  };

  // 1. Cocokkan setiap item Surat Jalan dengan RO memakai referensi pasti
  //    (asset_id, nomor RO pada catatan, atau nomor RO dokumen).
  const unmatchedByReference: any[] = [];

  for (const sjItem of normalizedItems) {
    const itName = String(sjItem.item_name || sjItem.nama_barang || sjItem.name || '')
      .toLowerCase()
      .trim();
    const assetId = String(sjItem.asset_id || sjItem.id || '').toLowerCase().trim();
    const notesStr = String(sjItem.notes || sjItem.catatan || '').toLowerCase();
    const parsedQty = Number(sjItem.received_quantity ?? sjItem.received_qty ?? sjItem.quantity ?? sjItem.qty ?? 1);
    const receivedQty = Number.isFinite(parsedQty) ? Math.max(0, parsedQty) : 0;

    let matchedByReference = false;

    for (const ro of requestOrders || []) {
      if (!ro || ro.status === 'REJECTED') continue;
      const roIdLower = (ro.id || '').toLowerCase().trim();
      const roNumLower = (ro.ro_number || '').toLowerCase().trim();

      const matchesByAssetId =
        Boolean(assetId) &&
        (assetId === roNumLower ||
          assetId === roIdLower ||
          (roIdLower && assetId.startsWith(`ro-${roIdLower}`)) ||
          (roNumLower && assetId.includes(roNumLower)));
      const matchesByNotes = Boolean(roNumLower) && notesStr.includes(roNumLower);
      const matchesByExplicitRo =
        (roNumLower && explicitRoRefs.has(roNumLower)) || (roIdLower && explicitRoRefs.has(roIdLower));

      if (!matchesByAssetId && !matchesByNotes && !matchesByExplicitRo) {
        continue;
      }

      const entry = getOrInitRoEntry(ro);
      const matchingIndices = findMatchingIndices(entry, itName, assetId);
      if (matchingIndices.length === 0) continue;

      for (const idx of matchingIndices) {
        applyReceivedQuantity(entry, idx, receivedQty, true);
      }
      matchedByReference = true;
      break;
    }

    if (!matchedByReference) {
      unmatchedByReference.push({ ...sjItem, receivedQty });
    }
  }

  // 2. Fallback per outlet untuk Surat Jalan tanpa referensi RO.
  //    Satu baris SJ hanya boleh menutup satu item RO (urutan dokumen),
  //    agar item dengan nama sama di RO lain tidak ikut dianggap diterima.
  for (const sjItem of unmatchedByReference) {
    const itName = String(sjItem.item_name || sjItem.nama_barang || sjItem.name || '')
      .toLowerCase()
      .trim();
    const assetId = String(sjItem.asset_id || sjItem.id || '').toLowerCase().trim();
    const receivedQty = Number(sjItem.receivedQty) || 0;
    const ref = String(sjItem.id || `${itName}:${receivedQty}`);

    for (const ro of requestOrders || []) {
      if (!ro || ro.status === 'REJECTED') continue;
      if (!destLower || (ro.branch_name || '').toLowerCase().trim() !== destLower) continue;

      const entry = getOrInitRoEntry(ro);
      const candidate = findMatchingIndices(entry, itName, assetId).find((idx) => {
        if (entry.matchedItemIndices.has(idx)) return false;
        const ri = entry.items[idx];
        const ordered = Math.max(1, Number(ri.quantity_ordered) || 1);
        return (Number(ri.quantity_fulfilled) || 0) < ordered;
      });

      if (candidate === undefined) continue;

      applyReceivedQuantity(entry, candidate, receivedQty, false, ref);
      break;
    }
  }

  // 3. Untuk RO yang disebut eksplisit, tutup item Ready Stock yang belum
  //    tercantum di Surat Jalan. Item PR_VENDOR / ON_PROSES sengaja dibiarkan
  //    agar RO tidak dianggap selesai sebelum barangnya benar-benar tiba.
  if (explicitRoRefs.size > 0) {
    for (const ro of requestOrders || []) {
      if (!ro || ro.status === 'REJECTED') continue;
      const roIdLower = (ro.id || '').toLowerCase().trim();
      const roNumLower = (ro.ro_number || '').toLowerCase().trim();
      if (!explicitRoRefs.has(roNumLower) && !explicitRoRefs.has(roIdLower)) continue;

      const entry = getOrInitRoEntry(ro);
      entry.items = entry.items.map((ri, idx) => {
        if (ri.stock_source !== 'GUDANG_SCGA') return ri;
        if (entry.matchedItemIndices.has(idx)) return ri;
        const ordered = Math.max(1, Number(ri.quantity_ordered) || 1);
        return {
          ...ri,
          quantity_fulfilled: ordered,
          received_qty: ri.received_qty ?? ordered,
        } as ROItem;
      });
    }
  }

  // 4. Bangun daftar patch per RO tanpa menurunkan tahap yang sudah lebih maju
  const STAGE_RANK: Record<string, number> = {
    REQUEST_ORDER: 0,
    INPUT_DATA: 1,
    PILIH_PROSES: 2,
    KELOLA_PR: 3,
    READY_STOCK: 4,
    SURAT_JALAN: 5,
    ASET_SAMPAI: 6,
    CHECKLIST: 7,
    CHECKLIST_DONE: 8,
    UPDATE_SLA: 9,
    SELESAI: 10,
  };
  const furthestStage = (current?: string, candidate?: string) => {
    const currentRank = STAGE_RANK[current || ''] ?? -1;
    const candidateRank = STAGE_RANK[candidate || ''] ?? -1;
    return candidateRank > currentRank ? candidate || null : current || null;
  };

  const patches: RoBatchPatch[] = [];
  for (const [, { ro, items }] of touchedRoMap.entries()) {
    const activeItems = items.filter((ri) => ri.stock_source !== 'CANCELLED');
    const allFulfilled =
      activeItems.length > 0 &&
      activeItems.every((ri) => (ri.quantity_fulfilled || 0) >= (ri.quantity_ordered || 1));

    const nextStage = allFulfilled
      ? 'SELESAI'
      : furthestStage(ro.current_stage, 'ASET_SAMPAI') || 'ASET_SAMPAI';

    patches.push({
      id: ro.id,
      ro_number: ro.ro_number,
      updates: {
        items,
        arrival_datetime: meta.receivedDate,
        received_date: meta.receivedDate,
        pic_receiver: meta.receiverName,
        ...(meta.notes ? { checklist_notes: meta.notes } : {}),
        current_stage: nextStage,
        status: allFulfilled
          ? 'COMPLETED'
          : ro.status === 'COMPLETED'
            ? 'COMPLETED'
            : 'CHECKLIST_DONE',
      },
    });
  }

  return patches;
}

