'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  ArrowRightLeft, 
  PlusCircle, 
  Search, 
  CheckCircle2, 
  Clock, 
  Truck, 
  Store, 
  X, 
  Package, 
  UserCheck,
  Printer,
  Trash2,
  FileText,
  AlertTriangle,
  RotateCcw,
  Calendar,
  Eye,
  Building2,
  Check,
  ShieldAlert
} from 'lucide-react';
import { AssetTransfer, Outlet, AssetRequest, TransferStatus, TransferItem } from '@/lib/supabase/types';
import { formatDateOnly, formatDateTime } from '@/lib/utils/date-formatter';

interface TransferAssetViewProps {
  initialTransfers: AssetTransfer[];
  outlets: Outlet[];
  initialAssets?: AssetRequest[];
}

export function TransferAssetView({ initialTransfers, outlets, initialAssets = [] }: TransferAssetViewProps) {
  const searchParams = useSearchParams();
  const [transfers, setTransfers] = useState<AssetTransfer[]>(initialTransfers);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TransferStatus>('ALL');
  
  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [selectedTransfer, setSelectedTransfer] = useState<AssetTransfer | null>(null);

  // Queue from checklist in Asset Data Table
  const [systemTransferAssets, setSystemTransferAssets] = useState<AssetRequest[]>([]);

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

  // Load checklist items from props and localStorage
  const loadSystemTransferChecklist = () => {
    let storedIds: string[] = [];
    try {
      const saved = localStorage.getItem('ca_system_transfer_ids');
      if (saved) {
        storedIds = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed reading system transfer ids in TransferAssetView:', e);
    }

    const filtered = (initialAssets || []).filter((a) => {
      const aId = a.id || a.external_id;
      return Boolean(a.is_system_transfer) || storedIds.includes(aId);
    });

    setSystemTransferAssets(filtered);
  };

  useEffect(() => {
    loadSystemTransferChecklist();

    const handleResetEvent = () => {
      setSystemTransferAssets([]);
      setTransfers([]);
    };
    window.addEventListener('ca_transfers_reset', handleResetEvent);
    return () => window.removeEventListener('ca_transfers_reset', handleResetEvent);
  }, [initialAssets]);

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

  const handleProcessFromQueue = (selected: AssetRequest[]) => {
    const formattedItems: TransferItem[] = selected.map((a, idx) => ({
      id: `ti-sys-${Date.now()}-${idx}`,
      asset_id: a.id || a.external_id,
      item_name: a.item_name,
      specification: a.classification,
      quantity: a.quantity_needed || 1,
      condition: 'BAIK',
    }));

    setItemsList(formattedItems);
    if (selected[0]?.branch_name) {
      setToLocation(selected[0].branch_name);
    }
    setNotes(`Dokumen Mutasi dibuat dari ${selected.length} item checklist Daftar Aset.`);
    setIsCreateModalOpen(true);
  };

  const handleClearQueue = () => {
    try {
      localStorage.removeItem('ca_system_transfer_ids');
    } catch (e) {}
    setSystemTransferAssets([]);
    window.dispatchEvent(new Event('ca_transfers_reset'));
  };

  // Submit New Transfer
  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itemsList.length === 0) {
      alert('Tambahkan minimal 1 item untuk dimutasi / ditransfer.');
      return;
    }

    try {
      setIsSubmitting(true);
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);

      const payload: Partial<AssetTransfer> = {
        transfer_number: `TRF-MUT/${year}/${rand}`,
        surat_jalan_number: `SJ-MUT/${year}/${rand}`,
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
        setItemsList([]);
        setNotes('');
        setTrackingNumber('');
      } else {
        alert(json.error || 'Gagal membuat dokumen mutasi transfer');
      }
    } catch (err: any) {
      console.error('Failed to submit transfer:', err);
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
    setReceiveNotes('Aset diterima dalam kondisi lengkap dan baik sesuai Surat Jalan.');
    setIsReceiveModalOpen(true);
  };

  const handleSubmitReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransfer) return;
    if (!receivePic.trim()) {
      alert('Masukkan nama PIC Penerima di cabang tujuan.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/transfers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedTransfer.id,
          status: 'RECEIVED',
          receiver_pic: receivePic.trim(),
          received_date: receiveDate,
          received_notes: receiveNotes.trim(),
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setTransfers((prev) => prev.map((t) => (t.id === selectedTransfer.id ? json.data : t)));
        setIsReceiveModalOpen(false);
        setSelectedTransfer(null);
      } else {
        alert(json.error || 'Gagal mengonfirmasi penerimaan aset');
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
        setSystemTransferAssets([]);
        window.dispatchEvent(new Event('ca_transfers_reset'));
        setIsResetConfirmOpen(false);
      } else {
        alert(json.error || 'Gagal mereset data transfer');
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
    const total = transfers.length;
    const inTransit = transfers.filter((t) => t.status === 'IN_TRANSIT').length;
    const received = transfers.filter((t) => t.status === 'RECEIVED' || t.status === 'COMPLETED').length;
    const draft = transfers.filter((t) => t.status === 'DRAFT').length;
    return { total, inTransit, received, draft };
  }, [transfers]);

  // Filtered transfers
  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
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
  }, [transfers, statusFilter, search]);

  return (
    <div className="space-y-6">
      {/* 1. Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="panel-card p-4 flex items-center justify-between border-l-4 border-l-[#0b57d0]">
          <div>
            <div className="text-[11px] font-semibold text-[#747775] dark:text-[#8e918f] uppercase">
              Total Mutasi Aset
            </div>
            <div className="text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mt-0.5">
              {metrics.total}
            </div>
            <div className="text-[11px] text-[#747775] dark:text-[#8e918f]">Dokumen Terbit</div>
          </div>
          <div className="h-10 w-10 rounded-2xl bg-[#e8f0fe] dark:bg-[#004a77]/40 flex items-center justify-center text-[#0b57d0] dark:text-[#a8c7fa]">
            <ArrowRightLeft className="h-5 w-5" />
          </div>
        </div>

        <div className="panel-card p-4 flex items-center justify-between border-l-4 border-l-amber-500">
          <div>
            <div className="text-[11px] font-semibold text-[#747775] dark:text-[#8e918f] uppercase">
              Dalam Perjalanan
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              {metrics.inTransit}
            </div>
            <div className="text-[11px] text-[#747775] dark:text-[#8e918f]">Sedang Dikirim / Ekspedisi</div>
          </div>
          <div className="h-10 w-10 rounded-2xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Truck className="h-5 w-5" />
          </div>
        </div>

        <div className="panel-card p-4 flex items-center justify-between border-l-4 border-l-emerald-500">
          <div>
            <div className="text-[11px] font-semibold text-[#747775] dark:text-[#8e918f] uppercase">
              Telah Diterima
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {metrics.received}
            </div>
            <div className="text-[11px] text-[#747775] dark:text-[#8e918f]">Sampai di Lokasi Tujuan</div>
          </div>
          <div className="h-10 w-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="panel-card p-4 flex items-center justify-between border-l-4 border-l-slate-400">
          <div>
            <div className="text-[11px] font-semibold text-[#747775] dark:text-[#8e918f] uppercase">
              Draft / Persiapan
            </div>
            <div className="text-2xl font-bold text-[#444746] dark:text-[#c4c7c5] mt-0.5">
              {metrics.draft}
            </div>
            <div className="text-[11px] text-[#747775] dark:text-[#8e918f]">Belum Dikirim</div>
          </div>
          <div className="h-10 w-10 rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] flex items-center justify-center text-[#747775] dark:text-[#8e918f]">
            <FileText className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* 2. Top Action & Filter Toolbar */}
      <div className="panel-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#747775] dark:text-[#8e918f]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari No. Transfer, No. Surat Jalan, Asal, Tujuan, Kurir, Resi..."
              className="w-full rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] pl-10 pr-4 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none transition-all shadow-xs"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#f0f4f9] dark:bg-[#1e1f20] p-1 rounded-full border border-[#e0e2ec] dark:border-[#444746] text-xs">
            {(['ALL', 'IN_TRANSIT', 'RECEIVED', 'DRAFT'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                  statusFilter === st
                    ? 'bg-[#0b57d0] text-white shadow-xs'
                    : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
                }`}
              >
                {st === 'ALL' ? 'Semua' : st === 'IN_TRANSIT' ? 'Perjalanan' : st === 'RECEIVED' ? 'Diterima' : 'Draft'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          <button
            onClick={() => setIsResetConfirmOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors shadow-xs"
            title="Bersihkan seluruh data mutasi transfer dan reset checklist"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Bersihkan Data</span>
          </button>

          <button
            onClick={() => {
              setItemsList([]);
              setNotes('');
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-4 py-2 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors shadow-sm"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Buat Mutasi Aset Baru</span>
          </button>
        </div>
      </div>

      {/* 3. Antrean Mutasi dari Checklist Daftar Aset */}
      {systemTransferAssets.length > 0 && (
        <div className="panel-card p-4 space-y-3 border-2 border-[#0b57d0]/30 dark:border-[#a8c7fa]/30 bg-[#e8f0fe]/30 dark:bg-[#004a77]/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#c2e7ff] dark:border-[#004a77] pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-xs font-bold text-white dark:text-[#041e49]">
                {systemTransferAssets.length}
              </span>
              <div>
                <h3 className="font-bold text-sm text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
                  <ArrowRightLeft className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                  Item Masuk Antrean Mutasi (Checklist Daftar Aset)
                </h3>
                <p className="text-[11px] text-[#444746] dark:text-[#c4c7c5]">
                  Daftar item aset yang dicentang dari halaman Monitoring Status: Daftar Aset dan siap dibuatkan Surat Jalan Mutasi.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={handleClearQueue}
                className="px-3 py-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] text-xs text-[#747775] hover:text-rose-600 transition-colors"
              >
                Kosongkan Antrean
              </button>
              <button
                onClick={() => handleProcessFromQueue(systemTransferAssets)}
                className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-4 py-1.5 text-xs font-bold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors shadow-sm"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Buat Mutasi ({systemTransferAssets.length} Item)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1 max-h-48 overflow-y-auto">
            {systemTransferAssets.map((asset) => (
              <div
                key={asset.id || asset.external_id}
                className="flex items-center justify-between rounded-xl border border-[#d2e3fc] dark:border-[#004a77] bg-[#ffffff] dark:bg-[#1e1f20] p-2.5 shadow-xs"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] truncate">
                    {asset.item_name}
                  </div>
                  <div className="text-[10px] text-[#444746] dark:text-[#c4c7c5] truncate">
                    {asset.branch_name} • <strong className="text-[#0b57d0] dark:text-[#a8c7fa]">{asset.quantity_needed} unit</strong>
                  </div>
                </div>

                <button
                  onClick={() => handleProcessFromQueue([asset])}
                  className="rounded-full bg-[#e8f0fe] dark:bg-[#004a77]/50 px-2 py-1 text-[10px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:bg-[#0b57d0] hover:text-white transition-colors shrink-0"
                >
                  Mutasi Ini
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Main Transfer Table */}
      <div className="panel-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
            <thead className="bg-[#f0f4f9] dark:bg-[#1e1f20] text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] border-b border-[#e0e2ec] dark:border-[#444746]">
              <tr>
                <th className="py-3.5 px-3">No. Dokumen &amp; SJ</th>
                <th className="py-3.5 px-3">Rute Mutasi (Asal &rarr; Tujuan)</th>
                <th className="py-3.5 px-3">Tanggal &amp; Kurir</th>
                <th className="py-3.5 px-3">PIC Pengirim / Penerima</th>
                <th className="py-3.5 px-3 text-center">Item</th>
                <th className="py-3.5 px-3 text-center">Status</th>
                <th className="py-3.5 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]">
              {filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#747775] dark:text-[#8e918f]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ArrowRightLeft className="h-8 w-8 text-[#c4c7c5] dark:text-[#5e6062]" />
                      <div className="font-semibold text-sm">Belum Ada Dokumen Mutasi Transfer Aset</div>
                      <p className="text-xs max-w-md text-[#747775] dark:text-[#8e918f]">
                        Data transfer saat ini bersih. Klik tombol <strong>&quot;Buat Mutasi Aset Baru&quot;</strong> di atas untuk mencatat pemindahan aset antar-cabang atau dari Gudang Pusat SCGA.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransfers.map((t) => {
                  const isInTransit = t.status === 'IN_TRANSIT';
                  const isReceived = t.status === 'RECEIVED' || t.status === 'COMPLETED';

                  return (
                    <tr key={t.id} className="hover:bg-[#f8fafd] dark:hover:bg-[#282a2c]/60 transition-colors">
                      {/* Document & Surat Jalan */}
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-xs text-[#0b57d0] dark:text-[#a8c7fa]">
                          {t.transfer_number}
                        </div>
                        {t.surat_jalan_number && (
                          <button
                            onClick={() => {
                              setSelectedTransfer(t);
                              setIsPrintModalOpen(true);
                            }}
                            className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline mt-0.5"
                            title="Klik untuk cetak Surat Jalan Mutasi"
                          >
                            <Printer className="h-3 w-3" />
                            <span>{t.surat_jalan_number}</span>
                          </button>
                        )}
                      </td>

                      {/* Route */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
                          <span className="text-[#444746] dark:text-[#c4c7c5]">{t.from_location}</span>
                          <span className="text-[#0b57d0] dark:text-[#a8c7fa]">&rarr;</span>
                          <span className="text-[#0b57d0] dark:text-[#a8c7fa]">{t.to_location}</span>
                        </div>
                        <div className="text-[10px] text-[#747775] dark:text-[#8e918f] mt-0.5">
                          {t.source_type === 'GUDANG_PUSAT' ? 'Gudang Pusat' : 'Outlet'} &rarr; {t.destination_type === 'GUDANG_PUSAT' ? 'Gudang Pusat' : 'Outlet Cabang'}
                        </div>
                      </td>

                      {/* Dates & Logistics */}
                      <td className="py-3 px-3">
                        <div className="text-xs font-medium text-[#1f1f1f] dark:text-[#e3e3e3]">
                          Kirim: {formatDateOnly(t.transfer_date)}
                        </div>
                        {t.received_date && (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Tiba: {formatDateOnly(t.received_date)}
                          </div>
                        )}
                        <div className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-0.5">
                          {t.expedition_courier || 'Armada Internal'} {t.tracking_number ? `(${t.tracking_number})` : ''}
                        </div>
                      </td>

                      {/* PICs */}
                      <td className="py-3 px-3">
                        <div className="text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
                          <span className="text-[#747775] dark:text-[#8e918f]">Pengirim:</span> {t.sender_pic}
                        </div>
                        <div className="text-xs text-[#1f1f1f] dark:text-[#e3e3e3] mt-0.5">
                          <span className="text-[#747775] dark:text-[#8e918f]">Penerima:</span>{' '}
                          {t.receiver_pic ? (
                            <strong className="text-emerald-700 dark:text-emerald-300">{t.receiver_pic}</strong>
                          ) : (
                            <span className="italic text-[#747775]">Menunggu konfirmasi</span>
                          )}
                        </div>
                      </td>

                      {/* Items Count */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedTransfer(t);
                            setIsDetailModalOpen(true);
                          }}
                          className="rounded-full bg-[#f0f4f9] dark:bg-[#282a2c] hover:bg-[#e0e2ec] px-2.5 py-1 text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] transition-colors"
                        >
                          {t.items?.length || 0} Unit
                        </button>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        {isInTransit && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                            <Truck className="h-3 w-3" />
                            Dalam Perjalanan
                          </span>
                        )}
                        {isReceived && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Diterima di Tujuan
                          </span>
                        )}
                        {t.status === 'DRAFT' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            <FileText className="h-3 w-3" />
                            Draft
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isInTransit && (
                            <button
                              onClick={() => handleOpenReceiveModal(t)}
                              className="flex items-center gap-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-xs font-semibold transition-colors shadow-xs"
                              title="Konfirmasi Kedatangan Barang di Cabang Tujuan"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Konfirmasi Tiba</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setSelectedTransfer(t);
                              setIsPrintModalOpen(true);
                            }}
                            className="p-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] text-[#444746] dark:text-[#c4c7c5] transition-colors"
                            title="Cetak Surat Jalan Mutasi"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedTransfer(t);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] text-[#444746] dark:text-[#c4c7c5] transition-colors"
                            title="Lihat Detail Mutasi"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: BUAT MUTASI ASET BARU */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in">
          <div className="relative max-h-[90vh] w-full max-w-3xl flex flex-col rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] shadow-2xl overflow-hidden">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-6 py-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                  Buat Dokumen Mutasi Transfer Aset
                </h2>
                <p className="text-xs text-[#747775] dark:text-[#8e918f]">
                  Catat pemindahan aset antar-cabang atau dari Gudang Pusat SCGA dan terbitkan Surat Jalan resmi.
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
                    Lokasi Tujuan (Penerima)
                  </label>
                  <select
                    value={toLocation}
                    onChange={(e) => {
                      setToLocation(e.target.value);
                      setDestinationType(e.target.value === 'Gudang Pusat SCGA' ? 'GUDANG_PUSAT' : 'OUTLET');
                    }}
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  >
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
                    Tanggal Pengiriman / Mutasi
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
                    Kurir / Armada Ekspedisi
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

              {/* Form Input Item Mutasi */}
              <div className="space-y-3 p-4 rounded-2xl bg-[#f0f4f9]/60 dark:bg-[#282a2c]/40 border border-[#e0e2ec] dark:border-[#444746]">
                <div className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Tambah Item Aset yang Dimutasi
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
                        placeholder="Misal: No. seri, warna, kelengkapan kabel..."
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
                  Catatan Mutasi / Alasan Pemindahan
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Catatan tambahan untuk surat jalan..."
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
                  <ArrowRightLeft className="h-4 w-4" />
                  <span>{isSubmitting ? 'Memproses...' : 'Terbitkan Surat Jalan & Kirim'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: KONFIRMASI PENERIMAAN DI LOKASI TUJUAN */}
      {isReceiveModalOpen && selectedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] bg-emerald-50 dark:bg-emerald-950/40 px-6 py-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Konfirmasi Penerimaan Aset
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
                  No. Transfer: <strong className="font-mono text-[#0b57d0]">{selectedTransfer.transfer_number}</strong>
                </div>
                {selectedTransfer.surat_jalan_number && (
                  <div>
                    No. Surat Jalan: <strong>{selectedTransfer.surat_jalan_number}</strong>
                  </div>
                )}
                <div>
                  Tujuan: <strong>{selectedTransfer.to_location}</strong> (dari {selectedTransfer.from_location})
                </div>
                <div>
                  Total Item: <strong>{selectedTransfer.items?.length || 0} unit</strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                  Nama PIC Penerima di Lokasi Tujuan *
                </label>
                <input
                  type="text"
                  required
                  value={receivePic}
                  onChange={(e) => setReceivePic(e.target.value)}
                  placeholder="Nama manajer outlet / PIC penerima..."
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
                  placeholder="Kondisi fisik barang saat tiba..."
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

      {/* MODAL 3: CETAK SURAT JALAN MUTASI */}
      {isPrintModalOpen && selectedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in">
          <div className="relative max-h-[95vh] w-full max-w-3xl flex flex-col rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-6 py-4 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <h2 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Pratinjau Surat Jalan Mutasi Aset
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
                    <p className="text-xs text-gray-600">SISTEM MANAJEMEN INVENTARIS &amp; LOGISTIK ASET</p>
                    <p className="text-[11px] text-gray-500">Gudang Pusat SCGA Logistik</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-lg font-bold uppercase text-[#0b57d0]">Surat Jalan Mutasi Aset</h2>
                    <p className="font-mono text-xs font-bold">{selectedTransfer.surat_jalan_number || 'SJ-MUT-OFFICIAL'}</p>
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
                  <div className="font-bold text-gray-700 uppercase text-[10px]">Lokasi Tujuan (Penerima):</div>
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
                  <div className="text-[10px] text-gray-500">Logistik SCGA / Outlet Asal</div>
                </div>

                <div>
                  <div className="text-gray-600 mb-14">Dibawa Oleh (Kurir / Driver),</div>
                  <div className="font-bold underline">
                    {selectedTransfer.expedition_courier || 'Ekspedisi'}
                  </div>
                  <div className="text-[10px] text-gray-500">Petugas Pengantar</div>
                </div>

                <div>
                  <div className="text-gray-600 mb-14">Diterima Oleh (Penerima),</div>
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

      {/* MODAL 4: DETAIL RINCIAN MUTASI */}
      {isDetailModalOpen && selectedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in">
          <div className="relative max-h-[85vh] w-full max-w-xl rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Rincian Dokumen Mutasi
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
                  <span className="text-[#747775]">Rute Mutasi:</span>
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
                <div className="font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] mb-2">
                  Daftar Barang ({selectedTransfer.items?.length || 0})
                </div>
                <div className="divide-y divide-[#e0e2ec] dark:divide-[#444746] border border-[#e0e2ec] dark:border-[#444746] rounded-xl overflow-hidden">
                  {selectedTransfer.items?.map((it, idx) => (
                    <div key={it.id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{it.item_name}</div>
                        {it.notes && <div className="text-[11px] text-[#747775]">{it.notes}</div>}
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-[#0b57d0]">{it.quantity} Unit</span>
                        <div className="text-[10px] text-[#747775]">{it.condition}</div>
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

      {/* MODAL 5: KONFIRMASI RESET SELURUH DATA TRANSFER */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-[#1e1f20] p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="h-10 w-10 rounded-2xl bg-rose-50 dark:bg-rose-950 flex items-center justify-center">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Bersihkan Seluruh Data Transfer?
                </h3>
                <p className="text-xs text-rose-600 dark:text-rose-400">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <p className="text-xs text-[#444746] dark:text-[#c4c7c5] leading-relaxed mb-4">
              Aksi ini akan:
              <br />• Menghapus seluruh riwayat dokumen transfer aset di basis data.
              <br />• Me-reset seluruh checklist <strong>Role Transfer</strong> pada tabel aset menjadi 0.
              <br />• Mengosongkan memori antrean transfer secara permanen.
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
    </div>
  );
}
