# Design Reviews

Internal OtterlyAI tool for design QA. A designer puts a production screenshot next to the design, draws numbered markers on it and writes notes; developers open the same page, read the notes and tick each one **Done** or **Later**. One database, one URL, shared status.

Built from the Claude Design handoff in [`docs/handoff/`](docs/handoff/README.md) — that README is the spec, and the prototype there is the visual source of truth.

## Stack

- **Next.js 16 (App Router) + TypeScript**, plain CSS (`app/globals.css` is the prototype's stylesheet, ported 1:1)
- **Supabase** — Postgres (`supabase/migrations/0001_init.sql`), Storage bucket `screens`, Auth (magic link / Google, restricted to `@otterly.ai`)
- **Anthropic API** — rewrites the designer's message into a title/body and auto-names screens (server-side only; falls back to a heuristic without a key)
- Deploys to **Vercel**

There is also a **local mode** with no backend at all (`DATA_SOURCE=local`): data lives in `.local-data/`, everyone is an editor. That's the fastest way to run it and the mode the visual QA was done in.

## Run it locally (no Supabase)

```bash
npm install
cp .env.example .env.local        # DATA_SOURCE=local is the default
npm run seed:local                # imports docs/handoff/data → .local-data/
npm run dev                       # http://localhost:3000
```

Set `LOCAL_ROLE=viewer` in `.env.local` to see the developer view. Add `ANTHROPIC_API_KEY` to get real AI rewrites instead of the first-sentence fallback.

## Hosted setup (Supabase + Vercel)

1. **Create a Supabase project.** Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`). It creates the tables, RLS policies, the public `screens` storage bucket and a trigger that refuses sign-ups outside `otterly.ai`.
2. **Auth providers.** In Supabase → Authentication, enable Email (magic link) and, optionally, Google. Add your Vercel URL and `http://localhost:3000` to the redirect allow-list (`/auth/callback`).
3. **Env vars** (`.env.local` locally, Project Settings → Environment Variables on Vercel):
   ```
   DATA_SOURCE=supabase
   NEXT_PUBLIC_SUPABASE_URL=…
   NEXT_PUBLIC_SUPABASE_ANON_KEY=…
   SUPABASE_SERVICE_ROLE_KEY=…      # only needed locally, for the seed script
   ANTHROPIC_API_KEY=…
   ALLOWED_EMAIL_DOMAINS=otterly.ai
   ```
4. **Seed the content** from the handoff (2 reviews, 11 screens, 27 notes, all images):
   ```bash
   npm run seed
   ```
   Safe to re-run; it upserts by id and never touches Done/Later status.
5. **Make yourself an editor.** Sign in once, then in the SQL editor:
   ```sql
   update public.profiles set role = 'editor' where email = 'you@otterly.ai';
   ```
   Everyone else is a viewer by default (can read and tick Done/Later, can't edit content).
6. **Deploy** — import the repo in Vercel, add the env vars, deploy. No build settings needed.

## How it's organised

```
app/
  r/[review]/[screen]/page.tsx   the one real page (view + edit mode)
  actions.ts                     server actions: all mutations, role-checked
  login/, auth/                  Supabase sign-in flow
  api/local-image/               serves images in local mode
components/
  ReviewApp.tsx                  client root: optimistic state, edit mode, paste, navigation
  Sidebar.tsx                    review dropdown + screen list
  ScreenView.tsx / ScreenEdit.tsx
  Shot.tsx                       screenshot card, markers, drag-to-draw
  NoteBody.tsx                   inline code, extracted links, question
lib/
  data/store.ts                  the Store interface
  data/local.ts, data/supabase.ts
  ai.ts                          Claude prompts (ported verbatim from the prototype)
  text.ts                        formatting helpers shared with the seed
supabase/migrations/             schema, RLS, storage bucket
scripts/seed.ts                  imports docs/handoff/data
docs/handoff/                    the original Claude Design handoff (spec, prototype, data, screenshots)
```

### Data model

`reviews` → `screens` → `notes`, plus `note_status` (one row per note: `done` | `later`, who, when). Marker boxes are stored as `% of the production image` (`{x,y,w,h}`). Note numbers are the note's `position` within its screen (0-based in the DB, shown as +1) and are renumbered on delete. URLs are `/r/<review>/<screen>` with the ids from the seed (`workspaces`, `billing`, `smvq…`).

### Roles

| | Editor (designer) | Viewer (developer) |
|---|---|---|
| Read everything | ✓ | ✓ |
| Done / Later | ✓ | ✓ |
| Create / edit / delete reviews, screens, notes, images | ✓ | – |

Enforced twice: in `app/actions.ts` and by Postgres RLS.

## Known gaps vs. the prototype

- The prototype's **"Export for sharing"** button (a static HTML snapshot) is gone — the hosted URL replaces it.
- Dropping an **image URL** onto a drop zone isn't supported (files, paste and click are); the prototype fetched the URL client-side, which doesn't survive CORS in production.
