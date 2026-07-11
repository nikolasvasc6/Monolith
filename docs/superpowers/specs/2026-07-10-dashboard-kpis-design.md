# Design — Aba "Dashboard": KPIs da conta

**Data:** 2026-07-10
**Status:** aprovado pelo Nikolas (espelho dos 4 KPIs do Diário, sempre da conta inteira)
**Referência visual:** os 4 cards de KPI já existentes no Diário de Trading (`kpi-grid`).

## Objetivo

Adicionar à aba Dashboard (que hoje tem só o card do gráfico) uma grade com os mesmos
4 KPIs do Diário, calculados sobre **todos os blocos** (histórico completo da conta),
posicionada entre o cabeçalho da página e o card do gráfico — mesma ordem do Diário.

## Escopo

- 4 cards espelhando o Diário: Operações registradas, Resultado acumulado, Win rate,
  Média por operação — todos da conta inteira.
- O card "Operações registradas" **não tem barra de progresso** (progresso é conceito
  de bloco); o subtexto vira "em N blocos" ("em 1 bloco" no singular), onde N é o
  número de blocos existentes (mesma contagem do "Bloco X de Y" do Diário).
- Zero CSS novo (reusa `kpi-grid`, `kpi-card` etc.), zero mudança de banco/serviços.
- Aproveita a oportunidade apontada no review anterior: a matemática comum vira um
  helper compartilhado (terceiro consumidor da mesma conta).

## HTML (`index.html`)

Dentro de `#page-dashboard`, entre o `page-header` e o card do gráfico, entra uma
`kpi-grid` clonada do Diário (mesmas classes e ícones Lucide), sem a barra de
progresso no primeiro card, com IDs próprios:

| Card | ID do card | IDs internos |
|---|---|---|
| Operações registradas | `dash-kpi-registered` | `dash-val-registered`, `dash-sub-registered` |
| Resultado acumulado | `dash-kpi-accumulated` | `dash-val-accumulated`, `dash-ind-accumulated` |
| Win rate | `dash-kpi-winrate` | `dash-val-winrate`, `dash-ind-winrate` |
| Média por operação | `dash-kpi-average` | `dash-val-average`, `dash-ind-average` |

## JS (`app.js`)

1. **Helper novo** `computeStats(trades)` → `{ count, accumulated, winTrades,
   winRate, average }`, com a mesma matemática de hoje: `winRate =
   Math.round((winTrades/count)*100)` (0 se vazio); `average = accumulated/count`
   (0 se vazio).
2. **Refactor sem mudança de comportamento**: `updateKPIs()` passa a consumir
   `computeStats()` — os valores exibidos no Diário ficam idênticos.
3. **`renderDashboard()`** calcula `computeStats(getAllTrades())` uma única vez e
   alimenta: os 4 cards novos, o resumo do card do gráfico (que já existia) e o
   gráfico. Os cards atualizam **sempre** (antes da guarda de visibilidade do
   canvas), como o resumo já faz.
4. **Semântica dos cards idêntica à do Diário**, trocando referências de bloco por
   conta:
   - Acumulado: "Sem operações" / "Saldo positivo" (+ `pnl-positive` e `win-trend`
     no card) / "Saldo negativo" (+ `pnl-negative` e `loss-trend`).
   - Win rate: "X de Y vitoriosos" e `win-trend` quando ≥ 50%; vazio → "Taxa de
     acerto da conta".
   - Média: "Média positiva/negativa" com classes; vazio → "Média de lucro/prejuízo".
   - Operações: valor total; subtexto "em N blocos".

## Casos de borda

- **Conta vazia:** "0" + "em 1 bloco", "Sem operações", "0%" + "Taxa de acerto da
  conta", "Média de lucro/prejuízo" — nenhuma classe de trend.
- **Tema/Realtime/CRUD/import/reset:** já cobertos, pois tudo passa por
  `renderApp()` → `renderDashboard()`.

## Verificação

Estender o rig `verify-dashboard.mjs` (fora do repo) e rodar com 100% PASS:

1. Check novo **H** — KPIs com o seed (40 trades em 2 blocos): "40" / "em 2 blocos",
   acumulado com "380" + "Saldo positivo", "95%" + "38 de 40 vitoriosos", média com
   "9.50".
2. Check **D** estendido — além do gráfico do Diário, os KPIs do Diário (bloco ativo
   com 5 trades): "5", acumulado com "30", "60%", média com "6.00" — guarda de
   regressão do refactor de `updateKPIs()`.
3. Check **F** estendido — após criar o trade de +50: cards mostram "41" e acumulado
   com "430".
4. Check **G** estendido — conta vazia: "0", "em 1 bloco", "Sem operações".
