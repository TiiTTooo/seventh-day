-- Seventh Day: funções públicas de agendamento, imagens e tempo real

create or replace function public.horarios_ocupados(p_de date, p_ate date)
returns table(data date, profissional_id uuid, inicio int, fim int)
language sql stable security definer set search_path = '' as $$
  select a.data, a.profissional_id, a.inicio, a.inicio + a.duracao
    from public.agendamentos a
   where a.data between p_de and least(p_ate, p_de + 90) and a.status <> 'cancelado'
  union all
  select b.data, b.profissional_id, b.inicio, b.fim
    from public.bloqueios b
   where b.data between p_de and least(p_ate, p_de + 90)
$$;
grant execute on function public.horarios_ocupados(date, date) to anon, authenticated;

create or replace function public.criar_agendamento(
  p_data date, p_inicio int, p_profissional uuid, p_servicos uuid[], p_nome text, p_tel text)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  cfg public.config;
  agora timestamp := (now() at time zone 'America/Sao_Paulo');
  hoje date := agora::date;
  min_agora int := extract(hour from agora)::int * 60 + extract(minute from agora)::int;
  h jsonb; abre int; fecha int;
  v_dur int; v_total numeric; v_itens jsonb; v_qtd int;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_tel text := regexp_replace(coalesce(p_tel, ''), '\D', '', 'g');
  v_id uuid;
begin
  select * into cfg from public.config where id = 1;
  if v_nome is null or length(v_nome) < 2 or length(v_nome) > 80 then raise exception 'Digite seu nome.'; end if;
  if length(v_tel) not between 10 and 11 then raise exception 'Digite o WhatsApp com DDD.'; end if;
  if p_servicos is null or array_length(p_servicos, 1) is null or array_length(p_servicos, 1) > 6 then raise exception 'Escolha de 1 a 6 serviços.'; end if;
  if not exists (select 1 from public.equipe where id = p_profissional and ativo) then raise exception 'Profissional indisponível.'; end if;

  select sum(duracao), sum(preco), jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'preco', preco, 'duracao', duracao)), count(*)
    into v_dur, v_total, v_itens, v_qtd
    from public.servicos where id = any(p_servicos) and ativo;
  if v_qtd <> (select count(distinct x) from unnest(p_servicos) x) then raise exception 'Algum serviço não está mais disponível.'; end if;

  if p_data < hoje or p_data > hoje + cfg.dias_abertos then raise exception 'Data fora do período de agendamento.'; end if;
  h := cfg.horarios -> extract(dow from p_data)::int::text;
  if h is null or jsonb_typeof(h) <> 'array' then raise exception 'O salão não abre neste dia.'; end if;
  abre := split_part(h->>0, ':', 1)::int * 60 + split_part(h->>0, ':', 2)::int;
  fecha := split_part(h->>1, ':', 1)::int * 60 + split_part(h->>1, ':', 2)::int;
  if p_inicio < abre or p_inicio + v_dur > fecha then raise exception 'Horário fora do funcionamento.'; end if;
  if p_data = hoje and p_inicio < min_agora + cfg.antecedencia then raise exception 'Esse horário já passou. Escolha outro.'; end if;

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

  insert into public.agendamentos (data, inicio, duracao, profissional_id, servicos, cliente_nome, cliente_tel, total, origem)
  values (p_data, p_inicio, v_dur, p_profissional, v_itens, v_nome, v_tel, v_total, 'site')
  returning id into v_id;

  return json_build_object('id', v_id, 'duracao', v_dur, 'total', v_total);
end $$;
revoke all on function public.criar_agendamento(date, int, uuid, uuid[], text, text) from public;
grant execute on function public.criar_agendamento(date, int, uuid, uuid[], text, text) to anon, authenticated;

-- Imagens (bucket público; só o dono envia, troca e apaga)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagens', 'imagens', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy imagens_dono_inserir on storage.objects for insert to authenticated
  with check (bucket_id = 'imagens' and (select public.e_dono()));
create policy imagens_dono_editar on storage.objects for update to authenticated
  using (bucket_id = 'imagens' and (select public.e_dono()));
create policy imagens_dono_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'imagens' and (select public.e_dono()));

-- Aviso de novo agendamento no painel
alter publication supabase_realtime add table public.agendamentos;
