# Seventh Day Barbearia e Cabeleireiros

Site com agendamento online e painel da equipe.

- `index.html`: site público (serviços com busca, calendário de agendamento, trabalhos, equipe)
- `admin.html`: painel (agenda, serviços e preços, equipe, imagens, horários e contato)
- `js/config.js`: endereço e chave pública do projeto Supabase
- `supabase/`: tudo para recriar o banco do zero
- Hospedagem: Vercel, site estático sem etapa de build (publica sozinho a cada envio para `main`)

## Recriar o banco em outro projeto Supabase

1. Crie um projeto novo (região São Paulo, `sa-east-1`).
2. Rode, nesta ordem, no SQL Editor (ou via MCP `apply_migration`):
   `supabase/01_estrutura.sql`, `supabase/02_funcoes.sql`, `supabase/03_dados.sql`.
3. Troque `url` e `key` em `js/config.js` pelos do projeto novo (Settings › API: Project URL e a chave publishable/anon). Envie para o GitHub; a Vercel republica.
4. Em Authentication › URL Configuration: Site URL = endereço do site na Vercel; em Redirect URLs adicione `https://SEU-SITE.vercel.app/admin.html`.
5. Entre no painel em "Primeiro acesso" com o e-mail de administrador cadastrado em `03_dados.sql`.

## Regras importantes

- Visitante só cria agendamento pela função `criar_agendamento`, que confere horário de funcionamento, conflito, preço e duração no servidor.
- Dono vê e edita tudo; profissional vê só a própria agenda.
- Fotos enviadas pelo painel vão para o bucket público `imagens`; só o dono envia ou apaga.
