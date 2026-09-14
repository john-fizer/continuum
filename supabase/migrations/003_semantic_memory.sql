-- Continuum semantic memory foundation v3.
-- Concept and relationship records remain evidence-backed. This migration does
-- not claim that lexical co-occurrence establishes causation or truth.
begin;

alter table public.continuum_jobs drop constraint if exists continuum_jobs_kind_check;
alter table public.continuum_jobs add constraint continuum_jobs_kind_check check (kind in ('explore', 'semantic'));

create table if not exists public.continuum_concepts (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 160),
  normalized_label text not null check (length(btrim(normalized_label)) between 1 and 160),
  mention_count integer not null default 0 check (mention_count >= 0),
  activation_strength double precision not null default 0 check (activation_strength between 0 and 1),
  created double precision not null default extract(epoch from now()),
  updated double precision not null default extract(epoch from now()),
  foreign key (brain_id, owner_id) references public.continuum_brains(id, owner_id) on delete cascade,
  unique (id, brain_id),
  unique (brain_id, normalized_label)
);

create table if not exists public.continuum_concept_evidence (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  concept_id uuid not null,
  source_id uuid not null,
  mentions integer not null default 1 check (mentions > 0),
  excerpt text not null default '' check (length(excerpt) <= 1200),
  created double precision not null default extract(epoch from now()),
  foreign key (brain_id, owner_id) references public.continuum_brains(id, owner_id) on delete cascade,
  foreign key (concept_id, brain_id) references public.continuum_concepts(id, brain_id) on delete cascade,
  foreign key (source_id, brain_id) references public.continuum_sources(id, brain_id) on delete cascade,
  unique (concept_id, source_id)
);

create table if not exists public.continuum_relationships (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  concept_a uuid not null,
  concept_b uuid not null,
  relationship_type text not null default 'co_occurs' check (relationship_type in ('co_occurs', 'semantic_similarity', 'supports', 'contradicts', 'hypothesis')),
  confidence double precision not null default 0 check (confidence between 0 and 1),
  source_count integer not null default 0 check (source_count >= 0),
  recency double precision not null default extract(epoch from now()),
  contradiction_score double precision not null default 0 check (contradiction_score between 0 and 1),
  activation_strength double precision not null default 0 check (activation_strength between 0 and 1),
  created double precision not null default extract(epoch from now()),
  updated double precision not null default extract(epoch from now()),
  foreign key (brain_id, owner_id) references public.continuum_brains(id, owner_id) on delete cascade,
  foreign key (concept_a, brain_id) references public.continuum_concepts(id, brain_id) on delete cascade,
  foreign key (concept_b, brain_id) references public.continuum_concepts(id, brain_id) on delete cascade,
  check (concept_a < concept_b),
  unique (brain_id, concept_a, concept_b, relationship_type)
);

create index if not exists continuum_concepts_owner_brain on public.continuum_concepts(owner_id, brain_id, updated desc);
create index if not exists continuum_concept_evidence_source on public.continuum_concept_evidence(brain_id, source_id);
create index if not exists continuum_relationships_owner_brain on public.continuum_relationships(owner_id, brain_id, confidence desc, updated desc);

alter table public.continuum_concepts enable row level security;
alter table public.continuum_concept_evidence enable row level security;
alter table public.continuum_relationships enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='continuum_concepts' and policyname='continuum_concepts_owner') then
    create policy continuum_concepts_owner on public.continuum_concepts to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='continuum_concept_evidence' and policyname='continuum_concept_evidence_owner') then
    create policy continuum_concept_evidence_owner on public.continuum_concept_evidence to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='continuum_relationships' and policyname='continuum_relationships_owner') then
    create policy continuum_relationships_owner on public.continuum_relationships to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
  end if;
end $$;
revoke all on public.continuum_concepts, public.continuum_concept_evidence, public.continuum_relationships from public, anon;
grant select, insert, update, delete on public.continuum_concepts, public.continuum_concept_evidence, public.continuum_relationships to authenticated;

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
    'experiments', '[]'::jsonb,
    'state', case when exists(select 1 from public.continuum_jobs j where j.brain_id=b.id and j.status in ('queued','running')) then 'Researching evidence' else 'Listening for new knowledge' end,
    'pending', (select count(*) from public.continuum_jobs j where j.brain_id=b.id and j.status in ('queued','running')),
    'worker_connected', true,
    'model_connected', true,
    'engine', 'Cloud semantic memory worker'
  ) into result;
  return result;
end;
$$;
revoke all on function public.continuum_research_snapshot(uuid) from public, anon;
grant execute on function public.continuum_research_snapshot(uuid) to authenticated;

-- Existing private sources receive one semantic indexing pass. New imports are
-- also indexed by the existing worker path.
insert into public.continuum_jobs (brain_id, owner_id, source_id, kind)
  select brain_id, owner_id, id, 'semantic' from public.continuum_sources
  on conflict (brain_id, source_id, kind) do nothing;

notify pgrst, 'reload schema';
commit;
