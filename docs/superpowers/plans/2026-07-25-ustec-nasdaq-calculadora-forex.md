# USTEC (Nasdaq 100 CFD) na Calculadora Forex — Implementation Plan

> **Plano executado e depois corrigido (2026-07-25).** Ele foi escrito com a premissa
> errada de que o stop do USTEC é medido em pontos a $1 cada. A unidade correta é o
> **pip = 0,1 ponto → $0,10 por lote**, e o stop segue em pips como nos pares de moedas.
> Os números e rótulos abaixo estão desatualizados: a fonte de verdade é a spec
> (`docs/superpowers/specs/2026-07-25-ustec-nasdaq-calculadora-forex-design.md`) e o
> código. Mantido como registro do que foi executado.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir dimensionar posição em USTEC (Nasdaq 100 CFD) pela Calculadora Forex do Monolith, a $1 por ponto, com o painel de resultado adaptado ao vocabulário de índice.

**Architecture:** Nenhuma tela nova. O seletor `#fx-pair` passa a aceitar um CFD de índice além dos pares de moedas. Uma tabela `INDEX_CFD_SPECS` no `app.js` é a única fonte de verdade de "este ativo é índice"; tanto o cálculo (`forexPipValuePerLot`) quanto a UI (`applyForexAssetMode`) consultam ela. A fórmula e o arredondamento (0,01 lote, para baixo) já existentes não mudam — só a origem do valor do pip.

**Tech Stack:** HTML/CSS/JavaScript vanilla (ES Modules), sem build e sem npm no repositório. Verificação com `puppeteer-core` + Chrome do sistema, fora do repo.

## Global Constraints

- **Vanilla JS + ES Modules, sem framework e sem build** — o app roda em GitHub Pages como arquivos estáticos.
- **Todo texto de UI em pt-BR com acentuação correta** ("não", "posição", "índice").
- **Nenhum ID existente do `index.html` pode mudar** — os handlers atuais dependem deles. Só se acrescentam IDs novos.
- **Valor do ponto do USTEC: `1`** (1 lote × 1 ponto = US$ 1,00). Conta em USD, sem conversão de moeda.
- **Arredondamento sempre para baixo** no passo de 0,01 lote, para nunca ultrapassar o risco definido: `Math.floor(x * 100) / 100`.
- **Esconder/mostrar elemento usa `style.display`** — a classe `.hidden` do projeto só existe para `#app-shell` (`auth.css:194`), não é utilitária.
- **`toast(mensagem, kind)` aceita `'success' | 'error' | 'info'`** (`auth.css:260-262`). Não existe `'warning'`.
- **`node_modules` nunca entra no repositório** — o rig de verificação vive em `C:/Users/nikol/AppData/Local/Temp/trades777-rig/`, fora do repo.
- Escopo: **apenas USTEC**. Não adicionar US30/US500. Não alterar o comportamento de XAU/USD.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---------|------------------|------|
| `index.html` | Markup da Calculadora Forex: `<option>` do USTEC, label "Ativo", IDs novos nos elementos que mudam de texto/visibilidade | Modificar |
| `app.js` | `INDEX_CFD_SPECS`, exceção em `forexPipValuePerLot()`, `applyForexAssetMode()`, ajustes em `calculateForex()` e `setupCalculatorsListeners()` | Modificar |
| `CLAUDE.md` | Linha que descreve as calculadoras de risco | Modificar (Task 4) |
| `%TEMP%/trades777-rig/verify-forex-ustec.mjs` | Harness de verificação (fora do repo, nunca commitado) | Criar (Task 1), estender (Tasks 2-4) |

**Pré-requisitos já verificados nesta máquina** (não precisa instalar nada): Node v24.16.0, `puppeteer-core` em `C:/Users/nikol/AppData/Local/Temp/trades777-rig/node_modules`, Chrome em `C:/Program Files/Google/Chrome/Application/chrome.exe`.

---

