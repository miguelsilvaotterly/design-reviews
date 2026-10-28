import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { heuristicRewrite, plain } from "@/lib/text";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

// Prompt ported verbatim from the prototype.
const REWRITE_SYSTEM =
  "You lightly edit a product designer's design-QA message into a note for developers. " +
  'Reply with JSON only: {"title": "...", "body": "..."}. ' +
  "title: what is wrong, max 7 words, sentence case, no period. " +
  "body: the designer's message, cleaned up for grammar and clarity, in one or two short sentences. " +
  "Keep their meaning and wording as much as possible; if the message is already clear, keep it almost unchanged. " +
  "Wrap hex colours, sizes and code values in backticks. Keep any UI text the designer quotes verbatim, in curly quotes. " +
  "Do not add questions, suggestions, decisions, values or details that are not in the message. " +
  "If the designer asks a question, keep it in the body as their question. Write in English.";

function client() {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}

function textOf(msg: Anthropic.Message) {
  return msg.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
}

/** Turn the designer's free-form message into { title, body }. Falls back to a heuristic. */
export async function rewriteNote(raw: string, ctx: { review: string; screen: string }): Promise<{ title: string; body: string }> {
  const message = raw.trim();
  const fallback = () => heuristicRewrite(message);
  const ai = client();
  if (!ai || !message) return fallback();
  try {
    const res = await ai.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: `${REWRITE_SYSTEM} Context: feature "${ctx.review}", screen "${ctx.screen}".`,
      messages: [{ role: "user", content: message }],
    });
    const m = textOf(res).match(/\{[\s\S]*\}/);
    if (!m) return fallback();
    const j = JSON.parse(m[0]) as { title?: unknown; body?: unknown };
    const title = typeof j.title === "string" ? j.title.trim() : "";
    const body = typeof j.body === "string" ? j.body.trim() : "";
    if (!title) return fallback();
    return { title, body };
  } catch (e) {
    console.error("rewriteNote failed, using fallback:", e);
    return fallback();
  }
}

/** Suggest a 1–3 word Title-case screen name from its notes. Returns "" if nothing usable. */
export async function nameScreen(input: {
  review: string;
  otherTitles: string[];
  notes: { title: string; raw: string; body: string }[];
}): Promise<string> {
  const notes = input.notes.filter((n) => n.title || n.raw);
  if (!notes.length) return "";
  const clean = (t: string) =>
    String(t || "")
      .replace(/^["'\s]+|["'.\s]+$/g, "")
      .split("\n")[0]
      .slice(0, 40);
  const fallback = () => clean(notes[0].title || "");
  const ai = client();
  if (!ai) return fallback();
  const list = notes.map((n) => `- ${n.title || n.raw}${n.body ? `: ${plain(n.body)}` : ""}`).join("\n");
  const prompt =
    `Name a product screen for a design QA review list. Feature: "${input.review}". ` +
    `Other screens already named: ${input.otherTitles.join(", ") || "none"}. ` +
    `Design-QA notes on this screen:\n${list}\n\n` +
    'Reply with only the screen name: 1-3 words, Title case, the part of the UI these notes are about (e.g. "Overview", "Tracking setup", "Invite modal"). ' +
    "Do not repeat the feature name. No quotes.";
  try {
    const res = await ai.messages.create({ model: MODEL, max_tokens: 30, messages: [{ role: "user", content: prompt }] });
    return clean(textOf(res)) || fallback();
  } catch (e) {
    console.error("nameScreen failed, using fallback:", e);
    return fallback();
  }
}
