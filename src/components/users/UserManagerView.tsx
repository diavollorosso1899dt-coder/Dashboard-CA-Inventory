'use client';

import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole, APP_FEATURES, ALL_FEATURE_IDS, AppFeature } from '@/lib/supabase/types';
import { 
  Users, 
  ShieldCheck, 
  Shield,
  UserCheck, 
  Store, 
  Plus, 
  Search, 
  RefreshCw, 
  Mail, 
  Check, 
  Edit, 
  SlidersHorizontal,
  Lock,
  Building2,
  Eye,
  EyeOff,
  AtSign,
  Trash2,
  CheckSquare,
  Square,
  Sparkles,
  Layers
} from 'lucide-react';

import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import ColumnVisibilityPicker, { ColumnItem, useColumnVisibility } from '@/components/ui/ColumnVisibilityPicker';
import { SortableHeader, useTableSort } from '@/components/ui/SortableHeader';

export const DEFAULT_SUPERUSER_FEATURES = ALL_FEATURE_IDS;
export const DEFAULT_ADMIN_FEATURES = [
  'dashboard', 'so_harian', 'assets_tracking', 'assets_input',
  'kelola_ro', 'purchase_pr', 'surat_jalan', 'monitoring_transfer', 'monitoring_sla',
  'master_items', 'master_outlets', 'trash_audit'
];
export const DEFAULT_LOGISTICS_FEATURES = [
  'dashboard', 'so_harian', 'assets_tracking', 'assets_input',
  'kelola_ro', 'purchase_pr', 'surat_jalan', 'monitoring_transfer', 'monitoring_sla'
];
export const DEFAULT_OUTLET_FEATURES = ['dashboard', 'assets_tracking', 'kelola_ro'];
export const DEFAULT_TRASH_FEATURES = DEFAULT_ADMIN_FEATURES;

const USER_COLUMNS: ColumnItem[] = [
  { id: 'user_info', label: 'Nama Lengkap & Username', defaultVisible: true, alwaysVisible: true },
  { id: 'role', label: 'Peran (Role)', defaultVisible: true },
  { id: 'features', label: 'Hak Akses Fitur', defaultVisible: true },
  { id: 'outlet', label: 'Penugasan Outlet', defaultVisible: true },
  { id: 'status', label: 'Status Akun', defaultVisible: true },
  { id: 'actions', label: 'Aksi', defaultVisible: true, alwaysVisible: true },
];

