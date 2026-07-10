# CLAUDE.md — trades777 (app "Monolith")

> ⚠️ **Nomes:** o produto aparece como **"Monolith"** na UI, **"PositionPips"** em
> comentários antigos (`config.js`, `schema.sql`) e a pasta se chama **`trades777`**.
> São a mesma coisa. Subtítulo de marca na interface: *Excelência Trading*.

## O que é

App web de **diário de trading** + **calculadoras de gestão de risco**, com sincronização
na nuvem entre dispositivos. Single-page app em **HTML/CSS/JavaScript vanilla (ES Modules)**,
**sem build step** — roda direto no navegador e em GitHub Pages. Backend em **Supabase**
(Auth + Postgres + Realtime).

## Como rodar

- **Sem build e sem npm.** São arquivos estáticos. Como usa ES Modules, **não abra via
  `file://`** — sirva por HTTP local:
  - `python -m http.server 8000` na raiz do projeto → http://localhost:8000
  - ou a extensão **Live Server** do VS Code.
- **Deploy:** GitHub Pages (estático). O repositório já tem `git` com remote `origin`.

## Stack (tudo via CDN, sem dependências locais)

- **Supabase JS v2** — `@supabase/supabase-js@2/+esm` (jsDelivr)
- **Chart.js** — gráfico de performance acumulada
- **Lucide** — ícones
- **Google Fonts** — Inter, Plus Jakarta Sans

## Estrutura

| Arquivo | Papel |
|---------|-------|
| `index.html` | Markup de todas as telas: auth, diário, 4 calculadoras, modal de operação |
| `app.js` | Orquestrador (ES Module): estado, render, CRUD, calculadoras, tema, export/import |
| `js/config.js` | `SUPABASE_URL` + `anon key` (pública por design — protegida por RLS) |
| `js/supabase-client.js` | Singleton do cliente Supabase |
| `js/auth.js` | Wrapper de Supabase Auth (signup/signin/signout/sessão); erros traduzidos p/ pt-BR |
| `js/ui/auth-ui.js` | UI da tela de login/cadastro |
| `js/services/trades.js` | CRUD + Realtime da tabela `trades` |
| `js/services/preferences.js` | SELECT/UPDATE de `user_preferences` (tema + bloco ativo) |
| `style.css`, `auth.css` | Estilos, com tema dark/light |
| `supabase/schema.sql` | Schema idempotente (tabelas, triggers, RLS, realtime) p/ colar no SQL Editor |

## Modelo de dados (Postgres / Supabase)

- **`trades`** — `id` (uuid), `user_id`, `block_index` (≥1), `position` (0–34), `asset`,
  `type` (`'take'` | `'stop'`), `pnl` `numeric(18,2)`, `trade_date`, `notes`, timestamps.
- **`user_preferences`** — `user_id` (PK), `active_block_index`, `theme` (`'dark'`|`'light'`),
  `updated_at`.
- **Triggers:** `updated_at` automático; criação automática da linha em `user_preferences`
  quando um usuário se registra (`handle_new_user`).
- **RLS:** cada usuário só lê/escreve os próprios dados (`auth.uid() = user_id`). Realtime
  habilitado nas duas tabelas.

## Conceitos do domínio

- **Bloco de 35 operações** (`TRADES_PER_BLOCK = 35`): o diário agrupa trades em blocos de
  35; ao completar um bloco, o próximo abre automaticamente. A UI navega entre blocos.
- **`take` / `stop`:** `take` = lucro (pnl positivo), `stop` = prejuízo (pnl gravado
  negativo). No modal o usuário digita o **valor absoluto**; o sinal vem do tipo.
- **KPIs:** operações registradas, resultado acumulado, win rate, média por operação. O
  gráfico é a **soma acumulada** do P&L do bloco.
- **Calculadoras de risco** (não persistem nada): Forex (lote por pip), Futuros EUA/CME, B3
  (WIN/IND/WDO/DOL) e BTC CFD. Todas dimensionam a posição **arredondando para baixo** para
  nunca ultrapassar o risco definido.

## Convenções ao trabalhar aqui

- **Mantenha vanilla JS + ES Modules, sem framework e sem build** (compatível com GitHub Pages).
- **Todo texto de UI e mensagens de erro em pt-BR.**
- **Toda I/O de dados passa pelos serviços** (`js/services/*`) — não chame `supabase`
  diretamente do `app.js`.
- **snake_case no banco ↔ camelCase no app:** o banco usa `block_index`/`trade_date`; o app
  usa `blockIndex`/`date`. A ponte é a função `rowToTrade()` em `js/services/trades.js` —
  ao adicionar/renomear um campo, atualize os **dois lados**.

## Segurança / cuidados

- A `anon key` em `config.js` é **pública** (ok ir para o GitHub). **Nunca** coloque a
  `service_role` key no frontend.
- **"Resetar Dados"** apaga **todas** as operações do usuário na nuvem — pede confirmação
  dupla (incluindo digitar `DELETAR`). Trate com cuidado ao mexer nesse fluxo.
