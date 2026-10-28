export type Role = "editor" | "viewer";

export type NoteStatus = "done" | "later";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Note {
  id: string;
  screenId: string;
  position: number; // 0-based; displayed number = position + 1
  raw: string; // the designer's original message (may be empty for old notes)
  title: string;
  body: string; // may contain backtick values or legacy <code> tags
  question: string | null;
  box: Box | null;
  status: NoteStatus | null;
  statusBy: string | null; // email of whoever set the status
  statusAt: string | null; // ISO timestamp
}

export interface Screen {
  id: string;
  reviewId: string;
  title: string;
  date: string; // display string, e.g. "Oct 27, 2026"
  figmaUrl: string;
  productionUrl: string | null;
  designUrl: string | null;
  position: number;
  notes: Note[];
}

export interface Review {
  id: string; // slug, used in URLs
  name: string;
  position: number;
  screens: ScreenSummary[];
}

export interface ScreenSummary {
  id: string;
  reviewId: string;
  title: string;
  position: number;
  noteCount: number;
  doneCount: number;
  laterCount: number;
}

export interface Viewer {
  email: string;
  role: Role;
}

export interface Workspace {
  reviews: Review[];
}

export function countStatus(notes: Pick<Note, "status">[]) {
  let done = 0;
  let later = 0;
  for (const n of notes) {
    if (n.status === "done") done++;
    else if (n.status === "later") later++;
  }
  return { done, later };
}

export function isEmptyScreen(s: Screen) {
  return !s.title && !s.productionUrl && !s.designUrl && s.notes.length === 0;
}
