# Aba Dashboard — Gráfico de Performance da Conta — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o placeholder da aba "Dashboard" por uma página real cujo primeiro widget é o card "Performance da Conta" com a soma acumulada do P&L de **todos os blocos** (o card do Diário permanece intacto, focado no bloco ativo).

**Architecture:** Nova `<section id="page-dashboard">` no `index.html` reusando as classes CSS do card existente; em `app.js`, `renderChart()` é parametrizada por canvas (duas instâncias independentes de Chart.js), e uma nova `renderDashboard()` — alimentada por `getAllTrades()` — é chamada por `renderApp()` (ponto único de re-render: CRUD, Realtime, tema, import/reset) e pelo clique na aba.

**Tech Stack:** HTML/CSS/JS vanilla (ES Modules, sem build), Chart.js via CDN, Lucide, Supabase (somente leitura do estado já carregado — zero mudança de banco/serviços).

**Spec:** `docs/superpowers/specs/2026-07-10-dashboard-grafico-performance-design.md`

## Global Constraints

- Vanilla JS + ES Modules, **sem framework e sem build** (compatível com GitHub Pages).
- Todo texto de UI, comentários e commits em **pt-BR com acentuação correta**.
- **Nenhum CSS novo** — reusar `card-chart-container`, `chart-header`, `chart-wrapper` etc.
- **Nenhuma mudança** em `supabase/schema.sql` ou `js/services/*`.
- **`node_modules` nunca entra no repo** — o rig de verificação vive fora
  (`C:/Users/nikol/AppData/Local/Temp/trades777-rig`).
- Verificação no navegador real com Supabase stubado (skill do projeto:
  `.claude/skills/verify/SKILL.md`), **antes de cada commit**.

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `index.html` | Criar seção `#page-dashboard` (após `</header>`, antes de `#page-trading-journal`) |
| `app.js` | Refs de DOM novas; `renderChart(canvas, trades, opts)`; `getAllTrades()`; `renderDashboard()`; integração em `renderApp()`, `tabToPage` e teardown |
| `C:/Users/nikol/AppData/Local/Temp/trades777-rig/verify-dashboard.mjs` | Script de verificação (fora do repo) — escrito na Task 1, usado nas 3 tasks |

O script de verificação cobre todos os checks do spec e funciona como a suíte de
testes do plano: na Task 1 parte dos checks falha por design (TDD — o gráfico ainda
não existe); na Task 3 todos passam.

---

### Task 1: Rig de verificação + página Dashboard no HTML + registro da aba

**Files:**
- Create: `C:/Users/nikol/AppData/Local/Temp/trades777-rig/verify-dashboard.mjs` (fora do repo)
- Modify: `index.html` (inserir seção após `</header>`, linha ~179, antes de `<section class="page-section" id="page-trading-journal">`)
- Modify: `app.js` — `cacheDOM()` (linhas ~63-69 e ~86-89) e `tabToPage` em `setupEventListeners()` (linha ~755)

**Interfaces:**
- Consumes: classes CSS existentes (`page-section`, `card-chart-container`, `chart-header`, `chart-wrapper`, `summary-item`); mecânica de abas existente (`data-tab` → `tabToPage`).
- Produces: IDs `#page-dashboard`, `#dashboardChart`, `#dash-summary-trades-count`, `#dash-summary-winrate`, `#dash-summary-pl`; refs `DOM.pageDashboard`, `DOM.canvasDashChart`, `DOM.dashSummaryTradesCount`, `DOM.dashSummaryWinrate`, `DOM.dashSummaryPL` (Tasks 2 e 3 dependem desses nomes exatos).

- [ ] **Step 1: Montar o rig (fora do repo) e subir o servidor**

```bash
mkdir -p /c/Users/nikol/AppData/Local/Temp/trades777-rig
cd /c/Users/nikol/AppData/Local/Temp/trades777-rig
npm init -y >/dev/null 2>&1
npm i puppeteer-core >/dev/null 2>&1
# servidor do app (deixar rodando em background):
cd /c/Users/nikol/Desktop/Niko/projetos/apps/trades777
python -m http.server 8077 &
```

