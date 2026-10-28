"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/data";
import { nameScreen, rewriteNote } from "@/lib/ai";
import type { Box, Note, NoteStatus, Screen } from "@/lib/types";

async function editor() {
  const ctx = await getContext();
  if (!ctx.viewer) throw new Error("Not signed in");
  if (ctx.viewer.role !== "editor") throw new Error("Editors only");
  return ctx;
}

async function member() {
  const ctx = await getContext();
  if (!ctx.viewer) throw new Error("Not signed in");
  return { store: ctx.store, viewer: ctx.viewer };
}

function refresh() {
  revalidatePath("/", "layout");
}

// --- Reviews & screens --------------------------------------------------------

export async function createReviewAction(name: string) {
  const { store } = await editor();
  const review = await store.createReview(name.trim());
  const screen = await store.createScreen(review.id);
  refresh();
  redirect(`/r/${review.id}/${screen.id}?edit=1`);
}

export async function createScreenAction(reviewId: string) {
  const { store } = await editor();
  const screen = await store.createScreen(reviewId);
  refresh();
  redirect(`/r/${reviewId}/${screen.id}?edit=1`);
}

export async function updateScreenAction(screenId: string, patch: Partial<Pick<Screen, "title" | "figmaUrl">>) {
  const { store } = await editor();
  await store.updateScreen(screenId, patch);
  refresh();
}

export async function deleteScreenAction(reviewId: string, screenId: string) {
  const { store } = await editor();
  await store.deleteScreen(screenId);
  refresh();
  const reviews = await store.listReviews();
  const next = reviews.find((r) => r.id === reviewId)?.screens[0] ?? reviews.flatMap((r) => r.screens)[0];
  redirect(next ? `/r/${next.reviewId}/${next.id}` : "/");
}

/** Called when navigating away from a screen: drops it if still empty. */
export async function discardIfEmptyAction(screenId: string) {
  const { store } = await editor();
  const removed = await store.discardIfEmpty(screenId);
  if (removed) refresh();
  return removed;
}

export async function uploadImageAction(formData: FormData) {
  const { store } = await editor();
  const screenId = String(formData.get("screenId") ?? "");
  const kind = formData.get("kind") === "design" ? "design" : "production";
  const file = formData.get("file");
  if (!(file instanceof File) || !/^image\//.test(file.type)) throw new Error("Image expected");
  const url = await store.setImage(screenId, kind, { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type });
  refresh();
  return url;
}

// --- Notes ----------------------------------------------------------------------

export async function createNoteAction(screenId: string, box: Box | null): Promise<Note> {
  const { store } = await editor();
  const note = await store.createNote(screenId, box);
  refresh();
  return note;
}

export async function saveRawAction(noteId: string, raw: string) {
  const { store } = await editor();
  await store.updateNote(noteId, { raw });
}

/** Save the designer's message, rewrite it into title/body, and auto-name the screen if needed. */
export async function polishNoteAction(input: { reviewId: string; screenId: string; noteId: string; raw: string }) {
  const { store } = await editor();
  const screen = await store.getScreen(input.reviewId, input.screenId);
  if (!screen) throw new Error("Screen not found");
  const reviews = await store.listReviews();
  const review = reviews.find((r) => r.id === input.reviewId);
  const { title, body } = await rewriteNote(input.raw, { review: review?.name ?? "", screen: screen.title });
  await store.updateNote(input.noteId, { raw: input.raw, title, body, question: null });

  let screenTitle: string | null = null;
  if (!screen.title) {
    const notes = screen.notes.map((n) => (n.id === input.noteId ? { ...n, raw: input.raw, title, body } : n));
    const otherTitles = (review?.screens ?? []).filter((s) => s.id !== screen.id && s.title).map((s) => s.title);
    const suggested = await nameScreen({ review: review?.name ?? "", otherTitles, notes });
    // Never overwrite a title the designer typed while we were naming.
    const fresh = await store.getScreen(input.reviewId, input.screenId);
    if (suggested && fresh && !fresh.title) {
      await store.updateScreen(screen.id, { title: suggested });
      screenTitle = suggested;
    }
  }
  refresh();
  return { title, body, screenTitle };
}

export async function deleteNoteAction(noteId: string) {
  const { store } = await editor();
  await store.deleteNote(noteId);
  refresh();
}

export async function setNoteStatusAction(noteId: string, status: NoteStatus | null) {
  const { store, viewer } = await member();
  await store.setNoteStatus(noteId, status, viewer);
  refresh();
}
