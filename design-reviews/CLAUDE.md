# CLAUDE.md

Internal OtterlyAI design-QA tool ("Design Reviews"). Next.js 16 App Router + TypeScript, Supabase, Anthropic API. See `README.md` for setup and `docs/handoff/README.md` for the original spec.

## Source of truth

- **Spec:** `docs/handoff/README.md` (layout, tokens, behaviour, data model). High-fidelity — colours, type, spacing and interactions are final.
- **Look & feel:** `docs/handoff/prototype/Design Reviews.html` and `docs/handoff/screenshots/`. `app/globals.css` is that prototype's CSS ported 1:1; keep class names and values aligned with it rather than restyling.
- **Content:** `docs/handoff/data/reviews.json` + `data/images/` — imported by `scripts/seed.ts`. Don't edit the handoff files; they're the import source.

## Conventions

- All mutations go through server actions in `app/actions.ts`, which check the role (`editor()` / `member()`). The DB enforces the same rules with RLS — keep both in sync when adding a capability.
- `lib/data/store.ts` is the backend interface. Two implementations: `local.ts` (file-based, dev) and `supabase.ts`. A new feature usually touches both.
- UI state lives in `components/ReviewApp.tsx` (optimistic updates, re-synced from server props). Note message boxes keep their own draft so background refreshes don't clobber typing.
- AI prompts in `lib/ai.ts` are verbatim from the prototype. Change them only deliberately; the rewrite must never add details the designer didn't write.
- Marker boxes are `%` of the production image. Note numbers = `position + 1`, renumbered on delete.
- Marker boxes with `w: 0, h: 0` are pins (`isPin()` in `lib/types.ts`). Element ids `marker-<noteId>` / `note-<noteId>` are what linking, keyboard jumps and backlog deep links rely on.
- "New since last visit" comes from `screen_visits.prev_seen_at` (migration 0002); `markSeen` runs on every screen view before `listReviews`.
- `ReviewApp` wraps mutations in `track()` so a stale server snapshot never overwrites optimistic state mid-flight. Use it for any new mutation.
- `extension/` is plain MV3 JavaScript (no build). It talks to `app/api/capture/route.ts` with the app's session cookie.
- No component library, no Tailwind. Plain CSS, Heroicons outline inlined in `components/icons.tsx`.

## Commands

```bash
npm run dev            # local mode by default (DATA_SOURCE=local)
npm run seed:local     # import handoff data into .local-data/
npm run seed           # import into Supabase (needs service role key)
npm run typecheck
npm run build
```

## Verifying UI changes

Run in local mode after `npm run seed:local`, open `/r/workspaces/workspaces`, and compare with `docs/handoff/screenshots/01-workspaces-overview.png` and `state-edit-mode.png`. Set `LOCAL_ROLE=viewer` to check the developer view.
