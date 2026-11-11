import type { SuratJalanPdfData } from './surat-jalan-pdf';
import { suratJalanPdfFileName } from './surat-jalan-pdf';

/**
 * Render dokumen Surat Jalan menjadi gambar JPG (A4 portrait).
 *
 * Digambar manual di <canvas> agar hasilnya konsisten di ponsel maupun
 * desktop, tanpa bergantung pada media query / dialog cetak browser.
 */

const PX_PER_MM = 8; // ~203 DPI
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 12;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const RIGHT_X_MM = PAGE_WIDTH_MM - MARGIN_MM;
const BOTTOM_LIMIT_MM = 277;

const PT_TO_MM = 0.3528;

const COLORS = {
  white: '#ffffff',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate900: '#0f172a',
  indigo50: '#eef2ff',
  indigo100: '#e0e7ff',
  indigo700: '#4338ca',
  emerald700: '#047857',
};

const DEFAULT_NOTES =
  'Harap periksa kelengkapan fisik, segel, dan kondisi barang sebelum menandatangani lembar tanda terima ini. ' +
  'Segala klaim kerusakan atau ketidaksesuaian jumlah wajib dicantumkan pada kolom catatan di atas dalam waktu 1x24 jam.';

type Weight = '400' | '600' | '700';

interface TextOptions {
  sizePt: number;
  weight?: Weight;
  italic?: boolean;
  color?: string;
  align?: 'left' | 'right' | 'center';
  maxWidthMm?: number;
  lineHeightMm?: number;
}

const mm = (value: number) => value * PX_PER_MM;

function fontCss(sizePt: number, weight: Weight = '400', italic = false): string {
  const px = (sizePt * PT_TO_MM * PX_PER_MM).toFixed(2);
  return `${italic ? 'italic ' : ''}${weight} ${px}px "Segoe UI", Arial, Helvetica, sans-serif`;
}

function safeText(value: unknown, fallback = '-'): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : fallback;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidthMm: number): string[] {
  const maxWidth = mm(maxWidthMm);
  const paragraphs = String(text).split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ').filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }

  return lines;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  xMm: number,
  yMm: number,
  options: TextOptions,
): number {
  const {
    sizePt,
    weight = '400',
    italic = false,
    color = COLORS.slate900,
    align = 'left',
    maxWidthMm,
    lineHeightMm = sizePt * PT_TO_MM * 1.35,
  } = options;

  ctx.font = fontCss(sizePt, weight, italic);
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';

  const lines = maxWidthMm ? wrapLines(ctx, text, maxWidthMm) : String(text).split('\n');
  lines.forEach((line, index) => {
    ctx.fillText(line, mm(xMm), mm(yMm + index * lineHeightMm));
  });

  return lines.length * lineHeightMm;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  radiusMm: number,
) {
  const x = mm(xMm);
  const y = mm(yMm);
  const w = mm(widthMm);
  const h = mm(heightMm);
  const r = mm(radiusMm);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillAndStroke(
  ctx: CanvasRenderingContext2D,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  radiusMm: number,
  fill: string,
  stroke: string,
  lineWidthPx = 1,
) {
  roundedRectPath(ctx, xMm, yMm, widthMm, heightMm, radiusMm);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidthPx;
    ctx.stroke();
  }
}

function createPageCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(mm(PAGE_WIDTH_MM));
  canvas.height = Math.round(mm(PAGE_HEIGHT_MM));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia');

  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function drawPageFooter(ctx: CanvasRenderingContext2D, page: number, total: number, printedAt: string) {
  drawText(ctx, `Dicetak: ${printedAt}`, MARGIN_MM, PAGE_HEIGHT_MM - 8, {
    sizePt: 6.6,
    color: COLORS.slate400,
  });
  drawText(ctx, `Halaman ${page} dari ${total}`, RIGHT_X_MM, PAGE_HEIGHT_MM - 8, {
    sizePt: 6.6,
    color: COLORS.slate400,
    align: 'right',
  });
}

interface ItemRow {
  no: number;
  nama: string;
  tglPermintaan: string;
  ref?: string;
  qty: string;
  satuan: string;
  catatan: string;
}