### Task 1: USTEC calcula a $1 por ponto

**Files:**
- Create: `C:/Users/nikol/AppData/Local/Temp/trades777-rig/verify-forex-ustec.mjs`
- Modify: `index.html:455` (seletor `#fx-pair`)
- Modify: `app.js:1168-1179` (`forexPipValuePerLot`)

**Interfaces:**
- Produces: `INDEX_CFD_SPECS` — objeto `{ [ticker]: { pointValue: number } }`, consultado com `INDEX_CFD_SPECS[pair]` (truthy = é índice). Tasks 2, 3 e 4 dependem dele.
- Produces: `forexPipValuePerLot(pair, price)` continua retornando `number` (USD por pip/ponto por lote).

- [ ] **Step 1: Escrever o harness de verificação (teste que vai falhar)**

Criar `C:/Users/nikol/AppData/Local/Temp/trades777-rig/verify-forex-ustec.mjs`:

```js
// verify-forex-ustec.mjs — verificação da Calculadora Forex com USTEC (stub + puppeteer)
// Pré-requisito: app servido em :8077 a partir da raiz do repo Monolith.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const APP = 'http://localhost:8077';
const STUB = readFileSync(
  'C:/Users/nikol/Desktop/Niko/projetos/apps/Monolith/.claude/skills/verify/stub-supabase-client.js',
  'utf8'
);

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox']
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('dialog', (d) => d.accept());
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('/js/supabase-client.js')) {
    req.respond({ status: 200, contentType: 'application/javascript; charset=utf-8', body: STUB });
  } else req.continue();
});

async function boot() {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('__stub_db__'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#app-shell:not(.hidden)', { timeout: 15000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('app-loading');
    return !el || el.offsetParent === null || getComputedStyle(el).display === 'none';
  }, { timeout: 15000 });
  await sleep(800); // ícones Lucide (CDN)
  await page.click('[data-tab="forex-calc"]');
  await sleep(300);
}

// Lê tudo o que o painel Forex mostra. IDs que ainda não existem viram null/false.
function readForex() {
  return page.evaluate(() => {
    const t = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };
    const vis = (id) => { const el = document.getElementById(id); return !!el && el.offsetParent !== null; };
    return {
      risk: t('fx-out-risk'), pipval: t('fx-out-pipval'), lots: t('fx-out-lots'),
      mini: t('fx-out-mini'), micro: t('fx-out-micro'), units: t('fx-out-units'),
      actrisk: t('fx-out-actrisk'),
      stopLabel: t('fx-stop-label'), pipLabel: t('fx-pipval-label'), help: t('fx-help'),
      rowMini: vis('fx-row-mini'), rowMicro: vis('fx-row-micro'), rowUnits: vis('fx-row-units')
    };
  });
}

async function calcForex({ pair, stop, risk }) {
  await page.select('#fx-pair', pair);
  await sleep(150); // deixa o listener de change rodar (Task 2)
  await page.evaluate((s, r) => {
    document.getElementById('fx-stop-pips').value = s;
    document.getElementById('fx-risk').value = r;
  }, String(stop), String(risk));
  await page.click('#btn-fx-calc');
  await sleep(200);
  return readForex();
}

await boot();

// A) O ativo existe no seletor
const hasOption = await page.evaluate(() =>
  !!document.querySelector('#fx-pair option[value="USTEC"]'));
check('A. seletor tem a opção USTEC', hasOption);

// B) USTEC, stop 50 pontos, risco $100 → 2,00 lotes a $1,00/ponto
const b = await calcForex({ pair: 'USTEC', stop: 50, risk: 100 });
check('B. USTEC 50 pontos / $100 → 2.00 lotes, ponto $1.00, risco $100.00',
  b.lots === '2.00' && b.pipval === '$1.00' && b.actrisk === '$100.00', JSON.stringify(b));

// C) Arredondamento para baixo nunca ultrapassa o risco definido
const c = await calcForex({ pair: 'USTEC', stop: 33, risk: 100 });
check('C. USTEC 33 pontos / $100 → 3.03 lotes (não 3.0303) e risco $99.99',
  c.lots === '3.03' && c.actrisk === '$99.99', JSON.stringify(c));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks OK`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Subir o servidor e rodar o harness para vê-lo falhar**

