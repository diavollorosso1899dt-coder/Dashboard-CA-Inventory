-- ==============================================================================
-- DATABASE SCHEMA: ASSET CONTROL & INVENTORY MONITORING DASHBOARD (SUPABASE / POSTGRESQL)
-- ==============================================================================

-- 1. Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Table: asset_requests (Tabel Utama Permohonan & Pengadaan Aset)
CREATE TABLE IF NOT EXISTS public.asset_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id TEXT UNIQUE NOT NULL, -- ID Unik Baris Spreadsheet (e.g. JABO-001, KALBAR-002)
    region TEXT NOT NULL DEFAULT 'JABODETABEK', -- 'JABODETABEK' | 'KALBAR'
    sheet_row_index INTEGER,
    
    -- Request Information (Pengajuan)
    order_datetime TIMESTAMPTZ, -- Tanggal dan jam pengajuan input (hh:mm)
    requester_name TEXT,
    requester_division TEXT,
    category TEXT, -- 'New Outlet JABO', 'New Brand KALBAR', 'New Item', etc.
    branch_name TEXT NOT NULL, -- Cabang / Outlet / Brand
    classification TEXT, -- 'AST-Kitchen', 'AST-Furniture', 'PLK-Dapur', etc.
    item_name TEXT NOT NULL, -- Item yang diajukan
    system_item_name TEXT, -- Nama item di sistem inventaris
    specification TEXT,
    photo_url TEXT,
    quantity_needed INTEGER DEFAULT 1,
    
    -- Budget & RAB
    rab_number TEXT, -- No RAB (wajib isi)
    rab_link TEXT,
    rab_price NUMERIC(15,2) DEFAULT 0,
    rab_total NUMERIC(15,2) DEFAULT 0,
    acc_kadiv_request BOOLEAN DEFAULT FALSE,
    
    -- Stock & Fulfillment (Asset Control)
    stock_status TEXT DEFAULT 'Not Ready (Stok Kosong)', -- 'Ready (Spek Sesuai)', 'Ready (Spek Berbeda)', 'Not Ready (Stok Kosong)'
    quantity_stock_allocated INTEGER DEFAULT 0,
    quantity_pr INTEGER DEFAULT 0,
    opening_date DATE, -- Tanggal Opening Outlet
    pr_datetime TIMESTAMPTZ, -- Waktu PR
    is_direct_shipment BOOLEAN DEFAULT FALSE,
    
    -- Procurement / Pengadaan
    po_date DATE, -- Tanggal PO
    order_type TEXT DEFAULT 'OFFLINE', -- 'ONLINE' | 'OFFLINE' | 'INTERNAL'
    vendor_name TEXT,
    initial_price NUMERIC(15,2) DEFAULT 0,
    deal_price NUMERIC(15,2) DEFAULT 0,
    realized_price NUMERIC(15,2) DEFAULT 0,
    negotiation_proof TEXT,
    acc_kadiv_procurement BOOLEAN DEFAULT FALSE,
    
    -- Receiving & SLA Tracking
    procurement_status TEXT DEFAULT 'proses', -- 'selesai' | 'proses' | 'belum'
    item_delivery_status TEXT DEFAULT 'On Proses', -- 'Lengkap', 'Diterima Sebagian', 'On Proses', 'Belum Proses'
    received_date TIMESTAMPTZ, -- Tanggal & jam barang diterima
    lead_time_days NUMERIC(8,2) DEFAULT 0, -- Durasi waktu pengadaan dalam hari
    pic_receiver TEXT,
    notes TEXT,
    
    -- Control metadata
    is_manually_edited BOOLEAN DEFAULT FALSE, -- Ditandai TRUE jika diedit langsung dari dashboard
    is_system_transfer BOOLEAN DEFAULT FALSE, -- Ditandai TRUE jika dibuat otomatis via transfer
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table: sync_logs (Riwayat Sinkronisasi Google Sheets)
CREATE TABLE IF NOT EXISTS public.sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    total_fetched INTEGER DEFAULT 0,
    total_inserted INTEGER DEFAULT 0,
    total_updated INTEGER DEFAULT 0,
    status TEXT DEFAULT 'SUCCESS', -- 'SUCCESS' | 'FAILED' | 'PARTIAL'
    error_message TEXT,
    duration_ms INTEGER DEFAULT 0
);

