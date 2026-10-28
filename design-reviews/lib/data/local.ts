// File-backed store for local development: no Supabase, no auth.
// Data lives in .local-data/db.json, images in .local-data/images/.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Box, Note, NoteStatus, Review, Screen, Viewer } from "@/lib/types";
import { countStatus, isEmptyScreen } from "@/lib/types";
import { newId, slugify, today } from "@/lib/text";
import { NotFoundError, type ImageKind, type Store } from "./store";

export const LOCAL_DIR = path.join(process.cwd(), ".local-data");
const DB = path.join(LOCAL_DIR, "db.json");
const IMAGES = path.join(LOCAL_DIR, "images");

interface DbReview {
  id: string;
  name: string;
  position: number;
}
interface DbScreen {
  id: string;
  reviewId: string;
  title: string;
  date: string;
  figmaUrl: string;
  production: string | null; // file name inside images/
  design: string | null;
  position: number;
}
interface DbNote {
  id: string;
  screenId: string;
  position: number;
  raw: string;
  title: string;
  body: string;
  question: string | null;
  box: Box | null;
  status: NoteStatus | null;
  statusBy: string | null;
  statusAt: string | null;
}
export interface LocalDb {
  reviews: DbReview[];
  screens: DbScreen[];
  notes: DbNote[];
}

let cache: LocalDb | null = null;
let chain: Promise<unknown> = Promise.resolve();

async function load(): Promise<LocalDb> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(DB, "utf8")) as LocalDb;
  } catch {
    cache = { reviews: [], screens: [], notes: [] };
  }
  return cache;
}

async function persist(db: LocalDb) {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(DB, JSON.stringify(db, null, 2));
}

/** Serialise mutations so concurrent server actions don't clobber the file. */
function mutate<T>(fn: (db: LocalDb) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const db = await load();
    const out = await fn(db);
    await persist(db);
    return out;
  });
  chain = run.catch(() => undefined);
  return run;
}

function imageUrl(name: string | null) {
  return name ? `/api/local-image/${encodeURIComponent(name)}` : null;
}

function toNote(n: DbNote): Note {
  return { ...n, box: n.box ? { ...n.box } : null };
}

function renumber(db: LocalDb, screenId: string) {
  db.notes
    .filter((n) => n.screenId === screenId)
    .sort((a, b) => a.position - b.position)
    .forEach((n, i) => (n.position = i));
}