```bash
RIG="C:/Users/nikol/AppData/Local/Temp/trades777-rig"
cd "C:/Users/nikol/Desktop/Niko/projetos/apps/Monolith" && python -m http.server 8077 > "$RIG/http-server.log" 2>&1 &
echo $! > "$RIG/http-server.pid"
sleep 2
cd "$RIG" && node verify-forex-ustec.mjs
```

O PID fica guardado para o servidor ser encerrado no fim (Task 4) sem afetar outros processos Python da máquina.

Esperado: **FAIL** nos 3 checks — `A` porque a `<option>` não existe, `B`/`C` porque `page.select('#fx-pair','USTEC')` não encontra o valor e o cálculo cai no par selecionado por padrão.

- [ ] **Step 3: Adicionar a opção USTEC no seletor**

Em `index.html`, dentro de `<select id="fx-pair">`, depois da linha do ouro:

```html
                  <option value="XAUUSD">XAU/USD (Ouro)</option>
                  <option value="USTEC">USTEC (Nasdaq 100 CFD)</option>
```

- [ ] **Step 4: Adicionar a tabela de specs e a exceção no valor do pip**

Em `app.js`, imediatamente **antes** de `function forexPipValuePerLot(...)`:

```js
// CFDs de índice negociados em lote fracionário: valor fixo em USD por ponto, por lote.
// Única fonte de verdade de "este ativo é índice, não par de moedas" — cálculo e UI consultam daqui.
const INDEX_CFD_SPECS = { USTEC: { pointValue: 1 } };
```

E dentro de `forexPipValuePerLot`, como primeira instrução depois de `const standardLot = 100000;`:

```js
  // CFD de índice (USTEC): valor do ponto é fixo por lote, sem conversão de moeda
  if (INDEX_CFD_SPECS[pair]) return INDEX_CFD_SPECS[pair].pointValue;
```

- [ ] **Step 5: Rodar o harness para vê-lo passar**

```bash
cd "C:/Users/nikol/AppData/Local/Temp/trades777-rig" && node verify-forex-ustec.mjs
```

Esperado: **3/3 checks OK**.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/nikol/Desktop/Niko/projetos/apps/Monolith"
git add index.html app.js
git commit -m "Adiciona USTEC (Nasdaq 100 CFD) ao seletor da Calculadora Forex"
```

---

### Task 2: Modo índice no painel (rótulos e linhas)

**Files:**
- Modify: `index.html:442` (label do seletor), `index.html:462` (label do stop), `index.html:492` (rótulo do valor por pip), `index.html:499-510` (as três linhas), `index.html:515` (texto de ajuda)
- Modify: `app.js` (`applyForexAssetMode`, `calculateForex`, `setupCalculatorsListeners`)
- Test: `%TEMP%/trades777-rig/verify-forex-ustec.mjs` (estender)

**Interfaces:**
- Consumes: `INDEX_CFD_SPECS` (Task 1).
- Produces: `applyForexAssetMode(pair)` → `void`. Idempotente: chamar N vezes com o mesmo `pair` dá o mesmo resultado. Task 4 depende dela para a regressão de EUR/USD e XAU/USD.

- [ ] **Step 1: Escrever os checks novos (vão falhar)**

Em `verify-forex-ustec.mjs`, **antes** de `await browser.close();`:

```js
// D) Modo índice: as três linhas de Forex somem e os rótulos falam em pontos
const d = await calcForex({ pair: 'USTEC', stop: 50, risk: 100 });
check('D. USTEC esconde mini/micro/unidades',
  d.rowMini === false && d.rowMicro === false && d.rowUnits === false, JSON.stringify({
    mini: d.rowMini, micro: d.rowMicro, units: d.rowUnits }));
