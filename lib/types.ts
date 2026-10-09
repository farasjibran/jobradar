export type SkillTier = "core" | "strong" | "working" | "familiar";

export type SeniorityLevel =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "manager"
  | "unknown";

export interface RoleFamily {
  label: string;
  keywords: string[];
}

export interface CandidateProfile {
  candidate: {
    name: string;
    years_experience: number;
    current_level: "junior" | "mid" | "senior" | "lead";
    skills: Record<SkillTier, string[]>;
    role_families: Record<string, RoleFamily>;
    seniority: {
      target: string[];
      acceptable: string[];
      avoid: string[];
      level_scores?: Record<string, number>;
    };
    domains: string[];
    location: {
      preferred: string[];
      acceptable: string[];
      accept_remote: boolean;
      accept_hybrid: boolean;
      accept_onsite: boolean;
    };
    salary: {
      currency: string;
      period: string;
      hard_min: number;
      target_min: number;
      target_max: number;
      stretch_max: number;
    };
  };
  scoring: {
    threshold: number;
    weights: {
      skills: number;
      seniority: number;
      domain: number;
      practical: number;
    };
  };
  crawl: {
    sources: string[];
    require_role_match: boolean;
    queries: { keywords: string; location: string }[];
    max_pages: number;
    page_size: number;
    max_jobs_per_run: number;
    fetch_details: boolean;
    delay_ms: { min: number; max: number };
    request_timeout_ms: number;
    max_retries: number;
    cache_ttl_hours: number;
    use_linkedin_cookie: boolean;
  };
}

export type JobSource = "linkedin" | "jobstreet" | "manual";

/** Bentuk seragam setelah normalisasi dari sumber mana pun. */
export interface RawJob {
  source: JobSource;
  externalId: string;
  url: string;
  title: string;
  company: string;
  location: string;
  description: string;
  salaryText: string | null;
  workMode: string | null;
  employmentType: string | null;
  postedAt: string | null;
  scrapedAt: string;
}

export type ReasonKind = "plus" | "minus" | "info";

export interface ScoreReason {
  kind: ReasonKind;
  text: string;
}

export type ComponentKey = "skills" | "seniority" | "domain" | "practical";

export interface ComponentScore {
  key: ComponentKey;
  label: string;
  score: number;
  /** Bobot efektif yang dipakai setelah redistribusi. */
  max: number;
  /** Bobot nominal dari profile.yaml. */
  nominalMax: number;
  /**
   * false kalau lowongan tidak memberi bukti apa pun untuk komponen ini
   * (mis. gaji tidak dicantumkan, industri tidak terdeteksi).
   * Komponen yang tidak dinilai bobotnya dialihkan ke komponen lain,
   * supaya data yang hilang tidak dihukum seperti nilai buruk.
   */
  assessed: boolean;
  reasons: ScoreReason[];
  /** Angka mentah untuk transparansi (ditampilkan di halaman detail). */
  detail: Record<string, number | string | string[] | null>;
}

export type Verdict = "strong" | "good" | "borderline" | "weak";

export interface ScoredJob {
  job: RawJob;
  total: number;
  passed: boolean;
  verdict: Verdict;
  roleFamily: string | null;
  roleLabel: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  components: ComponentScore[];
}
