"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { BacklogItem, NoteStatus, Viewer } from "@/lib/types";
import { setNoteStatusAction } from "@/app/actions";
import { NoteBody } from "./NoteBody";
import { CheckIcon, ClockIcon } from "./icons";

function ago(iso: string | null) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  if (d < 86400 * 14) return `${Math.round(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The notes list used on the backlog page: same rows as a screen, with Done / Later and a link back. */
export function BacklogList({ items, viewer }: { items: BacklogItem[]; viewer: Viewer }) {
  const [local, setLocal] = useState(items);
  const [, start] = useTransition();
  void viewer;

  const setStatus = (id: string, status: NoteStatus | null) => {
    setLocal((l) => l.map((i) => (i.note.id === id ? { ...i, note: { ...i.note, status } } : i)));
    start(() => setNoteStatusAction(id, status).catch((e) => window.alert(e instanceof Error ? e.message : "Failed")));
  };

  return (
    <ol className="notes">
      {local.map(({ note: n, reviewId, screenId }) => {
        const isDone = n.status === "done";
        const isLater = n.status === "later";
        return (
          <li key={n.id} className={isDone ? "done" : isLater ? "later" : ""}>
            <Link href={`/r/${reviewId}/${screenId}#note-${n.id}`} className={`n${n.box ? "" : " gen"}`} title="Open on its screen" style={{ textDecoration: "none" }}>
              {n.position + 1}
            </Link>
            <div>
              <h3>{n.title}</h3>
              <NoteBody raw={n.raw} body={n.body} question={n.question} />
              {isLater && <span className="later-tag">Later</span>}
            </div>
            <div className="acts" style={{ flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="done-btn later-btn" type="button" data-tip={isLater ? "Later · click to undo" : "Do later"} aria-pressed={isLater} onClick={() => setStatus(n.id, isLater ? null : "later")}>
                  <ClockIcon />
                </button>
                <button className="done-btn check-btn" type="button" data-tip={isDone ? "Done · click to undo" : "Mark as done"} aria-pressed={isDone} onClick={() => setStatus(n.id, isDone ? null : "done")}>
                  <CheckIcon />
                </button>
              </div>
              <span className="when">{ago(n.createdAt)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
