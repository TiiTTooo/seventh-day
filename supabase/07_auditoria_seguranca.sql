-- 07: correções da auditoria de segurança (11/11/2026)

-- A1: equipe — usuário logado comum não lê e-mail/usuario/user_id
revoke select on public.equipe from authenticated;
grant select (id, nome, descricao, foto_url, papel, ativo, atende, ordem, created_at) on public.equipe to authenticated;
create or replace function public.equipe_painel() returns setof public.equipe
language sql stable security definer set search_path = '' as $$
  select * from public.equipe
   where public.e_dono() or user_id = (select auth.uid())
   order by ordem
$$;
revoke all on function public.equipe_painel() from public, anon;
grant execute on function public.equipe_painel() to authenticated;

-- A2: exclusão de conta (a foto é apagada antes, pela API de Storage, no navegador)
create or replace function public.excluir_minha_conta() returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'Entre na sua conta.'; end if;
  if exists (select 1 from public.equipe where user_id = v) then raise exception 'Conta da equipe não pode ser excluída por aqui.'; end if;
  update public.agendamentos set cliente_id = null where cliente_id = v;
  delete from public.avaliacoes where cliente_id = v;
  delete from public.clientes where user_id = v;
  delete from auth.users where id = v;
end $$;

-- A3: cadastro de clientes, fotos e avaliações: só o dono (profissional vê as avaliações dele)
drop policy clientes_proprio_ler on public.clientes;
create policy clientes_ler on public.clientes for select to authenticated
  using (user_id = (select auth.uid()) or (select public.e_dono()));
drop policy aval_ler on public.avaliacoes;
create policy aval_ler on public.avaliacoes for select to authenticated
  using (cliente_id = (select auth.uid()) or (select public.e_dono()) or profissional_id = (select public.meu_membro()));
drop policy clientes_foto_ler on storage.objects;
create policy clientes_foto_ler on storage.objects for select to authenticated
  using (bucket_id = 'clientes' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.e_dono())));

-- M3: uma foto por cliente
drop policy clientes_foto_enviar on storage.objects;
create policy clientes_foto_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'clientes' and name = (select auth.uid())::text || '/foto.jpg');
drop policy clientes_foto_trocar on storage.objects;
create policy clientes_foto_trocar on storage.objects for update to authenticated
  using (bucket_id = 'clientes' and name = (select auth.uid())::text || '/foto.jpg')
  with check (bucket_id = 'clientes' and name = (select auth.uid())::text || '/foto.jpg');

-- A4 + B7: IP real (Cloudflare na frente do Supabase) e trava contra corrida
create or replace function public.checar_limite_ip(p_tipo text default 'agendamento', p_max10 int default 5, p_maxdia int default 20)
returns void language plpgsql security definer set search_path = '' as $$
declare
  hdr json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text := coalesce(nullif(btrim(hdr->>'cf-connecting-ip'), ''),
                        nullif(btrim(split_part(coalesce(hdr->>'x-forwarded-for', ''), ',', 1)), ''),
                        'desconhecido');
begin
  perform pg_advisory_xact_lock(hashtext(v_ip || p_tipo));
  if (select count(*) from public.tentativas where ip = v_ip and tipo = p_tipo and criado > now() - interval '10 minutes') >= p_max10
     or (select count(*) from public.tentativas where ip = v_ip and tipo = p_tipo and criado > now() - interval '1 day') >= p_maxdia then
    raise exception 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  end if;
  insert into public.tentativas (ip, tipo) values (v_ip, p_tipo);
end $$;
revoke all on function public.checar_limite_ip(text, int, int) from public, anon, authenticated;

-- Limpeza dos IPs: a política promete até 24 h
select cron.schedule('seventhday-limpar-ips', '15 * * * *', $$delete from public.tentativas where criado < now() - interval '24 hours'$$);

-- A4 + B1: teto geral, só quem atende, horário na grade, dia sem horário válido
create or replace function public.criar_agendamento(p_data date, p_inicio integer, p_profissional uuid, p_servicos uuid[], p_nome text, p_tel text)
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
  v_id uuid;
begin
  perform public.checar_limite_ip('agendamento', 5, 20);
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

  -- teto geral contra robô: no máximo 30 agendamentos pelo site por hora
  if (select count(*) from public.agendamentos where origem = 'site' and created_at > now() - interval '1 hour') >= 30 then
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

  insert into public.agendamentos (data, inicio, duracao, profissional_id, servicos, cliente_nome, cliente_tel, total, origem)
  values (p_data, p_inicio, v_dur, p_profissional, v_itens, v_nome, v_tel, v_total, 'site')
  returning id into v_id;
  return json_build_object('id', v_id, 'duracao', v_dur, 'total', v_total);
end $$;

-- B6: visitante não consulta o histórico de ocupação
create or replace function public.horarios_ocupados(p_de date, p_ate date)
returns table(data date, profissional_id uuid, inicio integer, fim integer)
language sql stable security definer set search_path = '' as $$
  with j as (select case when public.e_equipe() then p_de
                         else greatest(p_de, (now() at time zone 'America/Sao_Paulo')::date - 1) end as de)
  select a.data, a.profissional_id, a.inicio, a.inicio + a.duracao
    from public.agendamentos a, j
   where a.data between j.de and least(p_ate, j.de + 90) and a.status <> 'cancelado'
  union all
  select b.data, b.profissional_id, b.inicio, b.fim
    from public.bloqueios b, j
   where b.data between j.de and least(p_ate, j.de + 90)
