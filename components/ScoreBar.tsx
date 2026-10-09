import { clsx } from "@/lib/clsx";
import { COMPONENT_META } from "@/lib/ui";
import type { ComponentScore } from "@/lib/types";

interface Props {
  component: ComponentScore;
  /** Tampilkan alasan plus/minus. */
  showReasons?: boolean;
  compact?: boolean;
}

/** Satu baris komponen skor dengan bar proporsional. */
export function ScoreBar({ component, showReasons = false, compact = false }: Props) {
  const meta = COMPONENT_META[component.key] ?? {
    label: component.label,
    short: component.label,
    hint: "",
    color: "text-zinc-300",
    bar: "bg-zinc-400",
  };

  const pct = component.max > 0 ? (component.score / component.max) * 100 : 0;

  return (
    <div className={clsx(compact ? "py-1.5" : "py-2.5")}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={clsx("text-xs font-medium", meta.color)}>
            {compact ? meta.short : meta.label}
          </span>
          {!component.assessed && (
            <span
              className="rounded bg-zinc-700/40 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-zinc-400 uppercase"
              title="Lowongan tidak memberi data untuk komponen ini, jadi bobotnya dialihkan ke komponen lain"
            >
              tidak dinilai
            </span>
          )}
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-400">
          {component.assessed ? (
            <>
              <span className="text-zinc-200">{component.score}</span>
              <span className="text-zinc-600">/{component.max}</span>
            </>
          ) : (
            <span className="text-zinc-600">—</span>
          )}
        </span>
      </div>

      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/6">
        <div
          className={clsx("h-full rounded-full", component.assessed ? meta.bar : "bg-zinc-700")}
          style={{ width: `${Math.max(pct, component.assessed ? 2 : 0)}%`, transition: "width 500ms ease-out" }}
        />
      </div>

      {showReasons && component.reasons.length > 0 && (
        <ul className="mt-2 space-y-1">
          {component.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed">
              <span
                className={clsx(
                  "mt-1.5 h-1 w-1 shrink-0 rounded-full",
                  r.kind === "plus"
                    ? "bg-emerald-400"
                    : r.kind === "minus"
                      ? "bg-rose-400"
                      : "bg-zinc-500",
                )}
              />
              <span
                className={clsx(
                  r.kind === "plus"
                    ? "text-emerald-300/90"
                    : r.kind === "minus"
                      ? "text-rose-300/90"
                      : "text-zinc-400",
                )}
              >
                {r.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
