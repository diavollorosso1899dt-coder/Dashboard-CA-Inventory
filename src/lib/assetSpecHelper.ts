import specData from '@/data/itemSpecifications.json';

// In-memory cache for overrides
const specMap: Record<string, string> = { ...(specData as Record<string, string>) };

export function cleanItemNameForSpec(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\((jadul|sampel|sample|contoh)\)/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mendapatkan spesifikasi kustom yang tersimpan untuk suatu item
 */
export function getItemSpecification(itemName?: string): string | null {
  if (!itemName || typeof itemName !== 'string') return null;

  const raw = itemName.trim();
  if (specMap[raw]) return specMap[raw];

  const lower = raw.toLowerCase();
  for (const [k, v] of Object.entries(specMap)) {
    if (k.toLowerCase() === lower) return v;
  }

  const cleaned = cleanItemNameForSpec(raw);
  if (cleaned && specMap[cleaned]) return specMap[cleaned];

  return null;
}

/**
 * Menyimpan / override spesifikasi item di memori runtime
 */
export function setItemSpecificationOverride(itemName: string, specification: string) {
  if (!itemName) return;
  const trimmedSpec = specification?.trim() || '';
  specMap[itemName] = trimmedSpec;
  const cleaned = cleanItemNameForSpec(itemName);
  if (cleaned) {
    specMap[cleaned] = trimmedSpec;
  }
}

/**
 * Mendapatkan seluruh daftar spesifikasi kustom
 */
export function getAllItemSpecifications(): Record<string, string> {
  return { ...specMap };
}
