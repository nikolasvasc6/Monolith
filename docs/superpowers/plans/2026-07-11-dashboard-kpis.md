# KPIs da Conta na Aba Dashboard — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar à aba Dashboard os 4 KPIs do Diário (Operações, Resultado acumulado, Win rate, Média por operação) calculados sobre a conta inteira, entre o cabeçalho da página e o card do gráfico.

**Architecture:** A matemática comum (count, acumulado, vitórias, win rate, média) vira um helper `computeStats(trades)` consumido por `updateKPIs()` (Diário, refactor sem mudança de comportamento) e por `renderDashboard()` (que passa a alimentar os 4 cards novos além do resumo e do gráfico). HTML clona a `kpi-grid` do Diário com IDs `dash-*`, sem barra de progresso no primeiro card.

**Tech Stack:** HTML/CSS/JS vanilla (ES Modules, sem build), Chart.js 4 via CDN. Zero CSS novo, zero mudança de banco/serviços.

**Spec:** `docs/superpowers/specs/2026-07-10-dashboard-kpis-design.md`

## Global Constraints

- Vanilla JS + ES Modules, **sem framework e sem build**.
- Todo texto de UI, comentários e commits em **pt-BR com acentuação correta**.
- **Nenhum CSS novo** — reusar `kpi-grid`, `kpi-card`, `kpi-icon-wrapper`, `kpi-data`,
  `kpi-title`, `kpi-value-row`, `kpi-value`, `kpi-subtext`, `kpi-indicator`,
  `win-trend`/`loss-trend`, `pnl-positive`/`pnl-negative`.
- **Nenhuma mudança** em `supabase/schema.sql` ou `js/services/*`.
- **`node_modules` nunca entra no repo** — o rig vive em
  `C:/Users/nikol/AppData/Local/Temp/trades777-rig`.
- Verificação no navegador real com Supabase stubado **antes de cada commit**.
- Commits direto na `main` (convenção deste repo).

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `C:/Users/nikol/AppData/Local/Temp/trades777-rig/verify-dashboard.mjs` | +4 checks (H, D2, F2, G2) e helper `readDashKPIs()` (fora do repo) |
| `app.js` | Task 1: `computeStats()` + refactor de `updateKPIs()`. Task 2: refs de DOM + `renderDashboard()` alimentando os cards |
| `index.html` | Task 2: `kpi-grid` dentro de `#page-dashboard` |

Se o diretório do rig não existir mais (temp limpo), recrie-o seguindo a Task 1
(Steps 1-2) do plano anterior, commitado em
`docs/superpowers/plans/2026-07-10-dashboard-grafico-performance.md`, e então aplique
as edições abaixo.

---

### Task 1: Rig estendido + `computeStats()` + refactor de `updateKPIs()`

**Files:**
- Modify: `C:/Users/nikol/AppData/Local/Temp/trades777-rig/verify-dashboard.mjs` (fora do repo)
- Modify: `app.js` — inserir `computeStats()` antes de `updateKPIs()` (linha ~401) e refatorar `updateKPIs()` (linhas ~401-459)

**Interfaces:**
- Consumes: rig existente (checks A-G), `updateKPIs()` atual, IDs do Diário (`val-registered`, `val-accumulated`, `val-winrate`, `ind-winrate`, `val-average`).
- Produces: `computeStats(trades)` → `{ count, accumulated, winTrades, winRate, average }` (a Task 2 consome com estes nomes exatos); checks H/D2/F2/G2 no rig, que esperam os IDs `dash-val-registered`, `dash-sub-registered`, `dash-val-accumulated`, `dash-ind-accumulated`, `dash-val-winrate`, `dash-ind-winrate`, `dash-val-average`, `dash-ind-average` (criados na Task 2).

- [ ] **Step 1: Subir o servidor do app**

```bash
cd /c/Users/nikol/Desktop/Niko/projetos/apps/Monolith
python -m http.server 8077 &
```

- [ ] **Step 2: Estender o rig com os checks novos**

Em `C:/Users/nikol/AppData/Local/Temp/trades777-rig/verify-dashboard.mjs`, aplicar 5
inserções (âncoras são trechos existentes do script, únicos no arquivo):

**(a)** Logo APÓS o fechamento de `readDashChart()` — âncora:

```js
      pl: document.getElementById('dash-summary-pl').textContent
    };
  });
}
```

inserir:

