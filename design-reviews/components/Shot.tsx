"use client";

import { useRef, useState } from "react";
import type { Box, Note } from "@/lib/types";
import { isPin } from "@/lib/types";

const MIN = 0.8; // % — a drag smaller than this becomes a pin marker

type Pt = { x: number; y: number };

function Marker({
  n,
  box,
  showStatus,
  active,
  movable,
  onPointerDown,
  onClick,
}: {
  n: Note;
  box: Box;
  showStatus: boolean;
  active: boolean;
  movable: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: () => void;
}) {
  const cls = ["box"];
  if (isPin(box)) cls.push("pin-marker");
  if (showStatus && n.status === "done") cls.push("done");
  if (showStatus && n.status === "later") cls.push("later");
  if (active) cls.push("active");
  if (movable) cls.push("movable");
  return (
    <div
      id={`marker-${n.id}`}
      className={cls.join(" ")}
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
      onPointerDown={onPointerDown}
      onClick={onClick}
      role="button"
      tabIndex={-1}
      aria-label={`Note ${n.position + 1}`}
    >
      <span className="pin">{n.position + 1}</span>
    </div>
  );
}

/** Screenshot card with markers. With `onDraw` the card becomes a drawing surface
 *  (drag = box, click = pin) and existing markers can be dragged to move them. */
export function Shot({
  src,
  alt,
  notes = [],
  showStatus = true,
  activeId = null,
  onSelect,
  onDraw,
  onMove,
}: {
  src: string;
  alt: string;
  notes?: Note[];
  showStatus?: boolean;
  activeId?: string | null;
  onSelect?: (note: Note) => void;
  onDraw?: (box: Box) => void;
  onMove?: (note: Note, box: Box) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<Pt | null>(null);
  const [tmp, setTmp] = useState<Box | null>(null);
  // Marker being moved: its note, the pointer offset from the box origin, and the live position.
  const moving = useRef<{ note: Note; dx: number; dy: number; moved: boolean } | null>(null);
  const [movePos, setMovePos] = useState<{ id: string; box: Box } | null>(null);

  const pt = (e: React.PointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const round = (v: number) => +v.toFixed(1);
  const boxFrom = (a: Pt, b: Pt): Box => ({
    x: round(Math.min(a.x, b.x)),
    y: round(Math.min(a.y, b.y)),
    w: round(Math.abs(b.x - a.x)),
    h: round(Math.abs(b.y - a.y)),
  });
  const clampMove = (b: Box, p: Pt, dx: number, dy: number): Box => ({
    ...b,
    x: round(Math.max(0, Math.min(100 - b.w, p.x - dx))),
    y: round(Math.max(0, Math.min(100 - b.h, p.y - dy))),
  });

  const editing = !!onDraw;

  const surface = editing
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.button !== 0 || moving.current) return;
          e.preventDefault();
          ref.current!.setPointerCapture(e.pointerId);
          start.current = pt(e);
          setTmp({ ...start.current, w: 0, h: 0 });
        },
        onPointerMove: (e: React.PointerEvent) => {
          if (moving.current) {
            const m = moving.current;
            m.moved = true;
            setMovePos({ id: m.note.id, box: clampMove(m.note.box!, pt(e), m.dx, m.dy) });
            return;
          }
          if (!start.current) return;
          setTmp(boxFrom(start.current, pt(e)));
        },
        onPointerUp: (e: React.PointerEvent) => {
          if (moving.current) {
            const m = moving.current;
            moving.current = null;
            const final = movePos?.id === m.note.id ? movePos.box : null;
            setMovePos(null);
            if (m.moved && final) onMove?.(m.note, final);
            else onSelect?.(m.note);
            return;
          }
          if (!start.current) return;
          const p = pt(e);
          const b = boxFrom(start.current, p);
          start.current = null;
          setTmp(null);
          // Tiny drag → pin marker at the point; otherwise a box.
          if (b.w < MIN && b.h < MIN) onDraw!({ x: round(p.x), y: round(p.y), w: 0, h: 0 });
          else onDraw!(b);
        },
        onPointerCancel: () => {
          start.current = null;
          moving.current = null;
          setTmp(null);
          setMovePos(null);
        },
      }
    : {};

  return (
    <div ref={ref} className={`shot${editing ? " editing" : ""}`} {...surface}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} />
      {notes
        .filter((n) => n.box)
        .map((n) => (
          <Marker
            key={n.id}
            n={n}
            box={movePos?.id === n.id ? movePos.box : n.box!}
            showStatus={showStatus}
            active={activeId === n.id}
            movable={editing}
            onPointerDown={
              editing
                ? (e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    e.preventDefault();
                    ref.current!.setPointerCapture(e.pointerId);
                    const p = pt(e);
                    moving.current = { note: n, dx: p.x - n.box!.x, dy: p.y - n.box!.y, moved: false };
                  }
                : undefined
            }
            onClick={editing ? undefined : () => onSelect?.(n)}
          />
        ))}
      {tmp && <div className="box" style={{ left: `${tmp.x}%`, top: `${tmp.y}%`, width: `${tmp.w}%`, height: `${tmp.h}%` }} />}
    </div>
  );
}
