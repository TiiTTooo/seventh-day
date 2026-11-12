-- 08: base do agente de WhatsApp (conversas, mensagens, agenda pelo telefone)

-- Agendamentos vindos do WhatsApp e marcação de teste
alter table public.agendamentos drop constraint agendamentos_origem_check;
alter table public.agendamentos add constraint agendamentos_origem_check check (origem in ('site','balcao','whatsapp'));
alter table public.agendamentos add column teste boolean not null default false;

-- Núcleo do agendamento (sem o limite por IP), usado pelo site e pelo agente
create or replace function public.agendamento_interno(p_data date, p_inicio int, p_profissional uuid, p_servicos uuid[], p_nome text, p_tel text, p_origem text, p_teste boolean default false)
returns json language plpgsql security definer set search_path = '' as $$
declare
  cfg public.config;
  agora timestamp := (now() at time zone 'America/Sao_Paulo');
  hoje date := agora::date;
  min_agora int := extract(hour from agora)::int * 60 + extract(minute from agora)::int;
  h jsonb; abre int; fecha int;
  v_dur int; v_total numeric; v_itens jsonb; v_qtd int;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_tel text := regexp_replace(coalesce(p_tel, ''), '\D', '', 'g');
  v_cli uuid; v_id uuid;
begin
  if p_origem not in ('site','whatsapp') then raise exception 'Origem inválida.'; end if;
  select * into cfg from public.config where id = 1;
  if length(v_nome) < 2 or length(v_nome) > 80 then raise exception 'Digite seu nome.'; end if;
  if length(v_tel) not between 10 and 11 then raise exception 'Digite o WhatsApp com DDD.'; end if;
  if p_servicos is null or array_length(p_servicos, 1) is null or array_length(p_servicos, 1) > 6 then raise exception 'Escolha de 1 a 6 serviços.'; end if;
  if not exists (select 1 from public.equipe where id = p_profissional and ativo and atende) then raise exception 'Profissional indisponível.'; end if;

  select sum(duracao), sum(preco), jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'preco', preco, 'duracao', duracao)), count(*)
    into v_dur, v_total, v_itens, v_qtd
    from public.servicos where id = any(p_servicos) and ativo;
  if v_qtd <> (select count(distinct x) from unnest(p_servicos) x) then raise exception 'Algum serviço não está mais disponível.'; end if;

  if p_data < hoje or p_data > hoje + cfg.dias_abertos then raise exception 'Data fora do período de agendamento.'; end if;
  h := cfg.horarios -> extract(dow from p_data)::int::text;
  if h is null or jsonb_typeof(h) <> 'array' then raise exception 'O salão não abre neste dia.'; end if;
  begin
    abre := split_part(h->>0, ':', 1)::int * 60 + split_part(h->>0, ':', 2)::int;
    fecha := split_part(h->>1, ':', 1)::int * 60 + split_part(h->>1, ':', 2)::int;
  exception when others then abre := null; fecha := null;
  end;
  if abre is null or fecha is null or fecha <= abre then raise exception 'O salão não abre neste dia.'; end if;
  if p_inicio < abre or p_inicio + v_dur > fecha then raise exception 'Horário fora do funcionamento.'; end if;
  if cfg.intervalo > 0 and (p_inicio - abre) % cfg.intervalo <> 0 then raise exception 'Horário inválido. Escolha um dos horários da lista.'; end if;
  if p_data = hoje and p_inicio < min_agora + cfg.antecedencia then raise exception 'Esse horário já passou. Escolha outro.'; end if;

  if (select count(*) from public.agendamentos where origem in ('site','whatsapp') and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Muitos agendamentos agora. Tente em alguns minutos ou chame o salão no WhatsApp.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_profissional::text || p_data::text));
  if exists (select 1 from public.agendamentos a where a.data = p_data and a.profissional_id = p_profissional and a.status <> 'cancelado'
               and p_inicio < a.inicio + a.duracao and p_inicio + v_dur > a.inicio)
     or exists (select 1 from public.bloqueios b where b.data = p_data and (b.profissional_id = p_profissional or b.profissional_id is null)
               and p_inicio < b.fim and p_inicio + v_dur > b.inicio) then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro.';
  end if;
  if (select count(*) from public.agendamentos where cliente_tel = v_tel and status = 'confirmado' and data >= hoje) >= 3 then
    raise exception 'Este número já tem 3 horários marcados. Fale com o salão pelo WhatsApp.';
  end if;

  if p_origem = 'whatsapp' and not p_teste then
    select user_id into v_cli from public.clientes where whatsapp = v_tel limit 1;
  end if;

  insert into public.agendamentos (data, inicio, duracao, profissional_id, servicos, cliente_nome, cliente_tel, total, origem, teste, cliente_id)
  values (p_data, p_inicio, v_dur, p_profissional, v_itens, v_nome, v_tel, v_total, p_origem, coalesce(p_teste, false), v_cli)
  returning id into v_id;
  return json_build_object('id', v_id, 'duracao', v_dur, 'total', v_total);
