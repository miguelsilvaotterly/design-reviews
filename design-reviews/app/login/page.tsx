import { redirect } from "next/navigation";
import { DATA_SOURCE, getContext } from "@/lib/data";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (DATA_SOURCE === "local") redirect("/");
  const { viewer } = await getContext();
  if (viewer) redirect(next && next.startsWith("/") ? next : "/");
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS || "otterly.ai").split(",").map((d) => d.trim()).filter(Boolean);
  return (
    <div className="login">
      <LoginForm next={next && next.startsWith("/") ? next : "/"} domains={domains} initialError={error ?? null} />
    </div>
  );
}
