import { clsx } from "@/lib/clsx";
import { scoreColor } from "@/lib/ui";

interface Props {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
  /** Tampilkan skala "/100" kecil di bawah angka. */
  showScale?: boolean;
}

/**
 * Cincin skor SVG. Warna mengikuti rentang skor supaya bisa dibaca
 * sekilas tanpa membaca angkanya.
 */
export function ScoreRing({
  score,
  size = 64,
  stroke = 6,
  label,
  className,
  showScale = false,
}: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;

  const color = scoreColor(clamped);
  const strokeColor =
    clamped >= 85
      ? "#34d399"
      : clamped >= 75
        ? "#2dd4bf"
        : clamped >= 70
          ? "#fbbf24"
          : clamped >= 60
            ? "#fb923c"
            : "#71717a";

  const fontSize = size * 0.3;

  return (
    <div className={clsx("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-white/8"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 500ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={clsx("font-semibold tabular-nums leading-none", color)}
          style={{ fontSize }}
        >
          {Number.isInteger(clamped) ? clamped : clamped.toFixed(1)}
        </span>
        {showScale && (
          <span className="mt-0.5 text-[9px] leading-none text-zinc-500">/100</span>
        )}
        {label && <span className="mt-0.5 text-[9px] leading-none text-zinc-500">{label}</span>}
      </div>
    </div>
  );
}
