import { NextResponse } from "next/server";
import { getJob } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);

  try {
    const job = getJob(decoded);
    if (!job) {
      return NextResponse.json({ error: "Lowongan tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal membaca database" },
      { status: 500 },
    );
  }
}
