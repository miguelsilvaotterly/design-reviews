import "server-only";

/** Parse a Figma design/file URL into { fileKey, nodeId } (nodeId in "12:34" form). */
export function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)figma\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/(?:design|file|board|proto)\/([A-Za-z0-9]+)(?:\/branch\/([A-Za-z0-9]+))?/);
    if (!m) return null;
    const fileKey = m[2] ?? m[1];
    const raw = u.searchParams.get("node-id");
    if (!raw) return null;
    return { fileKey, nodeId: raw.replace(/-/g, ":") };
  } catch {
    return null;
  }
}

/** Render a Figma node to PNG via the Images API. Returns null when no token is configured. */
export async function fetchFigmaFrame(url: string, scale = 2): Promise<{ bytes: Buffer; contentType: string } | null> {
  const token = process.env.FIGMA_TOKEN;
  if (!token) return null;
  const ref = parseFigmaUrl(url);
  if (!ref) throw new Error("That doesn't look like a Figma frame link (it needs a node-id).");
  const api = `https://api.figma.com/v1/images/${ref.fileKey}?ids=${encodeURIComponent(ref.nodeId)}&format=png&scale=${scale}`;
  const res = await fetch(api, { headers: { "X-Figma-Token": token }, cache: "no-store" });
  if (!res.ok) throw new Error(`Figma API ${res.status}: ${res.status === 403 ? "no access to this file" : await res.text()}`);
  const json = (await res.json()) as { err?: string | null; images?: Record<string, string | null> };
  if (json.err) throw new Error(`Figma: ${json.err}`);
  const imageUrl = json.images?.[ref.nodeId];
  if (!imageUrl) throw new Error("Figma returned no image for that node.");
  const img = await fetch(imageUrl, { cache: "no-store" });
  if (!img.ok) throw new Error(`Could not download the Figma render (${img.status}).`);
  return { bytes: Buffer.from(await img.arrayBuffer()), contentType: "image/png" };
}
