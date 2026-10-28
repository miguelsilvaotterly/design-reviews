"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Box, Note, NoteStatus, Review, Screen, ScreenSummary, Viewer } from "@/lib/types";
import { countStatus, isEmptyScreen } from "@/lib/types";
import { rawFromNote } from "@/lib/text";
import type { ImageKind } from "@/lib/data/store";
import {
  createNoteAction,
  createReviewAction,
  createScreenAction,
  deleteNoteAction,
  deleteScreenAction,
  discardIfEmptyAction,
  fetchFigmaAction,
  figmaEnabledAction,
  moveNoteAction,
  polishNoteAction,
  saveRawAction,
  setNoteStatusAction,
  updateScreenAction,
  uploadImageAction,
} from "@/app/actions";
import { Sidebar } from "./Sidebar";
import { ScreenView } from "./ScreenView";
import { ScreenEdit, type EditHandlers } from "./ScreenEdit";

export function ReviewApp({
  reviews: serverReviews,
  screen: serverScreen,
  viewer,
  lastSeenAt,
  startEditing,
}: {
  reviews: Review[];
  screen: Screen;
  viewer: Viewer;
  lastSeenAt: string | null;
  startEditing: boolean;
}) {
  const router = useRouter();
  const editor = viewer.role === "editor";
  const [, startTransition] = useTransition();

  // Local copy of the screen for optimistic updates; re-synced whenever the server sends fresh props.
  const [screen, setScreen] = useState(serverScreen);
  // Mutations in flight. While any are pending, a server snapshot may predate them, so we
  // hold off re-syncing; once the last one settles we refresh and take the fresh snapshot.
  const pending = useRef(0);
  const [resync, setResync] = useState(0);
  useEffect(() => {
    if (pending.current === 0) setScreen(serverScreen);
  }, [serverScreen, resync]);
  const track = useCallback(
    <T,>(p: Promise<T>): Promise<T> => {
      pending.current += 1;
      return p.finally(() => {
        pending.current -= 1;
        if (pending.current === 0) {
          setResync((n) => n + 1);
          router.refresh();
        }
      });
    },
    [router],
  );
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const [editing, setEditing] = useState(startEditing);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [figma, setFigma] = useState<{ enabled: boolean; busy: boolean; error: string | null }>({ enabled: false, busy: false, error: null });
  useEffect(() => {
    if (!editor) return;
    figmaEnabledAction().then((enabled) => setFigma((f) => ({ ...f, enabled }))).catch(() => undefined);
  }, [editor]);

  async function fetchFigma(url: string) {
    const cur = screenRef.current;
    if (!url.trim() || figma.busy) return;
    setFigma((f) => ({ ...f, busy: true, error: null }));
    try {
      const stored = await track(fetchFigmaAction(cur.id, url.trim()));
      if (stored) setScreen((s) => ({ ...s, designUrl: stored }));
      setFigma((f) => ({ ...f, busy: false }));
    } catch (e) {
      setFigma((f) => ({ ...f, busy: false, error: e instanceof Error ? e.message : "Figma fetch failed" }));
    }
  }

  // Deep link from the backlog: /r/<review>/<screen>#note-<id>
  useEffect(() => {
    const m = window.location.hash.match(/^#note-(.+)$/);
    if (!m) return;
    const note = screenRef.current.notes.find((n) => n.id === m[1]);
    if (note) setTimeout(() => select(note, "key"), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverScreen.id]);
  const activeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Highlight a note + its marker and scroll the counterpart into view. */
  const select = useCallback((note: Note, source: "marker" | "note" | "key") => {
    setActiveId(note.id);
    if (activeTimer.current) clearTimeout(activeTimer.current);
    activeTimer.current = setTimeout(() => setActiveId(null), 2500);
    const targets = source === "marker" ? [`note-${note.id}`] : source === "note" ? [`marker-${note.id}`] : [`marker-${note.id}`, `note-${note.id}`];
    for (const id of targets) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Keyboard: 1–9 jump to that note (view and edit mode, when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement | null)?.isContentEditable) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const note = screenRef.current.notes[Number(e.key) - 1];
      if (!note) return;
      e.preventDefault();
      select(note, "key");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [select]);

  // Keep the sidebar in step with optimistic changes on the current screen.
  const { done, later } = countStatus(screen.notes);
  const reviews = serverReviews.map((r) =>
    r.id !== screen.reviewId
      ? r
      : {
          ...r,
          screens: r.screens.map((s) =>
            s.id !== screen.id ? s : { ...s, title: screen.title, noteCount: screen.notes.length, doneCount: done, laterCount: later },
          ),
        },
  );

  // Clean the ?edit=1 flag from the URL once we are in edit mode.
  useEffect(() => {
    if (startEditing && typeof window !== "undefined" && window.location.search.includes("edit=1")) {
      window.history.replaceState(null, "", `/r/${serverScreen.reviewId}/${serverScreen.id}`);
    }
  }, [startEditing, serverScreen.reviewId, serverScreen.id]);

  const fail = (e: unknown) => {
    console.error(e);
    window.alert(e instanceof Error ? e.message : "Something went wrong");
    router.refresh();
  };

  // --- status (viewer + editor) -------------------------------------------------
  const onStatus = (note: Note, status: NoteStatus | null) => {
    setScreen((s) => ({
      ...s,
      notes: s.notes.map((n) => (n.id === note.id ? { ...n, status, statusBy: status ? viewer.email : null, statusAt: status ? new Date().toISOString() : null } : n)),
    }));
    startTransition(() => track(setNoteStatusAction(note.id, status)).catch(fail));
  };

  // --- navigation: discard empty screens when leaving them --------------------------
  const onNavigate = useCallback(
    (href: string) => {
      const cur = screenRef.current;
      if (editor && isEmptyScreen(cur)) {
        discardIfEmptyAction(cur.id).finally(() => router.push(href));
        return false;
      }
      setEditing(false);
    },
    [editor, router],
  );

  const onNewScreen = (reviewId: string) => {
    const cur = screenRef.current;
    const go = () => startTransition(() => createScreenAction(reviewId).catch(fail));
    if (editor && isEmptyScreen(cur) && cur.reviewId === reviewId) return setEditing(true);
    if (editor && isEmptyScreen(cur)) discardIfEmptyAction(cur.id).finally(go);
    else go();
  };
  const onNewReview = (name: string) => startTransition(() => createReviewAction(name).catch(fail));
  const onDeleteScreen = (s: ScreenSummary) => {
    if (!window.confirm(`Delete “${s.title || "New screen"}” and its notes?`)) return;
    startTransition(() => deleteScreenAction(s.reviewId, s.id).catch(fail));
  };

  // --- editing ------------------------------------------------------------------------
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const debounce = (key: string, fn: () => void, ms = 300) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  };

  const h: EditHandlers = {
    onSelect: select,
    onMove: (note, box) => {
      setScreen((s) => ({ ...s, notes: s.notes.map((n) => (n.id === note.id ? { ...n, box } : n)) }));
      startTransition(() => track(moveNoteAction(note.id, box)).catch(fail));
    },
    onTitle: (title) => {
      setScreen((s) => ({ ...s, title }));
      debounce("title", () => track(updateScreenAction(screen.id, { title })).catch(fail));
    },
    onFigma: (figmaUrl) => {
      setScreen((s) => ({ ...s, figmaUrl }));
      debounce("figma", () => {
        track(updateScreenAction(screen.id, { figmaUrl })).catch(fail);
        // Auto-fetch the frame the first time a link is pasted and the Design slot is empty.
        if (figma.enabled && !screenRef.current.designUrl && /figma\.com\/.+node-id=/.test(figmaUrl)) fetchFigma(figmaUrl);
      }, 600);
    },
    onFetchFigma: () => fetchFigma(screenRef.current.figmaUrl),
    onImage: (kind, file) => setImage(kind, file),
    onDraw: (box) => addNote(box),
    onAddNote: () => addNote(null),
    onRawChange: (note, raw) => {
      debounce(`raw:${note.id}`, () => saveRawAction(note.id, raw).catch(() => undefined), 500);
    },
    onPolish: (note, raw) => polish(note, raw),
    onReopen: (note) => {
      setScreen((s) => ({ ...s, notes: s.notes.map((n) => (n.id === note.id ? { ...n, raw: rawFromNote(n) } : n)) }));
      setEditingIds((ids) => new Set(ids).add(note.id));
      setFocusNoteId(note.id);
    },
    onDeleteNote: (note) => {
      setScreen((s) => ({
        ...s,
        notes: s.notes.filter((n) => n.id !== note.id).map((n, i) => ({ ...n, position: i })),
      }));
      startTransition(() => track(deleteNoteAction(note.id)).catch(fail));
    },
    onDeleteScreen: () => {
      if (!window.confirm("Delete this screen and its notes?")) return;
      startTransition(() => deleteScreenAction(screen.reviewId, screen.id).catch(fail));
    },
    onDone: () => {
      setEditing(false);
      setEditingIds(new Set());
      router.refresh();
    },
  };

  async function setImage(kind: ImageKind, file: File) {
    if (!/^image\//.test(file.type)) return;
    const preview = URL.createObjectURL(file);
    setScreen((s) => ({ ...s, [kind === "production" ? "productionUrl" : "designUrl"]: preview }));
    const fd = new FormData();
    fd.set("screenId", screen.id);
    fd.set("kind", kind);
    fd.set("file", file);
    try {
      const url = await track(uploadImageAction(fd));
      setScreen((s) => ({ ...s, [kind === "production" ? "productionUrl" : "designUrl"]: url }));
    } catch (e) {
      fail(e);
    } finally {
      URL.revokeObjectURL(preview);
    }
  }

  async function addNote(box: Box | null) {
    try {
      const note = await track(createNoteAction(screen.id, box));
      setScreen((s) => ({ ...s, notes: [...s.notes.filter((n) => n.id !== note.id), note] }));
      setFocusNoteId(note.id);
    } catch (e) {
      fail(e);
    }
  }

  async function polish(note: Note, raw: string) {
    const message = raw.trim();
    if (!message || busy.has(note.id)) return;
    clearTimeout(timers.current[`raw:${note.id}`]);
    setBusy((b) => new Set(b).add(note.id));
    const needsName = !screenRef.current.title;
    if (needsName) setNaming(true);
    try {
      const res = await track(polishNoteAction({ reviewId: screen.reviewId, screenId: screen.id, noteId: note.id, raw: message }));
      setScreen((s) => ({
        ...s,
        title: s.title || res.screenTitle || "",
        notes: s.notes.map((n) => (n.id === note.id ? { ...n, raw: message, title: res.title, body: res.body, question: null } : n)),
      }));
      setEditingIds((ids) => {
        const next = new Set(ids);
        next.delete(note.id);
        return next;
      });
    } catch (e) {
      fail(e);
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(note.id);
        return next;
      });
      setNaming(false);
      if (focusNoteId === note.id) setFocusNoteId(null);
    }
  }

  // Paste an image anywhere in edit mode: fills Production first, then Design.
  useEffect(() => {
    if (!editing) return;
    const onPaste = (e: ClipboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const cur = screenRef.current;
      const kind: ImageKind | null = !cur.productionUrl ? "production" : !cur.designUrl ? "design" : null;
      if (!kind) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file" && /^image\//.test(i.type));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      setImage(kind, file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  return (
    <div className="app">
      <Sidebar
        reviews={reviews}
        currentReviewId={screen.reviewId}
        currentScreenId={screen.id}
        viewer={viewer}
        naming={naming}
        onNavigate={onNavigate}
        onNewScreen={editor ? onNewScreen : undefined}
        onNewReview={editor ? onNewReview : undefined}
        onDeleteScreen={editor ? onDeleteScreen : undefined}
      />
      <main className="wrap">
        {editing && editor ? (
          <ScreenEdit screen={screen} busy={busy} editingIds={editingIds} focusNoteId={focusNoteId} activeId={activeId} figma={figma} h={h} />
        ) : (
          <ScreenView
            screen={screen}
            viewer={viewer}
            naming={naming}
            activeId={activeId}
            lastSeenAt={lastSeenAt}
            onEdit={() => setEditing(true)}
            onStatus={onStatus}
            onSelect={select}
          />
        )}
      </main>
    </div>
  );
}
