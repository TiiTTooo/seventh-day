-- Seventh Day: códigos de convite para criar conta no painel e registro de lembretes
create table public.convites (
  equipe_id uuid primary key references public.equipe(id) on delete cascade,
  codigo text not null,
  expira timestamptz not null default now() + interval '7 days',
  criado timestamptz not null default now()
);
alter table public.convites enable row level security;
create policy convites_dono_ler on public.convites for select to authenticated using ((select public.e_dono()));
revoke all on public.convites from anon;

create or replace function public.gerar_convite(p_equipe uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare m public.equipe; v_cod text; v_exp timestamptz := now() + interval '7 days';
begin
  if not public.e_dono() then raise exception 'Só o dono pode gerar convites.'; end if;
  select * into m from public.equipe where id = p_equipe;
  if not found then raise exception 'Pessoa não encontrada.'; end if;
  if m.email is null then raise exception 'Cadastre o e-mail dessa pessoa antes de gerar o código.'; end if;
  if m.user_id is not null then raise exception 'Essa pessoa já tem acesso ao painel.'; end if;
  v_cod := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  insert into public.convites (equipe_id, codigo, expira) values (p_equipe, v_cod, v_exp)
  on conflict (equipe_id) do update set codigo = excluded.codigo, expira = excluded.expira, criado = now();
  return json_build_object('codigo', v_cod, 'expira', v_exp);
end $$;
revoke all on function public.gerar_convite(uuid) from public, anon;
grant execute on function public.gerar_convite(uuid) to authenticated;

-- Sem convite válido para aquele e-mail, a conta não é criada
create or replace function public.validar_cadastro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.equipe e join public.convites c on c.equipe_id = e.id
     where lower(e.email) = lower(new.email) and e.user_id is null and e.ativo
       and c.codigo = upper(btrim(coalesce(new.raw_user_meta_data->>'convite', '')))
       and c.expira > now()
  ) then
    raise exception 'convite_invalido';
  end if;
  return new;
end $$;
revoke execute on function public.validar_cadastro() from public, anon, authenticated;
create trigger antes_de_criar_usuario before insert on auth.users
  for each row execute function public.validar_cadastro();

-- A conta só é ligada à equipe depois de confirmar o e-mail; o código é queimado
drop trigger if exists ao_criar_usuario on auth.users;
create or replace function public.ligar_conta_equipe() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.equipe set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null
  returning id into v_id;
  if v_id is not null then delete from public.convites where equipe_id = v_id; end if;
  return new;
end $$;
revoke execute on function public.ligar_conta_equipe() from public, anon, authenticated;
create trigger ao_confirmar_usuario after insert or update of email_confirmed_at on auth.users
  for each row when (new.email_confirmed_at is not null) execute function public.ligar_conta_equipe();

create or replace function public.limpar_convite_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then delete from public.convites where equipe_id = new.id; end if;
  return new;
end $$;
revoke execute on function public.limpar_convite_email() from public, anon, authenticated;
create trigger equipe_email_mudou after update of email on public.equipe
  for each row execute function public.limpar_convite_email();

-- Marca quando o lembrete foi enviado ao cliente
alter table public.agendamentos add column lembrete_em timestamptz;
