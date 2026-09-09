'use client';

import React, { useState } from 'react';
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
  UserCheck 
} from 'lucide-react';
import { AssetTransfer, Outlet } from '@/lib/supabase/types';

interface TransferAssetViewProps {
  initialTransfers: AssetTransfer[];
  outlets: Outlet[];
}

export function TransferAssetView({ initialTransfers, outlets }: TransferAssetViewProps) {
  const [transfers, setTransfers] = useState<AssetTransfer[]>(initialTransfers);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New transfer form state
  const [fromLocation, setFromLocation] = useState('Gudang Pusat SCGA');
  const [toLocation, setToLocation] = useState(outlets[0]?.branch_name || 'Mie Ayam Muntjul Karawang');
  const [senderPic, setSenderPic] = useState('Staff Logistik SCGA');
  const [receiverPic, setReceiverPic] = useState('');
  const [notes, setNotes] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemCondition, setItemCondition] = useState<'BAIK' | 'PERLU_PERBAIKAN' | 'BEKAS_LAYAK'>('BAIK');
  const [itemsList, setItemsList] = useState<Array<{ id: string; item_name: string; quantity: number; condition: 'BAIK' | 'PERLU_PERBAIKAN' | 'BEKAS_LAYAK' }>>([]);

  const handleAddItem = () => {
    if (!itemName.trim()) return;
    setItemsList((prev) => [
      ...prev,
      {
        id: `ti-${Date.now()}`,
        item_name: itemName.trim(),
        quantity: itemQty,
        condition: itemCondition,
      },
    ]);
    setItemName('');
    setItemQty(1);
  };

  const handleRemoveItem = (id: string) => {
    setItemsList((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itemsList.length === 0) {
      alert('Tambahkan minimal 1 item untuk ditransfer.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: Partial<AssetTransfer> = {
        transfer_number: `TRF/CA/${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`,
        from_location: fromLocation,
        to_location: toLocation,
        transfer_date: new Date().toISOString().split('T')[0],
        status: 'IN_TRANSIT',
        sender_pic: senderPic,
        receiver_pic: receiverPic,
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
        setIsModalOpen(false);
        setItemsList([]);
        setNotes('');
      }
    } catch (err) {
      console.error('Failed to submit transfer:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = transfers.filter((t) =>
    t.transfer_number.toLowerCase().includes(search.toLowerCase()) ||
    t.from_location.toLowerCase().includes(search.toLowerCase()) ||
    t.to_location.toLowerCase().includes(search.toLowerCase()) ||
    t.sender_pic.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Action Header Card */}
      <div className="panel-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#747775] dark:text-[#8e918f]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nomor transfer, lokasi asal, atau tujuan..."
            className="w-full rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] pl-9 pr-4 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
          />
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-4 py-2 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors shadow-sm shrink-0"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Buat Transfer Aset</span>
        </button>
      </div>

      {/* Transfers List Table */}
      <div className="panel-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
            <thead className="bg-[#f0f4f9] dark:bg-[#1e1f20] text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] border-b border-[#e0e2ec] dark:border-[#444746]">
              <tr>
                <th className="py-3.5 px-4">No. Dokumen</th>
                <th className="py-3.5 px-4">Tanggal</th>
                <th className="py-3.5 px-4">Dari (Lokasi Asal)</th>
                <th className="py-3.5 px-4">Ke (Lokasi Tujuan)</th>
                <th className="py-3.5 px-4">Daftar Item</th>
                <th className="py-3.5 px-4">PIC Pengirim</th>
                <th className="py-3.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#747775] dark:text-[#8e918f]">
                    Belum ada data riwayat transfer aset.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const isInTransit = t.status === 'IN_TRANSIT';
                  const isReceived = t.status === 'RECEIVED';

                  return (
                    <tr key={t.id} className="hover:bg-[#f0f4f9]/50 dark:hover:bg-[#282a2c]/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
                        {t.transfer_number}
                      </td>
                      <td className="py-3 px-4 text-[#444746] dark:text-[#c4c7c5] whitespace-nowrap">
                        {t.transfer_date}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {t.from_location}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                        {t.to_location}
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          {t.items.map((it, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                              <Package className="h-3 w-3 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                              <span className="font-medium">{it.item_name}</span>
                              <span className="text-[#747775] dark:text-[#8e918f]">({it.quantity} unit - {it.condition})</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#444746] dark:text-[#c4c7c5]">
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-3.5 w-3.5 text-[#137333] dark:text-[#6dd58c]" />
                          <span>{t.sender_pic}</span>
                        </div>
                        {t.receiver_pic && (
                          <div className="text-[10px] text-[#747775] dark:text-[#8e918f] mt-0.5">
                            Penerima: {t.receiver_pic}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            isInTransit
                              ? 'bg-[#feeed9] text-[#b06000] dark:bg-[#2e1500] dark:text-[#ffb951]'
                              : isReceived
                              ? 'bg-[#c4eed0] text-[#072711] dark:bg-[#0f5223] dark:text-[#6dd58c]'
                              : 'bg-[#f0f4f9] text-[#444746] dark:bg-[#282a2c] dark:text-[#c4c7c5]'
                          }`}
                        >
                          {isInTransit ? <Truck className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Buat Transfer */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="panel-card w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl border border-[#e0e2ec] dark:border-[#444746]">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <h3 className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Formulir Transfer Aset Baru
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-full hover:bg-[#e9eef6] dark:hover:bg-[#282a2c] text-[#747775]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTransfer} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">
                    Lokasi Asal (Pengirim)
                  </label>
                  <input
                    type="text"
                    value={fromLocation}
                    onChange={(e) => setFromLocation(e.target.value)}
                    required
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">
                    Lokasi Tujuan (Penerima)
                  </label>
                  <select
                    value={toLocation}
                    onChange={(e) => setToLocation(e.target.value)}
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  >
                    {outlets.map((o) => (
                      <option key={o.id} value={o.branch_name}>
                        {o.branch_name} ({o.region})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">
                    PIC Pengirim
                  </label>
                  <input
                    type="text"
                    value={senderPic}
                    onChange={(e) => setSenderPic(e.target.value)}
                    required
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">
                    PIC Penerima di Outlet
                  </label>
                  <input
                    type="text"
                    value={receiverPic}
                    onChange={(e) => setReceiverPic(e.target.value)}
                    placeholder="Nama Outlet Manager / Store Leader"
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  />
                </div>
              </div>

              {/* Item Entry Sub-Section */}
              <div className="rounded-2xl border border-[#e0e2ec] dark:border-[#444746] p-3.5 bg-[#ffffff] dark:bg-[#282a2c]/40 space-y-3">
                <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-between">
                  <span>Daftar Item yang Ditransfer ({itemsList.length})</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-6">
                    <label className="block text-[10px] text-[#747775] dark:text-[#8e918f] mb-0.5">Nama Item Aset</label>
                    <input
                      type="text"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="Contoh: Chiller 2 Pintu, Meja Stainless"
                      className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] text-[#747775] dark:text-[#8e918f] mb-0.5">Jumlah</label>
                    <input
                      type="number"
                      min={1}
                      value={itemQty}
                      onChange={(e) => setItemQty(parseInt(e.target.value) || 1)}
                      className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[10px] text-[#747775] dark:text-[#8e918f] mb-0.5">Kondisi</label>
                    <select
                      value={itemCondition}
                      onChange={(e: any) => setItemCondition(e.target.value)}
                      className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]"
                    >
                      <option value="BAIK">Baik (Siap Pakai)</option>
                      <option value="BEKAS_LAYAK">Bekas Layak</option>
                      <option value="PERLU_PERBAIKAN">Perlu Servis</option>
                    </select>
                  </div>

                  <div className="sm:col-span-1">
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="w-full flex items-center justify-center rounded-lg bg-[#0b57d0] py-1.5 text-white hover:bg-[#0842a0]"
                      title="Tambah Item"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {itemsList.length > 0 && (
                  <div className="divide-y divide-[#e0e2ec] dark:divide-[#444746] pt-1">
                    {itemsList.map((it) => (
                      <div key={it.id} className="flex items-center justify-between py-1.5 text-xs">
                        <div>
                          <span className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">{it.item_name}</span>
                          <span className="text-[#747775] dark:text-[#8e918f] ml-2 font-mono">x{it.quantity} ({it.condition})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(it.id)}
                          className="text-[#b3261e] hover:underline text-[11px]"
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">
                  Catatan / Instruksi Pengiriman
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Catatan tambahan ekspedisi atau kondisi aset..."
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e0e2ec] dark:border-[#444746]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full border border-[#e0e2ec] dark:border-[#444746] px-4 py-2 text-xs font-semibold text-[#444746] dark:text-[#c4c7c5] hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || itemsList.length === 0}
                  className="rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-5 py-2 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] disabled:opacity-50 shadow-sm"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Terbitkan Transfer Aset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
