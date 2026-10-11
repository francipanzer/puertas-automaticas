-- Notificaciones push para administradores (nuevo parte o solicitud de un tecnico).
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUES de SUPABASE_NOTIFICACIONES.sql.
-- ANTES de ejecutar: sustituye CAMBIA_ESTE_SECRETO por una clave larga inventada
-- y usa EXACTAMENTE la misma en el secreto PUSH_WEBHOOK_SECRET de la funcion send-push.
-- No subas a GitHub este archivo con tu clave real escrita.

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create table if not exists public.push_config (
  key text primary key,
  value text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

insert into public.push_config (key, value)
values ('webhook_secret', 'CAMBIA_ESTE_SECRETO')
on conflict (key) do update set value = excluded.value;

-- Registrar / quitar la suscripcion del dispositivo del usuario actual.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.app_is_active_user() then
    raise exception 'Not allowed';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, (select auth.uid()), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language sql security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- Trigger: avisa a la funcion send-push cuando un TECNICO crea un parte o una solicitud.
create or replace function public.notify_admins_push()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  secret text;
  creator uuid := new.createdby;
begin
  if creator is null or not exists (
    select 1 from public.user_profiles where id = creator and role = 'technician'
  ) then
    return new;
  end if;
  select value into secret from public.push_config where key = 'webhook_secret';
  perform net.http_post(
    url := 'https://ziimllianelsocrdeeut.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
    body := jsonb_build_object('kind', tg_argv[0], 'id', new.id::text, 'createdby', creator::text)
  );
  return new;
exception when others then
  return new; -- un fallo de aviso nunca debe impedir guardar el parte
end $$;

do $$
declare
  parts_table regclass := coalesce(to_regclass('public.partes_trabajo'), to_regclass('public."partesTrabajo"'));
begin
  execute format('drop trigger if exists push_new_parte on %s', parts_table);
  execute format('create trigger push_new_parte after insert on %s for each row execute function public.notify_admins_push(%L)', parts_table, 'parte');
end $$;

drop trigger if exists push_new_solicitud on public.solicitudes_material;
create trigger push_new_solicitud after insert on public.solicitudes_material
  for each row execute function public.notify_admins_push('solicitud');
