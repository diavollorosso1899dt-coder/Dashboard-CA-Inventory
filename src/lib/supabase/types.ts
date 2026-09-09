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
