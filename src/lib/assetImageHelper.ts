import imageMapData from '@/data/masterAssetImageMap.json';

const exactMap: Record<string, string> = imageMapData.exact || {};
const normalizedMap: Record<string, string> = imageMapData.normalized || {};

export function cleanItemName(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\((jadul|sampel|sample|contoh)\)/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Menambahkan atau memperbarui mapping gambar item secara runtime (misal setelah upload Supabase)
 */
export function setItemImageOverride(itemName: string, imageUrl: string) {
  if (!itemName || !imageUrl) return;
  exactMap[itemName] = imageUrl;
  const clean = cleanItemName(itemName);
  if (clean) normalizedMap[clean] = imageUrl;
}

const conflictTokens = new Set([
  'besar', 'kecil', 'sedang', 'mini', 'jumbo',
  'bulat', 'kotak', 'persegi', 'oval',
  'panjang', 'pendek',
  'pria', 'wanita',
  'hitam', 'putih', 'merah', 'kuning', 'hijau', 'biru'
]);

function hasConflictingTokens(tokensA: string[], tokensB: string[]): boolean {
  for (const t of conflictTokens) {
    const inA = tokensA.includes(t);
    const inB = tokensB.includes(t);
    if ((inA && !inB) || (!inA && inB)) {
      return true;
    }
  }
  return false;
}

/**
 * Mencari URL gambar aset berdasarkan nama item RO / Master Aset secara presisi
 * @param itemName Nama item yang dicari
 * @returns URL gambar di /uploads/master-assets/xxx.png atau null jika tidak ditemukan
 */
export function getItemImageUrl(itemName?: string): string | null {
  if (!itemName || typeof itemName !== 'string') return null;

  const raw = itemName.trim();
  if (exactMap[raw]) return exactMap[raw];

  // Case-insensitive exact lookup
  const rawLower = raw.toLowerCase();
  for (const [key, url] of Object.entries(exactMap)) {
    if (key.toLowerCase() === rawLower) {
      return url;
    }
  }

  const cleaned = cleanItemName(raw);
  if (!cleaned) return null;

  if (normalizedMap[cleaned]) return normalizedMap[cleaned];

  // Jika item memiliki separator seperti '|' atau '-' (contoh: "catering | selang gas" atau "Baju Bebek - L")
  const parts = raw.split(/[|\-/]/).map((p) => cleanItemName(p)).filter((p) => p.length >= 3);
  for (const part of parts) {
    if (normalizedMap[part]) return normalizedMap[part];
    for (const [normKey, url] of Object.entries(normalizedMap)) {
      if (normKey === part) return url;
    }
  }

  const queryTokens = cleaned.split(' ').filter((t) => t.length >= 2);
  if (queryTokens.length === 0) return null;

  // Pencocokan presisi: hanya cocokkan jika seluruh kata kunci query ada di target nama master aset
  let bestMatch: { url: string; score: number } | null = null;

  for (const [normKey, url] of Object.entries(normalizedMap)) {
    const targetTokens = normKey.split(' ').filter((t) => t.length >= 2);

    // Hindari bentrok ukuran/tipe/warna (contoh: 'besar' vs 'kecil')
    if (hasConflictingTokens(queryTokens, targetTokens)) {
      continue;
    }

    // Jika seluruh token query terkandung dalam target
    const allQueryInTarget = queryTokens.every((qt) => targetTokens.includes(qt));
    if (allQueryInTarget) {
      const score = targetTokens.length - queryTokens.length;
      if (!bestMatch || score < bestMatch.score) {
        bestMatch = { url, score };
      }
      continue;
    }

    // Atau jika seluruh token target terkandung dalam query (target lebih spesifik/ringkas)
    if (targetTokens.length >= 2) {
      const allTargetInQuery = targetTokens.every((tt) => queryTokens.includes(tt));
      if (allTargetInQuery) {
        const score = queryTokens.length - targetTokens.length;
        if (!bestMatch || score < bestMatch.score) {
          bestMatch = { url, score };
        }
      }
    }
  }

  if (bestMatch) {
    return bestMatch.url;
  }

  return null;
}
