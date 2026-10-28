/**
 * Seed: imports docs/handoff/data/reviews.json and docs/handoff/data/images/
 *
 *   npm run seed:local   → writes .local-data/ for DATA_SOURCE=local
 *   npm run seed         → inserts into Supabase (needs NEXT_PUBLIC_SUPABASE_URL +
 *                          SUPABASE_SERVICE_ROLE_KEY in .env.local) and uploads images
 *                          to the "screens" storage bucket.
 *
 * Inserts reviews → screens → notes in `order`. Re-running is safe: rows are
 * upserted by id and images are overwritten. Done/Later statuses are not touched.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { slugify } from "../lib/text";

config({ path: ".env.local" });
config();

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "docs/handoff/data");
const LOCAL = process.argv.includes("--local") || (process.env.DATA_SOURCE !== "supabase" && !process.env.SUPABASE_SERVICE_ROLE_KEY);

interface SeedNote {
  raw?: string;
  title: string;
  body: string;
  question?: string;
  box?: { x: number; y: number; w: number; h: number };
}
interface SeedScreen {
  id: string;
  order: number;
  feature: string;
  title: string;
  date: string;
  figma: string;
  production: string;
  design: string;
  notes: SeedNote[];
}
interface SeedFile {
  exported: string;
  reviews: SeedScreen[];
}

async function main() {
  const seed = JSON.parse(await fs.readFile(path.join(DATA_DIR, "reviews.json"), "utf8")) as SeedFile;
  const screens = seed.reviews.slice().sort((a, b) => a.order - b.order);

  // Reviews in first-seen order.
  const reviewNames: string[] = [];
  for (const s of screens) if (!reviewNames.includes(s.feature)) reviewNames.push(s.feature);
  const reviewId = (name: string) => slugify(name);

  console.log(`Seeding ${reviewNames.length} reviews, ${screens.length} screens, ${screens.reduce((a, s) => a + s.notes.length, 0)} notes (${LOCAL ? "local" : "supabase"})`);

  if (LOCAL) return seedLocal(screens, reviewNames, reviewId);
  return seedSupabase(screens, reviewNames, reviewId);
}

async function seedLocal(screens: SeedScreen[], reviewNames: string[], reviewId: (n: string) => string) {
  const { localPaths, LOCAL_DIR } = await import("../lib/data/local");
  await fs.mkdir(localPaths.IMAGES, { recursive: true });

  let existing: { reviews: unknown[]; screens: unknown[]; notes: { id: string; screenId: string; status: string | null; statusBy: string | null; statusAt: string | null }[] } = { reviews: [], screens: [], notes: [] };
  try {
    existing = JSON.parse(await fs.readFile(localPaths.DB, "utf8"));
  } catch {
    /* fresh */
  }
  const prevStatus = new Map(existing.notes.map((n) => [n.id, n]));

  const db = {
    reviews: reviewNames.map((name, i) => ({ id: reviewId(name), name, position: i })),
    screens: [] as unknown[],
    notes: [] as unknown[],
  };
  for (const s of screens) {
    const copy = async (rel: string, kind: "production" | "design") => {
      if (!rel) return null;
      const name = `${s.id}-${kind}${path.extname(rel) || ".png"}`;
      await fs.copyFile(path.join(DATA_DIR, rel), path.join(localPaths.IMAGES, name));
      return name;
    };
    db.screens.push({
      id: s.id,
      reviewId: reviewId(s.feature),
      title: s.title,
      date: s.date,
      figmaUrl: s.figma || "",
      production: await copy(s.production, "production"),
      design: await copy(s.design, "design"),
      position: s.order,
    });
    s.notes.forEach((n, i) => {
      const id = `${s.id}-n${i + 1}`;
      const prev = prevStatus.get(id);
      db.notes.push({
        id,
        screenId: s.id,
        position: i,
        raw: n.raw ?? "",
        title: n.title,
        body: n.body,
        question: n.question ?? null,
        box: n.box ?? null,
        status: prev?.status ?? null,
        statusBy: prev?.statusBy ?? null,
        statusAt: prev?.statusAt ?? null,
      });
    });
  }
  await fs.writeFile(localPaths.DB, JSON.stringify(db, null, 2));
  console.log(`Wrote ${path.relative(ROOT, localPaths.DB)} and ${db.screens.length} screens' images to ${path.relative(ROOT, LOCAL_DIR)}/images`);
}

async function seedSupabase(screens: SeedScreen[], reviewNames: string[], reviewId: (n: string) => string) {
  const { createAdminClient } = await import("../lib/supabase/admin");
  const sb = createAdminClient();
  const BUCKET = "screens";

  const { error: e1 } = await sb.from("reviews").upsert(reviewNames.map((name, i) => ({ id: reviewId(name), name, position: i })));
  if (e1) throw new Error(`reviews: ${e1.message}`);

  for (const s of screens) {
    const upload = async (rel: string, kind: "production" | "design") => {
      if (!rel) return null;
      const file = path.join(DATA_DIR, rel);
      const ext = path.extname(rel).slice(1) || "png";
      const storagePath = `${s.id}/${kind}.${ext}`;
      const bytes = await fs.readFile(file);
      const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
      const { error } = await sb.storage.from(BUCKET).upload(storagePath, bytes, { contentType, upsert: true });
      if (error) throw new Error(`upload ${storagePath}: ${error.message}`);
      return storagePath;
    };
    const production_path = await upload(s.production, "production");
    const design_path = await upload(s.design, "design");
    const { error } = await sb.from("screens").upsert({
      id: s.id,
      review_id: reviewId(s.feature),
      title: s.title,
      date: s.date,
      figma_url: s.figma || "",
      production_path,
      design_path,
      position: s.order,
    });
    if (error) throw new Error(`screen ${s.id}: ${error.message}`);

    const notes = s.notes.map((n, i) => ({
      id: `${s.id}-n${i + 1}`,
      screen_id: s.id,
      position: i,
      raw: n.raw ?? "",
      title: n.title,
      body: n.body,
      question: n.question ?? null,
      box: n.box ?? null,
    }));
    if (notes.length) {
      const { error: e2 } = await sb.from("notes").upsert(notes);
      if (e2) throw new Error(`notes ${s.id}: ${e2.message}`);
    }
    console.log(`  ${s.feature} / ${s.title} — ${notes.length} notes${production_path ? ", production" : ""}${design_path ? ", design" : ""}`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
