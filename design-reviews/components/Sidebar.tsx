"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Review, ScreenSummary, Viewer } from "@/lib/types";
import { ChevronUpDownIcon, TrashIcon } from "./icons";

export function Sidebar({
  reviews,
  currentReviewId,
  currentScreenId,
  viewer,
  naming,
  onNavigate,
  onNewScreen,
  onNewReview,
  onDeleteScreen,
}: {
  reviews: Review[];
  currentReviewId: string | null;
  currentScreenId: string | null;
  viewer: Viewer;
  /** The current screen is being auto-named. */
  naming?: boolean;
  onNavigate?: (href: string) => boolean | void; // return false to cancel
  onNewScreen?: (reviewId: string) => void;
  onNewReview?: (name: string) => void;
  onDeleteScreen?: (screen: ScreenSummary) => void;
}) {
  const editor = viewer.role === "editor";
  const review = reviews.find((r) => r.id === currentReviewId) ?? reviews[0];
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const totals = (r: Review) => {
    let done = 0;
    let total = 0;
    for (const s of r.screens) {
      done += s.doneCount;
      total += s.noteCount;
    }
    return `${done}/${total}`;
  };

  return (
    <nav className="side">
      <div className="brand">OtterlyAI</div>
      <div className="brand-sub">Design reviews</div>

      <div className="fsel">
        <button
          className="fbtn"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          <span className="ft">
            <b>{review?.name ?? "No review"}</b>
          </span>
          <ChevronUpDownIcon />
        </button>
        {open && (
          <div className="fmenu" role="listbox" onClick={(e) => e.stopPropagation()}>
            {reviews.map((r) => {
              const first = r.screens[0];
              const href = first ? `/r/${r.id}/${first.id}` : null;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`fopt${r.id === review?.id ? " on" : ""}`}
                  onClick={() => {
                    setOpen(false);
                    if (!href) return onNewScreen?.(r.id);
                    if (onNavigate?.(href) === false) return;
                    router.push(href);
                  }}
                >
                  <span className="t">{r.name}</span>
                  <span className="p">{totals(r)}</span>
                </button>
              );
            })}
            {editor && (
              <>
                <div className="fdiv" />
                <button
                  type="button"
                  className="fopt"
                  onClick={() => {
                    setOpen(false);
                    const n = window.prompt("What are you reviewing? e.g. Billing");
                    if (n && n.trim()) onNewReview?.(n.trim());
                  }}
                >
                  <span className="fav plus">+</span>
                  <span className="t">New review</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="sec">Screens</div>
      {review?.screens.map((s) => {
        const on = s.id === currentScreenId;
        const complete = s.noteCount > 0 && s.doneCount === s.noteCount;
        const href = `/r/${s.reviewId}/${s.id}`;
        return (
          <Link
            key={s.id}
            href={href}
            className={`item${on ? " on" : ""}${complete ? " complete" : ""}`}
            onClick={(e) => {
              if (on) return;
              if (onNavigate?.(href) === false) e.preventDefault();
            }}
          >
            <span className="t">{s.title || (on && naming ? "Naming…" : "New screen")}</span>
            <span className="p">
              {s.doneCount}/{s.noteCount}
            </span>
            {editor && (
              <button
                type="button"
                className="sdel"
                title="Delete screen"
                aria-label={`Delete ${s.title || "New screen"}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteScreen?.(s);
                }}
              >
                <TrashIcon />
              </button>
            )}
          </Link>
        );
      })}

      {editor && review && (
        <button className="item add" type="button" onClick={() => onNewScreen?.(review.id)}>
          + New screen
        </button>
      )}

      <div className="side-actions">
        <div className="side-user" title={viewer.email}>
          {viewer.email} · {viewer.role}
        </div>
        {!viewer.email.endsWith("@local") && (
          <form action="/auth/signout" method="post">
            <button className="btn" type="submit" style={{ width: "100%" }}>
              Sign out
            </button>
          </form>
        )}
      </div>
    </nav>
  );
}
