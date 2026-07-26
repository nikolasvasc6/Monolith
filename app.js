/**
 * Monolith — Diário de Trading Profissional
 * Orquestrador principal (Módulo ES). Integrado com Supabase.
 *
 * - Autenticação via Supabase Auth (email + senha)
 * - Persistência em Postgres (tabelas trades + user_preferences)
 * - Realtime: sincroniza automaticamente entre dispositivos
 * - RLS no banco garante isolamento por usuário
 */

import { onAuthChange, getSession, signOut, refreshSession } from './js/auth.js';
import { initAuthUI, showAuthScreen, hideAuthScreen, onAuthenticated } from './js/ui/auth-ui.js';
import {
  fetchAllTradesByBlock,
  insertTrade,
  updateTrade,
  updateTradePlacements,
  deleteTrade as remoteDeleteTrade,
  deleteAllTrades,
  bulkImportTrades,
  subscribeRealtime,
  unsubscribeRealtime
} from './js/services/trades.js';
import {
  fetchPreferences,
  updatePreferences
} from './js/services/preferences.js';
import {
  fetchPlan,
  savePlan
} from './js/services/plan.js';
import {
  uploadTradeImage,
  removeTradeImages,
  getSignedUrls,
  invalidateSignedUrl,
  removeAllUserImages
} from './js/services/trade-images.js';

// ==========================================================================
// CONSTANTES & ESTADO
// ==========================================================================
const TRADES_PER_BLOCK = 35;

const DEFAULT_STATE = {
  activeBlockIndex: 1,
  blocks: { '1': [] },
  userEmail: '',
  theme: 'dark',
  plan: null
};

let state          = { ...DEFAULT_STATE, blocks: { '1': [] } };
let journalChartInstance = null; // gráfico do Diário (bloco ativo)
let dashChartInstance    = null; // gráfico do Dashboard (conta inteira)
let currentView    = 'grid'; // 'grid' ou 'list'
let currentUser    = null;   // { id, email }
let realtimeChan   = null;   // canal supabase
let isApplyingRemote = false;// evita loops de refetch
let domReady       = false;
let bootDataLoaded = false;  // a carga inicial de dados já concluiu?
let loadInFlight   = null;   // promessa da carga em andamento (evita corrida)

// ==========================================================================
// DOM CACHE
// ==========================================================================
const DOM = {};

function cacheDOM() {
  DOM.navItems          = document.querySelectorAll('.nav-item');
  DOM.pageSections      = document.querySelectorAll('.page-section');
  DOM.pageTradingJournal= document.getElementById('page-trading-journal');
  DOM.pagePlaceholder   = document.getElementById('page-placeholder');
  DOM.pageForexCalc     = document.getElementById('page-forex-calc');
  DOM.pageFuturesCalc   = document.getElementById('page-futures-calc');
  DOM.pageB3Calc        = document.getElementById('page-b3-calc');
  DOM.pageBtcCalc       = document.getElementById('page-btc-calc');
  DOM.pageTradingPlan   = document.getElementById('page-trading-plan');
  DOM.pageDashboard     = document.getElementById('page-dashboard');

  DOM.userEmailEl       = document.getElementById('header-user-email');

  DOM.valRegistered     = document.getElementById('val-registered');
  DOM.subRegistered     = document.getElementById('sub-registered');
  DOM.progressRegistered= document.getElementById('progress-registered');
  DOM.valAccumulated    = document.getElementById('val-accumulated');
  DOM.indAccumulated    = document.getElementById('ind-accumulated');
  DOM.valWinrate        = document.getElementById('val-winrate');
  DOM.indWinrate        = document.getElementById('ind-winrate');
  DOM.valAverage        = document.getElementById('val-average');
  DOM.indAverage        = document.getElementById('ind-average');
  DOM.kpiAccumulatedCard= document.getElementById('kpi-accumulated');
  DOM.kpiWinrateCard    = document.getElementById('kpi-winrate');
  DOM.kpiAverageCard    = document.getElementById('kpi-average');

  DOM.summaryTradesCount= document.getElementById('summary-trades-count');
  DOM.summaryWinrate    = document.getElementById('summary-winrate');
  DOM.summaryPL         = document.getElementById('summary-pl');
  DOM.canvasChart       = document.getElementById('performanceChart');

  DOM.canvasDashChart        = document.getElementById('dashboardChart');
  DOM.dashSummaryTradesCount = document.getElementById('dash-summary-trades-count');
  DOM.dashSummaryWinrate     = document.getElementById('dash-summary-winrate');
  DOM.dashSummaryPL          = document.getElementById('dash-summary-pl');

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

  DOM.btnToggleGrid     = document.getElementById('btn-toggle-grid');
  DOM.btnToggleList     = document.getElementById('btn-toggle-list');
  DOM.btnPrevBlock      = document.getElementById('btn-prev-block');
  DOM.btnNextBlock      = document.getElementById('btn-next-block');
  DOM.blockInfoDisplay  = document.getElementById('block-info-display');
  DOM.contentGridView   = document.getElementById('content-grid-view');
  DOM.contentListView   = document.getElementById('content-list-view');

  DOM.gridContainer     = document.getElementById('grid-container');
  DOM.tableBodyContainer= document.getElementById('table-body-container');

  DOM.tradeModal        = document.getElementById('trade-modal');
  DOM.tradeForm         = document.getElementById('trade-form');
  DOM.modalTitle        = document.getElementById('modal-title');
  DOM.tradeIdInput      = document.getElementById('trade-id-input');
  DOM.tradeSlotInput    = document.getElementById('trade-slot-input');
  DOM.tradeAsset        = document.getElementById('trade-asset');
  DOM.tradeType         = document.getElementById('trade-type');
  DOM.tradePnL          = document.getElementById('trade-pnl');
  DOM.tradeDate         = document.getElementById('trade-date');
  DOM.tradeNotes        = document.getElementById('trade-notes');
  DOM.tradeImagesStrip  = document.getElementById('trade-images-strip');
  DOM.tradeImageInput   = document.getElementById('trade-image-input');
  DOM.btnAddImage       = document.getElementById('btn-add-image');
  DOM.btnDeleteTrade    = document.getElementById('btn-delete-trade');
  DOM.btnCancelModal    = document.getElementById('btn-cancel-modal');
  DOM.btnCloseModalX    = document.getElementById('btn-close-modal-x');
  DOM.btnSubmitModal    = document.getElementById('btn-submit-modal');
  DOM.btnNewTradeHeader = document.getElementById('btn-new-trade-header');

  DOM.sidebarFooter     = document.getElementById('sidebar-footer');
  DOM.btnFooterMenu     = document.getElementById('btn-footer-menu-toggle');
  DOM.btnExportData     = document.getElementById('btn-export-data');
  DOM.btnImportData     = document.getElementById('btn-import-data');
  DOM.fileImportInput   = document.getElementById('file-import-input');
  DOM.btnResetApp       = document.getElementById('btn-reset-app');
  DOM.btnThemeToggle    = document.getElementById('btn-theme-toggle');
  DOM.btnLogout         = document.getElementById('btn-logout');
  DOM.planForm          = document.getElementById('plan-form');
  DOM.btnSavePlan       = document.getElementById('btn-save-plan');
  DOM.appLoading        = document.getElementById('app-loading');
}

// ==========================================================================
// BOOTSTRAP
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  cacheDOM();
  domReady = true;
  initAuthUI();
  setupEventListeners();
  lucide.createIcons();

  // Recuperar sessão persistida
  showLoading(true);
  try {
    const session = await getSession();
    if (session?.user) {
      await bootAuthenticatedApp(session.user);
    } else {
      showLoading(false);
      showAuthScreen();
    }
  } catch (err) {
    showLoading(false);
    showAuthScreen();
    toast('Falha ao recuperar sessão: ' + err.message, 'error');
  }

  // Quando login/cadastro tem sucesso na UI de auth
  onAuthenticated(async (session) => {
    await bootAuthenticatedApp(session.user);
  });

  // Reage a qualquer mudança de auth (signout em outra aba, refresh de token, etc.)
  onAuthChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      teardownAuthenticatedApp();
      showAuthScreen();
      return;
    }
    // Autocura: se o boot não conseguiu carregar os dados, tenta de novo
    // quando a sessão se estabelece/renova (cobre o "só carrega após F5").
    if (!bootDataLoaded && currentUser && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) {
      try {
        await loadDataWithHeal();
        setupRealtime();
        renderApp();
        bootDataLoaded = true;
      } catch (err) {
        console.error('[Monolith] Recarga após renovação de sessão falhou:', err);
      }
    }
  });
});

