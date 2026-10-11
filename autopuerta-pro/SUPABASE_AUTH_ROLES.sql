-- Ejecutar una sola vez tras hacer una copia de seguridad.
-- Esta migración convierte Supabase en el control de acceso efectivo de la app.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null check (role in ('admin', 'technician')),
  employee_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_bootstrap_state (
  id boolean primary key default true check (id),
  consumed boolean not null default false,
  consumed_at timestamptz
);
insert into public.app_bootstrap_state (id, consumed)
values (true, false)
on conflict (id) do nothing;

alter table public.user_profiles enable row level security;
alter table public.app_bootstrap_state enable row level security;
revoke all on public.user_profiles, public.app_bootstrap_state from anon, authenticated;
grant select on public.user_profiles to authenticated;

create or replace function public.app_is_active_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

create or replace function public.app_is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid()) and p.is_active and p.role = 'admin'
  );
$$;

create or replace function public.app_is_technician()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid()) and p.is_active and p.role = 'technician'
  );
$$;

create or replace function public.app_employee_id()
returns text
language sql stable security definer
set search_path = ''
as $$
  select p.employee_id from public.user_profiles p
  where p.id = (select auth.uid()) and p.is_active and p.role = 'technician'
  limit 1;
$$;

create or replace function public.claim_initial_admin(
  p_user_id uuid,
  p_email text,
  p_full_name text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('valgom-initial-admin', 0));
  if exists (select 1 from public.user_profiles where role = 'admin' and is_active) then
    raise exception 'Bootstrap already completed';
  end if;
  update public.app_bootstrap_state
  set consumed = true, consumed_at = now()
  where id = true and consumed = false;
  if not found then
    raise exception 'Bootstrap already consumed';
  end if;
  insert into public.user_profiles (id, email, full_name, role, is_active)
  values (p_user_id, lower(p_email), p_full_name, 'admin', true);
end;
$$;
revoke all on function public.claim_initial_admin(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_initial_admin(uuid, text, text) to service_role;
grant execute on function public.app_is_active_user() to authenticated;
grant execute on function public.app_is_admin() to authenticated;
grant execute on function public.app_is_technician() to authenticated;
grant execute on function public.app_employee_id() to authenticated;

create or replace function public.get_my_employee()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('id', e.id, 'nombre', e.nombre)
  from public.empleados e
  where public.app_is_technician()
    and e.id::text = public.app_employee_id()
  limit 1;
$$;
revoke all on function public.get_my_employee() from public, anon;
grant execute on function public.get_my_employee() to authenticated;

drop policy if exists "users read own profile or admins read all" on public.user_profiles;
create policy "users read own profile or admins read all" on public.user_profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.app_is_admin());

-- Replace any old open policies. Every legacy business table becomes admin-only
-- unless explicitly opened to technicians further below.
do $$
declare
  t record;
  policy_row record;
  tbl regclass;
begin
  for t in
    select c.oid::regclass as relation, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname not in ('user_profiles', 'app_bootstrap_state')
      and c.relname = any(array[
        'clientes', 'presupuestos', 'vehiculos', 'almacen', 'tipos_puerta',
        'empleados', 'ubicaciones', 'informes', 'puertas', 'revisiones',
        'partesTrabajo', 'partes_trabajo', 'cadenas', 'rutas', 'articulos',
        'jornadas', 'tableros', 'tarjetas_tablero'
      ])
  loop
    execute format('alter table %s enable row level security', t.relation);
    for policy_row in
      select polname from pg_policy where polrelid = t.relation
    loop
      execute format('drop policy %I on %s', policy_row.polname, t.relation);
    end loop;
    execute format('revoke all on table %s from anon', t.relation);
    execute format('grant select, insert, update, delete on table %s to authenticated', t.relation);
    execute format(
      'create policy %I on %s for all to authenticated using (public.app_is_admin()) with check (public.app_is_admin())',
      'admins full access', t.relation
    );
  end loop;
end $$;

