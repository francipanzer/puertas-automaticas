-- Contadores de "novedades" para administradores (partes y solicitudes/presupuestos).
-- Ejecutar una vez DESPUÉS de SUPABASE_AUTH_ROLES.sql. Es seguro repetirlo.

-- Fecha de creación de los partes (si la tabla ya la tiene, no cambia nada).
do $$
declare
  parts_table regclass := coalesce(to_regclass('public.partes_trabajo'), to_regclass('public."partesTrabajo"'));
begin
  if parts_table is null then
    raise exception 'No se encontró la tabla de partes (partes_trabajo o partesTrabajo)';
  end if;
  execute format('alter table %s add column if not exists createdat timestamptz default now()', parts_table);
end $$;

-- Última vez que cada administrador vio cada sección. Solo se accede por las funciones de abajo.
create table if not exists public.admin_seen (
  user_id uuid not null references auth.users(id) on delete cascade,
  section text not null check (section in ('partes', 'presupuestos')),
  seen_at timestamptz not null default now(),
  primary key (user_id, section)
);
alter table public.admin_seen enable row level security;
revoke all on public.admin_seen from anon, authenticated;

create or replace function public.get_admin_unseen_counts()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  parts_table regclass := coalesce(to_regclass('public.partes_trabajo'), to_regclass('public."partesTrabajo"'));
  seen_parts timestamptz;
  seen_budgets timestamptz;
  new_parts integer;
  new_requests integer;
begin
  if not public.app_is_admin() then
    raise exception 'Admin required';
  end if;
  -- La primera vez parte de cero: lo anterior no cuenta como novedad.
  insert into public.admin_seen (user_id, section)
  values (me, 'partes'), (me, 'presupuestos')
  on conflict do nothing;
  select seen_at into seen_parts from public.admin_seen where user_id = me and section = 'partes';
  select seen_at into seen_budgets from public.admin_seen where user_id = me and section = 'presupuestos';

  execute format(
    'select count(*) from %s p
     where p.createdat > $1
       and p.createdby in (select id from public.user_profiles where role = ''technician'')',
    parts_table
  ) into new_parts using seen_parts;

  select count(*) into new_requests
  from public.solicitudes_material s
  where s.createdat > seen_budgets
    and s.createdby in (select id from public.user_profiles where role = 'technician');

  return jsonb_build_object('partes', new_parts, 'presupuestos', new_requests);
end;
$$;
revoke all on function public.get_admin_unseen_counts() from public, anon;
grant execute on function public.get_admin_unseen_counts() to authenticated;

create or replace function public.mark_admin_seen(p_section text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin required';
  end if;
  if p_section not in ('partes', 'presupuestos') then
    raise exception 'Invalid section';
  end if;
  insert into public.admin_seen (user_id, section, seen_at)
  values ((select auth.uid()), p_section, now())
  on conflict (user_id, section) do update set seen_at = excluded.seen_at;
end;
$$;
revoke all on function public.mark_admin_seen(text) from public, anon;
grant execute on function public.mark_admin_seen(text) to authenticated;

-- Aviso en tiempo real también cuando se crea un parte.
do $$
declare
  parts_table regclass := coalesce(to_regclass('public.partes_trabajo'), to_regclass('public."partesTrabajo"'));
  parts_name text;
begin
  select relname into parts_name from pg_class where oid = parts_table;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = parts_name
    ) then
    execute format('alter publication supabase_realtime add table %s', parts_table);
  end if;
end $$;