async function bootAuthenticatedApp(user) {
  currentUser = { id: user.id, email: user.email };
  showLoading(true);
  hideAuthScreen();
  try {
    await loadDataWithHeal();
    setupRealtime();
    renderApp();
    bootDataLoaded = true;
  } catch (err) {
    bootDataLoaded = false;
    toast(err.message || 'Erro ao carregar dados.', 'error');
    console.error('[Monolith] Falha ao carregar dados no boot:', err);
  } finally {
    showLoading(false);
  }
}

/**
 * Carrega os dados com autocura: se a primeira tentativa falhar ou voltar
 * 100% vazia (uma consulta que sai com a sessão dessincronizada devolve []
 * em silêncio por causa do RLS), revalida a sessão no servidor e busca de
 * novo — automatiza o F5 que resolvia manualmente.
 */
function loadDataWithHeal() {
  if (loadInFlight) return loadInFlight;
  loadInFlight = (async () => {
    let firstError = null;
    try { await loadDataFromCloud(); } catch (err) { firstError = err; }
    if (firstError === null && countTradesInState() > 0) return;

    console.warn('[Monolith] Primeira carga ' +
      (firstError ? `falhou (${firstError.message})` : 'voltou sem operações') +
      ' — revalidando sessão e refazendo a busca.');
    try { await refreshSession(); } catch (_) { /* mantém a sessão atual */ }
    await loadDataFromCloud();
  })().finally(() => { loadInFlight = null; });
  return loadInFlight;
}

function countTradesInState() {
  return Object.values(state.blocks).reduce((sum, list) => sum + list.length, 0);
}

function teardownAuthenticatedApp() {
  unsubscribeRealtime(realtimeChan);
  realtimeChan = null;
  currentUser  = null;
  bootDataLoaded = false;
  state        = { ...DEFAULT_STATE, blocks: { '1': [] } };
  if (journalChartInstance) { journalChartInstance.destroy(); journalChartInstance = null; }
  if (dashChartInstance)    { dashChartInstance.destroy();    dashChartInstance = null; }
}

// ==========================================================================
// PERSISTÊNCIA — CLOUD (SUPABASE)
// ==========================================================================
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

  await healBlockLayout(blocks);

  state = {
    activeBlockIndex: prefs.activeBlockIndex,
    blocks,
    userEmail: currentUser.email,
    theme: prefs.theme,
    plan
  };

  // Se o bloco ativo não existe (ex: usuário apagou), volta pra 1
  if (!state.blocks[String(state.activeBlockIndex)]) {
    state.activeBlockIndex = 1;
    await persistPreferences({ activeBlockIndex: 1 });
  }
  applyTheme(state.theme);
  renderPlanForm();
}

/**
 * Autocura do layout de blocos: garante no máximo TRADES_PER_BLOCK operações
 * por bloco (excedentes fluem para o fim do bloco seguinte, em cascata) e
 * posições contíguas 0..n-1 dentro de cada bloco. Repara dados gravados por
 * estado defasado (outra aba/dispositivo com o realtime caído) e por versões
 * antigas do import, que sobrepunham posições. Muda `blocks` in place; se a
 * persistência falhar, a memória fica correta e o banco é curado no próximo boot.
 */
async function healBlockLayout(blocks) {
  const changes = [];
  const indices = Object.keys(blocks).map(Number).sort((a, b) => a - b);
  for (let k = 0; k < indices.length; k++) {
    const bIdx = indices[k];
    const list = blocks[String(bIdx)] || [];
    if (list.length > TRADES_PER_BLOCK) {
      const extras = list.splice(TRADES_PER_BLOCK);
      const nextIdx = bIdx + 1;
      if (!blocks[String(nextIdx)]) blocks[String(nextIdx)] = [];
      blocks[String(nextIdx)].push(...extras);
      if (!indices.includes(nextIdx)) indices.splice(k + 1, 0, nextIdx);
    }
    list.forEach((t, i) => {
      if (t.blockIndex !== bIdx || t.position !== i) {
        t.blockIndex = bIdx;
        t.position = i;
        changes.push({ id: t.id, blockIndex: bIdx, position: i });
      }
    });
  }
  if (changes.length === 0) return;
  try {
    await updateTradePlacements(changes);
    console.warn(`[Monolith] Autocura: bloco/posição corrigidos em ${changes.length} operação(ões).`);
  } catch (err) {
    console.error('[Monolith] Autocura não conseguiu persistir as correções:', err);
  }
}

async function persistPreferences(patch) {
  try {
    await updatePreferences(currentUser.id, patch);
  } catch (err) {
    toast(err.message, 'error');
  }
}

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

function setupRealtime() {
  unsubscribeRealtime(realtimeChan);
  realtimeChan = subscribeRealtime(currentUser.id, async () => {
    if (isApplyingRemote) return;
    try {
      isApplyingRemote = true;
      const blocks = await fetchAllTradesByBlock(currentUser.id);
      if (!blocks['1']) blocks['1'] = [];
      state.blocks = blocks;
      if (!state.blocks[String(state.activeBlockIndex)]) {
        state.activeBlockIndex = 1;
      }
      renderApp();
    } catch (err) {
      console.error('[Realtime] refetch failed', err);
    } finally {
      isApplyingRemote = false;
    }
  });
}

// ==========================================================================
// RENDERIZAÇÃO
// ==========================================================================
function renderApp() {
  if (!domReady) return;
  const currentBlockIndex = state.activeBlockIndex;
  const blockKey  = String(currentBlockIndex);
  const blockTrades = state.blocks[blockKey] || [];

  const totalBlocks = Math.max(1, Object.keys(state.blocks).length);
  DOM.blockInfoDisplay.textContent = `Bloco ${currentBlockIndex} de ${totalBlocks} (Ciclo 1)`;

  DOM.btnPrevBlock.disabled = currentBlockIndex <= 1;
  DOM.btnNextBlock.disabled = currentBlockIndex >= totalBlocks;

  DOM.userEmailEl.textContent = state.userEmail || '';

  updateKPIs(blockTrades);
  if (journalChartInstance) journalChartInstance.destroy();
  journalChartInstance = renderChart(DOM.canvasChart, blockTrades);
  renderDashboard();

  if (currentView === 'grid') renderGridView(blockTrades);
  else                        renderListView(blockTrades);

  lucide.createIcons();
}

/** Estatísticas de uma lista de trades (bloco ativo ou conta inteira). */
function computeStats(trades) {
  const count = trades.length;
  const accumulated = trades.reduce((s, t) => s + t.pnl, 0);
  const winTrades = trades.filter(t => t.pnl > 0).length;
  const winRate = count > 0 ? Math.round((winTrades / count) * 100) : 0;
  const average = count > 0 ? (accumulated / count) : 0;
  return { count, accumulated, winTrades, winRate, average };
}

