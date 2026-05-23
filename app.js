/**
 * PositionPips - Diário de Trading Profissional
 * Lógica principal da aplicação
 */

// ==========================================================================
// CONSTANTES & CONFIGURAÇÕES
// ==========================================================================
const TRADES_PER_BLOCK = 35;
const STORAGE_KEY = 'positionpips_trading_data';

const DEFAULT_STATE = {
  activeBlockIndex: 1,
  blocks: {
    "1": []
  },
  userEmail: "nikolasuvaconceito@gmail.com",
  theme: "dark"
};

// ==========================================================================
// ESTADO GLOBAL DA APLICACAO
// ==========================================================================
let state = { ...DEFAULT_STATE };
let chartInstance = null;
let currentView = 'grid'; // 'grid' ou 'list'

// Elementos DOM
const DOM = {
  // Navigation & Tabs
  navItems: document.querySelectorAll('.nav-item'),
  pageSections: document.querySelectorAll('.page-section'),
  pageTradingJournal: document.getElementById('page-trading-journal'),
  pagePlaceholder: document.getElementById('page-placeholder'),
  pageForexCalc: document.getElementById('page-forex-calc'),
  pageFuturesCalc: document.getElementById('page-futures-calc'),
  pageB3Calc: document.getElementById('page-b3-calc'),
  pageBtcCalc: document.getElementById('page-btc-calc'),
  
  // Header Info
  userEmailEl: document.getElementById('header-user-email'),
  
  // KPIs
  valRegistered: document.getElementById('val-registered'),
  subRegistered: document.getElementById('sub-registered'),
  progressRegistered: document.getElementById('progress-registered'),
  valAccumulated: document.getElementById('val-accumulated'),
  indAccumulated: document.getElementById('ind-accumulated'),
  valWinrate: document.getElementById('val-winrate'),
  indWinrate: document.getElementById('ind-winrate'),
  valAverage: document.getElementById('val-average'),
  indAverage: document.getElementById('ind-average'),
  kpiAccumulatedCard: document.getElementById('kpi-accumulated'),
  kpiWinrateCard: document.getElementById('kpi-winrate'),
  kpiAverageCard: document.getElementById('kpi-average'),

  // Chart
  summaryTradesCount: document.getElementById('summary-trades-count'),
  summaryWinrate: document.getElementById('summary-winrate'),
  summaryPL: document.getElementById('summary-pl'),
  canvasChart: document.getElementById('performanceChart'),

  // Control Bar
  btnToggleGrid: document.getElementById('btn-toggle-grid'),
  btnToggleList: document.getElementById('btn-toggle-list'),
  btnPrevBlock: document.getElementById('btn-prev-block'),
  btnNextBlock: document.getElementById('btn-next-block'),
  blockInfoDisplay: document.getElementById('block-info-display'),
  contentGridView: document.getElementById('content-grid-view'),
  contentListView: document.getElementById('content-list-view'),

  // Containers
  gridContainer: document.getElementById('grid-container'),
  tableBodyContainer: document.getElementById('table-body-container'),

  // Modals
  tradeModal: document.getElementById('trade-modal'),
  tradeForm: document.getElementById('trade-form'),
  modalTitle: document.getElementById('modal-title'),
  tradeIdInput: document.getElementById('trade-id-input'),
  tradeSlotInput: document.getElementById('trade-slot-input'),
  tradeAsset: document.getElementById('trade-asset'),
  tradeType: document.getElementById('trade-type'),
  tradePnL: document.getElementById('trade-pnl'),
  tradeDate: document.getElementById('trade-date'),
  tradeNotes: document.getElementById('trade-notes'),
  btnDeleteTrade: document.getElementById('btn-delete-trade'),
  btnCancelModal: document.getElementById('btn-cancel-modal'),
  btnCloseModalX: document.getElementById('btn-close-modal-x'),
  btnNewTradeHeader: document.getElementById('btn-new-trade-header'),

  // Backup & Reset Actions
  btnExportData: document.getElementById('btn-export-data'),
  btnImportData: document.getElementById('btn-import-data'),
  fileImportInput: document.getElementById('file-import-input'),
  btnResetApp: document.getElementById('btn-reset-app'),
  btnThemeToggle: document.getElementById('btn-theme-toggle')
};

// ==========================================================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
  renderApp();
  // Inicializa os ícones do Lucide
  lucide.createIcons();
});

