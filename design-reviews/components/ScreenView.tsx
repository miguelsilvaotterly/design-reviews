"use client";

import type { Note, NoteStatus, Screen, Viewer } from "@/lib/types";
import { countStatus } from "@/lib/types";
import { NoteBody } from "./NoteBody";
import { Shot } from "./Shot";
import { CheckIcon, ClockIcon, ExternalIcon } from "./icons";

export function ScreenView({
  screen,
  viewer,
  naming,
  activeId,
  lastSeenAt,
  onEdit,
  onStatus,
  onSelect,
}: {
  screen: Screen;
  viewer: Viewer;
  naming: boolean;
  activeId: string | null;
  /** ISO time of the viewer's previous visit; notes created after it are flagged "New". */
  lastSeenAt: string | null;
  onEdit: () => void;
  onStatus: (note: Note, status: NoteStatus | null) => void;
  onSelect: (note: Note, source: "marker" | "note") => void;
}) {
  const { done, later } = countStatus(screen.notes);
  const editor = viewer.role === "editor";
  const showDesign = !!(screen.designUrl || screen.figmaUrl);
  const isNew = (n: Note) => !!lastSeenAt && !!n.createdAt && n.createdAt > lastSeenAt;
  const newCount = screen.notes.filter(isNew).length;

  return (
    <>
      <div className="head">
        <div>
          <h1>{screen.title || (naming ? "Naming…" : "New screen")}</h1>
        </div>
        <div className="head-right">
          <div className="meta">
            {screen.date} · {done} of {screen.notes.length} done
            {later > 0 && ` · ${later} later`}
            {newCount > 0 && (
              <>
                {" · "}
                <span className="new-tag">{newCount} new</span>
              </>
            )}
          </div>
          {editor && (
            <button className="btn" type="button" onClick={onEdit}>
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="board">
        <div>
          {screen.productionUrl && (
            <>
              <p className="label">
                <span>Production</span>
              </p>
              <Shot src={screen.productionUrl} alt="Production" notes={screen.notes} activeId={activeId} onSelect={(n) => onSelect(n, "marker")} />
              {screen.notes.some((n) => n.box) && (
                <p className="keys">
                  Press <kbd>1</kbd>–<kbd>9</kbd> to jump to a note · click a marker or a number to link them
                </p>
              )}
            </>
          )}
          {showDesign && (
            <p className={`label${screen.productionUrl ? " gap" : ""}`}>
              <span>Design</span>
              {screen.figmaUrl && (
                <a className="fig" href={screen.figmaUrl} target="_blank" rel="noopener noreferrer">
                  Open in Figma
                  <ExternalIcon />
                </a>
              )}
            </p>
          )}
          {screen.designUrl && <Shot src={screen.designUrl} alt="Design" />}
        </div>

        <div>
          <p className="label">
            <span>Notes</span>
          </p>
          <ol className="notes">
            {screen.notes.map((n) => {
              const k = n.position + 1;
              const isDone = n.status === "done";
              const isLater = n.status === "later";
              const tip = isDone ? "Done · click to undo" : "Mark as done";
              const ltip = isLater ? "Later · click to undo" : "Do later";
              const who = n.statusBy && !n.statusBy.endsWith("@local") ? ` by ${n.statusBy}` : "";
              const cls = [isDone ? "done" : isLater ? "later" : "", activeId === n.id ? "active" : ""].filter(Boolean).join(" ");
              return (
                <li key={n.id} id={`note-${n.id}`} className={cls}>
                  <span
                    className={`n${n.box ? "" : " gen"}`}
                    title={n.box ? "Show on the screenshot" : "General note, no marker"}
                    role={n.box ? "button" : undefined}
                    onClick={n.box ? () => onSelect(n, "note") : undefined}
                  >
                    {k}
                  </span>
                  <div>
                    <h3>
                      {n.title}
                      {isNew(n) && <span className="new-tag">New</span>}
                    </h3>
                    <NoteBody raw={n.raw} body={n.body} question={n.question} />
                    {isLater && <span className="later-tag">Later</span>}
                  </div>
                  <div className="acts">
                    <button
                      className="done-btn later-btn"
                      type="button"
                      data-tip={ltip + (isLater ? who : "")}
                      aria-label={ltip}
                      aria-pressed={isLater}
                      onClick={() => onStatus(n, isLater ? null : "later")}
                    >
                      <ClockIcon />
                    </button>
                    <button
                      className="done-btn check-btn"
                      type="button"
                      data-tip={tip + (isDone ? who : "")}
                      aria-label={tip}
                      aria-pressed={isDone}
                      onClick={() => onStatus(n, isDone ? null : "done")}
                    >
                      <CheckIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </>
  );
}
