-- Design Reviews — initial schema
-- Apply with: supabase db push   (or paste into the SQL editor of your project)

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  role        text not null default 'viewer' check (role in ('editor', 'viewer')),
  created_at  timestamptz not null default now()
);

-- Email domains allowed to sign in. Edit here (and ALLOWED_EMAIL_DOMAINS in .env).
create or replace function public.allowed_email_domains()
returns text[] language sql immutable as $$
  select array['otterly.ai']
$$;

create or replace function public.email_allowed(p_email text)
returns boolean language sql immutable as $$
  select lower(split_part(coalesce(p_email, ''), '@', 2)) = any (public.allowed_email_domains())
$$;

-- Create a profile for every new auth user; reject other domains outright.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.email_allowed(new.email) then
    raise exception 'Sign-in is restricted to %', array_to_string(public.allowed_email_domains(), ', ');
  end if;
  insert into public.profiles (id, email) values (new.id, lower(new.email))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_editor()
returns boolean language sql stable as $$
  select public.current_role_name() = 'editor'
$$;

create or replace function public.is_member()
returns boolean language sql stable as $$
  select auth.uid() is not null and public.email_allowed(auth.jwt() ->> 'email')
$$;

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id          text primary key,                 -- slug, used in URLs (/r/<review>/<screen>)
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.screens (
  id               text primary key,
  review_id        text not null references public.reviews (id) on delete cascade,
  title            text not null default '',
  date             text not null,               -- display string, e.g. "Oct 27, 2026"
  figma_url        text not null default '',
  production_path  text,                        -- storage path inside bucket "screens"
  design_path      text,
  position         integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists screens_review_idx on public.screens (review_id, position);

create table if not exists public.notes (
  id          text primary key,
  screen_id   text not null references public.screens (id) on delete cascade,
  position    integer not null default 0,       -- 0-based; shown as position + 1
  raw         text not null default '',         -- designer's original message
  title       text not null default '',
  body        text not null default '',
  question    text,
  box         jsonb,                             -- {x,y,w,h} as % of the production image, or null
  created_at  timestamptz not null default now()
);
create index if not exists notes_screen_idx on public.notes (screen_id, position);

create table if not exists public.note_status (
  note_id     text primary key references public.notes (id) on delete cascade,
  status      text not null check (status in ('done', 'later')),
  user_id     uuid references auth.users (id) on delete set null,
  user_email  text,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.reviews     enable row level security;
alter table public.screens     enable row level security;
alter table public.notes       enable row level security;
alter table public.note_status enable row level security;

drop policy if exists "profiles: members read"  on public.profiles;
create policy "profiles: members read" on public.profiles for select using (public.is_member());

drop policy if exists "reviews: members read"   on public.reviews;
drop policy if exists "reviews: editors write"  on public.reviews;
create policy "reviews: members read"  on public.reviews for select using (public.is_member());
create policy "reviews: editors write" on public.reviews for all
  using (public.is_editor()) with check (public.is_editor());

drop policy if exists "screens: members read"   on public.screens;
drop policy if exists "screens: editors write"  on public.screens;
create policy "screens: members read"  on public.screens for select using (public.is_member());
create policy "screens: editors write" on public.screens for all
  using (public.is_editor()) with check (public.is_editor());

drop policy if exists "notes: members read"     on public.notes;
drop policy if exists "notes: editors write"    on public.notes;
create policy "notes: members read"  on public.notes for select using (public.is_member());
create policy "notes: editors write" on public.notes for all
  using (public.is_editor()) with check (public.is_editor());

-- Any member (developers included) can set Done / Later.
drop policy if exists "status: members read"    on public.note_status;
drop policy if exists "status: members write"   on public.note_status;
create policy "status: members read"  on public.note_status for select using (public.is_member());
create policy "status: members write" on public.note_status for all
  using (public.is_member()) with check (public.is_member());

-- ---------------------------------------------------------------------------
-- Storage: bucket "screens" (public read, editors write)
-- Paths: screens/<screen_id>/production.<ext>, screens/<screen_id>/design.<ext>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screens', 'screens', true, 26214400, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "screens bucket: public read"   on storage.objects;
drop policy if exists "screens bucket: editors write" on storage.objects;
create policy "screens bucket: public read" on storage.objects for select
  using (bucket_id = 'screens');
create policy "screens bucket: editors write" on storage.objects for all
  using (bucket_id = 'screens' and public.is_editor())
  with check (bucket_id = 'screens' and public.is_editor());

-- ---------------------------------------------------------------------------
-- Make someone an editor (run manually after they have signed in once):
--   update public.profiles set role = 'editor' where email = 'miguel.silva@otterly.ai';
-- ---------------------------------------------------------------------------
