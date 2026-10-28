"use client";

import { useTransition } from "react";
import type { Review, Viewer } from "@/lib/types";
import { createReviewAction, createScreenAction } from "@/app/actions";
import { Sidebar } from "./Sidebar";

export function EmptyState({ viewer, reviews }: { viewer: Viewer; reviews: Review[] }) {
  const [pending, start] = useTransition();
  const editor = viewer.role === "editor";
  const newReview = (name: string) => start(() => createReviewAction(name));
  const newScreen = (reviewId: string) => start(() => createScreenAction(reviewId));
  return (
    <div className="app">
      <Sidebar reviews={reviews} currentReviewId={reviews[0]?.id ?? null} currentScreenId={null} viewer={viewer} onNewReview={newReview} onNewScreen={newScreen} />
      <main className="wrap">
        <div className="empty">
          No screens yet.
          {editor && (
            <button
              className="btn primary"
              type="button"
              disabled={pending}
              onClick={() => {
                if (reviews[0]) return newScreen(reviews[0].id);
                const n = window.prompt("What are you reviewing? e.g. Billing");
                if (n && n.trim()) newReview(n.trim());
              }}
            >
              + New screen
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
