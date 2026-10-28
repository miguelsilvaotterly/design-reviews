-- Design Reviews — per-user screen visits ("new since your last visit")
create table if not exists public.screen_visits (
  user_id      uuid not null references auth.users (id) on delete cascade,
  screen_id    text not null references public.screens (id) on delete cascade,
  seen_at      timestamptz not null default now(),   -- this visit
  prev_seen_at timestamptz,                          -- the visit before it; notes newer than this are "new"
  primary key (user_id, screen_id)
);

alter table public.screen_visits enable row level security;

drop policy if exists "visits: own rows" on public.screen_visits;
create policy "visits: own rows" on public.screen_visits for all
  using (user_id = auth.uid() and public.is_member())
  with check (user_id = auth.uid() and public.is_member());

-- Designers who should be editors as soon as they first sign in.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.email_allowed(new.email) then
    raise exception 'Sign-in is restricted to %', array_to_string(public.allowed_email_domains(), ', ');
  end if;
  insert into public.profiles (id, email, role)
  values (new.id, lower(new.email), case when lower(new.email) in ('miguel.silva@otterly.ai') then 'editor' else 'viewer' end)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
