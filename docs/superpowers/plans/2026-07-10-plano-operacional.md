# Aba "Plano Operacional" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o placeholder da aba "Plano Operacional" por uma página real com formulário persistido no Supabase (tabela `trading_plans`), salvo por botão "Salvar Plano".

**Architecture:** Nova tabela `trading_plans` (1 linha por usuário, RLS, sem Realtime) + service `js/services/plan.js` (fetch/upsert com ponte snake_case↔camelCase) + seção `#page-trading-plan` no `index.html` registrada no `tabToPage` do `app.js`. Plano entra no `Promise.all` do boot e no export/import de backup.

**Tech Stack:** HTML/CSS/JS vanilla (ES Modules, sem build), Supabase JS v2 via CDN, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-07-10-plano-operacional-design.md`

## Global Constraints

- Vanilla JS + ES Modules, **sem framework e sem build** (compatível com GitHub Pages).
- **Todo texto de UI em pt-BR com acentuação correta.**
- Toda I/O de dados passa por `js/services/*` — **nunca** chamar `supabase` direto do `app.js`.
- snake_case no banco ↔ camelCase no app; a ponte fica no service (padrão `rowToTrade()`).
- **Não há suíte de testes no projeto.** Verificação por tarefa: `node --check` para sintaxe JS + verificação manual no navegador (servir com `python -m http.server 8000` na raiz do app). Não introduzir framework de teste.
- Commits em pt-BR, um por tarefa.
- "Resetar Dados" NÃO apaga o plano. Sem Realtime para `trading_plans`.

---

### Task 1: Schema — tabela `trading_plans`

**Files:**
- Modify: `supabase/schema.sql` (append ao final, após a linha 144)

**Interfaces:**
- Produces: tabela `public.trading_plans` com colunas usadas pelo service da Task 2 (`user_id`, `trader_name`, `style`, `market`, `behavioral_rules`, `committed`, `daily_stop`, `weekly_stop`, `risk_per_trade`, `max_daily_risk`, `setup1_name`, `setup1_description`, `setup2_name`, `setup2_description`, `setup3_name`, `setup3_description`, `no_trade_rules`, `updated_at`).

- [ ] **Step 1: Adicionar o bloco SQL ao final de `supabase/schema.sql`**

```sql

-- ----------------------------------------------------------------------------
-- 7. Tabela: trading_plans (Plano Operacional — 1 linha por usuário)
--    Sem Realtime: edição rara, política last-write-wins entre dispositivos.
-- ----------------------------------------------------------------------------
create table if not exists public.trading_plans (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  trader_name        text not null default '',
  style              text not null default 'intraday'
                     check (style in ('scalping','intraday','swing','position')),
  market             text not null default '',
  behavioral_rules   text not null default '',
  committed          boolean not null default false,
  daily_stop         numeric(18,2),
  weekly_stop        numeric(18,2),
  risk_per_trade     numeric(8,2),
  max_daily_risk     numeric(8,2),
  setup1_name        text not null default '',
  setup1_description text not null default '',
  setup2_name        text not null default '',
  setup2_description text not null default '',
  setup3_name        text not null default '',
  setup3_description text not null default '',
  no_trade_rules     text not null default '',
  updated_at         timestamptz not null default now()
);

drop trigger if exists plans_set_updated_at on public.trading_plans;
create trigger plans_set_updated_at
  before update on public.trading_plans
  for each row execute function public.set_updated_at();

alter table public.trading_plans enable row level security;

drop policy if exists "plans_select_own" on public.trading_plans;
drop policy if exists "plans_insert_own" on public.trading_plans;
drop policy if exists "plans_update_own" on public.trading_plans;
drop policy if exists "plans_delete_own" on public.trading_plans;

create policy "plans_select_own"
  on public.trading_plans for select
  using (auth.uid() = user_id);

create policy "plans_insert_own"
  on public.trading_plans for insert
  with check (auth.uid() = user_id);

create policy "plans_update_own"
  on public.trading_plans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "plans_delete_own"
  on public.trading_plans for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Verificar**

Reler o bloco e conferir: `create table if not exists`, triggers/policies com `drop ... if exists` antes (idempotência), nenhuma linha de `alter publication` (sem Realtime).

⚠️ **Ação manual do Nikolas (fora do código):** colar **apenas este bloco novo** no SQL Editor do Supabase e rodar. Não re-rodar o arquivo inteiro: as linhas `alter publication supabase_realtime add table ...` existentes falham se re-executadas (tabela já é membro da publicação).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): adiciona tabela trading_plans para o Plano Operacional"
```

---

### Task 2: Service `js/services/plan.js`

**Files:**
- Create: `js/services/plan.js`

**Interfaces:**
- Consumes: tabela `trading_plans` (Task 1); `supabase` de `../supabase-client.js`.
- Produces: `fetchPlan(userId) → Promise<plan>` e `savePlan(userId, plan) → Promise<void>`, onde `plan` é `{ traderName, style, market, behavioralRules, committed, dailyStop, weeklyStop, riskPerTrade, maxDailyRisk, setup1Name, setup1Description, setup2Name, setup2Description, setup3Name, setup3Description, noTradeRules }` (strings vazias por default, números `null` quando não preenchidos, `committed` boolean).

- [ ] **Step 1: Criar o arquivo com o conteúdo completo**

```js
/**
 * Plan Service — Plano Operacional do trader
 * --------------------------------------------------------------
 * 1 linha por usuário em trading_plans. fetchPlan devolve defaults
 * se a linha ainda não existe (ela só é criada no primeiro save,
 * via upsert). Ponte snake_case (banco) ↔ camelCase (app) aqui.
 */