// ==========================================================================
// PERSISTÊNCIA DE DADOS (LOCALSTORAGE)
// ==========================================================================
function loadData() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    try {
      state = JSON.parse(data);
      // Garante integridade básica da estrutura
      if (!state.blocks) state.blocks = { "1": [] };
      if (!state.activeBlockIndex) state.activeBlockIndex = 1;
      if (!state.userEmail) state.userEmail = "nikolasuvaconceito@gmail.com";
      if (!state.theme) state.theme = "dark";
    } catch (e) {
      console.error('Erro ao ler dados do LocalStorage, usando padrão.', e);
      state = { ...DEFAULT_STATE };
    }
  } else {
    state = { ...DEFAULT_STATE };
  }
  // Aplica o tema configurado
  applyTheme(state.theme);
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ==========================================================================
// CONTROLADORES E LOGICA DE RENDER
// ==========================================================================
function renderApp() {
  const currentBlockIndex = state.activeBlockIndex;
  const blockTrades = state.blocks[currentBlockIndex] || [];
  
  // Atualiza infos de bloco exibidas
  const totalBlocks = Object.keys(state.blocks).length;
  DOM.blockInfoDisplay.textContent = `Bloco ${currentBlockIndex} de ${totalBlocks} (Ciclo 1)`;
  
  // Habilita/desabilita botões de navegação de bloco
  DOM.btnPrevBlock.disabled = currentBlockIndex <= 1;
  DOM.btnNextBlock.disabled = currentBlockIndex >= totalBlocks;

  // Atualizar email
  DOM.userEmailEl.textContent = state.userEmail;

  // Atualiza Estatísticas do Bloco (KPIs)
  updateKPIs(blockTrades);

  // Renderiza Gráfico de Linha
  renderChart(blockTrades);

  // Renderiza Visualização Atual (Grid ou Lista)
  if (currentView === 'grid') {
    renderGridView(blockTrades);
  } else {
    renderListView(blockTrades);
  }

  // Recria os ícones inseridos dinamicamente
  lucide.createIcons();
}

// Atualização de Estatísticas (KPIs) do Bloco Ativo
function updateKPIs(trades) {
  const count = trades.length;
  
  // 1. Operações Registradas
  DOM.valRegistered.textContent = count;
  DOM.subRegistered.textContent = `/ 35 no bloco`;
  const pct = (count / TRADES_PER_BLOCK) * 100;
  DOM.progressRegistered.style.width = `${pct}%`;

  // 2. Resultado Acumulado
  const accumulatedPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  DOM.valAccumulated.textContent = formatCurrency(accumulatedPnL);
  
  // Reset de classes de tendência
  DOM.kpiAccumulatedCard.classList.remove('win-trend', 'loss-trend');
  DOM.kpiWinrateCard.classList.remove('win-trend');
  DOM.kpiAverageCard.classList.remove('win-trend', 'loss-trend');

  if (count === 0) {
    DOM.indAccumulated.textContent = "Sem operações";
    DOM.indAccumulated.className = "kpi-indicator";
  } else if (accumulatedPnL >= 0) {
    DOM.indAccumulated.textContent = "Saldo positivo";
    DOM.indAccumulated.className = "kpi-indicator pnl-positive";
    DOM.kpiAccumulatedCard.classList.add('win-trend');
  } else {
    DOM.indAccumulated.textContent = "Saldo negativo";
    DOM.indAccumulated.className = "kpi-indicator pnl-negative";
    DOM.kpiAccumulatedCard.classList.add('loss-trend');
  }

  // 3. Win Rate
  const winTrades = trades.filter(t => t.pnl > 0).length;
  const winRate = count > 0 ? Math.round((winTrades / count) * 100) : 0;
  DOM.valWinrate.textContent = `${winRate}%`;
  
  if (count > 0) {
    DOM.indWinrate.textContent = `${winTrades} de ${count} vitoriosos`;
    if (winRate >= 50) {
      DOM.kpiWinrateCard.classList.add('win-trend');
    }
  } else {
    DOM.indWinrate.textContent = "Taxa de acerto do bloco";
  }

  // 4. Média por Operação
  const averagePnL = count > 0 ? (accumulatedPnL / count) : 0;
  DOM.valAverage.textContent = formatCurrency(averagePnL);
  
  if (count === 0) {
    DOM.indAverage.textContent = "Média de lucro/prejuízo";
    DOM.indAverage.className = "kpi-indicator";
  } else if (averagePnL >= 0) {
    DOM.indAverage.textContent = "Média positiva";
    DOM.indAverage.className = "kpi-indicator pnl-positive";
    DOM.kpiAverageCard.classList.add('win-trend');
  } else {
    DOM.indAverage.textContent = "Média negativa";
    DOM.indAverage.className = "kpi-indicator pnl-negative";
    DOM.kpiAverageCard.classList.add('loss-trend');
  }

  // Estatísticas no Header do Gráfico
  DOM.summaryTradesCount.textContent = count;
  DOM.summaryWinrate.textContent = `${winRate}%`;
  DOM.summaryPL.textContent = formatCurrency(accumulatedPnL);
  DOM.summaryPL.className = accumulatedPnL >= 0 ? "pnl-positive" : "pnl-negative";
  if (count === 0) DOM.summaryPL.className = "";
}

