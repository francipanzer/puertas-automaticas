-- Ejecuta este script una vez en Supabase > SQL Editor.
-- Esta aplicación utiliza el cliente anon sin inicio de sesión; por coherencia
-- con las demás tablas, cualquier usuario con acceso a la app comparte estos datos.

create table if not exists public.tableros (
  id text primary key,
  nombre text not null,
  descripcion text not null default '',
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create table if not exists public.tarjetas_tablero (
  id text primary key,
  boardid text not null references public.tableros(id) on delete cascade,
  titulo text not null,
  descripcion text not null default '',
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_progreso', 'revisado', 'hecho')),
  orden integer not null default 0,
  prioridad text not null default ''
    check (prioridad in ('', 'alta', 'media', 'baja')),
  clienteid text,
  asignadoid text,
  fechalimite date,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create index if not exists tarjetas_tablero_boardid_estado_orden_idx
  on public.tarjetas_tablero (boardid, estado, orden);

alter table public.tableros enable row level security;
alter table public.tarjetas_tablero enable row level security;

drop policy if exists "Tableros accesibles desde la app" on public.tableros;
create policy "Tableros accesibles desde la app" on public.tableros
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "Tarjetas accesibles desde la app" on public.tarjetas_tablero;
create policy "Tarjetas accesibles desde la app" on public.tarjetas_tablero
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.tableros to anon, authenticated;
grant select, insert, update, delete on public.tarjetas_tablero to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tableros'
  ) then
    alter publication supabase_realtime add table public.tableros;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tarjetas_tablero'
  ) then
    alter publication supabase_realtime add table public.tarjetas_tablero;
  end if;
end $$;
