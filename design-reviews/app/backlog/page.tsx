import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/data";
import type { BacklogItem } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { BacklogList } from "@/components/BacklogList";

export const dynamic = "force-dynamic";

export const metadata = { title: "Backlog · Design reviews" };

type Filter = "all" | "open" | "later";

export default async function BacklogPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter: f } = await searchParams;
  const filter: Filter = f === "open" || f === "later" ? f : "all";
  const { store, viewer } = await getContext();
  if (!viewer) redirect("/login?next=%2Fbacklog");
  const [reviews, items] = await Promise.all([store.listReviews(viewer), store.listBacklog()]);

  const shown = items.filter((i) => (filter === "all" ? true : filter === "later" ? i.note.status === "later" : i.note.status === null));
  const open = items.filter((i) => i.note.status === null).length;
  const later = items.length - open;

  // Group by review → screen, keeping sidebar order.
  const groups: { key: string; reviewId: string; reviewName: string; screenId: string; screenTitle: string; items: BacklogItem[] }[] = [];
  for (const r of reviews) {
    for (const s of r.screens) {
      const its = shown.filter((i) => i.screenId === s.id);
      if (its.length) groups.push({ key: s.id, reviewId: r.id, reviewName: r.name, screenId: s.id, screenTitle: s.title || "New screen", items: its });
    }
  }

  return (
    <div className="app">
      <Sidebar reviews={reviews} currentReviewId={null} currentScreenId={null} viewer={viewer} backlogCount={items.length} />
      <main className="wrap backlog">
        <div className="head">
          <div>
            <h1>Backlog</h1>
          </div>
          <div className="meta">
            {open} open · {later} later
          </div>
        </div>
        <div className="filters">
          <Link href="/backlog" className={filter === "all" ? "on" : ""}>
            All ({items.length})
          </Link>
          <Link href="/backlog?filter=open" className={filter === "open" ? "on" : ""}>
            Open ({open})
          </Link>
          <Link href="/backlog?filter=later" className={filter === "later" ? "on" : ""}>
            Later ({later})
          </Link>
        </div>
        {groups.length === 0 ? (
          <div className="empty">Nothing here — everything is done.</div>
        ) : (
          groups.map((g) => (
            <section key={g.key} className="backlog-group">
              <h2>
                <Link href={`/r/${g.reviewId}/${g.screenId}`}>{g.screenTitle}</Link>
              </h2>
              <p className="sub">
                {g.reviewName} · {g.items.length} {g.items.length === 1 ? "note" : "notes"}
              </p>
              <BacklogList items={g.items} viewer={viewer} />
            </section>
          ))
        )}
      </main>
    </div>
  );
}
