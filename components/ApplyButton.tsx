"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clsx } from "@/lib/clsx";

interface Props {
  id: string;
  initialApplied: boolean;
}

/** Tombol tandai sudah / belum dilamar. PATCH ke /api/jobs/[id]/applied. */
export function ApplyButton({ id, initialApplied }: Props) {
  const router = useRouter();
  const [applied, setApplied] = useState(initialApplied);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const toggle = () => {
    const next = !applied;
    setApplied(next);
    setFailed(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(id)}/applied`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ applied: next }),
        });
        if (!res.ok) throw new Error(await res.text());
        router.refresh();
      } catch {
        setApplied(!next);
        setFailed(true);
      }
    });
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
          applied
            ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20"
            : "bg-white text-zinc-900 hover:bg-zinc-200",
        )}
      >
        {pending ? "Menyimpan…" : applied ? "✓ Sudah dilamar — batalkan" : "Tandai sudah dilamar"}
      </button>
      {failed && <span className="text-[11px] text-rose-300">Gagal menyimpan. Coba lagi.</span>}
    </div>
  );
}
