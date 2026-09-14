-- Continuum passage intelligence v4.
-- Passages preserve their source and location. Embeddings are stored as JSON so
-- retrieval can begin without coupling the private memory schema to one model's
-- vector dimension.
begin;

alter table public.continuum_jobs drop constraint if exists continuum_jobs_kind_check;
alter table public.continuum_jobs add constraint continuum_jobs_kind_check check (kind in ('explore', 'semantic', 'embedding'));

create table if not exists public.continuum_passages (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id uuid not null,
  ordinal integer not null check (ordinal >= 0),
  body text not null check (length(btrim(body)) between 1 and 1600),
  char_start integer not null default 0 check (char_start >= 0),
  char_end integer not null default 0 check (char_end >= char_start),
  token_estimate integer not null default 0 check (token_estimate >= 0),
  embedding jsonb,
  embedding_model text,
  created double precision not null default extract(epoch from now()),
  updated double precision not null default extract(epoch from now()),
  foreign key (brain_id, owner_id) references public.continuum_brains(id, owner_id) on delete cascade,
  foreign key (source_id, brain_id) references public.continuum_sources(id, brain_id) on delete cascade,
  unique (source_id, ordinal)
);
create index if not exists continuum_passages_owner_brain on public.continuum_passages(owner_id, brain_id, source_id, ordinal);
create index if not exists continuum_passages_search on public.continuum_passages using gin (to_tsvector('simple', body));
alter table public.continuum_passages enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='continuum_passages' and policyname='continuum_passages_owner') then
    create policy continuum_passages_owner on public.continuum_passages to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
  end if;
end $$;
revoke all on public.continuum_passages from public, anon;
grant select, insert, update, delete on public.continuum_passages to authenticated;

create or replace function public.continuum_enqueue_research(p_brain uuid, p_source uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare b public.continuum_brains%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to use private research.'; end if;
  select * into b from public.continuum_brains where id=p_brain;
  if not found then raise exception 'Brain not found in this account.'; end if;
  if not exists(select 1 from public.continuum_sources where id=p_source and brain_id=b.id) then raise exception 'Source not found in this brain.'; end if;
  insert into public.continuum_jobs(brain_id, source_id, kind)
    values(b.id, p_source, 'explore'), (b.id, p_source, 'semantic'), (b.id, p_source, 'embedding')
    on conflict (brain_id, source_id, kind) do nothing;
  return jsonb_build_object('queued', true);
end;
$$;
revoke all on function public.continuum_enqueue_research(uuid, uuid) from public, anon;
grant execute on function public.continuum_enqueue_research(uuid, uuid) to authenticated;

insert into public.continuum_jobs (brain_id, owner_id, source_id, kind)
  select brain_id, owner_id, id, 'embedding' from public.continuum_sources
  on conflict (brain_id, source_id, kind) do nothing;

notify pgrst, 'reload schema';
commit;
