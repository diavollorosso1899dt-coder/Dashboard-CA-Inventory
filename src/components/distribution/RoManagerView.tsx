'use client';

import React, { useState } from 'react';
import { 
  FileCheck2, 
  PlusCircle, 
  Search, 
  Clock, 
  CheckCircle2, 
  Truck, 
  X, 
  Printer, 
  Package, 
  Calendar,
  AlertCircle
} from 'lucide-react';
import { RequestOrder, Outlet, ROItem } from '@/lib/supabase/types';
import { useRouter } from 'next/navigation';

interface RoManagerViewProps {
  initialOrders?: RequestOrder[];
  outlets?: Outlet[];
}

export function RoManagerView({ initialOrders = [], outlets = [] }: RoManagerViewProps) {
  const router = useRouter();
  const [orders, setOrders] = useState<RequestOrder[]>(initialOrders);
  const [outletList, setOutletList] = useState<Outlet[]>(outlets);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Load from API if props were empty
  React.useEffect(() => {
    if (orders.length === 0) {
      fetch('/api/distribution/ro')
        .then(res => res.json())
        .then(data => { if (data.data) setOrders(data.data); })
        .catch(console.error);
    }
    if (outletList.length === 0) {
      fetch('/api/outlets')
        .then(res => res.json())
        .then(data => { if (data.data) setOutletList(data.data); })
        .catch(console.error);
    }
  }, []);

  // New RO Modal State
  const [isRoModalOpen, setIsRoModalOpen] = useState(false);
  const [branchName, setBranchName] = useState(outletList[0]?.branch_name || outletList[0]?.nama || 'CA - Grand Batam Mall');
  const [region, setRegion] = useState<'JABODETABEK' | 'KALBAR'>('JABODETABEK');
  const [requesterName, setRequesterName] = useState('Staff Logistik CA');
  const [targetDeliveryDate, setTargetDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [stockSource, setStockSource] = useState<'GUDANG_SCGA' | 'PR_VENDOR'>('GUDANG_SCGA');
  const [itemsList, setItemsList] = useState<ROItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate SJ Modal State
  const [selectedRoForSj, setSelectedRoForSj] = useState<RequestOrder | null>(null);
  const [driverName, setDriverName] = useState('Suryanto');
  const [vehicleNumber, setVehicleNumber] = useState('B 9482 SXZ');
  const [expedition, setExpedition] = useState('Armada Internal SCGA');

  const handleAddItemToRo = () => {
    if (!itemName.trim()) return;
    setItemsList((prev) => [
      ...prev,
      {
        id: `roi-${Date.now()}`,
        item_name: itemName.trim(),
        quantity_ordered: itemQty,
        quantity_fulfilled: stockSource === 'GUDANG_SCGA' ? itemQty : 0,
        stock_source: stockSource,
      },
    ]);
    setItemName('');
    setItemQty(1);
  };

  const handleRemoveItem = (id: string) => {
    setItemsList((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSubmitRo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itemsList.length === 0) {
      alert('Tambahkan minimal 1 item untuk RO ini.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: Partial<RequestOrder> = {
        ro_number: `RO-CA-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
        branch_name: branchName,
        region,
        requester_name: requesterName,
        request_date: new Date().toISOString().split('T')[0],
        target_delivery_date: targetDeliveryDate || undefined,
        status: 'PENDING',
        items: itemsList,
        notes,
      };

      const res = await fetch('/api/distribution/ro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setOrders((prev) => [json.data, ...prev]);
        setIsRoModalOpen(false);
        setItemsList([]);
        setNotes('');
      }
    } catch (err) {
      console.error('Failed to create RO:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: RequestOrder['status']) => {
    try {
      await fetch('/api/distribution/ro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });

      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
      );
    } catch (err) {
      console.error('Failed to update RO status:', err);
    }
  };

  const handleGenerateSuratJalan = async () => {
    if (!selectedRoForSj) return;

    try {
      setIsSubmitting(true);
      const payload = {
        ro_id: selectedRoForSj.id,
        ro_number: selectedRoForSj.ro_number,
        branch_name: selectedRoForSj.branch_name,
        region: selectedRoForSj.region,
        delivery_date: new Date().toISOString().split('T')[0],
        driver_name: driverName,
        vehicle_number: vehicleNumber,
        expedition: expedition,
        sender_name: 'Staff SCGA Warehouse',
        receiver_name: `PIC ${selectedRoForSj.branch_name}`,
        status: 'SHIPPED',
        items: selectedRoForSj.items.map((it) => ({
          id: `sji-${Date.now()}-${Math.random().toString().slice(-4)}`,
          item_name: it.item_name,
          specification: it.specification,
          quantity: it.quantity_ordered,
          unit: 'Unit',
          notes: it.stock_source === 'GUDANG_SCGA' ? 'Dari Stok Gudang SCGA' : 'Pengadaan PR Vendor',
        })),
        notes: `Diterbitkan otomatis dari ${selectedRoForSj.ro_number}`,
      };

      const res = await fetch('/api/distribution/surat-jalan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success && json.data) {
        await handleUpdateStatus(selectedRoForSj.id, 'IN_DELIVERY');
        setSelectedRoForSj(null);
        router.push(`/distribution/surat-jalan/print/${json.data.id}`);
      }
    } catch (err) {
      console.error('Failed to generate Surat Jalan:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = orders.filter((o) => {
    const matchSearch =
      o.ro_number.toLowerCase().includes(search.toLowerCase()) ||
      o.branch_name.toLowerCase().includes(search.toLowerCase()) ||
      o.requester_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="panel-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#747775] dark:text-[#8e918f]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor RO, cabang, atau nama pengaju..."
              className="w-full rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] pl-9 pr-4 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none"
          >
            <option value="ALL">Semua Status</option>
            <option value="PENDING">Menunggu Persetujuan</option>
            <option value="APPROVED">Disetujui (Siap SJ)</option>
            <option value="IN_DELIVERY">Dalam Pengiriman</option>
            <option value="COMPLETED">Selesai</option>
          </select>
        </div>

        <button
          onClick={() => setIsRoModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-4 py-2 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors shadow-sm shrink-0"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Buat RO Baru</span>
        </button>
      </div>

      {/* RO Table */}
      <div className="panel-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
            <thead className="bg-[#f0f4f9] dark:bg-[#1e1f20] text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] border-b border-[#e0e2ec] dark:border-[#444746]">
              <tr>
                <th className="py-3.5 px-4">No. RO</th>
                <th className="py-3.5 px-4">Tanggal Order</th>
                <th className="py-3.5 px-4">Cabang Outlet</th>
                <th className="py-3.5 px-4">Item Dipesan</th>
                <th className="py-3.5 px-4">Target Kirim</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Aksi Distribusi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#747775] dark:text-[#8e918f]">
                    Tidak ada dokumen Request Order (RO) yang ditemukan.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => {
                  const isApproved = o.status === 'APPROVED';
                  const isPending = o.status === 'PENDING';
                  const isInDelivery = o.status === 'IN_DELIVERY';
                  const isCompleted = o.status === 'COMPLETED';

                  return (
                    <tr key={o.id} className="hover:bg-[#f0f4f9]/50 dark:hover:bg-[#282a2c]/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
                        {o.ro_number}
                      </td>
                      <td className="py-3.5 px-4 text-[#444746] dark:text-[#c4c7c5] whitespace-nowrap">
                        {o.request_date}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">{o.branch_name}</div>
                        <div className="text-[10px] text-[#747775] dark:text-[#8e918f]">{o.region} &bull; {o.requester_name}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {o.items.map((it, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                              <Package className="h-3 w-3 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                              <span className="font-medium">{it.item_name}</span>
                              <span className="text-[#747775] dark:text-[#8e918f]">
                                (x{it.quantity_ordered} &bull; {it.stock_source === 'GUDANG_SCGA' ? 'Gudang' : 'PR'})
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[#444746] dark:text-[#c4c7c5] whitespace-nowrap">
                        {o.target_delivery_date || '-'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            isApproved
                              ? 'bg-[#c4eed0] text-[#072711] dark:bg-[#0f5223] dark:text-[#6dd58c]'
                              : isPending
                              ? 'bg-[#feeed9] text-[#b06000] dark:bg-[#2e1500] dark:text-[#ffb951]'
                              : isInDelivery
                              ? 'bg-[#e8f0fe] text-[#0b57d0] dark:bg-[#004a77] dark:text-[#c2e7ff]'
                              : 'bg-[#f0f4f9] text-[#444746] dark:bg-[#282a2c] dark:text-[#c4c7c5]'
                          }`}
                        >
                          {isPending && <Clock className="h-3 w-3" />}
                          {isApproved && <CheckCircle2 className="h-3 w-3" />}
                          {isInDelivery && <Truck className="h-3 w-3" />}
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && (
                            <button
                              onClick={() => handleUpdateStatus(o.id, 'APPROVED')}
                              className="rounded-full bg-[#137333] text-white px-3 py-1 text-[11px] font-semibold hover:bg-[#0f5223]"
                            >
                              Setujui RO
                            </button>
                          )}

                          {(isApproved || isInDelivery) && (
                            <button
                              onClick={() => setSelectedRoForSj(o)}
                              className="flex items-center gap-1 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] px-3 py-1 text-[11px] font-semibold hover:bg-[#0842a0] shadow-xs"
                            >
                              <Printer className="h-3 w-3" />
                              <span>{isInDelivery ? 'Cetak Ulang SJ' : 'Buat Surat Jalan'}</span>
                            </button>
                          )}
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

      {/* Modal Buat RO Baru */}
      {isRoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="panel-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl border border-[#e0e2ec] dark:border-[#444746]">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] pb-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <h3 className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Buat Request Order (RO) Baru
                </h3>
              </div>
              <button onClick={() => setIsRoModalOpen(false)} className="p-1 rounded-full hover:bg-[#e9eef6]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRo} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Cabang Outlet</label>
                  <select
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3]"
                  >
                    {outlets.map((o) => (
                      <option key={o.id} value={o.branch_name}>
                        {o.branch_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Target Kirim</label>
                  <input
                    type="date"
                    value={targetDeliveryDate}
                    onChange={(e) => setTargetDeliveryDate(e.target.value)}
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3]"
                  />
                </div>
              </div>

              {/* Items in RO */}
              <div className="rounded-2xl border border-[#e0e2ec] dark:border-[#444746] p-3.5 bg-[#ffffff] dark:bg-[#282a2c]/40 space-y-3">
                <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Daftar Item Kebutuhan Outlet ({itemsList.length})
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-6">
                    <label className="block text-[10px] text-[#747775]">Nama Item</label>
                    <input
                      type="text"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="Contoh: Meja Lesehan, Chiller"
                      className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] text-[#747775]">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={itemQty}
                      onChange={(e) => setItemQty(parseInt(e.target.value) || 1)}
                      className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] text-[#747775]">Sumber</label>
                    <select
                      value={stockSource}
                      onChange={(e: any) => setStockSource(e.target.value)}
                      className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                    >
                      <option value="GUDANG_SCGA">Gudang SCGA</option>
                      <option value="PR_VENDOR">PR / Beli Baru</option>
                    </select>
                  </div>
                  <div className="sm:col-span-1">
                    <button
                      type="button"
                      onClick={handleAddItemToRo}
                      className="w-full flex items-center justify-center rounded-lg bg-[#0b57d0] py-1.5 text-white hover:bg-[#0842a0]"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {itemsList.length > 0 && (
                  <div className="divide-y divide-[#e0e2ec] dark:divide-[#444746] pt-1">
                    {itemsList.map((it) => (
                      <div key={it.id} className="flex items-center justify-between py-1 text-xs">
                        <span>{it.item_name} &bull; x{it.quantity_ordered} ({it.stock_source})</span>
                        <button type="button" onClick={() => handleRemoveItem(it.id)} className="text-[#b3261e] text-[11px]">
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e0e2ec] dark:border-[#444746]">
                <button
                  type="button"
                  onClick={() => setIsRoModalOpen(false)}
                  className="rounded-full border border-[#e0e2ec] dark:border-[#444746] px-4 py-2 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || itemsList.length === 0}
                  className="rounded-full bg-[#0b57d0] text-white px-5 py-2 font-semibold hover:bg-[#0842a0]"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Dokumen RO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Terbitkan Surat Jalan (SJ) */}
      {selectedRoForSj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="panel-card w-full max-w-md p-6 space-y-4 shadow-2xl border border-[#e0e2ec] dark:border-[#444746]">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] pb-3">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <h3 className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Terbitkan Surat Jalan (SJ)
                </h3>
              </div>
              <button onClick={() => setSelectedRoForSj(null)} className="p-1 rounded-full hover:bg-[#e9eef6]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="rounded-xl bg-[#f0f4f9] dark:bg-[#282a2c] p-3 space-y-1">
                <div><strong>No. RO:</strong> {selectedRoForSj.ro_number}</div>
                <div><strong>Tujuan:</strong> {selectedRoForSj.branch_name}</div>
                <div><strong>Total Item:</strong> {selectedRoForSj.items.length} macam barang</div>
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Nama Driver / Pengemudi</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Nomor Polisi Kendaraan</label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Nama Ekspedisi / Armada</label>
                <input
                  type="text"
                  value={expedition}
                  onChange={(e) => setExpedition(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e0e2ec] dark:border-[#444746]">
              <button
                type="button"
                onClick={() => setSelectedRoForSj(null)}
                className="rounded-full border border-[#e0e2ec] dark:border-[#444746] px-4 py-2 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleGenerateSuratJalan}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] text-white px-5 py-2 text-xs font-semibold hover:bg-[#0842a0] shadow-sm"
              >
                <Printer className="h-4 w-4" />
                <span>{isSubmitting ? 'Menerbitkan...' : 'Terbitkan & Cetak SJ'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoManagerView;
