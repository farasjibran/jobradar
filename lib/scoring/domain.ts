/**
 * Domain Fit (20 poin)
 *
 * Prinsip: judul yang sama di industri berbeda bukan pekerjaan yang sama.
 * "Backend Engineer" di bank punya beban compliance/legacy; di startup SaaS
 * punya beban velocity/produk. Hiring manager membaca pengalaman industri
 * sebagai proxy untuk konteks yang kamu sudah paham.
 *
 * Skor:
 *   - industri cocok penuh            -> 1.0
 *   - industri bertetangga (adjacent) -> 0.55
 *   - industri berbeda                -> 0.15
 *   - tidak terdeteksi                -> 0.5 (netral)
 */

import { normalize } from "../text";
import type { CandidateProfile, ScoreReason } from "../types";

export interface DomainDef {
  id: string;
  label: string;
  keywords: string[];
  /** Domain lain yang dianggap bertetangga. */
  adjacent: string[];
}

export const DOMAINS: DomainDef[] = [
  {
    id: "fintech",
    label: "Fintech",
    keywords: ["fintech", "financial technology", "peer to peer", "p2p lending", "e-wallet", "ewallet", "dompet digital", "financial service", "jasa keuangan", "sekuritas", "reksadana", "investasi", "investment", "crypto", "blockchain"],
    adjacent: ["banking", "payments", "insurance", "ecommerce", "saas"],
  },
  {
    id: "banking",
    label: "Perbankan",
    keywords: ["bank", "perbankan", "banking", "bpr", "multifinance", "leasing", "kredit", "credit", "core banking"],
    adjacent: ["fintech", "payments", "insurance", "enterprise"],
  },
  {
    id: "payments",
    label: "Payments",
    keywords: ["payment", "pembayaran", "payment gateway", "remittance", "transfer", "qr code payment", "qris", "acquiring", "switching", "edc"],
    adjacent: ["fintech", "banking", "ecommerce"],
  },
  {
    id: "insurance",
    label: "Asuransi",
    keywords: ["insurance", "asuransi", "reinsurance", "klaim", "claim", "underwriting", "actuarial"],
    adjacent: ["fintech", "banking", "healthtech"],
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    keywords: ["e-commerce", "ecommerce", "e commerce", "online shop", "toko online", "marketplace", "olshop", "online store", "retail online"],
    adjacent: ["retail", "marketplace", "logistics", "payments", "fintech", "saas"],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    keywords: ["marketplace", "platform jual beli", "on-demand", "on demand", "gig economy"],
    adjacent: ["ecommerce", "retail", "logistics", "travel"],
  },
  {
    id: "retail",
    label: "Retail",
    keywords: ["retail", "ritel", "point of sale", "pos system", "supermarket", "minimarket", "department store", "omnichannel", "fnb", "f&b", "restaurant", "restoran"],
    adjacent: ["ecommerce", "marketplace", "logistics", "manufacturing"],
  },
  {
    id: "logistics",
    label: "Logistik",
    keywords: ["logistics", "logistik", "supply chain", "warehouse", "gudang", "shipping", "pengiriman", "ekspedisi", "kurir", "courier", "fleet", "freight", "3pl"],
    adjacent: ["ecommerce", "retail", "marketplace", "manufacturing", "automotive"],
  },
  {
    id: "saas",
    label: "SaaS",
    keywords: ["saas", "software as a service", "b2b saas", "subscription", "langganan", "product-led", "multi-tenant", "multi tenant"],
    adjacent: ["b2b", "startup", "enterprise", "fintech", "hrtech", "edtech"],
  },
  {
    id: "b2b",
    label: "B2B",
    keywords: ["b2b", "business to business", "enterprise software", "corporate solution", "white label", "white-label"],
    adjacent: ["saas", "enterprise", "startup", "logistics", "manufacturing"],
  },
  {
    id: "startup",
    label: "Startup Produk",
    keywords: ["startup", "start-up", "early stage", "seed stage", "series a", "series b", "venture", "vc-backed", "founded in", "product team"],
    adjacent: ["saas", "b2b", "fintech", "ecommerce", "healthtech", "edtech"],
  },
  {
    id: "enterprise",
    label: "Enterprise / Korporat",
    keywords: ["enterprise", "korporat", "corporate", "holding", "conglomerate", "grup usaha", "bumn", "multinational", "fortune 500", "internal system", "sistem internal", "sistem perusahaan"],
    adjacent: ["b2b", "saas", "manufacturing", "govtech", "telco"],
  },
  {
    id: "healthtech",
    label: "Healthtech",
    keywords: ["health", "healthcare", "kesehatan", "hospital", "rumah sakit", "klinik", "clinic", "telemedicine", "farmasi", "pharmacy", "pharma", "medtech", "ehr", "emr", "bpjs", "medical"],
    adjacent: ["insurance", "govtech", "enterprise", "saas"],
  },
  {
    id: "edtech",
    label: "Edtech",
    keywords: ["education", "edtech", "pendidikan", "sekolah", "school", "university", "universitas", "kampus", "kursus", "course", "learning management", "lms", "e-learning", "elearning", "bimbel", "training center"],
    adjacent: ["govtech", "saas", "enterprise", "startup"],
  },
  {
    id: "govtech",
    label: "Govtech / Pemerintahan",
    keywords: ["government", "pemerintah", "pemerintahan", "govtech", "public sector", "sektor publik", "kementerian", "dinas", "pemda", "pemprov", "pemkot", "instansi", "asn", "smart city", "e-government", "egovernment"],
    adjacent: ["enterprise", "healthtech", "edtech"],
  },
  {
    id: "telco",
    label: "Telco",
    keywords: ["telecommunication", "telekomunikasi", "telco", "operator seluler", "isp", "internet service provider", "network operator", "bts"],
    adjacent: ["enterprise", "media", "saas"],
  },
  {
    id: "travel",
    label: "Travel & Hospitality",
    keywords: ["travel", "wisata", "tourism", "pariwisata", "hotel", "hospitality", "booking", "tiket", "airline", "maskapai", "ota", "online travel"],
    adjacent: ["marketplace", "ecommerce", "startup"],
  },
  {
    id: "gaming",
    label: "Gaming",
    keywords: ["game", "gaming", "esports", "game developer", "studio game", "unity", "unreal"],
    adjacent: ["media", "startup", "ecommerce"],
  },
  {
    id: "media",
    label: "Media & Content",
    keywords: ["media", "news", "berita", "publisher", "content platform", "streaming", "ott", "entertainment", "hiburan", "broadcast", "radio", "television", "televisi"],
    adjacent: ["telco", "gaming", "ecommerce"],
  },
  {
    id: "manufacturing",
    label: "Manufaktur",
    keywords: ["manufacturing", "manufaktur", "pabrik", "factory", "plant", "produksi", "industrial", "industri", "mes", "scada", "iot industrial", "mining", "pertambangan", "oil and gas", "migas", "energi", "energy", "utility", "pln"],
    adjacent: ["logistics", "enterprise", "automotive", "retail"],
  },
  {
    id: "agritech",
    label: "Agritech",
    keywords: ["agri", "agritech", "agriculture", "pertanian", "perkebunan", "plantation", "fishery", "perikanan", "peternakan", "farm"],
    adjacent: ["logistics", "marketplace", "manufacturing"],
  },
  {
    id: "hrtech",
    label: "HR Tech",
    keywords: ["hr tech", "hrtech", "human resource", "sumber daya manusia", "payroll", "ats", "recruitment platform", "people operations"],
    adjacent: ["saas", "b2b", "enterprise"],
  },
  {
    id: "proptech",
    label: "Proptech",
    keywords: ["proptech", "property", "properti", "real estate", "perumahan", "apartemen", "sewa properti", "construction", "konstruksi"],
    adjacent: ["marketplace", "ecommerce", "enterprise"],
  },
  {
    id: "automotive",
    label: "Otomotif",
    keywords: ["automotive", "otomotif", "mobil", "motor", "dealer", "car", "vehicle", "kendaraan", "ev", "electric vehicle"],
    adjacent: ["manufacturing", "logistics", "retail"],
  },
  {
    id: "consulting",
    label: "Konsultan / IT Services",
    keywords: ["consulting", "konsultan", "it services", "system integrator", "software house", "outsourcing", "outstaffing", "agency", "digital agency", "solution provider", "vendor"],
    adjacent: ["enterprise", "b2b", "govtech", "saas"],
  },
];