function buildItemRows(data: SuratJalanPdfData): ItemRow[] {
  if (data.items.length === 0) {
    return [{
      no: 1,
      nama: 'Tidak ada rincian item dalam Surat Jalan ini',
      tglPermintaan: '-',
      qty: '-',
      satuan: '-',
      catatan: '-',
    }];
  }
  return data.items.map((item, index) => ({
    no: index + 1,
    nama: safeText(item.nama, 'Barang Aset'),
    tglPermintaan: safeText(item.tglPermintaan, '-'),
    ref: item.ref ? safeText(item.ref) : undefined,
    qty: String(item.qty ?? '-'),
    satuan: safeText(item.satuan, 'Unit'),
    catatan: safeText(item.catatan, '-'),
  }));
}

const COLUMN_WIDTHS_MM = [10, 70, 26, 17, 17, 46];
const CELL_PAD_X = 2;
const CELL_PAD_Y = 1.9;

function rowHeight(ctx: CanvasRenderingContext2D, row: ItemRow): number {
  const nameLines = wrapLines(ctx, row.nama, COLUMN_WIDTHS_MM[1] - CELL_PAD_X * 2).length;
  const refLines = row.ref ? 1 : 0;
  const catatanLines = wrapLines(ctx, row.catatan, COLUMN_WIDTHS_MM[5] - CELL_PAD_X * 2).length;
  const nameHeight = nameLines * 3.4 + refLines * 3.1;
  const catatanHeight = catatanLines * 3.2;
  return Math.max(nameHeight, catatanHeight, 4) + CELL_PAD_Y * 2;
}

