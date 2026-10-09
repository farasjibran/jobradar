import { NextResponse } from "next/server";
import { getJob, setApplied } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);

  let body: { applied?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  }
  if (typeof body.applied !== "boolean") {
    return NextResponse.json({ error: "Field applied harus boolean" }, { status: 400 });
  }

  try {
    const ok = setApplied(decoded, body.applied);
    if (!ok) return NextResponse.json({ error: "Lowongan tidak ditemukan" }, { status: 404 });
    return NextResponse.json(getJob(decoded));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal menyimpan status lamaran" },
      { status: 500 },
    );
  }
}
