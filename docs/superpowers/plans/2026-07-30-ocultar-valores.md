# Ocultar valores (modo privacidade) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um interruptor de olho, no Diário e no Dashboard, que troca todo valor sensível das duas páginas por `•••••` e lembra a escolha por dispositivo.

**Architecture:** Um módulo novo (`js/ui/ocultar-valores.js`) guarda o estado, persiste no `localStorage` e faz a máscara ter `data-valor-real` como fonte da verdade — nunca o texto que está na tela, o que a torna idempotente. O `app.js` troca `el.textContent = x` por `escreverValor(el, x)` nos pontos sensíveis e chama `aplicarOcultacao(container)` depois dos renders que montam HTML por template. A supressão de cor é CSS puro sob `body.valores-ocultos`, porque `updateKPIs` reescreve `className` a cada render e qualquer neutralização em JS seria desfeita no render seguinte.

**Tech Stack:** HTML/CSS/JavaScript vanilla (ES Modules), sem build e sem npm. Chart.js e Lucide via CDN. Testes rodam no navegador, servidos por HTTP.

## Global Constraints

- **Sem framework e sem build step** — o app é servido estático pelo GitHub Pages.
- **Todo texto de UI, comentário e mensagem de commit em pt-BR**, com acentuação correta.
- **Não abrir por `file://`** — ES Modules exigem HTTP. Servir com `python -m http.server 8000` na raiz do projeto.
- **Nada de I/O de dados fora de `js/services/*`** — este plano não faz I/O de dados; `localStorage` é preferência de exibição local, não dado de conta.
- **A máscara é `•••••`** (5 bolinhas U+2022) e, no eixo Y do gráfico, `•••` (3 bolinhas).
- **A chave do `localStorage` é `monolith:valores-ocultos`**, com valor `'1'` para oculto e a chave ausente/qualquer outro valor para visível.
- **"Operações registradas", `/ 35 no bloco`, a barra de progresso, "Trades: N", ativo, data, RR, observações e a coluna Tipo da tabela NÃO são mascarados.**
- Spec de referência: `docs/superpowers/specs/2026-07-30-ocultar-valores-design.md`.

---

### Task 1: Módulo `ocultar-valores.js` com a mecânica da máscara

**Files:**
- Create: `js/ui/ocultar-valores.js`
- Test: `tests/ocultar-valores.test.html`

