import { notFound, redirect } from "next/navigation";
import { getContext } from "@/lib/data";
import { ReviewApp } from "@/components/ReviewApp";

export const dynamic = "force-dynamic";

type Params = { review: string; screen: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { review, screen } = await params;
  const { store, viewer } = await getContext();
  if (!viewer) return { title: "Design reviews · OtterlyAI" };
  const s = await store.getScreen(review, screen);
  return { title: `${s?.title || "New screen"} · Design reviews` };
}

export default async function ScreenPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { review, screen } = await params;
  const { edit } = await searchParams;
  const { store, viewer } = await getContext();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/r/${review}/${screen}`)}`);
  const current = await store.getScreen(review, screen);
  if (!current) notFound();
  // Record the visit first so the sidebar's "new" counts for this screen reset, then list.
  const lastSeenAt = await store.markSeen(current.id, viewer);
  const reviews = await store.listReviews(viewer);
  return (
    <ReviewApp
      reviews={reviews}
      screen={current}
      viewer={viewer}
      lastSeenAt={lastSeenAt}
      startEditing={edit === "1" && viewer.role === "editor"}
    />
  );
}
