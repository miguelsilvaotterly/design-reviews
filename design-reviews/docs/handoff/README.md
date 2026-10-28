# Handoff: Design Reviews (design QA tool)

## Overview
An internal web app where a product designer reviews implemented screens against the design and leaves numbered, annotated notes for developers. Developers open the same app, read the notes, and mark each one **Done** or **Later**.

Today it is a single-file prototype that stores everything in the designer's browser (IndexedDB + localStorage). The goal of this handoff is to turn it into a **hosted, shared app**: one database, one URL, the designer edits, devs view and tick.

## About the design files
`prototype/Design Reviews.html` is a **working HTML prototype** (vanilla JS, no build). It shows the intended look and behaviour exactly. Recreate it in a proper stack rather than shipping the HTML as-is. No codebase exists yet — recommended stack:

- **Next.js (App Router) + TypeScript**, deployed on **Vercel**
- **Supabase**: Postgres for data, Storage for images, Auth (magic link / Google, restricted to `@otterly.ai`)
- Plain CSS modules or Tailwind; the UI is small and hand-styled — no component library needed

## Fidelity
**High-fidelity.** Colours, type, spacing and interactions in the prototype are final. Match them.

## Roles
- **Editor** (designers): create reviews and screens, upload images, draw markers, write notes, delete.
- **Viewer** (developers): read everything, toggle Done / Later per note. Cannot edit content.
Done/Later status must be **shared** (stored server-side, not per browser), and should record who changed it and when.

## Information architecture
- **Review** (e.g. “Workspaces”, “Billing”) — a group of screens. Picked from a dropdown at the top of the sidebar. “+ New review” at the bottom of that dropdown.
- **Screen** (e.g. “Overview”, “Billing plans”) — listed under “Screens” in the sidebar with a `done/total` count. “+ New screen” button below the list.
- **Note** — belongs to a screen. Optional marker box on the production screenshot.

## Layout
- App grid: `240px` sidebar + fluid main. Sidebar is sticky, full height, white, right hairline `#e6e6e6`, padding `24px 12px`.
- Sidebar top: “OtterlyAI” (14px/600, -0.015em) and “Design reviews” (12px, `#737373`). Then the review dropdown (bordered button showing the review name + chevron; menu lists reviews with `done/total`). Then the “Screens” section label (11px/500 uppercase, `#a3a3a3`, 0.04em).
- Screen items: height `32px`, radius 4px, 13px `#404040`; active = bg `#fdecf4`, text `#E40072`, weight 500; complete count turns `#10B981`. On hover the count is replaced (same position, no height change) by a trash icon (Heroicons outline) → confirm → delete screen.
- Main: `max-width:1280px`, padding `18px 32px 64px`. Header row: screen title (24px/600, -0.03em, line-height 29px — vertically aligned with “OtterlyAI”) on the left; on the right `date · X of N done · Y later` (13px `#737373`, tabular nums) and an **Edit** button (editors only).
- Board: grid `minmax(0,1fr) 340px`, gap 32px; collapses to one column under 1100px; sidebar stacks on top under 760px.
  - Left column: “Production” label → screenshot card (white, 1px `#e6e6e6`, radius 8px) with markers. 24px below: “Design” label with “Open in Figma ↗” link (pink, 12px/500) on the right → design image card. In view mode, a missing image hides its whole block (label included).
  - Right column: “Notes” label → numbered list.

## Markers
- Box: `position:absolute`, coordinates stored as **% of the production image** (`x, y, w, h`), 1.5px solid `#E40072`, radius 3px, fill `rgba(228,0,114,.06)`.
- Pin: 22px pink circle, white 11px/700 number, 2px white ring, placed **30px to the left of the box, vertically centred** (so it never covers the content).
- Done → green `#10B981` box + pin. Later → dashed `#a3a3a3` box, grey pin.

## Notes list
Each row: `22px | 1fr | auto` grid, 16px vertical padding, hairline separators.
- Number circle (pink; outlined grey for notes without a marker).
- Title 14px/600, body 13px/1.5 `#404040`. Values in backticks render as inline `code` (mono 12px, white bg, hairline border). Any URL in the note is removed from the text and shown below as a pink **“Link”** (or “Link 1”, “Link 2”).
- Right: two 24px icon buttons with dark tooltips: **Do later** (clock) and **Mark as done** (check). Mutually exclusive; clicking the active one clears it.
- Done: number green, title struck through `#a3a3a3`, body `#a3a3a3`, check button filled green.
- Later: number grey `#a3a3a3`, text `#737373`, clock button filled `#737373`, small “Later” tag.