function updateKPIs(trades) {
  const { count, accumulated, winTrades, winRate, average } = computeStats(trades);

  DOM.valRegistered.textContent = count;
  DOM.subRegistered.textContent = `/ 35 no bloco`;
  const pct = (count / TRADES_PER_BLOCK) * 100;
  DOM.progressRegistered.style.width = `${pct}%`;

  DOM.kpiAccumulatedCard.classList.remove('win-trend', 'loss-trend');
  DOM.kpiWinrateCard.classList.remove('win-trend');
  DOM.kpiAverageCard.classList.remove('win-trend', 'loss-trend');

  DOM.indAccumulated.className = 'kpi-indicator';
  if (count === 0) {
    DOM.valAccumulated.textContent = formatCurrency(accumulated);
    DOM.valAccumulated.className = 'kpi-value';
    DOM.indAccumulated.textContent = 'Sem operações';
  } else if (accumulated >= 0) {
    DOM.valAccumulated.textContent = formatCurrencySigned(accumulated);
    DOM.valAccumulated.className = 'kpi-value pnl-positive';
    DOM.indAccumulated.textContent = 'Saldo positivo';
    DOM.kpiAccumulatedCard.classList.add('win-trend');
  } else {
    DOM.valAccumulated.textContent = formatCurrencySigned(accumulated);
    DOM.valAccumulated.className = 'kpi-value pnl-negative';
    DOM.indAccumulated.textContent = 'Saldo negativo';
    DOM.kpiAccumulatedCard.classList.add('loss-trend');
  }

  DOM.valWinrate.textContent = `${winRate}%`;
  if (count > 0) {
    DOM.indWinrate.textContent = `${winTrades} de ${count} vitoriosos`;
    if (winRate >= 50) DOM.kpiWinrateCard.classList.add('win-trend');
  } else {
    DOM.indWinrate.textContent = 'Taxa de acerto do bloco';
  }

  DOM.indAverage.className = 'kpi-indicator';
  if (count === 0) {
    DOM.valAverage.textContent = formatCurrency(average);
    DOM.valAverage.className = 'kpi-value';
    DOM.indAverage.textContent = 'Média de lucro/prejuízo';
  } else if (average >= 0) {
    DOM.valAverage.textContent = formatCurrencySigned(average);
    DOM.valAverage.className = 'kpi-value pnl-positive';
    DOM.indAverage.textContent = 'Média positiva';
    DOM.kpiAverageCard.classList.add('win-trend');
  } else {
    DOM.valAverage.textContent = formatCurrencySigned(average);
    DOM.valAverage.className = 'kpi-value pnl-negative';
    DOM.indAverage.textContent = 'Média negativa';
    DOM.kpiAverageCard.classList.add('loss-trend');
  }

  DOM.summaryTradesCount.textContent = count;
  DOM.summaryWinrate.textContent = `${winRate}%`;
  DOM.summaryPL.textContent = formatCurrency(accumulated);
  DOM.summaryPL.className = accumulated >= 0 ? 'pnl-positive' : 'pnl-negative';
  if (count === 0) DOM.summaryPL.className = '';
}

function renderGridView(trades) {
  DOM.gridContainer.innerHTML = '';
  for (let i = 0; i < TRADES_PER_BLOCK; i++) {
    const trade = trades[i];
    const slotEl = document.createElement('div');
    if (trade) {
      const temImagem = Array.isArray(trade.images) && trade.images.length > 0;
      slotEl.className = `grid-slot slot-filled ${trade.pnl >= 0 ? 'slot-win' : 'slot-loss'}`
                       + (temImagem ? ' slot-has-image' : '');
      slotEl.innerHTML = `
        ${temImagem ? `
        <div class="slot-thumb" data-caminho="${escapeHTML(trade.images[0].thumb)}">
          <img alt="Print da operação ${escapeHTML(trade.asset)}">
          ${trade.images.length > 1 ? `<span class="slot-thumb-contador">${trade.images.length}</span>` : ''}
        </div>` : ''}
        <div class="slot-header">
          <span class="slot-asset">${escapeHTML(trade.asset)}</span>
          <span class="slot-type-badge ${trade.type}">${trade.type === 'take' ? 'Take' : 'Stop'}</span>
        </div>
        <div class="slot-body">
          <div class="slot-pnl">${trade.pnl >= 0 ? '+' : ''} ${formatCurrency(trade.pnl)}</div>
        </div>
        <div class="slot-footer">
          <span class="slot-index">#${String(i + 1).padStart(2, '0')}</span>
          <span class="slot-date">${formatDateBR(trade.date)}</span>
        </div>
      `;
      slotEl.addEventListener('click', () => openTradeModal(trade, i));
    } else if (i === trades.length) {
      slotEl.className = 'grid-slot slot-active-empty';
      slotEl.innerHTML = `
        <div class="slot-placeholder-inner">
          <div class="slot-plus-icon"><i data-lucide="plus"></i></div>
          <span>Trade</span>
        </div>
      `;
      slotEl.addEventListener('click', () => openTradeModal(null, i));
    } else {
      slotEl.className = 'grid-slot slot-empty';
      slotEl.innerHTML = `<span>Trade</span>`;
      slotEl.addEventListener('click', () => openTradeModal(null, trades.length));
    }
    DOM.gridContainer.appendChild(slotEl);
  }
  hidratarMiniaturasDoGrid(trades);
}

/**
 * Assina as URLs de todas as miniaturas do bloco de uma vez só — 35 cards
 * pedindo sozinhos seriam 35 requisições. Se uma URL expirar com o app
 * aberto, o onerror pede outra e tenta mais uma vez.
 */
async function hidratarMiniaturasDoGrid(trades) {
  const caminhos = trades
    .filter((t) => Array.isArray(t.images) && t.images.length > 0)
    .map((t) => t.images[0].thumb);
  if (caminhos.length === 0) return;

  let mapa;
  try {
    mapa = await getSignedUrls(caminhos);
  } catch (err) {
    console.warn('Falha ao assinar miniaturas do bloco:', err);
    return;
  }

  DOM.gridContainer.querySelectorAll('.slot-thumb').forEach((caixa) => {
    const caminho = caixa.dataset.caminho;
    const url = mapa.get(caminho);
    if (!url) return;
    const img = caixa.querySelector('img');
    let jaTentou = false;

    img.addEventListener('load', () => img.classList.add('carregada'), { once: true });
    img.addEventListener('error', async () => {
      if (jaTentou) return;
      jaTentou = true;
      invalidateSignedUrl(caminho);
      try {
        const novo = await getSignedUrls([caminho]);
        if (novo.get(caminho)) img.src = novo.get(caminho);
      } catch { /* miniatura fica no fundo cinza */ }
    });

    img.src = url;
  });
}

function renderListView(trades) {
  DOM.tableBodyContainer.innerHTML = '';
  if (trades.length === 0) {
    DOM.tableBodyContainer.innerHTML = `
      <tr><td colspan="7" class="empty-table-state">
        <i data-lucide="info"></i>
        <p>Nenhuma operação registrada neste bloco ainda.</p>
      </td></tr>`;
    return;
  }
  trades.forEach((trade, index) => {
    const tr = document.createElement('tr');
    tr.classList.add('table-row-clickable');
    const pnlClass = trade.pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
    const typeLabel = trade.type === 'take' ? 'Take' : 'Stop';
    const typeClass = trade.type === 'take' ? 'pnl-positive' : 'pnl-negative';
    tr.innerHTML = `
      <td class="table-index">#${String(index + 1).padStart(2, '0')}</td>
      <td class="table-asset">${escapeHTML(trade.asset)}</td>
      <td class="table-type ${typeClass}">${typeLabel}</td>
      <td>${formatDateBR(trade.date)}</td>
      <td class="table-pnl ${pnlClass}">${trade.pnl >= 0 ? '+' : ''}${formatCurrency(trade.pnl)}</td>
      <td class="table-notes" title="${escapeHTML(trade.notes || '')}">${escapeHTML(trade.notes || '-')}</td>
      <td>
        <div class="table-actions">
          <button class="btn-table-action btn-edit" title="Editar Operação"><i data-lucide="edit-3"></i></button>
          <button class="btn-table-action btn-delete" title="Excluir Operação"><i data-lucide="trash-2"></i></button>
        </div>
      </td>`;
    tr.addEventListener('click', () => openTradeModal(trade, index));
    tr.querySelector('.btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openTradeModal(trade, index);
    });
    tr.querySelector('.btn-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Tem certeza que deseja excluir a operação #${index + 1} (${trade.asset})?`)) {
        await handleDeleteTrade(trade.id);
      }
    });
    DOM.tableBodyContainer.appendChild(tr);
  });
}