-- Reference data used by technician workflows. Technicians can read but never
-- modify clients, doors, routes, vehicles, types, or locations.
do $$
declare
  table_name text;
  tbl regclass;
begin
  foreach table_name in array array[
    'clientes', 'puertas', 'ubicaciones', 'tipos_puerta',
    'vehiculos', 'cadenas', 'rutas'
  ] loop
    tbl := to_regclass(format('public.%I', table_name));
    if tbl is not null then
      execute format(
        'create policy %I on %s for select to authenticated using (public.app_is_active_user())',
        'active technicians read reference data', tbl
      );
    end if;
  end loop;
end $$;

-- The application form uses the underscored table with employee, signature,
-- photo and location fields. Prefer it if both legacy tables exist.
do $$
declare
  parts_table regclass := coalesce(to_regclass('public.partes_trabajo'), to_regclass('public."partesTrabajo"'));
  parts_id_sequence text;
  c record;
  safe_columns text;
  employee_column text;
begin
  if parts_table is null then
    raise exception 'No se encontró la tabla de partes (partes_trabajo o partesTrabajo)';
  end if;
  execute format('alter table %s add column if not exists createdby uuid references auth.users(id)', parts_table);
  parts_id_sequence := pg_get_serial_sequence(parts_table::text, 'id');
  if parts_id_sequence is not null then
    execute format('grant usage, select on sequence %s to authenticated', parts_id_sequence);
  end if;
  execute format(
    'create policy %I on %s for select to authenticated using (public.app_is_active_user())',
    'active technicians read work parts', parts_table
  );
  select column_name into employee_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = (select relname from pg_class where oid = parts_table)
    and lower(column_name) = any(array['empleadoid', 'employee_id', 'empleado_id'])
  limit 1;
  if employee_column is null then
    execute format(
      'create policy %I on %s for insert to authenticated with check (public.app_is_technician() and createdby = (select auth.uid()))',
      'technicians create own work parts', parts_table
    );
    execute format(
      'create policy %I on %s for update to authenticated using (public.app_is_technician() and createdby = (select auth.uid())) with check (public.app_is_technician() and createdby = (select auth.uid()))',
      'technicians update own work parts', parts_table
    );
  else
    execute format(
      'create policy %I on %s for insert to authenticated with check (public.app_is_technician() and createdby = (select auth.uid()) and %I::text = public.app_employee_id())',
      'technicians create own work parts', parts_table, employee_column
    );
    execute format(
      'create policy %I on %s for update to authenticated using (public.app_is_technician() and createdby = (select auth.uid())) with check (public.app_is_technician() and createdby = (select auth.uid()) and %I::text = public.app_employee_id())',
      'technicians update own work parts', parts_table, employee_column
    );
  end if;
  execute format(
    'create policy %I on %s for delete to authenticated using (public.app_is_technician() and createdby = (select auth.uid()))',
    'technicians delete own work parts', parts_table
  );

  -- Column-level grants prevent direct reads of signatures, photos and DNI.
  execute format('revoke select on table %s from authenticated', parts_table);
  for c in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = (select relname from pg_class where oid = parts_table)
      and lower(column_name) = any(array[
        'clientedni', 'empleadodni', 'dnicliente', 'dnitecnico',
        'cliente_dni', 'empleado_dni', 'dni_cliente', 'dni_tecnico',
        'firmatecnico', 'firmacliente', 'firma_tecnico', 'firma_cliente',
        'fotos', 'photos', 'dni'
      ])
  loop
    execute format('revoke select (%I) on table %s from authenticated', c.column_name, parts_table);
  end loop;
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into safe_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = (select relname from pg_class where oid = parts_table)
    and lower(column_name) not in (
      'clientedni', 'empleadodni', 'dnicliente', 'dnitecnico',
      'cliente_dni', 'empleado_dni', 'dni_cliente', 'dni_tecnico',
      'firmatecnico', 'firmacliente', 'firma_tecnico', 'firma_cliente',
      'fotos', 'photos', 'dni'
    );
  if safe_columns is not null then
    execute format('grant select (%s) on table %s to authenticated', safe_columns, parts_table);
  end if;
