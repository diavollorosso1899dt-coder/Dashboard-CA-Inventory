/**
 * Utility kompresi gambar klien untuk memastikan ukuran file maksimal 100 KB
 */

export interface CompressionResult {
  file: File;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  format: string;
  previewUrl: string;
}

const MAX_BYTES = 100 * 1024; // Maksimal 100 KB

/**
 * Mengompresi file gambar (JPG/PNG/WebP) sampai ukuran <= 100 KB
 */
export async function compressImageToMax100KB(
  file: File,
  maxBytes: number = MAX_BYTES
): Promise<CompressionResult> {
  const originalSize = file.size;

  // Baca file ke Image
  const img = await loadImageFromFile(file);
  let currentWidth = img.width;
  let currentHeight = img.height;

  // Batasi dimensi awal jika terlalu raksasa (maks 1200px)
  const MAX_INITIAL_DIM = 1200;
  if (currentWidth > MAX_INITIAL_DIM || currentHeight > MAX_INITIAL_DIM) {
    if (currentWidth > currentHeight) {
      currentHeight = Math.round((currentHeight * MAX_INITIAL_DIM) / currentWidth);
      currentWidth = MAX_INITIAL_DIM;
    } else {
      currentWidth = Math.round((currentWidth * MAX_INITIAL_DIM) / currentHeight);
      currentHeight = MAX_INITIAL_DIM;
    }
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context tidak didukung pada browser ini.');
  }

  // Tentukan format kompresi (utamakan WebP, fallback JPEG)
  const isWebpSupported = checkWebpSupport();
  const outputMime = isWebpSupported ? 'image/webp' : 'image/jpeg';
  const ext = isWebpSupported ? 'webp' : 'jpg';

  let quality = 0.88;
  let blob: Blob | null = null;

  // Loop adaptif hingga ukuran <= maxBytes
  for (let iteration = 0; iteration < 8; iteration++) {
    canvas.width = currentWidth;
    canvas.height = currentHeight;
    ctx.clearRect(0, 0, currentWidth, currentHeight);

    // Background putih untuk gambar transparan agar tidak hitam saat convert ke JPEG
    if (outputMime === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, currentWidth, currentHeight);
    }

    ctx.drawImage(img, 0, 0, currentWidth, currentHeight);

    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), outputMime, quality);
    });

    if (blob && blob.size <= maxBytes) {
      break;
    }

    // Jika masih > maxBytes, kurangi kualitas dan kecilkan skala 15%
    quality = Math.max(0.35, quality - 0.15);
    currentWidth = Math.round(currentWidth * 0.85);
    currentHeight = Math.round(currentHeight * 0.85);
  }

  if (!blob) {
    throw new Error('Gagal mengompresi gambar.');
  }

  // Jika setelah loop masih sedikit di atas maxBytes (sangat jarang), pangkas kualitas ekstrem
  if (blob.size > maxBytes) {
    currentWidth = Math.min(currentWidth, 600);
    currentHeight = Math.min(currentHeight, 600);
    canvas.width = currentWidth;
    canvas.height = currentHeight;
    ctx.drawImage(img, 0, 0, currentWidth, currentHeight);

    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), outputMime, 0.4);
    });
  }

  if (!blob) {
    throw new Error('Gagal menghasilkan file kompresi.');
  }

  const cleanBaseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^\w-]/g, '_');
  const compressedFileName = `${cleanBaseName}_compressed.${ext}`;
  const compressedFile = new File([blob], compressedFileName, { type: outputMime });
  const previewUrl = URL.createObjectURL(blob);

  return {
    file: compressedFile,
    blob,
    originalSize,
    compressedSize: blob.size,
    width: currentWidth,
    height: currentHeight,
    format: ext.toUpperCase(),
    previewUrl,
  };
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Format gambar tidak valid atau rusak.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

function checkWebpSupport(): boolean {
  if (typeof document === 'undefined') return true;
  const canvas = document.createElement('canvas');
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
