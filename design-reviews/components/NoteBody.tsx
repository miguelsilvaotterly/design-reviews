import { bodyWithoutLinks, noteLinks, segments, type Segment } from "@/lib/text";

export function Rich({ text }: { text: string }) {
  return (
    <>
      {segments(text).map((s: Segment, i) =>
        s.type === "code" ? <code key={i}>{s.value}</code> : s.type === "br" ? <br key={i} /> : <span key={i}>{s.value}</span>,
      )}
    </>
  );
}

/** Body paragraph + extracted links + optional question, as in the prototype. */
export function NoteBody({ raw, body, question }: { raw: string; body: string; question: string | null }) {
  const text = bodyWithoutLinks(body);
  const links = noteLinks(raw, body);
  return (
    <>
      {text && (
        <p>
          <Rich text={text} />
        </p>
      )}
      {links.length > 0 && (
        <p className="nlinks">
          {links.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer">
              Link{links.length > 1 ? ` ${i + 1}` : ""}
            </a>
          ))}
        </p>
      )}
      {question && (
        <p className="ask">
          Question: <Rich text={question} />
        </p>
      )}
    </>
  );
}
