/**
 * Lapisan database (SQLite via node:sqlite — bawaan Node 22+).
 *
 * Tidak ada dependency native, tidak perlu kompilasi.
 * Database disimpan di data/jobs.db.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { openDatabase, type Database } from "./sqlite";
import type { ComponentScore, ScoredJob, Verdict } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "jobs.db");

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = openDatabase(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

function migrate(d: Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id                TEXT PRIMARY KEY,
      source            TEXT NOT NULL,
      external_id       TEXT NOT NULL,
      url               TEXT NOT NULL,
      title             TEXT NOT NULL,
      company           TEXT NOT NULL DEFAULT '',
      location          TEXT NOT NULL DEFAULT '',
      description       TEXT NOT NULL DEFAULT '',
      salary_text       TEXT,
      work_mode         TEXT,
      employment_type   TEXT,
      posted_at         TEXT,
      scraped_at        TEXT NOT NULL,
      first_seen_at     TEXT NOT NULL,
      last_seen_at      TEXT NOT NULL,

      total_score       REAL,
      skills_score      REAL,
      seniority_score   REAL,
      domain_score      REAL,
      practical_score   REAL,
      verdict           TEXT,
      passed            INTEGER NOT NULL DEFAULT 0,
      role_family       TEXT,
      role_label        TEXT,
      matched_skills    TEXT NOT NULL DEFAULT '[]',
      missing_skills    TEXT NOT NULL DEFAULT '[]',
      breakdown         TEXT NOT NULL DEFAULT '[]',
      scored_at         TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_score  ON jobs (total_score DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_passed ON jobs (passed, total_score DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs (source);
    CREATE INDEX IF NOT EXISTS idx_jobs_family ON jobs (role_family);

    CREATE TABLE IF NOT EXISTS crawl_runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at    TEXT NOT NULL,
      finished_at   TEXT,
      sources       TEXT NOT NULL DEFAULT '',
      queries       INTEGER NOT NULL DEFAULT 0,
      fetched       INTEGER NOT NULL DEFAULT 0,
      new_jobs      INTEGER NOT NULL DEFAULT 0,
      updated_jobs  INTEGER NOT NULL DEFAULT 0,
      passed_jobs   INTEGER NOT NULL DEFAULT 0,
      rejected      INTEGER NOT NULL DEFAULT 0,
      errors        TEXT NOT NULL DEFAULT '[]',
      duration_ms   INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // Kolom penanda lamaran — ditambah terpisah supaya DB lama ikut ke-migrate.
  const cols = d.prepare("PRAGMA table_info(jobs)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("applied")) d.exec("ALTER TABLE jobs ADD COLUMN applied INTEGER NOT NULL DEFAULT 0;");
  if (!names.has("applied_at")) d.exec("ALTER TABLE jobs ADD COLUMN applied_at TEXT;");
  d.exec("CREATE INDEX IF NOT EXISTS idx_jobs_applied ON jobs (applied);");
}

// ---------------------------------------------------------------- jobs

export function jobRowId(source: string, externalId: string): string {
  return `${source}:${externalId}`;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
}

export function upsertScoredJobs(jobs: ScoredJob[]): UpsertResult {
  const d = getDb();
  const now = new Date().toISOString();

  const existing = d.prepare("SELECT id FROM jobs WHERE id = ?");
  const insert = d.prepare(`
    INSERT INTO jobs (
      id, source, external_id, url, title, company, location, description,
      salary_text, work_mode, employment_type, posted_at, scraped_at,
      first_seen_at, last_seen_at,
      total_score, skills_score, seniority_score, domain_score, practical_score,
      verdict, passed, role_family, role_label, matched_skills, missing_skills,
      breakdown, scored_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const update = d.prepare(`
    UPDATE jobs SET
      url = ?, title = ?, company = ?, location = ?, description = ?,
      salary_text = ?, work_mode = ?, employment_type = ?, posted_at = ?,
      last_seen_at = ?,
      total_score = ?, skills_score = ?, seniority_score = ?, domain_score = ?,
      practical_score = ?, verdict = ?, passed = ?, role_family = ?,
      role_label = ?, matched_skills = ?, missing_skills = ?, breakdown = ?,
      scored_at = ?
    WHERE id = ?
  `);

  let inserted = 0;
  let updated = 0;

  const byComponent = (s: ScoredJob, key: string) =>
    s.components.find((c) => c.key === key)?.score ?? 0;

  d.exec("BEGIN");
  try {
    for (const s of jobs) {
      const id = jobRowId(s.job.source, s.job.externalId);
      // Catatan: bun mengembalikan null, node mengembalikan undefined
      // untuk baris tidak ketemu — cek truthy supaya aman di keduanya.
      const exists = Boolean(existing.get(id));
      const matched = JSON.stringify(s.matchedSkills);
      const missing = JSON.stringify(s.missingSkills);
      const breakdown = JSON.stringify(s.components);

      if (exists) {
        update.run(
          s.job.url, s.job.title, s.job.company, s.job.location, s.job.description,
          s.job.salaryText, s.job.workMode, s.job.employmentType, s.job.postedAt,
          now,
          s.total, byComponent(s, "skills"), byComponent(s, "seniority"),
          byComponent(s, "domain"), byComponent(s, "practical"),
          s.verdict, s.passed ? 1 : 0, s.roleFamily, s.roleLabel,
          matched, missing, breakdown, now,
          id,
        );
        updated++;
      } else {
        insert.run(
          id, s.job.source, s.job.externalId, s.job.url, s.job.title, s.job.company,
          s.job.location, s.job.description, s.job.salaryText, s.job.workMode,
          s.job.employmentType, s.job.postedAt, s.job.scrapedAt,
          now, now,
          s.total, byComponent(s, "skills"), byComponent(s, "seniority"),
          byComponent(s, "domain"), byComponent(s, "practical"),
          s.verdict, s.passed ? 1 : 0, s.roleFamily, s.roleLabel,
          matched, missing, breakdown, now,
        );
        inserted++;
      }
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return { inserted, updated };
}

export interface JobRecord {
  id: string;
  applied: boolean;
  appliedAt: string | null;
  source: string;
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
  firstSeenAt: string;
  lastSeenAt: string;
  totalScore: number;
  verdict: Verdict;
  passed: boolean;
  roleFamily: string | null;
  roleLabel: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  components: ComponentScore[];
}

interface RawRow {
  id: string;
  source: string;
  external_id: string;
  url: string;
  title: string;
  company: string;
  location: string;
  description: string;
  salary_text: string | null;
  work_mode: string | null;
  employment_type: string | null;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  total_score: number;
  verdict: string;
  passed: number;
  applied: number | null;
  applied_at: string | null;
  role_family: string | null;
  role_label: string | null;
  matched_skills: string;
  missing_skills: string;
  breakdown: string;
}

function toRecord(r: RawRow): JobRecord {
  return {
    id: r.id,
    source: r.source,
    externalId: r.external_id,
    url: r.url,
    title: r.title,
    company: r.company,
    location: r.location,
    description: r.description,
    salaryText: r.salary_text,
    workMode: r.work_mode,
    employmentType: r.employment_type,
    postedAt: r.posted_at,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    totalScore: r.total_score,
    verdict: (r.verdict as Verdict) ?? "weak",
    passed: r.passed === 1,
    applied: r.applied === 1,
    appliedAt: r.applied_at ?? null,
    roleFamily: r.role_family,
    roleLabel: r.role_label,
    matchedSkills: safeParse(r.matched_skills, []),
    missingSkills: safeParse(r.missing_skills, []),
    components: safeParse(r.breakdown, []),
  };
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    const v = JSON.parse(s);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export interface ListFilters {
  minScore?: number;
  onlyPassed?: boolean;
  hideApplied?: boolean;
  appliedOnly?: boolean;
  source?: string;
  roleFamily?: string;
  verdict?: string;
  search?: string;
  sort?: "score" | "recent" | "company";
  limit?: number;
  offset?: number;
}

/** Bangun klausa WHERE + params dari filter (dipakai listJobs & countJobs). */
function buildWhere(f: ListFilters): { where: string; params: (string | number)[] } {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (f.minScore != null) {
    where.push("total_score >= ?");
    params.push(f.minScore);
  }
  if (f.onlyPassed) where.push("passed = 1");
  if (f.hideApplied) where.push("COALESCE(applied, 0) = 0");
  else if (f.appliedOnly) where.push("COALESCE(applied, 0) = 1");
  if (f.source) {
    where.push("source = ?");
    params.push(f.source);
  }
  if (f.roleFamily) {
    where.push("role_family = ?");
    params.push(f.roleFamily);
  }
  if (f.verdict) {
    where.push("verdict = ?");
    params.push(f.verdict);
  }
  if (f.search) {
    where.push("(title LIKE ? OR company LIKE ? OR location LIKE ?)");
    const q = `%${f.search}%`;
    params.push(q, q, q);
  }

  return { where: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

export function countJobs(f: ListFilters = {}): number {
  const d = getDb();
  const { where, params } = buildWhere(f);
  const row = d
    .prepare(`SELECT COUNT(*) AS n FROM jobs ${where}`)
    .get(...params) as { n: number };
  return row.n;
}

export function listJobs(f: ListFilters = {}): JobRecord[] {
  const d = getDb();
  const { where, params } = buildWhere(f);

  const order =
    f.sort === "recent"
      ? "COALESCE(posted_at, last_seen_at) DESC"
      : f.sort === "company"
        ? "company ASC, total_score DESC"
        : "total_score DESC, company ASC";

  const limit = Math.min(Math.max(f.limit ?? 100, 1), 1000);
  const offset = Math.max(f.offset ?? 0, 0);

  const sql = `
    SELECT * FROM jobs
    ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `;
  const rows = d.prepare(sql).all(...params, limit, offset) as unknown as RawRow[];
  return rows.map(toRecord);
}

export function getJob(id: string): JobRecord | null {
  const d = getDb();
  const row = d.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as unknown as RawRow | undefined;
  return row ? toRecord(row) : null;
}

export interface Stats {
  total: number;
  passed: number;
  rejected: number;
  applied: number;
  bySource: { source: string; count: number; passed: number; avg: number }[];
  byFamily: { family: string; label: string; count: number; avg: number }[];
  byVerdict: { verdict: string; count: number }[];
  lastRun: CrawlRunRecord | null;
  scoreBuckets: { range: string; count: number }[];
}

export function getStats(): Stats {
  const d = getDb();
  const total = (d.prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n;
  const passed = (d.prepare("SELECT COUNT(*) AS n FROM jobs WHERE passed = 1").get() as { n: number }).n;
  const applied = (d.prepare("SELECT COUNT(*) AS n FROM jobs WHERE COALESCE(applied, 0) = 1").get() as { n: number }).n;

  const bySource = d
    .prepare(
      `SELECT source, COUNT(*) AS count,
              SUM(passed) AS passed,
              ROUND(AVG(total_score), 1) AS avg
       FROM jobs GROUP BY source ORDER BY count DESC`,
    )
    .all() as unknown as { source: string; count: number; passed: number; avg: number }[];

  const byFamily = d
    .prepare(
      `SELECT COALESCE(role_family,'lainnya') AS family,
              COALESCE(role_label, 'Lainnya') AS label,
              COUNT(*) AS count,
              ROUND(AVG(total_score), 1) AS avg
       FROM jobs GROUP BY family ORDER BY count DESC`,
    )
    .all() as unknown as { family: string; label: string; count: number; avg: number }[];

  const byVerdict = d
    .prepare("SELECT COALESCE(verdict,'weak') AS verdict, COUNT(*) AS count FROM jobs GROUP BY verdict")
    .all() as unknown as { verdict: string; count: number }[];

  const buckets = [
    { range: "90-100", lo: 90, hi: 100.1 },
    { range: "80-89", lo: 80, hi: 90 },
    { range: "70-79", lo: 70, hi: 80 },
    { range: "60-69", lo: 60, hi: 70 },
    { range: "0-59", lo: 0, hi: 60 },
  ];
  const scoreBuckets = buckets.map((b) => ({
    range: b.range,
    count: (
      d
        .prepare("SELECT COUNT(*) AS n FROM jobs WHERE total_score >= ? AND total_score < ?")
        .get(b.lo, b.hi) as { n: number }
    ).n,
  }));

  return {
    total,
    passed,
    rejected: total - passed,
    applied,
    bySource,
    byFamily,
    byVerdict,
    lastRun: getLastRun(),
    scoreBuckets,
  };
}

export function setApplied(id: string, applied: boolean): boolean {
  const d = getDb();
  const res = d
    .prepare("UPDATE jobs SET applied = ?, applied_at = ? WHERE id = ?")
    .run(
      applied ? 1 : 0,
      applied ? new Date().toISOString() : null,
      id,
    );
  return Number(res.changes) > 0;
}

export function deleteJobsBySource(source: string): number {
  const d = getDb();
  const res = d.prepare("DELETE FROM jobs WHERE source = ?").run(source);
  return Number(res.changes);
}

// ---------------------------------------------------------------- runs

export interface CrawlRunRecord {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  sources: string;
  queries: number;
  fetched: number;
  newJobs: number;
  updatedJobs: number;
  passedJobs: number;
  rejected: number;
  errors: string[];
  durationMs: number | null;
}

export function startCrawlRun(sources: string[], queries: number): number {
  const d = getDb();
  const res = d
    .prepare(
      "INSERT INTO crawl_runs (started_at, sources, queries) VALUES (?,?,?)",
    )
    .run(new Date().toISOString(), sources.join(","), queries);
  return Number(res.lastInsertRowid);
}

export function finishCrawlRun(
  id: number,
  data: {
    fetched: number;
    newJobs: number;
    updatedJobs: number;
    passedJobs: number;
    rejected: number;
    errors: string[];
    startedAtMs: number;
  },
): void {
  const d = getDb();
  d.prepare(
    `UPDATE crawl_runs SET finished_at = ?, fetched = ?, new_jobs = ?,
       updated_jobs = ?, passed_jobs = ?, rejected = ?, errors = ?, duration_ms = ?
     WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    data.fetched,
    data.newJobs,
    data.updatedJobs,
    data.passedJobs,
    data.rejected,
    JSON.stringify(data.errors),
    Date.now() - data.startedAtMs,
    id,
  );
}

function runToRecord(r: Record<string, unknown>): CrawlRunRecord {
  return {
    id: Number(r.id),
    startedAt: String(r.started_at),
    finishedAt: r.finished_at ? String(r.finished_at) : null,
    sources: String(r.sources ?? ""),
    queries: Number(r.queries ?? 0),
    fetched: Number(r.fetched ?? 0),
    newJobs: Number(r.new_jobs ?? 0),
    updatedJobs: Number(r.updated_jobs ?? 0),
    passedJobs: Number(r.passed_jobs ?? 0),
    rejected: Number(r.rejected ?? 0),
    errors: safeParse(String(r.errors ?? "[]"), []),
    durationMs: r.duration_ms != null ? Number(r.duration_ms) : null,
  };
}

export function getLastRun(): CrawlRunRecord | null {
  const d = getDb();
  const row = d
    .prepare("SELECT * FROM crawl_runs ORDER BY id DESC LIMIT 1")
    .get() as Record<string, unknown> | undefined;
  return row ? runToRecord(row) : null;
}

export function listRuns(limit = 20): CrawlRunRecord[] {
  const d = getDb();
  const rows = d
    .prepare("SELECT * FROM crawl_runs ORDER BY id DESC LIMIT ?")
    .all(limit) as unknown as Record<string, unknown>[];
  return rows.map(runToRecord);
}
