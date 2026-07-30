# Ocultar valores (modo privacidade)

**Data:** 2026-07-30
**Status:** aprovado pelo Nikolas em conversa

## Problema

Não há como usar o app com outra pessoa por perto. Abrir o Diário expõe o resultado
acumulado, o win rate e o valor de cada uma das 35 operações do bloco de uma só vez —
em tela compartilhada, aula, café ou print para o grupo. Hoje a única saída é não abrir.

## Decisão

**Um interruptor global de ocultação**, com ícone de olho cortado, que troca todo valor
sensível do Diário e do Dashboard por `•••••`. Vale para as duas páginas ao mesmo tempo:
o modo é um só, não um por página.

**Cor é valor.** Máscara que herda verde ou vermelho não oculta nada — diz "estou no
lucro" sem dizer quanto. Enquanto o modo estiver ativo, as bolinhas saem em cor neutra
e o brilho `win-trend`/`loss-trend` dos cards de KPI fica suspenso.

**Fica por dispositivo (`localStorage`), não na conta.** Privacidade é uma propriedade
de *onde você está*, não de quem você é: o notebook levado para fora fica oculto, o PC
de casa fica aberto. Sincronizar pelo `user_preferences` obrigaria a reativar o modo em
cada troca de máquina — exatamente o contrário do que se quer — e ainda custaria uma
coluna nova no schema.

**"Operações registradas" continua visível**, com `/ 35 no bloco` e a barra de
progresso. Ela diz quanto do bloco foi preenchido, não como você foi — é o que permite
seguir usando o app (saber em que slot você está) com os valores fechados. Pela mesma
razão, "Trades: N" no resumo do gráfico fica.

**A cor take/stop dos cards do grid permanece.** Neutralizar 35 cards apaga a leitura
do bloco e transforma o grid numa parede cinza. A contrapartida é assumida e conhecida:
quem olhar de perto conta acertos e erros e deduz o win rate. O modo esconde **o
quanto**, não **o se** — para o caso de tela compartilhada, é o que importa.

Alternativas descartadas:

- **Um `if (oculto)` em cada ponto de escrita.** São ~30 pontos entre `updateKPIs`,
  `renderDashboard`, grid, tabela e gráfico. Cada valor novo criado no futuro nasceria
  vazando até alguém lembrar do `if`.
- **Mascarar lendo o `textContent` que já está na tela.** Não é idempotente: alternar
  duas vezes, ou um render do Realtime chegando com o modo ativo, grava `•••••` como se
  fosse o valor real e o número verdadeiro se perde até o próximo fetch.
- **Ocultar também as calculadoras.** Ali os números são de um cálculo em andamento, não
  do seu histórico — e você acabou de digitar os dados de entrada que estão na tela.

## Design

### Estado e persistência

Variável de módulo própria em `app.js`, **fora de `state`**: o Realtime substitui
`state` inteiro a cada evento e levaria o modo junto.

```js
const CHAVE_VALORES_OCULTOS = 'monolith:valores-ocultos';
let valoresOcultos = localStorage.getItem(CHAVE_VALORES_OCULTOS) === '1';
```

A leitura acontece na inicialização do módulo, antes do primeiro render, para que os
valores não apareçam por um instante antes de serem mascarados.

### Mecânica: `data-valor-real` como fonte da verdade

O texto verdadeiro vive no atributo, nunca no `textContent`:

```js
const MASCARA = '•••••';

function escreverValor(el, texto) {
  el.dataset.valorReal = texto;
  el.textContent = valoresOcultos ? MASCARA : texto;
}

function aplicarOcultacao(raiz = document) {
  raiz.querySelectorAll('[data-valor-real]').forEach((el) => {
    el.textContent = valoresOcultos ? MASCARA : el.dataset.valorReal;
  });
}
```

`aplicarOcultacao` é idempotente por construção — ela nunca lê o texto da tela. Rodar
mil vezes dá o mesmo resultado que rodar uma.

Dois caminhos de uso, conforme como o elemento nasce:

| Origem | Como aplica |
|--------|-------------|
| Elementos fixos do `index.html` (KPIs, resumo do gráfico) | `escreverValor(el, texto)` no lugar de `el.textContent = texto` |
| HTML de template (`renderGridView`, `renderListView`) | template emite `data-valor-real="${escapeHTML(texto)}"`; `aplicarOcultacao(container)` roda ao final do render |

### O que é mascarado

Nas **duas** páginas (Diário e Dashboard):

| Elemento | Ids |
|----------|-----|
| Resultado acumulado + indicador | `val-accumulated`/`ind-accumulated`, `dash-val-accumulated`/`dash-ind-accumulated` |
| Win rate + indicador | `val-winrate`/`ind-winrate`, `dash-val-winrate`/`dash-ind-winrate` |
| Média por operação + indicador | `val-average`/`ind-average`, `dash-val-average`/`dash-ind-average` |
| Win Rate e P/L do resumo do gráfico | `summary-winrate`/`summary-pl`, `dash-summary-winrate`/`dash-summary-pl` |
| Valor do card no grid | `.slot-pnl` (inclusive o rótulo `0 x 0`) |
| Resultado na tabela | `.table-pnl` |
| Eixo Y e tooltip do gráfico | via callbacks do Chart.js |

