import type { AssetRequest, BranchOpeningSummary } from '../supabase/types';

export type DaysRemainingFn = (targetDateStr: string | null | undefined) => number | null;

interface BranchEntry {
  branch_name: string;
  region: string;
  opening_date: string | null;
  items: AssetRequest[];
}

/**
 * Builds branch opening summaries from asset requests.
 *
 * Pure by design: the date calculation is injected so this module can be used
 * on the server and in client components, and tested without depending on the
 * current clock.
 */
export function buildBranchOpeningSummaries(
  items: AssetRequest[],
  getDaysRemaining: DaysRemainingFn
): BranchOpeningSummary[] {
  const branchMap = new Map<string, BranchEntry>();

  for (const item of items) {
    if (!item.branch_name) continue;
    const key = `${item.region}-${item.branch_name.trim().toLowerCase()}`;
    if (!branchMap.has(key)) {
      branchMap.set(key, {
        branch_name: item.branch_name.trim(),
        region: item.region,
        opening_date: item.opening_date,
        items: [],
      });
    }
    const entry = branchMap.get(key)!;
    if (!entry.opening_date && item.opening_date) {
      entry.opening_date = item.opening_date;
    }
    entry.items.push(item);
  }

  const summaries: BranchOpeningSummary[] = [];

  for (const [, entry] of branchMap) {
    const total = entry.items.length;
    let completed = 0;
    let partial = 0;
    let pending = 0;
    let dealCost = 0;
    let rabBudget = 0;

    for (const it of entry.items) {
      const isReadyOrDone =
        (it.quantity_stock_allocated >= it.quantity_needed && it.quantity_needed > 0) ||
        (it.item_delivery_status || '').toLowerCase().includes('terima outlet') ||
        (it.item_delivery_status || '').toLowerCase().includes('lengkap') ||
        (it.item_delivery_status || '').toLowerCase().includes('ready gudang');

      if (isReadyOrDone) {
        completed++;
      } else if (it.quantity_stock_allocated > 0 || (it.item_delivery_status || '').toLowerCase().includes('sebagian')) {
        partial++;
      } else {
        pending++;
      }

      dealCost += it.realized_price || it.deal_price || 0;
      rabBudget += it.rab_total || 0;
    }

    const readiness = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;
    const daysLeft = entry.opening_date ? getDaysRemaining(entry.opening_date) : null;
    const isCriticalH3 = daysLeft !== null && daysLeft <= 3 && readiness < 100;

    let urgencyStatus: 'CRITICAL_H3' | 'URGENT_H7' | 'UPCOMING' | 'COMPLETED' | 'PAST_DUE' = 'UPCOMING';
    if (readiness >= 100) {
      urgencyStatus = 'COMPLETED';
    } else if (daysLeft !== null && daysLeft < 0) {
      urgencyStatus = 'PAST_DUE';
    } else if (daysLeft !== null && daysLeft <= 3) {
      urgencyStatus = 'CRITICAL_H3';
    } else if (daysLeft !== null && daysLeft <= 7) {
      urgencyStatus = 'URGENT_H7';
    }

    summaries.push({
      branch_name: entry.branch_name,
      region: entry.region,
      target_opening_date: entry.opening_date,
      days_until_opening: daysLeft,
      total_items_needed: total,
      items_completed: completed,
      items_partial: partial,
      items_pending: pending,
      readiness_percentage: readiness,
      total_deal_cost: dealCost,
      total_rab_budget: rabBudget,
      is_critical_h3: isCriticalH3,
      urgency_status: urgencyStatus,
    });
  }

  return summaries.sort((a, b) => {
    if (a.days_until_opening !== null && b.days_until_opening !== null) {
      return a.days_until_opening - b.days_until_opening;
    }
    if (a.days_until_opening !== null) return -1;
    if (b.days_until_opening !== null) return 1;
    return b.total_items_needed - a.total_items_needed;
  });
}
