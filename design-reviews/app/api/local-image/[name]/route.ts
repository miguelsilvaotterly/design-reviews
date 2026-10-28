// Serves images stored by the local (no-Supabase) data source.
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { localPaths } from "@/lib/data/local";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const safe = path.basename(name);
  const ext = safe.split(".").pop()?.toLowerCase() ?? "";
  if (!TYPES[ext]) return new NextResponse("Not found", { status: 404 });
  try {
    const bytes = await fs.readFile(path.join(localPaths.IMAGES, safe));
    return new NextResponse(bytes, {
      headers: { "Content-Type": TYPES[ext], "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
