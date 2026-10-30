export type RoDateField = 'order_date' | 'request_date';

export interface RoDateLike {
  request_date?: string | null;
  target_delivery_date?: string | null;
}

/**
 * Menormalisasi string tanggal (`YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, atau ISO timestamp)
 * menjadi format `YYYY-MM-DD` agar dapat dibandingkan secara akurat.
 */
export function normalizeIsoDateOnly(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.split('T')[0].split(' ')[0].trim();
  if (
    !clean ||
    clean === '-' ||
    clean.includes('1899') ||
    clean.includes('1900') ||
    clean.startsWith('30/12/99') ||
    clean.startsWith('12/30/1899')
  ) {
    return null;
  }

  // 1. YYYY-MM-DD atau YYYY/MM/DD
  const ymdMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 2. DD/MM/YYYY atau DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmyMatch) {
    const [, dStr, mStr, yStr] = dmyMatch;
    let year = parseInt(yStr, 10);
    if (year < 100) year += 2000;
    let day = parseInt(dStr, 10);
    let month = parseInt(mStr, 10);
    if (month > 12 && day <= 12) {
      const temp = day;
      day = month;
      month = temp;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Mengambil tanggal acuan dari objek RO berdasarkan field (`order_date` vs `request_date`).
 */
export function getRoDateByField(
  ro: RoDateLike,
  dateField: RoDateField = 'order_date'
): string | null {
  if (dateField === 'request_date') {
    return normalizeIsoDateOnly(ro.target_delivery_date || ro.request_date);
  }
  return normalizeIsoDateOnly(ro.request_date);
}

/**
 * Mengecek apakah tanggal item berada dalam rentang `[startDate, endDate]` (inklusif).
 * Jika `startDate` dan `endDate` kosong, mengembalikan `true`.
 */
export function matchesRoDateRange(
  rawTargetDate?: string | null,
  rawStartDate?: string | null,
  rawEndDate?: string | null
): boolean {
  const start = normalizeIsoDateOnly(rawStartDate);
  const end = normalizeIsoDateOnly(rawEndDate);

  if (!start && !end) return true;

  const target = normalizeIsoDateOnly(rawTargetDate);
  if (!target) return false;

  if (start && end) {
    const minDate = start <= end ? start : end;
    const maxDate = start <= end ? end : start;
    return target >= minDate && target <= maxDate;
  }

  if (start) {
    return target >= start;
  }

  if (end) {
    return target <= end;
  }

  return true;
}