export default function UserManagerView() {
  const { user: currentUser } = useAuth();
  const searchParams = useSearchParams();
  const initialRole = searchParams.get('role') || 'ALL';

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [outlets, setOutlets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>(initialRole);

  // Column Visibility
  const { visibleColumns, setVisibleColumns, isVisible } = useColumnVisibility(
    'ca_user_columns',
    USER_COLUMNS
  );
  const visibleColCount = USER_COLUMNS.filter((c) => isVisible(c.id)).length;

  useEffect(() => {
    const r = searchParams.get('role');
    if (r) setRoleFilter(r);
  }, [searchParams]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<{
    id?: string;
    username: string;
    email?: string;
    password?: string;
    full_name: string;
    role: UserRole;
    outlet_assigned: string;
    allowed_features: string[];
  }>({
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'User',
    outlet_assigned: '',
    allowed_features: DEFAULT_LOGISTICS_FEATURES,
  });

  const toggleFeature = (id: string) => {
    if (id === 'user_management' && formData.role !== 'Super User') {
      alert('Fitur Hak Akses Pengguna hanya dapat dibuka untuk akun dengan peran Super User.');
      return;
    }
    setFormData((prev) => {
      const exists = prev.allowed_features.includes(id);
      return {
        ...prev,
        allowed_features: exists
          ? prev.allowed_features.filter((f) => f !== id)
          : [...prev.allowed_features, id],
      };
    });
  };

  const applyFeaturePreset = (type: 'all' | 'admin' | 'logistics' | 'outlet' | 'trash' | 'clear') => {
    switch (type) {
      case 'all':
        setFormData((prev) => ({ ...prev, allowed_features: DEFAULT_SUPERUSER_FEATURES }));
        break;
      case 'admin':
      case 'trash':
        setFormData((prev) => ({ ...prev, allowed_features: DEFAULT_ADMIN_FEATURES }));
        break;
      case 'logistics':
        setFormData((prev) => ({ ...prev, allowed_features: DEFAULT_LOGISTICS_FEATURES }));
        break;
      case 'outlet':
        setFormData((prev) => ({ ...prev, allowed_features: DEFAULT_OUTLET_FEATURES }));
        break;
      case 'clear':
        setFormData((prev) => ({ ...prev, allowed_features: [] }));
        break;
    }
  };

  const handleRoleChange = (newRole: UserRole) => {
    let newFeatures = formData.allowed_features;
    if (newRole === 'Super User') {
      newFeatures = DEFAULT_SUPERUSER_FEATURES;
    } else if (newRole === 'Admin' || (newRole as any) === 'admin' || newRole === 'Manajemen Sampah & Log') {
      newFeatures = DEFAULT_ADMIN_FEATURES;
    } else if (newRole === 'User Outlet Manager') {
      newFeatures = DEFAULT_OUTLET_FEATURES;
    } else if (newRole === 'User') {
      newFeatures = DEFAULT_LOGISTICS_FEATURES;
    }
    setFormData((prev) => ({
      ...prev,
      role: newRole,
      allowed_features: newFeatures,
    }));
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const [uRes, oRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/outlets')
      ]);
      const uData = await uRes.json();
      const oData = await oRes.json();
      if (uData.data) setUsers(uData.data);
      if (oData.data) setOutlets(oData.data);
    } catch (err) {
      console.error('Failed to load user data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = (formData.username || formData.email || '').trim().toLowerCase();
    if (!cleanUsername) {
      alert('Username wajib diisi');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          username: cleanUsername,
          email: cleanUsername,
        })
      });
      const json = await res.json();
      if (json.success) {
        setIsModalOpen(false);
        fetchUsers();
      } else {
        alert(json.error || 'Gagal menyimpan data pengguna');
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!formData.id && !formData.username) return;

    const targetIdentifier = (formData.username || formData.email || '').trim().toLowerCase();
    
    // Prevent deleting currently logged in user
    if (
      currentUser?.email && 
      (currentUser.email.toLowerCase() === targetIdentifier || currentUser.id === formData.id)
    ) {
      alert('Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif login.');
      return;
    }

    const confirmDelete = window.confirm(
      `Apakah Anda yakin ingin menghapus akun "${formData.full_name}" (@${targetIdentifier})?\n\nData akun dan seluruh izin akses pengguna ini akan dihapus.`
    );
    if (!confirmDelete) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(formData.id || '')}&username=${encodeURIComponent(targetIdentifier)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        setIsModalOpen(false);
        fetchUsers();
      } else {
        alert(json.error || 'Gagal menghapus pengguna.');
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan saat menghapus pengguna.');
    } finally {
      setSubmitting(false);
    }
  };


  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'ALL') {
      if (roleFilter === 'Admin') {
        const rLower = (u.role || '').toLowerCase();
        if (u.role !== 'Admin' && !rLower.includes('admin') && !rLower.includes('sampah') && !rLower.includes('trash')) {
          return false;
        }
      } else if (u.role !== roleFilter) {
        return false;
      }
    }
    const q = search.toLowerCase();
    const uName = (u.username || u.email || '').toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      uName.includes(q) ||
      (u.outlet_assigned && u.outlet_assigned.toLowerCase().includes(q))
    );
  });

  const customUserSortFns = React.useMemo(
    () => ({
      user_info: (a: UserProfile, b: UserProfile) =>
        (a.full_name || a.username || '').localeCompare(b.full_name || b.username || '', 'id', { sensitivity: 'base' }),
      role: (a: UserProfile, b: UserProfile) =>
        (a.role || '').localeCompare(b.role || '', 'id'),
      outlet: (a: UserProfile, b: UserProfile) =>
        (a.outlet_assigned || '').localeCompare(b.outlet_assigned || '', 'id'),
      status: (a: UserProfile, b: UserProfile) =>
        (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1),
    }),
    []
  );

  const {
    sortField: userSortField,
    sortDirection: userSortDirection,
    handleSort: handleUserSort,
    sortedItems: sortedUsers,
  } = useTableSort<UserProfile>(filteredUsers, null, 'asc', customUserSortFns);

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'Super User':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
            <ShieldCheck className="w-3.5 h-3.5" /> Super User (Administrator)
          </span>
        );
      case 'Admin':
      case 'admin':
      case 'Manajemen Sampah & Log':
      case 'trash_audit_manager':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
            <Shield className="w-3.5 h-3.5" /> Admin (Operasional &amp; Log)
          </span>
        );
      case 'User Outlet Manager':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Store className="w-3.5 h-3.5" /> Outlet Manager
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <UserCheck className="w-3.5 h-3.5" /> Staff Pusat / Logistics
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/50 rounded-xl text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Kelola Hak Akses Pengguna (Users)</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Otorisasi hak akses berbasis peran: Super User, Admin, Staff Pusat/Logistik, dan User Outlet Manager
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              setFormData({
                username: '',
                email: '',
                password: '',
                full_name: '',
                role: 'Admin',
                outlet_assigned: '',
                allowed_features: DEFAULT_ADMIN_FEATURES,
              });
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Tambah Pengguna
          </button>
        </div>
      </div>

      {/* Role Explanation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-purple-50/50 dark:bg-purple-950/20 p-4 rounded-xl border border-purple-100 dark:border-purple-900/40">
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-sm mb-1">
            <ShieldCheck className="w-4 h-4" /> Super User
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Akses total seluruh modul: persetujuan RO, disposisi scrap, mutasi aset, cetak SJ, kelola otorisasi akun pengguna, dan penambahan outlet.
          </p>
        </div>

        <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-sm mb-1">
            <Shield className="w-4 h-4" /> Admin
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Akses operasional dan data: kelola aset, logistik, pengadaan, master data, serta Tempat Sampah &amp; audit log pemulihan.
          </p>
        </div>

        <div className="bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/40">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold text-sm mb-1">
            <UserCheck className="w-4 h-4" /> User (Staff Logistik)
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Fokus operasional: verifikasi ketersediaan stok gudang, packing barang, penugasan armada driver, dan pembaruan resi SJ.
          </p>
        </div>

        <div className="bg-amber-50/50 dark:bg-amber-950/20 p-4 rounded-xl border border-amber-100 dark:border-amber-900/40">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-bold text-sm mb-1">
            <Store className="w-4 h-4" /> Outlet Manager
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Akses spesifik ke outlet bersangkutan: membuat RO kebutuhan toko, konfirmasi penerimaan barang, dan lapor barang rusak.
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama, username, atau penugasan outlet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          <ColumnVisibilityPicker
            columns={USER_COLUMNS}
            visibleColumns={visibleColumns}
            onChange={setVisibleColumns}
            storageKey="ca_user_columns"
          />
          <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
          {['ALL', 'Super User', 'Admin', 'User', 'User Outlet Manager'].map((rf) => (
            <button
              key={rf}
              onClick={() => setRoleFilter(rf)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                roleFilter === rf
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {rf === 'ALL' ? 'Semua Peran' : rf}
            </button>
          ))}
        </div>
      </div>

      {/* User Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[calc(100vh-220px)] overflow-y-auto relative scrollbar-thin">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold uppercase tracking-wider shadow-xs">
              <tr>
                {isVisible('user_info') && (
                  <th className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 py-3.5 px-4 shadow-[inset_0_-1px_0_0_#e2e8f0] dark:shadow-[inset_0_-1px_0_0_#334155]">
                    <SortableHeader
                      label="Nama Lengkap & Username"
                      field="user_info"
                      currentSortField={userSortField}
                      currentSortDirection={userSortDirection}
                      onSort={handleUserSort}
                    />
                  </th>
                )}
                {isVisible('role') && (
                  <th className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 py-3.5 px-4 shadow-[inset_0_-1px_0_0_#e2e8f0] dark:shadow-[inset_0_-1px_0_0_#334155]">
                    <SortableHeader
                      label="Peran (Role)"
                      field="role"
                      currentSortField={userSortField}
                      currentSortDirection={userSortDirection}
                      onSort={handleUserSort}
                    />
                  </th>
                )}
                {isVisible('outlet') && (
                  <th className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 py-3.5 px-4 shadow-[inset_0_-1px_0_0_#e2e8f0] dark:shadow-[inset_0_-1px_0_0_#334155]">
                    <SortableHeader
                      label="Penugasan Outlet"
                      field="outlet"
                      currentSortField={userSortField}
                      currentSortDirection={userSortDirection}
                      onSort={handleUserSort}
                    />
                  </th>
                )}
                {isVisible('status') && (
                  <th className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 py-3.5 px-4 shadow-[inset_0_-1px_0_0_#e2e8f0] dark:shadow-[inset_0_-1px_0_0_#334155]">
                    <SortableHeader
                      label="Status Akun"
                      field="status"
                      currentSortField={userSortField}
                      currentSortDirection={userSortDirection}
                      onSort={handleUserSort}
                    />
                  </th>
                )}
                {isVisible('actions') && <th className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 py-3.5 px-4 text-center shadow-[inset_0_-1px_0_0_#e2e8f0] dark:shadow-[inset_0_-1px_0_0_#334155]">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={visibleColCount} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-500" />
                    Memuat daftar pengguna...
                  </td>
                </tr>
              ) : sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={visibleColCount} className="py-12 text-center text-slate-400">
                    Tidak ditemukan pengguna yang sesuai.
                  </td>
                </tr>
              ) : (
                sortedUsers.map((u) => {
                  const displayUsername = u.username || u.email;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      {isVisible('user_info') && (
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            {u.full_name}
                          </div>
                          <div className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                            <AtSign className="w-3 h-3 text-purple-500" />
                            <span>{displayUsername}</span>
                          </div>
                        </td>
                      )}

                      {isVisible('role') && (
                        <td className="py-3.5 px-4">
                          {getRoleBadge(u.role)}
                        </td>
                      )}

                      {isVisible('features') && (
                        <td className="py-3.5 px-4">
                          {u.role === 'Super User' || u.role === 'super_user' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                              <span>Akses Semua (13 Fitur)</span>
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 w-fit">
                                <SlidersHorizontal className="w-3 h-3 text-indigo-500" />
                                <span>{(u.allowed_features?.length || 0)}/13 Fitur Dibuka</span>
                              </span>
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {(u.allowed_features || []).slice(0, 3).map((fId) => {
                                  const feat = APP_FEATURES.find((f) => f.id === fId);
                                  return (
                                    <span key={fId} className="text-[10px] px-1.5 py-0.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400">
                                      {feat?.name || fId}
                                    </span>
                                  );
                                })}
                                {(u.allowed_features?.length || 0) > 3 && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-semibold rounded">
                                    +{(u.allowed_features?.length || 0) - 3} lainnya
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      )}

                      {isVisible('outlet') && (
                        <td className="py-3.5 px-4">
                          {u.outlet_assigned ? (
                            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                              <Store className="w-3.5 h-3.5 text-amber-500" />
                              {u.outlet_assigned}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Semua Cabang (Akses Global)</span>
                          )}
                        </td>
                      )}

                      {isVisible('status') && (
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                            <Check className="w-3 h-3" /> Aktif
                          </span>
                        </td>
                      )}

                      {isVisible('actions') && (
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => {
                              const uFeatures = Array.isArray(u.allowed_features) && u.allowed_features.length > 0
                                ? u.allowed_features
                                : (u.role === 'Super User' || u.role === 'super_user' ? ALL_FEATURE_IDS : DEFAULT_LOGISTICS_FEATURES);
                              setFormData({
                                id: u.id,
                                username: u.username || u.email,
                                email: u.email,
                                password: '',
                                full_name: u.full_name,
                                role: u.role,
                                outlet_assigned: u.outlet_assigned || '',
                                allowed_features: uFeatures,
                              });
                              setIsModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 rounded-lg transition"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah / Edit Pengguna */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {formData.id ? 'Edit Data & Hak Akses Pengguna' : 'Tambah Pengguna & Atur Hak Akses'}
                </h3>
                <p className="text-xs text-slate-400">
                  Super User dapat memilih fitur mana saja yang diizinkan untuk dibuka oleh pengguna ini.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    Nama Lengkap <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Budi Santoso"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    Username Akun <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Contoh: budi_logistik"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value.replace(/\s+/g, '') })}
                      className="w-full pl-10 pr-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    Kata Sandi (Password) {!formData.id && <span className="text-rose-500">*</span>}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required={!formData.id}
                      minLength={MIN_PASSWORD_LENGTH}
                      placeholder={formData.id ? 'Kosongkan jika tidak diubah' : `Min. ${MIN_PASSWORD_LENGTH} karakter`}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-10 pr-10 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    Tingkat Otorisasi (Peran) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  >
                    <option value="Super User">Super User (Akses Penuh Seluruh Sistem)</option>
                    <option value="Admin">Admin (Operasional, Master &amp; Audit Log)</option>
                    <option value="User">User (Staff Gudang &amp; Logistik Pusat)</option>
                    <option value="User Outlet Manager">User Outlet Manager (Khusus Cabang)</option>
                  </select>
                </div>
              </div>

              {formData.role === 'User Outlet Manager' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    Penugasan Outlet Spesifik <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.outlet_assigned}
                    onChange={(e) => setFormData({ ...formData, outlet_assigned: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  >
                    <option value="">-- Pilih Outlet Cabang --</option>
                    {outlets.map((o) => (
                      <option key={o.id || o.nama} value={o.nama}>
                        {o.nama} ({o.region || 'Cabang'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Pembatasan Fitur / Modul - Diatur oleh Super User */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>Pembatasan Fitur (Hanya Tampilkan Menu yang Dicentang)</span>
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Sidebar pengguna hanya akan menampilkan menu yang dibuka/dicentang oleh Super User.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 w-fit">
                    {formData.allowed_features.length}/{APP_FEATURES.length} Fitur Terpilih
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-100/70 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-[11px]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 px-1">Pilih Cepat:</span>
                  <button
                    type="button"
                    onClick={() => applyFeaturePreset('all')}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-semibold hover:border-purple-500 text-slate-700 dark:text-slate-200 active:scale-95 transition"
                  >
                    ⭐ Semua ({ALL_FEATURE_IDS.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFeaturePreset('admin')}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-semibold hover:border-indigo-500 text-indigo-700 dark:text-indigo-300 active:scale-95 transition"
                  >
                    🛡️ Admin ({DEFAULT_ADMIN_FEATURES.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFeaturePreset('logistics')}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-semibold hover:border-purple-500 text-slate-700 dark:text-slate-200 active:scale-95 transition"
                  >
                    📦 Staff Logistik ({DEFAULT_LOGISTICS_FEATURES.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFeaturePreset('outlet')}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-semibold hover:border-purple-500 text-slate-700 dark:text-slate-200 active:scale-95 transition"
                  >
                    🏪 Outlet Manager ({DEFAULT_OUTLET_FEATURES.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFeaturePreset('clear')}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-semibold hover:border-rose-500 text-rose-600 dark:text-rose-400 active:scale-95 transition"
                  >
                    ❌ Kosongkan
                  </button>
                </div>

                {/* Checklist Categories */}
                <div className="max-h-72 overflow-y-auto space-y-3.5 pr-1 border border-slate-200 dark:border-slate-700/70 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-900/40">
                  {(['Utama', 'Pengadaan', 'Distribusi & Logistik', 'Master & Pengaturan'] as const).map((groupName) => {
                    const groupFeatures = APP_FEATURES.filter((f) => f.group === groupName);
                    return (
                      <div key={groupName} className="space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 px-1">
                          <Layers className="w-3 h-3 text-purple-500" />
                          <span>{groupName}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {groupFeatures.map((feat) => {
                            const isChecked = formData.allowed_features.includes(feat.id);
                            const isUserMgmt = feat.id === 'user_management';
                            return (
                              <label
                                key={feat.id}
                                className={`flex items-start gap-2 p-2 rounded-xl border text-xs cursor-pointer transition select-none ${
                                  isChecked
                                    ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800/80 text-purple-950 dark:text-purple-200 shadow-xs'
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100/60'
                                } ${isUserMgmt && formData.role !== 'Super User' ? 'opacity-40 cursor-not-allowed' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isUserMgmt && formData.role !== 'Super User'}
                                  onChange={() => toggleFeature(feat.id)}
                                  className="mt-0.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                />
                                <div className="min-w-0">
                                  <div className="font-bold truncate">{feat.name}</div>
                                  <div className="text-[10px] text-slate-400 truncate">{feat.description}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2.5">
                <div>
                  {formData.id && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleDeleteUser}
                      className="px-3.5 py-2 border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                      title="Hapus akun pengguna ini secara permanen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{submitting ? 'Menghapus...' : 'Hapus Akun'}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-medium transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-purple-600/20 transition disabled:opacity-50"
                  >
                    {submitting ? 'Menyimpan...' : 'Simpan Hak Akses'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
