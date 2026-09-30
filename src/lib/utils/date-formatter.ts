/**
 * Utilities for formatting dates, timestamps with hh:mm, SLA durations, and currency.
 */

// Checks if date string is an empty spreadsheet placeholder like '12/30/1899' or '30/12/99'
export function isValidBusinessDate(dateStr: string | null | undefined): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (trimmed.includes('1899') || trimmed.includes('1900') || trimmed.startsWith('30/12/99') || trimmed.startsWith('12/30/1899')) {
    return false;
  }
  const d = new Date(trimmed);
  return !isNaN(d.getTime());
}

/**
 * Format datetime string into 'DD/MM/YYYY, HH:mm WIB'
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!isValidBusinessDate(dateStr)) return '-';
  try {
    const slash = formatDateSlash(dateStr);
    if (slash === '-') return '-';
    
    // Extract time if present
    const date = new Date(dateStr!);
    if (isNaN(date.getTime())) return slash;
    
    const timeStr = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta'
    }).format(date);
    
    return `${slash}, ${timeStr} WIB`;
  } catch {
    return formatDateSlash(dateStr);
  }
}

/**
 * Format any date string strictly as 'DD/MM/YYYY' (Indonesian standard)
 * Examples:
 * - '2026-09-15' -> '15/09/2026'
 * - '15-09-2026' -> '15/09/2026'
 * - '15/09/2026' -> '15/09/2026'
 * - '2026-09-15T10:00:00.000Z' -> '15/09/2026'
 */
export function formatDateSlash(dateStr: string | null | undefined): string {
  if (!dateStr || typeof dateStr !== 'string') return '-';
  const clean = dateStr.trim();
  if (
    !clean ||
    clean === '-' ||
    clean.includes('1899') ||
    clean.includes('1900') ||
    clean.startsWith('30/12/99') ||
    clean.startsWith('12/30/1899')
  ) {
    return '-';
  }

  // 1. YYYY-MM-DD or YYYY/MM/DD (with optional time)
  const ymdMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  // 2. DD-MM-YYYY or DD/MM/YYYY (with optional time)
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmyMatch) {
    let [, d, m, y] = dmyMatch;
    let year = parseInt(y, 10);
    if (year < 100) year += 2000;
    let day = parseInt(d, 10);
    let month = parseInt(m, 10);
    // If month > 12 and day <= 12, it is MM/DD/YYYY
    if (month > 12 && day <= 12) {
      const temp = day;
      day = month;
      month = temp;
    }
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }

  try {
    const dt = new Date(clean);
    if (!isNaN(dt.getTime())) {
      const day = String(dt.getDate()).padStart(2, '0');
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const year = dt.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch {}

  return clean;
}

/**
 * Format date only: 'DD/MM/YYYY' (Indonesian standard)
 */
export function formatDateOnly(dateStr: string | null | undefined): string {
  return formatDateSlash(dateStr);
}

/**
 * Calculates days remaining from today until target date.
 * Returns negative if target date has passed.
 */
export function getDaysRemaining(targetDateStr: string | null | undefined): number | null {
  if (!isValidBusinessDate(targetDateStr)) return null;
  try {
    const target = new Date(targetDateStr!);
    if (isNaN(target.getTime())) return null;
    const now = new Date();
    
    // reset time to midnight for pure day comparison
    const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    const diffMs = targetMidnight - nowMidnight;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

/**
 * Format Currency IDR: 'Rp 1.250.000'
 */
export function formatIDR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount).replace('IDR', 'Rp');
}

/**
 * Format SLA lead time
 */
export function formatLeadTime(days: number | null | undefined): string {
  if (days === null || days === undefined || days <= 0) return '-';
  if (days < 1) return `${Math.round(days * 24)} Jam`;
  if (days === 1) return '1 Hari';
  return `${days.toFixed(1)} Hari`;
}
