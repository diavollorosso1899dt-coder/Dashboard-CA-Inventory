export type RegionType = 'JABODETABEK' | 'KALBAR' | 'ALL';

export type StockStatusType = 
  | 'Ready (Spek Sesuai)' 
  | 'Ready (Spek Berbeda)' 
  | 'Not Ready (Stok Kosong)' 
  | 'Lainnya';

export type DeliveryStatusType = 
  | 'Lengkap' 
  | 'Lengkap (SCGA)' 
  | 'Lengkap (Lokasi)' 
  | 'Diterima Sebagian' 
  | 'Diterima Sebagian (Lokasi)' 
  | 'On Proses' 
  | 'On Proses (SCGA)' 
  | 'On Proses (Lokasi)' 
  | 'Belum Proses'
  | 'Ready Gudang SCGA'
  | 'Lainnya';

export interface AssetRequest {
  id: string;
  external_id: string;
  region: 'JABODETABEK' | 'KALBAR';
  sheet_row_index: number;
  
  // Request data
  order_datetime: string | null; // ISO string with time hh:mm
  requester_name: string;
  requester_division: string;
  category: string;
  branch_name: string;
  classification: string;
  item_name: string;
  system_item_name: string;
  specification: string;
  photo_url: string | null;
  quantity_needed: number;
  
  // Budget & RAB
  rab_number: string;
  rab_link: string;
  rab_price: number;
  rab_total: number;
  acc_kadiv_request: boolean;
  
  // Asset Stock & Fulfillment
  stock_status: string;
  quantity_stock_allocated: number;
  quantity_pr: number;
  opening_date: string | null; // YYYY-MM-DD
  pr_datetime: string | null;
  is_direct_shipment: boolean;
  
  // Procurement
  po_date: string | null;
  order_type: 'ONLINE' | 'OFFLINE' | 'INTERNAL';
  vendor_name: string;
  initial_price: number;
  deal_price: number;
  realized_price: number;
  negotiation_proof: string | null;
  acc_kadiv_procurement: boolean;
  
  // Receiving & SLA
  procurement_status: 'selesai' | 'proses' | 'belum' | 'po';
  item_delivery_status: string;
  received_date: string | null;
  lead_time_days: number;
  pic_receiver: string;
  notes: string;
  
  is_manually_edited: boolean;
  is_system_transfer?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  synced_at: string;
  total_fetched: number;
  total_inserted: number;
  total_updated: number;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  error_message?: string | null;
  duration_ms: number;
}

export interface BranchOpeningSummary {
  branch_name: string;
  region: string;
  target_opening_date: string | null;
  days_until_opening: number | null;
  total_items_needed: number;
  items_completed: number;
  items_partial: number;
  items_pending: number;
  readiness_percentage: number;
  total_deal_cost: number;
  total_rab_budget: number;
}

export interface DashboardMetrics {
  total_requests: number;
  total_items: number;
  total_rab_amount: number;
  total_deal_amount: number;
  cost_savings_amount: number;
  cost_savings_percentage: number;
  
  // Fulfillment
  fulfilled_from_stock: number;
  fulfilled_from_pr: number;
  stock_fulfillment_rate: number;
  
  // Status breakdown
  completed_count: number;
  partial_count: number;
  in_progress_count: number;
  pending_count: number;
  
  // SLA
  avg_lead_time_days: number;
  sla_on_time_count: number;
  sla_delayed_count: number;
  
  // Openings
  upcoming_openings_count: number;
  avg_branch_readiness: number;
}

export interface AssetFilterState {
  search: string;
  region: RegionType;
  branch: string;
  division: string;
  category: string;
  classification: string;
  stockStatus: string;
  deliveryStatus: string;
  rabNumber: string;
  dateRange: 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_30_DAYS' | 'CUSTOM';
  startDate?: string;
  endDate?: string;
  sortBy: keyof AssetRequest | 'opening_days_left';
  sortOrder: 'asc' | 'desc';
}

// ==========================================
// 1. PENGGUNA & OUTLET TYPES
// ==========================================
export type UserRole = 'super_user' | 'user' | 'outlet_manager' | 'Super User' | 'User' | 'User Outlet Manager';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  branch_name?: string;
  outlet_assigned?: string;
  phone?: string;
  is_active?: boolean;
  created_at: string;
}

export type OutletStatus = 'ACTIVE' | 'OPENING_SOON' | 'RENOVATION' | 'CLOSED' | 'Aktif' | 'Persiapan Buka' | 'Renovasi' | 'Tutup';

export interface Outlet {
  id: string;
  branch_name: string;
  nama?: string;
  region: 'JABODETABEK' | 'KALBAR' | 'JABO';
  target_opening_date?: string | null;
  target_opening?: string | null;
  status: OutletStatus;
  address?: string;
  alamat?: string;
  pic_name?: string;
  pic_nama?: string;
  pic_phone?: string;
  telepon?: string;
  notes?: string;
  created_at: string;
}

// ==========================================
// 2. MONITORING: TRANSFER ASET TYPES
// ==========================================
export type TransferStatus = 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface TransferItem {
  id: string;
  item_name: string;
  specification?: string;
  quantity: number;
  condition: 'BAIK' | 'PERLU_PERBAIKAN' | 'BEKAS_LAYAK';
}

export interface AssetTransfer {
  id: string;
  transfer_number: string;
  from_location: string;
  to_location: string;
  transfer_date: string;
  status: TransferStatus;
  sender_pic: string;
  receiver_pic?: string;
  items: TransferItem[];
  notes?: string;
  created_at: string;
}

