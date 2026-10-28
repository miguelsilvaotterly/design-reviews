import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Supabase redirects here after a magic link / OAuth sign-in. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";
  if (code) {
    const sb = await createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${url.origin}${safeNext}`);
    return NextResponse.redirect(`${url.origin}/login?error=${encodeURIComponent(error.message)}`);
  }
  const err = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  return NextResponse.redirect(`${url.origin}/login${err ? `?error=${encodeURIComponent(err)}` : ""}`);
}
