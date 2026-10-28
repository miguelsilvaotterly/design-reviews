"use client";

import { useEffect, useRef, useState } from "react";
import type { Box, Note, Screen } from "@/lib/types";
import { rawFromNote } from "@/lib/text";
import type { ImageKind } from "@/lib/data/store";
import { NoteBody } from "./NoteBody";
import { Shot } from "./Shot";

export interface EditHandlers {
  onTitle: (title: string) => void;
  onFigma: (url: string) => void;
  onImage: (kind: ImageKind, file: File) => void;
  onDraw: (box: Box) => void;
  onAddNote: () => void;
  onRawChange: (note: Note, raw: string) => void;
  onPolish: (note: Note, raw: string) => void;
  onReopen: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  onDeleteScreen: () => void;
  onDone: () => void;
}

export function ScreenEdit({
  screen,
  busy,
  editingIds,
  focusNoteId,
  h,
}: {
  screen: Screen;
  /** Note ids currently being rewritten ("Writing the note…"). */
  busy: Set<string>;
  /** Note ids whose message box is open even though they already have a title. */
  editingIds: Set<string>;
  /** Note id whose message box should receive focus. */
  focusNoteId: string | null;
  h: EditHandlers;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!screen.title && !screen.notes.length) titleRef.current?.focus();
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="head">
        <div className="head-title">
          <h1>
            <input
              ref={titleRef}
              className="in"
              value={screen.title}
              placeholder="Screen name, e.g. Overview · Trial"
              onChange={(e) => h.onTitle(e.target.value)}
              aria-label="Screen name"
            />
          </h1>
        </div>
        <div className="head-right">
          <div className="meta">{screen.date}</div>
          <button className="btn primary" type="button" onClick={h.onDone}>
            Done
          </button>
        </div>
      </div>

      <div className="board">
        <div>
          <p className="label">
            <span>Production</span>
          </p>
          {screen.productionUrl ? (
            <>
              <Shot src={screen.productionUrl} alt="Production" notes={screen.notes} showStatus={false} onDraw={h.onDraw} />
              <p className="hint">
                <span>Drag on the screenshot to add a note.</span>
                <label>
                  Replace
                  <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && h.onImage("production", e.target.files[0])} />
                </label>
              </p>
            </>
          ) : (
            <DropZone kind="production" text="Production screenshot" onFile={(f) => h.onImage("production", f)} />
          )}

          <p className="label gap">
            <span>Design</span>
          </p>
          {screen.designUrl ? (
            <>
              <Shot src={screen.designUrl} alt="Design" />
              <p className="hint">
                <span />
                <label>
                  Replace
                  <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && h.onImage("design", e.target.files[0])} />
                </label>
              </p>
            </>
          ) : (
            <DropZone kind="design" text="Design image" onFile={(f) => h.onImage("design", f)} />
          )}

          <div className="link-in">
            <span>Figma</span>
            <input value={screen.figmaUrl} placeholder="Paste the Figma link for this screen" onChange={(e) => h.onFigma(e.target.value)} aria-label="Figma link" />
          </div>
        </div>

        <div>
          <p className="label">
            <span>Notes</span>
          </p>
          <ol className="notes">
            {screen.notes.length === 0 && (
              <li className="empty-notes">
                {screen.productionUrl ? "Drag a box on the screenshot to add a note." : "Upload the production screenshot, then drag boxes on it to add notes."}
              </li>
            )}
            {screen.notes.map((n) => {
              const k = n.position + 1;
              const open = !n.title || editingIds.has(n.id);
              return (
                <li key={n.id}>
                  <span className={`n${n.box ? "" : " gen"}`}>{k}</span>
                  <div>
                    {open ? (
                      <MessageBox note={n} busy={busy.has(n.id)} autoFocus={focusNoteId === n.id} onChange={(v) => h.onRawChange(n, v)} onSave={(v) => h.onPolish(n, v)} />
                    ) : (
                      <>
                        <h3>{n.title}</h3>
                        <NoteBody raw={n.raw} body={n.body} question={n.question} />
                        <button className="mini" type="button" onClick={() => h.onReopen(n)}>
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                  <button className="del" type="button" title="Delete note" aria-label={`Delete note ${k}`} onClick={() => h.onDeleteNote(n)}>
                    ×
                  </button>
                </li>
              );
            })}
          </ol>
          <button className="addnote" type="button" onClick={h.onAddNote}>
            + Add note without marker
          </button>
          <button className="danger" type="button" onClick={h.onDeleteScreen}>
            Delete this screen
          </button>
        </div>
      </div>
    </>
  );
}

function MessageBox({
  note,
  busy,
  autoFocus,
  onChange,
  onSave,
}: {
  note: Note;
  busy: boolean;
  autoFocus: boolean;
  onChange: (raw: string) => void;
  onSave: (raw: string) => void;
}) {
  // Local draft so a background refresh never wipes what is being typed.
  const [value, setValue] = useState(() => rawFromNote(note));
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const end = ref.current.value.length;
      ref.current.setSelectionRange(end, end);
    }
  }, [autoFocus]);

  return (
    <>
      <textarea
        ref={ref}
        className="msg"
        rows={3}
        placeholder="Describe the issue in your own words…"
        value={value}
        disabled={busy}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) onSave(value);
          }
        }}
        onBlur={() => {
          if (value.trim() && !busy) onSave(value);
        }}
      />
      <div className="msg-bar">{busy ? "Writing the note…" : "Enter to save · Shift+Enter for a new line"}</div>
    </>
  );
}

function DropZone({ kind, text, onFile }: { kind: ImageKind; text: string; onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`drop${over ? " over" : ""}`}
      data-kind={kind}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && /^image\//.test(f.type)) onFile(f);
      }}
    >
      <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <span>{text}</span>
      <small>Drop, paste (⌘V) or click to upload</small>
    </label>
  );
}
