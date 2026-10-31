export { default } from '../monitoring/assets/page';

// Re-export only carries the default component, not the page config. Tanpa ini
// halaman bisa ikut di-prerender saat build sehingga status aset tampak
// "kembali ke awal" sampai deploy berikutnya.
export const dynamic = 'force-dynamic';