- [ ] **Step 2: Escrever o script de verificação completo (os checks do gráfico DEVEM falhar agora)**

Criar `C:/Users/nikol/AppData/Local/Temp/trades777-rig/verify-dashboard.mjs`:

```js
// verify-dashboard.mjs — verificação da aba Dashboard (stub + puppeteer)
// Pré-requisitos: `npm i puppeteer-core` neste diretório; app servido em :8077.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const APP = 'http://localhost:8077';
const STUB = readFileSync(
  'C:/Users/nikol/Desktop/Niko/projetos/apps/trades777/.claude/skills/verify/stub-supabase-client.js',
  'utf8'
);

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Seed: bloco 1 = 35 takes de +10 (+350); bloco 2 = +20,+20,+20,-15,-15 (+30).
// Total: 40 trades, +380, 38 vitórias → 95%. Bloco ativo = 2.
function row(block, pos, type, pnl) {
  return { id: `seed-${block}-${pos}`, user_id: 'stub-user-1', block_index: block,
           position: pos, asset: 'EURUSD', type, pnl, trade_date: '2026-07-01', notes: null };
}
const SEED = {
  trades: [],
  user_preferences: [{ user_id: 'stub-user-1', active_block_index: 2, theme: 'dark' }],
  trading_plans: []
};
for (let i = 0; i < 35; i++) SEED.trades.push(row(1, i, 'take', 10));
[20, 20, 20, -15, -15].forEach((pnl, i) =>
  SEED.trades.push(row(2, i, pnl > 0 ? 'take' : 'stop', pnl)));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox']
});
const page = await browser.newPage();
page.on('dialog', (d) => d.accept());
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('/js/supabase-client.js')) {
    req.respond({ status: 200, contentType: 'application/javascript; charset=utf-8', body: STUB });
  } else req.continue();
});

async function boot(seed) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.evaluate((db) => {
    if (db) localStorage.setItem('__stub_db__', JSON.stringify(db));
    else localStorage.removeItem('__stub_db__');
  }, seed);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#app-shell:not(.hidden)', { timeout: 15000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('app-loading');
    return !el || el.offsetParent === null || getComputedStyle(el).display === 'none';
  }, { timeout: 15000 });
  await sleep(800); // ícones Lucide (CDN)
}

function readDashChart() {
  return page.evaluate(() => {
    const canvas = document.getElementById('dashboardChart');
    const c = canvas && window.Chart ? Chart.getChart(canvas) : null;
    if (!c) return null;
    const data = c.data.datasets[0].data;
    return {
      points: data.length,
      last: data[data.length - 1],
      label0: c.data.labels[0],
      count: document.getElementById('dash-summary-trades-count').textContent,
      wr: document.getElementById('dash-summary-winrate').textContent,
      pl: document.getElementById('dash-summary-pl').textContent
    };
  });
}

// ---------- Boot com seed de 2 blocos ----------
await boot(SEED);

// A) A aba Dashboard mostra página própria (não o placeholder)
await page.click('[data-tab="dashboard"]');
await sleep(300);
const pageState = await page.evaluate(() => ({
  dash: !!document.querySelector('#page-dashboard.active'),
  placeholder: !!document.querySelector('#page-placeholder.active')
}));
check('A. aba Dashboard ativa #page-dashboard (não o placeholder)',
  pageState.dash && !pageState.placeholder, JSON.stringify(pageState));

// B) Card do gráfico e resumo presentes
const els = await page.evaluate(() => ({
  canvas: !!document.getElementById('dashboardChart'),
  count: !!document.getElementById('dash-summary-trades-count'),
  wr: !!document.getElementById('dash-summary-winrate'),
  pl: !!document.getElementById('dash-summary-pl')
}));
check('B. card do gráfico e resumo presentes', els.canvas && els.count && els.wr && els.pl);

// C) Gráfico do Dashboard = conta inteira
const dash = await readDashChart();
check('C. gráfico com 41 pontos e acumulado final 380',
  !!dash && dash.points === 41 && Math.abs(dash.last - 380) < 0.001, JSON.stringify(dash));
check('C2. resumo: 40 trades, 95%, P/L com 380',
  !!dash && dash.count === '40' && dash.wr === '95%' && dash.pl.includes('380'));

// D) Diário intacto: bloco ativo (2) com 5 trades → 6 pontos, acumulado 30
await page.click('[data-tab="trading-journal"]');
await sleep(300);
const journal = await page.evaluate(() => {
  const canvas = document.getElementById('performanceChart');
  const c = canvas && window.Chart ? Chart.getChart(canvas) : null;
  if (!c) return null;
  const data = c.data.datasets[0].data;
  return { points: data.length, last: data[data.length - 1] };
});
check('D. Diário segue por bloco: 6 pontos, acumulado 30',
  !!journal && journal.points === 6 && Math.abs(journal.last - 30) < 0.001, JSON.stringify(journal));

// E) Troca de tema com o Dashboard aberto redesenha o gráfico
await page.click('[data-tab="dashboard"]');
await sleep(300);
await page.click('#btn-theme-toggle');
await sleep(500);
const afterTheme = await readDashChart();
const isLight = await page.evaluate(() => document.body.classList.contains('light-theme'));
check('E. tema alternado e gráfico redesenhado (41 pontos)',
  !!afterTheme && afterTheme.points === 41 && isLight, JSON.stringify({ afterTheme, isLight }));

// F) Criar trade pela UI atualiza o Dashboard (42 pontos, acumulado 430, 41 trades)
await page.click('[data-tab="trading-journal"]');
await sleep(300);
await page.click('#btn-new-trade-header');
await page.waitForSelector('#trade-modal.active');
await page.type('#trade-asset', 'WIN');
await page.select('#trade-type', 'take');
await page.type('#trade-pnl', '50');
await page.click('#btn-submit-modal');
await sleep(800);
await page.click('[data-tab="dashboard"]');
await sleep(300);
const afterCrud = await readDashChart();
check('F. novo trade reflete no Dashboard: 42 pontos, acumulado 430, 41 trades',
  !!afterCrud && afterCrud.points === 42 && Math.abs(afterCrud.last - 430) < 0.001 &&
  afterCrud.count === '41', JSON.stringify(afterCrud));

// G) Conta vazia: só o ponto "Start" em 0
await boot(null);
await page.click('[data-tab="dashboard"]');
await sleep(300);
const empty = await readDashChart();
check('G. conta vazia: 1 ponto "Start" em 0',
  !!empty && empty.points === 1 && empty.last === 0 && empty.label0 === 'Start' &&
  empty.count === '0', JSON.stringify(empty));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks OK`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Rodar o script e confirmar a linha de base (tudo do Dashboard falha)**

