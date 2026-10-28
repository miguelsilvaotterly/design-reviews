import { redirect } from "next/navigation";
import { getContext } from "@/lib/data";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { store, viewer } = await getContext();
  if (!viewer) redirect("/login");
  const reviews = await store.listReviews(viewer);
  const first = reviews.flatMap((r) => r.screens)[0];
  if (first) redirect(`/r/${first.reviewId}/${first.id}`);
  return <EmptyState viewer={viewer} reviews={reviews} />;
}
