-- Create or upgrade the per-user game history table.
create table if not exists public.darts_game_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null check (length(game_id) between 1 and 100),
  mode text not null check (mode in ('01', 'cricket', 'count-up')),
  stats double precision not null check (stats >= 0 and stats <= case when mode = 'cricket' then 9 else 180 end),
  stats_100 double precision check (stats_100 is null or (stats_100 >= 0 and stats_100 <= case when mode = 'cricket' then 9 else 180 end)),
  score integer check (score is null or score >= 0),
  won boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
alter table public.darts_game_results add column if not exists stats_100 double precision;
alter table public.darts_game_results add column if not exists score integer;
alter table public.darts_game_results drop constraint if exists darts_game_results_mode_check;
alter table public.darts_game_results add constraint darts_game_results_mode_check check (mode in ('01', 'cricket', 'count-up'));
alter table public.darts_game_results drop constraint if exists darts_game_results_check;
alter table public.darts_game_results add constraint darts_game_results_check check (stats >= 0 and stats <= case when mode = 'cricket' then 9 else 180 end);
alter table public.darts_game_results drop constraint if exists darts_game_results_stats_100_check;
alter table public.darts_game_results add constraint darts_game_results_stats_100_check check (stats_100 is null or (stats_100 >= 0 and stats_100 <= case when mode = 'cricket' then 9 else 180 end));
alter table public.darts_game_results drop constraint if exists darts_game_results_score_check;
alter table public.darts_game_results add constraint darts_game_results_score_check check (score is null or score >= 0);
alter table public.darts_game_results enable row level security;
revoke all on public.darts_game_results from anon, authenticated;
grant select, insert on public.darts_game_results to authenticated;
create policy "Read own darts results" on public.darts_game_results
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own darts results" on public.darts_game_results
  for insert to authenticated with check ((select auth.uid()) = user_id);
create index if not exists darts_game_results_recent_idx
  on public.darts_game_results (user_id, created_at desc);