```bash
cd /c/Users/nikol/AppData/Local/Temp/trades777-rig
node verify-dashboard.mjs
```

Esperado: **A, B, C, C2, E, F, G = FAIL** (a seção não existe; clique cai no
placeholder) e **D = PASS** (Diário funciona hoje). Exit code 1.

- [ ] **Step 4: Inserir a seção Dashboard no `index.html`**

Logo após `</header>` (linha ~179) e **antes** de
`<section class="page-section" id="page-trading-journal">`:

```html
      <!-- Página: Dashboard -->
      <section class="page-section" id="page-dashboard">

        <div class="page-header">
          <div class="page-title-area">
            <h1>Dashboard</h1>
            <p>Visão geral da sua conta</p>
          </div>
        </div>

        <!-- Card do Gráfico de Performance (conta inteira) -->
        <div class="card-chart-container">
          <div class="chart-header">
            <div class="chart-header-left">
              <div class="chart-title-icon">
                <i data-lucide="activity"></i>
              </div>
              <div>
                <h3>Performance da Conta</h3>
                <p>Evolução acumulada de todos os blocos</p>
              </div>
            </div>
            <div class="chart-header-right" id="dash-stats-summary">
              <span class="summary-item">Trades: <strong id="dash-summary-trades-count">0</strong></span>
              <span class="summary-item">Win Rate: <strong id="dash-summary-winrate">0%</strong></span>
              <span class="summary-item">P/L: <strong id="dash-summary-pl">$ 0.00</strong></span>
            </div>
          </div>
          <div class="chart-wrapper">
            <canvas id="dashboardChart"></canvas>
          </div>
        </div>

      </section>
```