// Renderiza a Grade Visual de 35 slots (7 Colunas x 5 Linhas)
function renderGridView(trades) {
  DOM.gridContainer.innerHTML = '';
  
  for (let i = 0; i < TRADES_PER_BLOCK; i++) {
    const trade = trades[i];
    const slotEl = document.createElement('div');
    
    if (trade) {
      // Slot Preenchido
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
      // Evento de clique para Editar o trade
      slotEl.addEventListener('click', () => openTradeModal(trade, i));
    } else if (i === trades.length) {
      // Próximo slot vazio (Ativo com botão de "+")
      slotEl.className = 'grid-slot slot-active-empty';
      slotEl.innerHTML = `
        <div class="slot-placeholder-inner">
          <div class="slot-plus-icon"><i data-lucide="plus"></i></div>
          <span>Trade +</span>
        </div>
      `;
      // Evento de clique para Adicionar no slot
      slotEl.addEventListener('click', () => openTradeModal(null, i));
    } else {
      // Outros slots vazios inativos (visual apenas)
      slotEl.className = 'grid-slot slot-empty';
      slotEl.innerHTML = `<span>Trade</span>`;
      // Permitir clicar de qualquer forma para facilitar UX
      slotEl.addEventListener('click', () => openTradeModal(null, trades.length));
    }
    
    DOM.gridContainer.appendChild(slotEl);
  }
}

// Renderiza a Lista / Tabela de trades
function renderListView(trades) {
  DOM.tableBodyContainer.innerHTML = '';

  if (trades.length === 0) {
    DOM.tableBodyContainer.innerHTML = `
      <tr>
        <td colspan="7" class="empty-table-state">
          <i data-lucide="info"></i>
          <p>Nenhuma operação registrada neste bloco ainda.</p>
        </td>
      </tr>
    `;
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
          <button class="btn-table-action btn-edit" title="Editar Operação">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="btn-table-action btn-delete" title="Excluir Operação">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    `;

    // Ações na tabela
    tr.querySelector('.btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openTradeModal(trade, index);
    });

    tr.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Tem certeza que deseja excluir a operação #${index + 1} (${trade.asset})?`)) {
        deleteTrade(trade.id);
      }
    });

    DOM.tableBodyContainer.appendChild(tr);
  });
}

