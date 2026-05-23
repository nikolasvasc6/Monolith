/**
 * PositionPips — Diário de Trading Profissional
 * Orquestrador principal (Módulo ES). Integrado com Supabase.
 *
 * - Autenticação via Supabase Auth (email + senha)
 * - Persistência em Postgres (tabelas trades + user_preferences)
 * - Realtime: sincroniza automaticamente entre dispositivos
 * - RLS no banco garante isolamento por usuário
 */

import { onAuthChange, getSession, signOut } from './js/auth.js?v=2';
import { initAuthUI, showAuthScreen, hideAuthScreen, onAuthenticated } from './js/ui/auth-ui.js?v=2';
import {
  fetchAllTradesByBlock,
  insertTrade,
  updateTrade,
  deleteTrade as remoteDeleteTrade,
  deleteAllTrades,
  bulkImportTrades,
  subscribeRealtime,
  unsubscribeRealtime
} from './js/services/trades.js?v=2';
import {
  fetchPreferences,
  updatePreferences
} from './js/services/preferences.js?v=2';

// ==========================================================================
// CONSTANTES & ESTADO
// ==========================================================================
const TRADES_PER_BLOCK = 35;

const DEFAULT_STATE = {
  activeBlockIndex: 1,
  blocks: { '1': [] },
  userEmail: '',
  theme: 'dark'
};

let state          = { ...DEFAULT_STATE, blocks: { '1': [] } };
let chartInstance  = null;
let currentView    = 'grid'; // 'grid' ou 'list'
let currentUser    = null;   // { id, email }
let realtimeChan   = null;   // canal supabase
let isApplyingRemote = false;// evita loops de refetch
let domReady       = false;

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
  DOM.btnDeleteTrade    = document.getElementById('btn-delete-trade');
  DOM.btnCancelModal    = document.getElementById('btn-cancel-modal');
  DOM.btnCloseModalX    = document.getElementById('btn-close-modal-x');
  DOM.btnSubmitModal    = document.getElementById('btn-submit-modal');
  DOM.btnNewTradeHeader = document.getElementById('btn-new-trade-header');

  DOM.btnExportData     = document.getElementById('btn-export-data');
  DOM.btnImportData     = document.getElementById('btn-import-data');
  DOM.fileImportInput   = document.getElementById('file-import-input');
  DOM.btnResetApp       = document.getElementById('btn-reset-app');
  DOM.btnThemeToggle    = document.getElementById('btn-theme-toggle');
  DOM.btnLogout         = document.getElementById('btn-logout');
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
    }
  });
});

async function bootAuthenticatedApp(user) {
  currentUser = { id: user.id, email: user.email };
  showLoading(true);
  hideAuthScreen();
  try {
    await loadDataFromCloud();
    setupRealtime();
    renderApp();
  } catch (err) {
    toast(err.message || 'Erro ao carregar dados.', 'error');
  } finally {
    showLoading(false);
  }
}

function teardownAuthenticatedApp() {
  unsubscribeRealtime(realtimeChan);
  realtimeChan = null;
  currentUser  = null;
  state        = { ...DEFAULT_STATE, blocks: { '1': [] } };
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
}

// ==========================================================================
// PERSISTÊNCIA — CLOUD (SUPABASE)
// ==========================================================================
async function loadDataFromCloud() {
  const [prefs, blocks] = await Promise.all([
    fetchPreferences(currentUser.id),
    fetchAllTradesByBlock(currentUser.id)
  ]);
  // Garante bloco 1 sempre presente
  if (!blocks['1']) blocks['1'] = [];

  state = {
    activeBlockIndex: prefs.activeBlockIndex,
    blocks,
    userEmail: currentUser.email,
    theme: prefs.theme
  };

  // Se o bloco ativo não existe (ex: usuário apagou), volta pra 1
  if (!state.blocks[String(state.activeBlockIndex)]) {
    state.activeBlockIndex = 1;
    await persistPreferences({ activeBlockIndex: 1 });
  }
  applyTheme(state.theme);
}

