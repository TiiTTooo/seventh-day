-- Agente no WhatsApp via YCloud (coexistência: app do celular + API no mesmo número)
-- Números de teste: se a lista tiver algum número, o agente só atende esses no WhatsApp.
-- Mensagens de outros números são ignoradas e não ficam gravadas.
alter table public.agente_config add column if not exists numeros_teste text[] not null default '{}';

-- Nome do agente e apresentação na primeira mensagem
alter table public.agente_config
  add column if not exists nome_agente text not null default '' check (length(nome_agente) <= 40),
  add column if not exists apresentacao text not null default '' check (length(apresentacao) <= 500);
