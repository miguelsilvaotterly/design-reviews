"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next, domains, initialError }: { next: string; domains: string[]; initialError: string | null }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "sent" | "error"; msg?: string }>(
    initialError ? { kind: "error", msg: initialError } : { kind: "idle" },
  );

  const allowed = (e: string) => domains.some((d) => e.toLowerCase().endsWith(`@${d.toLowerCase()}`));
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!allowed(email)) return setState({ kind: "error", msg: `Use your ${domains.map((d) => `@${d}`).join(" / ")} address.` });
    setState({ kind: "busy" });
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: callback() } });
    setState(error ? { kind: "error", msg: error.message } : { kind: "sent" });
  }

  async function google() {
    setState({ kind: "busy" });
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback(), queryParams: { hd: domains[0] } },
    });
    if (error) setState({ kind: "error", msg: error.message });
  }

  return (
    <form className="login-card" onSubmit={sendLink}>
      <div>
        <div className="brand" style={{ padding: 0 }}>OtterlyAI</div>
        <div className="brand-sub" style={{ padding: 0 }}>Design reviews</div>
      </div>
      <h1>Sign in</h1>
      <p>Only {domains.map((d) => `@${d}`).join(" and ")} accounts can sign in. Designers edit, developers tick notes off.</p>
      <input
        type="email"
        required
        placeholder={`you@${domains[0]}`}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={state.kind === "busy" || state.kind === "sent"}
      />
      <button className="btn primary" type="submit" disabled={state.kind === "busy" || state.kind === "sent"}>
        {state.kind === "sent" ? "Check your inbox" : "Email me a magic link"}
      </button>
      <button className="btn" type="button" onClick={google} disabled={state.kind === "busy"}>
        Continue with Google
      </button>
      {state.kind === "error" && <p className="err">{state.msg}</p>}
      {state.kind === "sent" && <p className="ok">Link sent to {email}. It opens this app signed in.</p>}
    </form>
  );
}
