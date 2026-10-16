# SO Harian (Stock Opname) Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the complete "SO Harian (Stock Opname)" operational system into Dashboard CA, accessible from the main navigation menu with an integrated interactive documentation guide.

**Architecture:** Port core calculation engine, Excel parsers, and hybrid local/cloud storage into `src/lib/so-harian/`, port UI components into `src/components/so-harian/`, create an interactive documentation modal for `DOKUMENTASI_STRUKTUR_DAN_INTEGRASI.md`, assemble the standalone Next.js client route at `/stock-opname`, and register the route into `Sidebar.tsx`.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS, Lucide React, SheetJS (`xlsx`), `html5-qrcode`, `@supabase/supabase-js`.

**Spec:** `C:\Users\ThinkPad\Documents\Dashboard CA\DOKUMENTASI_STRUKTUR_DAN_INTEGRASI.md`

## Global Constraints
- Target route: `/stock-opname`
- Main menu integration: Add "Stock Opname Harian" to `Sidebar.tsx` under group `Utama`
- Keep full compatibility with Next.js App Router and client-side execution (`'use client';`)
- Ensure zero SSR breakage for camera / local storage APIs
- Include built-in markdown viewer modal for `DOKUMENTASI_STRUKTUR_DAN_INTEGRASI.md`

---

### Task 1: Port Core Logic and Services (`inventoryEngine`, `excelService`, `storageService`)

**Files:**
- Create: `src/lib/so-harian/inventoryEngine.ts`
- Create: `src/lib/so-harian/excelService.ts`
- Create: `src/lib/so-harian/storageService.ts`

**Interfaces:**
- Produces:
  - `calculateSystemStock(stokAwal, qtyPenerimaan, qtyRo)`
  - `calculateVariance(qtyFisik, stokSistem)`
  - `calculateSessionSummary(items)`
  - `parseExcelFile(file, type)`
  - `exportSoReportToExcel(sessionData, items)`
  - `saveSession(sessionData, items)`
  - `loadSession(id)`
  - `getAllSessionsSync()`

- [ ] **Step 1: Create `src/lib/so-harian/inventoryEngine.ts`**
- [ ] **Step 2: Create `src/lib/so-harian/excelService.ts`**
- [ ] **Step 3: Create `src/lib/so-harian/storageService.ts`**
- [ ] **Step 4: Verify module imports**

---

### Task 2: Port UI Components to `src/components/so-harian/`

**Files:**
- Create: `src/components/so-harian/SummaryCards.tsx`
- Create: `src/components/so-harian/DataPreviewModal.tsx`
- Create: `src/components/so-harian/NotesModal.tsx`
- Create: `src/components/so-harian/BarcodeScannerModal.tsx`
- Create: `src/components/so-harian/UploadSection.tsx`
- Create: `src/components/so-harian/PhysicalCountTable.tsx`
- Create: `src/components/so-harian/HistorySection.tsx`
- Create: `src/components/so-harian/ReportPrintView.tsx`
- Create: `src/components/so-harian/CloudSettingsModal.tsx`

**Interfaces:**
- Consumes: Task 1 services and helpers
- Produces: Self-contained React UI components for the SO Harian workflow

- [ ] **Step 1: Create `SummaryCards.tsx`, `DataPreviewModal.tsx`, and `NotesModal.tsx`**
- [ ] **Step 2: Create `BarcodeScannerModal.tsx` (with dynamic/safe client check)**
- [ ] **Step 3: Create `UploadSection.tsx` with drag-and-drop & template downloads**
- [ ] **Step 4: Create `PhysicalCountTable.tsx` with category tabs and inline edit**
- [ ] **Step 5: Create `HistorySection.tsx`, `ReportPrintView.tsx`, and `CloudSettingsModal.tsx`**

---

### Task 3: Create Interactive Documentation Viewer Modal

**Files:**
- Create: `src/components/so-harian/DocViewerModal.tsx`

**Interfaces:**
- Produces: `DocViewerModal({ isOpen, onClose })` rendering structured sections of `DOKUMENTASI_STRUKTUR_DAN_INTEGRASI.md` with table of contents, diagrams, and quick copy templates.

- [ ] **Step 1: Implement `DocViewerModal.tsx` with rich tabs/accordions representing the markdown content**
- [ ] **Step 2: Verify modal rendering and interaction**

---

### Task 4: Assemble Page Route `/stock-opname`

**Files:**
- Create: `src/app/stock-opname/page.tsx`

**Interfaces:**
- Consumes: All `src/components/so-harian/*` components and services
- Produces: Next.js page at `/stock-opname` with AppShell styling, quick guide button, and tab switching

- [ ] **Step 1: Write `src/app/stock-opname/page.tsx`**
- [ ] **Step 2: Connect state management, session rollover, auto-saving, and print mode**

---

### Task 5: Add SO Harian to Main Navigation Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Updates `menuGroups[0].items` to include `{ name: 'Stock Opname Harian', href: '/stock-opname', icon: ClipboardCheck }`

- [ ] **Step 1: Edit `Sidebar.tsx` to add icon and route**
- [ ] **Step 2: Verify active state highlighting when on `/stock-opname`**

---

### Task 6: Build Verification and End-to-End Validation

**Files:**
- Build check: `npm.cmd run build`

- [ ] **Step 1: Run Next.js build verification**
- [ ] **Step 2: Confirm zero TypeScript or runtime bundle errors**