**Interfaces:**
- Consumes: nada (primeira tarefa).
- Produces, usado por todas as tarefas seguintes:
  - `MASCARA: string` — `'•••••'`
  - `MASCARA_CURTA: string` — `'•••'`
  - `estaOculto(): boolean`
  - `inicializarOcultacao(): boolean` — lê o `localStorage`, aplica a classe no `<body>` e devolve o estado
  - `definirOculto(oculto: boolean): void` — grava estado + `localStorage` + classe no `<body>`
  - `alternarOculto(): boolean` — inverte e devolve o novo estado
  - `escreverValor(el: HTMLElement, texto: string): void`
  - `aplicarOcultacao(raiz?: ParentNode): void` — padrão `document`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/ocultar-valores.test.html`, no mesmo formato do `tests/image-processing.test.html` (módulo ES, contador `conta()`, sem framework):

```html
<!doctype html>
<meta charset="utf-8">
<title>Teste — ocultar-valores</title>
<style>
  body { font: 14px/1.5 monospace; padding: 24px; background: #0c0f17; color: #e2e8f0; }
  .ok   { color: #10b981; }
  .fail { color: #f43f5e; }
  h1 { font-size: 16px; }
</style>
<h1>ocultar-valores</h1>
<div id="saida"></div>
<script type="module">
  import {
    MASCARA, estaOculto, definirOculto, alternarOculto,
    escreverValor, aplicarOcultacao, inicializarOcultacao
  } from '../js/ui/ocultar-valores.js';

  const saida = document.getElementById('saida');
  let falhas = 0;

  function conta(nome, condicao, detalhe = '') {
    const li = document.createElement('div');
    li.className = condicao ? 'ok' : 'fail';
    li.textContent = `${condicao ? 'PASSOU' : 'FALHOU'} — ${nome}${detalhe ? ' :: ' + detalhe : ''}`;
    saida.appendChild(li);
    if (!condicao) falhas++;
  }

  // O teste roda na mesma origem do app: guardar e restaurar a preferência
  // real do usuário, senão abrir o teste muda o estado do Monolith no navegador.
  const CHAVE = 'monolith:valores-ocultos';
  const preferenciaOriginal = localStorage.getItem(CHAVE);

  function elemento(texto = '') {
    const el = document.createElement('span');
    el.textContent = texto;
    return el;
  }

  // 1. Visível: escreverValor põe o texto real e registra a fonte da verdade
  {
    definirOculto(false);
    const el = elemento();
    escreverValor(el, '$ 1.234,00');
    conta('visível mostra o valor real', el.textContent === '$ 1.234,00', el.textContent);
    conta('guarda o valor real no dataset', el.dataset.valorReal === '$ 1.234,00', el.dataset.valorReal);
  }

  // 2. Oculto: escreverValor mascara mas continua guardando o real
  {
    definirOculto(true);
    const el = elemento();
    escreverValor(el, '$ 1.234,00');
    conta('oculto mostra a máscara', el.textContent === MASCARA, el.textContent);
    conta('oculto ainda guarda o valor real', el.dataset.valorReal === '$ 1.234,00', el.dataset.valorReal);
  }

  // 3. aplicarOcultacao é idempotente — o defeito que ela existe para evitar é
  //    ler o texto da tela como se fosse o valor real e gravar a máscara por cima
  {
    definirOculto(false);
    const el = elemento();
    escreverValor(el, '+$ 500,00');
    definirOculto(true);
    aplicarOcultacao(document.body.appendChild(el).parentNode);
    aplicarOcultacao();
    aplicarOcultacao();
    conta('mascarar 3 vezes seguidas não perde o valor', el.dataset.valorReal === '+$ 500,00', el.dataset.valorReal);
    definirOculto(false);
    aplicarOcultacao();
    conta('desocultar devolve o valor real', el.textContent === '+$ 500,00', el.textContent);
    el.remove();
  }

  // 4. Elemento sem data-valor-real não é tocado
  {
    definirOculto(true);
    const el = elemento('4');
    document.body.appendChild(el);
    aplicarOcultacao();
    conta('valor não sensível fica intacto', el.textContent === '4', el.textContent);
    el.remove();
  }

  // 5. Persistência e classe no <body>
  {
    definirOculto(true);
    conta('grava a preferência no localStorage', localStorage.getItem(CHAVE) === '1', String(localStorage.getItem(CHAVE)));
    conta('marca o body', document.body.classList.contains('valores-ocultos'));
    definirOculto(false);
    conta('apaga a preferência ao desocultar', localStorage.getItem(CHAVE) === null, String(localStorage.getItem(CHAVE)));
    conta('desmarca o body', !document.body.classList.contains('valores-ocultos'));
  }

  // 6. alternarOculto inverte e devolve o novo estado
  {
    definirOculto(false);
    const novo = alternarOculto();
    conta('alternar devolve o novo estado', novo === true, String(novo));
    conta('alternar muda estaOculto()', estaOculto() === true, String(estaOculto()));
    alternarOculto();
    conta('alternar de novo volta ao visível', estaOculto() === false, String(estaOculto()));
  }

  // 7. inicializarOcultacao lê o que está gravado
  {
    localStorage.setItem(CHAVE, '1');
    conta('inicializar devolve true com a chave gravada', inicializarOcultacao() === true);
    conta('inicializar aplica a classe no body', document.body.classList.contains('valores-ocultos'));
    localStorage.removeItem(CHAVE);
    conta('inicializar devolve false sem a chave', inicializarOcultacao() === false);
  }

  // Restaura a preferência real do usuário
  if (preferenciaOriginal === null) localStorage.removeItem(CHAVE);
  else localStorage.setItem(CHAVE, preferenciaOriginal);
  definirOculto(preferenciaOriginal === '1');

  const resumo = document.createElement('h1');
  resumo.textContent = falhas === 0 ? 'TUDO PASSOU' : `${falhas} FALHA(S)`;
  resumo.className = falhas === 0 ? 'ok' : 'fail';
  saida.appendChild(resumo);
</script>
```

- [ ] **Step 2: Rodar o teste e ver que ele falha**

Servir o projeto e abrir o teste:

```bash
python -m http.server 8000
```

Abrir `http://localhost:8000/tests/ocultar-valores.test.html`.
Esperado: página em branco e, no console, `Failed to resolve module specifier` / 404 em `../js/ui/ocultar-valores.js` — o módulo ainda não existe.

- [ ] **Step 3: Escrever o módulo**

Criar `js/ui/ocultar-valores.js`:

```js
/**
 * Ocultar valores (modo privacidade)
 * --------------------------------------------------------------
 * Troca todo valor sensível do Diário e do Dashboard por bolinhas,
 * para usar o app com alguém por perto.
 *
 * A fonte da verdade é o atributo `data-valor-real`, nunca o texto que
 * está na tela: ler a tela para mascarar gravaria `•••••` por cima do
 * valor verdadeiro na segunda passada, e o número se perderia até o
 * próximo fetch. Como só se lê do dataset, aplicar mil vezes dá o
 * mesmo resultado de aplicar uma.
 *
 * Fica no localStorage, não no user_preferences: privacidade é
 * propriedade de ONDE você está, não de quem você é — o notebook levado
 * para fora fica oculto, o PC de casa fica aberto.
 */

const CHAVE = 'monolith:valores-ocultos';

export const MASCARA = '•••••';
/** Eixo Y do gráfico: o tick é estreito, 5 bolinhas não cabem. */
export const MASCARA_CURTA = '•••';

let oculto = false;

export function estaOculto() {
  return oculto;
}

/** Lê a preferência gravada e aplica. Chamar uma vez, antes do primeiro render. */
export function inicializarOcultacao() {
  definirOculto(localStorage.getItem(CHAVE) === '1');
  return oculto;
}

export function definirOculto(valor) {
  oculto = Boolean(valor);
  if (oculto) localStorage.setItem(CHAVE, '1');
  else        localStorage.removeItem(CHAVE);
  document.body.classList.toggle('valores-ocultos', oculto);
}

export function alternarOculto() {
  definirOculto(!oculto);
  return oculto;
}

/** Escreve um valor sensível: guarda o real e mostra o que for devido. */
export function escreverValor(el, texto) {
  if (!el) return;
  el.dataset.valorReal = texto;
  el.textContent = oculto ? MASCARA : texto;
}

/**
 * Reaplica o estado atual em tudo que carrega `data-valor-real` dentro da
 * raiz. Para HTML montado por template string, que não passou por
 * escreverValor.
 */
export function aplicarOcultacao(raiz = document) {
  raiz.querySelectorAll('[data-valor-real]').forEach((el) => {
    el.textContent = oculto ? MASCARA : el.dataset.valorReal;
  });
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Recarregar `http://localhost:8000/tests/ocultar-valores.test.html`.
Esperado: todas as linhas em verde e o resumo `TUDO PASSOU`.

- [ ] **Step 5: Commit**

```bash
git add js/ui/ocultar-valores.js tests/ocultar-valores.test.html
git commit -m "Cria o módulo de ocultar valores, com a máscara idempotente"
```

---

### Task 2: Botões do olho e KPIs mascarados nas duas páginas

**Files:**
- Modify: `index.html` (cabeçalho do Diário na linha 283-291; cabeçalho do Dashboard na linha 192-197)
- Modify: `app.js` (`cacheDOM` linha 77; bootstrap linha 173; `updateKPIs` linha 500; `renderDashboard` linha 860; `setupEventListeners` linha 1443)
- Modify: `style.css` (junto de `.btn-theme-toggle`, linha 2185)

**Interfaces:**
- Consumes: `escreverValor`, `estaOculto`, `inicializarOcultacao`, `alternarOculto` de `js/ui/ocultar-valores.js`.
- Produces: `DOM.btnOcultarValores` e `DOM.btnOcultarValoresDash` (os dois botões); `atualizarBotoesOcultar(): void` e `alternarValoresOcultos(): void` em `app.js`.

- [ ] **Step 1: Envolver o botão do Diário e criar o gêmeo do Dashboard**

Em `index.html`, trocar o bloco do cabeçalho do Diário (linhas 283-291) por:

```html
        <div class="page-header">
          <div class="page-title-area">
            <h1>Diário de Trading</h1>
            <p>Acompanhe suas operações e resultados</p>
          </div>
          <div class="page-header-actions">
            <button id="btn-ocultar-valores" class="btn-ocultar-valores" title="Ocultar valores" aria-label="Ocultar valores">
              <i data-lucide="eye-off"></i>
            </button>
            <button id="btn-new-trade-header" class="btn-primary">
              <i data-lucide="plus"></i> Nova operação
            </button>
          </div>
        </div>
```

E o cabeçalho do Dashboard (linhas 192-197) por:

```html
        <div class="page-header">
          <div class="page-title-area">
            <h1>Dashboard</h1>
            <p>Visão geral da sua conta</p>
          </div>
          <div class="page-header-actions">
            <button id="btn-ocultar-valores-dash" class="btn-ocultar-valores" title="Ocultar valores" aria-label="Ocultar valores">
              <i data-lucide="eye-off"></i>
            </button>
          </div>
        </div>
```

- [ ] **Step 2: Estilo dos botões**

Em `style.css`, logo depois do bloco `.btn-theme-toggle :is(i, svg) { … }` (termina na linha 2209), acrescentar:

```css
/* Botão de ocultar valores — quadrado, alinhado ao "Nova operação" ao lado */
.page-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-ocultar-valores {
  background-color: var(--surface-2);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-fast);
}

.btn-ocultar-valores:hover {
  background-color: var(--surface-6);
  color: var(--text-active);
  border-color: var(--border-hover);
}

.btn-ocultar-valores :is(i, svg) {
  width: 18px;
  height: 18px;
}
```

- [ ] **Step 3: Importar o módulo e cachear os botões**

Em `app.js`, junto dos outros imports de `./js/ui/` (o de `lightbox.js` termina na linha 46), acrescentar:

```js
import {
  MASCARA,
  MASCARA_CURTA,
  estaOculto,
  inicializarOcultacao,
  alternarOculto,
  escreverValor,
  aplicarOcultacao
} from './js/ui/ocultar-valores.js';
```

Em `cacheDOM()`, junto de `DOM.btnThemeToggle` (linha 163):

```js
  DOM.btnOcultarValores     = document.getElementById('btn-ocultar-valores');
  DOM.btnOcultarValoresDash = document.getElementById('btn-ocultar-valores-dash');
```

- [ ] **Step 4: Inicializar antes do primeiro render**

Em `app.js`, no `DOMContentLoaded` (linha 173), entre `cacheDOM();` e `domReady = true;`:

```js
  cacheDOM();
  // Antes de qualquer render: senão o valor aparece por um instante e só
  // depois é mascarado — o vazamento que o modo existe para evitar.
  inicializarOcultacao();
  atualizarBotoesOcultar();
  domReady = true;
```

- [ ] **Step 5: Escrever as funções do botão**

Em `app.js`, na seção TEMA (logo depois de `applyTheme`, que termina na linha 1729), acrescentar:

```js
// ==========================================================================
// OCULTAR VALORES
// ==========================================================================
/** Ícone e rótulo dizem a AÇÃO, não o estado: com valores à mostra, a ação é ocultar. */
function atualizarBotoesOcultar() {
  const oculto = estaOculto();
  const icone  = oculto ? 'eye' : 'eye-off';
  const rotulo = oculto ? 'Mostrar valores' : 'Ocultar valores';
  [DOM.btnOcultarValores, DOM.btnOcultarValoresDash].forEach((btn) => {
    if (!btn) return;
    btn.innerHTML = `<i data-lucide="${icone}"></i>`;
    btn.title = rotulo;
    btn.setAttribute('aria-label', rotulo);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * Um re-render completo, como o toggle de tema faz: além dos textos, os
 * gráficos precisam nascer de novo (a cor da linha e o eixo Y mudam com o modo).
 */
function alternarValoresOcultos() {
  alternarOculto();
  atualizarBotoesOcultar();
  renderApp();
}
```

- [ ] **Step 6: Ligar os cliques**

Em `app.js`, em `setupEventListeners`, junto da linha 1584 (`DOM.btnThemeToggle.addEventListener('click', toggleTheme);`):

```js
  DOM.btnOcultarValores.addEventListener('click', alternarValoresOcultos);
  DOM.btnOcultarValoresDash.addEventListener('click', alternarValoresOcultos);
```

- [ ] **Step 7: Mascarar os KPIs do Diário**

Em `updateKPIs` (linha 500), trocar **somente** estas atribuições por `escreverValor`. As linhas de `className`, a barra de progresso, `valRegistered`, `subRegistered` e `summaryTradesCount` ficam exatamente como estão:

```js
  // Resultado acumulado
  escreverValor(DOM.valAccumulated, formatCurrency(accumulated));        // count === 0
  escreverValor(DOM.indAccumulated, 'Sem operações');
  escreverValor(DOM.valAccumulated, formatCurrency(accumulated));        // accumulated === 0
  escreverValor(DOM.indAccumulated, 'Saldo neutro');
  escreverValor(DOM.valAccumulated, formatCurrencySigned(accumulated));  // > 0
  escreverValor(DOM.indAccumulated, 'Saldo positivo');
  escreverValor(DOM.valAccumulated, formatCurrencySigned(accumulated));  // < 0
  escreverValor(DOM.indAccumulated, 'Saldo negativo');

  // Win rate
  escreverValor(DOM.valWinrate, winRate === null ? '—' : `${winRate}%`);
  escreverValor(DOM.indWinrate, `${winTrades} de ${decided} vitoriosos`);  // decided > 0
  escreverValor(DOM.indWinrate, 'Taxa de acerto do bloco');                // senão

  // Média por operação
  escreverValor(DOM.valAverage, formatCurrency(average));                 // count === 0
  escreverValor(DOM.indAverage, 'Média de lucro/prejuízo');
  escreverValor(DOM.valAverage, formatCurrency(average));                 // average === 0
  escreverValor(DOM.indAverage, 'Média neutra');
  escreverValor(DOM.valAverage, formatCurrencySigned(average));           // > 0
  escreverValor(DOM.indAverage, 'Média positiva');
  escreverValor(DOM.valAverage, formatCurrencySigned(average));           // < 0
  escreverValor(DOM.indAverage, 'Média negativa');

  // Resumo do gráfico — "Trades: N" continua visível, é contagem
  escreverValor(DOM.summaryWinrate, winRate === null ? '—' : `${winRate}%`);
  escreverValor(DOM.summaryPL, formatCurrency(accumulated));
```

Os indicadores entram porque `3 de 5 vitoriosos` **é** o win rate por extenso e `Saldo positivo` é o sinal do acumulado — mascarar o número e deixar a frase não fecharia nada.

- [ ] **Step 8: Mascarar os KPIs do Dashboard**

Em `renderDashboard` (linha 860), a mesma troca nos equivalentes `dash*`, mantendo `dashValRegistered`, `dashSubRegistered` e `dashSummaryTradesCount` com `textContent`:

```js
  escreverValor(DOM.dashValAccumulated, formatCurrency(accumulated));        // count === 0
  escreverValor(DOM.dashIndAccumulated, 'Sem operações');
  escreverValor(DOM.dashValAccumulated, formatCurrency(accumulated));        // accumulated === 0
  escreverValor(DOM.dashIndAccumulated, 'Saldo neutro');
  escreverValor(DOM.dashValAccumulated, formatCurrencySigned(accumulated));  // > 0
  escreverValor(DOM.dashIndAccumulated, 'Saldo positivo');
  escreverValor(DOM.dashValAccumulated, formatCurrencySigned(accumulated));  // < 0
  escreverValor(DOM.dashIndAccumulated, 'Saldo negativo');

  escreverValor(DOM.dashValWinrate, winRate === null ? '—' : `${winRate}%`);
  escreverValor(DOM.dashIndWinrate, `${winTrades} de ${decided} vitoriosos`);  // decided > 0
  escreverValor(DOM.dashIndWinrate, 'Taxa de acerto da conta');                // senão

  escreverValor(DOM.dashValAverage, formatCurrency(average));                 // count === 0
  escreverValor(DOM.dashIndAverage, 'Média de lucro/prejuízo');
  escreverValor(DOM.dashValAverage, formatCurrency(average));                 // average === 0
  escreverValor(DOM.dashIndAverage, 'Média neutra');
  escreverValor(DOM.dashValAverage, formatCurrencySigned(average));           // > 0
  escreverValor(DOM.dashIndAverage, 'Média positiva');
  escreverValor(DOM.dashValAverage, formatCurrencySigned(average));           // < 0
  escreverValor(DOM.dashIndAverage, 'Média negativa');

  escreverValor(DOM.dashSummaryWinrate, winRate === null ? '—' : `${winRate}%`);
  escreverValor(DOM.dashSummaryPL, formatCurrency(accumulated));
```

- [ ] **Step 9: Verificar no navegador**

Com `python -m http.server 8000` rodando, abrir `http://localhost:8000` e entrar na conta. Conferir, em ordem:

1. Clicar no olho no Diário → acumulado, win rate, média, os três indicadores e "Win Rate"/"P/L" do resumo viram `•••••`; "Operações registradas", `/ 35 no bloco`, a barra e "Trades: N" continuam.
2. O ícone vira `eye` e o `title` vira "Mostrar valores".
3. Ir ao Dashboard → já está oculto, e o botão de lá também está em `eye`.
4. Clicar no olho do Dashboard → revela nas duas páginas.
5. Ocultar e dar F5 → volta oculto, sem piscar o valor antes.
6. Alternar 5 vezes seguidas e desativar → os valores verdadeiros voltam, sem `•••••` preso em lugar nenhum.

- [ ] **Step 10: Commit**

```bash
git add index.html style.css app.js
git commit -m "Adiciona o botão de ocultar valores e mascara os KPIs das duas páginas"
```

---

### Task 3: Suprimir a cor enquanto o modo estiver ativo

**Files:**
- Modify: `style.css` (bloco novo depois de `.btn-ocultar-valores :is(i, svg)`, criado na Task 2)

**Interfaces:**
- Consumes: a classe `valores-ocultos` que `definirOculto` aplica no `<body>` (Task 1) e as classes já existentes `.pnl-positive` (linha 735), `.pnl-negative` (738), `.kpi-card.win-trend` (645) e `.kpi-card.loss-trend` (654).
- Produces: nada consumido por outras tarefas.

- [ ] **Step 1: Escrever as regras**

Máscara verde é `estou no lucro` sem dizer quanto — não oculta, decora. Acrescentar em `style.css`:

```css
/* ==========================================================================
   MODO OCULTO — cor é valor
   Bolinha verde diz "estou no lucro" sem dizer quanto: a máscara sai neutra,
   e o realce de tendência do card fica suspenso. Precisa ser CSS: updateKPIs
   reescreve className a cada render e apagaria qualquer ajuste feito em JS.
   ========================================================================== */
body.valores-ocultos :is(.kpi-value, .slot-pnl, .table-pnl):is(.pnl-positive, .pnl-negative),
body.valores-ocultos :is(#summary-pl, #dash-summary-pl) {
  color: var(--text-secondary) !important;
}

body.valores-ocultos .kpi-card:is(.win-trend, .loss-trend) {
  border-left-color: var(--border-color);
}

body.valores-ocultos .kpi-card:is(.win-trend, .loss-trend) .kpi-icon-wrapper {
  color: var(--text-secondary);
  background-color: var(--surface-2);
  border-color: var(--border-color);
}
```

O `!important` é necessário porque `.pnl-positive`/`.pnl-negative` já o usam (linhas 735-740) — sem ele a regra perde a disputa.

- [ ] **Step 2: Verificar no navegador**

Recarregar `http://localhost:8000` e conferir:

1. Num bloco com saldo **negativo**, ativar o modo → nada de vermelho: bolinhas cinza, borda esquerda do card neutra, ícone do card sem fundo vermelho.
2. Num bloco com saldo **positivo**, o mesmo em verde.
3. Desativar → verde e vermelho voltam exatamente como antes.
4. Alternar para o tema claro com o modo ativo → a máscara segue neutra e legível.
5. No grid e na tabela, o valor mascarado também sai cinza (a cor de fundo take/stop do card permanece — decisão da spec).

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "Neutraliza a cor dos valores enquanto o modo oculto estiver ativo"
```

---

### Task 4: Grid e tabela

**Files:**
- Modify: `app.js` (`renderGridView` linha 572, `renderListView` linha 700)

**Interfaces:**
- Consumes: `aplicarOcultacao` de `js/ui/ocultar-valores.js` (Task 1).
- Produces: nada consumido por outras tarefas.

- [ ] **Step 1: Emitir `data-valor-real` no card do grid**

O texto sai do template para uma variável — repeti-lo inteiro dentro do atributo e do
corpo daria uma linha ilegível e duas chances de divergir. Em `renderGridView`, logo
depois do cálculo de `classeResultado` (linha 582), acrescentar:

```js
      const textoPnl = trade.type === 'zero'
        ? '0 x 0'
        : `${trade.pnl >= 0 ? '+' : ''} ${formatCurrency(trade.pnl)}`;
```

E trocar a linha 599 por:

```js
          <div class="slot-pnl" data-valor-real="${escapeHTML(textoPnl)}">${textoPnl}</div>
```

O comentário das linhas 596-598, que explica por que o 0x0 mostra rótulo em vez de
valor, fica onde está. O `0 x 0` entra na máscara junto: ele diz o resultado da operação
tanto quanto um número diria.

- [ ] **Step 2: Aplicar a máscara depois de montar o grid**

Em `renderGridView`, antes de `hidratarMiniaturasDoGrid(trades);` (linha 622):

```js
  // Os cards nascem de template string, sem passar por escreverValor
  aplicarOcultacao(DOM.gridContainer);
```

- [ ] **Step 3: Emitir `data-valor-real` na tabela**

Em `renderListView`, extrair o texto antes do template (depois da linha 716) e trocar a célula da linha 722:

```js
    const textoPnl = `${ehZero ? '' : trade.pnl >= 0 ? '+' : ''}${formatCurrency(trade.pnl)}`;
```

```js
      <td class="table-pnl ${pnlClass}" data-valor-real="${escapeHTML(textoPnl)}">${textoPnl}</td>
```

A coluna **Tipo** (`Take`/`Stop`/`0x0`) fica visível, pela mesma razão da cor do card: é o `se`, não o `quanto`.

- [ ] **Step 4: Aplicar a máscara depois de montar a tabela**

Ao final de `renderListView`, depois do `forEach` (linha 742):

```js
  aplicarOcultacao(DOM.tableBodyContainer);
```

- [ ] **Step 5: Verificar no navegador**

1. Modo ativo, visão em Grid → todos os cards preenchidos mostram `•••••` no lugar do valor; ativo, data e RR continuam; a cor take/stop do card permanece.
2. Card de uma operação 0x0 → também `•••••`, não `0 x 0`.
3. Trocar para a visão em Lista → coluna de resultado toda em `•••••`, cinza; Tipo, ativo, data e observações intactos.
4. Com o modo ativo, registrar uma operação nova → o card nasce mascarado, sem precisar reativar nada.
5. Desativar → todos os valores verdadeiros de volta nas duas visões.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "Mascara o valor no card do grid e na coluna de resultado da tabela"
```

---

### Task 5: Gráfico — eixo Y, tooltip e cor da linha

**Files:**
- Modify: `app.js` (`renderChart` linhas 748-847)

**Interfaces:**
- Consumes: `estaOculto`, `MASCARA`, `MASCARA_CURTA` de `js/ui/ocultar-valores.js` (Task 1).
- Produces: nada consumido por outras tarefas.

- [ ] **Step 1: Neutralizar a cor da linha**

`renderChart` escolhe verde ou vermelho pelo `currentSum` (linhas 759-776) — a linha vermelha entrega o prejuízo sem número. Trocar a condição de abertura na linha 759:

```js
  // Com os valores ocultos a linha vai de neutro: verde/vermelho diria o
  // resultado do bloco sem precisar de número nenhum.
  const oculto = estaOculto();
  const isPositive = !oculto && currentSum > 0;
  const isNegative = !oculto && currentSum < 0;
```

O `else` que já existe (linhas 768-776) cuida do resto: ele lê `--text-secondary` de `document.body` e monta o degradê neutro. Nada mais muda ali.

- [ ] **Step 2: Mascarar o eixo Y**

Trocar o `callback` do eixo `y` (linha 843):

```js
        y: { grid: { color: gridColorY, drawBorder: false }, ticks: { color: tickColor, font: { family: 'Inter', size: 10 }, callback: (v) => estaOculto() ? MASCARA_CURTA : formatCurrency(v) } }
```

- [ ] **Step 3: Mascarar o tooltip**

Trocar o `label` do tooltip (linha 837):

```js
            label: (c) => {
              if (estaOculto()) return `Acumulado: ${MASCARA}`;
              const v = c.raw;
              return `Acumulado: ${v > 0 ? '+' : ''}${formatCurrency(v)}`;
            }
```

A curva continua desenhada: ela mostra a forma da evolução, e sem escala no eixo Y não há como ler valor a partir dela.

- [ ] **Step 4: Verificar no navegador**

1. Modo ativo → eixo Y do gráfico do Diário todo em `•••`; a curva continua lá.
2. Passar o mouse sobre um ponto → `Acumulado: •••••`, e o título (`Operação #7`) continua.
3. Bloco no prejuízo com o modo ativo → linha cinza, não vermelha; mesmo teste no lucro, cinza e não verde.
4. Mesma verificação no gráfico do Dashboard.
5. Alternar o modo → os dois gráficos acompanham na hora (o `renderApp` do botão os recria).
6. Desativar → eixo com os valores e a linha colorida de volta.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Mascara o eixo, o tooltip e a cor da linha do gráfico no modo oculto"
```

---

### Task 6: Documentar a convenção no CLAUDE.md do projeto

**Files:**
- Modify: `CLAUDE.md` (tabela "Estrutura" na linha 33; seção "Conceitos do domínio" na linha 66; "Convenções ao trabalhar aqui" na linha 131)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Registrar o arquivo novo na tabela de estrutura**

Em `CLAUDE.md`, na tabela "Estrutura", acrescentar a linha depois de `js/ui/lightbox.js`:

```markdown
| `js/ui/ocultar-valores.js` | Modo privacidade: máscara `•••••` sobre os valores sensíveis, estado no `localStorage` |
```

E, junto de `tests/image-processing.test.html`:

```markdown
| `tests/ocultar-valores.test.html` | Teste da máscara de valores — abrir no navegador servido por HTTP |
```

- [ ] **Step 2: Registrar o conceito**

Em "Conceitos do domínio", ao final da seção, acrescentar:

```markdown
- **Ocultar valores (modo privacidade):** o botão de olho no Diário e no Dashboard troca
  todo valor sensível das duas páginas por `•••••` — acumulado, win rate, média, os
  indicadores (`Saldo positivo`, `3 de 5 vitoriosos`), o resumo do gráfico, o eixo Y e o
  tooltip, o valor do card e a coluna de resultado da tabela. **"Operações registradas"
  e "Trades: N" ficam visíveis**: dizem quanto do bloco foi preenchido, não como você
  foi, e são o que permite continuar usando o app com os valores fechados. **Cor é
  valor** — no modo ativo a máscara sai neutra, o realce `win-trend`/`loss-trend` do card
  fica suspenso e a linha do gráfico vai de cinza; a supressão é CSS sob
  `body.valores-ocultos` porque `updateKPIs` reescreve `className` a cada render.
  **A cor take/stop dos 35 cards do grid permanece**, e isso é deliberado: neutralizar
  tudo vira uma parede cinza ilegível. O modo esconde **o quanto**, não **o se** — quem
  olhar de perto conta acertos e erros. Fica no `localStorage`
  (`monolith:valores-ocultos`), **não** no `user_preferences`: privacidade é propriedade
  de onde você está, não de quem você é. Calculadoras, modal e export JSON ficam fora.
```

- [ ] **Step 3: Registrar a armadilha nas convenções**

Em "Convenções ao trabalhar aqui", acrescentar:

```markdown
- **Valor sensível novo na tela nasce por `escreverValor()`** (`js/ui/ocultar-valores.js`),
  nunca por `el.textContent =`. Em HTML de template string, emita
  `data-valor-real="${escapeHTML(texto)}"` e chame `aplicarOcultacao(container)` ao final
  do render. **A fonte da verdade é o atributo, jamais o texto que está na tela:** mascarar
  lendo o `textContent` grava `•••••` por cima do valor real na segunda passada e o número
  se perde até o próximo fetch — foi por isso que a máscara nasceu idempotente.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Documenta o modo de ocultar valores nas convenções do Monolith"
```

---

## Verificação final

Depois da Task 6, com `python -m http.server 8000` na raiz:

| Situação | Esperado |
|----------|----------|
| `tests/ocultar-valores.test.html` | `TUDO PASSOU` |
| `tests/image-processing.test.html` | `TUDO PASSOU` (nada nesta feature toca imagens — é a checagem de que segue assim) |
| Ativar no Diário, ir ao Dashboard | Já oculto lá, botão em `eye` |
| Ativar, F5 | Continua oculto, sem piscar valor |
| Alternar 5 vezes, desativar | Valores verdadeiros, nenhum `•••••` residual |
| Salvar operação com o modo ativo | Card novo nasce mascarado |
| Abrir o app em outra aba e salvar uma operação lá | A aba com o modo ativo recebe o Realtime e segue mascarada |
| Bloco negativo, modo ativo | Nada de vermelho em KPI, card, tabela ou linha do gráfico |
| Modo ativo, tema claro | Máscara neutra e legível |
| Modo ativo, abrir o modal de uma operação | Campo de valor com o número real (fora do escopo, de propósito) |
| Modo ativo, exportar JSON | Arquivo com os valores reais |
