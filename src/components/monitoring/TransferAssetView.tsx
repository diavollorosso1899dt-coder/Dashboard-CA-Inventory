'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  ArrowRightLeft, 
  PlusCircle, 
  Search, 
  CheckCircle2, 
  Truck, 
  X, 
  Package, 
  Printer, 
  Trash2, 
  FileText, 
  RotateCcw, 
  Eye, 
  Check, 
  ShieldAlert,
  Building2,
  ChevronDown,
  Boxes,
  Sparkles,
  Layers,
  Calendar,
  Copy,
  LayoutGrid,
  List,
  Table as TableIcon,
  CheckCheck,
  Clock,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import { AssetTransfer, Outlet, AssetRequest, TransferStatus, TransferItem, RequestOrder } from '@/lib/supabase/types';
import { getItemImageUrl } from '@/lib/assetImageHelper';
import { formatDateOnly } from '@/lib/utils/date-formatter';
import ColumnVisibilityPicker, { ColumnItem, useColumnVisibility } from '@/components/ui/ColumnVisibilityPicker';
import AreaFilterPills from '@/components/ui/AreaFilterPills';
import { normalizeRegion, matchesRegion, StandardRegion } from '@/lib/utils/region-helper';
import { useAuth } from '@/components/auth/AuthContext';

const TRANSFER_COLUMNS: ColumnItem[] = [
  { id: 'doc_number', label: 'No. Dokumen & Surat Jalan', defaultVisible: true, alwaysVisible: true },
  { id: 'route', label: 'Rute Distribusi', defaultVisible: true },
  { id: 'dates_courier', label: 'Tanggal & Kurir', defaultVisible: true },
  { id: 'pics', label: 'PIC Pengirim / Penerima', defaultVisible: true },
  { id: 'items', label: 'Item & Tindakan Hapus', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'actions', label: 'Aksi', defaultVisible: true, alwaysVisible: true },
];

interface TransferAssetViewProps {
  initialTransfers: AssetTransfer[];
  outlets: Outlet[];
  initialAssets?: AssetRequest[];
  initialRequestOrders?: RequestOrder[];
}

