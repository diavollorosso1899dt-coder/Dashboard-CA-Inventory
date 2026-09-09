import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center p-6">
      <h2 className="text-xl font-bold text-white mb-2">Halaman Tidak Ditemukan</h2>
      <p className="text-sm text-slate-400 mb-6">Halaman yang Anda cari tidak tersedia atau telah dipindahkan.</p>
      <Link
        href="/"
        className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