end $$;
revoke all on function public.agendamento_interno(date, int, uuid, uuid[], text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.agendamento_interno(date, int, uuid, uuid[], text, text, text, boolean) to service_role;

-- O site continua igual: limite por IP + núcleo
create or replace function public.criar_agendamento(p_data date, p_inicio integer, p_profissional uuid, p_servicos uuid[], p_nome text, p_tel text)
returns json language plpgsql security definer set search_path = '' as $$
begin
  perform public.checar_limite_ip('agendamento', 5, 20);
  return public.agendamento_interno(p_data, p_inicio, p_profissional, p_servicos, p_nome, p_tel, 'site', false);
end $$;

-- Horários livres calculados no servidor (mesmas regras do site)
create or replace function public.agente_horarios_livres(p_data date, p_servicos uuid[], p_profissional uuid default null)
returns table(profissional_id uuid, profissional text, inicio int, hora text)
language plpgsql stable security definer set search_path = '' as $$
declare
  cfg public.config;
  agora timestamp := (now() at time zone 'America/Sao_Paulo');
  min_agora int := extract(hour from agora)::int * 60 + extract(minute from agora)::int;
  h jsonb; abre int; fecha int; v_dur int; t int; p record;
begin
  select * into cfg from public.config where id = 1;
  if p_data < agora::date or p_data > agora::date + cfg.dias_abertos then return; end if;
  select sum(duracao) into v_dur from public.servicos where id = any(p_servicos) and ativo;
  if v_dur is null then return; end if;
  h := cfg.horarios -> extract(dow from p_data)::int::text;
  if h is null or jsonb_typeof(h) <> 'array' then return; end if;
  begin
    abre := split_part(h->>0, ':', 1)::int * 60 + split_part(h->>0, ':', 2)::int;
    fecha := split_part(h->>1, ':', 1)::int * 60 + split_part(h->>1, ':', 2)::int;
  exception when others then return;
  end;
  for p in select e.id, e.nome from public.equipe e where e.ativo and e.atende and (p_profissional is null or e.id = p_profissional) order by e.ordem loop
    t := abre;
    while t + v_dur <= fecha loop
      if not (p_data = agora::date and t < min_agora + cfg.antecedencia)
         and not exists (select 1 from public.agendamentos a where a.data = p_data and a.profissional_id = p.id and a.status <> 'cancelado' and t < a.inicio + a.duracao and t + v_dur > a.inicio)
         and not exists (select 1 from public.bloqueios b where b.data = p_data and (b.profissional_id = p.id or b.profissional_id is null) and t < b.fim and t + v_dur > b.inicio) then
        profissional_id := p.id; profissional := p.nome; inicio := t; hora := lpad((t / 60)::text, 2, '0') || ':' || lpad((t % 60)::text, 2, '0');
        return next;
      end if;
      t := t + greatest(cfg.intervalo, 5);
    end loop;
  end loop;
end $$;
revoke all on function public.agente_horarios_livres(date, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.agente_horarios_livres(date, uuid[], uuid) to service_role;

-- Próximos horários de um número
create or replace function public.agente_meus_agendamentos(p_tel text)
returns table(id uuid, data date, hora text, profissional text, servicos text, total numeric)
language sql stable security definer set search_path = '' as $$
  select a.id, a.data, lpad((a.inicio / 60)::text, 2, '0') || ':' || lpad((a.inicio % 60)::text, 2, '0'),
         e.nome, (select string_agg(s->>'nome', ' + ') from jsonb_array_elements(a.servicos) s), a.total
    from public.agendamentos a left join public.equipe e on e.id = a.profissional_id
   where a.cliente_tel = regexp_replace(coalesce(p_tel, ''), '\D', '', 'g') and a.status = 'confirmado'
     and a.data >= (now() at time zone 'America/Sao_Paulo')::date
   order by a.data, a.inicio
$$;
revoke all on function public.agente_meus_agendamentos(text) from public, anon, authenticated;
grant execute on function public.agente_meus_agendamentos(text) to service_role;

-- Cancelar só horário do próprio número, com 2 h de antecedência
create or replace function public.agente_cancelar(p_tel text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.agendamentos; agora timestamp := (now() at time zone 'America/Sao_Paulo');
begin
  select * into a from public.agendamentos where id = p_id and cliente_tel = regexp_replace(coalesce(p_tel, ''), '\D', '', 'g');
  if not found then raise exception 'Agendamento não encontrado para este número.'; end if;
  if a.status <> 'confirmado' then raise exception 'Este horário não está mais ativo.'; end if;
  if (a.data + make_interval(mins => a.inicio)) < agora + interval '2 hours' then
    raise exception 'Faltam menos de 2 horas. Para cancelar agora, fale com a equipe.';
  end if;
  update public.agendamentos set status = 'cancelado' where id = p_id;
end $$;
revoke all on function public.agente_cancelar(text, uuid) from public, anon, authenticated;
grant execute on function public.agente_cancelar(text, uuid) to service_role;

-- Conversas e mensagens do agente
create table public.conversas (
  id uuid primary key default gen_random_uuid(),
  canal text not null check (canal in ('simulador','whatsapp')),
  telefone text not null check (telefone ~ '^[0-9]{10,13}$'),
  nome text check (length(nome) <= 80),
  humano_ate timestamptz,
  motivo_humano text check (length(motivo_humano) <= 300),
  ultima_msg timestamptz not null default now(),
  criado timestamptz not null default now(),
  unique (canal, telefone)
);
create table public.mensagens (
  id bigint generated always as identity primary key,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  papel text not null check (papel in ('cliente','agente','equipe')),
  texto text not null check (length(texto) <= 4000),
  dados jsonb,
  criado timestamptz not null default now()
);
create index mensagens_conversa_idx on public.mensagens (conversa_id, criado);
alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;
create policy conversas_dono_ler on public.conversas for select to authenticated using ((select public.e_dono()));
create policy conversas_dono_editar on public.conversas for update to authenticated using ((select public.e_dono())) with check ((select public.e_dono()));
create policy conversas_dono_apagar on public.conversas for delete to authenticated using ((select public.e_dono()));
create policy mensagens_dono_ler on public.mensagens for select to authenticated using ((select public.e_dono()));
revoke all on public.conversas, public.mensagens from anon;
revoke insert, truncate, references, trigger on public.conversas, public.mensagens from authenticated;

-- Limpeza dos testes do simulador (só o dono)
create or replace function public.limpar_testes_agente() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.e_dono() then raise exception 'Só o dono pode limpar os testes.'; end if;
  delete from public.agendamentos where teste;
  get diagnostics n = row_count;
  delete from public.conversas where canal = 'simulador';
  return n;
end $$;
revoke all on function public.limpar_testes_agente() from public, anon;
grant execute on function public.limpar_testes_agente() to authenticated;
