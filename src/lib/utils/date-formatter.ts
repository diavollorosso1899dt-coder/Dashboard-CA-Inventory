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
 * Format datetime string into 'DD MMM YYYY, HH:mm WIB'
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!isValidBusinessDate(dateStr)) return '-';
  try {
    const date = new Date(dateStr!);
    if (isNaN(date.getTime())) return '-';
    
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta'
    }).format(date) + ' WIB';
  } catch {
    return dateStr || '-';
  }
}

/**
 * Format date only: 'DD MMM YYYY'
 */
export function formatDateOnly(dateStr: string | null | undefined): string {
  if (!isValidBusinessDate(dateStr)) return '-';
  try {
    const date = new Date(dateStr!);
    if (isNaN(date.getTime())) return '-';
    
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jakarta'
    }).format(date);
  } catch {
    return dateStr || '-';
  }
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