// ==========================================================================
// RENDERIZADOR DO GRÁFICO (CHART.JS)
// ==========================================================================
function renderChart(trades) {
  // Destruir gráfico existente se houver
  if (chartInstance) {
    chartInstance.destroy();
  }

  // Gera dados acumulados
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
  const colorGradientEnd = 'rgba(244, 63, 94, 0.0)';

  const ctx = DOM.canvasChart.getContext('2d');
  
  // Criar gradiente sob a linha
  const gradient = ctx.createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, colorGradientStart);
  gradient.addColorStop(1, colorGradientEnd);

  // Configurações de cores baseadas no tema dinâmico
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
    data: {
      labels: labels,
      datasets: [{
        label: 'Resultado Acumulado',
        data: data,
        borderColor: colorPrimary,
        borderWidth: 2,
        pointBackgroundColor: colorPrimary,
        pointBorderColor: pointBorderColor,
        pointBorderWidth: 2,
        pointRadius: labels.length > 20 ? 2 : 4,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: true,
        backgroundColor: gradient,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipText,
          bodyColor: tooltipText,
          titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 12 },
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: function(context) {
              const idx = context[0].dataIndex;
              return idx === 0 ? 'Início do Bloco' : `Operação #${idx}`;
            },
            label: function(context) {
              const val = context.raw;
              return `Acumulado: ${val >= 0 ? '+' : ''}${formatCurrency(val)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: gridColorX,
            drawBorder: false
          },
          ticks: {
            color: tickColor,
            font: {
              family: 'Inter',
              size: 10
            }
          }
        },
        y: {
          grid: {
            color: gridColorY,
            drawBorder: false
          },
          ticks: {
            color: tickColor,
            font: {
              family: 'Inter',
              size: 10
            },
            callback: function(value) {
              return formatCurrency(value);
            }
          }
        }
      }
    }
  });
}

// ==========================================================================
// MODAL DE CADASTRO/EDIÇÃO DE OPERAÇÃO
// ==========================================================================
function openTradeModal(trade = null, slotIndex = null) {
  // Configurar campos padrão se for novo trade
  if (trade === null) {
    DOM.modalTitle.textContent = `Registrar Operação #${String(slotIndex + 1).padStart(2, '0')}`;
    DOM.tradeIdInput.value = '';
    DOM.tradeSlotInput.value = slotIndex !== null ? slotIndex : '';
    
    // Autofill data com a data local do sistema
    const now = new Date();
    DOM.tradeDate.value = now.toISOString().split('T')[0];
    DOM.tradeAsset.value = '';
    DOM.tradeType.value = 'take';
    DOM.tradePnL.value = '';
    DOM.tradeNotes.value = '';
    DOM.btnDeleteTrade.style.display = 'none';
  } else {
    // Modo de edição
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

// ==========================================================================
// EVENTOS E EVENT LISTENERS
// ==========================================================================
function setupEventListeners() {
  // Alternância de abas/páginas na sidebar
  const tabToPage = {
    'trading-journal': DOM.pageTradingJournal,
    'forex-calc': DOM.pageForexCalc,
    'futures-calc': DOM.pageFuturesCalc,
    'b3-calc': DOM.pageB3Calc,
    'btc-calc': DOM.pageBtcCalc
  };

  DOM.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();

      const tabName = item.getAttribute('data-tab');

      // Remover active de todos nav-items
      DOM.navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      // Esconde todas as page-sections
      DOM.pageSections.forEach(section => section.classList.remove('active'));

      const targetPage = tabToPage[tabName];
      if (targetPage) {
        targetPage.classList.add('active');
        // Quando o diário é exibido, o gráfico precisa ser redesenhado
        if (tabName === 'trading-journal') {
          renderApp();
        }
        // Recria ícones lucide para conteúdo recém-exibido
        lucide.createIcons();
      } else {
        // Placeholder genérico para qualquer outra aba não mapeada
        DOM.pagePlaceholder.classList.add('active');
        const label = item.querySelector('span').textContent;
        DOM.pagePlaceholder.querySelector('h2').textContent = `${label}`;
      }
    });
  });

  // Alterar email por clique duplo (personalização fácil)
  DOM.userEmailEl.addEventListener('dblclick', () => {
    const newEmail = prompt('Digite seu email de trader para personalização:', state.userEmail);
    if (newEmail !== null && newEmail.trim() !== '') {
      state.userEmail = newEmail.trim();
      saveData();
      renderApp();
    }
  });

  // Botão "+ Nova Operação" no topo da página
  DOM.btnNewTradeHeader.addEventListener('click', () => {
    const currentBlockIndex = state.activeBlockIndex;
    const trades = state.blocks[currentBlockIndex] || [];
    
    // Se o bloco atual estiver cheio, precisamos ir para o próximo ou criar um novo
    if (trades.length >= TRADES_PER_BLOCK) {
      // Verifica se existe um bloco subsequente
      const totalBlocks = Object.keys(state.blocks).length;
      if (currentBlockIndex < totalBlocks) {
        state.activeBlockIndex = currentBlockIndex + 1;
        saveData();
        renderApp();
        openTradeModal(null, state.blocks[state.activeBlockIndex].length);
      } else {
        // Cria um novo bloco
        const newBlockIdx = totalBlocks + 1;
        state.blocks[newBlockIdx] = [];
        state.activeBlockIndex = newBlockIdx;
        saveData();
        renderApp();
        openTradeModal(null, 0);
      }
    } else {
      openTradeModal(null, trades.length);
    }
  });

  // Modais - Fechar
  DOM.btnCloseModalX.addEventListener('click', closeTradeModal);
  DOM.btnCancelModal.addEventListener('click', closeTradeModal);
  DOM.tradeModal.addEventListener('click', (e) => {
    if (e.target === DOM.tradeModal) {
      closeTradeModal();
    }
  });

  // Submissão do Formulário de Trades
  DOM.tradeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveTradeForm();
  });

  // Excluir trade de dentro do Modal
  DOM.btnDeleteTrade.addEventListener('click', () => {
    const tradeId = DOM.tradeIdInput.value;
    if (tradeId && confirm('Deseja realmente excluir esta operação?')) {
      deleteTrade(tradeId);
      closeTradeModal();
    }
  });

  // Toggles de Visualização (Grid vs Lista)
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

  // Navegação de Blocos
  DOM.btnPrevBlock.addEventListener('click', () => {
    if (state.activeBlockIndex > 1) {
      state.activeBlockIndex--;
      saveData();
      renderApp();
    }
  });

  DOM.btnNextBlock.addEventListener('click', () => {
    const totalBlocks = Object.keys(state.blocks).length;
    if (state.activeBlockIndex < totalBlocks) {
      state.activeBlockIndex++;
      saveData();
      renderApp();
    }
  });

  // Backup - Exportar
  DOM.btnExportData.addEventListener('click', exportData);
  
  // Backup - Importar
  DOM.btnImportData.addEventListener('click', () => DOM.fileImportInput.click());
  DOM.fileImportInput.addEventListener('change', importData);

  // Reset Geral do App
  DOM.btnResetApp.addEventListener('click', resetApp);

  // Alternar Tema (Claro / Escuro)
  DOM.btnThemeToggle.addEventListener('click', toggleTheme);

  // Listeners das calculadoras
  setupCalculatorsListeners();
}

