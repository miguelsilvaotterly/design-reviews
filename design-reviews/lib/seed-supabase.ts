// Imports docs/handoff/data (reviews.json + images) into Supabase.
// Used by scripts/seed.ts (CLI) and app/api/seed (one-time hosted run).
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "./text";

interface SeedNote {
  raw?: string;
  title: string;
  body: string;
  question?: string;
  box?: { x: number; y: number; w: number; h: number };
}
export interface SeedScreen {
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

const BUCKET = "screens";

export async function seedSupabase(sb: SupabaseClient, dataDir: string, log: (line: string) => void = () => {}) {
  const seed = JSON.parse(await fs.readFile(path.join(dataDir, "reviews.json"), "utf8")) as { reviews: SeedScreen[] };
  const screens = seed.reviews.slice().sort((a, b) => a.order - b.order);
  const reviewNames: string[] = [];
  for (const s of screens) if (!reviewNames.includes(s.feature)) reviewNames.push(s.feature);
  const reviewId = (name: string) => slugify(name);

  log(`Seeding ${reviewNames.length} reviews, ${screens.length} screens, ${screens.reduce((a, s) => a + s.notes.length, 0)} notes`);

  const { error: e1 } = await sb.from("reviews").upsert(reviewNames.map((name, i) => ({ id: reviewId(name), name, position: i })));
  if (e1) throw new Error(`reviews: ${e1.message}`);

  for (const s of screens) {
    const upload = async (rel: string, kind: "production" | "design") => {
      if (!rel) return null;
      const ext = path.extname(rel).slice(1) || "png";
      const storagePath = `${s.id}/${kind}.${ext}`;
      const bytes = await fs.readFile(path.join(dataDir, rel));
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
    log(`${s.feature} / ${s.title} — ${notes.length} notes${production_path ? ", production" : ""}${design_path ? ", design" : ""}`);
  }
  log("Done.");
  return { reviews: reviewNames.length, screens: screens.length, notes: screens.reduce((a, s) => a + s.notes.length, 0) };
}