check('D2. USTEC usa vocabulário de pontos nos rótulos e na fórmula',
  d.stopLabel === 'Stop Loss (em pontos)' && d.pipLabel === 'Valor por ponto (1 lote)' &&
  (d.help || '').startsWith('Fórmula: Lotes = Risco USD ÷ (Stop em pontos × Valor do ponto)'),
  JSON.stringify({ stopLabel: d.stopLabel, pipLabel: d.pipLabel, help: d.help }));

// E) Voltar para par de moedas restaura tudo (idempotência do modo)
const e = await calcForex({ pair: 'EURUSD', stop: 20, risk: 100 });
check('E. EUR/USD restaura as três linhas e os rótulos de pips',
  e.rowMini === true && e.rowMicro === true && e.rowUnits === true &&
  e.stopLabel === 'Stop Loss (em pips)' && e.pipLabel === 'Valor por pip (1 lote padrão)' &&
  (e.help || '').startsWith('Fórmula: Lote = Risco USD ÷ (Stop em pips × Valor do pip por lote)'),
  JSON.stringify(e));

// F) Trocar de ativo com campos inválidos não dispara toast (não é tentativa de calcular)
await page.evaluate(() => {
  document.getElementById('fx-risk').value = '';
  document.getElementById('fx-stop-pips').value = '';
  const host = document.getElementById('toast-container');
  if (host) host.innerHTML = '';
});
await page.select('#fx-pair', 'USTEC');
await sleep(400);
const toastsF = await page.evaluate(() => {
  const host = document.getElementById('toast-container');
  return host ? host.textContent.trim() : '';
});
const modeF = await readForex();
check('F. trocar de ativo com campos vazios: sem toast, mas modo já aplicado',
  toastsF === '' && modeF.stopLabel === 'Stop Loss (em pontos)',
  JSON.stringify({ toastsF, stopLabel: modeF.stopLabel }));
```

- [ ] **Step 2: Rodar o harness para ver os checks novos falharem**

```bash
cd "C:/Users/nikol/AppData/Local/Temp/trades777-rig" && node verify-forex-ustec.mjs
```

Esperado: A, B e C continuam **PASS**; D, D2, E e F em **FAIL** (os IDs `fx-row-*`, `fx-stop-label`, `fx-pipval-label` e `fx-help` ainda não existem, então `readForex` devolve `null`/`false`).

- [ ] **Step 3: Acrescentar os IDs no `index.html`**

Label do seletor — o campo deixa de ser só par de moedas:

```html
              <label for="fx-pair">Ativo</label>
```

Label do stop:

```html
                <label for="fx-stop-pips" id="fx-stop-label">Stop Loss (em pips)</label>
```

Rótulo do valor por pip:

```html
              <span id="fx-pipval-label">Valor por pip (1 lote padrão)</span>
```

As três linhas (só o atributo `id` é acrescentado; o conteúdo não muda):

```html
            <div class="calc-result-row" id="fx-row-mini">
              <span>Lotes mini (0,1)</span>
              <strong id="fx-out-mini">0.0</strong>
            </div>
            <div class="calc-result-row" id="fx-row-micro">
              <span>Lotes micro (0,01)</span>
              <strong id="fx-out-micro">0</strong>
            </div>
            <div class="calc-result-row" id="fx-row-units">
              <span>Unidades totais</span>
              <strong id="fx-out-units">0</strong>
            </div>
```

Texto de ajuda:

```html
            <small class="calc-help" id="fx-help">Fórmula: Lote = Risco USD ÷ (Stop em pips × Valor do pip por lote). Cálculo presume conta em USD. Posição arredondada para baixo (0,01 lote) para não ultrapassar o risco definido. Valores aproximados baseados em padrão de mercado. Pode variar conforme corretora.</small>
