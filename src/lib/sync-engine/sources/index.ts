import type { SyncSource } from '../types.ts';
import { assetRequestsSource } from './asset-requests.ts';
import { requestOrdersSource } from './request-orders.ts';
import { masterCatalogSource } from './master-catalog.ts';

export const SYNC_SOURCES: SyncSource[] = [
  assetRequestsSource,
  requestOrdersSource,
  masterCatalogSource,
];