```js
function readDashKPIs() {
  return page.evaluate(() => {
    const t = (id) => { const el = document.getElementById(id); return el ? el.textContent : null; };
    return {
      registered: t('dash-val-registered'), blocks: t('dash-sub-registered'),
      accumulated: t('dash-val-accumulated'), indAcc: t('dash-ind-accumulated'),
      winrate: t('dash-val-winrate'), indWin: t('dash-ind-winrate'),
      average: t('dash-val-average'), indAvg: t('dash-ind-average')
    };
  });
}
```

**(b)** Logo APÓS o check C2 — âncora:

```js
check('C2. resumo: 40 trades, 95%, P/L com 380',
  !!dash && dash.count === '40' && dash.wr === '95%' && dash.pl.includes('380'));
```

inserir:

```js
// H) Cards de KPI da conta (seed: 40 trades, 2 blocos, +380, 95%, média 9.50)
const kpis = await readDashKPIs();
check('H. KPIs da conta: 40 / em 2 blocos / 380 Saldo positivo / 95% 38 de 40 / média 9.50',
  !!kpis && kpis.registered === '40' && kpis.blocks === 'em 2 blocos' &&
  (kpis.accumulated || '').includes('380') && kpis.indAcc === 'Saldo positivo' &&
  kpis.winrate === '95%' && kpis.indWin === '38 de 40 vitoriosos' &&
  (kpis.average || '').includes('9.50'), JSON.stringify(kpis));
```

**(c)** Logo APÓS o check D — âncora:

```js
check('D. Diário segue por bloco: 6 pontos, acumulado 30',
  !!journal && journal.points === 6 && Math.abs(journal.last - 30) < 0.001, JSON.stringify(journal));
```

inserir:

```js
// D2) KPIs do Diário (bloco ativo: 5 trades, +30, 60%, média 6.00) — guarda do refactor de updateKPIs
const jkpis = await page.evaluate(() => ({
  registered: document.getElementById('val-registered').textContent,
  accumulated: document.getElementById('val-accumulated').textContent,
  winrate: document.getElementById('val-winrate').textContent,
  indWin: document.getElementById('ind-winrate').textContent,
  average: document.getElementById('val-average').textContent
}));
check('D2. KPIs do Diário: 5 / 30 / 60% 3 de 5 / média 6.00',
  jkpis.registered === '5' && jkpis.accumulated.includes('30') &&
  jkpis.winrate === '60%' && jkpis.indWin === '3 de 5 vitoriosos' &&
  jkpis.average.includes('6.00'), JSON.stringify(jkpis));
```

**(d)** Logo APÓS o check F — âncora:

```js
check('F. novo trade reflete no Dashboard: 42 pontos, acumulado 430, 41 trades',
  !!afterCrud && afterCrud.points === 42 && Math.abs(afterCrud.last - 430) < 0.001 &&
  afterCrud.count === '41', JSON.stringify(afterCrud));
```

inserir:

```js
// F2) KPIs após o novo trade
const kpisAfter = await readDashKPIs();
check('F2. KPIs após novo trade: 41 / acumulado 430',
  !!kpisAfter && kpisAfter.registered === '41' && (kpisAfter.accumulated || '').includes('430'),
  JSON.stringify(kpisAfter));
```

**(e)** Logo APÓS o check G (e ANTES de `await browser.close();`) — âncora:

```js
check('G. conta vazia: 1 ponto "Start" em 0',
  !!empty && empty.points === 1 && empty.last === 0 && empty.label0 === 'Start' &&
  empty.count === '0', JSON.stringify(empty));
```

inserir:

```js
// G2) KPIs de conta vazia
const kpisEmpty = await readDashKPIs();
check('G2. KPIs conta vazia: 0 / em 1 bloco / Sem operações / Taxa de acerto da conta',
  !!kpisEmpty && kpisEmpty.registered === '0' && kpisEmpty.blocks === 'em 1 bloco' &&
  kpisEmpty.indAcc === 'Sem operações' && kpisEmpty.winrate === '0%' &&
  kpisEmpty.indWin === 'Taxa de acerto da conta',
  JSON.stringify(kpisEmpty));
```

- [ ] **Step 3: Rodar a linha de base (checks novos do Dashboard DEVEM falhar)**

```bash
cd /c/Users/nikol/AppData/Local/Temp/trades777-rig && node verify-dashboard.mjs
```

Esperado: **9/12** — A, B, C, C2, D, **D2**, E, F, G = PASS; **H, F2, G2 = FAIL**
(os elementos `dash-val-*` ainda não existem). D2 já passa ANTES do refactor —
isso prova que ele é uma guarda válida. Exit code 1.