// ==========================================================================
// CALCULADORAS DE MERCADO
// ==========================================================================
function setupCalculatorsListeners() {
  const fxBtn = document.getElementById('btn-fx-calc');
  const futBtn = document.getElementById('btn-fut-calc');
  const b3Btn = document.getElementById('btn-b3-calc');
  const btcBtn = document.getElementById('btn-btc-calc');

  if (fxBtn) fxBtn.addEventListener('click', calculateForex);
  if (futBtn) futBtn.addEventListener('click', calculateFutures);
  if (b3Btn) b3Btn.addEventListener('click', calculateB3);
  if (btcBtn) btcBtn.addEventListener('click', calculateBTC);

  setupRiskToggles();
}

// Toggle %/$ para o campo de risco em todas as calculadoras
function setupRiskToggles() {
  document.querySelectorAll('.risk-mode-toggle').forEach(toggle => {
    toggle.querySelectorAll('.risk-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        toggle.setAttribute('data-mode', mode);
        toggle.querySelectorAll('.risk-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Atualiza o ícone e placeholder do input vinculado
        const targetId = toggle.getAttribute('data-risk-target');
        const input = document.getElementById(targetId);
        if (input) {
          const icon = input.parentElement.querySelector('i.risk-icon');
          if (icon) {
            icon.setAttribute('data-lucide', mode === 'pct' ? 'percent' : 'dollar-sign');
          }
          input.placeholder = mode === 'pct' ? 'Ex: 1' : 'Ex: 100';
        }
        lucide.createIcons();
      });
    });
  });
}

// Lê o valor de risco como montante absoluto na moeda da conta (USD ou BRL),
// respeitando o modo selecionado no toggle (% ou $).
function readRiskAmount(accountId, riskInputId) {
  const account = parseFloat(document.getElementById(accountId).value);
  const rawRisk = parseFloat(document.getElementById(riskInputId).value);
  const toggle = document.querySelector(`.risk-mode-toggle[data-risk-target="${riskInputId}"]`);
  const mode = toggle ? toggle.getAttribute('data-mode') : 'pct';
  const riskAmount = mode === 'pct' ? account * (rawRisk / 100) : rawRisk;
  return { account, rawRisk, mode, riskAmount };
}

// --------- FOREX ---------
// Calcula o valor de 1 pip por lote padrão (100.000 unidades) com conta em USD.
function forexPipValuePerLot(pair, price) {
  const standardLot = 100000;

  if (pair === 'XAUUSD') {
    // Ouro: 1 lote = 100 oz. Convenção comum: 1 pip = 0.10 USD/oz → $10/lote.
    return 10;
  }

  // Pares X/USD (USD é a moeda de cotação): pip = 0.0001 → $10/lote.
  if (pair.endsWith('USD')) {
    return 0.0001 * standardLot;
  }

  // Pares USD/X (USD é a moeda base)
  if (pair.startsWith('USD')) {
    if (pair === 'USDJPY') {
      // Pip = 0.01, valor em JPY = 1000, converte para USD pelo próprio preço.
      return (0.01 * standardLot) / price;
    }
    // USDCHF, USDCAD: pip = 0.0001, converte para USD pelo preço.
    return (0.0001 * standardLot) / price;
  }

  // Cruzados com JPY (EURJPY, GBPJPY): pip = 0.01 → 1000 JPY/lote.
  // Aproximação prática usando USDJPY ≈ 150 (cruzados não têm USD na cotação).
  if (pair.endsWith('JPY')) {
    const approxUSDJPY = 150;
    return (0.01 * standardLot) / approxUSDJPY;
  }

  // Fallback genérico (par X/USD)
  return 0.0001 * standardLot;
}