```

- [ ] **Step 4: Implementar `applyForexAssetMode` no `app.js`**

Logo **depois** de `forexPipValuePerLot` e **antes** de `calculateForex`:

```js
const FX_HELP_FOREX = 'Fórmula: Lote = Risco USD ÷ (Stop em pips × Valor do pip por lote). Cálculo presume conta em USD. Posição arredondada para baixo (0,01 lote) para não ultrapassar o risco definido. Valores aproximados baseados em padrão de mercado. Pode variar conforme corretora.';
const FX_HELP_INDEX = 'Fórmula: Lotes = Risco USD ÷ (Stop em pontos × Valor do ponto). Cálculo presume conta em USD. Posição arredondada para baixo (0,01 lote) para não ultrapassar o risco definido. Valores aproximados baseados em padrão de mercado. Pode variar conforme corretora.';

/**
 * Ajusta o painel Forex ao ativo selecionado. Em CFD de índice, esconde as linhas de
 * lote mini/micro/unidades (× 100.000 é conversão de par de moedas — para índice seria
 * número sem sentido) e troca o vocabulário de "pips" para "pontos". Idempotente.
 */
function applyForexAssetMode(pair) {
  const isIndex = !!INDEX_CFD_SPECS[pair];
  ['fx-row-mini', 'fx-row-micro', 'fx-row-units'].forEach(id => {
    const row = document.getElementById(id);
    if (row) row.style.display = isIndex ? 'none' : 'flex';
  });
  const stopLabel = document.getElementById('fx-stop-label');
  if (stopLabel) stopLabel.textContent = isIndex ? 'Stop Loss (em pontos)' : 'Stop Loss (em pips)';
  const pipLabel = document.getElementById('fx-pipval-label');
  if (pipLabel) pipLabel.textContent = isIndex ? 'Valor por ponto (1 lote)' : 'Valor por pip (1 lote padrão)';
  const help = document.getElementById('fx-help');
  if (help) help.textContent = isIndex ? FX_HELP_INDEX : FX_HELP_FOREX;
}
```

- [ ] **Step 5: Ligar o modo ao cálculo**

Em `calculateForex`, depois de `const actualRisk = ...` e antes do primeiro `document.getElementById('fx-out-risk')`:

```js
  applyForexAssetMode(pair);
```

E envolver as três linhas específicas de Forex — trocar

```js
  document.getElementById('fx-out-mini').textContent    = (lotSize * 10).toFixed(1);
  document.getElementById('fx-out-micro').textContent   = Math.floor(lotSize * 100).toLocaleString('pt-BR');
  document.getElementById('fx-out-units').textContent   = Math.round(lotSize * 100000).toLocaleString('pt-BR');
```

por

```js
  if (!INDEX_CFD_SPECS[pair]) {
    document.getElementById('fx-out-mini').textContent  = (lotSize * 10).toFixed(1);
    document.getElementById('fx-out-micro').textContent = Math.floor(lotSize * 100).toLocaleString('pt-BR');
    document.getElementById('fx-out-units').textContent = Math.round(lotSize * 100000).toLocaleString('pt-BR');
  }
```

- [ ] **Step 6: Reagir à troca de ativo**

Em `setupCalculatorsListeners`, depois da linha `if (btcBtn) btcBtn.addEventListener('click', calculateBTC);`:

```js
  const fxPair = document.getElementById('fx-pair');
  if (fxPair) {
    // O Chrome restaura a seleção do <select> no F5, então o modo precisa ser
    // aplicado no boot e não só na troca.
    applyForexAssetMode(fxPair.value);
    fxPair.addEventListener('change', onForexPairChange);
  }
