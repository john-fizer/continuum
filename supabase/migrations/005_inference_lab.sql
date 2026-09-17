-- Continuum inference lab v5. Experiments are private, reproducible records.
begin;

create table if not exists public.continuum_experiments (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  target text not null check (length(btrim(target)) between 1 and 160),
  dataset text not null check (length(dataset) <= 200000),
  report jsonb not null,
  created double precision not null default extract(epoch from now()),
  foreign key (brain_id, owner_id) references public.continuum_brains(id, owner_id) on delete cascade
);
create index if not exists continuum_experiments_owner_brain on public.continuum_experiments(owner_id, brain_id, created desc);
alter table public.continuum_experiments enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='continuum_experiments' and policyname='continuum_experiments_owner') then
    create policy continuum_experiments_owner on public.continuum_experiments to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
  end if;
end $$;
revoke all on public.continuum_experiments from public, anon;
grant select, insert, update, delete on public.continuum_experiments to authenticated;

create or replace function public.continuum_research_snapshot(p_brain uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare b public.continuum_brains%rowtype; result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to open your private memory.'; end if;
  select * into b from public.continuum_brains where id = p_brain;
  if not found then raise exception 'Brain not found in this account.'; end if;
  select jsonb_build_object(
    'brain', to_jsonb(b),
    'sources', coalesce((select jsonb_agg(to_jsonb(s) order by s.created desc, s.id) from public.continuum_sources s where s.brain_id=b.id), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(to_jsonb(l) order by l.created desc, l.id) from public.continuum_links l where l.brain_id=b.id), '[]'::jsonb),
    'concepts', coalesce((select jsonb_agg(to_jsonb(c) order by c.activation_strength desc, c.mention_count desc, c.label) from public.continuum_concepts c where c.brain_id=b.id), '[]'::jsonb),
    'relationships', coalesce((select jsonb_agg(to_jsonb(r) order by r.activation_strength desc, r.confidence desc, r.updated desc) from public.continuum_relationships r where r.brain_id=b.id), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.created desc, j.id) from public.continuum_jobs j where j.brain_id=b.id), '[]'::jsonb),
    'experiments', coalesce((select jsonb_agg(to_jsonb(e) order by e.created desc) from public.continuum_experiments e where e.brain_id=b.id), '[]'::jsonb),
    'state', case when exists(select 1 from public.continuum_jobs j where j.brain_id=b.id and j.status in ('queued','running')) then 'Researching evidence' else 'Listening for new knowledge' end,
    'pending', (select count(*) from public.continuum_jobs j where j.brain_id=b.id and j.status in ('queued','running')),
    'worker_connected', true, 'model_connected', true, 'engine', 'Cloud semantic memory worker'
  ) into result;
  return result;
end;
$$;
revoke all on function public.continuum_research_snapshot(uuid) from public, anon;
grant execute on function public.continuum_research_snapshot(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