- [ ] **Step 5: Cachear os elementos novos e registrar a aba em `app.js`**

Em `cacheDOM()`, logo após `DOM.pageTradingPlan = document.getElementById('page-trading-plan');` (linha ~69):

```js
  DOM.pageDashboard     = document.getElementById('page-dashboard');
```

Em `cacheDOM()`, logo após `DOM.canvasChart = document.getElementById('performanceChart');` (linha ~89):

```js
  DOM.canvasDashChart        = document.getElementById('dashboardChart');
  DOM.dashSummaryTradesCount = document.getElementById('dash-summary-trades-count');
  DOM.dashSummaryWinrate     = document.getElementById('dash-summary-winrate');
  DOM.dashSummaryPL          = document.getElementById('dash-summary-pl');
```

Em `setupEventListeners()` (linha ~755), adicionar a primeira entrada de `tabToPage`:

```js
  const tabToPage = {
    'dashboard':       DOM.pageDashboard,
    'trading-journal': DOM.pageTradingJournal,
    'forex-calc':      DOM.pageForexCalc,
    'futures-calc':    DOM.pageFuturesCalc,
    'b3-calc':         DOM.pageB3Calc,
    'btc-calc':        DOM.pageBtcCalc,
    'trading-plan':    DOM.pageTradingPlan
  };
```

- [ ] **Step 6: Rodar o script — A, B e D devem passar**

```bash
cd /c/Users/nikol/AppData/Local/Temp/trades777-rig && node verify-dashboard.mjs
```

Esperado: **A, B, D = PASS**; **C, C2, E, F, G = FAIL** (gráfico ainda não é
renderizado — chega na Task 3). Exit code 1.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/nikol/Desktop/Niko/projetos/apps/trades777
git add index.html app.js
git commit -m "feat(dashboard): página da aba Dashboard com card do gráfico

A aba deixa de cair no placeholder; o gráfico em si chega no próximo commit.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Refatorar `renderChart()` para ser parametrizada por canvas

**Files:**
- Modify: `app.js` — linha 46 (`chartInstance`), linha ~232 (`teardownAuthenticatedApp`), linha ~383 (call site em `renderApp`), linhas ~535-619 (`renderChart`)

**Interfaces:**
- Consumes: nada das tasks anteriores (refactor puro; Diário deve seguir idêntico).
- Produces: `renderChart(canvas, trades, opts = {})` → **retorna** a instância de Chart.js; `opts.startLabel` (string, default `'Início do Bloco'`) define o título do tooltip no ponto 0; variáveis de módulo `journalChartInstance` e `dashChartInstance` (a Task 3 usa `dashChartInstance` e `renderChart(DOM.canvasDashChart, trades, { startLabel: 'Início da Conta' })`).

- [ ] **Step 1: Trocar a variável global do gráfico por duas instâncias**

Linha 46, substituir:

```js
let chartInstance  = null;
```

por:

```js
let journalChartInstance = null; // gráfico do Diário (bloco ativo)
let dashChartInstance    = null; // gráfico do Dashboard (conta inteira)
```

- [ ] **Step 2: Destruir as duas instâncias no teardown**

Em `teardownAuthenticatedApp()` (linha ~232), substituir:

```js
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
```

por:

```js
  if (journalChartInstance) { journalChartInstance.destroy(); journalChartInstance = null; }
  if (dashChartInstance)    { dashChartInstance.destroy();    dashChartInstance = null; }
```

- [ ] **Step 3: Parametrizar `renderChart`**