async function persistPreferences(patch) {
  try {
    await updatePreferences(currentUser.id, patch);
  } catch (err) {
    toast(err.message, 'error');
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
  renderChart(blockTrades);

  if (currentView === 'grid') renderGridView(blockTrades);
  else                        renderListView(blockTrades);

  lucide.createIcons();
}

function updateKPIs(trades) {
  const count = trades.length;

  DOM.valRegistered.textContent = count;
  DOM.subRegistered.textContent = `/ 35 no bloco`;
  const pct = (count / TRADES_PER_BLOCK) * 100;
  DOM.progressRegistered.style.width = `${pct}%`;

  const accumulatedPnL = trades.reduce((s, t) => s + t.pnl, 0);
  DOM.valAccumulated.textContent = formatCurrency(accumulatedPnL);

  DOM.kpiAccumulatedCard.classList.remove('win-trend', 'loss-trend');
  DOM.kpiWinrateCard.classList.remove('win-trend');
  DOM.kpiAverageCard.classList.remove('win-trend', 'loss-trend');

  if (count === 0) {
    DOM.indAccumulated.textContent = 'Sem operações';
    DOM.indAccumulated.className = 'kpi-indicator';
  } else if (accumulatedPnL >= 0) {
    DOM.indAccumulated.textContent = 'Saldo positivo';
    DOM.indAccumulated.className = 'kpi-indicator pnl-positive';
    DOM.kpiAccumulatedCard.classList.add('win-trend');
  } else {
    DOM.indAccumulated.textContent = 'Saldo negativo';
    DOM.indAccumulated.className = 'kpi-indicator pnl-negative';
    DOM.kpiAccumulatedCard.classList.add('loss-trend');
  }

  const winTrades = trades.filter(t => t.pnl > 0).length;
  const winRate = count > 0 ? Math.round((winTrades / count) * 100) : 0;
  DOM.valWinrate.textContent = `${winRate}%`;
  if (count > 0) {
    DOM.indWinrate.textContent = `${winTrades} de ${count} vitoriosos`;
    if (winRate >= 50) DOM.kpiWinrateCard.classList.add('win-trend');
  } else {
    DOM.indWinrate.textContent = 'Taxa de acerto do bloco';
  }

  const averagePnL = count > 0 ? (accumulatedPnL / count) : 0;
  DOM.valAverage.textContent = formatCurrency(averagePnL);
  if (count === 0) {
    DOM.indAverage.textContent = 'Média de lucro/prejuízo';
    DOM.indAverage.className = 'kpi-indicator';
  } else if (averagePnL >= 0) {
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
  DOM.summaryPL.textContent = formatCurrency(accumulatedPnL);
  DOM.summaryPL.className = accumulatedPnL >= 0 ? 'pnl-positive' : 'pnl-negative';
  if (count === 0) DOM.summaryPL.className = '';
}

function renderGridView(trades) {
  DOM.gridContainer.innerHTML = '';
  for (let i = 0; i < TRADES_PER_BLOCK; i++) {
    const trade = trades[i];
    const slotEl = document.createElement('div');
    if (trade) {
      slotEl.className = `grid-slot slot-filled ${trade.pnl >= 0 ? 'slot-win' : 'slot-loss'}`;
      slotEl.innerHTML = `
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
          <span>Trade +</span>
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
function renderChart(trades) {
  if (chartInstance) chartInstance.destroy();
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

  const ctx = DOM.canvasChart.getContext('2d');
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

  chartInstance = new Chart(ctx, {
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
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg, titleColor: tooltipText, bodyColor: tooltipText,
          titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 12 },
          borderColor: tooltipBorder, borderWidth: 1, padding: 10, displayColors: false,
          callbacks: {
            title: (c) => c[0].dataIndex === 0 ? 'Início do Bloco' : `Operação #${c[0].dataIndex}`,
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
    DOM.btnDeleteTrade.style.display = 'inline-flex';
  }
  DOM.tradeModal.classList.add('active');
  DOM.tradeAsset.focus();
}

function closeTradeModal() {
  DOM.tradeModal.classList.remove('active');
  DOM.tradeForm.reset();
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

  setSubmitLoading(true);
  try {
    if (id === '') {
      await createTrade({ asset, type, pnl, date, notes });
    } else {
      await editTrade(id, { asset, type, pnl, date, notes });
    }
    closeTradeModal();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setSubmitLoading(false);
  }
}

async function createTrade({ asset, type, pnl, date, notes }) {
  let blockIndex = state.activeBlockIndex;
  let blockArr   = state.blocks[String(blockIndex)] || [];

  if (blockArr.length >= TRADES_PER_BLOCK) {
    // Avança/cria próximo bloco
    blockIndex = blockIndex + 1;
    if (!state.blocks[String(blockIndex)]) state.blocks[String(blockIndex)] = [];
    blockArr = state.blocks[String(blockIndex)];
    state.activeBlockIndex = blockIndex;
    await persistPreferences({ activeBlockIndex: blockIndex });
  }

  const position = blockArr.length;
  const trade = await insertTrade(currentUser.id, {
    blockIndex, position, asset, type, pnl, date, notes
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
    toast('Operação não encontrada.', 'error');
    return;
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
    for (const list of Object.values(state.blocks)) {
      const idx = list.findIndex(t => t.id === id);
      if (idx !== -1) { list.splice(idx, 1); break; }
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
    'trading-journal': DOM.pageTradingJournal,
    'forex-calc':      DOM.pageForexCalc,
    'futures-calc':    DOM.pageFuturesCalc,
    'b3-calc':         DOM.pageB3Calc,
    'btc-calc':        DOM.pageBtcCalc
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
    if (e.target === DOM.tradeModal) closeTradeModal();
  });
  DOM.tradeForm.addEventListener('submit', (e) => { e.preventDefault(); handleSaveTrade(); });
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
    exportedAt: new Date().toISOString()
  };
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const a = document.createElement('a');
  a.setAttribute('href', dataStr);
  a.setAttribute('download', `positionpips_backup_${new Date().toISOString().split('T')[0]}.json`);
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
      // Bulk insert
      await bulkImportTrades(currentUser.id, parsed.blocks);
      // Refetch
      const blocks = await fetchAllTradesByBlock(currentUser.id);
      if (!blocks['1']) blocks['1'] = [];
      state.blocks = blocks;
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
}

function forexPipValuePerLot(pair, price) {
  const standardLot = 100000;
  // XAUUSD: calcula posição em mini lotes (10 oz → $1/pip), não em lote padrão
  if (pair === 'XAUUSD') return 1;
  if (pair.endsWith('USD')) return 0.0001 * standardLot;
  if (pair.startsWith('USD')) {
    if (pair === 'USDJPY') return (0.01 * standardLot) / price;
    return (0.0001 * standardLot) / price;
  }
  if (pair.endsWith('JPY')) return (0.01 * standardLot) / 150;
  return 0.0001 * standardLot;
}

function calculateForex() {
  const riskAmount = parseFloat(document.getElementById('fx-risk').value);
  const stopPips   = parseFloat(document.getElementById('fx-stop-pips').value);
  const pair       = document.getElementById('fx-pair').value;
  const price      = parseFloat(document.getElementById('fx-price').value) || 1.08500;
  if (isNaN(riskAmount) || isNaN(stopPips) || stopPips <= 0 || riskAmount <= 0) {
    toast('Preencha stop e risco corretamente (> 0).', 'error'); return;
  }
  const pipValuePerLot = forexPipValuePerLot(pair, price);
  // Arredonda para baixo no passo de micro lote (0,01) para não ultrapassar o risco definido
  const preciseLot = riskAmount / (stopPips * pipValuePerLot);
  const lotSize    = Math.floor(preciseLot * 100) / 100;
  const actualRisk = lotSize * stopPips * pipValuePerLot;
  document.getElementById('fx-out-risk').textContent    = formatCurrency(riskAmount);
  document.getElementById('fx-out-pipval').textContent  = formatCurrency(pipValuePerLot);
  document.getElementById('fx-out-lots').textContent    = lotSize.toFixed(2);
  document.getElementById('fx-out-mini').textContent    = (lotSize * 10).toFixed(1);
  document.getElementById('fx-out-micro').textContent   = Math.floor(lotSize * 100).toLocaleString('pt-BR');
  document.getElementById('fx-out-units').textContent   = Math.round(lotSize * 100000).toLocaleString('pt-BR');
  document.getElementById('fx-out-actrisk').textContent = formatCurrency(actualRisk);
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

function setSubmitLoading(loading) {
  if (DOM.btnSubmitModal) {
    DOM.btnSubmitModal.disabled = loading;
    DOM.btnSubmitModal.textContent = loading ? 'Salvando…' : 'Salvar Operação';
  }
  if (DOM.btnDeleteTrade) DOM.btnDeleteTrade.disabled = loading;
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