export const DOMAIN_BY_ID = new Map(DOMAINS.map((d) => [d.id, d]));

export interface DomainResult {
  score: number;
  /** false kalau industri perusahaan tidak terdeteksi sama sekali. */
  assessed: boolean;
  detected: string[];
  detectedLabels: string[];
  matched: string[];
  adjacentMatched: string[];
  reasons: ScoreReason[];
  explanations: string[];
  detail: Record<string, string | string[] | number | null>;
}

/** Deteksi industri yang disebut lowongan. Mengembalikan hitungan keyword. */
export function detectDomains(text: string): Map<string, number> {
  const t = normalize(text);
  const hits = new Map<string, number>();
  for (const domain of DOMAINS) {
    let count = 0;
    for (const kw of domain.keywords) {
      const k = kw.toLowerCase();
      // "erp"/"sap" dll bisa muncul di konteks skill; tetap dihitung,
      // karena menyebut ERP/SAP memang sinyal domain enterprise.
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "gi");
      const m = t.match(re);
      if (m) count += m.length;
    }
    if (count > 0) hits.set(domain.id, count);
  }
  return hits;
}

export function scoreDomain(
  company: string,
  title: string,
  description: string,
  profile: CandidateProfile,
): DomainResult {
  const myDomains = new Set((profile.candidate.domains ?? []).map((d) => d.toLowerCase().trim()));

  // Nama perusahaan & judul diberi bobot lebih tinggi dari deskripsi,
  // karena deskripsi sering menyebut industri klien secara sepintas.
  const companyHits = detectDomains(company);
  const titleHits = detectDomains(title);
  const bodyHits = detectDomains(description);

  const weighted = new Map<string, number>();
  const add = (id: string, w: number) => weighted.set(id, (weighted.get(id) ?? 0) + w);
  for (const [id, n] of companyHits) add(id, n * 4);
  for (const [id, n] of titleHits) add(id, n * 3);
  for (const [id, n] of bodyHits) add(id, Math.min(n, 3));

  const reasons: ScoreReason[] = [];
  const explanations: string[] = [];

  if (weighted.size === 0) {
    explanations.push(
      "Industri perusahaan tidak terdeteksi dari data lowongan, jadi skor domain dinilai netral.",
    );
    return {
      score: 0.5,
      assessed: false,
      detected: [],
      detectedLabels: [],
      matched: [],
      adjacentMatched: [],
      reasons: [{ kind: "info", text: "Industri tidak terdeteksi (skor netral)" }],
      explanations,
      detail: { detected: [], matched: [], adjacent: [] },
    };
  }

  const ranked = [...weighted.entries()].sort((a, b) => b[1] - a[1]);
  const detected = ranked.map(([id]) => id);
  const detectedLabels = detected.map((id) => DOMAIN_BY_ID.get(id)?.label ?? id);

  const exact = detected.filter((id) => myDomains.has(id));

  // Adjacent: industri lowongan bertetangga dengan salah satu industri kamu.
  const adjacentSet = new Set<string>();
  for (const id of detected) {
    const def = DOMAIN_BY_ID.get(id);
    if (!def) continue;
    for (const adj of def.adjacent) {
      if (myDomains.has(adj)) adjacentSet.add(id);
    }
    // Cek juga arah sebaliknya: industri kamu menganggap ini tetangga.
    for (const mine of myDomains) {
      const mineDef = DOMAIN_BY_ID.get(mine);
      if (mineDef?.adjacent.includes(id)) adjacentSet.add(id);
    }
  }
  const adjacentMatched = [...adjacentSet].filter((id) => !myDomains.has(id));

  let score: number;
  if (exact.length > 0) {
    score = 1.0;
    const labels = exact.map((id) => DOMAIN_BY_ID.get(id)?.label ?? id);
    reasons.push({ kind: "plus", text: `Industri cocok: ${labels.join(", ")}` });
    explanations.push(
      `Lowongan berada di industri yang sama dengan pengalaman kamu (${labels.join(", ")}).`,
    );
  } else if (adjacentMatched.length > 0) {
    score = 0.55;
    const labels = adjacentMatched.map((id) => DOMAIN_BY_ID.get(id)?.label ?? id);
    reasons.push({
      kind: "info",
      text: `Industri bertetangga: ${labels.join(", ")}`,
    });
    explanations.push(
      `Industri lowongan (${labels.join(", ")}) berbeda tapi masih bertetangga dengan pengalaman kamu — konteks bisnisnya bisa dipelajari cepat.`,
    );
  } else {
    score = 0.15;
    reasons.push({
      kind: "minus",
      text: `Industri berbeda: ${detectedLabels.slice(0, 3).join(", ")}`,
    });
    explanations.push(
      `Industri lowongan (${detectedLabels.slice(0, 3).join(", ")}) jauh dari pengalaman kamu (${[...myDomains].map((d) => DOMAIN_BY_ID.get(d)?.label ?? d).join(", ") || "belum diisi"}).`,
    );
  }

  if (detected.length > 1) {
    explanations.push(
      `Beberapa industri terdeteksi: ${detectedLabels.slice(0, 5).join(", ")}. Yang paling dominan dipakai untuk penilaian.`,
    );
  }
  if (companyHits.size) {
    explanations.push(
      `Sinyal industri dari nama perusahaan: ${[...companyHits.keys()].map((id) => DOMAIN_BY_ID.get(id)?.label ?? id).join(", ")}.`,
    );
  }

  return {
    score,
    assessed: true,
    detected,
    detectedLabels,
    matched: exact,
    adjacentMatched,
    reasons,
    explanations,
    detail: {
      detected: detectedLabels,
      matched: exact.map((id) => DOMAIN_BY_ID.get(id)?.label ?? id),
      adjacent: adjacentMatched.map((id) => DOMAIN_BY_ID.get(id)?.label ?? id),
      my_domains: [...myDomains].map((d) => DOMAIN_BY_ID.get(d)?.label ?? d),
    },
  };
}
