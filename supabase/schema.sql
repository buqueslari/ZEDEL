-- Delivery do Z Express - schema de produção para Supabase.
-- O site acessa estas tabelas via backend (/api/*) usando service_role no servidor.
-- Não exponha SUPABASE_SERVICE_ROLE_KEY no navegador.

create table if not exists public.delivery_products (
  id bigint primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_categories (
  id bigint primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_settings (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.delivery_products enable row level security;
alter table public.delivery_categories enable row level security;
alter table public.delivery_settings enable row level security;

-- Sem policies públicas: anon/authenticated não leem nem escrevem direto.
-- O backend usa service_role, que bypassa RLS, e aplica as regras do painel.

create index if not exists delivery_products_data_category_idx
on public.delivery_products ((data ->> 'category'));

create index if not exists delivery_products_updated_at_idx
on public.delivery_products (updated_at desc);

create index if not exists delivery_categories_updated_at_idx
on public.delivery_categories (updated_at desc);

insert into public.delivery_settings (id, data)
values ('default', '{"settings": {}, "updatedAt": null}'::jsonb)
on conflict (id) do nothing;
