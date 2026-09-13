-- Continuum cloud research queue v2. Run after 001_cloud_memory.sql.
begin;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'continuum_sources_id_brain_key') then
    alter table public.continuum_sources add constraint continuum_sources_id_brain_key unique (id, brain_id);
  end if;
end $$;

create table if not exists public.continuum_jobs (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('explore')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  source_id uuid not null,
  result text not null default '',
  created double precision not null default extract(epoch from now()),
  finished double precision,
  foreign key (brain_id, owner_id) references public.continuum_brains(id, owner_id) on delete cascade,
  foreign key (source_id, brain_id) references public.continuum_sources(id, brain_id) on delete cascade,
  unique (brain_id, source_id, kind)
);

create table if not exists public.continuum_links (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_a uuid not null,
  source_b uuid not null,
  terms jsonb not null check (jsonb_typeof(terms) = 'array'),
  similarity double precision not null check (similarity >= 0 and similarity <= 1),
  status text not null default 'candidate' check (status in ('candidate', 'accepted', 'dismissed')),
  note text not null,
  created double precision not null default extract(epoch from now()),
  foreign key (brain_id, owner_id) references public.continuum_brains(id, owner_id) on delete cascade,
  foreign key (source_a, brain_id) references public.continuum_sources(id, brain_id) on delete cascade,
  foreign key (source_b, brain_id) references public.continuum_sources(id, brain_id) on delete cascade,
  check (source_a < source_b),
  unique (brain_id, source_a, source_b)
);
create index if not exists continuum_jobs_queue on public.continuum_jobs(status, created);
create index if not exists continuum_jobs_owner_brain on public.continuum_jobs(owner_id, brain_id, created);
create index if not exists continuum_links_owner_brain on public.continuum_links(owner_id, brain_id, created);

alter table public.continuum_jobs enable row level security;
alter table public.continuum_links enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='continuum_jobs' and policyname='continuum_jobs_owner') then
    create policy continuum_jobs_owner on public.continuum_jobs to authenticated
      using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='continuum_links' and policyname='continuum_links_owner') then
    create policy continuum_links_owner on public.continuum_links to authenticated
      using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
  end if;
end $$;
revoke all on public.continuum_jobs, public.continuum_links from public, anon;
grant select, insert, update (status) on public.continuum_jobs, public.continuum_links to authenticated;

-- This function is only callable by the signed-in owner. It queues work; it never
-- bypasses RLS or treats a generated association as verified truth.
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
    'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.created desc, j.id) from public.continuum_jobs j where j.brain_id=b.id), '[]'::jsonb),
    'experiments', '[]'::jsonb,
    'state', case when exists(select 1 from public.continuum_jobs j where j.brain_id=b.id and j.status in ('queued','running')) then 'Researching evidence' else 'Listening for new knowledge' end,
    'pending', (select count(*) from public.continuum_jobs j where j.brain_id=b.id and j.status in ('queued','running')),
    'worker_connected', true,
    'model_connected', false,
    'engine', 'Cloud evidence worker'
  ) into result;
  return result;
end;
$$;
revoke all on function public.continuum_research_snapshot(uuid) from public, anon;
grant execute on function public.continuum_research_snapshot(uuid) to authenticated;

create or replace function public.continuum_enqueue_research(p_brain uuid, p_source uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare b public.continuum_brains%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to use private research.'; end if;
  select * into b from public.continuum_brains where id=p_brain;
  if not found then raise exception 'Brain not found in this account.'; end if;
  if not exists(select 1 from public.continuum_sources where id=p_source and brain_id=b.id) then raise exception 'Source not found in this brain.'; end if;
  insert into public.continuum_jobs(brain_id, source_id, kind)
    values(b.id, p_source, 'explore') on conflict (brain_id, source_id, kind) do nothing;
  return jsonb_build_object('queued', true);
end;
$$;
revoke all on function public.continuum_enqueue_research(uuid, uuid) from public, anon;
grant execute on function public.continuum_enqueue_research(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
