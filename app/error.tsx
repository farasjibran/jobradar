"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[JobRadar]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-rose-500/10 text-2xl">⚠️</div>
      <h1 className="mt-4 text-sm font-medium text-rose-200">Terjadi kesalahan</h1>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed break-words text-zinc-500">
        {error.message}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
      >
        Coba lagi
      </button>
    </div>
  );
}