import { supabase } from '../supabase-client.js';

const TABLE = 'trading_plans';

const DEFAULTS = {
  traderName: '',
  style: 'intraday',
  market: '',
  behavioralRules: '',
  committed: false,
  dailyStop: null,
  weeklyStop: null,
  riskPerTrade: null,
  maxDailyRisk: null,
  setup1Name: '',
  setup1Description: '',
  setup2Name: '',
  setup2Description: '',
  setup3Name: '',
  setup3Description: '',
  noTradeRules: ''
};

export async function fetchPlan(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error('Falha ao carregar plano operacional: ' + error.message);
  if (!data) return { ...DEFAULTS };
  return normalize(data);
}

export async function savePlan(userId, plan) {
  const payload = {
    user_id:            userId,
    trader_name:        plan.traderName        ?? '',
    style:              plan.style             ?? 'intraday',
    market:             plan.market            ?? '',
    behavioral_rules:   plan.behavioralRules   ?? '',
    committed:          !!plan.committed,
    daily_stop:         plan.dailyStop         ?? null,
    weekly_stop:        plan.weeklyStop        ?? null,
    risk_per_trade:     plan.riskPerTrade      ?? null,
    max_daily_risk:     plan.maxDailyRisk      ?? null,
    setup1_name:        plan.setup1Name        ?? '',
    setup1_description: plan.setup1Description ?? '',
    setup2_name:        plan.setup2Name        ?? '',
    setup2_description: plan.setup2Description ?? '',
    setup3_name:        plan.setup3Name        ?? '',
    setup3_description: plan.setup3Description ?? '',
    no_trade_rules:     plan.noTradeRules      ?? ''
  };

  const { error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id' });
  if (error) throw new Error('Falha ao salvar plano operacional: ' + error.message);
}

function normalize(row) {
  return {
    traderName:        row.trader_name        ?? '',
    style:             row.style              ?? 'intraday',
    market:            row.market             ?? '',
    behavioralRules:   row.behavioral_rules   ?? '',
    committed:         !!row.committed,
    dailyStop:         row.daily_stop         !== null ? Number(row.daily_stop)     : null,
    weeklyStop:        row.weekly_stop        !== null ? Number(row.weekly_stop)    : null,
    riskPerTrade:      row.risk_per_trade     !== null ? Number(row.risk_per_trade) : null,
    maxDailyRisk:      row.max_daily_risk     !== null ? Number(row.max_daily_risk) : null,
    setup1Name:        row.setup1_name        ?? '',
    setup1Description: row.setup1_description ?? '',
    setup2Name:        row.setup2_name        ?? '',
    setup2Description: row.setup2_description ?? '',
    setup3Name:        row.setup3_name        ?? '',
    setup3Description: row.setup3_description ?? '',
    noTradeRules:      row.no_trade_rules     ?? ''
  };
}
```

- [ ] **Step 2: Verificar sintaxe**

Run (Git Bash; `node --check` direto falharia porque o arquivo usa `import`):
`node --input-type=module --check < js/services/plan.js`
Expected: sem saída (exit 0).

- [ ] **Step 3: Commit**

```bash
git add js/services/plan.js
git commit -m "feat(services): service do Plano Operacional (fetch/upsert em trading_plans)"
```

---

### Task 3: Markup — seção `#page-trading-plan` no `index.html`

**Files:**
- Modify: `index.html` (inserir a nova `<section>` imediatamente ANTES do comentário `<!-- Placeholder para futuras seções -->`, linha ~673)

**Interfaces:**
- Produces: IDs consumidos pela Task 5: `page-trading-plan`, `plan-form`, `btn-save-plan`, `plan-trader-name`, `plan-style`, `plan-market`, `plan-behavioral-rules`, `plan-committed`, `plan-daily-stop`, `plan-weekly-stop`, `plan-risk-per-trade`, `plan-max-daily-risk`, `plan-setup1-name`, `plan-setup1-desc`, `plan-setup2-name`, `plan-setup2-desc`, `plan-setup3-name`, `plan-setup3-desc`, `plan-no-trade-rules`.
- Consumes: classes CSS da Task 4 (`plan-layout`, `plan-card`, `plan-row-3`, `plan-row-2`, `plan-commit`, `plan-card-danger`, `plan-actions`) e classes existentes (`page-section`, `page-header`, `calc-card`, `calc-card-subtitle`, `form-group`, `btn-primary`).

- [ ] **Step 1: Inserir a seção completa**

```html
      <!-- ====== Plano Operacional ====== -->
      <section class="page-section" id="page-trading-plan">
        <div class="page-header">
          <div class="page-title-area">
            <h1>Plano Operacional</h1>
            <p>Defina e acompanhe suas regras, limites de risco e setups para manter a disciplina.</p>
          </div>
        </div>

        <form id="plan-form" class="plan-layout">

          <div class="calc-card plan-card">
            <h3><i data-lucide="circle-user"></i> Identidade do Trader</h3>
            <div class="plan-row-3">
              <div class="form-group">
                <label for="plan-trader-name">Nome do trader</label>
                <input type="text" id="plan-trader-name" placeholder="Seu nome completo">
              </div>
              <div class="form-group">
                <label for="plan-style">Estilo operacional</label>
                <select id="plan-style">
                  <option value="scalping">Scalping</option>
                  <option value="intraday" selected>Intraday (Day Trade)</option>
                  <option value="swing">Swing Trade</option>
                  <option value="position">Position Trade</option>
                </select>
              </div>
              <div class="form-group">
                <label for="plan-market">Mercado principal</label>
                <input type="text" id="plan-market" placeholder="Ex: Forex, B3, Cripto">
              </div>
            </div>
          </div>

          <div class="calc-card plan-card">
            <h3><i data-lucide="shield-check"></i> Regras Comportamentais</h3>
            <p class="calc-card-subtitle">Defina seus pilares de disciplina, controle emocional e consistência.</p>
            <div class="form-group">
              <textarea id="plan-behavioral-rules" rows="6" placeholder="Ex: Seguir os mapeamentos, respeitar o limite de stops diários, não olhar o resultado antes de fechar o bloco..."></textarea>
            </div>
            <label class="plan-commit" for="plan-committed">
              <input type="checkbox" id="plan-committed">
              <span>Estou ciente e comprometido em seguir meu plano operacional rigorosamente.</span>
            </label>
          </div>

          <div class="calc-card plan-card">
            <h3><i data-lucide="target"></i> Gestão de Risco</h3>
            <div class="plan-row-2">
              <div class="form-group">
                <label for="plan-daily-stop">Stop diário ($)</label>
                <input type="number" id="plan-daily-stop" step="0.01" min="0" placeholder="Ex: 100">
              </div>
              <div class="form-group">
                <label for="plan-weekly-stop">Stop semanal ($)</label>
                <input type="number" id="plan-weekly-stop" step="0.01" min="0" placeholder="Ex: 300">
              </div>
              <div class="form-group">
                <label for="plan-risk-per-trade">Risco por trade (%)</label>
                <input type="number" id="plan-risk-per-trade" step="0.01" min="0" placeholder="Ex: 1">
              </div>
              <div class="form-group">
                <label for="plan-max-daily-risk">Risco máximo diário (%)</label>
                <input type="number" id="plan-max-daily-risk" step="0.01" min="0" placeholder="Ex: 3">
              </div>
            </div>
          </div>

          <div class="calc-card plan-card">
            <h3><i data-lucide="crosshair"></i> Operacional Técnico</h3>
            <p class="calc-card-subtitle">Mapeie seus principais setups e gatilhos de entrada.</p>

            <div class="form-group">
              <label for="plan-setup1-name">Nome do Setup 1</label>
              <input type="text" id="plan-setup1-name" placeholder="Ex: Rompimento de VWAP, Pullback na MM20...">
            </div>
            <div class="form-group">
              <label for="plan-setup1-desc">Descrição e Gatilhos</label>
              <textarea id="plan-setup1-desc" rows="4" placeholder="Descreva o contexto, indicadores necessários e o gatilho exato de entrada..."></textarea>
            </div>

            <div class="form-group">
              <label for="plan-setup2-name">Nome do Setup 2</label>
              <input type="text" id="plan-setup2-name" placeholder="Ex: Rompimento de VWAP, Pullback na MM20...">
            </div>
            <div class="form-group">
              <label for="plan-setup2-desc">Descrição e Gatilhos</label>
              <textarea id="plan-setup2-desc" rows="4" placeholder="Descreva o contexto, indicadores necessários e o gatilho exato de entrada..."></textarea>
            </div>

            <div class="form-group">
              <label for="plan-setup3-name">Nome do Setup 3</label>
              <input type="text" id="plan-setup3-name" placeholder="Ex: Rompimento de VWAP, Pullback na MM20...">
            </div>
            <div class="form-group">
              <label for="plan-setup3-desc">Descrição e Gatilhos</label>
              <textarea id="plan-setup3-desc" rows="4" placeholder="Descreva o contexto, indicadores necessários e o gatilho exato de entrada..."></textarea>
            </div>
          </div>

          <div class="calc-card plan-card plan-card-danger">
            <h3><i data-lucide="alert-triangle"></i> Regras de NÃO Operação</h3>
            <p class="calc-card-subtitle">Filtros e situações onde você está proibido de abrir novas posições.</p>
            <div class="form-group">
              <textarea id="plan-no-trade-rules" rows="6" placeholder="Ex: Não operar após 2 stops seguidos, em dias de notícia de alto impacto, fora do horário planejado..."></textarea>
            </div>
          </div>

          <div class="plan-actions">
            <button type="submit" class="btn-primary" id="btn-save-plan">
              <i data-lucide="save"></i> Salvar Plano
            </button>
          </div>

        </form>
      </section>
```

- [ ] **Step 2: Verificar**

Servir (`python -m http.server 8000`), logar e clicar em "Plano Operacional". **Esperado neste ponto:** ainda cai no placeholder "Área em Desenvolvimento" (o `tabToPage` só é atualizado na Task 5) — o objetivo é conferir que o HTML novo não quebrou nada: diário abre normal, sem erros no console.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): markup da página Plano Operacional"
```

---

### Task 4: CSS — estilos da página do plano

**Files:**
- Modify: `style.css` (append ao final do arquivo)

**Interfaces:**
- Consumes: variáveis CSS existentes (`--radius-md`, `--surface-2`, `--border-color`, `--text-active`, `--color-primary`, `--color-primary-glow`, `--color-danger`, `--color-danger-border`, `--color-danger-glow`, `--font-secondary`, `--transition-fast`) e classes `calc-card`/`form-group`.
- Produces: classes `plan-layout`, `plan-row-3`, `plan-row-2`, `plan-commit`, `plan-card-danger`, `plan-actions` e o visual dos inputs/selects de `.plan-card` (usadas na Task 3).

- [ ] **Step 1: Adicionar o bloco ao final de `style.css`**

```css