// ==========================================
// 3. DISTRIBUSI: RO & SURAT JALAN TYPES
// ==========================================
export type ROStatus = 
  | 'INPUT_SYSTEM' 
  | 'PILAH_PROSES' 
  | 'NEED_PR' 
  | 'READY_STOCK' 
  | 'IN_DELIVERY' 
  | 'CHECKLIST_DONE' 
  | 'COMPLETED' 
  | 'PENDING' 
  | 'APPROVED' 
  | 'REJECTED';

export interface ROItem {
  id: string;
  asset_request_id?: string;
  item_name: string;
  specification?: string;
  quantity_ordered: number;
  quantity_fulfilled: number;
  stock_source: 'GUDANG_SCGA' | 'PR_VENDOR';
  
  // Spreadsheet integration fields
  sku?: string;
  unit?: string;
  unit_price?: number;
  total_price?: number;
  item_type?: string;

  // PR & Workflow Tracking Fields
  pr_vendor_name?: string;
  pr_po_number?: string;
  pr_arrival_date?: string | null;
  is_arrived_at_warehouse?: boolean;

  // Checklist verification fields
  received_qty?: number;
  condition?: 'BAIK' | 'RUSAK' | 'KURANG' | string;
  notes?: string;
}

export interface RequestOrder {
  id: string;
  ro_number: string;
  raw_ro_id?: string;
  branch_name: string;
  region: 'JABODETABEK' | 'KALBAR';
  requester_name: string;
  request_date: string;
  target_delivery_date?: string;
  status: ROStatus;
  items: ROItem[];
  notes?: string;
  
  // Spreadsheet metadata
  warehouse_name?: string;
  sheet_row_indices?: number[];
  source_type?: 'GOOGLE_SHEET' | 'MANUAL' | 'EXCEL_PASTE';

  // Smart Deduplication Fields
  is_duplicate?: boolean;
  duplicate_count?: number;
  duplicate_group_id?: string;
  
  // Diagram 9-Stage Workflow Fields
  current_stage?: 
    | 'REQUEST_ORDER'
    | 'INPUT_DATA'
    | 'PILIH_PROSES'
    | 'KELOLA_PR'
    | 'READY_STOCK'
    | 'SURAT_JALAN'
    | 'ASET_SAMPAI'
    | 'CHECKLIST'
    | 'UPDATE_SLA'
    | 'SELESAI';
  pr_vendor_name?: string | null;
  pr_po_number?: string | null;
  pr_estimated_arrival?: string | null;
  arrival_datetime?: string | null;
  received_date?: string | null;
  pic_receiver?: string | null;
  checklist_notes?: string | null;
  sla_lead_time_days?: number | null;
  sla_status?: 'ON_TIME' | 'DELAYED' | 'PENDING';
  created_at: string;
}

export type SJStatus = 'SHIPPED' | 'DELIVERED' | 'Diproses' | 'Dalam Pengiriman' | 'Selesai' | 'Dibatalkan';

export interface SJItem {
  id?: string;
  item_name?: string;
  nama_barang?: string;
  specification?: string;
  quantity?: number;
  qty?: number;
  unit?: string;
  satuan?: string;
  notes?: string;
  catatan?: string;
}

export interface SuratJalan {
  id: string;
  sj_number?: string;
  nomor_sj?: string;
  ro_id?: string;
  ro_number?: string;
  ro_nomor?: string;
  branch_name?: string;
  tujuan_outlet_nama?: string;
  region?: 'JABODETABEK' | 'KALBAR' | 'JABO';
  delivery_date?: string;
  tanggal_kirim?: string;
  driver_name?: string;
  driver_nama?: string;
  driver_phone?: string;
  vehicle_number?: string;
  kendaraan_plat?: string;
  expedition?: string;
  ekspedisi?: string;
  sender_name?: string;
  pengirim_nama?: string;
  receiver_name?: string;
  penerima_nama?: string;
  status: SJStatus;
  received_at?: string | null;
  items: SJItem[];
  notes?: string;
  catatan?: string;
  created_at: string;
}

// ==========================================
// 4. DISPOSISI: PENGEMBALIAN ASET TYPES
// ==========================================
export type DispositionStatus = 'DIAJUKAN' | 'DISETUJUI' | 'DITOLAK' | 'DITERIMA_GUDANG' | 'SCRAP' | 'Diajukan' | 'Disetujui' | 'Ditolak' | 'Diterima Gudang' | 'Di-Scrap';
export type DispositionCondition = 'RUSAK_RINGAN' | 'RUSAK_BERAT' | 'TIDAK_LAYAK' | 'EX_OUTLET' | 'Rusak Ringan' | 'Rusak Berat' | 'Tidak Layak Pakai' | 'Kelebihan Unit';

export interface DispositionItem {
  id: string;
  item_name: string;
  quantity: number;
  condition: DispositionCondition;
  reason: string;
  photo_url?: string;
}

export interface DispositionRequest {
  id: string;
  disposition_number?: string;
  branch_name?: string;
  outlet_nama?: string;
  region?: 'JABODETABEK' | 'KALBAR' | 'JABO';
  requester_name?: string;
  diajukan_oleh?: string;
  submission_date?: string;
  status: DispositionStatus;
  approval_notes?: string;
  catatan_admin?: string;
  approved_by?: string;
  items?: DispositionItem[];
  kode_aset?: string;
  nama_aset?: string;
  kondisi?: string;
  alasan?: string;
  foto_url?: string;
  created_at: string;
}
