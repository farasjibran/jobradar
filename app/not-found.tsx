import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-2xl">🔍</div>
      <h1 className="mt-4 text-sm font-medium text-zinc-200">Lowongan tidak ditemukan</h1>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
        Lowongan ini mungkin sudah dihapus dari database, atau tautannya salah.
      </p>
      <Link
        href="/"
        className="mt-5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
      >
        Kembali ke daftar
      </Link>
    </div>
  );
}
