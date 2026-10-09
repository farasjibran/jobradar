import { NextResponse } from "next/server";
import { listJobs, type ListFilters } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const num = (key: string): number | undefined => {
    const v = searchParams.get(key);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const filters: ListFilters = {
    minScore: num("minScore"),
    onlyPassed: searchParams.get("onlyPassed") === "1",
    hideApplied: searchParams.get("hideApplied") === "1",
    appliedOnly: searchParams.get("appliedOnly") === "1",
    source: searchParams.get("source") ?? undefined,
    roleFamily: searchParams.get("roleFamily") ?? undefined,
    verdict: searchParams.get("verdict") ?? undefined,
    search: searchParams.get("search")?.trim() || undefined,
    sort: (searchParams.get("sort") as ListFilters["sort"]) ?? "score",
    limit: num("limit") ?? 100,
    offset: num("offset") ?? 0,
  };

  try {
    const jobs = listJobs(filters);
    return NextResponse.json({ count: jobs.length, jobs });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal membaca database" },
      { status: 500 },
    );
  }
}
