-- Apply once to the chosen Supabase project. No existing tables are modified.
create table if not exists public.darts_game_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null check (length(game_id) between 1 and 100),
  mode text not null check (mode in ('01', 'cricket')),
  stats double precision not null check (stats >= 0 and stats <= case when mode = '01' then 180 else 9 end),
  won boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
alter table public.darts_game_results enable row level security;
revoke all on public.darts_game_results from anon, authenticated;
grant select, insert on public.darts_game_results to authenticated;
create policy "Read own darts results" on public.darts_game_results
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own darts results" on public.darts_game_results
  for insert to authenticated with check ((select auth.uid()) = user_id);
create index if not exists darts_game_results_recent_idx
  on public.darts_game_results (user_id, created_at desc);
