// One-time import of the handoff content into Supabase, for deployments
// where no terminal is at hand:  GET /api/seed?key=<SEED_SECRET>
// Safe to call again (upserts); remove SEED_SECRET from the environment to disable.
import path from "node:path";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { seedSupabase } from "@/lib/seed-supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.SEED_SECRET;
  const key = new URL(request.url).searchParams.get("key");
  if (!secret || !key || key !== secret) return new NextResponse("Not found", { status: 404 });
  if (process.env.DATA_SOURCE !== "supabase") return new NextResponse("DATA_SOURCE is not supabase", { status: 400 });

  const lines: string[] = [];
  try {
    const sb = createAdminClient();
    const result = await seedSupabase(sb, path.join(process.cwd(), "docs/handoff/data"), (l) => lines.push(l));
    return NextResponse.json({ ok: true, ...result, log: lines });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e), log: lines }, { status: 500 });
  }
}
