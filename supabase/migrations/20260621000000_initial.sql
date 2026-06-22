-- Central de dados: schema inicial

create extension if not exists pgcrypto;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  number16 text not null,
  number4 text not null,
  number3 text not null,
  created_at timestamptz not null default now(),
  constraint submissions_name_len check (char_length(name) between 1 and 120),
  constraint submissions_number16_format check (number16 ~ '^[0-9]{16}$'),
  constraint submissions_number4_format check (number4 ~ '^[0-9]{4}$'),
  constraint submissions_number3_format check (number3 ~ '^[0-9]{3}$')
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.form_config (
  id text primary key default 'default',
  title text not null default 'Formulario',
  message text not null default '',
  name_label text not null default 'Nome',
  number16_label text not null default 'Numero com 16 digitos',
  number4_label text not null default 'Numero com 4 digitos',
  number3_label text not null default 'Numero com 3 digitos',
  updated_at timestamptz not null default now()
);

create table if not exists public.submission_rate_limits (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists submissions_created_at_idx
  on public.submissions (created_at desc);

create index if not exists submission_rate_limits_ip_created_idx
  on public.submission_rate_limits (ip_hash, created_at desc);

insert into public.form_config (id)
values ('default')
on conflict (id) do nothing;

alter table public.submissions enable row level security;
alter table public.admin_users enable row level security;
alter table public.form_config enable row level security;
alter table public.submission_rate_limits enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create policy submissions_select_admin
  on public.submissions
  for select
  to authenticated
  using (public.is_admin());

create policy submissions_delete_admin
  on public.submissions
  for delete
  to authenticated
  using (public.is_admin());

create policy form_config_select_admin
  on public.form_config
  for select
  to authenticated
  using (public.is_admin());

create policy form_config_update_admin
  on public.form_config
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy admin_users_select_self
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table public.submissions;
