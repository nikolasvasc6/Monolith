# CLAUDE.md — Monolith

> ⚠️ **Nomes:** o produto aparece como **"Monolith"** na UI; a pasta e o repositório
> GitHub (`nikolasvasc6/Monolith`) também se chamam assim (até jul/2026 ambos eram
> `trades777`). **"PositionPips"** em comentários antigos (`config.js`, `schema.sql`)
> é o mesmo app. Subtítulo de marca na interface: *Excelência Trading*.
> Site publicado: https://nikolasvasc6.github.io/Monolith/

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
  Índice **único** em `(user_id, block_index, position)` — garante no banco o limite de
  35 por bloco (estado defasado de outra aba/dispositivo não consegue gravar uma 36ª).
- **`user_preferences`** — `user_id` (PK), `active_block_index`, `theme` (`'dark'`|`'light'`),
  `updated_at`.
- **Triggers:** `updated_at` automático; criação automática da linha em `user_preferences`
  quando um usuário se registra (`handle_new_user`).
- **RLS:** cada usuário só lê/escreve os próprios dados (`auth.uid() = user_id`). Realtime
  habilitado nas duas tabelas.

## Conceitos do domínio

- **Bloco de 35 operações** (`TRADES_PER_BLOCK = 35`): o diário agrupa trades em blocos de
  35; ao completar um bloco, o próximo abre automaticamente. A UI navega entre blocos.
  Posições são contíguas (0..n-1): excluir renumera as seguintes no banco, e a autocura
  no carregamento (`healBlockLayout`) reflui excedentes de blocos com mais de 35 para o
  bloco seguinte. Importar entra sempre **depois** do último bloco usado.
- **`take` / `stop`:** `take` = lucro (pnl positivo), `stop` = prejuízo (pnl gravado
  negativo). No modal o usuário digita o **valor absoluto**; o sinal vem do tipo.
- **KPIs:** operações registradas, resultado acumulado, win rate, média por operação. O
  gráfico é a **soma acumulada** do P&L do bloco.
- **Calculadoras de risco** (não persistem nada): Forex (lote por pip), Futuros EUA/CME,
  B3 (WIN/IND/WDO/DOL) e BTC CFD. Todas dimensionam a posição **arredondando para baixo**
  para nunca ultrapassar o risco definido.
- **Forex além dos pares:** o seletor da Calculadora Forex também tem XAU/USD e o CFD de
  índice USTEC/Nasdaq 100 (**1 pip = 0,1 ponto do índice → $0,10 por lote**). Para esses,
  `isForexNonCurrencyAsset()` esconde as linhas de lote mini/micro e "Unidades totais"
  (× 100.000 é tamanho de lote de **moeda**) e tira a menção a "lote padrão". Ao adicionar
  um ativo que não seja par de moedas, registre-o em `INDEX_CFD_SPECS` (índice, com valor
  do pip) ou em `FX_NON_CURRENCY_ASSETS` — senão o painel volta a mostrar as unidades.

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