## Edit mode (editors)
- Title becomes an inline input (placeholder “Screen name…”).
- Empty image slots become dashed drop zones: click to pick, drag & drop, or paste (⌘V fills Production first, then Design). “Replace” link under existing images. Figma link input under the design image.
- **Draw a marker**: drag on the production screenshot (crosshair). Releasing creates a new note and focuses its message box. Boxes smaller than 0.8% are ignored.
- **Note without marker**: “+ Add note without marker” dashed button under the list.
- **Message box**: the designer writes one free-form message (no separate title/body fields). Enter saves (Shift+Enter = newline), blur also saves. While processing show “Writing the note…”.
- **AI rewrite** (server-side call to Claude): turns the message into `{ title, body }`. Rules: title ≤ 7 words, sentence case, no period; body = the designer’s own message lightly cleaned for grammar/clarity, 1–2 sentences, keep wording; wrap hex/sizes/code values in backticks; keep quoted UI text verbatim; **never add questions, suggestions, values or details not in the message**. Keep the raw message stored so “Edit” under a note reopens it. Fallback when the call fails: first sentence = title, rest = body.
- **Auto-naming screens**: when a screen has no title and gets its first note, ask Claude for a 1–3 word Title-case screen name based on the notes, avoiding names already used in the same review and not repeating the review name. Sidebar shows “Naming…” meanwhile, “New screen” if nothing yet. Never overwrite a title the designer typed.
- Notes have a × delete. “Delete this screen” text button (red `#E11D48`) at the bottom of the notes column.
- Empty screens (no title, images or notes) are discarded when you navigate away.

## Data model (suggested)
```
reviews   id, name, position, created_at
screens   id, review_id, title, date, figma_url, production_path, design_path, position, created_at
notes     id, screen_id, position, raw, title, body, question?, box jsonb {x,y,w,h} | null
note_status  note_id, status ('done'|'later'), user_id, updated_at
```
Images go in Supabase Storage (`screens/<id>/production.png`, `design.png`). Note numbers are the note’s position within its screen (1-based) — renumber on delete.

URLs: `/r/<review>/<screen>` so a specific screen can be linked.

## Design tokens
- Primary `#E40072`, hover `#c80064`/`#b0005a`, tint `#fdecf4`
- Ink `#0a0a0a`, secondary `#404040`, tertiary `#737373`, quaternary `#a3a3a3`, light `#d4d4d4`
- Lines `#e6e6e6`, canvas `#fafafa`, surface `#fff`
- Success `#10B981` (tint `#ecfdf5`), error `#E11D48`
- Font: Inter 400/500/600/700; tabular numerals for counts
- Radius: buttons 2px, controls 4px, cards 8px, markers 3px
- Shadow: only the dropdown menu, `0 8px 24px rgba(0,0,0,.08)`
- Icons: Heroicons 24 outline (check, clock, trash, arrow-top-right-on-square, chevron-up-down)

## Existing content (seed data)
`data/reviews.json` holds everything the designer has created so far: 2 reviews (Workspaces, Billing), 11 screens, 27 notes, with Figma links and marker coordinates. `data/images/` holds every production and design image referenced by it. Write a seed script that inserts reviews → screens → notes in `order` and uploads the images to Storage. Record shape:
```
{ id, order, feature /* review name */, title, date, figma, production, design,
  notes: [{ raw?, title, body, question?, box?: {x,y,w,h} }] }
```
`body` may contain `<code>` tags (older notes) or backtick values (newer notes); render both as inline code. Images were captured at ~3× display size from the designer's browser.

## Screenshots
`screenshots/` shows the prototype with real content, for visual reference:
- `01`–`11` — every screen in view mode, in sidebar order
- `state-edit-mode.png` — editor view (inline title, Replace links, Figma input, delete buttons, “+ Add note without marker”)
- `state-review-menu.png` — review dropdown open

## Files
- `prototype/Design Reviews.html` — full prototype (UI, edit mode, AI calls via `window.claude.complete`, IndexedDB storage). Open it locally to click through; it loads the one seed screen from `reviews-data.js`.
- `prototype/reviews-data.js`, `prototype/qa/` — prototype seed.
- `data/reviews.json`, `data/images/` — the real content to import.
- `screenshots/` — reference renders.

## Suggested first prompt for Claude Code
> Read README.md. Build this as a Next.js + Supabase app per the spec, match the screenshots, then write and run a seed script that imports data/reviews.json and data/images/. Deploy to Vercel.
