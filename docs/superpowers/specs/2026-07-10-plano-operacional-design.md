# Design — Aba "Plano Operacional"

**Data:** 2026-07-10
**Status:** aprovado pelo Nikolas (persistência Supabase + botão "Salvar Plano")
**Referência visual:** screenshots fornecidos (Identidade do Trader → Regras
Comportamentais → Gestão de Risco → Operacional Técnico → Regras de NÃO Operação,
tudo em uma única página, nesta ordem).

## Objetivo

Substituir o placeholder da aba "Plano Operacional" (item já existente na sidebar,
`data-tab="trading-plan"`) por uma página real onde o usuário define e mantém seu
plano operacional de trading, persistido na nuvem (Supabase) como o resto do app.

## Escopo

- 1 formulário único por usuário (não há histórico de versões do plano).
- Salvamento explícito via botão "Salvar Plano" ao final da página + toast.
- Sem Realtime para o plano: edição é rara; política last-write-wins entre
  dispositivos.
- "Resetar Dados" **não** apaga o plano (o fluxo fala em operações).
- Export/Import de backup passa a incluir o plano.

## Banco de dados (`supabase/schema.sql` — bloco novo, idempotente)

Tabela `public.trading_plans`, 1 linha por usuário:

| Coluna | Tipo | Observação |
|---|---|---|
| `user_id` | uuid PK, FK `auth.users(id)` on delete cascade | |
| `trader_name` | text | |
| `style` | text | valores da UI: `scalping`, `intraday`, `swing`, `position` |
| `market` | text | livre (ex.: "Forex") |
| `behavioral_rules` | text | |
| `committed` | boolean not null default false | checkbox de compromisso |
| `daily_stop` | numeric(18,2) | Stop diário ($) |
| `weekly_stop` | numeric(18,2) | Stop semanal ($) |
| `risk_per_trade` | numeric(8,2) | Risco por trade (%) |
| `max_daily_risk` | numeric(8,2) | Risco máximo diário (%) |
| `setup1_name` / `setup1_description` | text | idem para setups 2 e 3 |
| `no_trade_rules` | text | |
| `updated_at` | timestamptz not null default now() | trigger `set_updated_at` |

- Trigger `plans_set_updated_at` reutilizando `public.set_updated_at()`.
- RLS habilitado + 4 policies "own" (select/insert/update/delete), mesmo padrão
  das outras tabelas.
- **Não** entra na publicação `supabase_realtime`.
- Nikolas precisa colar/rodar o schema atualizado no SQL Editor do Supabase
  (o arquivo é idempotente; pode rodar inteiro).

## Service — `js/services/plan.js`

Padrão dos services existentes (nenhum acesso a `supabase` fora de services):

- `fetchPlan(userId)` → SELECT `maybeSingle`; se não houver linha, retorna
  defaults (strings vazias, números `null`, `committed: false`) sem criar linha.
- `savePlan(userId, plan)` → `upsert` com `onConflict: 'user_id'`.
- `normalize(row)` faz a ponte snake_case ↔ camelCase (`daily_stop` ↔
  `dailyStop` etc.), como `rowToTrade()` em `trades.js`.

## UI — `index.html`, seção `#page-trading-plan`

Nova `<section class="page-section" id="page-trading-plan">` na ordem dos
screenshots:

1. **Page header:** h1 "Plano Operacional" + subtítulo "Defina e acompanhe suas
   regras, limites de risco e setups para manter a disciplina."
2. **Card Identidade do Trader** (ícone `circle-user`): linha de 3 campos —
   Nome do trader (text) · Estilo operacional (select: Scalping, Intraday (Day
   Trade), Swing Trade, Position Trade) · Mercado principal (text).
3. **Card Regras Comportamentais** (ícone `shield-check`): subtítulo "Defina
   seus pilares de disciplina, controle emocional e consistência." + textarea +
   checkbox "Estou ciente e comprometido em seguir meu plano operacional
   rigorosamente." dentro do card.
4. **Card Gestão de Risco** (ícone `target`): grade 2×2 de inputs numéricos —
   Stop diário ($) · Stop semanal ($) · Risco por trade (%) · Risco máximo
   diário (%).
5. **Card Operacional Técnico** (ícone `crosshair`): subtítulo "Mapeie seus
   principais setups e gatilhos de entrada." + 3 blocos de setup (Nome do Setup
   N: input text com placeholder "Ex: Rompimento de VWAP, Pullback na MM20..." ·
   Descrição e Gatilhos: textarea com placeholder "Descreva o contexto,
   indicadores necessários e o gatilho exato de entrada...").
6. **Card Regras de NÃO Operação** (variante danger: título vermelho, ícone
   `alert-triangle`): subtítulo "Filtros e situações onde você está proibido de
   abrir novas posições." + textarea.
7. **Botão "Salvar Plano"** (`btn-primary`) ao final da página.

## Integração — `app.js`

- Registrar `'trading-plan': DOM.pageTradingPlan` no mapa `tabToPage`.
- Boot: `fetchPlan` entra no `Promise.all` de `loadDataFromCloud`; resultado vai
  para `state.plan` e preenche o formulário (`renderPlanForm()`).
- Botão salvar: coleta os campos, chama `savePlan`, toast de sucesso/erro,
  desabilita o botão durante o save.
- **Export:** objeto do backup ganha chave `plan` (camelCase).
- **Import:** se `parsed.plan` existir, faz `savePlan` além do
  `bulkImportTrades`; backups antigos sem `plan` continuam válidos.

## CSS — `style.css`

Reutilizar padrões existentes (`form-group`, `form-row`, textareas, tema
dark/light via variáveis). Classes novas mínimas: card do plano (`plan-card` ou
reuso de `calc-card` largura total), grade de 3 colunas da identidade, grade 2×2
do risco, variante danger do card, e o checkbox de compromisso. Nada de
framework; responsivo (colunas colapsam em telas estreitas).

## Erros e estados

- Falha no fetch do plano no boot: não bloqueia o diário; página abre com
  defaults e toast de erro (mesma filosofia de resiliência do boot atual).
- Falha no save: toast de erro, dados permanecem no formulário.
- Campos numéricos vazios são salvos como `null` (não `0`).

## Testes / verificação

App sem build e sem suíte de testes; verificação manual via servidor HTTP local:

1. Rodar o schema no Supabase e conferir tabela + policies.
2. Abrir a aba, preencher tudo, salvar, recarregar (F5) → dados persistem.
3. Logar em outro navegador → plano aparece (sync via banco).
4. Exportar backup → JSON contém `plan`; importar em conta limpa → plano
   restaurado.
5. Conferir tema light/dark e responsividade.
6. Regressão: navegação entre abas, diário e calculadoras intactos.