export function TransferAssetView({
  initialTransfers,
  outlets,
  initialAssets = [],
  initialRequestOrders = []
}: TransferAssetViewProps) {
  const searchParams = useSearchParams();
  const urlRegion = searchParams ? searchParams.get('region') : null;
  const [regionFilter, setRegionFilter] = useState<StandardRegion>(normalizeRegion(urlRegion));

  const [transfers, setTransfers] = useState<AssetTransfer[]>(initialTransfers);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'RECEIVED' | 'ALL'>('ACTIVE');

  // Sync regionFilter when URL parameter changes
  useEffect(() => {
    setRegionFilter(normalizeRegion(searchParams ? searchParams.get('region') : null));
  }, [searchParams]);

  // Column Visibility
  const { visibleColumns, setVisibleColumns, isVisible } = useColumnVisibility(
    'ca_transfer_columns',
    TRANSFER_COLUMNS
  );
  const visibleColCount = TRANSFER_COLUMNS.filter((c) => isVisible(c.id)).length;
  
  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [selectedTransfer, setSelectedTransfer] = useState<AssetTransfer | null>(null);

  // Shortcut & Queue states
  const [isOutletMenuOpen, setIsOutletMenuOpen] = useState(false);
  const [selectedQueueOutlet, setSelectedQueueOutlet] = useState<string>('ALL');
  const [queueSourceFilter, setQueueSourceFilter] = useState<'ALL' | 'RO_ONLY' | 'MONITORING_ONLY'>('ALL');
  const [queueViewMode, setQueueViewMode] = useState<'grid' | 'detail' | 'table'>('grid');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [viewingAsset, setViewingAsset] = useState<AssetRequest | null>(null);
  const [requestOrders, setRequestOrders] = useState<RequestOrder[]>(initialRequestOrders || []);
  const [monitoringAssets, setMonitoringAssets] = useState<AssetRequest[]>(initialAssets || []);
  const [lastRoSyncTime, setLastRoSyncTime] = useState<Date>(new Date());

  // Authentication & Superuser check
  const { user } = useAuth();
  const isSuperUser = Boolean(
    user?.role === 'Super User' || 
    user?.role === 'super_user' || 
    user?.email === 'superuser@coffee-arabica.co.id'
  );

  // Dispatched items tracking
  const [dispatchedKeys, setDispatchedKeys] = useState<string[]>([]);
  const [isSuperUserModalOpen, setIsSuperUserModalOpen] = useState(false);
  const [superUserPasswordInput, setSuperUserPasswordInput] = useState('');
  const [superUserError, setSuperUserError] = useState<string | null>(null);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{
    transfer: AssetTransfer;
    item: TransferItem;
  } | null>(null);

  // Jumlah fisik real yang diterima outlet (diisi manual saat distribusi)
  const [receivedQtyMap, setReceivedQtyMap] = useState<Record<string, number>>({});
  const [receiveItemQtys, setReceiveItemQtys] = useState<Record<string, number>>({});

  // Load saved view mode and dispatched keys from localStorage
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('ca_queue_view_mode') as 'grid' | 'detail' | 'table';
      if (savedMode && ['grid', 'detail', 'table'].includes(savedMode)) {
        setQueueViewMode(savedMode);
      }
      const savedDispatched = localStorage.getItem('ca_dispatched_asset_keys');
      if (savedDispatched) {
        setDispatchedKeys(JSON.parse(savedDispatched));
      }
      const savedReceivedQty = localStorage.getItem('ca_received_qty_map');
      if (savedReceivedQty) {
        setReceivedQtyMap(JSON.parse(savedReceivedQty));
      }
    } catch (e) {}
  }, []);

  const handleChangeViewMode = (mode: 'grid' | 'detail' | 'table') => {
    setQueueViewMode(mode);
    try {
      localStorage.setItem('ca_queue_view_mode', mode);
    } catch (e) {}
  };

  // Helper: kunci unik antrean aset & jumlah real yang diterima outlet
  const getQueueAssetKey = (asset: AssetRequest) =>
    asset.id || asset.external_id || `${asset.branch_name || ''}:::${asset.item_name || ''}`;

  const getReceivedQty = (asset: AssetRequest) => {
    const key = getQueueAssetKey(asset);
    const stored = receivedQtyMap[key];
    if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
    return asset.quantity_needed || 1;
  };

  const handleReceivedQtyChange = (asset: AssetRequest, rawValue: string) => {
    const key = getQueueAssetKey(asset);
    const parsed = Math.max(0, Math.floor(Number(rawValue) || 0));
    const cleanItem = (asset.item_name || '').trim();
    const lowerItem = cleanItem.toLowerCase();
    const branch = (asset.branch_name || '').trim();
    const extId = (asset.external_id || '').trim();

    setReceivedQtyMap((prev) => {
      const next: Record<string, number> = { ...prev, [key]: parsed };
      if (branch && cleanItem) {
        next[`${branch}:::${cleanItem}`] = parsed;
        next[`${branch.toLowerCase()}:::${lowerItem}`] = parsed;
      }
      if (extId && cleanItem) {
        next[`${extId}:::${cleanItem}`] = parsed;
        next[`${extId.toLowerCase()}:::${lowerItem}`] = parsed;
      }
      try {
        localStorage.setItem('ca_received_qty_map', JSON.stringify(next));
        window.dispatchEvent(new Event('ca_received_qty_updated'));
      } catch (e) {}
      return next;
    });
  };

  const copyToClipboard = async (text: string, label: string, id: string = 'global') => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedId(id);
      setCopyFeedback(`Data ${label} berhasil disalin ke clipboard!`);
      setTimeout(() => {
        setCopiedId(null);
        setCopyFeedback(null);
      }, 2500);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const formatOutletText = (grp: { branchName: string; assets: AssetRequest[]; totalUnits: number; count: number }) => {
    const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const lines = [
      `📦 *ANTREAN DISTRIBUSI - ${grp.branchName.toUpperCase()}*`,
      `Total: ${grp.count} Item (${grp.totalUnits} Unit) | ${dateStr}`,
      `----------------------------------------`,
    ];

    grp.assets.forEach((a, idx) => {
      const rawDate = a.order_datetime || (a as any).request_date || (a.created_at ? a.created_at.split('T')[0] : null);
      const reqDate = rawDate ? (rawDate.includes('T') ? rawDate.split('T')[0] : rawDate.split(' ')[0]) : null;
      const note = a.item_notes || (a.notes && !a.notes.startsWith('No. RO:') ? a.notes : '');

      lines.push(`${idx + 1}. ${a.item_name} (${a.quantity_needed || 1} unit)`);
      const receivedQty = getReceivedQty(a);
      if (receivedQty !== (a.quantity_needed || 1)) {
        lines.push(`   • Jumlah Diterima: ${receivedQty} unit`);
      }
      if (a.external_id) lines.push(`   • No. RO: ${a.external_id}`);
      if (reqDate) lines.push(`   • Tgl Permintaan: ${formatDateOnly(reqDate)}`);
      if (a.specification) lines.push(`   • Spesifikasi: ${a.specification}`);
      if (note) lines.push(`   • Catatan: ${note}`);
    });

    return lines.join('\n');
  };

  const formatAllQueueText = () => {
    const activeGroups = outletGroups.filter(
      (grp) => selectedQueueOutlet === 'ALL' || grp.branchName === selectedQueueOutlet
    );
    if (activeGroups.length === 0) return 'Tidak ada data antrean distribusi.';

    const totalAllItems = activeGroups.reduce((acc, g) => acc + g.count, 0);
    const totalAllUnits = activeGroups.reduce((acc, g) => acc + g.totalUnits, 0);
    const nowStr = new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const sections = [
      `🚚 *REKAP ANTREAN ASET SIAP DISTRIBUSI*`,
      `Total: ${activeGroups.length} Cabang | ${totalAllItems} Item (${totalAllUnits} Unit)`,
      `Waktu Rekap: ${nowStr}`,
      `========================================\n`,
    ];

    activeGroups.forEach((grp) => {
      sections.push(formatOutletText(grp));
      sections.push('\n');
    });

    return sections.join('\n');
  };

  const formatSingleItemText = (asset: AssetRequest, branchName: string) => {
    const rawDate = asset.order_datetime || (asset as any).request_date || (asset.created_at ? asset.created_at.split('T')[0] : null);
    const reqDate = rawDate ? (rawDate.includes('T') ? rawDate.split('T')[0] : rawDate.split(' ')[0]) : null;
    const note = asset.item_notes || (asset.notes && !asset.notes.startsWith('No. RO:') ? asset.notes : '');

    let text = `📦 ${asset.item_name} (${asset.quantity_needed || 1} unit) - Tujuan: ${branchName}`;
    const receivedQty = getReceivedQty(asset);
    if (receivedQty !== (asset.quantity_needed || 1)) text += ` | Diterima: ${receivedQty} unit`;
    if (asset.external_id) text += ` | RO: ${asset.external_id}`;
    if (reqDate) text += ` | Tgl: ${formatDateOnly(reqDate)}`;
    if (asset.specification) text += ` | Spek: ${asset.specification}`;
    if (note) text += ` | Catatan: "${note}"`;
    return text;
  };

  const formatTransferDocText = (t: AssetTransfer) => {
    const itemsCount = t.items?.length || 0;
    const lines = [
      `📄 *SURAT JALAN DISTRIBUSI: ${t.transfer_number}*`,
      `Rute: ${t.from_location} ➔ ${t.to_location}`,
      `Status: ${t.status === 'IN_TRANSIT' ? 'Dalam Perjalanan' : t.status === 'RECEIVED' ? 'Diterima' : t.status}`,
      `Kurir: ${t.expedition_courier || '-'} | Resi: ${t.tracking_number || '-'}`,
      `Tanggal Kirim: ${t.transfer_date ? formatDateOnly(t.transfer_date) : '-'}`,
      `PIC Pengirim: ${t.sender_pic || '-'} | PIC Penerima: ${t.receiver_pic || '-'}`,
      `Item (${itemsCount}):`,
    ];
    (t.items || []).forEach((it, idx) => {
      const received = it.received_quantity ?? it.quantity;
      const receivedInfo = received !== it.quantity ? ` | Diterima: ${received} unit` : '';
      lines.push(`${idx + 1}. ${it.item_name} (${it.quantity} unit)${receivedInfo} ${it.notes ? `[${it.notes}]` : ''}`);
    });
    if (t.notes) lines.push(`Catatan: ${t.notes}`);
    return lines.join('\n');
  };

  const formatAllTransfersText = () => {
    if (filteredTransfers.length === 0) return 'Tidak ada dokumen distribusi.';
    const lines = [
      `📋 *DAFTAR DOKUMEN SURAT JALAN DISTRIBUSI (${filteredTransfers.length})*`,
      `========================================\n`,
    ];
    filteredTransfers.forEach((t) => {
      lines.push(formatTransferDocText(t));
      lines.push('\n----------------------------------------\n');
    });
    return lines.join('\n');
  };

  // Sync monitoringAssets with initialAssets prop
  useEffect(() => {
    if (initialAssets && initialAssets.length > 0) {
      setMonitoringAssets(initialAssets);
    }
  }, [initialAssets]);

  // Real-time synchronization dengan Kelola RO (/api/distribution/ro) dan Aset (/api/assets)
  useEffect(() => {
    let isMounted = true;
    const fetchLatestRo = async () => {
      try {
        const res = await fetch('/api/distribution/ro');
        if (res.ok) {
          const json = await res.json();
          if (json.data && Array.isArray(json.data) && isMounted) {
            setRequestOrders(json.data);
            setLastRoSyncTime(new Date());
          }
        }
      } catch (err) {
        // silent fallback
      }
    };

    const fetchLatestAssets = async () => {
      try {
        const res = await fetch('/api/assets?limit=5000');
        if (res.ok) {
          const json = await res.json();
          if (json.data && Array.isArray(json.data) && isMounted) {
            setMonitoringAssets(json.data);
          }
        }
      } catch (err) {
        // silent fallback
      }
    };

    fetchLatestRo();
    fetchLatestAssets();
    const interval = setInterval(() => {
      fetchLatestRo();
      fetchLatestAssets();
    }, 3500);

    const handleDataUpdated = () => {
      fetchLatestRo();
      fetchLatestAssets();
    };
    window.addEventListener('storage', handleDataUpdated);
    window.addEventListener('ca_ro_updated', handleDataUpdated);
    window.addEventListener('ca_pr_updated', handleDataUpdated);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('storage', handleDataUpdated);
      window.removeEventListener('ca_ro_updated', handleDataUpdated);
      window.removeEventListener('ca_pr_updated', handleDataUpdated);
    };
  }, []);

  // Outlet Region Map for fast lookup
  const outletRegionMap = useMemo(() => {
    const map = new Map<string, string>();
    (outlets || []).forEach((o) => {
      const name = ((o as any).name || (o as any).branch_name || (o as any).nama || '').toLowerCase().trim();
      if (name) map.set(name, (o as any).region);
    });
    return map;
  }, [outlets]);

  // Ekstrak item Ready Stock dari Kelola RO secara Real-Time
  const roReadyAssets = useMemo(() => {
    const list: AssetRequest[] = [];
    (requestOrders || []).forEach((ro) => {
      if (ro.status === 'REJECTED' || ro.current_stage === 'DIBATALKAN') return;
      if (!matchesRegion(ro.region, regionFilter)) return;

      // Dokumen RO yang memiliki item Ready Stock atau sudah dialokasikan statusnya
      const hasReadyItem = (ro.items || []).some((it) => it.stock_source === 'GUDANG_SCGA');
      const isRoExplicitlyProcessed = 
        hasReadyItem ||
        ro.notes?.includes('[PROCESSED_FROM_RO]') ||
        ro.current_stage === 'READY_STOCK' ||
        ro.current_stage === 'SURAT_JALAN' ||
        ro.current_stage === 'ASET_SAMPAI' ||
        ro.current_stage === 'CHECKLIST' ||
        ro.current_stage === 'SELESAI' ||
        ro.current_stage === 'KELOLA_PR' ||
        (ro.status as string) === 'IN_DELIVERY';

      if (!isRoExplicitlyProcessed) {
        return;
      }

      const roDate = ro.request_date || (ro.created_at ? ro.created_at.split('T')[0] : null);
      (ro.items || []).forEach((item) => {
        // Hanya item yang berstatus Ready Stock (GUDANG_SCGA)
        if (item.stock_source === 'GUDANG_SCGA') {
          list.push({
            id: `ro-${ro.id}-${item.id || encodeURIComponent(item.item_name)}`,
            external_id: ro.ro_number,
            branch_name: ro.branch_name,
            region: ro.region,
            item_name: item.item_name,
            system_item_name: item.item_name,
            quantity_needed: item.quantity_ordered,
            classification: 'Ready Stock (Gudang SCGA)',
            specification: item.specification || '',
            photo_url: item.photo_url || null,
            item_delivery_status: 'Ready Antar',
            notes: item.notes || `No. RO: ${ro.ro_number} • Pemohon: ${ro.requester_name}`,
            item_notes: item.notes || '',
            order_datetime: roDate,
            created_at: ro.created_at || new Date().toISOString(),
            updated_at: ro.updated_at || new Date().toISOString(),
          } as AssetRequest);
        }
      });
    });
    return list;
  }, [requestOrders, regionFilter]);

  // Antrean aset dari tabel Monitoring Permohonan Aset
  const baseMonitoringReadyAssets = useMemo(() => {
    let storedIds: string[] = [];
    try {
      const saved = localStorage.getItem('ca_system_transfer_ids');
      if (saved) {
        storedIds = JSON.parse(saved);
      }
    } catch (e) {}

    return (monitoringAssets || []).filter((a) => {
      if (!matchesRegion(a.region, regionFilter)) return false;
      const status = (a.item_delivery_status || '').trim().toLowerCase();
      const isStored = Boolean(
        (a.id && storedIds.includes(a.id)) ||
        (a.external_id && storedIds.includes(a.external_id))
      );
      return status === 'ready antar' || Boolean(a.is_system_transfer) || isStored;
    });
  }, [monitoringAssets, regionFilter]);

  // Set of transferred / dispatched item keys to filter out from Outlet Queue
  const transferredKeysSet = useMemo(() => {
    const set = new Set<string>();

    (transfers || []).forEach((t) => {
      if (t.status === 'CANCELLED') return;
      const dest = (t.to_location || '').toLowerCase().trim();
      (t.items || []).forEach((item) => {
        if (item.asset_id) {
          set.add(item.asset_id.toLowerCase().trim());
        }
        const itName = (item.item_name || '').toLowerCase().trim();
        if (itName && dest) {
          set.add(`${dest}:::${itName}`);
        }
        if (item.notes) {
          const roMatch = item.notes.match(/RO[:\-\s]*([A-Za-z0-9\-]+)/i);
          if (roMatch && roMatch[1] && dest) {
            set.add(`${dest}:::${roMatch[1].toLowerCase().trim()}:::${itName}`);
          }
        }
      });
    });

    dispatchedKeys.forEach((k) => set.add(k.toLowerCase().trim()));

    return set;
  }, [transfers, dispatchedKeys]);

  // Automatic Queue of Assets (Gabungan Kelola RO Ready Stock & Monitoring Aset)
  const readyDistributionAssets = useMemo(() => {
    let rawList: AssetRequest[] = [];
    if (queueSourceFilter === 'RO_ONLY') {
      rawList = roReadyAssets;
    } else if (queueSourceFilter === 'MONITORING_ONLY') {
      rawList = baseMonitoringReadyAssets;
    } else {
      rawList = [...roReadyAssets, ...baseMonitoringReadyAssets];
    }

    // Filter out items that are already transferred or dispatched
    return rawList.filter((asset) => {
      const assetId = (asset.id || '').toLowerCase().trim();
      const extId = (asset.external_id || '').toLowerCase().trim();
      const branch = (asset.branch_name || '').toLowerCase().trim();
      const itemName = (asset.item_name || '').toLowerCase().trim();
      const branchItemKey = `${branch}:::${itemName}`;
      const branchExtItemKey = extId ? `${branch}:::${extId}:::${itemName}` : '';

      if (assetId && transferredKeysSet.has(assetId)) return false;
      if (branchItemKey && transferredKeysSet.has(branchItemKey)) return false;
      if (branchExtItemKey && transferredKeysSet.has(branchExtItemKey)) return false;

      return true;
    });
  }, [roReadyAssets, baseMonitoringReadyAssets, queueSourceFilter, transferredKeysSet]);

  // Group ready assets by outlet/branch name
  const groupedReadyAssets = useMemo(() => {
    const groups: Record<string, AssetRequest[]> = {};
    readyDistributionAssets.forEach((asset) => {
      const branch = (asset.branch_name || 'Tanpa Outlet / Cabang').trim();
      if (!groups[branch]) {
        groups[branch] = [];
      }
      groups[branch].push(asset);
    });
    return groups;
  }, [readyDistributionAssets]);

  const outletGroups = useMemo(() => {
    return Object.entries(groupedReadyAssets).map(([branchName, assets]) => {
      const totalUnits = assets.reduce((sum, a) => sum + (a.quantity_needed || 1), 0);
      return { branchName, assets, totalUnits, count: assets.length };
    });
  }, [groupedReadyAssets]);

  // Create Form State
  const [sourceType, setSourceType] = useState<'GUDANG_PUSAT' | 'OUTLET'>('GUDANG_PUSAT');
  const [fromLocation, setFromLocation] = useState('Gudang Pusat SCGA');
  const [destinationType, setDestinationType] = useState<'OUTLET' | 'GUDANG_PUSAT'>('OUTLET');
  const [toLocation, setToLocation] = useState(outlets[0]?.branch_name || 'Mie Ayam Muntjul Karawang');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [senderPic, setSenderPic] = useState('Staff Logistik SCGA');
  const [receiverPic, setReceiverPic] = useState('');
  const [expeditionCourier, setExpeditionCourier] = useState('Armada Internal SCGA');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Item form inside create modal
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemSpecification, setItemSpecification] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemCondition, setItemCondition] = useState<'BAIK' | 'PERLU_PERBAIKAN' | 'BEKAS_LAYAK'>('BAIK');
  const [itemNotes, setItemNotes] = useState('');
  const [itemsList, setItemsList] = useState<TransferItem[]>([]);

  // Receive Form State
  const [receivePic, setReceivePic] = useState('');
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiveNotes, setReceiveNotes] = useState('');

  // Handle URL search params from Asset Table multi-select
  useEffect(() => {
    const itemsParam = searchParams.get('items');
    if (itemsParam) {
      try {
        const parsed = JSON.parse(itemsParam);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const importedItems: TransferItem[] = parsed.map((it: { item_name: string; quantity?: number }, idx: number) => ({
            id: `ti-imp-${Date.now()}-${idx}`,
            item_name: it.item_name || 'Item Aset',
            quantity: Number(it.quantity) || 1,
            condition: 'BAIK',
          }));
          setItemsList(importedItems);
          setNotes('Diimpor otomatis dari seleksi tabel Monitoring Status: Daftar Aset.');
          setIsCreateModalOpen(true);
        }
      } catch (err) {
        console.error('Failed to parse items param:', err);
      }
    }
  }, [searchParams]);

  // When asset is picked from dropdown in create modal
  const handleAssetSelect = (assetId: string) => {
    setSelectedAssetId(assetId);
    const asset = initialAssets.find((a) => (a.id === assetId || a.external_id === assetId));
    if (asset) {
      setItemName(asset.item_name);
      setItemSpecification(asset.classification || '');
      setItemQty(asset.quantity_needed || 1);
      if (asset.branch_name && sourceType === 'OUTLET') {
        setFromLocation(asset.branch_name);
      }
    }
  };

  const handleAddItem = () => {
    if (!itemName.trim()) return;
    setItemsList((prev) => [
      ...prev,
      {
        id: `ti-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        asset_id: selectedAssetId || undefined,
        item_name: itemName.trim(),
        specification: itemSpecification.trim() || undefined,
        quantity: itemQty > 0 ? itemQty : 1,
        condition: itemCondition,
        notes: itemNotes.trim() || undefined,
      },
    ]);
    setItemName('');
    setItemSpecification('');
    setItemQty(1);
    setItemNotes('');
    setSelectedAssetId('');
  };

  const handleRemoveItem = (id: string) => {
    setItemsList((prev) => prev.filter((it) => it.id !== id));
  };

  const handleProcessFromQueue = (selected: AssetRequest[], targetOutletName?: string) => {
    const targetOutlet = targetOutletName || selected[0]?.branch_name || '';
    const formattedItems: TransferItem[] = selected.map((a, idx) => {
      const itemNote = a.item_notes || (a.notes && !a.notes.startsWith('No. RO:') ? a.notes : '');
      return {
        id: `ti-dist-${Date.now()}-${idx}`,
        asset_id: a.id || a.external_id,
        item_name: a.item_name,
        specification: a.classification,
        quantity: a.quantity_needed || 1,
        received_quantity: getReceivedQty(a),
        condition: 'BAIK',
        notes: itemNote || (a.notes || ''),
      };
    });

    setItemsList(formattedItems);
    setDestinationType('OUTLET');
    if (targetOutlet) {
      setToLocation(targetOutlet);
    }
    setNotes(`Surat Jalan Distribusi untuk outlet ${targetOutlet || 'Cabang'} (${selected.length} item aset).`);
    setIsCreateModalOpen(true);
  };

  // Submit New Distribution Document
  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itemsList.length === 0) {
      alert('Tambahkan minimal 1 item untuk didistribusikan.');
      return;
    }

    try {
      setIsSubmitting(true);
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);

      const payload: Partial<AssetTransfer> = {
        transfer_number: `DIST/${year}/${rand}`,
        surat_jalan_number: `SJ-DIST/${year}/${rand}`,
        source_type: sourceType,
        from_location: fromLocation,
        destination_type: destinationType,
        to_location: toLocation,
        transfer_date: transferDate,
        status: 'IN_TRANSIT',
        sender_pic: senderPic,
        receiver_pic: receiverPic,
        expedition_courier: expeditionCourier,
        tracking_number: trackingNumber || `RESI-${Date.now().toString().slice(-6)}`,
        items: itemsList,
        notes,
      };

      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setTransfers((prev) => [json.data, ...prev]);
        setIsCreateModalOpen(false);

        // Record all dispatched items so they disappear from Outlet queue
        const newlyDispatched: string[] = [];
        itemsList.forEach((it) => {
          if (it.asset_id) newlyDispatched.push(it.asset_id);
          if (it.item_name && toLocation) {
            newlyDispatched.push(`${toLocation.toLowerCase()}:::${it.item_name.toLowerCase()}`);
          }
        });

        const updatedKeys = Array.from(new Set([...dispatchedKeys, ...newlyDispatched])).filter(Boolean);
        setDispatchedKeys(updatedKeys);
        try {
          localStorage.setItem('ca_dispatched_asset_keys', JSON.stringify(updatedKeys));
        } catch (e) {}

        setItemsList([]);
        setNotes('');
        setTrackingNumber('');
        setCopyFeedback(`Surat Jalan ${json.data.surat_jalan_number} berhasil diterbitkan (${itemsList.length} item).`);
        setTimeout(() => setCopyFeedback(null), 3500);
      } else {
        alert(json.error || 'Gagal membuat dokumen surat jalan pendistribusian');
      }
    } catch (err: any) {
      console.error('Failed to submit transfer:', err);
      alert(`Terjadi kesalahan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Direct Ship Single Item ("Kirim Ini Saja")
  const handleDirectShipSingleItem = async (asset: AssetRequest, branchName: string) => {
    const orderedQty = asset.quantity_needed || 1;
    const receivedQty = getReceivedQty(asset);
    const qtyMismatch = receivedQty !== orderedQty;
    const confirmSend = window.confirm(
      `Terbitkan Surat Jalan & kirim item ini sekarang?\n\n• Item: ${asset.item_name}\n• Jumlah Diminta: ${orderedQty} unit\n• Jumlah Diterima: ${receivedQty} unit\n• Cabang Tujuan: ${branchName}\n\n${qtyMismatch ? `⚠️ Jumlah diterima berbeda dari jumlah diminta (${receivedQty} dari ${orderedQty} unit).\n\n` : ''}Item akan langsung dipindahkan ke Daftar Dokumen Distribusi dan dihapus dari antrean Outlet.`
    );
    if (!confirmSend) return;

    try {
      setIsSubmitting(true);
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      const itemNote = asset.item_notes || (asset.notes && !asset.notes.startsWith('No. RO:') ? asset.notes : '');
      const assetKey = asset.id || asset.external_id || `${branchName}:::${asset.item_name}`;

      const formattedItem: TransferItem = {
        id: `ti-dist-${Date.now()}-0`,
        asset_id: asset.id || asset.external_id,
        item_name: asset.item_name,
        specification: asset.classification || asset.specification || '',
        quantity: orderedQty,
        received_quantity: receivedQty,
        condition: 'BAIK',
        notes: itemNote || (asset.notes || ''),
      };

      const payload: Partial<AssetTransfer> = {
        transfer_number: `DIST/${year}/${rand}`,
        surat_jalan_number: `SJ-DIST/${year}/${rand}`,
        source_type: 'GUDANG_PUSAT',
        from_location: 'Gudang Pusat SCGA',
        destination_type: 'OUTLET',
        to_location: branchName,
        transfer_date: new Date().toISOString().split('T')[0],
        status: 'IN_TRANSIT',
        sender_pic: user?.full_name || 'Staff Logistik SCGA',
        receiver_pic: '',
        expedition_courier: 'Armada Internal SCGA',
        tracking_number: `RESI-${Date.now().toString().slice(-6)}`,
        items: [formattedItem],
        notes: `Surat Jalan Distribusi khusus untuk ${asset.item_name} ke ${branchName}.`,
      };

      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setTransfers((prev) => [json.data, ...prev]);

        const newKeys = Array.from(new Set([
          ...dispatchedKeys,
          assetKey,
          asset.id || '',
          asset.external_id || '',
          `${branchName.toLowerCase()}:::${asset.item_name.toLowerCase()}`
        ])).filter(Boolean);

        setDispatchedKeys(newKeys);
        try {
          localStorage.setItem('ca_dispatched_asset_keys', JSON.stringify(newKeys));
        } catch (e) {}

        setCopyFeedback(`Surat Jalan ${json.data.surat_jalan_number} berhasil diterbitkan! Item "${asset.item_name}" dipindahkan ke Dokumen Distribusi.`);
        setTimeout(() => setCopyFeedback(null), 3500);
      } else {
        alert(json.error || 'Gagal menerbitkan surat jalan pendistribusian');
      }
    } catch (err: any) {
      console.error('Failed to submit direct transfer:', err);
      alert(`Terjadi kesalahan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete item from distribution document (Restricted to Superuser)
  const promptDeleteItem = (transfer: AssetTransfer, item: TransferItem) => {
    if (isSuperUser) {
      const confirmDelete = window.confirm(
        `Hapus item "${item.item_name}" (${item.quantity} unit) dari Dokumen Distribusi ${transfer.surat_jalan_number || transfer.transfer_number}?\n\nItem ini akan otomatis dikembalikan ke kolom antrean Outlet.`
      );
      if (confirmDelete) {
        executeDeleteItem(transfer, item);
      }
    } else {
      setPendingDeleteAction({ transfer, item });
      setSuperUserPasswordInput('');
      setSuperUserError(null);
      setIsSuperUserModalOpen(true);
    }
  };

  const handleVerifySuperUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (superUserPasswordInput !== 'usergacor') {
      setSuperUserError('Kata sandi Superuser salah. Akses ditolak!');
      return;
    }
    setIsSuperUserModalOpen(false);
    if (pendingDeleteAction) {
      await executeDeleteItem(pendingDeleteAction.transfer, pendingDeleteAction.item);
      setPendingDeleteAction(null);
    }
  };

  const executeDeleteItem = async (transfer: AssetTransfer, itemToDelete: TransferItem) => {
    try {
      setIsSubmitting(true);
      const remainingItems = (transfer.items || []).filter((it) => it.id !== itemToDelete.id);

      if (remainingItems.length === 0) {
        // Hapus dokumen transfer secara keseluruhan jika tidak ada item tersisa
        const res = await fetch(`/api/transfers?id=${transfer.id}`, {
          method: 'DELETE',
        });
        const json = await res.json();
        if (!json.success) {
          alert(json.error || 'Gagal menghapus dokumen transfer');
          return;
        }

        setTransfers((prev) => prev.filter((t) => t.id !== transfer.id));
        if (selectedTransfer?.id === transfer.id) {
          setIsDetailModalOpen(false);
          setSelectedTransfer(null);
        }
      } else {
        // Update item tersisa pada dokumen transfer
        const res = await fetch('/api/transfers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: transfer.id,
            items: remainingItems,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          alert(json.error || 'Gagal memperbarui item dokumen transfer');
          return;
        }

        const updatedDoc = json.data;
        setTransfers((prev) => prev.map((t) => (t.id === transfer.id ? updatedDoc : t)));
        if (selectedTransfer?.id === transfer.id) {
          setSelectedTransfer(updatedDoc);
        }
      }

      // Hapus dari dispatchedKeys agar item kembali muncul di kolom antrean outlet
      const targetBranch = (transfer.to_location || '').toLowerCase().trim();
      const targetItem = (itemToDelete.item_name || '').toLowerCase().trim();
      const branchKey = `${targetBranch}:::${targetItem}`;

      const updatedKeys = dispatchedKeys.filter(
        (k) => 
          k.toLowerCase() !== (itemToDelete.asset_id || '').toLowerCase() &&
          k.toLowerCase() !== branchKey &&
          k.toLowerCase() !== targetItem
      );
      setDispatchedKeys(updatedKeys);
      try {
        localStorage.setItem('ca_dispatched_asset_keys', JSON.stringify(updatedKeys));
      } catch (e) {}

      setCopyFeedback(`Item "${itemToDelete.item_name}" berhasil dihapus dari Dokumen Distribusi & dikembalikan ke antrean Outlet.`);
      setTimeout(() => setCopyFeedback(null), 3500);
    } catch (err: any) {
      console.error('Failed to delete item from transfer:', err);
      alert(`Terjadi kesalahan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm Received in Destination
  const handleOpenReceiveModal = (transfer: AssetTransfer) => {
    setSelectedTransfer(transfer);
    setReceivePic(transfer.receiver_pic || '');
    setReceiveDate(new Date().toISOString().split('T')[0]);
    setReceiveNotes('Aset diterima di cabang dalam kondisi lengkap dan baik sesuai Surat Jalan.');
    const qtys: Record<string, number> = {};
    (transfer.items || []).forEach((item) => {
      qtys[item.id] = item.received_quantity ?? item.quantity;
    });
    setReceiveItemQtys(qtys);
    setIsReceiveModalOpen(true);
  };

  const handleSubmitReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransfer) return;
    if (!receivePic.trim()) {
      alert('Masukkan nama PIC Penerima di cabang outlet tujuan.');
      return;
    }

    try {
      setIsSubmitting(true);
      const updatedItems: TransferItem[] = (selectedTransfer.items || []).map((item) => {
        const inputQty = receiveItemQtys[item.id];
        const receivedQty =
          typeof inputQty === 'number' && Number.isFinite(inputQty)
            ? Math.max(0, Math.floor(inputQty))
            : (item.received_quantity ?? item.quantity);
        return { ...item, received_quantity: receivedQty };
      });

      const res = await fetch('/api/transfers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedTransfer.id,
          status: 'RECEIVED',
          receiver_pic: receivePic.trim(),
          received_date: receiveDate,
          received_notes: receiveNotes.trim(),
          items: updatedItems,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setTransfers((prev) => prev.map((t) => (t.id === selectedTransfer.id ? json.data : t)));
        setIsReceiveModalOpen(false);

        // Sinkronisasi item yang diterima ke Kelola RO untuk pengukuran SLA
        try {
          const destOutlet = (selectedTransfer.to_location || '').toLowerCase().trim();
          for (const item of updatedItems) {
            const itName = (item.item_name || '').toLowerCase().trim();
            const receivedQty = item.received_quantity ?? item.quantity;
            // Cari dokumen RO yang cocok
            const targetRo = (requestOrders || []).find((ro) => {
              if (item.asset_id && (item.asset_id === ro.ro_number || item.asset_id.startsWith(`ro-${ro.id}`))) {
                return true;
              }
              if (item.notes && item.notes.includes(ro.ro_number)) {
                return true;
              }
              const roBranch = (ro.branch_name || '').toLowerCase().trim();
              if (roBranch === destOutlet && (ro.items || []).some((ri) => (ri.item_name || '').toLowerCase().trim() === itName)) {
                return true;
              }
              return false;
            });

            if (targetRo) {
              const updatedRoItems = (targetRo.items || []).map((ri) => {
                if ((ri.item_name || '').toLowerCase().trim() === itName) {
                  return {
                    ...ri,
                    quantity_fulfilled: receivedQty,
                    received_qty: receivedQty,
                    stock_source: 'GUDANG_SCGA',
                  };
                }
                return ri;
              });

              const allFulfilled = updatedRoItems.every(
                (ri) => (ri.quantity_fulfilled || 0) >= (ri.quantity_ordered || 1)
              );

              await fetch('/api/distribution/ro', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: targetRo.id,
                  updates: {
                    items: updatedRoItems,
                    arrival_datetime: receiveDate,
                    received_date: receiveDate,
                    pic_receiver: receivePic.trim(),
                    checklist_notes: receiveNotes.trim(),
                    current_stage: allFulfilled ? 'SELESAI' : 'ASET_SAMPAI',
                    status: allFulfilled ? 'COMPLETED' : targetRo.status,
                  },
                }),
              });
            }
          }
          window.dispatchEvent(new Event('ca_ro_updated'));
          window.dispatchEvent(new Event('storage'));
        } catch (syncErr) {
          console.warn('Sync to RO failed:', syncErr);
        }

        setSelectedTransfer(null);
        setCopyFeedback(`Aset berhasil diterima outlet! Dokumen keluar dari antrean aktif dan data item masuk ke Monitoring SLA.`);
        setTimeout(() => setCopyFeedback(null), 4500);
      } else {
        alert(json.error || 'Gagal mengonfirmasi penerimaan aset di outlet');
      }
    } catch (err: any) {
      console.error('Failed to update receive status:', err);
      alert(`Terjadi kesalahan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Full Reset
  const handleExecuteResetAll = async () => {
    try {
      setIsResetting(true);
      const res = await fetch('/api/transfers/reset', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        try {
          localStorage.removeItem('ca_system_transfer_ids');
        } catch (e) {}
        setTransfers([]);
        window.dispatchEvent(new Event('ca_transfers_reset'));
        setIsResetConfirmOpen(false);
      } else {
        alert(json.error || 'Gagal mereset data pendistribusian');
      }
    } catch (err: any) {
      console.error('Error during full reset:', err);
      alert(`Terjadi kesalahan: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    const regionMatching = transfers.filter((t) => {
      const tReg = (t as any).region || outletRegionMap.get((t.to_location || '').toLowerCase().trim()) || (t.to_location.toLowerCase().includes('kalbar') ? 'KALBAR' : 'JABODETABEK');
      return matchesRegion(tReg, regionFilter);
    });
    const total = regionMatching.length;
    const inTransit = regionMatching.filter((t) => t.status === 'IN_TRANSIT').length;
    const received = regionMatching.filter((t) => t.status === 'RECEIVED' || t.status === 'COMPLETED').length;
    return { total, inTransit, received };
  }, [transfers, regionFilter, outletRegionMap]);

  // Filtered transfers
  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      const tReg = (t as any).region || outletRegionMap.get((t.to_location || '').toLowerCase().trim()) || (t.to_location.toLowerCase().includes('kalbar') ? 'KALBAR' : 'JABODETABEK');
      if (!matchesRegion(tReg, regionFilter)) return false;

      // Status filter logic: Dokumen yang sudah diterima outlet keluar dari daftar aktif
      if (statusFilter === 'ACTIVE') {
        if (t.status === 'RECEIVED' || t.status === 'COMPLETED') return false;
      } else if (statusFilter === 'RECEIVED') {
        if (t.status !== 'RECEIVED' && t.status !== 'COMPLETED') return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          t.transfer_number.toLowerCase().includes(q) ||
          (t.surat_jalan_number && t.surat_jalan_number.toLowerCase().includes(q)) ||
          t.from_location.toLowerCase().includes(q) ||
          t.to_location.toLowerCase().includes(q) ||
          t.sender_pic.toLowerCase().includes(q) ||
          (t.receiver_pic && t.receiver_pic.toLowerCase().includes(q)) ||
          (t.expedition_courier && t.expedition_courier.toLowerCase().includes(q)) ||
          (t.tracking_number && t.tracking_number.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [transfers, statusFilter, search, regionFilter, outletRegionMap]);

  return (
    <div className="space-y-6">
      {/* Top Action & Filter Toolbar */}
      <div className="panel-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-2xl flex-wrap">
          <AreaFilterPills
            value={regionFilter}
            onChange={(r) => setRegionFilter(r)}
            syncUrl={true}
          />

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#747775] dark:text-[#8e918f]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari No. Distribusi, No. Surat Jalan, Asal, Tujuan, Kurir, Resi..."
              className="w-full rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] pl-10 pr-4 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none transition-all shadow-xs"
            />
          </div>

        </div>

        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          <Link
            href="/distribution/surat-jalan"
            className="flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1f20] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
            title="Buka menu Dokumen & Surat Jalan"
          >
            <FileText className="h-3.5 w-3.5 text-indigo-500" />
            <span>Dokumen Surat Jalan</span>
          </Link>

          <button
            onClick={() => {
              setItemsList([]);
              setNotes('');
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-4 py-2 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors shadow-sm"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Buat Surat Jalan Distribusi</span>
          </button>
        </div>
      </div>

      {/* 3. Antrean Distribusi Otomatis (Ready Stock Kelola RO & Ready Antar) - Dikelompokkan Berdasarkan Nama Outlet */}
      <div className="panel-card p-4 space-y-3.5 border-2 border-[#0b57d0]/30 dark:border-[#a8c7fa]/30 bg-[#e8f0fe]/30 dark:bg-[#004a77]/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#c2e7ff] dark:border-[#004a77] pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-xs font-bold text-white dark:text-[#041e49]">
              {readyDistributionAssets.length}
            </span>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto relative flex-wrap">
            {/* Tombol Copy Semua Antrean di Header */}
            {readyDistributionAssets.length > 0 && (
              <button
                onClick={() => copyToClipboard(formatAllQueueText(), 'Semua Antrean', 'header-all-queue')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-blue-300 dark:border-blue-700 bg-white dark:bg-[#1e1f20] hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold text-xs transition-all shadow-xs cursor-pointer group"
                title="Salin semua data antrean distribusi"
              >
                {copiedId === 'header-all-queue' ? (
                  <>
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 dark:text-emerald-300">Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                    <span className="hidden sm:inline">Salin Antrean</span>
                  </>
                )}
              </button>
            )}

            {readyDistributionAssets.length > 0 && (
              <>
                {outletGroups.length === 1 ? (
                  <button
                    onClick={() => handleProcessFromQueue(outletGroups[0].assets, outletGroups[0].branchName)}
                    className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-4 py-1.5 text-xs font-bold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors shadow-sm"
                  >
                    <Truck className="h-3.5 w-3.5" />
                    Terbitkan Surat Jalan ({outletGroups[0].branchName} - {outletGroups[0].count} Item)
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setIsOutletMenuOpen((prev) => !prev)}
                      className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-4 py-1.5 text-xs font-bold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors shadow-sm"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      <span>Terbitkan Surat Jalan (Pilih Outlet)</span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOutletMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOutletMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setIsOutletMenuOpen(false)}
                        />
                        <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-white dark:bg-[#1e1f20] border border-[#c2e7ff] dark:border-[#004a77] shadow-xl z-40 p-2 space-y-1">
                          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#747775] dark:text-[#8e918f]">
                            Pilih Outlet Tujuan Penerbitan SJ:
                          </div>
                          {outletGroups.map((grp) => (
                            <button
                              key={grp.branchName}
                              onClick={() => {
                                setIsOutletMenuOpen(false);
                                handleProcessFromQueue(grp.assets, grp.branchName);
                              }}
                              className="w-full flex items-center justify-between p-2.5 rounded-xl text-left hover:bg-[#e8f0fe] dark:hover:bg-[#004a77]/40 transition-colors group"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] truncate">
                                  {grp.branchName}
                                </div>
                                <div className="text-[10px] text-[#747775] dark:text-[#8e918f]">
                                  {grp.count} item • Total {grp.totalUnits} unit
                                </div>
                              </div>
                              <span className="shrink-0 rounded-full bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/20 text-[#0b57d0] dark:text-[#a8c7fa] text-[10px] font-bold px-2 py-1 flex items-center gap-1 group-hover:bg-[#0b57d0] group-hover:text-white dark:group-hover:bg-[#a8c7fa] dark:group-hover:text-[#041e49] transition-colors">
                                Terbitkan ➔
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Source Filter Tabs & View Mode Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 justify-between">
          <div className="flex items-center gap-1 bg-white/80 dark:bg-[#1e1f20]/80 p-1 rounded-xl border border-[#c2e7ff] dark:border-[#004a77] text-xs">
            <button
              onClick={() => setQueueSourceFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                queueSourceFilter === 'ALL'
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
              }`}
            >
              Semua Sumber ({roReadyAssets.length + baseMonitoringReadyAssets.length})
            </button>
            <button
              onClick={() => setQueueSourceFilter('RO_ONLY')}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                queueSourceFilter === 'RO_ONLY'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Ready Stock Kelola RO ({roReadyAssets.length})</span>
            </button>
            <button
              onClick={() => setQueueSourceFilter('MONITORING_ONLY')}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                queueSourceFilter === 'MONITORING_ONLY'
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
              }`}
            >
              Monitoring Status Aset ({baseMonitoringReadyAssets.length})
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Model UI View Switcher */}
            <div className="flex items-center gap-1 bg-white/90 dark:bg-[#1e1f20]/90 p-1 rounded-xl border border-[#c2e7ff] dark:border-[#004a77] text-xs shadow-2xs">
              <span className="text-[10px] font-bold text-[#747775] dark:text-[#8e918f] px-1 uppercase tracking-wider hidden sm:inline">
                Tampilan:
              </span>
              <button
                onClick={() => handleChangeViewMode('grid')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  queueViewMode === 'grid'
                    ? 'bg-[#0b57d0] text-white shadow-xs'
                    : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white hover:bg-[#e8f0fe] dark:hover:bg-[#004a77]/40'
                }`}
                title="Model Kolom / Kartu Grid"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Kolom</span>
              </button>
              <button
                onClick={() => handleChangeViewMode('detail')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  queueViewMode === 'detail'
                    ? 'bg-[#0b57d0] text-white shadow-xs'
                    : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white hover:bg-[#e8f0fe] dark:hover:bg-[#004a77]/40'
                }`}
                title="Model Baris Detail Lengkap"
              >
                <List className="w-3.5 h-3.5" />
                <span>Detail</span>
              </button>
              <button
                onClick={() => handleChangeViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  queueViewMode === 'table'
                    ? 'bg-[#0b57d0] text-white shadow-xs'
                    : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white hover:bg-[#e8f0fe] dark:hover:bg-[#004a77]/40'
                }`}
                title="Model Tabel Kompak"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Tabel</span>
              </button>
            </div>

            {/* Tombol Copy Semua Antrean */}
            {readyDistributionAssets.length > 0 && (
              <button
                onClick={() => copyToClipboard(formatAllQueueText(), 'Semua Antrean', 'all-queue')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-[#1e1f20] hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold text-[11px] transition-all shadow-xs cursor-pointer group"
                title="Salin semua data antrean distribusi untuk WA / Laporan"
              >
                {copiedId === 'all-queue' ? (
                  <>
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 dark:text-emerald-300">Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                    <span>Salin Data Antrean</span>
                  </>
                )}
              </button>
            )}

            <div className="text-[10px] text-slate-500 hidden sm:flex items-center gap-1">
              <span>Sync:</span>
              <span className="font-mono font-semibold">{lastRoSyncTime.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* Filter Tab Berdasarkan Outlet */}
        {outletGroups.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-semibold text-[#747775] dark:text-[#8e918f] mr-1 shrink-0">
              Filter Cabang:
            </span>
            <button
              onClick={() => setSelectedQueueOutlet('ALL')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all shrink-0 ${
                selectedQueueOutlet === 'ALL'
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'bg-white/70 dark:bg-[#1e1f20]/70 text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white border border-[#e0e2ec] dark:border-[#444746]'
              }`}
            >
              Semua Cabang ({readyDistributionAssets.length})
            </button>
            {outletGroups.map((grp) => (
              <button
                key={grp.branchName}
                onClick={() => setSelectedQueueOutlet(grp.branchName)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all shrink-0 ${
                  selectedQueueOutlet === grp.branchName
                    ? 'bg-[#0b57d0] text-white shadow-xs'
                    : 'bg-white/70 dark:bg-[#1e1f20]/70 text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white border border-[#e0e2ec] dark:border-[#444746]'
                }`}
              >
                {grp.branchName} ({grp.count})
              </button>
            ))}
          </div>
        )}

        {readyDistributionAssets.length === 0 ? (
          <div className="py-4 text-center text-xs text-[#747775] dark:text-[#8e918f]">
            Belum ada aset dengan status <strong>Ready Stock</strong> dari Kelola RO atau <strong>Ready Antar</strong>. Ubah status item di{' '}
            <a href="/distribution/ro" className="text-[#0b57d0] dark:text-[#a8c7fa] underline font-semibold">
              Kelola RO
            </a>{' '}
            menjadi &quot;Ready Stock (Gudang SCGA)&quot; agar otomatis muncul di sini.
          </div>
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {outletGroups
              .filter((grp) => selectedQueueOutlet === 'ALL' || grp.branchName === selectedQueueOutlet)
              .map((group) => (
                <div
                  key={group.branchName}
                  className="rounded-2xl border border-[#c2e7ff] dark:border-[#004a77] bg-white/90 dark:bg-[#1e1f20]/95 p-3.5 shadow-xs space-y-3 transition-all hover:border-[#0b57d0]/60"
                >
                  {/* Outlet Group Header & Shortcut Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#e0e2ec]/80 dark:border-[#333538] pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-xl bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/20 flex items-center justify-center text-[#0b57d0] dark:text-[#a8c7fa] shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs sm:text-sm text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2">
                          <span>{group.branchName}</span>
                          <span className="rounded-full bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:text-blue-300">
                            {group.count} Item ({group.totalUnits} unit)
                          </span>
                        </div>
                        <p className="text-[10px] text-[#747775] dark:text-[#8e918f]">
                          Semua aset siap antar untuk cabang tujuan {group.branchName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                      {/* Tombol Copy Data Outlet */}
                      <button
                        onClick={() => copyToClipboard(formatOutletText(group), `Cabang ${group.branchName}`, `outlet-${group.branchName}`)}
                        className="flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#282a2c] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-all shadow-xs cursor-pointer group"
                        title={`Salin daftar item ${group.branchName} untuk WA / Chat Tim Logistik`}
                      >
                        {copiedId === `outlet-${group.branchName}` ? (
                          <>
                            <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-emerald-700 dark:text-emerald-300 font-bold">Data Disalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 group-hover:scale-110 transition-transform" />
                            <span>Salin Data Cabang</span>
                          </>
                        )}
                      </button>

                      {/* Tombol Terbitkan Surat Jalan Outlet Ini */}
                      <button
                        onClick={() => handleProcessFromQueue(group.assets, group.branchName)}
                        className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-3.5 py-1.5 text-xs font-bold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-all shadow-xs group"
                      >
                        <Truck className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
                        <span>Terbitkan Surat Jalan ({group.count} Item)</span>
                      </button>
                    </div>
                  </div>

                  {/* 1. MODEL KOLOM / GRID (Card Columns) */}
                  {queueViewMode === 'grid' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {group.assets.map((asset) => {
                        const isFromRo = asset.id?.startsWith('ro-');
                        const photoUrl = asset.photo_url || getItemImageUrl(asset.item_name);
                        const rawDate = asset.order_datetime || (asset as any).request_date || (asset.created_at ? asset.created_at.split('T')[0] : null);
                        const reqDate = rawDate ? (rawDate.includes('T') ? rawDate.split('T')[0] : rawDate.split(' ')[0]) : null;
                        const assetKey = asset.id || asset.external_id;

                        return (
                          <div
                            key={assetKey}
                            className={`flex items-center justify-between rounded-xl border p-2.5 transition-colors ${
                              isFromRo
                                ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-400'
                                : 'border-[#e0e2ec] dark:border-[#333538] bg-[#f8fafd] dark:bg-[#282a2c]/60 hover:border-[#0b57d0]/40'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2 flex-1">
                              {/* Thumbnail Foto Aset */}
                              {photoUrl ? (
                                <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={photoUrl} alt={asset.item_name} className="w-full h-full object-cover" />
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center shrink-0">
                                  <Package className="w-4 h-4 text-slate-400" />
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] truncate">
                                  {asset.item_name}
                                </div>
                                <div className="text-[10px] text-[#444746] dark:text-[#c4c7c5] flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <strong className={isFromRo ? 'text-emerald-700 dark:text-emerald-300 font-mono' : 'text-[#0b57d0] dark:text-[#a8c7fa] font-mono'}>
                                    {asset.quantity_needed || 1} unit
                                  </strong>

                                  {isFromRo ? (
                                    <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1 shrink-0">
                                      <span>RO: {asset.external_id}</span>
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-blue-100 dark:bg-blue-950/60 px-1.5 py-0.5 text-[9px] font-bold text-blue-800 dark:text-blue-300 shrink-0">
                                      Ready Antar
                                    </span>
                                  )}

                                  {reqDate && (
                                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-[#444746] dark:text-[#c4c7c5] border border-slate-200 dark:border-slate-700 flex items-center gap-1 shrink-0" title="Tanggal Permintaan">
                                      <Calendar className="h-2.5 w-2.5 text-[#747775] dark:text-[#8e918f]" />
                                      <span>{formatDateOnly(reqDate)}</span>
                                    </span>
                                  )}
                                </div>

                                {/* Catatan Item Prominent Notice */}
                                {(asset.item_notes || (asset.notes && !asset.notes.startsWith('No. RO:'))) && (
                                  <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700/80 p-1.5 text-[11px] text-amber-900 dark:text-amber-200 shadow-2xs">
                                    <span className="relative flex h-2 w-2 mt-0.5 shrink-0">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                    </span>
                                    <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <div className="min-w-0 flex-1 leading-tight">
                                      <span className="font-bold text-amber-800 dark:text-amber-300">Catatan:</span>{' '}
                                      <span className="italic">{asset.item_notes || asset.notes}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              {/* Tombol View Detail Aset */}
                              <button
                                onClick={() => setViewingAsset(asset)}
                                className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-1 text-[10px] font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0 shadow-2xs cursor-pointer border border-slate-200 dark:border-slate-700"
                                title="Lihat detail lengkap barang ini"
                              >
                                <Eye className="w-3 h-3 text-[#0b57d0]" />
                                <span>View</span>
                              </button>

                              {/* Quick Copy Item */}
                              <button
                                onClick={() => copyToClipboard(formatSingleItemText(asset, group.branchName), asset.item_name, assetKey)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e1f20] text-slate-500 hover:text-[#0b57d0] hover:border-[#0b57d0] transition-colors cursor-pointer"
                                title="Salin rincian item ini"
                              >
                                {copiedId === assetKey ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>

                              <button
                                onClick={() => handleDirectShipSingleItem(asset, group.branchName)}
                                className="rounded-full bg-white dark:bg-[#1e1f20] border border-[#0b57d0]/40 dark:border-[#a8c7fa]/40 px-2.5 py-1 text-[10px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:bg-[#0b57d0] hover:text-white dark:hover:bg-[#a8c7fa] dark:hover:text-[#041e49] transition-colors shrink-0 shadow-xs cursor-pointer"
                                title="Kirim hanya item ini (terbitkan Surat Jalan langsung & pindahkan ke Dokumen Distribusi)"
                              >
                                Kirim Ini Saja
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 2. MODEL DETAIL (Expanded Horizontal Rows) */}
                  {queueViewMode === 'detail' && (
                    <div className="space-y-2">
                      {group.assets.map((asset) => {
                        const isFromRo = asset.id?.startsWith('ro-');
                        const photoUrl = asset.photo_url || getItemImageUrl(asset.item_name);
                        const rawDate = asset.order_datetime || (asset as any).request_date || (asset.created_at ? asset.created_at.split('T')[0] : null);
                        const reqDate = rawDate ? (rawDate.includes('T') ? rawDate.split('T')[0] : rawDate.split(' ')[0]) : null;
                        const itemNote = asset.item_notes || (asset.notes && !asset.notes.startsWith('No. RO:') ? asset.notes : '');
                        const assetKey = asset.id || asset.external_id;

                        return (
                          <div
                            key={assetKey}
                            className={`rounded-xl border p-3 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
                              isFromRo
                                ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20 hover:border-emerald-400'
                                : 'border-[#e0e2ec] dark:border-[#333538] bg-[#f8fafd] dark:bg-[#282a2c]/60 hover:border-[#0b57d0]/40'
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              {photoUrl ? (
                                <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 shadow-2xs">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={photoUrl} alt={asset.item_name} className="w-full h-full object-cover" />
                                </div>
                              ) : (
                                <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center shrink-0">
                                  <Package className="w-6 h-6 text-slate-400" />
                                </div>
                              )}

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-bold text-sm text-[#1f1f1f] dark:text-[#e3e3e3]">
                                    {asset.item_name}
                                  </h4>
                                  <span className="rounded-full bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/20 text-[#0b57d0] dark:text-[#a8c7fa] px-2.5 py-0.5 text-xs font-bold font-mono">
                                    {asset.quantity_needed || 1} unit
                                  </span>
                                  {isFromRo ? (
                                    <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                                      RO: {asset.external_id}
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:text-blue-300">
                                      Ready Antar
                                    </span>
                                  )}
                                  {reqDate && (
                                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-[#444746] dark:text-[#c4c7c5] border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                                      <Calendar className="h-3 w-3 text-[#747775]" />
                                      <span>Tgl: {formatDateOnly(reqDate)}</span>
                                    </span>
                                  )}
                                </div>

                                {(asset.specification || asset.classification) && (
                                  <p className="text-xs text-slate-600 dark:text-slate-400">
                                    <span className="font-semibold text-slate-500">Spesifikasi:</span> {asset.specification || asset.classification}
                                  </p>
                                )}

                                {itemNote && (
                                  <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700/80 p-2 text-xs text-amber-900 dark:text-amber-200 mt-1 max-w-2xl">
                                    <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <div className="leading-tight">
                                      <span className="font-bold text-amber-800 dark:text-amber-300">Catatan:</span>{' '}
                                      <span className="italic">{itemNote}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                              {/* Tombol View Detail Aset */}
                              <button
                                onClick={() => setViewingAsset(asset)}
                                className="flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors shadow-xs cursor-pointer"
                                title="Buka modal detail lengkap aset ini"
                              >
                                <Eye className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                                <span>View Detail</span>
                              </button>

                              <button
                                onClick={() => copyToClipboard(formatSingleItemText(asset, group.branchName), asset.item_name, assetKey)}
                                className="flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1f20] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#0b57d0] hover:text-[#0b57d0] transition-colors shadow-xs cursor-pointer"
                                title="Salin rincian item ini"
                              >
                                {copiedId === assetKey ? (
                                  <>
                                    <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-emerald-700 dark:text-emerald-300 font-bold">Disalin</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Salin</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleDirectShipSingleItem(asset, group.branchName)}
                                className="flex items-center gap-1.5 rounded-xl bg-[#0b57d0] dark:bg-[#a8c7fa] px-3.5 py-1.5 text-xs font-bold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors shadow-xs cursor-pointer"
                                title="Kirim hanya item ini (terbitkan Surat Jalan langsung & pindahkan ke Dokumen Distribusi)"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>Kirim Ini Saja</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 3. MODEL TABEL (Compact Data Grid) */}
                  {queueViewMode === 'table' && (
                    <div className="overflow-x-auto rounded-xl border border-[#e0e2ec] dark:border-[#333538] bg-white dark:bg-[#1e1f20]">
                      <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
                        <thead className="bg-[#f0f4f9] dark:bg-[#282a2c] text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] border-b border-[#e0e2ec] dark:border-[#333538]">
                          <tr>
                            <th className="py-2.5 px-3 w-10 text-center">No</th>
                            <th className="py-2.5 px-3">Item Aset</th>
                            <th className="py-2.5 px-3">Spesifikasi</th>
                            <th className="py-2.5 px-3 text-center">Jumlah</th>
                            <th className="py-2.5 px-3 text-center">Jumlah yang diterima</th>
                            <th className="py-2.5 px-3">Tgl Permintaan</th>
                            <th className="py-2.5 px-3">Catatan</th>
                            <th className="py-2.5 px-3 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e0e2ec]/60 dark:divide-[#333538]/60">
                          {group.assets.map((asset, idx) => {
                            const photoUrl = asset.photo_url || getItemImageUrl(asset.item_name);
                            const rawDate = asset.order_datetime || (asset as any).request_date || (asset.created_at ? asset.created_at.split('T')[0] : null);
                            const reqDate = rawDate ? (rawDate.includes('T') ? rawDate.split('T')[0] : rawDate.split(' ')[0]) : null;
                            const itemNote = asset.item_notes || (asset.notes && !asset.notes.startsWith('No. RO:') ? asset.notes : '');
                            const assetKey = asset.id || asset.external_id;
                            const orderedQty = asset.quantity_needed || 1;
                            const receivedQty = getReceivedQty(asset);
                            const qtyMismatch = receivedQty !== orderedQty;

                            return (
                              <tr key={assetKey} className="hover:bg-[#f8fafd] dark:hover:bg-[#282a2c]/50 transition-colors">
                                <td className="py-2.5 px-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    {photoUrl ? (
                                      <div className="w-7 h-7 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white shrink-0">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={photoUrl} alt={asset.item_name} className="w-full h-full object-cover" />
                                      </div>
                                    ) : (
                                      <div className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                        <Package className="w-3.5 h-3.5 text-slate-400" />
                                      </div>
                                    )}
                                    <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{asset.item_name}</div>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                                  {asset.specification || asset.classification || '-'}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="font-bold font-mono text-[#0b57d0] dark:text-[#a8c7fa]">
                                    {asset.quantity_needed || 1} unit
                                  </span>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex flex-col items-center gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      step={1}
                                      inputMode="numeric"
                                      value={receivedQty}
                                      onChange={(e) => handleReceivedQtyChange(asset, e.target.value)}
                                      aria-label={`Jumlah yang diterima untuk ${asset.item_name}`}
                                      title="Isi jumlah fisik yang benar-benar diterima outlet"
                                      className={`w-20 min-h-[36px] rounded-lg border px-2 py-1 text-center text-xs font-bold font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/30 ${
                                        qtyMismatch
                                          ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
                                          : 'border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] text-[#0b57d0] dark:text-[#a8c7fa]'
                                      }`}
                                    />
                                    <span className={`text-[10px] font-medium ${qtyMismatch ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                      dari {orderedQty} unit
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {reqDate ? formatDateOnly(reqDate) : '-'}
                                </td>
                                <td className="py-2.5 px-3">
                                  {itemNote ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-700">
                                      <FileText className="w-3 h-3 text-amber-600 shrink-0" />
                                      <span className="truncate max-w-[180px]">{itemNote}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {/* Tombol View Detail Aset */}
                                    <button
                                      onClick={() => setViewingAsset(asset)}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:text-[#0b57d0] hover:border-[#0b57d0] transition-colors cursor-pointer"
                                      title="Lihat detail lengkap aset"
                                    >
                                      <Eye className="w-3 h-3 text-[#0b57d0]" />
                                      <span>View</span>
                                    </button>

                                    <button
                                      onClick={() => copyToClipboard(formatSingleItemText(asset, group.branchName), asset.item_name, assetKey)}
                                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e1f20] text-slate-500 hover:text-[#0b57d0] hover:border-[#0b57d0] transition-colors cursor-pointer"
                                      title="Salin ringkasan baris ini"
                                    >
                                      {copiedId === assetKey ? (
                                        <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => handleDirectShipSingleItem(asset, group.branchName)}
                                      className="rounded-full bg-white dark:bg-[#1e1f20] border border-[#0b57d0]/40 dark:border-[#a8c7fa]/40 px-2.5 py-1 text-[10px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:bg-[#0b57d0] hover:text-white dark:hover:bg-[#a8c7fa] dark:hover:text-[#041e49] transition-colors shrink-0 shadow-xs cursor-pointer"
                                      title="Kirim hanya item ini (terbitkan Surat Jalan langsung & pindahkan ke Dokumen Distribusi)"
                                    >
                                      Kirim Ini Saja
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Informational Callout: Dokumen Surat Jalan kini dipusatkan di menu Surat Jalan */}
      <div className="panel-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-blue-50/70 via-slate-50 to-indigo-50/70 dark:from-blue-950/20 dark:via-slate-900/40 dark:to-indigo-950/20 border border-blue-200/70 dark:border-blue-900/40 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 shadow-2xs">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Dokumen Surat Jalan Pendistribusian</span>
              <span className="text-[10px] bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-semibold px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                Menu Utama Surat Jalan
              </span>
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Tabel pencatatan resmi dokumen surat jalan, pelacakan armada kurir, cetak surat jalan, dan konfirmasi penerimaan fisik telah dipusatkan di menu <strong>Surat Jalan</strong>.
            </p>
          </div>
        </div>
        <Link
          href="/distribution/surat-jalan"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0b57d0] hover:bg-[#0842a0] text-white transition-all shadow-sm shrink-0 active:scale-95"
        >
          <span>Buka Tampilan Surat Jalan</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* MODAL 1: BUAT SURAT JALAN DISTRIBUSI */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in">
          <div className="relative max-h-[90vh] w-full max-w-3xl flex flex-col rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] shadow-2xl overflow-hidden">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-6 py-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2">
                  <Truck className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                  Buat Surat Jalan Pendistribusian Aset
                </h2>
                <p className="text-xs text-[#747775] dark:text-[#8e918f]">
                  Catat pengiriman distribusi aset siap antar ke outlet cabang dan terbitkan Surat Jalan resmi.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-full text-[#747775] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTransfer} className="overflow-y-auto p-6 space-y-4">
              {/* Lokasi Asal & Tujuan */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-[#f8fafd] dark:bg-[#282a2c]/40 border border-[#e0e2ec] dark:border-[#444746]">
                <div>
                  <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                    Lokasi Asal (Pengirim)
                  </label>
                  <select
                    value={fromLocation}
                    onChange={(e) => {
                      setFromLocation(e.target.value);
                      setSourceType(e.target.value === 'Gudang Pusat SCGA' ? 'GUDANG_PUSAT' : 'OUTLET');
                    }}
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  >
                    <option value="Gudang Pusat SCGA">Gudang Pusat SCGA</option>
                    {outlets.map((o) => (
                      <option key={o.id} value={o.branch_name}>
                        {o.branch_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                    Lokasi Outlet Tujuan (Penerima)
                  </label>
                  <select
                    value={toLocation}
                    onChange={(e) => {
                      setToLocation(e.target.value);
                      setDestinationType(e.target.value === 'Gudang Pusat SCGA' ? 'GUDANG_PUSAT' : 'OUTLET');
                    }}
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  >
                    {toLocation && !outlets.some((o) => o.branch_name === toLocation) && toLocation !== 'Gudang Pusat SCGA' && (
                      <option value={toLocation}>{toLocation}</option>
                    )}
                    {outlets.map((o) => (
                      <option key={o.id} value={o.branch_name}>
                        {o.branch_name}
                      </option>
                    ))}
                    <option value="Gudang Pusat SCGA">Gudang Pusat SCGA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                    Tanggal Pengiriman / Distribusi
                  </label>
                  <input
                    type="date"
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    required
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                    PIC Pengirim (Yang Menyerahkan)
                  </label>
                  <input
                    type="text"
                    value={senderPic}
                    onChange={(e) => setSenderPic(e.target.value)}
                    required
                    placeholder="Nama staf pengirim..."
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                    Kurir / Armada Pengantaran
                  </label>
                  <input
                    type="text"
                    value={expeditionCourier}
                    onChange={(e) => setExpeditionCourier(e.target.value)}
                    placeholder="Misal: Armada Internal, Lalamove, J&T Cargo..."
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                    No. Resi / Plat Armada (Opsional)
                  </label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="Misal: B 1234 CD / RESI-9988..."
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>
              </div>

              {/* Form Input Item Distribusi */}
              <div className="space-y-3 p-4 rounded-2xl bg-[#f0f4f9]/60 dark:bg-[#282a2c]/40 border border-[#e0e2ec] dark:border-[#444746]">
                <div className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Daftar Item Aset yang Didistribusikan
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-[#747775] dark:text-[#8e918f] mb-1">
                      Pilih dari Master Aset (Opsional)
                    </label>
                    <select
                      value={selectedAssetId}
                      onChange={(e) => handleAssetSelect(e.target.value)}
                      className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                    >
                      <option value="">-- Ketik Bebas / Pilih Master Aset --</option>
                      {initialAssets.slice(0, 100).map((a) => (
                        <option key={a.id || a.external_id} value={a.id || a.external_id}>
                          {a.item_name} ({a.branch_name})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-[#747775] dark:text-[#8e918f] mb-1">
                      Nama Barang / Aset *
                    </label>
                    <input
                      type="text"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="Nama aset..."
                      className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#747775] dark:text-[#8e918f] mb-1">
                      Jumlah Unit *
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={itemQty}
                      onChange={(e) => setItemQty(parseInt(e.target.value) || 1)}
                      className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#747775] dark:text-[#8e918f] mb-1">
                      Kondisi Fisik
                    </label>
                    <select
                      value={itemCondition}
                      onChange={(e) => setItemCondition(e.target.value as any)}
                      className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                    >
                      <option value="BAIK">Baik</option>
                      <option value="BEKAS_LAYAK">Bekas Layak</option>
                      <option value="PERLU_PERBAIKAN">Perlu Perbaikan</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-[#747775] dark:text-[#8e918f] mb-1">
                      Catatan / Spek Tambahan
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={itemNotes}
                        onChange={(e) => setItemNotes(e.target.value)}
                        placeholder="Misal: No. seri, kelengkapan kabel, kardus..."
                        className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                      />
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="rounded-lg bg-[#0b57d0] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#0842a0] transition-colors shrink-0"
                      >
                        + Tambah
                      </button>
                    </div>
                  </div>
                </div>

                {/* List of items */}
                {itemsList.length > 0 && (
                  <div className="mt-3 divide-y divide-[#e0e2ec] dark:divide-[#444746] border border-[#e0e2ec] dark:border-[#444746] rounded-xl overflow-hidden bg-white dark:bg-[#1e1f20]">
                    {itemsList.map((it, idx) => (
                      <div key={it.id} className="p-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[#747775]">{idx + 1}.</span>
                          <div>
                            <span className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{it.item_name}</span>
                            <span className="ml-2 text-[11px] font-semibold text-[#0b57d0] dark:text-[#a8c7fa]">
                              {it.quantity} Unit
                            </span>
                            <span className="ml-2 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-[#444746] dark:text-[#c4c7c5]">
                              {it.condition}
                            </span>
                            {it.notes && (
                              <div className="text-[11px] text-[#747775] dark:text-[#8e918f] italic">
                                {it.notes}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(it.id)}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Catatan Dokumen */}
              <div>
                <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                  Catatan Dokumen Surat Jalan
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Catatan tambahan untuk surat jalan distribusi..."
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-[#e0e2ec] dark:border-[#444746]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-full border border-[#e0e2ec] dark:border-[#444746] px-4 py-2 text-xs font-medium text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e0e2ec] transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || itemsList.length === 0}
                  className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-5 py-2 text-xs font-bold text-white dark:text-[#041e49] hover:bg-[#0842a0] transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Truck className="h-4 w-4" />
                  <span>{isSubmitting ? 'Memproses...' : 'Terbitkan Surat Jalan & Kirim'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: KONFIRMASI PENERIMAAN DI OUTLET TUJUAN */}
      {isReceiveModalOpen && selectedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] bg-emerald-50 dark:bg-emerald-950/40 px-6 py-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Konfirmasi Penerimaan Aset di Outlet
                </h2>
              </div>
              <button
                onClick={() => setIsReceiveModalOpen(false)}
                className="p-1 rounded-full text-[#747775] hover:bg-emerald-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitReceive} className="p-6 space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#f8fafd] dark:bg-[#282a2c]/60 border border-[#e0e2ec] dark:border-[#444746] text-xs space-y-1">
                <div>
                  No. Dokumen: <strong className="font-mono text-[#0b57d0]">{selectedTransfer.transfer_number}</strong>
                </div>
                {selectedTransfer.surat_jalan_number && (
                  <div>
                    No. Surat Jalan: <strong>{selectedTransfer.surat_jalan_number}</strong>
                  </div>
                )}
                <div>
                  Outlet Tujuan: <strong>{selectedTransfer.to_location}</strong> (dari {selectedTransfer.from_location})
                </div>
                <div>
                  Total Item: <strong>{selectedTransfer.items?.length || 0} unit</strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                  Jumlah Fisik Diterima per Item *
                </label>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(selectedTransfer.items || []).map((item) => {
                    const sentQty = item.quantity;
                    const inputQty = receiveItemQtys[item.id];
                    const receivedQty =
                      typeof inputQty === 'number' && Number.isFinite(inputQty)
                        ? inputQty
                        : (item.received_quantity ?? sentQty);
                    const qtyMismatch = receivedQty !== sentQty;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border p-2.5 ${
                          qtyMismatch
                            ? 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20'
                            : 'border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c]/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] truncate">
                              {item.item_name}
                            </div>
                            <div className="text-[10px] text-[#747775] dark:text-[#8e918f]">
                              Dikirim: <strong>{sentQty} unit</strong>
                              {qtyMismatch && (
                                <span className="ml-1 font-bold text-amber-700 dark:text-amber-300">
                                  (selisih {receivedQty - sentQty > 0 ? '+' : ''}{receivedQty - sentQty} unit)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              value={receivedQty}
                              onChange={(e) => {
                                const parsed = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                setReceiveItemQtys((prev) => ({ ...prev, [item.id]: parsed }));
                              }}
                              aria-label={`Jumlah diterima ${item.item_name}`}
                              className="w-20 min-h-[36px] rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-2 py-1 text-center text-xs font-bold font-mono text-[#0b57d0] dark:text-[#a8c7fa] focus:border-[#0b57d0] focus:outline-none"
                            />
                            <span className="text-[10px] font-semibold text-[#747775] dark:text-[#8e918f]">unit</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-[#747775] dark:text-[#8e918f]">
                  Isi jumlah fisik yang benar-benar diterima outlet. Nilai ini disimpan ke dokumen distribusi dan dipakai untuk monitoring SLA.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                  Nama PIC Penerima di Outlet Tujuan *
                </label>
                <input
                  type="text"
                  required
                  value={receivePic}
                  onChange={(e) => setReceivePic(e.target.value)}
                  placeholder="Nama manajer outlet / staf penerima..."
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                  Tanggal Diterima *
                </label>
                <input
                  type="date"
                  required
                  value={receiveDate}
                  onChange={(e) => setReceiveDate(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                  Catatan Kondisi Kedatangan Barang
                </label>
                <textarea
                  rows={3}
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="Kondisi fisik barang saat tiba di outlet..."
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#e0e2ec] dark:border-[#444746]">
                <button
                  type="button"
                  onClick={() => setIsReceiveModalOpen(false)}
                  className="rounded-full border border-[#e0e2ec] dark:border-[#444746] px-4 py-1.5 text-xs text-[#444746] dark:text-[#c4c7c5]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-1.5 text-xs font-bold transition-colors shadow-xs"
                >
                  <Check className="h-4 w-4" />
                  <span>{isSubmitting ? 'Menyimpan...' : 'Konfirmasi Aset Diterima'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CETAK SURAT JALAN DISTRIBUSI */}
      {isPrintModalOpen && selectedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in">
          <div className="relative max-h-[95vh] w-full max-w-3xl flex flex-col rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-6 py-4 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <h2 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Pratinjau Surat Jalan Pendistribusian Aset
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] text-white px-4 py-1.5 text-xs font-bold hover:bg-[#0842a0] transition-colors"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Cetak / Print</span>
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-1 rounded-full text-[#747775] hover:bg-[#e0e2ec]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Sheet */}
            <div className="p-8 overflow-y-auto bg-white text-black print:p-0 print:m-0">
              {/* Document Header */}
              <div className="border-b-2 border-black pb-4 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-xl font-bold tracking-tight">HANTARAN</h1>
                    <p className="text-xs text-gray-600">SISTEM MANAJEMEN PENDISTRIBUSIAN &amp; LOGISTIK ASET</p>
                    <p className="text-[11px] text-gray-500">Gudang Pusat SCGA Logistik</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-lg font-bold uppercase text-[#0b57d0]">Surat Jalan Pendistribusian Aset</h2>
                    <p className="font-mono text-xs font-bold">{selectedTransfer.surat_jalan_number || 'SJ-DIST-OFFICIAL'}</p>
                    <p className="text-xs text-gray-600">Ref: {selectedTransfer.transfer_number}</p>
                    <p className="text-xs text-gray-600">Tanggal: {formatDateOnly(selectedTransfer.transfer_date)}</p>
                  </div>
                </div>
              </div>

              {/* Rute & Ekspedisi Box */}
              <div className="grid grid-cols-2 gap-4 text-xs mb-6 border border-gray-300 rounded-lg p-3 bg-gray-50">
                <div>
                  <div className="font-bold text-gray-700 uppercase text-[10px]">Lokasi Asal (Pengirim):</div>
                  <div className="font-bold text-sm mt-0.5">{selectedTransfer.from_location}</div>
                  <div className="text-gray-600 mt-0.5">PIC Pengirim: {selectedTransfer.sender_pic}</div>
                </div>
                <div>
                  <div className="font-bold text-gray-700 uppercase text-[10px]">Outlet Tujuan (Penerima):</div>
                  <div className="font-bold text-sm mt-0.5 text-[#0b57d0]">{selectedTransfer.to_location}</div>
                  <div className="text-gray-600 mt-0.5">
                    PIC Penerima: {selectedTransfer.receiver_pic || 'Staf / Manajer Outlet'}
                  </div>
                </div>
                <div className="col-span-2 pt-2 border-t border-gray-200 flex justify-between">
                  <div>
                    <span className="text-gray-600">Armada / Kurir:</span> <strong>{selectedTransfer.expedition_courier || 'Armada Internal SCGA'}</strong>
                  </div>
                  {selectedTransfer.tracking_number && (
                    <div>
                      <span className="text-gray-600">No. Resi / Plat:</span> <strong>{selectedTransfer.tracking_number}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-6">
                <table className="w-full text-xs border-collapse border border-gray-400">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border border-gray-400 py-2 px-2 text-center w-10">No</th>
                      <th className="border border-gray-400 py-2 px-3 text-left">Nama Barang / Aset</th>
                      <th className="border border-gray-400 py-2 px-3 text-center w-20">Kuantitas</th>
                      <th className="border border-gray-400 py-2 px-3 text-center w-24">Jumlah Diterima</th>
                      <th className="border border-gray-400 py-2 px-3 text-center w-28">Kondisi Fisik</th>
                      <th className="border border-gray-400 py-2 px-3 text-left">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTransfer.items?.map((it, idx) => (
                      <tr key={it.id}>
                        <td className="border border-gray-400 py-2 px-2 text-center">{idx + 1}</td>
                        <td className="border border-gray-400 py-2 px-3">
                          <div className="font-bold">{it.item_name}</div>
                          {it.specification && <div className="text-[10px] text-gray-500">{it.specification}</div>}
                        </td>
                        <td className="border border-gray-400 py-2 px-3 text-center font-bold">{it.quantity} Unit</td>
                        <td className="border border-gray-400 py-2 px-3 text-center font-bold">
                          {it.received_quantity ?? '-'} {it.received_quantity !== undefined ? 'Unit' : ''}
                        </td>
                        <td className="border border-gray-400 py-2 px-3 text-center">{it.condition}</td>
                        <td className="border border-gray-400 py-2 px-3 text-gray-600">{it.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Catatan Dokumen */}
              {selectedTransfer.notes && (
                <div className="text-xs mb-8 p-2.5 rounded bg-gray-50 border border-gray-200">
                  <strong>Catatan Pengiriman:</strong> {selectedTransfer.notes}
                </div>
              )}

              {/* 3 Signature Columns */}
              <div className="grid grid-cols-3 gap-6 text-center text-xs pt-4">
                <div>
                  <div className="text-gray-600 mb-14">Diserahkan Oleh (Pengirim),</div>
                  <div className="font-bold underline">{selectedTransfer.sender_pic}</div>
                  <div className="text-[10px] text-gray-500">Logistik SCGA / Pengirim</div>
                </div>

                <div>
                  <div className="text-gray-600 mb-14">Dibawa Oleh (Kurir / Driver),</div>
                  <div className="font-bold underline">
                    {selectedTransfer.expedition_courier || 'Ekspedisi'}
                  </div>
                  <div className="text-[10px] text-gray-500">Petugas Pengantar</div>
                </div>

                <div>
                  <div className="text-gray-600 mb-14">Diterima Oleh (PIC Outlet),</div>
                  <div className="font-bold underline">
                    {selectedTransfer.receiver_pic || '(..................................)'}
                  </div>
                  <div className="text-[10px] text-gray-500">Outlet Tujuan</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DETAIL RINCIAN DISTRIBUSI */}
      {isDetailModalOpen && selectedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in">
          <div className="relative max-h-[85vh] w-full max-w-xl rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Rincian Dokumen Pendistribusian
                </h3>
                <p className="font-mono text-xs text-[#0b57d0] dark:text-[#a8c7fa]">
                  {selectedTransfer.transfer_number}
                </p>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1 rounded-full text-[#747775] hover:bg-[#e0e2ec]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-[#f8fafd] dark:bg-[#282a2c]/60 border border-[#e0e2ec] dark:border-[#444746]">
                <div>
                  <span className="text-[#747775]">Rute Distribusi:</span>
                  <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    {selectedTransfer.from_location} &rarr; {selectedTransfer.to_location}
                  </div>
                </div>
                <div>
                  <span className="text-[#747775]">Status:</span>
                  <div className="font-bold text-[#0b57d0]">{selectedTransfer.status}</div>
                </div>
                <div>
                  <span className="text-[#747775]">No. Surat Jalan:</span>
                  <div className="font-mono font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    {selectedTransfer.surat_jalan_number || '-'}
                  </div>
                </div>
                <div>
                  <span className="text-[#747775]">Tanggal Kirim:</span>
                  <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    {formatDateOnly(selectedTransfer.transfer_date)}
                  </div>
                </div>
              </div>

              <div>
                <div className="font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] mb-2 flex items-center justify-between">
                  <span>Daftar Barang ({selectedTransfer.items?.length || 0})</span>
                  <span className="text-[10px] text-[#747775] dark:text-[#8e918f]">
                    Superuser dapat menghapus item untuk koreksi distribusi
                  </span>
                </div>
                <div className="divide-y divide-[#e0e2ec] dark:divide-[#444746] border border-[#e0e2ec] dark:border-[#444746] rounded-xl overflow-hidden">
                  {selectedTransfer.items?.map((it) => (
                    <div key={it.id} className="p-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{it.item_name}</div>
                        {it.notes && <div className="text-[11px] text-[#747775]">{it.notes}</div>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="font-bold text-[#0b57d0]">{it.quantity} Unit</span>
                          <div className="text-[10px] text-[#747775]">{it.condition}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => promptDeleteItem(selectedTransfer, it)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-[11px] font-semibold transition-colors cursor-pointer"
                          title="Hapus item ini dari dokumen distribusi (Superuser)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedTransfer.received_notes && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                  <strong className="text-emerald-800 dark:text-emerald-300">Catatan Penerimaan:</strong>
                  <p className="text-emerald-700 dark:text-emerald-400 mt-1">{selectedTransfer.received_notes}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#e0e2ec] dark:border-[#444746] flex justify-end">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="rounded-full bg-[#0b57d0] text-white px-5 py-1.5 text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: KONFIRMASI RESET SELURUH DATA DISTRIBUSI */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-[#1e1f20] p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="h-10 w-10 rounded-2xl bg-rose-50 dark:bg-rose-950 flex items-center justify-center">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Bersihkan Seluruh Riwayat Pendistribusian?
                </h3>
                <p className="text-xs text-rose-600 dark:text-rose-400">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <p className="text-xs text-[#444746] dark:text-[#c4c7c5] leading-relaxed mb-4">
              Aksi ini akan:
              <br />• Menghapus seluruh riwayat dokumen surat jalan pendistribusian di basis data.
              <br />• Mengosongkan data riwayat pengiriman secara permanen.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsResetConfirmOpen(false)}
                className="rounded-full border border-[#e0e2ec] dark:border-[#444746] px-4 py-1.5 text-xs text-[#444746]"
              >
                Batal
              </button>
              <button
                onClick={handleExecuteResetAll}
                disabled={isResetting}
                className="flex items-center gap-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white px-5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 shadow-xs"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isResetting ? 'Membersihkan...' : 'Ya, Bersihkan Semua'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: PREVIEW DETAIL ASET (TOMBOL VIEW) */}
      {viewingAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-[#c2e7ff] dark:border-[#004a77] bg-white dark:bg-[#1e1f20] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#333538] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/20 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                    Detail Aset Distribusi
                  </h3>
                  <p className="text-xs text-[#747775] dark:text-[#8e918f]">
                    Informasi lengkap barang siap antar ke cabang
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingAsset(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Foto Item */}
              <div className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                {(viewingAsset.photo_url || getItemImageUrl(viewingAsset.item_name)) ? (
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-600 bg-white shrink-0 shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={viewingAsset.photo_url || getItemImageUrl(viewingAsset.item_name) || undefined}
                      alt={viewingAsset.item_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <Package className="w-8 h-8 text-slate-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-bold text-sm text-[#1f1f1f] dark:text-[#e3e3e3]">
                    {viewingAsset.item_name}
                  </div>
                  <div className="text-xs text-blue-700 dark:text-blue-300 font-bold font-mono">
                    Jumlah: {viewingAsset.quantity_needed || 1} Unit
                  </div>
                  <div className="text-[11px] text-[#747775] dark:text-[#8e918f]">
                    Cabang Tujuan: <strong className="text-slate-800 dark:text-slate-200">{viewingAsset.branch_name || 'Semua Cabang'}</strong>
                  </div>
                </div>
              </div>

              {/* Rincian Spesifikasi & RO */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Nomor RO / ID</div>
                  <div className="font-mono font-bold text-emerald-700 dark:text-emerald-300 text-xs mt-0.5">
                    {viewingAsset.external_id || viewingAsset.id || '-'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Tanggal Permintaan</div>
                  <div className="font-bold text-slate-700 dark:text-slate-200 text-xs mt-0.5">
                    {formatDateOnly(viewingAsset.order_datetime || (viewingAsset as any).request_date || viewingAsset.created_at)}
                  </div>
                </div>
              </div>

              {viewingAsset.specification && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Spesifikasi Teknis</div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                    {viewingAsset.specification}
                  </div>
                </div>
              )}

              {/* Catatan */}
              {(viewingAsset.item_notes || viewingAsset.notes) && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700/80 text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Catatan Khusus Pengiriman</span>
                  </div>
                  <div className="text-xs italic leading-relaxed">
                    {viewingAsset.item_notes || viewingAsset.notes}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#e0e2ec] dark:border-[#333538] pt-3">
              <button
                onClick={() => {
                  copyToClipboard(formatSingleItemText(viewingAsset, viewingAsset.branch_name || ''), viewingAsset.item_name, 'modal-view');
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Data Item</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewingAsset(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100"
                >
                  Tutup
                </button>
                <button
                  onClick={() => {
                    const asset = viewingAsset;
                    setViewingAsset(null);
                    handleDirectShipSingleItem(asset, asset.branch_name);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0b57d0] text-white text-xs font-bold hover:bg-[#0842a0] cursor-pointer"
                  title="Kirim hanya item ini (terbitkan Surat Jalan langsung & pindahkan ke Dokumen Distribusi)"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Kirim Ini Saja</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL OTORISASI SUPERUSER UNTUK HAPUS ITEM */}
      {isSuperUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] pb-3 mb-4">
              <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
                <div className="h-9 w-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center border border-rose-200 dark:border-rose-900">
                  <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1f1f1f] dark:text-[#e3e3e3]">
                    Otorisasi Superuser Diperlukan
                  </h3>
                  <p className="text-[11px] text-[#747775] dark:text-[#8e918f]">
                    Khusus Super User untuk cegah kesalahan distribusi
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsSuperUserModalOpen(false);
                  setPendingDeleteAction(null);
                }}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[#444746] dark:text-[#c4c7c5] leading-relaxed mb-4">
              Item <strong>&quot;{pendingDeleteAction?.item.item_name}&quot;</strong> akan dihapus dari Dokumen Distribusi <strong>{pendingDeleteAction?.transfer.surat_jalan_number || pendingDeleteAction?.transfer.transfer_number}</strong> dan dikembalikan ke antrean Outlet.
            </p>

            <form onSubmit={handleVerifySuperUser} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                  Masukkan Kata Sandi Superuser:
                </label>
                <input
                  type="password"
                  autoFocus
                  required
                  value={superUserPasswordInput}
                  onChange={(e) => {
                    setSuperUserPasswordInput(e.target.value);
                    setSuperUserError(null);
                  }}
                  placeholder="Kata sandi Superuser..."
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#282a2c] px-3.5 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
                {superUserError && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1">
                    {superUserError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSuperUserModalOpen(false);
                    setPendingDeleteAction(null);
                  }}
                  className="rounded-full border border-[#e0e2ec] dark:border-[#444746] px-4 py-1.5 text-xs text-[#444746] dark:text-[#c4c7c5] hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !superUserPasswordInput}
                  className="flex items-center gap-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white px-5 py-1.5 text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Verifikasi &amp; Hapus</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Feedback Notifikasi Salin Data */}
      {copyFeedback && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-3 text-xs font-semibold shadow-2xl border border-slate-700/50 dark:border-slate-200/50 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-400 dark:text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCheck className="w-4 h-4" />
          </div>
          <span>{copyFeedback}</span>
        </div>
      )}
    </div>
  );
}