```

E, junto das outras funções de calculadora:

```js
function onForexPairChange() {
  const pair = document.getElementById('fx-pair').value;
  applyForexAssetMode(pair);
  const risk = parseFloat(document.getElementById('fx-risk').value);
  const stop = parseFloat(document.getElementById('fx-stop-pips').value);
  // Recalcula só com os campos já válidos: trocar de ativo não é tentativa de
  // calcular, então nunca deve gerar toast de erro.
  if (!isNaN(risk) && !isNaN(stop) && risk > 0 && stop > 0) calculateForex();
}
```

- [ ] **Step 7: Rodar o harness para vê-lo passar**

```bash
cd "C:/Users/nikol/AppData/Local/Temp/trades777-rig" && node verify-forex-ustec.mjs
```

Esperado: **7/7 checks OK** (A, B, C, D, D2, E, F).

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/nikol/Desktop/Niko/projetos/apps/Monolith"
git add index.html app.js
git commit -m "Adapta o painel da Calculadora Forex ao vocabulário de índice"
```

---

### Task 3: Aviso quando o risco não paga 0,01 lote

**Files:**
- Modify: `app.js` (`calculateForex`)
- Test: `%TEMP%/trades777-rig/verify-forex-ustec.mjs` (estender)

**Interfaces:**
- Consumes: `INDEX_CFD_SPECS` (Task 1), `applyForexAssetMode` (Task 2), `toast(message, kind)` já existente em `app.js:1318`.

- [ ] **Step 1: Escrever o check novo (vai falhar)**

Em `verify-forex-ustec.mjs`, antes de `await browser.close();`:

```js
// G) Risco pequeno demais para o stop: lote zerado precisa ser explicado
await page.evaluate(() => {
  const host = document.getElementById('toast-container');
  if (host) host.innerHTML = '';
});
const g = await calcForex({ pair: 'USTEC', stop: 200, risk: 1 });
const toastsG = await page.evaluate(() => {
  const host = document.getElementById('toast-container');
  return host ? host.textContent.trim() : '';
});
check('G. USTEC 200 pontos / $1 → 0.00 lote + toast de risco insuficiente',
  g.lots === '0.00' && toastsG.includes('Risco insuficiente para 0,01 lote com esse stop.'),
  JSON.stringify({ lots: g.lots, toastsG }));
```

- [ ] **Step 2: Rodar o harness para ver o check falhar**

```bash
cd "C:/Users/nikol/AppData/Local/Temp/trades777-rig" && node verify-forex-ustec.mjs
```

Esperado: A–F **PASS**; G em **FAIL** — o lote já é `0.00`, mas nenhum toast aparece.

- [ ] **Step 3: Implementar o aviso**

Em `calculateForex`, como **última** instrução da função (depois de preencher `fx-out-actrisk`):

```js
  // Lote zerado: com esse stop, o risco definido não paga nem o lote mínimo
  if (lotSize <= 0) toast('Risco insuficiente para 0,01 lote com esse stop.', 'error');
```

- [ ] **Step 4: Rodar o harness para vê-lo passar**

```bash
cd "C:/Users/nikol/AppData/Local/Temp/trades777-rig" && node verify-forex-ustec.mjs
```

Esperado: **8/8 checks OK**.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/nikol/Desktop/Niko/projetos/apps/Monolith"
git add app.js
git commit -m "Avisa quando o risco não cobre o lote mínimo na Calculadora Forex"
```

---

### Task 4: Regressão dos ativos existentes e documentação

**Files:**
- Modify: `CLAUDE.md` (linha das calculadoras de risco, em "Conceitos do domínio")
- Test: `%TEMP%/trades777-rig/verify-forex-ustec.mjs` (estender)

**Interfaces:**
- Consumes: tudo das Tasks 1-3. Nenhuma interface nova.

- [ ] **Step 1: Escrever os checks de regressão (devem passar de primeira)**

Estes checks não testam código novo — protegem o que já funcionava. Se algum falhar, há regressão a corrigir antes de seguir. Em `verify-forex-ustec.mjs`, antes de `await browser.close();`:

```js
// H) Regressão Forex: EUR/USD com stop 20 pips e $100 → 0,50 lote e as três linhas certas
const h = await calcForex({ pair: 'EURUSD', stop: 20, risk: 100 });
check('H. EUR/USD 20 pips / $100 → 0.50 lote, pip $10.00, mini 5.0, micro 50, unidades 50.000',
  h.lots === '0.50' && h.pipval === '$10.00' && h.mini === '5.0' &&
  h.micro === '50' && h.units === '50.000' && h.actrisk === '$100.00', JSON.stringify(h));