end $$;

create or replace function public.get_app_work_parts(p_id text default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  parts_table regclass := coalesce(to_regclass('public.partes_trabajo'), to_regclass('public."partesTrabajo"'));
  result jsonb;
begin
  if not public.app_is_active_user() then
    raise exception 'Authentication required';
  end if;
  execute format(
    'select coalesce(jsonb_agg(
       case when public.app_is_admin() or row_data->>''createdby'' = auth.uid()::text
         then row_data
         else row_data - array[
           ''clientedni'', ''empleadodni'', ''dnicliente'', ''dnitecnico'',
           ''dniCliente'', ''dniTecnico'', ''clienteDni'', ''empleadoDni'',
           ''firmatecnico'', ''firmacliente'', ''firmaTecnico'', ''firmaCliente'',
           ''cliente_dni'', ''empleado_dni'', ''dni_cliente'', ''dni_tecnico'',
           ''firma_tecnico'', ''firma_cliente'', ''fotos'', ''Fotos'', ''FOTOS'', ''photos'',
           ''dni'', ''DNI''
         ]
       end order by row_data->>''fecha'' desc
     ), ''[]''::jsonb)
     from (select to_jsonb(p) as row_data from %s p where ($1 is null or p.id::text = $1)) rows',
    parts_table
  ) into result using p_id;
  return result;
end;
$$;
revoke all on function public.get_app_work_parts(text) from public, anon;
grant execute on function public.get_app_work_parts(text) to authenticated;

-- Requests contain article/quantity only; prices remain exclusively in budgets.
create table if not exists public.solicitudes_material (
  id text primary key,
  clienteid text not null,
  clientenombre text not null,
  descripcion text not null default '',
  articulos jsonb not null default '[]'::jsonb,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'convertida')),
  createdby uuid not null references auth.users(id),
  presupuestoid text,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);
alter table public.solicitudes_material enable row level security;
revoke all on public.solicitudes_material from anon;
grant select, insert, update, delete on public.solicitudes_material to authenticated;
drop policy if exists "admins full access" on public.solicitudes_material;
drop policy if exists "technicians read requests" on public.solicitudes_material;
drop policy if exists "technicians create own requests" on public.solicitudes_material;
drop policy if exists "technicians update own pending requests" on public.solicitudes_material;
drop policy if exists "technicians delete own pending requests" on public.solicitudes_material;
create policy "admins full access" on public.solicitudes_material for all to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());
create policy "technicians read requests" on public.solicitudes_material for select to authenticated
  using (public.app_is_technician());
create policy "technicians create own requests" on public.solicitudes_material for insert to authenticated
  with check (public.app_is_technician() and createdby = (select auth.uid()) and estado = 'pendiente');
create policy "technicians update own pending requests" on public.solicitudes_material for update to authenticated
  using (public.app_is_technician() and createdby = (select auth.uid()) and estado = 'pendiente')
  with check (public.app_is_technician() and createdby = (select auth.uid()) and estado = 'pendiente');
create policy "technicians delete own pending requests" on public.solicitudes_material for delete to authenticated
  using (public.app_is_technician() and createdby = (select auth.uid()) and estado = 'pendiente');

