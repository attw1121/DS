-- DS personal storage. Run after inspecting the target project's existing tables.
create table public.ds_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id)
);
alter table public.ds_owner enable row level security;
revoke all on public.ds_owner from anon, authenticated;
grant select on public.ds_owner to authenticated;
create policy ds_owner_self on public.ds_owner for select to authenticated
  using (user_id = (select auth.uid()));

create table public.ds_projects (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 200),
  saved_at timestamptz not null default now(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'
    and payload ? 'formValues' and jsonb_typeof(payload->'formValues') = 'object'
    and payload ? 'calculation' and jsonb_typeof(payload->'calculation') = 'object'
    and octet_length(payload::text) <= 20971520)
);
alter table public.ds_projects enable row level security;
revoke all on public.ds_projects from anon, authenticated;
grant select, insert on public.ds_projects to authenticated;
grant usage on sequence public.ds_projects_id_seq to authenticated;
create policy ds_projects_owner on public.ds_projects for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from public.ds_owner where user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.ds_owner where user_id = (select auth.uid())));

create table public.ds_materials (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{1,64}$'),
  owner_id uuid not null references auth.users(id),
  kind text not null check (kind in ('frame','main','rail','brace','other')),
  size numeric,
  rise numeric,
  weight numeric not null check (weight > 0 and weight < 100000000 and weight = round(weight, 2)),
  spec text generated always as (case when kind = 'other' then code
    when kind = 'brace' then kind || ':' || trim_scale(size)::text || ':' || trim_scale(rise)::text
    else kind || ':' || trim_scale(size)::text end) stored unique,
  check (kind = 'other' or (size is not null and size > 0 and size < 1000)),
  check (kind <> 'brace' or (rise is not null and rise > 0 and rise < 1000))
);
alter table public.ds_materials enable row level security;
revoke all on public.ds_materials from anon, authenticated;
grant select, insert on public.ds_materials to authenticated;
grant update (weight) on public.ds_materials to authenticated;
create policy ds_materials_owner on public.ds_materials for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from public.ds_owner where user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.ds_owner where user_id = (select auth.uid())));

create function public.ds_save_materials(parts jsonb, adding boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare part jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.ds_owner where user_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if parts is null or jsonb_typeof(parts) <> 'array' then raise exception 'Expected parts array'; end if;
  if jsonb_array_length(parts) < 1 or jsonb_array_length(parts) > 10000 then raise exception 'Invalid parts count'; end if;
  for part in select value from jsonb_array_elements(parts) loop
    if adding then
      insert into public.ds_materials (code, owner_id, kind, size, rise, weight)
        values (part->>'code', auth.uid(), part->>'kind', (part->>'size')::numeric, (part->>'rise')::numeric, (part->>'weight')::numeric);
    else
      update public.ds_materials set weight = (part->>'weight')::numeric where code = part->>'code';
      if not found then raise exception 'Material not found'; end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.ds_save_materials(jsonb, boolean) from public, anon;
grant execute on function public.ds_save_materials(jsonb, boolean) to authenticated;