Substituir a função inteira (linhas ~535-619) por (mudanças: assinatura, `startLabel`,
`ctx` do canvas recebido, sem `destroy` interno, `return` em vez de atribuição):

```js
function renderChart(canvas, trades, opts = {}) {
  const startLabel = opts.startLabel || 'Início do Bloco';
  const labels = ['Start'];
  const data = [0];
  let currentSum = 0;
  trades.forEach((trade, index) => {
    currentSum += trade.pnl;
    labels.push(String(index + 1));
    data.push(Number(currentSum.toFixed(2)));
  });

  const isPositive = currentSum >= 0;
  const colorPrimary = isPositive ? '#10b981' : '#f43f5e';
  const colorGradientStart = isPositive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';
  const colorGradientEnd   = 'rgba(244, 63, 94, 0.0)';

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, colorGradientStart);
  gradient.addColorStop(1, colorGradientEnd);

  const isLight = document.body.classList.contains('light-theme');
  const gridColorX = isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.02)';
  const gridColorY = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.03)';
  const tickColor = isLight ? '#4b5563' : '#64748b';
  const tooltipBg = isLight ? '#ffffff' : '#111622';
  const tooltipBorder = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
  const tooltipText = isLight ? '#1f2937' : '#f8fafc';
  const pointBorderColor = isLight ? '#ffffff' : '#0c0f17';
  const crosshairColor = isLight ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.28)';

  const crosshairPlugin = {
    id: 'crosshair',
    afterDraw(chart) {
      const active = chart.tooltip?.getActiveElements?.() || [];
      if (!active.length) return;
      const x = active[0].element.x;
      const { top, bottom } = chart.chartArea;
      const c = chart.ctx;
      c.save();
      c.beginPath();
      c.moveTo(x, top);
      c.lineTo(x, bottom);
      c.lineWidth = 1;
      c.strokeStyle = crosshairColor;
      c.stroke();
      c.restore();
    }
  };

  return new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{
      label: 'Resultado Acumulado', data,
      borderColor: colorPrimary, borderWidth: 2,
      pointBackgroundColor: colorPrimary,
      pointBorderColor: pointBorderColor, pointBorderWidth: 2,
      pointRadius: labels.length > 20 ? 2 : 4,
      pointHoverRadius: 6, tension: 0.35,
      fill: true, backgroundColor: gradient
    }] },
    plugins: [crosshairPlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg, titleColor: tooltipText, bodyColor: tooltipText,
          titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 12 },
          borderColor: tooltipBorder, borderWidth: 1, padding: 10, displayColors: false,
          callbacks: {
            title: (c) => c[0].dataIndex === 0 ? startLabel : `Operação #${c[0].dataIndex}`,
            label: (c) => { const v = c.raw; return `Acumulado: ${v >= 0 ? '+' : ''}${formatCurrency(v)}`; }
          }
        }
      },
      scales: {
        x: { grid: { color: gridColorX, drawBorder: false }, ticks: { color: tickColor, font: { family: 'Inter', size: 10 } } },
        y: { grid: { color: gridColorY, drawBorder: false }, ticks: { color: tickColor, font: { family: 'Inter', size: 10 }, callback: (v) => formatCurrency(v) } }
      }
    }
  });
}
```

- [ ] **Step 4: Atualizar o call site em `renderApp()`**

Linha ~383, substituir:

```js
  renderChart(blockTrades);
```

por:

```js
  if (journalChartInstance) journalChartInstance.destroy();
  journalChartInstance = renderChart(DOM.canvasChart, blockTrades);