// ==========================================================================
// CHART.JS
// ==========================================================================
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
  const { count, accumulated, winTrades, winRate, average } = computeStats(trades);

  // Cards de KPI da conta
  const totalBlocks = Math.max(1, Object.keys(state.blocks).length);
  DOM.dashValRegistered.textContent = count;
  DOM.dashSubRegistered.textContent = totalBlocks === 1 ? 'em 1 bloco' : `em ${totalBlocks} blocos`;

  DOM.dashKpiAccumulatedCard.classList.remove('win-trend', 'loss-trend');
  DOM.dashKpiWinrateCard.classList.remove('win-trend');
  DOM.dashKpiAverageCard.classList.remove('win-trend', 'loss-trend');

  DOM.dashIndAccumulated.className = 'kpi-indicator';
  if (count === 0) {
    DOM.dashValAccumulated.textContent = formatCurrency(accumulated);
    DOM.dashValAccumulated.className = 'kpi-value';
    DOM.dashIndAccumulated.textContent = 'Sem operações';
  } else if (accumulated >= 0) {
    DOM.dashValAccumulated.textContent = formatCurrencySigned(accumulated);
    DOM.dashValAccumulated.className = 'kpi-value pnl-positive';
    DOM.dashIndAccumulated.textContent = 'Saldo positivo';
    DOM.dashKpiAccumulatedCard.classList.add('win-trend');
  } else {
    DOM.dashValAccumulated.textContent = formatCurrencySigned(accumulated);
    DOM.dashValAccumulated.className = 'kpi-value pnl-negative';
    DOM.dashIndAccumulated.textContent = 'Saldo negativo';
    DOM.dashKpiAccumulatedCard.classList.add('loss-trend');
  }

  DOM.dashValWinrate.textContent = `${winRate}%`;
  if (count > 0) {
    DOM.dashIndWinrate.textContent = `${winTrades} de ${count} vitoriosos`;
    if (winRate >= 50) DOM.dashKpiWinrateCard.classList.add('win-trend');
  } else {
    DOM.dashIndWinrate.textContent = 'Taxa de acerto da conta';
  }

  DOM.dashIndAverage.className = 'kpi-indicator';
  if (count === 0) {
    DOM.dashValAverage.textContent = formatCurrency(average);
    DOM.dashValAverage.className = 'kpi-value';
    DOM.dashIndAverage.textContent = 'Média de lucro/prejuízo';
  } else if (average >= 0) {
    DOM.dashValAverage.textContent = formatCurrencySigned(average);
    DOM.dashValAverage.className = 'kpi-value pnl-positive';
    DOM.dashIndAverage.textContent = 'Média positiva';
    DOM.dashKpiAverageCard.classList.add('win-trend');
  } else {
    DOM.dashValAverage.textContent = formatCurrencySigned(average);
    DOM.dashValAverage.className = 'kpi-value pnl-negative';
    DOM.dashIndAverage.textContent = 'Média negativa';
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

// ==========================================================================
// IMAGENS DO MODAL
// ==========================================================================
const MAX_IMAGENS_POR_TRADE = 10;

// Itens: { tipo: 'existente', item } — já no Storage, com caminhos
//        { tipo: 'nova', file, previewUrl } — escolhida agora, ainda na memória
let modalImagens = [];
let imagensOriginaisDoModal = []; // para saber o que o usuário tirou na edição

// Flag dedicada (não reaproveita DOM.btnSubmitModal.disabled, que também é
// tocado por handleDeleteTrade — este pode rodar por fora do modal, pela
// lixeira da lista, e não deve nem liberar um envio em andamento nem travar
// um modal que nem estava enviando). Liga só em handleSaveTrade, desliga só
// no finally dele.
let salvandoOperacao = false;

function resetModalImagens(imagensExistentes = []) {
  // Libera os object URLs das que não chegaram a subir
  modalImagens.forEach((i) => { if (i.tipo === 'nova') URL.revokeObjectURL(i.previewUrl); });
  modalImagens = imagensExistentes.map((item) => ({ tipo: 'existente', item }));
  renderModalImagens();
}

function renderModalImagens() {
  if (!DOM.tradeImagesStrip) return;
  DOM.tradeImagesStrip.innerHTML = '';

  modalImagens.forEach((entrada, indice) => {
    const fig = document.createElement('div');
    fig.className = 'imagem-miniatura';
    fig.innerHTML = `
      <img alt="Imagem ${indice + 1} da operação">
      <button type="button" class="btn-remover-imagem" title="Remover imagem">
        <i data-lucide="x"></i>
      </button>`;

    const img = fig.querySelector('img');
    if (entrada.tipo === 'nova') {
      img.src = entrada.previewUrl;
    } else {
      fig.classList.add('carregando');
      const caminho = entrada.item.thumb;
      getSignedUrls([caminho])
        .then((mapa) => {
          const url = mapa.get(caminho);
          // Caminho ausente no mapa não é 'apagado': pode ser sessão expirada
          // ou RLS negando por ora. Deixamos a miniatura no estado de
          // carregamento em vez de tratar como erro — nunca removemos a
          // referência por causa disso.
          if (!url) return;
          img.src = url;
          img.addEventListener('load', () => fig.classList.remove('carregando'), { once: true });
        })
        .catch((e) => console.warn('Falha ao assinar URL da miniatura:', e));
    }

    fig.querySelector('.btn-remover-imagem').addEventListener('click', (e) => {
      e.stopPropagation();
      const [removida] = modalImagens.splice(indice, 1);
      if (removida.tipo === 'nova') URL.revokeObjectURL(removida.previewUrl);
      renderModalImagens();
    });

    DOM.tradeImagesStrip.appendChild(fig);
  });

  // Chegou no teto: não dá para escolher mais
  if (DOM.btnAddImage) {
    DOM.btnAddImage.disabled = modalImagens.length >= MAX_IMAGENS_POR_TRADE;
    DOM.btnAddImage.textContent = '';
    DOM.btnAddImage.innerHTML = modalImagens.length >= MAX_IMAGENS_POR_TRADE
      ? '<i data-lucide="image-off"></i> Limite de 10 imagens atingido'
      : '<i data-lucide="image-plus"></i> Adicionar imagens';
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function adicionarImagensEscolhidas(fileList) {
  const vagas = MAX_IMAGENS_POR_TRADE - modalImagens.length;
  const escolhidas = Array.from(fileList || []);
  if (escolhidas.length > vagas) {
    toast(`Cabem só mais ${vagas} imagem(ns) nesta operação.`, 'info');
  }
  escolhidas.slice(0, vagas).forEach((file) => {
    modalImagens.push({ tipo: 'nova', file, previewUrl: URL.createObjectURL(file) });
  });
  renderModalImagens();
}

/**
 * Sobe as imagens escolhidas agora e devolve a lista completa na ordem da
 * faixa. Se qualquer upload falhar, remove as que já subiram nesta rodada
 * e propaga o erro — a operação não é gravada pela metade.
 *
 * Três garantias contra perda de dado (correções de revisão sobre a 1ª versão):
 * - Só convertemos uma entrada para 'existente' (e só então descartamos
 *   `file`/`previewUrl`) DEPOIS que TODOS os uploads da rodada tiverem
 *   sucesso. Se o 2º de 3 falhar, as 3 entradas continuam 'nova' com o
 *   arquivo original intacto: um novo Salvar reenvia tudo do zero, em vez
 *   de gravar o caminho de um arquivo que o `catch` acabou de apagar do
 *   Storage (a 1ª versão perdia o `File` e travava a operação com uma
 *   miniatura quebrada para sempre).
 * - Tanto o loop quanto o RETORNO usam um retrato (`snapshot`) tirado no
 *   início, nunca o array vivo `modalImagens`. Isso cobre dois casos:
 *   (a) remover uma miniatura no meio do envio não desloca índices nem faz
 *   o iterador pular uma entrada (que sairia como `undefined` no retorno e
 *   viraria `null` no jsonb); (b) fechar o modal durante o envio dispara
 *   `resetModalImagens([])`, que zera `modalImagens` — se o retorno lesse a
 *   variável vivo nesse momento, devolveria `[]` e apagaria as imagens já
 *   salvas da operação (inclusive as `'existente'` que nem foram tocadas).
 *   Como o retorno é sempre o snapshot, um reset concorrente não consegue
 *   mais transformá-lo em lista vazia.
 * - Enquanto o envio dura, a faixa ganha a classe `enviando` (pointer-events:
 *   none no CSS) para não deixar o clique de remover acontecer no meio do
 *   caminho, e os botões de fechar/cancelar o modal ficam desabilitados
 *   (ver `setSubmitLoading`) — a defesa de UI. O snapshot é a defesa de
 *   dado: mesmo que uma interação escape do bloqueio de UI (ex.: Enter/
 *   Espaço num botão já focado, que `pointer-events: none` não impede),
 *   o retorno desta função não muda.
 */
async function resolverImagensDoModal() {
  const snapshot = [...modalImagens]; // retrato do que o usuário via ao clicar em Salvar
  const novas = snapshot.filter((i) => i.tipo === 'nova');
  if (novas.length === 0) return snapshot.map((i) => i.item);

  const subidasAgora = []; // { entrada, item } — só aplicado depois que tudo subir
  if (DOM.tradeImagesStrip) DOM.tradeImagesStrip.classList.add('enviando');
  try {
    let feitas = 0;
    for (const entrada of snapshot) {
      if (entrada.tipo !== 'nova') continue;
      feitas++;
      setSubmitLoading(true, `Enviando ${feitas} de ${novas.length}…`);
      const item = await uploadTradeImage(currentUser.id, entrada.file);
      subidasAgora.push({ entrada, item });
    }
  } catch (err) {
    await removeTradeImages(subidasAgora.map((s) => s.item)).catch(() => {});
    throw err;
  } finally {
    setSubmitLoading(true);
    if (DOM.tradeImagesStrip) DOM.tradeImagesStrip.classList.remove('enviando');
  }

  // Só chegamos aqui com a rodada inteira bem-sucedida — agora sim é seguro
  // converter as entradas do snapshot e soltar os objetos (file/previewUrl)
  for (const { entrada, item } of subidasAgora) {
    entrada.tipo = 'existente';
    entrada.item = item;
    if (entrada.previewUrl) URL.revokeObjectURL(entrada.previewUrl);
    delete entrada.previewUrl;
    delete entrada.file;
  }

  // Vem do snapshot, não do array vivo: mesmo que o modal tenha sido
  // fechado (ou uma miniatura removida) durante o await acima, a lista
  // gravada é a que o usuário tinha na tela quando clicou em Salvar
  return snapshot.map((i) => i.item);
}

// ==========================================================================
// MODAL CRUD
// ==========================================================================
function openTradeModal(trade = null, slotIndex = null) {
  if (trade === null) {
    DOM.modalTitle.textContent = `Registrar Operação #${String(slotIndex + 1).padStart(2, '0')}`;
    DOM.tradeIdInput.value = '';
    DOM.tradeSlotInput.value = slotIndex !== null ? slotIndex : '';
    DOM.tradeDate.value = new Date().toISOString().split('T')[0];
    DOM.tradeAsset.value = '';
    DOM.tradeType.value = 'take';
    DOM.tradePnL.value = '';
    DOM.tradeNotes.value = '';
    resetModalImagens([]);
    imagensOriginaisDoModal = [];
    DOM.btnDeleteTrade.style.display = 'none';
  } else {
    DOM.modalTitle.textContent = `Editar Operação #${String(slotIndex + 1).padStart(2, '0')}`;
    DOM.tradeIdInput.value = trade.id;
    DOM.tradeSlotInput.value = slotIndex !== null ? slotIndex : '';
    DOM.tradeAsset.value = trade.asset;
    DOM.tradeType.value = trade.type;
    DOM.tradePnL.value = Math.abs(trade.pnl);
    DOM.tradeDate.value = trade.date;
    DOM.tradeNotes.value = trade.notes || '';
    resetModalImagens(trade.images || []);
    imagensOriginaisDoModal = (trade.images || []).slice();
    DOM.btnDeleteTrade.style.display = 'inline-flex';
  }
  DOM.tradeModal.classList.add('active');
  DOM.tradeAsset.focus();
}

function closeTradeModal() {
  DOM.tradeModal.classList.remove('active');
  resetModalImagens([]);
  DOM.tradeForm.reset();
}

/**
 * Liga/desliga o bloqueio de fechamento do modal durante um salvamento.
 * Usa a flag dedicada `salvandoOperacao` (não `setSubmitLoading`/disabled de
 * botão): `setSubmitLoading` também é chamado por `handleDeleteTrade`, que é
 * disparável pela lixeira da lista, por fora do modal — se as guardas de
 * fechamento dependessem dele, um delete concorrente liberaria um envio
 * ainda em voo, e um delete com o modal fechado travaria Cancelar/X à toa.
 */
function bloquearFechamentoModal(bloquear) {
  salvandoOperacao = bloquear;
  if (DOM.btnCancelModal) DOM.btnCancelModal.disabled = bloquear;
  if (DOM.btnCloseModalX) DOM.btnCloseModalX.disabled = bloquear;
}

async function handleSaveTrade() {
  const id = DOM.tradeIdInput.value;
  const asset = DOM.tradeAsset.value.trim().toUpperCase();
  const type  = DOM.tradeType.value;
  const rawPnl = parseFloat(DOM.tradePnL.value);
  const date = DOM.tradeDate.value;
  const notes = DOM.tradeNotes.value.trim();

  if (!asset || isNaN(rawPnl) || !date) {
    toast('Preencha todos os campos obrigatórios.', 'error');
    return;
  }
  const pnl = type === 'stop' ? -Math.abs(rawPnl) : Math.abs(rawPnl);

  // Retrato de imagensOriginaisDoModal ANTES de qualquer await: o overlay do
  // modal só bloqueia o mouse, não o teclado — sem focus trap, um Tab até a
  // linha de OUTRA operação no fundo + Enter roda openTradeModal() durante o
  // envio e reescreve essa variável de módulo. Sem o retrato, a limpeza de
  // órfãs leria os dados da operação errada e apagaria imagens dela do
  // Storage (o mesmo problema que o snapshot de modalImagens já resolve
  // para a lista de imagens — aqui é a variável irmã).
  const originais = imagensOriginaisDoModal.slice();

  setSubmitLoading(true);
  bloquearFechamentoModal(true);
  try {
    const images = await resolverImagensDoModal();

    if (id === '') {
      await createTrade({ asset, type, pnl, date, notes, images });
    } else {
      await editTrade(id, { asset, type, pnl, date, notes, images });
      // Arquivos que saíram da faixa nesta edição não têm mais dono
      const mantidos = new Set(images.map((i) => i.full));
      const orfas = originais.filter((i) => !mantidos.has(i.full));
      if (orfas.length) {
        removeTradeImages(orfas).catch((e) => console.warn('Imagem órfã não removida:', e));
      }
    }
    closeTradeModal();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    // Desliga a flag ANTES de setSubmitLoading(false): é ela que decide, lá
    // dentro, se este loading:false pode reabilitar "Salvar Operação" (ver
    // o comentário em setSubmitLoading). Só desligamos aqui porque é
    // handleSaveTrade — o dono do salvamento — quem está de fato terminando.
    bloquearFechamentoModal(false);
    setSubmitLoading(false);
  }
}

async function createTrade({ asset, type, pnl, date, notes, images }) {
  let blockIndex = state.activeBlockIndex;
  let blockArr   = state.blocks[String(blockIndex)] || [];

  // Avança até o primeiro bloco com vaga (pode precisar pular vários cheios)
  while (blockArr.length >= TRADES_PER_BLOCK) {
    blockIndex = blockIndex + 1;
    if (!state.blocks[String(blockIndex)]) state.blocks[String(blockIndex)] = [];
    blockArr = state.blocks[String(blockIndex)];
  }
  if (blockIndex !== state.activeBlockIndex) {
    state.activeBlockIndex = blockIndex;
    await persistPreferences({ activeBlockIndex: blockIndex });
  }

  const position = blockArr.length;
  const trade = await insertTrade(currentUser.id, {
    blockIndex, position, asset, type, pnl, date, notes, images
  });

  blockArr.push(trade);

  // Se este insert completou o bloco, abre o próximo automaticamente
  if (blockArr.length === TRADES_PER_BLOCK) {
    const nextIdx = blockIndex + 1;
    if (!state.blocks[String(nextIdx)]) state.blocks[String(nextIdx)] = [];
    state.activeBlockIndex = nextIdx;
    await persistPreferences({ activeBlockIndex: nextIdx });
    toast(`Bloco ${blockIndex} concluído! Bloco ${nextIdx} iniciado.`, 'success');
  }
  renderApp();
}

async function editTrade(id, fields) {
  // Localiza o trade no estado para preservar blockIndex/position
  let foundBlock = null, foundIdx = -1;
  for (const [bIdx, list] of Object.entries(state.blocks)) {
    const idx = list.findIndex(t => t.id === id);
    if (idx !== -1) { foundBlock = bIdx; foundIdx = idx; break; }
  }
  if (foundBlock === null) {
    // Lança em vez de tratar aqui (toast + return): se voltasse em silêncio,
    // handleSaveTrade seguiria como se o update tivesse acontecido e apagaria
    // do Storage as imagens "órfãs" de uma operação que, no banco, nunca foi
    // gravada — a limpeza destrutiva rodando sem gravação real ter ocorrido.
    throw new Error('Operação não encontrada.');
  }
  const updated = await updateTrade(id, fields);
  // Mantém block/position que já estavam (não foram alterados pelo update)
  state.blocks[foundBlock][foundIdx] = {
    ...state.blocks[foundBlock][foundIdx],
    ...updated
  };
  renderApp();
}

async function handleDeleteTrade(id) {
  setSubmitLoading(true);
  try {
    await remoteDeleteTrade(id);
    for (const [bIdx, list] of Object.entries(state.blocks)) {
      const idx = list.findIndex(t => t.id === id);
      if (idx === -1) continue;
      list.splice(idx, 1);
      // Fecha a lacuna também no banco: sem renumerar, a próxima inserção
      // (posição = tamanho da lista) colidiria com uma posição existente
      const changes = [];
      for (let i = idx; i < list.length; i++) {
        list[i].position = i;
        changes.push({ id: list[i].id, blockIndex: Number(bIdx), position: i });
      }
      if (changes.length) await updateTradePlacements(changes);
      break;
    }
    renderApp();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setSubmitLoading(false);
  }
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================
function setupEventListeners() {
  const tabToPage = {
    'dashboard':       DOM.pageDashboard,
    'trading-journal': DOM.pageTradingJournal,
    'forex-calc':      DOM.pageForexCalc,
    'futures-calc':    DOM.pageFuturesCalc,
    'b3-calc':         DOM.pageB3Calc,
    'btc-calc':        DOM.pageBtcCalc,
    'trading-plan':    DOM.pageTradingPlan
  };

  DOM.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = item.getAttribute('data-tab');
      DOM.navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      DOM.pageSections.forEach(s => s.classList.remove('active'));
      const target = tabToPage[tabName];
      if (target) {
        target.classList.add('active');
        if (tabName === 'trading-journal') renderApp();
        else if (tabName === 'dashboard') renderDashboard();
        lucide.createIcons();
      } else {
        DOM.pagePlaceholder.classList.add('active');
        const label = item.querySelector('span').textContent;
        DOM.pagePlaceholder.querySelector('h2').textContent = label;
      }
    });
  });

  // Modal
  DOM.btnNewTradeHeader.addEventListener('click', () => {
    const idx = state.activeBlockIndex;
    const trades = state.blocks[String(idx)] || [];
    openTradeModal(null, Math.min(trades.length, TRADES_PER_BLOCK - 1));
  });
  DOM.btnCloseModalX.addEventListener('click', closeTradeModal);
  DOM.btnCancelModal.addEventListener('click', closeTradeModal);
  DOM.tradeModal.addEventListener('click', (e) => {
    // Clique no fundo não fecha durante o envio — mesmo motivo do botão
    // Cancelar/X desabilitado: fechar no meio do upload zeraria modalImagens.
    // Usa a flag dedicada, não DOM.btnSubmitModal.disabled (que também liga
    // durante um handleDeleteTrade disparado por fora do modal).
    if (e.target === DOM.tradeModal && !salvandoOperacao) closeTradeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && DOM.tradeModal.classList.contains('active') && !salvandoOperacao) {
      closeTradeModal();
    }
  });
  DOM.tradeForm.addEventListener('submit', (e) => { e.preventDefault(); handleSaveTrade(); });
  if (DOM.btnAddImage) {
    DOM.btnAddImage.addEventListener('click', () => DOM.tradeImageInput.click());
  }
  if (DOM.tradeImageInput) {
    DOM.tradeImageInput.addEventListener('change', (e) => {
      adicionarImagensEscolhidas(e.target.files);
      e.target.value = ''; // permite escolher o MESMO arquivo de novo
    });
  }
  DOM.btnDeleteTrade.addEventListener('click', async () => {
    const id = DOM.tradeIdInput.value;
    if (id && confirm('Deseja realmente excluir esta operação?')) {
      await handleDeleteTrade(id);
      closeTradeModal();
    }
  });

  // Views
  DOM.btnToggleGrid.addEventListener('click', () => {
    currentView = 'grid';
    DOM.btnToggleGrid.classList.add('active');
    DOM.btnToggleList.classList.remove('active');
    DOM.contentGridView.classList.add('active');
    DOM.contentListView.classList.remove('active');
    renderApp();
  });
  DOM.btnToggleList.addEventListener('click', () => {
    currentView = 'list';
    DOM.btnToggleList.classList.add('active');
    DOM.btnToggleGrid.classList.remove('active');
    DOM.contentListView.classList.add('active');
    DOM.contentGridView.classList.remove('active');
    renderApp();
  });

  // Navegação de blocos
  DOM.btnPrevBlock.addEventListener('click', async () => {
    if (state.activeBlockIndex > 1) {
      state.activeBlockIndex--;
      await persistPreferences({ activeBlockIndex: state.activeBlockIndex });
      renderApp();
    }
  });
  DOM.btnNextBlock.addEventListener('click', async () => {
    const totalBlocks = Object.keys(state.blocks).length;
    if (state.activeBlockIndex < totalBlocks) {
      state.activeBlockIndex++;
      await persistPreferences({ activeBlockIndex: state.activeBlockIndex });
      renderApp();
    }
  });

  // Plano Operacional
  DOM.planForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSavePlan();
  });

  // Menu "Opções" do rodapé da sidebar (recolhido por padrão)
  DOM.btnFooterMenu.addEventListener('click', () => {
    const aberto = DOM.sidebarFooter.classList.toggle('open');
    DOM.btnFooterMenu.setAttribute('aria-expanded', String(aberto));
  });

  // Export / Import / Reset
  DOM.btnExportData.addEventListener('click', exportData);
  DOM.btnImportData.addEventListener('click', () => DOM.fileImportInput.click());
  DOM.fileImportInput.addEventListener('change', importData);
  DOM.btnResetApp.addEventListener('click', resetApp);

  // Tema
  DOM.btnThemeToggle.addEventListener('click', toggleTheme);

  // Logout
  if (DOM.btnLogout) {
    DOM.btnLogout.addEventListener('click', async () => {
      if (!confirm('Tem certeza que deseja sair?')) return;
      try { await signOut(); } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Calculadoras
  setupCalculatorsListeners();
}

// ==========================================================================
// EXPORT / IMPORT / RESET (Cloud)
// ==========================================================================
function exportData() {
  const payload = {
    activeBlockIndex: state.activeBlockIndex,
    blocks: state.blocks,
    userEmail: state.userEmail,
    theme: state.theme,
    plan: state.plan,
    exportedAt: new Date().toISOString()
  };
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const a = document.createElement('a');
  a.setAttribute('href', dataStr);
  a.setAttribute('download', `monolith_backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(a); a.click(); a.remove();
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!parsed || !parsed.blocks) throw new Error('Arquivo JSON inválido.');
      if (!confirm('Importar irá ADICIONAR todas as operações do arquivo à sua conta no Supabase. Continuar?')) return;

      showLoading(true);
      // Bulk insert — blocos do arquivo entram DEPOIS do último bloco com
      // operações, nunca por cima das posições existentes
      const usedBlocks = Object.entries(state.blocks)
        .filter(([, list]) => list.length > 0)
        .map(([k]) => Number(k));
      const blockOffset = usedBlocks.length ? Math.max(...usedBlocks) : 0;
      await bulkImportTrades(currentUser.id, parsed.blocks, blockOffset);
      // Refetch
      const blocks = await fetchAllTradesByBlock(currentUser.id);
      if (!blocks['1']) blocks['1'] = [];
      state.blocks = blocks;
      // Restaura o plano operacional, se presente no backup
      if (parsed.plan) {
        await savePlan(currentUser.id, parsed.plan);
        state.plan = await fetchPlan(currentUser.id);
        renderPlanForm();
      }
      renderApp();
      toast('Dados importados com sucesso.', 'success');
    } catch (err) {
      toast('Erro ao importar: ' + err.message, 'error');
    } finally {
      showLoading(false);
      DOM.fileImportInput.value = '';
    }
  };
  reader.readAsText(file);
}

async function resetApp() {
  const ok1 = confirm('ATENÇÃO: Isso excluirá PERMANENTEMENTE todas as suas operações da nuvem. Deseja prosseguir?');
  if (!ok1) return;
  const conf = prompt('Digite "DELETAR" para confirmar:');
  if (conf !== 'DELETAR') { toast('Confirmação incorreta. Operação cancelada.', 'info'); return; }

  showLoading(true);
  try {
    await deleteAllTrades(currentUser.id);
    await updatePreferences(currentUser.id, { activeBlockIndex: 1 });
    state.blocks = { '1': [] };
    state.activeBlockIndex = 1;
    renderApp();
    toast('Banco de dados redefinido.', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ==========================================================================
// TEMA
// ==========================================================================
async function toggleTheme() {
  const newTheme = state.theme === 'light' ? 'dark' : 'light';
  state.theme = newTheme;
  applyTheme(newTheme);
  renderApp();
  await persistPreferences({ theme: newTheme });
}

function applyTheme(theme) {
  const body = document.body;
  const btn = DOM.btnThemeToggle || document.getElementById('btn-theme-toggle');
  if (theme === 'light') {
    body.classList.add('light-theme');
    if (btn) { btn.innerHTML = '<i data-lucide="moon"></i>'; btn.title = 'Alternar para Tema Escuro'; }
  } else {
    body.classList.remove('light-theme');
    if (btn) { btn.innerHTML = '<i data-lucide="sun"></i>'; btn.title = 'Alternar para Tema Claro'; }
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==========================================================================
// CALCULADORAS (lógica preservada do original)
// ==========================================================================
function setupCalculatorsListeners() {
  const fxBtn  = document.getElementById('btn-fx-calc');
  const futBtn = document.getElementById('btn-fut-calc');
  const b3Btn  = document.getElementById('btn-b3-calc');
  const btcBtn = document.getElementById('btn-btc-calc');
  if (fxBtn)  fxBtn.addEventListener('click',  calculateForex);
  if (futBtn) futBtn.addEventListener('click', calculateFutures);
  if (b3Btn)  b3Btn.addEventListener('click',  calculateB3);
  if (btcBtn) btcBtn.addEventListener('click', calculateBTC);
  const fxPair = document.getElementById('fx-pair');
  if (fxPair) {
    // O Chrome restaura a seleção do <select> no F5, então o modo precisa ser
    // aplicado no boot e não só na troca.
    applyForexAssetMode(fxPair.value);
    fxPair.addEventListener('change', onForexPairChange);
  }
}

// CFDs de índice negociados em lote fracionário: valor fixo em USD por pip, por lote.
// No USTEC 1 pip = 0,1 ponto do índice (cotação com uma casa decimal) → $0,10 por lote.
// Única fonte de verdade de "este ativo é índice, não par de moedas" — cálculo e UI consultam daqui.
const INDEX_CFD_SPECS = { USTEC: { pipValue: 0.10 } };

// Ativos da Calculadora Forex que não são par de moedas: a posição não se dimensiona em
// lote padrão de moeda (100.000 unidades), então o painel não fala em "lote padrão".
// O ouro entra aqui por ser dimensionado em onças, não em moeda.
const FX_NON_CURRENCY_ASSETS = new Set(['XAUUSD']);

function isForexNonCurrencyAsset(pair) {
  return !!INDEX_CFD_SPECS[pair] || FX_NON_CURRENCY_ASSETS.has(pair);
}

/**
 * Valor do pip por lote padrão (100.000 unidades da moeda base), em USD, conta em USD:
 *   XXX/USD   → 0,0001 × 100.000 = $10 — não depende de câmbio nenhum
 *   USD/XXX   → (tamanho do pip × 100.000) ÷ cotação USD/XXX
 *   cross JPY → 1.000 JPY ÷ cotação **USD/JPY** (a cotação do próprio par não entra)
 *
 * Nos pares cuja moeda de cotação não é o dólar o valor depende do câmbio do dia, então
 * o número aqui é uma referência que **envelhece** — é o preço de manter a tela sem campo
 * de cotação, e o rodapé avisa que os valores são aproximados. Para atualizar: recalcule
 * pelas fórmulas acima com a cotação do dia e mova `FX_QUOTES_DATE` junto.
 *
 * Cotações de referência (BCE): USD/JPY 163,82 · USD/CHF 0,81761 · USD/CAD 1,4086.
 */
const FX_QUOTES_DATE = '24/07/2026';
const FX_PIP_VALUE_PER_LOT = {
  EURUSD: 10,   GBPUSD: 10,    AUDUSD: 10,   NZDUSD: 10,
  USDJPY: 6.10, USDCHF: 12.23, USDCAD: 7.10,
  EURJPY: 6.10, GBPJPY: 6.10
};

function forexPipValuePerLot(pair) {
  // CFD de índice (USTEC): valor do pip é fixo por lote, sem conversão de moeda
  if (INDEX_CFD_SPECS[pair]) return INDEX_CFD_SPECS[pair].pipValue;
  // XAUUSD: calcula posição em mini lotes (10 oz → $1/pip), não em lote padrão
  if (pair === 'XAUUSD') return 1;
  // Par fora da tabela devolve null, e quem chama recusa calcular: chutar $10 faria a
  // calculadora errar calada num par novo — foi assim que o preço fixo passou despercebido.
  const pipValue = FX_PIP_VALUE_PER_LOT[pair];
  return pipValue === undefined ? null : pipValue;
}

const FX_HELP_FOREX = `Fórmula: Lote = Risco USD ÷ (Stop em pips × Valor do pip por lote). Cálculo presume conta em USD. Posição arredondada para baixo (0,01 lote) para não ultrapassar o risco definido. Nos pares sem o dólar na cotação (iene, franco suíço e dólar canadense) o valor do pip usa o câmbio de referência de ${FX_QUOTES_DATE}. Valores aproximados baseados em padrão de mercado. Pode variar conforme corretora.`;
const FX_HELP_INDEX = 'Fórmula: Lotes = Risco USD ÷ (Stop em pips × Valor do pip). No USTEC 1 pip = 0,1 ponto do índice. Cálculo presume conta em USD. Posição arredondada para baixo (0,01 lote) para não ultrapassar o risco definido. Valores aproximados baseados em padrão de mercado. Pode variar conforme corretora.';

/**
 * Ajusta o painel Forex ao ativo selecionado. Fora de par de moedas (CFD de índice e
 * ouro), tira a menção a "lote padrão" — não existe lote padrão de 100.000 unidades
 * nesses ativos. A fórmula no rodapé só muda em índice, que tem a conversão pip↔ponto.
 * O stop continua medido em pips em todos os ativos. Idempotente.
 */
function applyForexAssetMode(pair) {
  const isNonCurrency = isForexNonCurrencyAsset(pair);
  const pipLabel = document.getElementById('fx-pipval-label');
  if (pipLabel) pipLabel.textContent = isNonCurrency ? 'Valor por pip (1 lote)' : 'Valor por pip (1 lote padrão)';
  const help = document.getElementById('fx-help');
  if (help) help.textContent = INDEX_CFD_SPECS[pair] ? FX_HELP_INDEX : FX_HELP_FOREX;
}

function onForexPairChange() {
  const pair = document.getElementById('fx-pair').value;
  applyForexAssetMode(pair);
  const risk = parseFloat(document.getElementById('fx-risk').value);
  const stop = parseFloat(document.getElementById('fx-stop-pips').value);
  // Recalcula só com os campos já válidos: trocar de ativo não é tentativa de
  // calcular, então nunca deve gerar toast de erro.
  if (!isNaN(risk) && !isNaN(stop) && risk > 0 && stop > 0) calculateForex();
}

function calculateForex() {
  const riskAmount = parseFloat(document.getElementById('fx-risk').value);
  const stopPips   = parseFloat(document.getElementById('fx-stop-pips').value);
  const pair       = document.getElementById('fx-pair').value;
  if (isNaN(riskAmount) || isNaN(stopPips) || stopPips <= 0 || riskAmount <= 0) {
    toast('Preencha stop e risco corretamente (> 0).', 'error'); return;
  }
  const pipValuePerLot = forexPipValuePerLot(pair);
  if (pipValuePerLot === null) {
    toast('Este ativo ainda não tem valor de pip cadastrado.', 'error'); return;
  }
  // Arredonda para baixo no passo de micro lote (0,01) para não ultrapassar o risco definido
  const preciseLot = riskAmount / (stopPips * pipValuePerLot);
  const lotSize    = Math.floor(preciseLot * 100) / 100;
  const actualRisk = lotSize * stopPips * pipValuePerLot;
  applyForexAssetMode(pair);
  document.getElementById('fx-out-risk').textContent    = formatCurrency(riskAmount);
  document.getElementById('fx-out-pipval').textContent  = formatCurrency(pipValuePerLot);
  document.getElementById('fx-out-lots').textContent    = lotSize.toFixed(2);
  document.getElementById('fx-out-actrisk').textContent = formatCurrency(actualRisk);
  // Lote zerado: com esse stop, o risco definido não paga nem o lote mínimo
  if (lotSize <= 0) toast('Risco insuficiente para 0,01 lote com esse stop.', 'error');
}

const FUTURES_SPECS = {
  ES:{pointValue:50,tickSize:0.25}, NQ:{pointValue:20,tickSize:0.25},
  YM:{pointValue:5,tickSize:1},     RTY:{pointValue:50,tickSize:0.10},
  MES:{pointValue:5,tickSize:0.25}, MNQ:{pointValue:2,tickSize:0.25},
  MYM:{pointValue:0.50,tickSize:1}, M2K:{pointValue:5,tickSize:0.10},
  CL:{pointValue:1000,tickSize:0.01}, MCL:{pointValue:100,tickSize:0.01},
  GC:{pointValue:100,tickSize:0.10},  MGC:{pointValue:10,tickSize:0.10},
  SI:{pointValue:5000,tickSize:0.005}
};

function calculateFutures() {
  const riskAmount = parseFloat(document.getElementById('fut-risk').value);
  const stopPts    = parseFloat(document.getElementById('fut-stop').value);
  const symbol     = document.getElementById('fut-symbol').value;
  const spec = FUTURES_SPECS[symbol];
  if (!spec || isNaN(riskAmount) || isNaN(stopPts) || stopPts <= 0 || riskAmount <= 0) {
    toast('Preencha stop e risco corretamente (> 0).', 'error'); return;
  }
  const tickValue = spec.pointValue * spec.tickSize;
  const lossPerContract = stopPts * spec.pointValue;
  const contracts = Math.floor(riskAmount / lossPerContract);
  const actualRisk = contracts * lossPerContract;
  document.getElementById('fut-out-risk').textContent      = formatCurrency(riskAmount);
  document.getElementById('fut-out-pointval').textContent  = formatCurrency(spec.pointValue);
  document.getElementById('fut-out-tickval').textContent   = formatCurrency(tickValue);
  document.getElementById('fut-out-perctr').textContent    = formatCurrency(lossPerContract);
  document.getElementById('fut-out-contracts').textContent = contracts;
  document.getElementById('fut-out-actrisk').textContent   = formatCurrency(actualRisk);
}

const B3_SPECS = { WIN:{pointValue:0.20}, IND:{pointValue:1.00}, WDO:{pointValue:10.00}, DOL:{pointValue:50.00} };

function formatBRL(value) {
  const isNeg = value < 0;
  const formatted = Math.abs(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${isNeg ? '- ' : ''}${formatted}`;
}

function calculateB3() {
  const riskAmount = parseFloat(document.getElementById('b3-risk').value);
  const stopPts    = parseFloat(document.getElementById('b3-stop').value);
  const symbol     = document.getElementById('b3-symbol').value;
  const spec = B3_SPECS[symbol];
  if (!spec || isNaN(riskAmount) || isNaN(stopPts) || stopPts <= 0 || riskAmount <= 0) {
    toast('Preencha stop e risco corretamente (> 0).', 'error'); return;
  }
  const lossPerContract = stopPts * spec.pointValue;
  const contracts = Math.floor(riskAmount / lossPerContract);
  const actualRisk = contracts * lossPerContract;
  document.getElementById('b3-out-risk').textContent      = formatBRL(riskAmount);
  document.getElementById('b3-out-pointval').textContent  = formatBRL(spec.pointValue);
  document.getElementById('b3-out-perctr').textContent    = formatBRL(lossPerContract);
  document.getElementById('b3-out-contracts').textContent = contracts;
  document.getElementById('b3-out-actrisk').textContent   = formatBRL(actualRisk);
}

const BTC_PIP_SPECS = { BTCUSD_1:{pipValue:1}, BTCUSD_10:{pipValue:10}, BTCUSD_100:{pipValue:100} };

function calculateBTC() {
  const broker  = document.getElementById('btc-broker').value;
  const stopPips= parseFloat(document.getElementById('btc-stop-pips').value);
  const riskUSD = parseFloat(document.getElementById('btc-risk-usd').value);
  const spec = BTC_PIP_SPECS[broker];
  if (!spec || isNaN(stopPips) || isNaN(riskUSD) || stopPips <= 0 || riskUSD <= 0) {
    toast('Preencha stop e risco corretamente (> 0).', 'error'); return;
  }
  const lossPerLot = stopPips * spec.pipValue;
  // Arredonda para baixo (0,01) para não ultrapassar o risco
  const lots = Math.floor((riskUSD / lossPerLot) * 100) / 100;
  const actualRisk = lots * lossPerLot;
  document.getElementById('btc-out-risk').textContent    = formatCurrency(riskUSD);
  document.getElementById('btc-out-pipval').textContent  = formatCurrency(spec.pipValue);
  document.getElementById('btc-out-losslot').textContent = formatCurrency(lossPerLot);
  document.getElementById('btc-out-size').textContent    = lots.toFixed(2);
  document.getElementById('btc-out-actrisk').textContent = formatCurrency(actualRisk);
}

// ==========================================================================
// HELPERS / UI UTILITIES
// ==========================================================================
function formatCurrency(value) {
  const isNeg = value < 0;
  const formatted = Math.abs(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${isNeg ? '- ' : ''}${formatted}`;
}

/** Como formatCurrency, mas com sinal explícito também no positivo ("+ $46.88"). */
function formatCurrencySigned(value) {
  return value >= 0 ? `+ ${formatCurrency(value)}` : formatCurrency(value);
}

function formatDateBR(s) {
  if (!s) return '';
  const p = s.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : s;
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, (t) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[t] || t));
}

function showLoading(show) {
  if (!DOM.appLoading) return;
  DOM.appLoading.classList.toggle('active', !!show);
}

function setSubmitLoading(loading, rotulo = 'Salvando…') {
  if (DOM.btnSubmitModal) {
    // Enquanto salvandoOperacao for true, só quem desligou a flag (o
    // próprio handleSaveTrade, no fim do seu try/finally) pode reabilitar
    // este botão com loading:false. Sem essa guarda, um handleDeleteTrade
    // concorrente (lixeira da lista, fora do modal, sem passar pela flag)
    // chamaria setSubmitLoading(false) no seu próprio finally e devolveria
    // "Salvar Operação" ativo com o upload de OUTRA operação ainda em voo
    // — o usuário clicaria de novo, disparando duas rodadas de
    // handleSaveTrade ao mesmo tempo (o mesmo arquivo sobe duas vezes; o
    // perdedor da corrida vira órfão no Storage). Quem manda no botão
    // durante um salvamento é o próprio salvamento, não uma exclusão que
    // passou por perto.
    if (loading || !salvandoOperacao) {
      DOM.btnSubmitModal.disabled = loading;
      DOM.btnSubmitModal.textContent = loading ? rotulo : 'Salvar Operação';
    }
  }
  if (DOM.btnDeleteTrade) DOM.btnDeleteTrade.disabled = loading;
  if (DOM.btnAddImage)    DOM.btnAddImage.disabled = loading || modalImagens.length >= MAX_IMAGENS_POR_TRADE;
  // Cancelar/X NÃO são tocados aqui: esta função também é chamada por
  // handleDeleteTrade (disparável pela lixeira da lista, fora do modal) —
  // ver bloquearFechamentoModal(), que usa a flag dedicada salvandoOperacao.
}

function toast(message, kind = 'info') {
  let host = document.getElementById('toast-container');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-container';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 3000);
  setTimeout(() => el.remove(), 3500);
}