// I) Regressão ouro: XAU/USD segue em mini lote de 10 oz ($1/pip), inalterado
const i = await calcForex({ pair: 'XAUUSD', stop: 20, risk: 100 });
check('I. XAU/USD 20 pips / $100 → 5.00 lotes a $1.00/pip, três linhas visíveis',
  i.lots === '5.00' && i.pipval === '$1.00' && i.actrisk === '$100.00' &&
  i.rowMini === true && i.rowUnits === true, JSON.stringify(i));

// J) Tema light com USTEC: as linhas escondidas continuam escondidas
await calcForex({ pair: 'USTEC', stop: 50, risk: 100 });
await page.click('#btn-theme-toggle');
await sleep(500);
const jLight = await page.evaluate(() => document.body.classList.contains('light-theme'));
const j = await readForex();
check('J. tema light: modo índice preservado (linhas escondidas, rótulo em pontos)',
  jLight && j.rowMini === false && j.rowUnits === false &&
  j.stopLabel === 'Stop Loss (em pontos)', JSON.stringify({ jLight, ...j }));
```

- [ ] **Step 2: Rodar o harness completo**

```bash
cd "C:/Users/nikol/AppData/Local/Temp/trades777-rig" && node verify-forex-ustec.mjs
```

Esperado: **11/11 checks OK**. Se H, I ou J falhar, corrigir a regressão em `app.js` antes de continuar — não seguir com check vermelho.

- [ ] **Step 3: Atualizar o `CLAUDE.md` do projeto**

Na seção "Conceitos do domínio", trocar a linha das calculadoras por:

```markdown
- **Calculadoras de risco** (não persistem nada): Forex (lote por pip — inclui XAU/USD e o
  CFD de índice USTEC/Nasdaq 100, a $1 por ponto, com o painel adaptado ao vocabulário de
  índice), Futuros EUA/CME, B3 (WIN/IND/WDO/DOL) e BTC CFD. Todas dimensionam a posição
  **arredondando para baixo** para nunca ultrapassar o risco definido.
```

- [ ] **Step 4: Conferir que o servidor de teste foi encerrado**

```bash
RIG="C:/Users/nikol/AppData/Local/Temp/trades777-rig"
kill "$(cat "$RIG/http-server.pid")" && rm "$RIG/http-server.pid" && echo "servidor encerrado"
```

Encerrar pelo PID guardado, **nunca** por `taskkill //IM python.exe` — isso derrubaria outros processos Python da máquina.

O harness `verify-forex-ustec.mjs` **permanece** em `%TEMP%/trades777-rig/` — está fora do repositório, junto do `verify-dashboard.mjs`, e serve para reverificar a calculadora no futuro.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/nikol/Desktop/Niko/projetos/apps/Monolith"
git add CLAUDE.md
git commit -m "Documenta o USTEC na Calculadora Forex"
```

---

## Resumo dos números esperados

Referência rápida para conferência manual no navegador (risco de $100, salvo indicado):

| Ativo | Stop | Lotes | Valor do pip/ponto | Risco estimado |
|-------|------|-------|--------------------|----------------|
| USTEC | 50 pontos | 2,00 | $1.00 | $100.00 |
| USTEC | 33 pontos | 3,03 | $1.00 | $99.99 |
| USTEC | 200 pontos ($1 de risco) | 0,00 + toast | $1.00 | $0.00 |
| EUR/USD | 20 pips | 0,50 | $10.00 | $100.00 |
| XAU/USD | 20 pips | 5,00 | $1.00 | $100.00 |