-- 4. Indexes for High-Performance Querying & Filter
CREATE INDEX IF NOT EXISTS idx_asset_requests_region ON public.asset_requests(region);
CREATE INDEX IF NOT EXISTS idx_asset_requests_branch ON public.asset_requests(branch_name);
CREATE INDEX IF NOT EXISTS idx_asset_requests_order_dt ON public.asset_requests(order_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_asset_requests_opening_dt ON public.asset_requests(opening_date);
CREATE INDEX IF NOT EXISTS idx_asset_requests_rab_no ON public.asset_requests(rab_number);
CREATE INDEX IF NOT EXISTS idx_asset_requests_stock_status ON public.asset_requests(stock_status);
CREATE INDEX IF NOT EXISTS idx_asset_requests_delivery_status ON public.asset_requests(item_delivery_status);
CREATE INDEX IF NOT EXISTS idx_asset_requests_procurement_status ON public.asset_requests(procurement_status);

-- 5. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_asset_requests_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asset_requests_modtime ON public.asset_requests;
CREATE TRIGGER trg_asset_requests_modtime
BEFORE UPDATE ON public.asset_requests
FOR EACH ROW
EXECUTE FUNCTION update_asset_requests_modtime();

-- 6. Row Level Security (RLS) - Permissive public access for dashboard API
ALTER TABLE public.asset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on asset_requests" ON public.asset_requests;
CREATE POLICY "Allow public read access on asset_requests"
ON public.asset_requests FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert/update access on asset_requests" ON public.asset_requests;
CREATE POLICY "Allow public insert/update access on asset_requests"
ON public.asset_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/insert on sync_logs" ON public.sync_logs;
CREATE POLICY "Allow public read/insert on sync_logs"
ON public.sync_logs FOR ALL USING (true) WITH CHECK (true);

-- 7. Analytical View for Branch Opening Readiness
CREATE OR REPLACE VIEW public.v_branch_opening_readiness AS
SELECT
    branch_name,
    region,
    MIN(opening_date) AS target_opening_date,
    COUNT(*) AS total_items_needed,
    COUNT(*) FILTER (WHERE item_delivery_status ILIKE '%Lengkap%') AS items_completed,
    COUNT(*) FILTER (WHERE item_delivery_status ILIKE '%Sebagian%') AS items_partial,
    COUNT(*) FILTER (WHERE item_delivery_status ILIKE '%Proses%' OR item_delivery_status ILIKE '%Belum%') AS items_pending,
    ROUND(
        (COUNT(*) FILTER (WHERE item_delivery_status ILIKE '%Lengkap%')::DECIMAL / NULLIF(COUNT(*), 0)) * 100,
        1
    ) AS readiness_percentage,
    COALESCE(SUM(deal_price), 0) AS total_deal_cost,
    COALESCE(SUM(rab_total), 0) AS total_rab_budget
FROM public.asset_requests
WHERE branch_name IS NOT NULL AND branch_name != ''
GROUP BY branch_name, region;

-- ==============================================================================
-- 8. Table: user_profiles (Manajemen Pengguna & Peran)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', -- 'super_user' | 'user' | 'outlet_manager'
    branch_name TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 9. Table: outlets (Master Data Cabang & Outlet)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.outlets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_name TEXT UNIQUE NOT NULL,
    region TEXT NOT NULL DEFAULT 'JABODETABEK', -- 'JABODETABEK' | 'KALBAR'
    target_opening_date DATE,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE' | 'OPENING_SOON' | 'RENOVATION' | 'CLOSED'
    address TEXT,
    pic_name TEXT,
    pic_phone TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 10. Table: asset_transfers & items (Transfer Aset Antar Lokasi)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.asset_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_number TEXT UNIQUE NOT NULL,
    from_location TEXT NOT NULL,
    to_location TEXT NOT NULL,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'IN_TRANSIT', -- 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED'
    sender_pic TEXT NOT NULL,
    receiver_pic TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 11. Table: request_orders (Kelola RO Distribusi & Alur 9-Tahap)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.request_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ro_number TEXT UNIQUE NOT NULL,
    raw_ro_id TEXT,
    branch_name TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'JABODETABEK',
    requester_name TEXT NOT NULL,
    request_date DATE NOT NULL DEFAULT CURRENT_DATE,
    target_delivery_date DATE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    
    -- Spreadsheet & Deduplication metadata
    warehouse_name TEXT,
    source_type TEXT DEFAULT 'MANUAL',
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_count INTEGER DEFAULT 0,
    duplicate_group_id TEXT,

    -- 9-Stage Workflow Tracking
    current_stage TEXT DEFAULT 'REQUEST_ORDER',
    pr_vendor_name TEXT,
    pr_po_number TEXT,
    pr_estimated_arrival DATE,
    arrival_datetime TIMESTAMPTZ,
    received_date DATE,
    pic_receiver TEXT,
    checklist_notes TEXT,
    sla_lead_time_days NUMERIC(8,2),
    sla_status TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 12. Table: surat_jalan (Surat Jalan Distribusi & Logistik)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.surat_jalan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sj_number TEXT UNIQUE NOT NULL,
    ro_id UUID REFERENCES public.request_orders(id) ON DELETE SET NULL,
    ro_number TEXT,
    branch_name TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'JABODETABEK',
    delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
    driver_name TEXT NOT NULL,
    driver_phone TEXT,
    vehicle_number TEXT NOT NULL,
    expedition TEXT NOT NULL DEFAULT 'Internal SCGA',
    sender_name TEXT NOT NULL,
    receiver_name TEXT,
    status TEXT NOT NULL DEFAULT 'SHIPPED', -- 'SHIPPED' | 'DELIVERED'
    received_at TIMESTAMPTZ,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 13. Table: disposition_requests (Pengembalian & Disposisi Aset)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.disposition_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disposition_number TEXT UNIQUE NOT NULL,
    branch_name TEXT NOT NULL,
    outlet_nama TEXT,
    region TEXT NOT NULL DEFAULT 'JABODETABEK',
    requester_name TEXT NOT NULL,
    diajukan_oleh TEXT,
    submission_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'DIAJUKAN', -- 'DIAJUKAN' | 'DISETUJUI' | 'DITOLAK' | 'DITERIMA_GUDANG' | 'SCRAP'
    approval_notes TEXT,
    approved_by TEXT,
    kode_aset TEXT,
    nama_aset TEXT,
    kondisi TEXT,
    alasan TEXT,
    foto_url TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 14. Row Level Security (RLS) - Seluruh Tabel Operasional
-- ==============================================================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surat_jalan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposition_requests ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public all on user_profiles') THEN
        CREATE POLICY "Allow public all on user_profiles" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public all on outlets') THEN
        CREATE POLICY "Allow public all on outlets" ON public.outlets FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public all on asset_transfers') THEN
        CREATE POLICY "Allow public all on asset_transfers" ON public.asset_transfers FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public all on request_orders') THEN
        CREATE POLICY "Allow public all on request_orders" ON public.request_orders FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public all on surat_jalan') THEN
        CREATE POLICY "Allow public all on surat_jalan" ON public.surat_jalan FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public all on disposition_requests') THEN
        CREATE POLICY "Allow public all on disposition_requests" ON public.disposition_requests FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ==============================================================================
-- 15. Migration Helper: Tambah Kolom Baru Jika Tabel Sudah Ada Sebelumnya
-- ==============================================================================
ALTER TABLE public.asset_requests ADD COLUMN IF NOT EXISTS is_system_transfer BOOLEAN DEFAULT FALSE;

ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS raw_ro_id TEXT;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS warehouse_name TEXT;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'MANUAL';
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS duplicate_count INTEGER DEFAULT 0;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS duplicate_group_id TEXT;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'REQUEST_ORDER';
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS pr_vendor_name TEXT;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS pr_po_number TEXT;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS pr_estimated_arrival DATE;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS arrival_datetime TIMESTAMPTZ;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS received_date DATE;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS pic_receiver TEXT;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS checklist_notes TEXT;
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS sla_lead_time_days NUMERIC(8,2);
ALTER TABLE public.request_orders ADD COLUMN IF NOT EXISTS sla_status TEXT;

ALTER TABLE public.disposition_requests ADD COLUMN IF NOT EXISTS outlet_nama TEXT;
ALTER TABLE public.disposition_requests ADD COLUMN IF NOT EXISTS diajukan_oleh TEXT;
ALTER TABLE public.disposition_requests ADD COLUMN IF NOT EXISTS kode_aset TEXT;
ALTER TABLE public.disposition_requests ADD COLUMN IF NOT EXISTS nama_aset TEXT;
ALTER TABLE public.disposition_requests ADD COLUMN IF NOT EXISTS kondisi TEXT;
ALTER TABLE public.disposition_requests ADD COLUMN IF NOT EXISTS alasan TEXT;
ALTER TABLE public.disposition_requests ADD COLUMN IF NOT EXISTS foto_url TEXT;