```

- [ ] **Step 5: Rodar o script — D continua passando (guarda de regressão)**

```bash
cd /c/Users/nikol/AppData/Local/Temp/trades777-rig && node verify-dashboard.mjs
```

Esperado: **A, B, D = PASS**; **C, C2, E, F, G = FAIL** (mesma linha de base da
Task 1 — o refactor não pode mudar comportamento). Se **D falhar**, o refactor
quebrou o Diário: parar e corrigir antes de commitar.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/nikol/Desktop/Niko/projetos/apps/trades777
git add app.js
git commit -m "refactor(chart): renderChart parametrizada por canvas

Prepara a segunda instância (Dashboard) sem mudar o comportamento do Diário.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `getAllTrades()` + `renderDashboard()` + integração

**Files:**
- Modify: `app.js` — nova seção "DASHBOARD" logo após o fim de `renderChart()`; chamada em `renderApp()` (após o bloco do gráfico do Diário); clique da aba em `setupEventListeners()` (linha ~774)

**Interfaces:**
- Consumes: `renderChart(canvas, trades, opts)` e `dashChartInstance` (Task 2); `DOM.pageDashboard`, `DOM.canvasDashChart`, `DOM.dashSummary*` (Task 1); `state.blocks`, `formatCurrency()` (existentes).
- Produces: `getAllTrades()` → `Trade[]` (ordem: bloco 1..N, posição dentro do bloco); `renderDashboard()` → void (atualiza resumo sempre; desenha o gráfico só com a aba visível).

- [ ] **Step 1: Adicionar `getAllTrades()` e `renderDashboard()`**

Logo após o fechamento de `renderChart()` (antes de `// MODAL CRUD`):

```js
// ==========================================================================
// DASHBOARD
// ==========================================================================
/** Todos os trades da conta, na ordem: bloco 1..N, posição dentro do bloco. */
function getAllTrades() {
  return Object.keys(state.blocks)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap(idx => state.blocks[String(idx)] || []);
}

function renderDashboard() {
  if (!domReady) return;
  const trades = getAllTrades();

  const count = trades.length;
  const accumulatedPnL = trades.reduce((s, t) => s + t.pnl, 0);
  const winTrades = trades.filter(t => t.pnl > 0).length;
  const winRate = count > 0 ? Math.round((winTrades / count) * 100) : 0;

  DOM.dashSummaryTradesCount.textContent = count;
  DOM.dashSummaryWinrate.textContent = `${winRate}%`;
  DOM.dashSummaryPL.textContent = formatCurrency(accumulatedPnL);
  DOM.dashSummaryPL.className = count === 0 ? '' : (accumulatedPnL >= 0 ? 'pnl-positive' : 'pnl-negative');

  // Canvas em seção oculta tem tamanho 0 — só desenha com a aba visível;
  // a troca de aba chama renderDashboard() de novo.
  if (!DOM.pageDashboard.classList.contains('active')) return;

  if (dashChartInstance) dashChartInstance.destroy();
  dashChartInstance = renderChart(DOM.canvasDashChart, trades, { startLabel: 'Início da Conta' });
}
```

- [ ] **Step 2: Chamar em `renderApp()`**

Logo após as duas linhas do gráfico do Diário (Task 2, Step 4), adicionar:

```js
  renderDashboard();
```

- [ ] **Step 3: Renderizar ao entrar na aba**

No handler de clique das abas (linha ~774), substituir:

```js
        if (tabName === 'trading-journal') renderApp();
```

por:

```js
        if (tabName === 'trading-journal') renderApp();
        else if (tabName === 'dashboard') renderDashboard();
```

- [ ] **Step 4: Rodar o script — TODOS os checks devem passar**

```bash
cd /c/Users/nikol/AppData/Local/Temp/trades777-rig && node verify-dashboard.mjs
```

Esperado: **A, B, C, C2, D, E, F, G = PASS** — `8/8 checks OK`, exit code 0.
Isso cobre os 5 itens de verificação do spec (aba com conta inteira, Diário
intacto, tema, conta vazia, CRUD com a aba aberta).

- [ ] **Step 5: Commit e encerrar o rig**

```bash
cd /c/Users/nikol/Desktop/Niko/projetos/apps/trades777
git add app.js
git commit -m "feat(dashboard): gráfico de performance da conta inteira

Soma acumulada de todos os blocos + resumo (trades, win rate, P/L) no card.
Atualiza via renderApp() (CRUD, Realtime, tema, import/reset).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
# matar o http.server em background ao final da verificação
```
