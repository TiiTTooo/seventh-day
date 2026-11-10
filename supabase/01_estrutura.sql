-- Seventh Day: estrutura do banco (tabelas, papéis e regras de acesso)
-- Rode em um projeto Supabase novo, na ordem 01, 02, 03 (SQL Editor ou MCP apply_migration).

create table public.config (
  id int primary key default 1 check (id = 1),
  nome text not null default 'Seventh Day',
  nome_completo text not null default 'Seventh Day Barbearia e Cabeleireiros',
  whatsapp text, whatsapp_txt text, telefone text, instagram text,
  endereco text, maps_query text,
  intervalo int not null default 30 check (intervalo between 5 and 120),
  antecedencia int not null default 30 check (antecedencia between 0 and 1440),
  dias_abertos int not null default 14 check (dias_abertos between 1 and 90),
  horarios jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.equipe (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(nome) between 1 and 80),
  descricao text,
  foto_url text,
  email text unique,
  user_id uuid unique references auth.users(id) on delete set null,
  papel text not null default 'profissional' check (papel in ('dono','profissional')),
  ativo boolean not null default true,
  atende boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  nome text not null check (length(nome) between 1 and 120),
  duracao int not null check (duracao between 5 and 600),
  preco numeric(10,2) not null check (preco >= 0),
  obs text,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table public.galeria (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  path text,
  legenda text,
  secao text not null default 'trabalhos' check (secao in ('trabalhos','fachada')),
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  inicio int not null check (inicio between 0 and 1439),
  duracao int not null check (duracao between 5 and 900),
  profissional_id uuid not null references public.equipe(id),
  servicos jsonb not null default '[]'::jsonb,
  cliente_nome text not null check (length(cliente_nome) between 2 and 80),
  cliente_tel text check (cliente_tel ~ '^[0-9]{10,11}$'),
  total numeric(10,2) not null default 0,
  status text not null default 'confirmado' check (status in ('confirmado','concluido','faltou','cancelado')),
  origem text not null default 'site' check (origem in ('site','balcao')),
  created_at timestamptz not null default now()
);
create index agendamentos_data_idx on public.agendamentos (data, profissional_id);

create table public.bloqueios (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  inicio int not null check (inicio between 0 and 1439),
  fim int not null check (fim between 1 and 1440),
  profissional_id uuid references public.equipe(id) on delete cascade, -- null = salão todo
  motivo text,
  created_at timestamptz not null default now(),
  check (fim > inicio)
);
create index bloqueios_data_idx on public.bloqueios (data);

-- Papéis
create or replace function public.meu_membro() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.equipe where user_id = (select auth.uid()) and ativo limit 1
$$;
create or replace function public.e_equipe() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.equipe where user_id = (select auth.uid()) and ativo)
$$;
create or replace function public.e_dono() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.equipe where user_id = (select auth.uid()) and ativo and papel = 'dono')
$$;
revoke execute on function public.e_dono() from public, anon;
revoke execute on function public.e_equipe() from public, anon;
revoke execute on function public.meu_membro() from public, anon;
grant execute on function public.e_dono() to authenticated;
grant execute on function public.e_equipe() to authenticated;
grant execute on function public.meu_membro() to authenticated;

-- Conta criada com e-mail da equipe é ligada automaticamente ao membro
create or replace function public.ligar_conta_equipe() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.equipe set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;
  return new;
end $$;
revoke execute on function public.ligar_conta_equipe() from public, anon, authenticated;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.ligar_conta_equipe();

-- RLS
alter table public.config enable row level security;
alter table public.equipe enable row level security;
alter table public.servicos enable row level security;
alter table public.galeria enable row level security;
alter table public.agendamentos enable row level security;
alter table public.bloqueios enable row level security;

create policy config_ler on public.config for select using (true);
create policy config_editar on public.config for update to authenticated using ((select public.e_dono())) with check ((select public.e_dono()));

create policy equipe_ler on public.equipe for select using (true);
create policy equipe_inserir on public.equipe for insert to authenticated with check ((select public.e_dono()));
create policy equipe_editar on public.equipe for update to authenticated using ((select public.e_dono())) with check ((select public.e_dono()));
create policy equipe_apagar on public.equipe for delete to authenticated using ((select public.e_dono()));
revoke select on public.equipe from anon; -- visitantes não veem e-mail nem conta
grant select (id, nome, descricao, foto_url, papel, ativo, atende, ordem) on public.equipe to anon;

create policy servicos_ler on public.servicos for select using (true);
create policy servicos_inserir on public.servicos for insert to authenticated with check ((select public.e_dono()));
create policy servicos_editar on public.servicos for update to authenticated using ((select public.e_dono())) with check ((select public.e_dono()));
create policy servicos_apagar on public.servicos for delete to authenticated using ((select public.e_dono()));

create policy galeria_ler on public.galeria for select using (true);
create policy galeria_inserir on public.galeria for insert to authenticated with check ((select public.e_dono()));
create policy galeria_editar on public.galeria for update to authenticated using ((select public.e_dono())) with check ((select public.e_dono()));
create policy galeria_apagar on public.galeria for delete to authenticated using ((select public.e_dono()));

-- dono vê e mexe em tudo; profissional só na própria agenda; visitante só pela função criar_agendamento
create policy agend_ler on public.agendamentos for select to authenticated
  using ((select public.e_dono()) or profissional_id = (select public.meu_membro()));
create policy agend_inserir on public.agendamentos for insert to authenticated
  with check ((select public.e_dono()) or profissional_id = (select public.meu_membro()));
create policy agend_editar on public.agendamentos for update to authenticated
  using ((select public.e_dono()) or profissional_id = (select public.meu_membro()))
  with check ((select public.e_dono()) or profissional_id = (select public.meu_membro()));
create policy agend_apagar on public.agendamentos for delete to authenticated using ((select public.e_dono()));

create policy bloq_ler on public.bloqueios for select to authenticated using ((select public.e_equipe()));
create policy bloq_inserir on public.bloqueios for insert to authenticated
  with check ((select public.e_dono()) or profissional_id = (select public.meu_membro()));
create policy bloq_apagar on public.bloqueios for delete to authenticated
  using ((select public.e_dono()) or profissional_id = (select public.meu_membro()));

revoke all on public.agendamentos from anon;
revoke all on public.bloqueios from anon;