/* ==========================================================================
   PLANO OPERACIONAL
   ========================================================================== */

.plan-layout {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1100px;
  margin-bottom: 40px;
}

.plan-row-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-top: 20px;
}

.plan-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-top: 20px;
}

@media (max-width: 900px) {
  .plan-row-3 { grid-template-columns: 1fr; }
}

@media (max-width: 600px) {
  .plan-row-2 { grid-template-columns: 1fr; }
}

/* Inputs e selects do plano (sem ícone) — mesmo visual dos inputs das calculadoras */
.plan-card .form-group input,
.plan-card .form-group select {
  width: 100%;
  padding: 12px 14px;
  background-color: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-md);
  color: var(--text-active);
  font-family: var(--font-secondary);
  font-size: 0.9rem;
  font-weight: 500;
  outline: none;
  transition: all var(--transition-fast);
  appearance: none;
}

.plan-card .form-group input:hover,
.plan-card .form-group select:hover {
  border-color: rgba(255, 255, 255, 0.35);
  background-color: rgba(255, 255, 255, 0.08);
}

.plan-card .form-group input:focus,
.plan-card .form-group select:focus {
  border-color: var(--color-primary);
  background-color: var(--bg-card);
  box-shadow: 0 0 0 3px var(--color-primary-glow);
}