- [ ] **Step 4: Adicionar `computeStats()` em `app.js`**

Logo ANTES de `function updateKPIs(trades) {` (linha ~401), inserir:

```js
/** Estatísticas de uma lista de trades (bloco ativo ou conta inteira). */
function computeStats(trades) {
  const count = trades.length;
  const accumulated = trades.reduce((s, t) => s + t.pnl, 0);
  const winTrades = trades.filter(t => t.pnl > 0).length;
  const winRate = count > 0 ? Math.round((winTrades / count) * 100) : 0;
  const average = count > 0 ? (accumulated / count) : 0;
  return { count, accumulated, winTrades, winRate, average };
}

```

- [ ] **Step 5: Refatorar `updateKPIs()` para consumir o helper**

Substituir a função inteira (linhas ~401-459 antes da inserção) por — mudanças:
desestruturação do helper no topo e remoção das contas locais; todo o resto
idêntico:

```js
function updateKPIs(trades) {
  const { count, accumulated, winTrades, winRate, average } = computeStats(trades);

  DOM.valRegistered.textContent = count;
  DOM.subRegistered.textContent = `/ 35 no bloco`;
  const pct = (count / TRADES_PER_BLOCK) * 100;
  DOM.progressRegistered.style.width = `${pct}%`;

  DOM.valAccumulated.textContent = formatCurrency(accumulated);

  DOM.kpiAccumulatedCard.classList.remove('win-trend', 'loss-trend');
  DOM.kpiWinrateCard.classList.remove('win-trend');
  DOM.kpiAverageCard.classList.remove('win-trend', 'loss-trend');

  if (count === 0) {
    DOM.indAccumulated.textContent = 'Sem operações';
    DOM.indAccumulated.className = 'kpi-indicator';
  } else if (accumulated >= 0) {
    DOM.indAccumulated.textContent = 'Saldo positivo';
    DOM.indAccumulated.className = 'kpi-indicator pnl-positive';
    DOM.kpiAccumulatedCard.classList.add('win-trend');
  } else {
    DOM.indAccumulated.textContent = 'Saldo negativo';
    DOM.indAccumulated.className = 'kpi-indicator pnl-negative';
    DOM.kpiAccumulatedCard.classList.add('loss-trend');
  }

  DOM.valWinrate.textContent = `${winRate}%`;
  if (count > 0) {
    DOM.indWinrate.textContent = `${winTrades} de ${count} vitoriosos`;
    if (winRate >= 50) DOM.kpiWinrateCard.classList.add('win-trend');
  } else {
    DOM.indWinrate.textContent = 'Taxa de acerto do bloco';
  }

  DOM.valAverage.textContent = formatCurrency(average);
  if (count === 0) {
    DOM.indAverage.textContent = 'Média de lucro/prejuízo';
    DOM.indAverage.className = 'kpi-indicator';
  } else if (average >= 0) {
    DOM.indAverage.textContent = 'Média positiva';
    DOM.indAverage.className = 'kpi-indicator pnl-positive';
    DOM.kpiAverageCard.classList.add('win-trend');
  } else {
    DOM.indAverage.textContent = 'Média negativa';
    DOM.indAverage.className = 'kpi-indicator pnl-negative';
    DOM.kpiAverageCard.classList.add('loss-trend');
  }

  DOM.summaryTradesCount.textContent = count;
  DOM.summaryWinrate.textContent = `${winRate}%`;
  DOM.summaryPL.textContent = formatCurrency(accumulated);
  DOM.summaryPL.className = accumulated >= 0 ? 'pnl-positive' : 'pnl-negative';
  if (count === 0) DOM.summaryPL.className = '';
}
```

- [ ] **Step 6: Rodar o rig — D2 continua passando (guarda de regressão)**

```bash
cd /c/Users/nikol/AppData/Local/Temp/trades777-rig && node verify-dashboard.mjs
```

Esperado: **9/12**, o MESMO resultado do Step 3 (D2 = PASS prova que o refactor
não mudou o Diário; H, F2, G2 seguem FAIL até a Task 2). Se D ou D2 falhar, o
refactor quebrou algo: corrigir antes de commitar.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/nikol/Desktop/Niko/projetos/apps/Monolith
git add app.js
git commit -m "refactor(kpi): extrai computeStats() compartilhada

Mesma matemática de updateKPIs(), agora reutilizável pelo Dashboard.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `kpi-grid` no HTML + refs de DOM + `renderDashboard()` com KPIs