function calculateForex() {
  const riskAmount = parseFloat(document.getElementById('fx-risk').value);
  const stopPips = parseFloat(document.getElementById('fx-stop-pips').value);
  const pair = document.getElementById('fx-pair').value;
  // Usa cotação padrão para cálculos internos (pares USD/X e cruzados)
  const price = parseFloat(document.getElementById('fx-price').value) || 1.08500;

  if (isNaN(riskAmount) || isNaN(stopPips) || stopPips <= 0 || riskAmount <= 0) {
    alert('Preencha todos os campos corretamente. Stop e risco devem ser maiores que zero.');
    return;
  }

  const pipValuePerLot = forexPipValuePerLot(pair, price);
  const lotSize = riskAmount / (stopPips * pipValuePerLot);
  const units = Math.round(lotSize * 100000);
  const miniLots = lotSize * 10;
  const microLots = lotSize * 100;

  document.getElementById('fx-out-risk').textContent = formatCurrency(riskAmount);
  document.getElementById('fx-out-pipval').textContent = formatCurrency(pipValuePerLot);
  document.getElementById('fx-out-lots').textContent = lotSize.toFixed(2);
  document.getElementById('fx-out-mini').textContent = miniLots.toFixed(1);
  document.getElementById('fx-out-micro').textContent = Math.floor(microLots).toLocaleString('pt-BR');
  document.getElementById('fx-out-units').textContent = units.toLocaleString('pt-BR');
}

// --------- FUTUROS EUA ---------
const FUTURES_SPECS = {
  ES:  { pointValue: 50,   tickSize: 0.25 },
  NQ:  { pointValue: 20,   tickSize: 0.25 },
  YM:  { pointValue: 5,    tickSize: 1    },
  RTY: { pointValue: 50,   tickSize: 0.10 },
  MES: { pointValue: 5,    tickSize: 0.25 },
  MNQ: { pointValue: 2,    tickSize: 0.25 },
  MYM: { pointValue: 0.50, tickSize: 1    },
  M2K: { pointValue: 5,    tickSize: 0.10 },
  CL:  { pointValue: 1000, tickSize: 0.01 },
  MCL: { pointValue: 100,  tickSize: 0.01 },
  GC:  { pointValue: 100,  tickSize: 0.10 },
  MGC: { pointValue: 10,   tickSize: 0.10 },
  SI:  { pointValue: 5000, tickSize: 0.005 }
};

function calculateFutures() {
  const riskAmount = parseFloat(document.getElementById('fut-risk').value);
  const stopPts = parseFloat(document.getElementById('fut-stop').value);
  const symbol = document.getElementById('fut-symbol').value;
  const spec = FUTURES_SPECS[symbol];

  if (!spec || isNaN(riskAmount) || isNaN(stopPts) || stopPts <= 0 || riskAmount <= 0) {
    alert('Preencha todos os campos corretamente. Stop e risco devem ser maiores que zero.');
    return;
  }

  const tickValue = spec.pointValue * spec.tickSize;
  const lossPerContract = stopPts * spec.pointValue;
  const contracts = Math.floor(riskAmount / lossPerContract);
  const actualRisk = contracts * lossPerContract;

  document.getElementById('fut-out-risk').textContent = formatCurrency(riskAmount);
  document.getElementById('fut-out-pointval').textContent = formatCurrency(spec.pointValue);
  document.getElementById('fut-out-tickval').textContent = formatCurrency(tickValue);
  document.getElementById('fut-out-perctr').textContent = formatCurrency(lossPerContract);
  document.getElementById('fut-out-contracts').textContent = contracts;
  document.getElementById('fut-out-actrisk').textContent = formatCurrency(actualRisk);
}

// --------- B3 ---------
const B3_SPECS = {
  WIN: { pointValue: 0.20 },
  IND: { pointValue: 1.00 },
  WDO: { pointValue: 10.00 },
  DOL: { pointValue: 50.00 }
};