Os indicadores entram porque `3 de 5 vitoriosos` **é** o win rate escrito por extenso, e
`Saldo positivo` é o sinal do acumulado. Mascarar o número e deixar a frase não fecha nada.

Permanece visível: `val-registered`/`sub-registered` e a barra de progresso;
`summary-trades-count`; ativo, data, RR e observações da operação. A coluna **Tipo** da
tabela (`Take`/`Stop`/`0x0`) também fica, pela mesma razão da cor do card: é o `se`, não
o `quanto`, e apagá-la deixaria a lista ilegível.

### Cor, por CSS

`updateKPIs` reescreve `className` a cada render, então neutralizar cor em JS seria
desfeito no render seguinte. A supressão vive no CSS, sob `body.valores-ocultos`:

- `.kpi-value`, `.slot-pnl`, `.table-pnl` e `#summary-pl` com `.pnl-positive`/
  `.pnl-negative` → cor de texto neutra (`--text-secondary`)
- `.kpi-card.win-trend` / `.kpi-card.loss-trend` → brilho e borda coloridos suspensos

A classe `valores-ocultos` no `<body>` é aplicada no mesmo ponto em que
`aplicarOcultacao` roda.

### Gráfico (Chart.js)

- tick do eixo Y: `(v) => valoresOcultos ? '•••' : formatCurrency(v)`
- tooltip: `Acumulado: •••••` quando ativo
- **cor da linha:** `renderChart` hoje escolhe verde ou vermelho pelo acumulado do bloco.
  Linha vermelha é a mesma frase que "Saldo negativo", dita em cor — no modo oculto ela
  vai do mesmo neutro que o caso de acumulado zero já usa

Como a cor da linha faz parte da construção da instância, e não de um callback, alternar
o modo **recria** os gráficos em vez de dar `chart.update()`. É o que `renderApp()` já faz
a cada render, e é o caminho que o toggle de tema usa desde sempre.

A curva permanece desenhada. Ela mostra a forma da evolução, não a escala — sem eixo Y
não há como ler valor a partir dela.

### Botão

Ícone Lucide `eye-off` quando os valores estão visíveis (a ação é ocultar) e `eye`
quando ocultos (a ação é revelar), reusando o estilo de `.btn-theme-toggle`. Dois
botões, mesmo estado, sempre sincronizados:

- Diário: à esquerda de "Nova operação" no `.page-header`, como na referência
- Dashboard: no `.page-header`, que hoje não tem botão nenhum

Sem o gêmeo do Dashboard, ocultar estando lá deixaria o usuário sem como desfazer sem
trocar de página. `title` e `aria-label` acompanham o estado: "Ocultar valores" /
"Mostrar valores".

### Fora de escopo

- **Calculadoras** — números de um cálculo em andamento, com os dados de entrada na tela
- **Modal de operação** — para registrar ou editar é preciso ver o campo
- **Export JSON** — arquivo, não tela; ocultar ali seria corromper o dado
- **Miniaturas dos prints no grid.** Com o modo ativo, o card mascara o valor mas continua
  exibindo a miniatura do screenshot da plataforma, que costuma ter o P&L escrito nela.
  Decisão do Nikolas em 2026-07-30: fica como está — o modo protege o texto da interface,
  não o conteúdo das imagens que o usuário anexou.
- **Stop diário ($) e Stop semanal ($) do Plano operacional** — campos de formulário
  editáveis, mesma razão que já deixa o modal de operação de fora: para editar é preciso ver.
- **Sincronização entre abas.** Duas abas do app abertas não compartilham o estado do
  modo: ocultar numa deixa a outra à mostra. O caso real da feature é a aba na sua frente
  — limitação conhecida, não defeito.

## Casos de teste

| Situação | Esperado |
|----------|----------|
| Ativar no Diário e ir ao Dashboard | Valores do Dashboard já ocultos, ícone do botão de lá em `eye` |
| Ativar, recarregar a página | Continua oculto, sem piscar o valor antes de mascarar |
| Ativar, alternar 5 vezes, desativar | Valores verdadeiros de volta, nenhum `•••••` residual |
| Operação salva com o modo ativo | Card novo nasce mascarado |
| Realtime chega de outra aba com o modo ativo | Re-render mantém tudo mascarado |
| Bloco de saldo negativo, modo ativo | Nada de vermelho: KPI neutro, card sem brilho `loss-trend` |
| Modo ativo, trocar tema | Máscara segue neutra no tema claro |
| Bloco negativo, modo ativo, no gráfico | Linha cinza, não vermelha |
| Modo ativo, passar o mouse no gráfico | Tooltip mascarado, eixo Y em `•••` |
| Modo ativo, exportar JSON | Arquivo com os valores reais |
