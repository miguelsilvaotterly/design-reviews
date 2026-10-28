import type { Box, Note, NoteStatus, Review, Screen, Viewer } from "@/lib/types";

export type ImageKind = "production" | "design";

/** Everything the UI needs from a backend. Implemented by `local` (file-based,
 *  no auth, for development) and `supabase` (hosted, shared, with roles). */
export interface Store {
  /** All reviews with their screen summaries, in sidebar order. */
  listReviews(): Promise<Review[]>;
  getScreen(reviewId: string, screenId: string): Promise<Screen | null>;

  // --- editor mutations ---------------------------------------------------
  createReview(name: string): Promise<Review>;
  createScreen(reviewId: string): Promise<Screen>;
  updateScreen(
    screenId: string,
    patch: Partial<Pick<Screen, "title" | "figmaUrl" | "date">>,
  ): Promise<void>;
  deleteScreen(screenId: string): Promise<void>;
  /** Discards the screen only if it is still completely empty. Returns true if deleted. */
  discardIfEmpty(screenId: string): Promise<boolean>;
  setImage(screenId: string, kind: ImageKind, file: { bytes: Buffer; contentType: string }): Promise<string>;

  createNote(screenId: string, box: Box | null): Promise<Note>;
  updateNote(
    noteId: string,
    patch: Partial<Pick<Note, "raw" | "title" | "body" | "question">>,
  ): Promise<void>;
  deleteNote(noteId: string): Promise<void>;

  // --- viewer + editor ----------------------------------------------------
  setNoteStatus(noteId: string, status: NoteStatus | null, by: Viewer): Promise<void>;
}

export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}