$$;

-- M2: profissional só muda situação e lembrete; encaixe dele não se liga a conta de cliente
create or replace function public.agend_limitar_profissional() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.e_equipe() or public.e_dono() then return new; end if;
  if tg_op = 'INSERT' then
    if new.profissional_id is distinct from public.meu_membro() then raise exception 'Profissional só marca na própria agenda.'; end if;
    new.cliente_id := null; new.origem := 'balcao'; return new;
  end if;
  if (new.data, new.inicio, new.duracao, new.servicos, new.total, new.cliente_id, new.cliente_nome, new.cliente_tel, new.origem, new.profissional_id)
     is distinct from (old.data, old.inicio, old.duracao, old.servicos, old.total, old.cliente_id, old.cliente_nome, old.cliente_tel, old.origem, old.profissional_id) then
    raise exception 'Profissional só altera a situação do horário. Para mudar o resto, fale com o dono.';
  end if;
  return new;
end $$;
revoke all on function public.agend_limitar_profissional() from public, anon, authenticated;
create trigger agend_limitar_profissional before insert or update on public.agendamentos
  for each row execute function public.agend_limitar_profissional();

-- B5: avaliar não muda a situação do horário; falta não avalia
create or replace function public.avaliar_atendimento(p_id uuid, p_nota int, p_comentario text, p_publicar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.agendamentos; agora timestamp := (now() at time zone 'America/Sao_Paulo');
begin
  select * into a from public.agendamentos where id = p_id and cliente_id = auth.uid();
  if not found then raise exception 'Atendimento não encontrado.'; end if;
  if a.status not in ('confirmado', 'concluido') then raise exception 'Esse horário não foi realizado.'; end if;
  if (a.data + make_interval(mins => a.inicio + a.duracao)) > agora then raise exception 'Você poderá avaliar depois do atendimento.'; end if;
  if a.data < agora::date - 60 then raise exception 'O prazo para avaliar este atendimento terminou.'; end if;
  if p_nota not between 1 and 5 then raise exception 'Escolha de 1 a 5 estrelas.'; end if;
  insert into public.avaliacoes (agendamento_id, cliente_id, profissional_id, nota, comentario, pode_publicar)
  values (p_id, auth.uid(), a.profissional_id, p_nota, nullif(btrim(left(coalesce(p_comentario, ''), 500)), ''), coalesce(p_publicar, false))
  on conflict (agendamento_id) do update set nota = excluded.nota, comentario = excluded.comentario,
    pode_publicar = excluded.pode_publicar, aprovada = false, criado = now();
end $$;

-- público e média só de atendimentos realizados
create or replace function public.avaliacoes_publicas()
returns table(nota int, comentario text, nome text, profissional text, criado timestamptz, media numeric, total bigint)
language sql stable security definer set search_path = '' as $$
  with v as (select av.* from public.avaliacoes av join public.agendamentos ag on ag.id = av.agendamento_id where ag.status = 'concluido'),
       ap as (select * from v where aprovada and pode_publicar and comentario is not null)
  select ap.nota, ap.comentario, c.nome, split_part(e.nome, ' ', 1), ap.criado,
         (select round(avg(v.nota)::numeric, 1) from v), (select count(*) from v)
    from ap join public.clientes c on c.user_id = ap.cliente_id left join public.equipe e on e.id = ap.profissional_id
   order by ap.criado desc limit 12
$$;

-- B2: a exceção do Master vale só para manutenção direta no banco, nunca para chamadas do site
create or replace function public.proteger_master() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated') then return coalesce(new, old); end if;
  if (tg_op in ('UPDATE','DELETE') and old.papel = 'master') or (tg_op in ('INSERT','UPDATE') and new.papel = 'master') then
    if not public.e_master() then raise exception 'Só o Master pode alterar o acesso Master.'; end if;
  end if;
  return coalesce(new, old);
end $$;

-- B9: e-mail do cliente vem da conta Google; idade mínima no banco
create or replace function public.clientes_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.email := (select email from auth.users where id = new.user_id);
  if new.nascimento is not null and new.nascimento > ((now() at time zone 'America/Sao_Paulo')::date - interval '18 years')::date then
    raise exception 'A conta é para maiores de 18 anos.';
  end if;
  return new;
end $$;
revoke all on function public.clientes_conferir() from public, anon, authenticated;
create trigger clientes_conferir before insert or update on public.clientes
  for each row execute function public.clientes_conferir();

-- Grants que não são usados
revoke insert, update, delete, truncate, references, trigger on public.config, public.equipe, public.galeria, public.servicos from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Índices das chaves estrangeiras
create index if not exists agend_prof_idx on public.agendamentos (profissional_id);
create index if not exists aval_cliente_idx on public.avaliacoes (cliente_id);
create index if not exists aval_prof_idx on public.avaliacoes (profissional_id);
create index if not exists bloq_prof_idx on public.bloqueios (profissional_id);