function formatBRL(value) {
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const formatted = absValue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${isNegative ? '- ' : ''}${formatted}`;
}

function calculateB3() {
  const riskAmount = parseFloat(document.getElementById('b3-risk').value);
  const stopPts = parseFloat(document.getElementById('b3-stop').value);
  const symbol = document.getElementById('b3-symbol').value;
  const spec = B3_SPECS[symbol];

  if (!spec || isNaN(riskAmount) || isNaN(stopPts) || stopPts <= 0 || riskAmount <= 0) {
    alert('Preencha todos os campos corretamente. Stop e risco devem ser maiores que zero.');
    return;
  }

  const lossPerContract = stopPts * spec.pointValue;
  const contracts = Math.floor(riskAmount / lossPerContract);
  const actualRisk = contracts * lossPerContract;

  document.getElementById('b3-out-risk').textContent = formatBRL(riskAmount);
  document.getElementById('b3-out-pointval').textContent = formatBRL(spec.pointValue);
  document.getElementById('b3-out-perctr').textContent = formatBRL(lossPerContract);
  document.getElementById('b3-out-contracts').textContent = contracts;
  document.getElementById('b3-out-actrisk').textContent = formatBRL(actualRisk);
}

// --------- BTC CFD ---------
// Especificações de pip por broker/configuração
const BTC_PIP_SPECS = {
  BTCUSD_1:   { pipValue: 1   },
  BTCUSD_10:  { pipValue: 10  },
  BTCUSD_100: { pipValue: 100 }
};

function calculateBTC() {
  const broker = document.getElementById('btc-broker').value;
  const stopPips = parseFloat(document.getElementById('btc-stop-pips').value);
  const riskUSD = parseFloat(document.getElementById('btc-risk-usd').value);
  const spec = BTC_PIP_SPECS[broker];

  if (!spec || isNaN(stopPips) || isNaN(riskUSD) || stopPips <= 0 || riskUSD <= 0) {
    alert('Preencha todos os campos corretamente. Stop e risco devem ser maiores que zero.');
    return;
  }

  const pipValue = spec.pipValue;
  const lossPerLot = stopPips * pipValue;
  const lots = riskUSD / lossPerLot;

  document.getElementById('btc-out-risk').textContent = formatCurrency(riskUSD);
  document.getElementById('btc-out-pipval').textContent = formatCurrency(pipValue);
  document.getElementById('btc-out-losslot').textContent = formatCurrency(lossPerLot);
  document.getElementById('btc-out-size').textContent = lots.toFixed(2);
}

// ==========================================================================
// FUNÇÕES DE CRUD DO DIÁRIO
// ==========================================================================

// Salvar / Atualizar trade
function saveTradeForm() {
  const id = DOM.tradeIdInput.value;
  const slotIndex = parseInt(DOM.tradeSlotInput.value);
  
  const asset = DOM.tradeAsset.value.trim().toUpperCase();
  const type = DOM.tradeType.value;
  const rawPnl = parseFloat(DOM.tradePnL.value);
  const date = DOM.tradeDate.value;
  const notes = DOM.tradeNotes.value.trim();

  if (!asset || isNaN(rawPnl) || !date) {
    alert('Por favor, preencha todos os campos obrigatórios corretamente.');
    return;
  }

  // Sinal definido pelo tipo: take = positivo, stop = negativo
  const pnl = type === 'stop' ? -Math.abs(rawPnl) : Math.abs(rawPnl);

  const currentBlockIndex = state.activeBlockIndex;
  
  if (id === '') {
    // --- NOVO TRADE ---
    const newTrade = {
      id: 'trade_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      asset,
      type,
      pnl,
      date,
      notes
    };

    // Garantir integridade do bloco atual
    if (!state.blocks[currentBlockIndex]) {
      state.blocks[currentBlockIndex] = [];
    }

    const currentBlockLength = state.blocks[currentBlockIndex].length;

    if (currentBlockLength < TRADES_PER_BLOCK) {
      // Adiciona no bloco ativo atual
      state.blocks[currentBlockIndex].push(newTrade);
      
      // Se acabou de completar o bloco, criamos automaticamente o próximo
      if (state.blocks[currentBlockIndex].length === TRADES_PER_BLOCK) {
        const nextBlockIndex = currentBlockIndex + 1;
        if (!state.blocks[nextBlockIndex]) {
          state.blocks[nextBlockIndex] = [];
        }
        state.activeBlockIndex = nextBlockIndex;
        alert('Parabéns! Bloco de 35 operações concluído. O Bloco ' + nextBlockIndex + ' foi iniciado automaticamente.');
      }
    } else {
      // Se por algum motivo o bloco atual já estava cheio, adiciona no último bloco existente ou cria um novo
      const totalBlocks = Object.keys(state.blocks).length;
      let targetBlockIdx = totalBlocks;
      
      if (state.blocks[targetBlockIdx].length >= TRADES_PER_BLOCK) {
        targetBlockIdx++;
        state.blocks[targetBlockIdx] = [];
      }
      
      state.blocks[targetBlockIdx].push(newTrade);
      state.activeBlockIndex = targetBlockIdx;
    }
  } else {
    // --- EDITAR TRADE EXISTENTE ---
    // Procurar em qual bloco o trade está (normalmente é o activeBlockIndex, mas vasculhamos para garantir)
    let found = false;
    for (const blockIdx in state.blocks) {
      const idx = state.blocks[blockIdx].findIndex(t => t.id === id);
      if (idx !== -1) {
        state.blocks[blockIdx][idx] = {
          ...state.blocks[blockIdx][idx],
          asset,
          type,
          pnl,
          date,
          notes
        };
        found = true;
        break;
      }
    }
    
    if (!found) {
      alert('Operação não encontrada no banco de dados local.');
      return;
    }
  }

  saveData();
  closeTradeModal();
  renderApp();
}

// Excluir trade
function deleteTrade(id) {
  let found = false;
  for (const blockIdx in state.blocks) {
    const idx = state.blocks[blockIdx].findIndex(t => t.id === id);
    if (idx !== -1) {
      state.blocks[blockIdx].splice(idx, 1);
      found = true;
      
      // Opcional: Se um bloco intermediário ficou vazio e não é o único, poderíamos removê-lo.
      // Porém, para manter a consistência numérica dos blocos (ex: Bloco 1, Bloco 2), apenas mantemos
      // o bloco ativo ou o array vazio.
      
      break;
    }
  }

  if (found) {
    saveData();
    renderApp();
  }
}

// ==========================================================================
// EXPORTAÇÃO / IMPORTAÇÃO & RESET DOS DADOS
// ==========================================================================
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  
  const dateStr = new Date().toISOString().split('T')[0];
  
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `positionpips_backup_${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importData(e) {
  const fileReader = new FileReader();
  const file = e.target.files[0];
  
  if (!file) return;

  fileReader.onload = function(event) {
    try {
      const parsedData = JSON.parse(event.target.result);
      
      // Validação básica do arquivo de importação
      if (parsedData && parsedData.blocks) {
        state = parsedData;
        saveData();
        renderApp();
        alert('Dados importados com sucesso!');
      } else {
        alert('Erro: Arquivo JSON de formato inválido para o PositionPips.');
      }
    } catch (err) {
      alert('Erro ao processar o arquivo. Verifique se é um arquivo JSON válido.');
      console.error(err);
    }
  };

  fileReader.readAsText(file);
  // Reset do input de arquivo para permitir importar o mesmo arquivo consecutivamente
  DOM.fileImportInput.value = '';
}

function resetApp() {
  const confirmFirst = confirm('ATENÇÃO: Isso excluirá PERMANENTEMENTE todos os blocos e operações salvas neste navegador. Deseja prosseguir?');
  if (confirmFirst) {
    const confirmSecond = confirm('Digite "DELETAR" para confirmar a exclusão de todas as operações:');
    if (confirmSecond === 'DELETAR') {
      localStorage.removeItem(STORAGE_KEY);
      state = {
        activeBlockIndex: 1,
        blocks: {
          "1": []
        },
        userEmail: "nikolasuvaconceito@gmail.com"
      };
      saveData();
      renderApp();
      alert('Banco de dados redefinido com sucesso.');
    } else {
      alert('Confirmação incorreta. Operação cancelada.');
    }
  }
}

// ==========================================================================
// FUNÇÕES AUXILIARES / FORMATADORES
// ==========================================================================

// Formata moeda (BRL/USD padrão)
function formatCurrency(value) {
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  
  // Utiliza $ como moeda base inspirada na imagem, mas formatada de forma profissional
  const formatted = absValue.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return `${isNegative ? '- ' : ''}${formatted}`;
}

// Formata data padrão (YYYY-MM-DD) para formato BR (DD/MM)
function formatDateBR(dateString) {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateString;
}

// Evita injeção de HTML no DOM dinâmico
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Alternância e aplicação de Tema (Claro / Escuro)
function toggleTheme() {
  const currentTheme = state.theme === 'light' ? 'dark' : 'light';
  state.theme = currentTheme;
  saveData();
  applyTheme(currentTheme);
  // Redesenha para atualizar cores do gráfico
  renderApp();
}

function applyTheme(theme) {
  const body = document.body;
  const toggleBtn = DOM.btnThemeToggle || document.getElementById('btn-theme-toggle');
  
  if (theme === 'light') {
    body.classList.add('light-theme');
    if (toggleBtn) {
      toggleBtn.innerHTML = '<i data-lucide="moon"></i>';
      toggleBtn.title = "Alternar para Tema Escuro";
    }
  } else {
    body.classList.remove('light-theme');
    if (toggleBtn) {
      toggleBtn.innerHTML = '<i data-lucide="sun"></i>';
      toggleBtn.title = "Alternar para Tema Claro";
    }
  }
  // Recria os ícones lucide para o botão
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}
