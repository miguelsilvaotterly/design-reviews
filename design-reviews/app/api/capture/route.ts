// Endpoint used by the Chrome extension (extension/): creates a screen from a
// screenshot of the page the designer is looking at. Authenticated by the app's
// own session cookie — the extension sends requests with credentials.
import { NextResponse } from "next/server";
import { getContext } from "@/lib/data";
import { today } from "@/lib/text";

export const dynamic = "force-dynamic";

async function editorContext() {
  const ctx = await getContext();
  if (!ctx.viewer) return { error: NextResponse.json({ error: "Not signed in. Open the app in this browser and sign in first." }, { status: 401 }) };
  if (ctx.viewer.role !== "editor") return { error: NextResponse.json({ error: "Only editors can capture screens." }, { status: 403 }) };
  return { store: ctx.store, viewer: ctx.viewer };
}

/** GET → the reviews the extension can file a capture under. */
export async function GET() {
  const ctx = await editorContext();
  if ("error" in ctx) return ctx.error;
  const reviews = await ctx.store.listReviews(ctx.viewer);
  return NextResponse.json({ email: ctx.viewer.email, reviews: reviews.map((r) => ({ id: r.id, name: r.name, screens: r.screens.length })) });
}

/** POST multipart: file (image), reviewId | newReviewName, title?, figmaUrl?, sourceUrl? */
export async function POST(request: Request) {
  const ctx = await editorContext();
  if ("error" in ctx) return ctx.error;
  const { store } = ctx;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || !/^image\//.test(file.type)) return NextResponse.json({ error: "Image expected" }, { status: 400 });

  let reviewId = String(form.get("reviewId") ?? "").trim();
  const newReviewName = String(form.get("newReviewName") ?? "").trim();
  if (!reviewId && newReviewName) reviewId = (await store.createReview(newReviewName)).id;
  if (!reviewId) return NextResponse.json({ error: "reviewId or newReviewName is required" }, { status: 400 });

  const screen = await store.createScreen(reviewId);
  const title = String(form.get("title") ?? "").trim().slice(0, 80);
  const figmaUrl = String(form.get("figmaUrl") ?? "").trim();
  if (title || figmaUrl) await store.updateScreen(screen.id, { title, figmaUrl, date: today() });
  await store.setImage(screen.id, "production", { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type });

  const url = `/r/${reviewId}/${screen.id}?edit=1`;
  return NextResponse.json({ ok: true, reviewId, screenId: screen.id, url });
}