**Files:**
- Modify: `index.html` — inserir `kpi-grid` dentro de `#page-dashboard`, entre o fechamento do `page-header` (linha ~188) e o comentário `<!-- Card do Gráfico de Performance (conta inteira) -->` (linha ~190)
- Modify: `app.js` — `cacheDOM()` (após as refs `dashSummary*`, linha ~96) e substituição de `renderDashboard()` (linhas ~642-662 antes da Task 1; procurar pela função)

**Interfaces:**
- Consumes: `computeStats(trades)` da Task 1 (nomes exatos: `count`, `accumulated`, `winTrades`, `winRate`, `average`); `getAllTrades()`, `renderChart(canvas, trades, opts)`, `dashChartInstance`, `formatCurrency()`, `state.blocks` (existentes).
- Produces: IDs `dash-kpi-registered`, `dash-kpi-accumulated`, `dash-kpi-winrate`, `dash-kpi-average`, `dash-val-registered`, `dash-sub-registered`, `dash-val-accumulated`, `dash-ind-accumulated`, `dash-val-winrate`, `dash-ind-winrate`, `dash-val-average`, `dash-ind-average` (os que o rig da Task 1 espera).

- [ ] **Step 1: Inserir a `kpi-grid` no `index.html`**

Dentro de `#page-dashboard`, logo APÓS o `</div>` que fecha o `page-header` e ANTES
de `<!-- Card do Gráfico de Performance (conta inteira) -->`:

```html
        <!-- Cards de Estatísticas da Conta (KPIs) -->
        <div class="kpi-grid">
          <div class="kpi-card" id="dash-kpi-registered">
            <div class="kpi-icon-wrapper">
              <i data-lucide="layers"></i>
            </div>
            <div class="kpi-data">
              <span class="kpi-title">Operações registradas</span>
              <div class="kpi-value-row">
                <span class="kpi-value" id="dash-val-registered">0</span>
                <span class="kpi-subtext" id="dash-sub-registered">em 1 bloco</span>
              </div>
            </div>
          </div>

          <div class="kpi-card" id="dash-kpi-accumulated">
            <div class="kpi-icon-wrapper">
              <i data-lucide="dollar-sign"></i>
            </div>
            <div class="kpi-data">
              <span class="kpi-title">Resultado acumulado</span>
              <div class="kpi-value-row">
                <span class="kpi-value" id="dash-val-accumulated">$ 0.00</span>
              </div>
              <span class="kpi-indicator" id="dash-ind-accumulated">Sem operações</span>
            </div>
          </div>

          <div class="kpi-card" id="dash-kpi-winrate">
            <div class="kpi-icon-wrapper">
              <i data-lucide="award"></i>
            </div>
            <div class="kpi-data">
              <span class="kpi-title">Win rate</span>
              <div class="kpi-value-row">
                <span class="kpi-value" id="dash-val-winrate">0%</span>
              </div>
              <span class="kpi-indicator" id="dash-ind-winrate">Taxa de acerto da conta</span>
            </div>
          </div>

          <div class="kpi-card" id="dash-kpi-average">
            <div class="kpi-icon-wrapper">
              <i data-lucide="trending-up"></i>
            </div>
            <div class="kpi-data">
              <span class="kpi-title">Média por operação</span>
              <div class="kpi-value-row">
                <span class="kpi-value" id="dash-val-average">$ 0.00</span>
              </div>
              <span class="kpi-indicator" id="dash-ind-average">Média de lucro/prejuízo</span>
            </div>
          </div>
        </div>
```

- [ ] **Step 2: Cachear as refs novas em `cacheDOM()`**

Logo APÓS `DOM.dashSummaryPL = document.getElementById('dash-summary-pl');`:

```js
  DOM.dashKpiAccumulatedCard = document.getElementById('dash-kpi-accumulated');
  DOM.dashKpiWinrateCard     = document.getElementById('dash-kpi-winrate');
  DOM.dashKpiAverageCard     = document.getElementById('dash-kpi-average');
  DOM.dashValRegistered      = document.getElementById('dash-val-registered');
  DOM.dashSubRegistered      = document.getElementById('dash-sub-registered');
  DOM.dashValAccumulated     = document.getElementById('dash-val-accumulated');
  DOM.dashIndAccumulated     = document.getElementById('dash-ind-accumulated');
  DOM.dashValWinrate         = document.getElementById('dash-val-winrate');
  DOM.dashIndWinrate         = document.getElementById('dash-ind-winrate');
  DOM.dashValAverage         = document.getElementById('dash-val-average');
  DOM.dashIndAverage         = document.getElementById('dash-ind-average');
```