create or replace function public.sanitize_material_request_items()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  safe_items jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(new.articulos) is distinct from 'array' then
    raise exception 'Material items must be an array';
  end if;
  if jsonb_array_length(new.articulos) = 0 then
    raise exception 'At least one material item is required';
  end if;
  for item in select value from jsonb_array_elements(new.articulos)
  loop
    if nullif(item->>'nombre', '') is null
      or coalesce(item->>'cantidad', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Invalid material item';
    end if;
    safe_items := safe_items || jsonb_build_array(jsonb_build_object(
      'articuloId', item->'articuloId',
      'referencia', item->'referencia',
      'nombre', item->'nombre',
      'cantidad', (item->>'cantidad')::integer
    ));
  end loop;
  new.articulos := safe_items;
  if public.app_is_technician() then
    new.createdby := (select auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists sanitize_material_request_items on public.solicitudes_material;
create trigger sanitize_material_request_items
  before insert or update of articulos on public.solicitudes_material
  for each row execute function public.sanitize_material_request_items();

-- Technician-safe warehouse data. Admin rows include the full record; technical
-- sessions receive only identifier, reference, name and stock.
create or replace function public.get_app_warehouse()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.app_is_active_user() then
    raise exception 'Authentication required';
  end if;
  if public.app_is_admin() then
    select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into result from public.almacen a;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'referencia', a.referencia, 'nombre', a.nombre, 'stock', a.stock
    )), '[]'::jsonb) into result from public.almacen a;
  end if;
  return result;
end;
$$;
revoke all on function public.get_app_warehouse() from public, anon;
grant execute on function public.get_app_warehouse() to authenticated;
revoke select on table public.almacen from authenticated;

-- Revisions are readable by all active technicians; a technician can create
-- their own record, but only administrators can change/delete saved revisions.
do $$
declare tbl regclass := to_regclass('public.revisiones');
begin
  if tbl is not null then
    execute format('alter table %s add column if not exists createdby uuid references auth.users(id)', tbl);
    execute format('create policy %I on %s for select to authenticated using (public.app_is_active_user())',
      'active technicians read revisions', tbl);
    execute format('create policy %I on %s for insert to authenticated with check (public.app_is_technician() and createdby = (select auth.uid()))',
      'technicians create own revisions', tbl);
  end if;
end $$;

-- A narrow definer RPC updates only a door's last/next revision dates.
drop function if exists public.update_door_revision_schedule(text, date, date);
drop function if exists public.update_door_revision_schedule(text, date, date, text);
create or replace function public.update_door_revision_schedule(
  p_id text,
  p_last_revision date,
  p_state text default null
)
returns date
language plpgsql security definer
set search_path = ''
as $$
declare doors_table regclass := to_regclass('public.puertas');
  frequency_months integer := 6;
  next_revision date;
  updated_rows integer;
begin
  if not public.app_is_active_user() or not (public.app_is_admin() or public.app_is_technician()) then
    raise exception 'Not authorized';
  end if;
  if doors_table is null then raise exception 'Puertas table not found'; end if;
  if p_last_revision is null or p_last_revision > current_date then
    raise exception 'Invalid revision date';
  end if;
  if p_state is not null and p_state not in ('operativa', 'averiada', 'fuera_servicio') then
    raise exception 'Invalid door state';
  end if;
  if to_regclass('public.clientes') is not null
    and to_regclass('public.rutas') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'rutas'
        and column_name = 'frecuenciameses'
    ) then
    execute
      'select coalesce(nullif(r.frecuenciameses, 0), 6)
       from public.puertas d
       left join public.clientes c on c.id::text = d.clienteid::text
       left join public.rutas r on r.id::text = c.rutaid::text
       where d.id::text = $1'
      into frequency_months using p_id;
    frequency_months := coalesce(nullif(frequency_months, 0), 6);
  end if;
  next_revision := (p_last_revision + make_interval(months => frequency_months))::date;
  execute format(
    'update %s set ultimorevision = $1, proximarevision = $2, estado = coalesce($3, estado) where id::text = $4',
    doors_table
  ) using p_last_revision, next_revision, p_state, p_id;
  get diagnostics updated_rows = row_count;
  if updated_rows = 0 then raise exception 'Door not found'; end if;
  return next_revision;
end;
$$;
revoke all on function public.update_door_revision_schedule(text, date, text) from public, anon;
grant execute on function public.update_door_revision_schedule(text, date, text) to authenticated;

-- Profile changes trigger immediate refresh/sign-out through the realtime feed.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_profiles') then
      alter publication supabase_realtime add table public.user_profiles;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='solicitudes_material') then
      alter publication supabase_realtime add table public.solicitudes_material;
    end if;
  end if;
end $$;
