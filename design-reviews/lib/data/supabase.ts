// Supabase-backed store. Runs with the signed-in user's session so RLS applies:
// editors can write content, every member can set Done / Later.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BacklogItem, Box, Note, NoteStatus, Review, Screen, ScreenSummary } from "@/lib/types";
import { countStatus } from "@/lib/types";
import { newId, slugify, today } from "@/lib/text";
import { NotFoundError, type ImageKind, type Store } from "./store";

const BUCKET = "screens";

interface ReviewRow {
  id: string;
  name: string;
  position: number;
}
interface ScreenRow {
  id: string;
  review_id: string;
  title: string;
  date: string;
  figma_url: string;
  production_path: string | null;
  design_path: string | null;
  position: number;
}
interface NoteRow {
  id: string;
  screen_id: string;
  position: number;
  raw: string;
  title: string;
  body: string;
  question: string | null;
  box: Box | null;
  created_at?: string;
}
interface StatusRow {
  note_id: string;
  status: NoteStatus;
  user_email: string | null;
  updated_at: string;
}

function fail(e: { message: string } | null, what: string): never {
  throw new Error(`${what}: ${e?.message ?? "unknown error"}`);
}

export function createSupabaseStore(sb: SupabaseClient): Store {
  const publicUrl = (p: string | null) => (p ? sb.storage.from(BUCKET).getPublicUrl(p).data.publicUrl : null);

  return {
    async listReviews(viewer) {
      const { data: u } = await sb.auth.getUser();
      const uid = u.user?.id ?? null;
      void viewer;
      const [rv, sc, nt, st, vs] = await Promise.all([
        sb.from("reviews").select("id,name,position").order("position"),
        sb.from("screens").select("id,review_id,title,position").order("position"),
        sb.from("notes").select("id,screen_id,created_at"),
        sb.from("note_status").select("note_id,status"),
        uid ? sb.from("screen_visits").select("screen_id,prev_seen_at").eq("user_id", uid) : Promise.resolve({ data: [], error: null }),
      ]);
      if (rv.error) fail(rv.error, "reviews");
      if (sc.error) fail(sc.error, "screens");
      if (nt.error) fail(nt.error, "notes");
      if (st.error) fail(st.error, "note_status");
      if (vs.error) fail(vs.error, "screen_visits");
      const prevSeen = new Map<string, string | null>();
      for (const v of (vs.data ?? []) as { screen_id: string; prev_seen_at: string | null }[]) prevSeen.set(v.screen_id, v.prev_seen_at);
      const statusByNote = new Map<string, NoteStatus>();
      for (const s of st.data as Pick<StatusRow, "note_id" | "status">[]) statusByNote.set(s.note_id, s.status);
      const notesByScreen = new Map<string, { status: NoteStatus | null; createdAt: string | null }[]>();
      for (const n of nt.data as Pick<NoteRow, "id" | "screen_id" | "created_at">[]) {
        const list = notesByScreen.get(n.screen_id) ?? [];
        list.push({ status: statusByNote.get(n.id) ?? null, createdAt: n.created_at ?? null });
        notesByScreen.set(n.screen_id, list);
      }
      const screensByReview = new Map<string, ScreenSummary[]>();
      for (const s of sc.data as Pick<ScreenRow, "id" | "review_id" | "title" | "position">[]) {
        const notes = notesByScreen.get(s.id) ?? [];
        const { done, later } = countStatus(notes);
        const since = prevSeen.get(s.id) ?? null;
        const list = screensByReview.get(s.review_id) ?? [];
        list.push({
          id: s.id,
          reviewId: s.review_id,
          title: s.title,
          position: s.position,
          noteCount: notes.length,
          doneCount: done,
          laterCount: later,
          newCount: since ? notes.filter((n) => n.createdAt && n.createdAt > since).length : 0,
        });
        screensByReview.set(s.review_id, list);
      }
      return (rv.data as ReviewRow[]).map<Review>((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
        screens: screensByReview.get(r.id) ?? [],
      }));
    },

    async getScreen(reviewId, screenId) {
      const { data: s, error } = await sb
        .from("screens")
        .select("id,review_id,title,date,figma_url,production_path,design_path,position")
        .eq("id", screenId)
        .eq("review_id", reviewId)
        .maybeSingle<ScreenRow>();
      if (error) fail(error, "screen");
      if (!s) return null;
      const [nt, st] = await Promise.all([
        sb.from("notes").select("id,screen_id,position,raw,title,body,question,box,created_at").eq("screen_id", screenId).order("position"),
        sb.from("note_status").select("note_id,status,user_email,updated_at"),
      ]);
      if (nt.error) fail(nt.error, "notes");
      if (st.error) fail(st.error, "note_status");
      const status = new Map((st.data as StatusRow[]).map((x) => [x.note_id, x]));
      const notes = (nt.data as NoteRow[]).map<Note>((n) => {
        const x = status.get(n.id);
        return {
          id: n.id,
          screenId: n.screen_id,
          position: n.position,
          raw: n.raw ?? "",
          title: n.title ?? "",
          body: n.body ?? "",
          question: n.question,
          box: n.box,
          status: x?.status ?? null,
          statusBy: x?.user_email ?? null,
          statusAt: x?.updated_at ?? null,
          createdAt: n.created_at ?? null,
        };
      });
      return {
        id: s.id,
        reviewId: s.review_id,
        title: s.title,
        date: s.date,
        figmaUrl: s.figma_url,
        productionUrl: publicUrl(s.production_path),
        designUrl: publicUrl(s.design_path),
        position: s.position,
        notes,
      } satisfies Screen;
    },

    async listBacklog() {
      const [rv, sc, nt, st] = await Promise.all([
        sb.from("reviews").select("id,name"),
        sb.from("screens").select("id,review_id,title"),
        sb.from("notes").select("id,screen_id,position,raw,title,body,question,box,created_at").order("created_at"),
        sb.from("note_status").select("note_id,status,user_email,updated_at"),
      ]);
      if (rv.error) fail(rv.error, "reviews");
      if (sc.error) fail(sc.error, "screens");
      if (nt.error) fail(nt.error, "notes");
      if (st.error) fail(st.error, "note_status");
      const reviews = new Map((rv.data as Pick<ReviewRow, "id" | "name">[]).map((r) => [r.id, r]));
      const screens = new Map((sc.data as Pick<ScreenRow, "id" | "review_id" | "title">[]).map((s) => [s.id, s]));
      const status = new Map((st.data as StatusRow[]).map((x) => [x.note_id, x]));
      const out: BacklogItem[] = [];
      for (const n of nt.data as NoteRow[]) {
        const x = status.get(n.id);
        if (x?.status === "done") continue;
        const s = screens.get(n.screen_id);
        const r = s && reviews.get(s.review_id);
        if (!s || !r) continue;
        out.push({
          note: {
            id: n.id,
            screenId: n.screen_id,
            position: n.position,
            raw: n.raw ?? "",
            title: n.title ?? "",
            body: n.body ?? "",
            question: n.question,
            box: n.box,
            status: x?.status ?? null,
            statusBy: x?.user_email ?? null,
            statusAt: x?.updated_at ?? null,
            createdAt: n.created_at ?? null,
          },
          screenId: s.id,
          screenTitle: s.title,
          reviewId: r.id,
          reviewName: r.name,
        });
      }
      return out;
    },

    async markSeen(screenId, viewer, graceMs = 30 * 60 * 1000) {
      void viewer;
      const { data: u } = await sb.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return null;
      const { data: v } = await sb
        .from("screen_visits")
        .select("seen_at,prev_seen_at")
        .eq("user_id", uid)
        .eq("screen_id", screenId)
        .maybeSingle<{ seen_at: string; prev_seen_at: string | null }>();
      const now = new Date();
      if (!v) {
        await sb.from("screen_visits").insert({ user_id: uid, screen_id: screenId, seen_at: now.toISOString(), prev_seen_at: null });
        return null;
      }
      const prev = now.getTime() - new Date(v.seen_at).getTime() > graceMs ? v.seen_at : v.prev_seen_at;
      await sb.from("screen_visits").update({ seen_at: now.toISOString(), prev_seen_at: prev }).eq("user_id", uid).eq("screen_id", screenId);
      return prev;
    },

    async createReview(name) {
      const { data: existing } = await sb.from("reviews").select("id,position");
      const ids = new Set((existing ?? []).map((r: { id: string }) => r.id));
      let id = slugify(name);
      while (ids.has(id)) id += "-2";
      const position = existing?.length ?? 0;
      const { error } = await sb.from("reviews").insert({ id, name, position });
      if (error) fail(error, "create review");
      return { id, name, position, screens: [] };
    },

    async createScreen(reviewId) {
      const { data: siblings, error: e1 } = await sb.from("screens").select("position").eq("review_id", reviewId);
      if (e1) fail(e1, "screens");
      const position = siblings?.length ? Math.max(...siblings.map((x: { position: number }) => x.position)) + 1 : 0;
      const row = { id: newId(), review_id: reviewId, title: "", date: today(), figma_url: "", position };
      const { error } = await sb.from("screens").insert(row);
      if (error) fail(error, "create screen");
      return {
        id: row.id,
        reviewId,
        title: "",
        date: row.date,
        figmaUrl: "",
        productionUrl: null,
        designUrl: null,
        position,
        notes: [],
      };
    },

    async updateScreen(screenId, patch) {
      const row: Partial<ScreenRow> = {};
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.figmaUrl !== undefined) row.figma_url = patch.figmaUrl;
      if (patch.date !== undefined) row.date = patch.date;
      const { error } = await sb.from("screens").update(row).eq("id", screenId);
      if (error) fail(error, "update screen");
    },

    async deleteScreen(screenId) {
      const { data: s } = await sb.from("screens").select("production_path,design_path").eq("id", screenId).maybeSingle<ScreenRow>();
      const { error } = await sb.from("screens").delete().eq("id", screenId);
      if (error) fail(error, "delete screen");
      const paths = [s?.production_path, s?.design_path].filter((p): p is string => !!p);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    },

    async discardIfEmpty(screenId) {
      const { data: s } = await sb
        .from("screens")
        .select("title,production_path,design_path,notes(id)")
        .eq("id", screenId)
        .maybeSingle<{ title: string; production_path: string | null; design_path: string | null; notes: { id: string }[] }>();
      if (!s) return false;
      if (s.title || s.production_path || s.design_path || s.notes.length) return false;
      const { error } = await sb.from("screens").delete().eq("id", screenId);
      if (error) fail(error, "discard screen");
      return true;
    },

    async setImage(screenId, kind, file) {
      const ext = file.contentType === "image/jpeg" ? "jpg" : file.contentType === "image/webp" ? "webp" : "png";
      // Versioned file name so the public URL changes and caches don't serve the old image.
      const path = `${screenId}/${kind}-${Date.now().toString(36)}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(path, file.bytes, { contentType: file.contentType, upsert: true });
      if (up.error) fail(up.error, "upload image");
      const column = kind === "production" ? "production_path" : "design_path";
      const { data: prev } = await sb.from("screens").select(column).eq("id", screenId).maybeSingle<Record<string, string | null>>();
      const { error } = await sb.from("screens").update({ [column]: path }).eq("id", screenId);
      if (error) fail(error, "update screen image");
      const old = prev?.[column];
      if (old && old !== path) await sb.storage.from(BUCKET).remove([old]);
      return publicUrl(path)!;
    },

    async createNote(screenId, box) {
      const { data: siblings, error: e1 } = await sb.from("notes").select("id").eq("screen_id", screenId);
      if (e1) fail(e1, "notes");
      const row = { id: newId("n"), screen_id: screenId, position: siblings?.length ?? 0, raw: "", title: "", body: "", question: null, box };
      const { error } = await sb.from("notes").insert(row);
      if (error) fail(error, "create note");
      return {
        id: row.id,
        screenId,
        position: row.position,
        raw: "",
        title: "",
        body: "",
        question: null,
        box,
        status: null,
        statusBy: null,
        statusAt: null,
        createdAt: new Date().toISOString(),
      };
    },

    async updateNote(noteId, patch) {
      const { error } = await sb.from("notes").update(patch).eq("id", noteId);
      if (error) fail(error, "update note");
    },

    async deleteNote(noteId) {
      const { data: n } = await sb.from("notes").select("screen_id").eq("id", noteId).maybeSingle<{ screen_id: string }>();
      if (!n) throw new NotFoundError("note");
      const { error } = await sb.from("notes").delete().eq("id", noteId);
      if (error) fail(error, "delete note");
      // Renumber the remaining notes of the screen (numbers are 1-based positions).
      const { data: rest } = await sb.from("notes").select("id,position").eq("screen_id", n.screen_id).order("position");
      await Promise.all(
        (rest ?? []).map((r: { id: string; position: number }, i: number) =>
          r.position === i ? Promise.resolve() : sb.from("notes").update({ position: i }).eq("id", r.id),
        ),
      );
    },

    async setNoteStatus(noteId, status, by) {
      if (!status) {
        const { error } = await sb.from("note_status").delete().eq("note_id", noteId);
        if (error) fail(error, "clear status");
        return;
      }
      const { data: u } = await sb.auth.getUser();
      const { error } = await sb.from("note_status").upsert({
        note_id: noteId,
        status,
        user_id: u.user?.id ?? null,
        user_email: by.email,
        updated_at: new Date().toISOString(),
      });
      if (error) fail(error, "set status");
    },
  };
}