export const localStore: Store = {
  async listReviews() {
    const db = await load();
    return db.reviews
      .slice()
      .sort((a, b) => a.position - b.position)
      .map<Review>((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
        screens: db.screens
          .filter((s) => s.reviewId === r.id)
          .sort((a, b) => a.position - b.position)
          .map((s) => {
            const notes = db.notes.filter((n) => n.screenId === s.id);
            const { done, later } = countStatus(notes);
            return {
              id: s.id,
              reviewId: s.reviewId,
              title: s.title,
              position: s.position,
              noteCount: notes.length,
              doneCount: done,
              laterCount: later,
            };
          }),
      }));
  },

  async getScreen(reviewId, screenId) {
    const db = await load();
    const s = db.screens.find((x) => x.id === screenId && x.reviewId === reviewId);
    if (!s) return null;
    return {
      id: s.id,
      reviewId: s.reviewId,
      title: s.title,
      date: s.date,
      figmaUrl: s.figmaUrl,
      productionUrl: imageUrl(s.production),
      designUrl: imageUrl(s.design),
      position: s.position,
      notes: db.notes
        .filter((n) => n.screenId === s.id)
        .sort((a, b) => a.position - b.position)
        .map(toNote),
    };
  },

  createReview(name) {
    return mutate((db) => {
      let id = slugify(name);
      while (db.reviews.some((r) => r.id === id)) id += "-2";
      const r: DbReview = { id, name, position: db.reviews.length };
      db.reviews.push(r);
      return { ...r, screens: [] };
    });
  },

  createScreen(reviewId) {
    return mutate((db) => {
      if (!db.reviews.some((r) => r.id === reviewId)) throw new NotFoundError("review");
      const siblings = db.screens.filter((s) => s.reviewId === reviewId);
      const s: DbScreen = {
        id: newId(),
        reviewId,
        title: "",
        date: today(),
        figmaUrl: "",
        production: null,
        design: null,
        position: siblings.length ? Math.max(...siblings.map((x) => x.position)) + 1 : 0,
      };
      db.screens.push(s);
      return { ...s, productionUrl: null, designUrl: null, notes: [] };
    });
  },

  updateScreen(screenId, patch) {
    return mutate((db) => {
      const s = db.screens.find((x) => x.id === screenId);
      if (!s) throw new NotFoundError("screen");
      Object.assign(s, patch);
    });
  },

  deleteScreen(screenId) {
    return mutate(async (db) => {
      const s = db.screens.find((x) => x.id === screenId);
      if (!s) return;
      db.screens = db.screens.filter((x) => x.id !== screenId);
      db.notes = db.notes.filter((n) => n.screenId !== screenId);
      for (const f of [s.production, s.design]) {
        if (f) await fs.rm(path.join(IMAGES, f), { force: true });
      }
    });
  },

  discardIfEmpty(screenId) {
    return mutate((db) => {
      const s = db.screens.find((x) => x.id === screenId);
      if (!s) return false;
      const notes = db.notes.filter((n) => n.screenId === screenId);
      const screen: Screen = {
        ...s,
        productionUrl: s.production,
        designUrl: s.design,
        notes: notes.map(toNote),
      };
      if (!isEmptyScreen(screen)) return false;
      db.screens = db.screens.filter((x) => x.id !== screenId);
      return true;
    });
  },

  setImage(screenId, kind, file) {
    return mutate(async (db) => {
      const s = db.screens.find((x) => x.id === screenId);
      if (!s) throw new NotFoundError("screen");
      const ext = file.contentType === "image/jpeg" ? "jpg" : file.contentType === "image/webp" ? "webp" : "png";
      const name = `${screenId}-${kind}-${Date.now().toString(36)}.${ext}`;
      await fs.mkdir(IMAGES, { recursive: true });
      await fs.writeFile(path.join(IMAGES, name), file.bytes);
      const old = s[kind];
      s[kind] = name;
      if (old) await fs.rm(path.join(IMAGES, old), { force: true });
      return imageUrl(name)!;
    });
  },

  createNote(screenId, box) {
    return mutate((db) => {
      if (!db.screens.some((s) => s.id === screenId)) throw new NotFoundError("screen");
      const siblings = db.notes.filter((n) => n.screenId === screenId);
      const n: DbNote = {
        id: newId("n"),
        screenId,
        position: siblings.length,
        raw: "",
        title: "",
        body: "",
        question: null,
        box,
        status: null,
        statusBy: null,
        statusAt: null,
      };
      db.notes.push(n);
      return toNote(n);
    });
  },

  updateNote(noteId, patch) {
    return mutate((db) => {
      const n = db.notes.find((x) => x.id === noteId);
      if (!n) throw new NotFoundError("note");
      Object.assign(n, patch);
    });
  },

  deleteNote(noteId) {
    return mutate((db) => {
      const n = db.notes.find((x) => x.id === noteId);
      if (!n) return;
      db.notes = db.notes.filter((x) => x.id !== noteId);
      renumber(db, n.screenId);
    });
  },

  setNoteStatus(noteId, status, by) {
    return mutate((db) => {
      const n = db.notes.find((x) => x.id === noteId);
      if (!n) throw new NotFoundError("note");
      n.status = status;
      n.statusBy = status ? by.email : null;
      n.statusAt = status ? new Date().toISOString() : null;
    });
  },
};

/** Used by the seed script and the image route. */
export const localPaths = { DB, IMAGES };
export function resetLocalCache() {
  cache = null;
}
