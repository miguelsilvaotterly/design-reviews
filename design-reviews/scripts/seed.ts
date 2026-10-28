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

  if (LOCAL) return seedLocal(screens, reviewNames, reviewId, seed.exported);
  return seedSupabase(screens);
}

async function seedLocal(screens: SeedScreen[], reviewNames: string[], reviewId: (n: string) => string, seedExported: string) {
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
        createdAt: new Date(`${seedExported}T12:00:00Z`).toISOString(),
      });
    });
  }
  await fs.writeFile(localPaths.DB, JSON.stringify(db, null, 2));
  console.log(`Wrote ${path.relative(ROOT, localPaths.DB)} and ${db.screens.length} screens' images to ${path.relative(ROOT, LOCAL_DIR)}/images`);
}

async function seedSupabase(screens: SeedScreen[]) {
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { seedSupabase: run } = await import("../lib/seed-supabase");
  void screens;
  await run(createAdminClient(), DATA_DIR, (l) => console.log("  " + l));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