.plan-card .form-group select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 40px;
}

body.light-theme .plan-card .form-group input,
body.light-theme .plan-card .form-group select {
  background-color: #ffffff;
  border: 1px solid #cbd5e1;
  color: #0f172a;
}

body.light-theme .plan-card .form-group input:hover,
body.light-theme .plan-card .form-group select:hover {
  border-color: #94a3b8;
  background-color: #f8fafc;
}

body.light-theme .plan-card .form-group select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%234b5563' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
}

/* Checkbox de compromisso */
.plan-commit {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background-color: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-active);
}

.plan-commit input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
  cursor: pointer;
  flex-shrink: 0;
}

/* Variante de alerta — Regras de NÃO Operação */
.plan-card-danger {
  border-color: var(--color-danger-border);
}

.plan-card-danger:hover {
  border-color: var(--color-danger);
  box-shadow: 0 4px 14px var(--color-danger-glow);
}

.plan-card-danger h3,
.plan-card-danger h3 i {
  color: var(--color-danger);
}

/* Ações do formulário */
.plan-actions {
  display: flex;
  justify-content: flex-end;
}

.plan-actions .btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Verificar**

Sem efeito visível ainda (página só ativa na Task 5). Conferir no navegador que nada existente mudou (diário e calculadoras com visual intacto, tema light/dark ok).

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat(ui): estilos da página Plano Operacional"
```

---

### Task 5: Integração no `app.js` (navegação, boot, render, save)

**Files:**
- Modify: `app.js` — import (~linha 23), `DEFAULT_STATE` (~33), `cacheDOM()` (~63 e ~110), `loadDataFromCloud()` (~230), `tabToPage` (~672), `setupEventListeners()` (~760), novas funções após `persistPreferences()` (~259)

**Interfaces:**
- Consumes: `fetchPlan`/`savePlan` (Task 2), IDs do markup (Task 3).
- Produces: `state.plan` (objeto camelCase do service ou `null` se o fetch falhou), `renderPlanForm()`, `collectPlanForm()`, `handleSavePlan()` — usados também na Task 6.

- [ ] **Step 1: Adicionar import após o bloco de `preferences.js` (linha 26)**

```js
import {
  fetchPlan,
  savePlan
} from './js/services/plan.js';
```

- [ ] **Step 2: Adicionar `plan` ao `DEFAULT_STATE`**

```js
const DEFAULT_STATE = {
  activeBlockIndex: 1,
  blocks: { '1': [] },
  userEmail: '',
  theme: 'dark',
  plan: null
};
```

- [ ] **Step 3: Cachear os novos elementos em `cacheDOM()`**

Junto dos outros `page-*` (após `DOM.pageBtcCalc`):

```js
  DOM.pageTradingPlan   = document.getElementById('page-trading-plan');
