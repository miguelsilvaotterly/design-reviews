"use client";

import { useRef, useState } from "react";
import type { Box, Note } from "@/lib/types";

const MIN = 0.8; // % — smaller drags are ignored

function Marker({ n, status }: { n: Note; status: boolean }) {
  const b = n.box!;
  return (
    <div
      className={`box${status && n.status === "done" ? " done" : status && n.status === "later" ? " later" : ""}`}
      style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
    >
      <span className="pin">{n.position + 1}</span>
    </div>
  );
}

/** Screenshot card with markers. With `onDraw` the card becomes a drawing surface. */
export function Shot({
  src,
  alt,
  notes = [],
  showStatus = true,
  onDraw,
}: {
  src: string;
  alt: string;
  notes?: Note[];
  showStatus?: boolean;
  onDraw?: (box: Box) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [tmp, setTmp] = useState<Box | null>(null);

  const pt = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const boxFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Box => ({
    x: +Math.min(a.x, b.x).toFixed(1),
    y: +Math.min(a.y, b.y).toFixed(1),
    w: +Math.abs(b.x - a.x).toFixed(1),
    h: +Math.abs(b.y - a.y).toFixed(1),
  });

  const handlers = onDraw
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.button !== 0) return;
          e.preventDefault();
          ref.current!.setPointerCapture(e.pointerId);
          start.current = pt(e);
          setTmp({ ...start.current, w: 0, h: 0 });
        },
        onPointerMove: (e: React.PointerEvent) => {
          if (!start.current) return;
          setTmp(boxFrom(start.current, pt(e)));
        },
        onPointerUp: (e: React.PointerEvent) => {
          if (!start.current) return;
          const b = boxFrom(start.current, pt(e));
          start.current = null;
          setTmp(null);
          if (b.w < MIN || b.h < MIN) return;
          onDraw(b);
        },
        onPointerCancel: () => {
          start.current = null;
          setTmp(null);
        },
      }
    : {};

  return (
    <div ref={ref} className={`shot${onDraw ? " editing" : ""}`} {...handlers}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} />
      {notes.filter((n) => n.box).map((n) => (
        <Marker key={n.id} n={n} status={showStatus} />
      ))}
      {tmp && <div className="box" style={{ left: `${tmp.x}%`, top: `${tmp.y}%`, width: `${tmp.w}%`, height: `${tmp.h}%` }} />}
    </div>
  );
}