(O card `dash-kpi-registered` não precisa de ref: nunca recebe classes de trend —
mesma convenção do Diário.)

- [ ] **Step 3: Substituir `renderDashboard()`**

Substituir a função inteira por:

```js
function renderDashboard() {
  if (!domReady) return;
  const trades = getAllTrades();
  const { count, accumulated, winTrades, winRate, average } = computeStats(trades);

  // Cards de KPI da conta
  const totalBlocks = Math.max(1, Object.keys(state.blocks).length);
  DOM.dashValRegistered.textContent = count;
  DOM.dashSubRegistered.textContent = totalBlocks === 1 ? 'em 1 bloco' : `em ${totalBlocks} blocos`;

  DOM.dashValAccumulated.textContent = formatCurrency(accumulated);
  DOM.dashKpiAccumulatedCard.classList.remove('win-trend', 'loss-trend');
  DOM.dashKpiWinrateCard.classList.remove('win-trend');
  DOM.dashKpiAverageCard.classList.remove('win-trend', 'loss-trend');

  if (count === 0) {
    DOM.dashIndAccumulated.textContent = 'Sem operações';
    DOM.dashIndAccumulated.className = 'kpi-indicator';
  } else if (accumulated >= 0) {
    DOM.dashIndAccumulated.textContent = 'Saldo positivo';
    DOM.dashIndAccumulated.className = 'kpi-indicator pnl-positive';
    DOM.dashKpiAccumulatedCard.classList.add('win-trend');
  } else {
    DOM.dashIndAccumulated.textContent = 'Saldo negativo';
    DOM.dashIndAccumulated.className = 'kpi-indicator pnl-negative';
    DOM.dashKpiAccumulatedCard.classList.add('loss-trend');
  }

  DOM.dashValWinrate.textContent = `${winRate}%`;
  if (count > 0) {
    DOM.dashIndWinrate.textContent = `${winTrades} de ${count} vitoriosos`;
    if (winRate >= 50) DOM.dashKpiWinrateCard.classList.add('win-trend');
  } else {
    DOM.dashIndWinrate.textContent = 'Taxa de acerto da conta';
  }

  DOM.dashValAverage.textContent = formatCurrency(average);
  if (count === 0) {
    DOM.dashIndAverage.textContent = 'Média de lucro/prejuízo';
    DOM.dashIndAverage.className = 'kpi-indicator';
  } else if (average >= 0) {
    DOM.dashIndAverage.textContent = 'Média positiva';
    DOM.dashIndAverage.className = 'kpi-indicator pnl-positive';
    DOM.dashKpiAverageCard.classList.add('win-trend');
  } else {
    DOM.dashIndAverage.textContent = 'Média negativa';
    DOM.dashIndAverage.className = 'kpi-indicator pnl-negative';
    DOM.dashKpiAverageCard.classList.add('loss-trend');
  }

  // Resumo do card do gráfico
  DOM.dashSummaryTradesCount.textContent = count;
  DOM.dashSummaryWinrate.textContent = `${winRate}%`;
  DOM.dashSummaryPL.textContent = formatCurrency(accumulated);
  DOM.dashSummaryPL.className = count === 0 ? '' : (accumulated >= 0 ? 'pnl-positive' : 'pnl-negative');

  // Canvas em seção oculta tem tamanho 0 — só desenha com a aba visível;
  // a troca de aba chama renderDashboard() de novo.
  if (!DOM.pageDashboard.classList.contains('active')) return;

  if (dashChartInstance) dashChartInstance.destroy();
  dashChartInstance = renderChart(DOM.canvasDashChart, trades, { startLabel: 'Início da Conta' });
}
```

- [ ] **Step 4: Rodar o rig — TODOS os checks devem passar**

```bash
cd /c/Users/nikol/AppData/Local/Temp/trades777-rig && node verify-dashboard.mjs
```

Esperado: **12/12 checks OK**, exit code 0 (cobre os 4 itens de verificação do
spec: H com seed, D/D2 de regressão, F2 pós-CRUD, G2 conta vazia).

- [ ] **Step 5: Commit e encerrar o rig**

```bash
cd /c/Users/nikol/Desktop/Niko/projetos/apps/Monolith
git add index.html app.js
git commit -m "feat(dashboard): KPIs da conta inteira na aba Dashboard

Espelha os 4 cards do Diário (operações, acumulado, win rate, média) com a
conta completa; \"em N blocos\" no lugar da barra de progresso.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
# matar o http.server em background ao final
```
