-- Incidencias: el administrador recibe el aviso de un cliente y se lo asigna a un tecnico.
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUES de SUPABASE_AUTH_ROLES.sql
-- (y de SUPABASE_PUSH.sql si ya lo usas: asi el tecnico recibe un aviso push al asignarle una incidencia).
-- Es seguro repetirlo.

create table if not exists public.incidencias (
  id text primary key,
  clienteid text,
  clientenombre text not null default '',
  telefono text not null default '',
  direccion text not null default '',
  lat double precision,
  lng double precision,
  descripcion text not null default '',
  prioridad text not null default 'normal' check (prioridad in ('normal', 'urgente')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'en_camino', 'resuelta')),
  empleadoid text,
  empleadonombre text not null default '',
  notatecnico text not null default '',
  createdby uuid references auth.users(id),
  resueltaat timestamptz,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

alter table public.incidencias enable row level security;
revoke all on public.incidencias from anon;
grant select, insert, update, delete on public.incidencias to authenticated;

drop policy if exists "admins full access" on public.incidencias;
drop policy if exists "technicians read assigned" on public.incidencias;
create policy "admins full access" on public.incidencias for all to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());
create policy "technicians read assigned" on public.incidencias for select to authenticated
  using (public.app_is_technician() and empleadoid is not null and empleadoid = public.app_employee_id());

-- El tecnico solo puede cambiar el estado y su nota, y solo de sus incidencias.
create or replace function public.update_incidencia_estado(p_id text, p_estado text, p_nota text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.app_is_technician() then
    raise exception 'Not allowed';
  end if;
  if p_estado not in ('aceptada', 'en_camino', 'resuelta') then
    raise exception 'Invalid state';
  end if;
  update public.incidencias
  set estado = p_estado,
      notatecnico = coalesce(p_nota, notatecnico),
      resueltaat = case when p_estado = 'resuelta' then now() else null end,
      updatedat = now()
  where id = p_id and empleadoid = public.app_employee_id();
  if not found then
    raise exception 'Incidencia no encontrada';
  end if;
end $$;
grant execute on function public.update_incidencia_estado(text, text, text) to authenticated;

-- Tiempo real para que las incidencias aparezcan al instante.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incidencias'
  ) then
    alter publication supabase_realtime add table public.incidencias;
  end if;
end $$;

-- Aviso push: al asignar (tecnico) y al cambiar de estado (administradores).
-- Necesita la funcion send-push y la tabla push_config de SUPABASE_PUSH.sql; si no existen, no hace nada.
create or replace function public.notify_incidencia_push()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  secret text;
  push_kind text;
begin
  if new.empleadoid is not null and (tg_op = 'INSERT' or old.empleadoid is distinct from new.empleadoid) then
    push_kind := 'incidencia_asignada';
  elsif tg_op = 'UPDATE' and old.estado is distinct from new.estado then
    push_kind := 'incidencia_estado';
  else
    return new;
  end if;
  select value into secret from public.push_config where key = 'webhook_secret';
  perform net.http_post(
    url := 'https://ziimllianelsocrdeeut.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
    body := jsonb_build_object(
      'kind', push_kind,
      'id', new.id,
      'empleadoid', new.empleadoid,
      'empleadonombre', new.empleadonombre,
      'cliente', new.clientenombre,
      'descripcion', left(new.descripcion, 90),
      'prioridad', new.prioridad,
      'estado', new.estado
    )
  );
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists push_incidencia on public.incidencias;
create trigger push_incidencia after insert or update on public.incidencias
  for each row execute function public.notify_incidencia_push();
