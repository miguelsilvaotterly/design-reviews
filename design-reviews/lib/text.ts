// Text helpers shared by the UI and the seed script. Ported 1:1 from the
// prototype's fmt() / noteBody() so existing content renders identically.

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

export type Segment = { type: "text"; value: string } | { type: "code"; value: string } | { type: "br" };

/** Split a note body into text / inline-code / line-break segments.
 *  Supports both backtick values (new notes) and legacy <code> tags. */
export function segments(src: string): Segment[] {
  const s = String(src ?? "");
  const out: Segment[] = [];
  const re = /<code>([\s\S]*?)<\/code>|`([^`]+)`|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ type: "text", value: s.slice(last, m.index) });
    if (m[0] === "\n") out.push({ type: "br" });
    else out.push({ type: "code", value: m[1] ?? m[2] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ type: "text", value: s.slice(last) });
  return out;
}

/** Strip any HTML tags (legacy bodies) to plain text. */
export function plain(s: string | null | undefined) {
  return String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** URLs found in a note (raw + body), de-duplicated, trailing punctuation removed. */
export function noteLinks(raw: string | null | undefined, body: string | null | undefined): string[] {
  const src = `${raw ?? ""} ${String(body ?? "").replace(/<[^>]+>/g, " ")}`;
  const urls: string[] = [];
  for (let u of src.match(URL_RE) ?? []) {
    u = u.replace(/[.,;:]+$/, "");
    if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

/** Body text with URLs removed and the punctuation tidied, as the prototype did. */
export function bodyWithoutLinks(body: string | null | undefined) {
  return String(body ?? "")
    .replace(URL_RE, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Fallback when the AI rewrite is unavailable: first sentence → title, rest → body. */
export function heuristicRewrite(raw: string): { title: string; body: string } {
  const m = raw.match(/^(.+?[.!?])\s+([\s\S]*)$/);
  if (m) return { title: m[1].replace(/[.!?]$/, ""), body: m[2] };
  return { title: raw.slice(0, 60), body: "" };
}

/** Rebuild an editable message for a note that predates the raw field. */
export function rawFromNote(n: { raw?: string | null; title: string; body: string; question?: string | null }) {
  if (n.raw) return n.raw;
  return `${n.title}. ${plain(n.body)}${n.question ? ` ${n.question}` : ""}`.trim();
}

export function today() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "review"
  );
}

export function newId(prefix = "s") {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
