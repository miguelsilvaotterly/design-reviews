import "server-only";
import type { Viewer } from "@/lib/types";
import type { Store } from "./store";

export const DATA_SOURCE: "local" | "supabase" = process.env.DATA_SOURCE === "supabase" ? "supabase" : "local";

/** The store for the current request plus the signed-in viewer (null when anonymous). */
export async function getContext(): Promise<{ store: Store; viewer: Viewer | null }> {
  if (DATA_SOURCE === "local") {
    const { localStore } = await import("./local");
    const role = process.env.LOCAL_ROLE === "viewer" ? "viewer" : "editor";
    return { store: localStore, viewer: { email: `${role}@local`, role } };
  }
  const [{ createClient }, { createSupabaseStore }] = await Promise.all([
    import("@/lib/supabase/server"),
    import("./supabase"),
  ]);
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user?.email) return { store: createSupabaseStore(sb), viewer: null };
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: "editor" | "viewer" }>();
  return { store: createSupabaseStore(sb), viewer: { email: user.email, role: profile?.role ?? "viewer" } };
}

export { ForbiddenError, NotFoundError } from "./store";