export function buildSuratJalanJpgPages(data: SuratJalanPdfData): HTMLCanvasElement[] {
  const sjNumbers = (data.sjNumbers.length > 0 ? data.sjNumbers : ['-']).map((n) => safeText(n));
  const roNumbers = (data.roNumbers.length > 0 ? data.roNumbers : ['-']).map((n) => safeText(n));
  const outlet = safeText(data.outlet, 'Outlet Tujuan');
  const sender = safeText(data.sender, 'Staff Logistik Pusat');
  const driver = safeText(data.driver, 'Petugas Ekspedisi Logistik');
  const receiver = safeText(data.receiver, `Store Manager ${outlet}`);
  const plate = safeText(data.plate, '-').toUpperCase();
  const status = safeText(data.status, 'SHIPPED');
  const date = safeText(data.date, '-');
  const eta = safeText(data.eta, '-');

  const pages: HTMLCanvasElement[] = [];
  let canvas = createPageCanvas();
  let ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  pages.push(canvas);

  const nextPage = () => {
    canvas = createPageCanvas();
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    pages.push(canvas);
    return 14;
  };

  const drawTableHeader = (y: number) => {
    const height = 7;
    ctx.fillStyle = COLORS.slate900;
    ctx.fillRect(mm(MARGIN_MM), mm(y), mm(CONTENT_WIDTH_MM), mm(height));

    ctx.fillStyle = COLORS.white;
    ctx.font = fontCss(7.8, '700');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const labels = ['No', 'Nama Barang / Deskripsi Aset', 'Tgl Permintaan', 'Jumlah', 'Satuan', 'Kondisi / Catatan'];
    let x = MARGIN_MM;
    labels.forEach((label, index) => {
      const width = COLUMN_WIDTHS_MM[index];
      if (index === 0 || index === 2 || index === 3 || index === 4) {
        ctx.textAlign = 'center';
        ctx.fillText(label, mm(x + width / 2), mm(y + height / 2));
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(label, mm(x + CELL_PAD_X), mm(y + height / 2));
      }
      x += width;
    });
    ctx.textBaseline = 'alphabetic';
    return y + height;
  };

  // ------------------------------------------------------------------ kop surat
  let y = 17;
  drawText(ctx, 'HANTARAN', MARGIN_MM, y, { sizePt: 16, weight: '700', color: COLORS.slate900 });
  drawText(ctx, 'Divisi Central Asset Management & Logistik Distribusi Nasional', MARGIN_MM, y + 4.8, {
    sizePt: 7.6,
    color: COLORS.slate500,
    maxWidthMm: 96,
    lineHeightMm: 3.4,
  });
  drawText(ctx, 'Jl. Logistik Sentral No. 88, Kawasan Pergudangan Nasional', MARGIN_MM, y + 8.8, {
    sizePt: 7.6,
    color: COLORS.slate500,
    maxWidthMm: 96,
    lineHeightMm: 3.4,
  });
  drawText(ctx, 'Telp: (021) 555-0199', MARGIN_MM, y + 12.4, {
    sizePt: 7.6,
    color: COLORS.slate500,
  });

  drawText(ctx, 'SURAT JALAN', RIGHT_X_MM, y, {
    sizePt: 15,
    weight: '700',
    color: COLORS.indigo700,
    align: 'right',
  });

  const nomorText = `NOMOR: ${sjNumbers.join(' / ')}`;
  ctx.font = fontCss(7.8, '700');
  const nomorLines = wrapLines(ctx, nomorText, 82);
  drawText(ctx, nomorText, RIGHT_X_MM, y + 5.2, {
    sizePt: 7.8,
    weight: '700',
    color: COLORS.slate700,
    align: 'right',
    maxWidthMm: 82,
    lineHeightMm: 3.4,
  });

  const tanggalY = y + 5.2 + Math.max(nomorLines.length, 1) * 3.4 + 0.8;
  drawText(ctx, `Tanggal: ${date}`, RIGHT_X_MM, tanggalY, {
    sizePt: 7.6,
    color: COLORS.slate500,
    align: 'right',
  });

  const headerBottom = Math.max(y + 12.4 + 1.6, tanggalY + 2.4);
  ctx.strokeStyle = COLORS.slate900;
  ctx.lineWidth = mm(0.6);
  ctx.beginPath();
  ctx.moveTo(mm(MARGIN_MM), mm(headerBottom));
  ctx.lineTo(mm(RIGHT_X_MM), mm(headerBottom));
  ctx.stroke();

  // --------------------------------------------------------- kotak pengirim/tujuan
  y = headerBottom + 6;
  const boxGap = 6;
  const boxWidth = (CONTENT_WIDTH_MM - boxGap) / 2;
  const boxPadding = 4;

  const refText = `Ref. Request Order: ${roNumbers.join(', ')}`;
  ctx.font = fontCss(7.4);
  const refLines = wrapLines(ctx, refText, boxWidth - boxPadding * 2);
  ctx.font = fontCss(10, '700');
  const outletLines = wrapLines(ctx, outlet, boxWidth - boxPadding * 2);
  const mergedLine = data.docsCount > 1 ? `Menggabungkan ${data.docsCount} Dokumen Distribusi Outlet` : null;

  const rightHeight =
    boxPadding * 2 + 3.4 + 5.4 + (outletLines.length - 1) * 4.4 + refLines.length * 3.4 + (mergedLine ? 3.4 : 0) + 3.4;
  const leftHeight = boxPadding * 2 + 3.4 + 4.8 + 2 * 3.6;
  const boxHeight = Math.max(leftHeight, rightHeight, 22);

  fillAndStroke(ctx, MARGIN_MM, y, boxWidth, boxHeight, 2, COLORS.slate50, COLORS.slate200, 1);
  fillAndStroke(ctx, MARGIN_MM + boxWidth + boxGap, y, boxWidth, boxHeight, 2, COLORS.indigo50, COLORS.indigo100, 1);

  let cursor = y + boxPadding + 2.6;
  drawText(ctx, 'PENGIRIM / ASAL:', MARGIN_MM + boxPadding, cursor, {
    sizePt: 6.8,
    weight: '700',
    color: COLORS.slate600,
  });
  drawText(ctx, sender, MARGIN_MM + boxPadding, cursor + 4.6, {
    sizePt: 9,
    weight: '700',
    color: COLORS.slate900,
    maxWidthMm: boxWidth - boxPadding * 2,
    lineHeightMm: 4,
  });
  drawText(ctx, 'Kawasan Pergudangan Pusat, Blok B-12', MARGIN_MM + boxPadding, cursor + 8.6, {
    sizePt: 7.6,
    color: COLORS.slate500,
  });
  drawText(ctx, 'PIC Gudang: Central Warehouse Officer', MARGIN_MM + boxPadding, cursor + 12.2, {
    sizePt: 7.6,
    color: COLORS.slate500,
  });

  const rightX = MARGIN_MM + boxWidth + boxGap + boxPadding;
  let rightCursor = y + boxPadding + 2.6;
  drawText(ctx, 'TUJUAN PENGIRIMAN:', rightX, rightCursor, {
    sizePt: 6.8,
    weight: '700',
    color: COLORS.indigo700,
  });
  rightCursor += 5.2;
  drawText(ctx, outlet, rightX, rightCursor, {
    sizePt: 10,
    weight: '700',
    color: COLORS.slate900,
    maxWidthMm: boxWidth - boxPadding * 2,
    lineHeightMm: 4.4,
  });
  rightCursor += 4.4 + (outletLines.length - 1) * 4.4;
  drawText(ctx, refText, rightX, rightCursor, {
    sizePt: 7.4,
    color: COLORS.slate600,
    maxWidthMm: boxWidth - boxPadding * 2,
    lineHeightMm: 3.4,
  });
  rightCursor += refLines.length * 3.4;

  if (mergedLine) {
    drawText(ctx, `• ${mergedLine}`, rightX, rightCursor, {
      sizePt: 7.2,
      weight: '700',
      color: COLORS.emerald700,
      maxWidthMm: boxWidth - boxPadding * 2,
    });
    rightCursor += 3.4;
  }
  drawText(ctx, `Status: ${status}`, rightX, rightCursor, {
    sizePt: 7.4,
    color: COLORS.slate500,
  });

  // ------------------------------------------------------------------- armada
  y += boxHeight + 5;
  fillAndStroke(ctx, MARGIN_MM, y, CONTENT_WIDTH_MM, 12, 1.6, COLORS.slate100, COLORS.slate200, 1);

  const armadaCols = [
    { label: 'NAMA PENGEMUDI (DRIVER)', value: driver },
    { label: 'NOMOR POLISI KENDARAAN', value: plate },
    { label: 'ESTIMASI TIBA', value: eta },
  ];
  const colWidth = CONTENT_WIDTH_MM / armadaCols.length;
  armadaCols.forEach((col, index) => {
    const x = MARGIN_MM + colWidth * index + 4;
    drawText(ctx, col.label, x, y + 4.6, {
      sizePt: 6.4,
      color: COLORS.slate500,
      maxWidthMm: colWidth - 8,
    });
    drawText(ctx, col.value, x, y + 9, {
      sizePt: 7.8,
      weight: '700',
      color: COLORS.slate700,
      maxWidthMm: colWidth - 8,
    });
  });

  // -------------------------------------------------------------------- tabel
  const rows = buildItemRows(data);
  y = y + 12 + 6;
  y = drawTableHeader(y);

  rows.forEach((row) => {
    const height = rowHeight(ctx, row);
    if (y + height > BOTTOM_LIMIT_MM) {
      y = nextPage();
      y = drawTableHeader(y);
    }

    if (row.no % 2 === 0) {
      ctx.fillStyle = '#fcfcfd';
      ctx.fillRect(mm(MARGIN_MM), mm(y), mm(CONTENT_WIDTH_MM), mm(height));
    }

    let x = MARGIN_MM;
    const textY = y + CELL_PAD_Y + 3;

    drawText(ctx, String(row.no), x + COLUMN_WIDTHS_MM[0] / 2, textY, {
      sizePt: 7.8,
      color: COLORS.slate600,
      align: 'center',
    });

    x += COLUMN_WIDTHS_MM[0];
    drawText(ctx, row.nama, x + CELL_PAD_X, textY, {
      sizePt: 7.8,
      color: COLORS.slate900,
      maxWidthMm: COLUMN_WIDTHS_MM[1] - CELL_PAD_X * 2,
      lineHeightMm: 3.4,
    });
    if (row.ref) {
      const nameLines = wrapLines(ctx, row.nama, COLUMN_WIDTHS_MM[1] - CELL_PAD_X * 2).length;
      drawText(ctx, `[Ref: ${row.ref}]`, x + CELL_PAD_X, textY + nameLines * 3.4 - 0.2, {
        sizePt: 7.1,
        color: COLORS.slate500,
        maxWidthMm: COLUMN_WIDTHS_MM[1] - CELL_PAD_X * 2,
        lineHeightMm: 3.1,
      });
    }

    x += COLUMN_WIDTHS_MM[1];
    drawText(ctx, row.tglPermintaan, x + COLUMN_WIDTHS_MM[2] / 2, textY, {
      sizePt: 7.4,
      color: COLORS.slate700,
      align: 'center',
    });

    x += COLUMN_WIDTHS_MM[2];
    drawText(ctx, row.qty, x + COLUMN_WIDTHS_MM[3] / 2, textY, {
      sizePt: 7.8,
      weight: '700',
      color: COLORS.slate900,
      align: 'center',
    });

    x += COLUMN_WIDTHS_MM[3];
    drawText(ctx, row.satuan, x + COLUMN_WIDTHS_MM[4] / 2, textY, {
      sizePt: 7.8,
      color: COLORS.slate600,
      align: 'center',
    });

    x += COLUMN_WIDTHS_MM[4];
    drawText(ctx, row.catatan, x + CELL_PAD_X, textY, {
      sizePt: 7.3,
      italic: true,
      color: COLORS.slate500,
      maxWidthMm: COLUMN_WIDTHS_MM[5] - CELL_PAD_X * 2,
      lineHeightMm: 3.2,
    });

    ctx.strokeStyle = COLORS.slate200;
    ctx.lineWidth = 1;
    let lineX = MARGIN_MM;
    COLUMN_WIDTHS_MM.forEach((width, index) => {
      if (index > 0) {
        ctx.beginPath();
        ctx.moveTo(mm(lineX), mm(y));
        ctx.lineTo(mm(lineX), mm(y + height));
        ctx.stroke();
      }
      lineX += width;
    });
    ctx.beginPath();
    ctx.moveTo(mm(MARGIN_MM), mm(y + height));
    ctx.lineTo(mm(MARGIN_MM + CONTENT_WIDTH_MM), mm(y + height));
    ctx.stroke();

    y += height;
  });

  // -------------------------------------------------------- baris total tabel
  const totalHeight = 8;
  if (y + totalHeight > BOTTOM_LIMIT_MM) {
    y = nextPage();
    y = drawTableHeader(y);
  }
  ctx.fillStyle = COLORS.slate100;
  ctx.fillRect(mm(MARGIN_MM), mm(y), mm(CONTENT_WIDTH_MM), mm(totalHeight));

  const totalTextY = y + totalHeight / 2 + 0.9;
  let totalX = MARGIN_MM + COLUMN_WIDTHS_MM[0];
  drawText(ctx, `TOTAL KESELURUHAN BARANG (${data.items.length} BARIS):`, totalX + COLUMN_WIDTHS_MM[1] - CELL_PAD_X, totalTextY, {
    sizePt: 7.6,
    weight: '700',
    color: COLORS.slate900,
    align: 'right',
  });
  totalX += COLUMN_WIDTHS_MM[1] + COLUMN_WIDTHS_MM[2];
  drawText(ctx, String(data.totalQty), totalX + COLUMN_WIDTHS_MM[3] / 2, totalTextY, {
    sizePt: 9.5,
    weight: '700',
    color: COLORS.indigo700,
    align: 'center',
  });
  totalX += COLUMN_WIDTHS_MM[3];
  drawText(ctx, 'UNIT', totalX + COLUMN_WIDTHS_MM[4] / 2, totalTextY, {
    sizePt: 7.6,
    weight: '700',
    color: COLORS.slate700,
    align: 'center',
  });
  totalX += COLUMN_WIDTHS_MM[4];
  drawText(ctx, 'Lengkap & Siap Kirim', totalX + CELL_PAD_X, totalTextY, {
    sizePt: 7.3,
    italic: true,
    color: COLORS.slate500,
  });

  ctx.strokeStyle = COLORS.slate900;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(mm(MARGIN_MM), mm(y));
  ctx.lineTo(mm(MARGIN_MM + CONTENT_WIDTH_MM), mm(y));
  ctx.stroke();

  y += totalHeight;

  // ------------------------------------------------------------------ catatan
  const notes = safeText(data.notes, DEFAULT_NOTES);
  ctx.font = fontCss(7.2);
  const noteLines = wrapLines(ctx, notes, CONTENT_WIDTH_MM - 8);
  const notesHeight = noteLines.length * 3.4 + 8;
  const signaturesHeight = 34;

  if (y + 6 + notesHeight + signaturesHeight > PAGE_HEIGHT_MM - 16) {
    y = nextPage() - 4;
  }

  y += 6;
  ctx.save();
  ctx.setLineDash([mm(1), mm(1)]);
  fillAndStroke(ctx, MARGIN_MM, y, CONTENT_WIDTH_MM, notesHeight, 1.5, '#fcfcfd', COLORS.slate400, 1);
  ctx.restore();

  drawText(ctx, 'Catatan Pengiriman:', MARGIN_MM + 4, y + 4.6, {
    sizePt: 7.4,
    weight: '700',
    color: COLORS.slate700,
  });
  drawText(ctx, notes, MARGIN_MM + 4, y + 8.4, {
    sizePt: 7.2,
    color: COLORS.slate600,
    maxWidthMm: CONTENT_WIDTH_MM - 8,
    lineHeightMm: 3.4,
  });

  // ---------------------------------------------------------------- tanda tangan
  y += notesHeight + 12;
  const signColWidth = CONTENT_WIDTH_MM / 3;
  const signatureBlocks = [
    { title: 'Yang Menyerahkan,', subtitle: 'Gudang Logistik Pusat', name: sender },
    { title: 'Yang Membawa,', subtitle: 'Driver / Ekspedisi', name: driver },
    { title: 'Yang Menerima,', subtitle: 'Store / Outlet Manager', name: receiver },
  ];

  signatureBlocks.forEach((block, index) => {
    const centerX = MARGIN_MM + signColWidth * index + signColWidth / 2;
    drawText(ctx, block.title, centerX, y, {
      sizePt: 8,
      weight: '700',
      color: COLORS.slate700,
      align: 'center',
    });
    drawText(ctx, block.subtitle, centerX, y + 3.6, {
      sizePt: 6.8,
      color: COLORS.slate400,
      align: 'center',
    });
    ctx.font = fontCss(7.8, '700');
    const nameLines = wrapLines(ctx, block.name, signColWidth - 8);
    drawText(ctx, block.name, centerX, y + 17.6 - (nameLines.length - 1) * 3.4, {
      sizePt: 7.8,
      weight: '700',
      color: COLORS.slate900,
      align: 'center',
      maxWidthMm: signColWidth - 8,
      lineHeightMm: 3.4,
    });

    const lineWidth = signColWidth - 16;
    ctx.strokeStyle = COLORS.slate900;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mm(centerX - lineWidth / 2), mm(y + 19.5));
    ctx.lineTo(mm(centerX + lineWidth / 2), mm(y + 19.5));
    ctx.stroke();
  });

  // ------------------------------------------------------------------ footer
  const printedAt = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  pages.forEach((pageCanvas, index) => {
    const pageCtx = pageCanvas.getContext('2d');
    if (pageCtx) drawPageFooter(pageCtx, index + 1, pages.length, printedAt);
  });

  return pages;
}

export function suratJalanJpgFileName(data: SuratJalanPdfData, page: number, total: number): string {
  const base = suratJalanPdfFileName(data).replace(/\.pdf$/i, '');
  return total > 1 ? `${base} (${page}).jpg` : `${base}.jpg`;
}

function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function downloadSuratJalanJpg(data: SuratJalanPdfData): Promise<void> {
  const pages = buildSuratJalanJpgPages(data);
  for (let index = 0; index < pages.length; index += 1) {
    const dataUrl = pages[index].toDataURL('image/jpeg', 0.92);
    triggerDownload(dataUrl, suratJalanJpgFileName(data, index + 1, pages.length));
    if (index < pages.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}