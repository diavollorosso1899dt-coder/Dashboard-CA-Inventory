import type { jsPDF } from 'jspdf';

export interface SuratJalanPdfItem {
  nama: string;
  ref?: string;
  qty: number | string;
  satuan: string;
  catatan?: string;
}

export interface SuratJalanPdfData {
  sjNumbers: string[];
  roNumbers: string[];
  outlet: string;
  date: string;
  sender: string;
  driver: string;
  plate: string;
  eta: string;
  status: string;
  docsCount: number;
  items: SuratJalanPdfItem[];
  totalQty: number;
  receiver: string;
  notes?: string;
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 12;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const RIGHT_X = PAGE_WIDTH - MARGIN;

const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_700: [number, number, number] = [51, 65, 85];
const SLATE_600: [number, number, number] = [71, 85, 105];
const SLATE_500: [number, number, number] = [100, 116, 139];
const SLATE_400: [number, number, number] = [148, 163, 184];
const SLATE_200: [number, number, number] = [226, 232, 240];
const INDIGO_700: [number, number, number] = [67, 56, 202];
const EMERALD_700: [number, number, number] = [4, 120, 87];

const DEFAULT_NOTES =
  'Harap periksa kelengkapan fisik, segel, dan kondisi barang sebelum menandatangani lembar tanda terima ini. ' +
  'Segala klaim kerusakan atau ketidaksesuaian jumlah wajib dicantumkan pada kolom catatan di atas dalam waktu 1x24 jam.';

export function suratJalanPdfFileName(data: SuratJalanPdfData): string {
  const nomor = data.sjNumbers[0] || 'Dokumen';
  const base = `Surat Jalan ${nomor} - ${data.outlet}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return `${base}.pdf`;
}

function safeText(value: unknown, fallback = '-'): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : fallback;
}

export async function buildSuratJalanPdf(data: SuratJalanPdfData): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const sjNumbers = (data.sjNumbers.length > 0 ? data.sjNumbers : ['-']).map((n) => safeText(n));
  const roNumbers = (data.roNumbers.length > 0 ? data.roNumbers : ['-']).map((n) => safeText(n));
  const outlet = safeText(data.outlet, 'Outlet Tujuan');
  const sender = safeText(data.sender, 'Staff Logistik Pusat');
  const driver = safeText(data.driver, 'Petugas Ekspedisi Logistik');
  const receiver = safeText(data.receiver, `Store Manager ${outlet}`);
  const plate = safeText(data.plate, '-');
  const status = safeText(data.status, 'SHIPPED');
  const date = safeText(data.date, '-');
  const eta = safeText(data.eta, '-');

  doc.setProperties({
    title: `Surat Jalan ${sjNumbers.join(' / ')}`,
    subject: `Surat jalan untuk ${outlet}`,
    author: 'Dashboard CA',
    creator: 'Dashboard CA',
  });

  // ---------------------------------------------------------------- kop surat
  let y = 17;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...SLATE_900);
  doc.text('HANTARAN', MARGIN, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(...SLATE_500);
  doc.text('Divisi Central Asset Management & Logistik Distribusi Nasional', MARGIN, y + 4.8, {
    maxWidth: 96,
  });
  doc.text('Jl. Logistik Sentral No. 88, Kawasan Pergudangan Nasional', MARGIN, y + 8.8, {
    maxWidth: 96,
  });
  doc.text('Telp: (021) 555-0199', MARGIN, y + 12.4, { maxWidth: 96 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...INDIGO_700);
  doc.text('SURAT JALAN', RIGHT_X, y, { align: 'right' });

  doc.setFontSize(7.8);
  doc.setTextColor(...SLATE_700);
  const nomorLines = doc.splitTextToSize(`NOMOR: ${sjNumbers.join(' / ')}`, 82) as string[];
  doc.text(nomorLines, RIGHT_X, y + 5.2, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...SLATE_500);
  const tanggalY = y + 5.2 + Math.max(nomorLines.length, 1) * 3.4 + 0.8;
  doc.text(`Tanggal: ${date}`, RIGHT_X, tanggalY, { align: 'right' });

  const headerBottom = Math.max(y + 12.4 + 1.6, tanggalY + 2.4);
  doc.setDrawColor(...SLATE_900);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, headerBottom, RIGHT_X, headerBottom);

  // ------------------------------------------------------- kotak pengirim/tujuan
  y = headerBottom + 6;
  const boxGap = 6;
  const boxWidth = (CONTENT_WIDTH - boxGap) / 2;
  const boxPadding = 4;

  const leftLines = [
    'Kawasan Pergudangan Pusat, Blok B-12',
    'PIC Gudang: Central Warehouse Officer',
  ];
  const refLines = doc.splitTextToSize(
    `Ref. Request Order: ${roNumbers.join(', ')}`,
    boxWidth - boxPadding * 2,
  ) as string[];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const outletLines = doc.splitTextToSize(outlet, boxWidth - boxPadding * 2) as string[];
  const mergedLine = data.docsCount > 1 ? `Menggabungkan ${data.docsCount} Dokumen Distribusi Outlet` : null;

  const rightHeight =
    boxPadding * 2 +
    3.4 +
    5.4 +
    (outletLines.length - 1) * 4.4 +
    refLines.length * 3.4 +
    (mergedLine ? 3.4 : 0) +
    3.4;
  const leftHeight = boxPadding * 2 + 3.4 + 4.8 + leftLines.length * 3.6;
  const boxHeight = Math.max(leftHeight, rightHeight, 22);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, boxWidth, boxHeight, 2, 2, 'FD');
  doc.setFillColor(238, 242, 255);
  doc.setDrawColor(224, 231, 255);
  doc.roundedRect(MARGIN + boxWidth + boxGap, y, boxWidth, boxHeight, 2, 2, 'FD');

  let cursor = y + boxPadding + 2.6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...SLATE_600);
  doc.text('PENGIRIM / ASAL:', MARGIN + boxPadding, cursor);

  doc.setFontSize(9);
  doc.setTextColor(...SLATE_900);
  doc.text(sender, MARGIN + boxPadding, cursor + 4.6, { maxWidth: boxWidth - boxPadding * 2 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(...SLATE_500);
  doc.text(leftLines, MARGIN + boxPadding, cursor + 8.6);

  let rightCursor = y + boxPadding + 2.6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...INDIGO_700);
  doc.text('TUJUAN PENGIRIMAN:', MARGIN + boxWidth + boxGap + boxPadding, rightCursor);

  rightCursor += 5.2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...SLATE_900);
  doc.text(outletLines, MARGIN + boxWidth + boxGap + boxPadding, rightCursor);

  rightCursor += 4.4 + (outletLines.length - 1) * 4.4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...SLATE_600);
  doc.text(refLines, MARGIN + boxWidth + boxGap + boxPadding, rightCursor);
  rightCursor += refLines.length * 3.4;

  if (mergedLine) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...EMERALD_700);
    doc.text(`• ${mergedLine}`, MARGIN + boxWidth + boxGap + boxPadding, rightCursor);
    rightCursor += 3.4;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...SLATE_500);
  doc.text(`Status: ${status}`, MARGIN + boxWidth + boxGap + boxPadding, rightCursor);

  // ------------------------------------------------------------------- armada
  y += boxHeight + 5;
  const armadaHeight = 12;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, armadaHeight, 1.6, 1.6, 'FD');

  const armadaCols = [
    { label: 'Nama Pengemudi (Driver)', value: driver },
    { label: 'Nomor Polisi Kendaraan', value: plate.toUpperCase() },
    { label: 'Estimasi Tiba', value: eta },
  ];
  const colWidth = CONTENT_WIDTH / armadaCols.length;
  armadaCols.forEach((col, index) => {
    const x = MARGIN + colWidth * index + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(...SLATE_500);
    doc.text(col.label.toUpperCase(), x, y + 4.6, { maxWidth: colWidth - 8 });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...SLATE_700);
    doc.text(col.value, x, y + 9, { maxWidth: colWidth - 8 });
  });

  // -------------------------------------------------------------------- tabel
  const itemCount = data.items.length;
  const body = data.items.map((item, index) => [
    String(index + 1),
    item.ref ? `${safeText(item.nama, 'Barang Aset')}\n[Ref: ${item.ref}]` : safeText(item.nama, 'Barang Aset'),
    String(item.qty ?? '-'),
    safeText(item.satuan, 'Unit'),
    safeText(item.catatan, '-'),
  ]);

  if (body.length === 0) {
    body.push(['-', 'Tidak ada rincian item dalam Surat Jalan ini', '-', '-', '-']);
  }

  autoTable(doc, {
    startY: y + armadaHeight + 6,
    margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 20 },
    theme: 'grid',
    rowPageBreak: 'avoid',
    head: [['No', 'Nama Barang / Deskripsi Aset', 'Jumlah', 'Satuan', 'Kondisi / Catatan']],
    body,
    foot: itemCount > 0
      ? [['', `TOTAL KESELURUHAN BARANG (${itemCount} BARIS):`, String(data.totalQty), 'UNIT', 'Lengkap & Siap Kirim']]
      : [],
    styles: {
      font: 'helvetica',
      fontSize: 7.8,
      cellPadding: 1.9,
      lineColor: SLATE_200,
      lineWidth: 0.2,
      textColor: SLATE_700,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: SLATE_900,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.8,
      valign: 'middle',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: SLATE_900,
      fontStyle: 'bold',
      fontSize: 7.6,
      valign: 'middle',
    },
    alternateRowStyles: { fillColor: [252, 252, 253] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 17, halign: 'center', fontStyle: 'bold', textColor: SLATE_900 },
      3: { cellWidth: 17, halign: 'center', textColor: SLATE_600 },
      4: { cellWidth: 52, textColor: SLATE_500, fontStyle: 'italic', fontSize: 7.3 },
    },
    didParseCell: (hook) => {
      if (hook.section === 'body' && hook.column.index === 1) {
        const raw = hook.cell.raw as string;
        if (raw.includes('\n[Ref:')) hook.cell.styles.fontSize = 7.4;
      }
      if (hook.section === 'foot') {
        if (hook.column.index === 0) hook.cell.styles.textColor = [255, 255, 255];
        if (hook.column.index === 1) hook.cell.styles.halign = 'right';
        if (hook.column.index === 2) {
          hook.cell.styles.fontSize = 9.5;
          hook.cell.styles.textColor = INDIGO_700;
        }
        if (hook.column.index === 4) hook.cell.styles.fontStyle = 'italic';
      }
    },
  });

  let finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 6;

  // ------------------------------------------------------------------ catatan
  const notes = safeText(data.notes, DEFAULT_NOTES);
  const noteLines = doc.splitTextToSize(notes, CONTENT_WIDTH - 8) as string[];
  const notesHeight = noteLines.length * 3.4 + 8;
  const signaturesHeight = 34;

  if (finalY + notesHeight + signaturesHeight > PAGE_HEIGHT - 18) {
    doc.addPage();
    finalY = 18;
  }

  doc.setFillColor(252, 252, 253);
  doc.setDrawColor(...SLATE_400);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([1, 1], 0);
  doc.roundedRect(MARGIN, finalY, CONTENT_WIDTH, notesHeight, 1.5, 1.5, 'FD');
  doc.setLineDashPattern([], 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(...SLATE_700);
  doc.text('Catatan Pengiriman:', MARGIN + 4, finalY + 4.6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...SLATE_600);
  doc.text(noteLines, MARGIN + 4, finalY + 8.4);

  // ---------------------------------------------------------------- tanda tangan
  y = finalY + notesHeight + 12;
  const colWidthSign = CONTENT_WIDTH / 3;

  const signatureBlocks = [
    { title: 'Yang Menyerahkan,', subtitle: 'Gudang Logistik Pusat', name: sender },
    { title: 'Yang Membawa,', subtitle: 'Driver / Ekspedisi', name: driver },
    { title: 'Yang Menerima,', subtitle: 'Store / Outlet Manager', name: receiver },
  ];

  signatureBlocks.forEach((block, index) => {
    const centerX = MARGIN + colWidthSign * index + colWidthSign / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_700);
    doc.text(block.title, centerX, y, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...SLATE_400);
    doc.text(block.subtitle, centerX, y + 3.6, { align: 'center' });

    const nameLines = doc.splitTextToSize(block.name, colWidthSign - 12) as string[];
    const nameY = y + 18 - (nameLines.length - 1) * 3.4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...SLATE_900);
    doc.text(nameLines, centerX, nameY, { align: 'center' });

    doc.setDrawColor(...SLATE_900);
    doc.setLineWidth(0.3);
    doc.line(centerX - (colWidthSign - 16) / 2, y + 19.5, centerX + (colWidthSign - 16) / 2, y + 19.5);
  });

  // ------------------------------------------------------------------ footer
  const totalPages = doc.getNumberOfPages();
  const printedAt = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(...SLATE_400);
    doc.text(`Dicetak: ${printedAt}`, MARGIN, PAGE_HEIGHT - 8);
    doc.text(`Halaman ${page} dari ${totalPages}`, RIGHT_X, PAGE_HEIGHT - 8, { align: 'right' });
  }

  return doc;
}

export async function downloadSuratJalanPdf(data: SuratJalanPdfData): Promise<void> {
  const doc = await buildSuratJalanPdf(data);
  doc.save(suratJalanPdfFileName(data));
}