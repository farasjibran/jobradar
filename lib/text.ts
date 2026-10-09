/**
 * Utilitas teks: bersihkan HTML, normalisasi, potong per-seksi,
 * dan pencocokan kata dengan batas kata yang aman.
 */

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "-",
  "&mdash;": "-",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&ldquo;": '"',
  "&rdquo;": '"',
  "&bull;": "-",
  "&hellip;": "...",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

/** Buang tag HTML dan ubah struktur jadi newline agar seksi tetap terbaca. */
export function stripHtml(html: string): string {
  if (!html) return "";
  let s = html;
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  // Blok & list jadi baris baru supaya heading tetap terpisah.
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|section|article)\s*>/gi, "\n");
  s = s.replace(/<\s*li[^>]*>/gi, "- ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\r\n?/g, "\n");
  s = s.replace(/[ \t\u00a0]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/** Normalisasi untuk pencocokan: huruf kecil, tanda baca seragam. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-") // berbagai jenis dash -> "-"
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ");
}

export interface Section {
  heading: string;
  body: string;
}

const REQUIREMENT_HEADING =
  /\b(requirement|requirements|qualification|qualifications|kualifikasi|persyaratan|syarat|must have|must-have|what you.?ll need|who you are|skills? (?:and|&) experience|minimum|you have|wajib|dibutuhkan|kriteria)\b/i;

const NICE_TO_HAVE_HEADING =
  /\b(nice to have|nice-to-have|preferred|preferred qualification|plus point|plus points|bonus|good to have|added advantage|nilai tambah|diutamakan|optional|advantage)\b/i;

const HEADING_LIKE =
  /^[^\n]{2,80}:?\s*$|^(?:[A-Z][^a-z\n]{2,60})$|^\d+[.)]\s*[A-Z][^\n]{2,60}$/;

/** Baris yang jelas merupakan bullet, bukan heading. */
const BULLET_PREFIX = /^\s*(?:[-\u2022*\u00b7\u25aa\u25e6\u2192>]|\d+[.)])\s+/;

/**
 * Heuristik heading: pendek, tanpa tanda baca akhir, bukan bullet,
 * dan berbentuk ALL CAPS atau diakhiri titik dua.
 * Sengaja konservatif — salah menandai bullet sebagai heading akan
 * membuang isi deskripsi, dan itu merusak skor skill.
 */
function looksLikeHeading(line: string): boolean {
  if (BULLET_PREFIX.test(line)) return false;
  if (/[.,;!?]$/.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 8) return false;
  if (line.length >= 3 && line === line.toUpperCase() && /[A-Z]/.test(line)) return true;
  if (/:$/.test(line)) return true;
  return false;
}

/**
 * Potong deskripsi jadi beberapa seksi berdasarkan heading yang berdiri
 * sendiri di satu baris. Dipakai untuk membedakan skill "wajib" vs
 * "nice to have" — bobotnya berbeda.
 */
export function splitSections(description: string): Section[] {
  const text = normalize(description);
  const lines = text.split("\n");
  const sections: Section[] = [];
  let current: Section = { heading: "", body: "" };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      current.body += "\n";
      continue;
    }
    const isBullet = BULLET_PREFIX.test(line);
    const isHeading =
      !isBullet &&
      (REQUIREMENT_HEADING.test(line) ||
        NICE_TO_HAVE_HEADING.test(line) ||
        looksLikeHeading(line));

    if (isHeading) {
      if (current.body.trim()) sections.push(current);
      // "Requirements: - React, TypeScript" -> heading + isi di baris sama.
      const colon = line.indexOf(":");
      if (colon > 0 && colon < line.length - 1) {
        current = {
          heading: line.slice(0, colon).trim(),
          body: line.slice(colon + 1).trim() + "\n",
        };
      } else {
        current = { heading: line.replace(/[:\-\u2013]\s*$/, ""), body: "" };
      }
    } else {
      current.body += line + "\n";
    }
  }
  if (current.body.trim() || current.heading) sections.push(current);
  return sections;
}

/** Bobot sebuah seksi untuk keperluan "skill ini wajib atau tidak". */
export function sectionWeight(section: Section): number {
  if (NICE_TO_HAVE_HEADING.test(section.heading)) return 0.45;
  if (REQUIREMENT_HEADING.test(section.heading)) return 1.0;
  return 0.7;
}

export interface Range {
  start: number;
  end: number;
}

/** Semua posisi kemunculan `needle` di `haystack` dengan batas kata. */
export function findRanges(haystack: string, needle: string): Range[] {
  const out: Range[] = [];
  const n = needle.toLowerCase();
  if (!n) return out;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Batas kata: karakter kata = huruf/angka/underscore. Tanda + dan # dianggap
  // bagian dari kata supaya "c++"/"c#" tetap bisa dicocokkan.
  const pattern = new RegExp(
    `(?<![a-z0-9_+#])${escaped}(?![a-z0-9_+#])`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(haystack)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === pattern.lastIndex) pattern.lastIndex++;
  }
  return out;
}

export function overlaps(a: Range, taken: Range[]): boolean {
  return taken.some((t) => a.start < t.end && t.start < a.end);
}

/**
 * Parse angka gaya Indonesia/Inggris: "10.000.000", "10,000,000", "10jt",
 * "10 juta", "Rp 10.5 mio", "12 mio".
 */
export function parseMoney(raw: string): number | null {
  const s = normalize(raw).replace(/\s+/g, " ").trim();
  if (!s) return null;

  // "10jt", "10 jt", "10juta", "10 juta", "12mio", "1.5m", "1,5jt"
  const short = s.match(
    /(\d+(?:[.,]\d+)?)\s*(jt|juta|juta rupiah|mio|million|m\b|m\s)/,
  );
  if (short) {
    const n = Number(short[1].replace(",", "."));
    if (Number.isFinite(n)) {
      const unit = short[2].trim();
      if (unit.startsWith("jt") || unit.startsWith("juta")) return n * 1_000_000;
      return n * 1_000_000; // mio / million -> asumsi rupiah jutaan
    }
  }

  // Angka penuh: ambil grup digit panjang.
  const full = s.match(/\d[\d.,]{4,}/g);
  if (full) {
    const vals = full
      .map((v) => {
        const cleaned = v.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : NaN;
      })
      .filter((n) => Number.isFinite(n) && n >= 100_000);
    if (vals.length) return Math.min(...vals);
  }
  return null;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Judul -> slug aman untuk id/url. */
export function slugify(s: string): string {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