```

Junto dos botões (antes de `DOM.appLoading`):

```js
  DOM.planForm          = document.getElementById('plan-form');
  DOM.btnSavePlan       = document.getElementById('btn-save-plan');
```

- [ ] **Step 4: Carregar o plano no boot (`loadDataFromCloud`)**

Substituir o início da função por:

```js
async function loadDataFromCloud() {
  const [prefs, blocks, plan] = await Promise.all([
    fetchPreferences(currentUser.id),
    fetchAllTradesByBlock(currentUser.id),
    // Falha no plano não bloqueia o diário: loga, avisa e segue com null
    fetchPlan(currentUser.id).catch(err => {
      console.error('[Plan] fetch falhou', err);
      toast(err.message, 'error');
      return null;
    })
  ]);
  // Garante bloco 1 sempre presente
  if (!blocks['1']) blocks['1'] = [];

  state = {
    activeBlockIndex: prefs.activeBlockIndex,
    blocks,
    userEmail: currentUser.email,
    theme: prefs.theme,
    plan
  };
```

E, ao final da função (após `applyTheme(state.theme);`), adicionar:

```js
  renderPlanForm();
```

- [ ] **Step 5: Adicionar as funções do plano após `persistPreferences()`**

```js
// ==========================================================================
// PLANO OPERACIONAL
// ==========================================================================
const PLAN_FIELDS = {
  traderName:        'plan-trader-name',
  style:             'plan-style',
  market:            'plan-market',
  behavioralRules:   'plan-behavioral-rules',
  committed:         'plan-committed',
  dailyStop:         'plan-daily-stop',
  weeklyStop:        'plan-weekly-stop',
  riskPerTrade:      'plan-risk-per-trade',
  maxDailyRisk:      'plan-max-daily-risk',
  setup1Name:        'plan-setup1-name',
  setup1Description: 'plan-setup1-desc',
  setup2Name:        'plan-setup2-name',
  setup2Description: 'plan-setup2-desc',
  setup3Name:        'plan-setup3-name',
  setup3Description: 'plan-setup3-desc',
  noTradeRules:      'plan-no-trade-rules'
};

const PLAN_NUMERIC_KEYS = ['dailyStop', 'weeklyStop', 'riskPerTrade', 'maxDailyRisk'];

function renderPlanForm() {
  if (!domReady || !state.plan) return;
  for (const [key, id] of Object.entries(PLAN_FIELDS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (key === 'committed') {
      el.checked = !!state.plan.committed;
    } else {
      el.value = state.plan[key] ?? '';
    }
  }
}

function collectPlanForm() {
  const plan = {};
  for (const [key, id] of Object.entries(PLAN_FIELDS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (key === 'committed') {
      plan.committed = el.checked;
    } else if (PLAN_NUMERIC_KEYS.includes(key)) {
      plan[key] = el.value === '' ? null : Number(el.value);
    } else {
      plan[key] = el.value.trim();
    }
  }
  return plan;
}

async function handleSavePlan() {
  const plan = collectPlanForm();
  DOM.btnSavePlan.disabled = true;
  try {
    await savePlan(currentUser.id, plan);
    state.plan = plan;
    toast('Plano operacional salvo.', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    DOM.btnSavePlan.disabled = false;
  }
}
```

- [ ] **Step 6: Registrar a aba e o submit em `setupEventListeners()`**

No mapa `tabToPage`, adicionar a entrada:

```js
  const tabToPage = {
    'trading-journal': DOM.pageTradingJournal,
    'forex-calc':      DOM.pageForexCalc,
    'futures-calc':    DOM.pageFuturesCalc,
    'b3-calc':         DOM.pageB3Calc,
    'btc-calc':        DOM.pageBtcCalc,
    'trading-plan':    DOM.pageTradingPlan
  };
```

Junto dos outros listeners (perto do bloco "Export / Import / Reset"):

```js
  // Plano Operacional
  DOM.planForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSavePlan();
  });
```

- [ ] **Step 7: Verificar sintaxe**

Run (Git Bash): `node --input-type=module --check < app.js`
Expected: sem saída (exit 0).

- [ ] **Step 8: Verificar no navegador**

Pré-requisito: bloco SQL da Task 1 já rodado no Supabase. Servir, logar, clicar em "Plano Operacional":
- A página real abre (não mais o placeholder), com os 5 cards na ordem dos screenshots e ícones renderizados.
- Preencher campos, clicar "Salvar Plano" → toast "Plano operacional salvo.".
- F5 → campos voltam preenchidos.
- Sem erros no console.

- [ ] **Step 9: Commit**

```bash
git add app.js
git commit -m "feat(plan): integra Plano Operacional ao app (navegação, boot e salvamento)"
```

---

### Task 6: Plano no Export/Import de backup

**Files:**
- Modify: `app.js` — `exportData()` (~784) e `importData()` (~799)

**Interfaces:**
- Consumes: `state.plan`, `savePlan`, `fetchPlan`, `renderPlanForm()` (Tasks 2 e 5).
- Produces: chave `plan` no JSON de backup; import restaura o plano quando presente (backups antigos sem `plan` seguem válidos).

- [ ] **Step 1: Incluir o plano no payload de `exportData()`**

```js
  const payload = {
    activeBlockIndex: state.activeBlockIndex,
    blocks: state.blocks,
    userEmail: state.userEmail,
    theme: state.theme,
    plan: state.plan,
    exportedAt: new Date().toISOString()
  };
```

- [ ] **Step 2: Restaurar o plano em `importData()`**

Dentro do `try`, após o refetch dos blocos (`state.blocks = blocks;`) e antes de `renderApp();`:

```js
      // Restaura o plano operacional, se presente no backup
      if (parsed.plan) {
        await savePlan(currentUser.id, parsed.plan);
        state.plan = await fetchPlan(currentUser.id);
        renderPlanForm();
      }
```

- [ ] **Step 3: Verificar sintaxe**

Run (Git Bash): `node --input-type=module --check < app.js`
Expected: sem saída (exit 0).

- [ ] **Step 4: Verificar no navegador**

- "Exportar Dados" → abrir o JSON baixado → contém a chave `plan` com os campos camelCase.
- "Importar Dados" com esse arquivo → confirma → toast de sucesso; aba do plano mostra os dados; backup antigo (sem `plan`) importa sem erro.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(backup): inclui Plano Operacional no export/import"
```

---

### Task 7: Verificação E2E manual

**Files:** nenhum (checklist de verificação; corrigir o que falhar antes de dar por concluído).

- [ ] **Step 1: Rodar o checklist completo**

Com `python -m http.server 8000` na raiz do app:

1. Login → aba "Plano Operacional" abre a página real, ordem dos cards igual aos screenshots.
2. Preencher tudo (incl. checkbox) → "Salvar Plano" → toast de sucesso → F5 → tudo persiste.
3. Supabase Table Editor: linha única em `trading_plans` com os valores.
4. Segundo navegador/aba anônima com o mesmo login → plano aparece (sync via banco).
5. Campos numéricos vazios → salvar → no banco ficam `null` (não `0`).
6. Tema light e dark: cards, inputs, checkbox e card danger legíveis nos dois.
7. Janela estreita (~500px): grades colapsam para 1 coluna, sem overflow horizontal.
8. Regressão: diário (novo trade, grid/lista, navegação de blocos), 4 calculadoras, export/import, "Resetar Dados" (apaga operações, plano intacto), logout/login.
9. Console sem erros em todo o fluxo.

- [ ] **Step 2: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "fix(plan): ajustes da verificação E2E do Plano Operacional"
```
