# Design — Aba "Dashboard": gráfico de Performance da Conta

**Data:** 2026-07-10
**Status:** aprovado pelo Nikolas (histórico completo da conta, não só o bloco ativo)
**Referência visual:** card "Performance da Conta" já existente no Diário de Trading
(screenshot fornecido) — mesmo visual, dados da conta inteira.

## Objetivo

Substituir o placeholder da aba "Dashboard" (item já existente na sidebar,
`data-tab="dashboard"`) por uma página real cujo primeiro widget é o gráfico de
Performance da Conta — a soma acumulada do P&L de **todos os blocos**, do primeiro
trade ao último. O card do Diário permanece intacto, focado no bloco ativo.

## Escopo

- A aba nasce só com o card do gráfico (header da página + card). Sem KPIs próprios,
  sem seletor de período, sem outros widgets — ficam para iterações futuras.
- O resumo no topo do card (Trades / Win Rate / P/L) reflete a conta inteira.
- Nenhuma mudança de banco, serviços ou schema: só leitura do estado já carregado.
- Nenhum CSS novo: reusa as classes do card do Diário (`card-chart-container`,
  `chart-header`, `chart-wrapper` etc.).

## HTML (`index.html`)

Nova `<section class="page-section" id="page-dashboard">`, antes de
`#page-trading-journal`:

- `page-header` com título "Dashboard" e subtítulo (ex.: "Visão geral da sua conta").
- Card clonado do Diário com IDs próprios:
  - canvas `#dashboardChart`;
  - resumo `#dash-summary-trades-count`, `#dash-summary-winrate`, `#dash-summary-pl`;
  - subtítulo do card: "Evolução acumulada de todos os blocos".

## JS (`app.js`)

1. **Dados** — nova função `getAllTrades()`: concatena `state.blocks` em ordem
   numérica crescente da chave do bloco (dentro do bloco os trades já vêm ordenados
   por posição).
2. **Refactor** — `renderChart(trades)` vira `renderChart(canvas, trades)` e retorna
   a instância do Chart.js. A variável `chartInstance` vira duas referências
   (ex.: `journalChartInstance` e `dashChartInstance`), cada uma destruída antes do
   próprio re-render. Visual idêntico ao atual (cores por sinal do acumulado,
   gradiente, crosshair, tooltip "Operação #n" — no Dashboard, n conta desde o
   início da conta).
3. **`renderDashboard()`** — calcula a série acumulada com `getAllTrades()`, atualiza
   o resumo do card e redesenha o gráfico. O gráfico só é desenhado se
   `#page-dashboard` estiver com a classe `active` (canvas em seção oculta tem
   tamanho 0 e o Chart.js renderiza errado).
4. **Integração** — `renderApp()` (ponto único de re-render: CRUD, Realtime, tema,
   import/reset) passa a chamar `renderDashboard()`. Em `setupEventListeners()`,
   `tabToPage` ganha `'dashboard': DOM.pageDashboard` e o clique na aba chama
   `renderDashboard()` (mesmo padrão do `trading-journal`).

## Casos de borda

- **Sem trades:** série só com o ponto "Start" em $0 — mesmo comportamento do Diário.
- **Tema claro/escuro:** `renderChart` já lê o tema do `body`; o re-render via
  `renderApp()` cobre a troca.
- **Realtime/import/reset:** cobertos por `renderApp()` → `renderDashboard()`.

## Verificação

Rodar a skill `projetos/apps/trades777:verify` (navegador real com Supabase stubado):

1. Aba Dashboard abre com o gráfico da conta inteira (vários blocos somados).
2. Diário continua mostrando só o bloco ativo.
3. Troca de tema redesenha o gráfico do Dashboard corretamente.
4. Conta sem trades mostra a linha só com "Start" em $0.
5. Criar/editar/excluir trade com a aba Dashboard aberta atualiza gráfico e resumo.
