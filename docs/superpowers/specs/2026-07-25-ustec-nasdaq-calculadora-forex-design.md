# USTEC (Nasdaq 100 CFD) na Calculadora Forex

**Data:** 2026-07-25
**Status:** aprovado pelo Nikolas em conversa

## Problema

O Monolith não dimensiona posição para CFD de índice. O Nasdaq 100 (USTEC) é operado
em lote fracionário como o BTC CFD, mas com valor de ponto próprio — hoje não há como
calculá-lo em nenhuma das 4 calculadoras.

## Decisão

USTEC entra como **opção no seletor de ativos da Calculadora Forex**, como faz a
referência (positionpips.com/forex), em vez de ganhar aba própria. O seletor
`#fx-pair` deixa de ser "Par de Moedas" e passa a ser **"Ativo"** — o ouro já morava
lá como exceção.

**Valor do pip: $0,10 por lote.** No USTEC, 1 pip = 0,1 ponto do índice (cotação com
uma casa decimal), e é em pips que o stop é medido na plataforma do Nikolas — o stop
segue no mesmo vocabulário dos pares de moedas. Conta em USD, sem conversão de moeda.

> Correção de 2026-07-25, depois da primeira implementação: a versão original desta
> spec dizia "$1 por ponto" e trocava os rótulos de "pips" para "pontos". O valor por
> ponto está certo ($1), mas a unidade que a plataforma usa é o pip — logo o valor
> que entra na fórmula é **$0,10**, e o resultado é 10× maior em lotes. Corrigido em
> código e aqui.

Alternativas descartadas: aba "Índices CFD" separada e fusão com a aba BTC CFD (ambas
criam tela nova para um ativo só); campo editável de valor do pip (mais um campo
para preencher a cada cálculo, sem ganho enquanto a corretora não mudar).

Escopo: **só USTEC**. US30/US500 não entram agora — a estrutura deixa a adição em uma
linha de código + uma `<option>`.

## Design

- **`app.js` — tabela nova**, no estilo de `FUTURES_SPECS`/`B3_SPECS`/`BTC_PIP_SPECS`:

  ```js
  const INDEX_CFD_SPECS = { USTEC: { pipValue: 0.10 } };
  ```

  É a **única fonte de verdade** de "este ativo é índice, e não par de moedas" —
  cálculo e UI consultam ela, sem lista de ativos duplicada.

- **`app.js` — `forexPipValuePerLot(pair, price)`** ganha uma linha no topo:
  `if (INDEX_CFD_SPECS[pair]) return INDEX_CFD_SPECS[pair].pipValue;`. O resto da
  função fica intacto. Fórmula e arredondamento (0,01 lote, para baixo, para nunca
  ultrapassar o risco) são os mesmos de sempre — só a origem do valor do pip muda.

- **`app.js` — `applyForexAssetMode(pair)`** (nova): ajusta a UI ao ativo. Em modo
  índice, esconde as linhas "Lotes mini (0,1)", "Lotes micro (0,01)" e "Unidades
  totais" (× 100.000 é conversão de par de moedas; para índice seria número
  mentiroso) e tira a menção a "lote padrão", que só existe em par de moedas:
  "Valor por pip (1 lote padrão)" → "Valor por pip (1 lote)". O texto da fórmula no
  rodapé passa a explicitar que 1 pip = 0,1 ponto do índice. **O label do stop não
  muda** — é "Stop Loss (em pips)" nos dois modos. Em modo forex, restaura tudo.
  **Idempotente:** alternar o seletor N vezes dá o mesmo resultado.

- **`app.js` — `calculateForex()`**: chama `applyForexAssetMode()` e só preenche
  mini/micro/unidades quando o ativo não é índice.

- **`app.js` — listener de `change`** em `#fx-pair` (em `setupCalculatorsListeners`):
  aplica o modo na hora, sem esperar o clique em Calcular, e recalcula se stop e
  risco já estiverem válidos — evita deixar na tela o resultado de EUR/USD com USTEC
  selecionado. Se estiverem inválidos, **não recalcula e não mostra toast**: trocar de
  ativo não é tentativa de calcular, então não deve gerar mensagem de erro.

- **`index.html`**: `<option value="USTEC">USTEC (Nasdaq 100 CFD)</option>` no
  `#fx-pair`; label do grupo vira "Ativo"; IDs novos nos elementos que
  `applyForexAssetMode()` manipula (as três `.calc-result-row` que sofrem toggle, o
  rótulo do valor por pip e o `small.calc-help`). **Nenhum ID existente muda** — os
  handlers atuais continuam válidos.

- **Erro novo:** quando o lote arredondado for 0,00 (risco pequeno demais para o
  stop), `toast` de aviso *"Risco insuficiente para 0,01 lote com esse stop."* Hoje a
  tela mostra 0.00 e $0.00 sem explicar. Vale para todos os ativos da Forex.

**Ouro (acrescentado em 2026-07-25, depois da primeira implementação).** XAU/USD
sofria do mesmo defeito: "Unidades totais" = lote × 100.000 é tamanho de lote de
moeda e não significa nada para ouro, dimensionado em onças. Foi levantado como fora
de escopo e o Nikolas pediu para aplicar em seguida. A condição do modo deixou de ser
"é índice" e passou a ser **"não é par de moedas"** (`isForexNonCurrencyAsset()`), com
`FX_NON_CURRENCY_ASSETS = new Set(['XAUUSD'])` ao lado de `INDEX_CFD_SPECS`. O cálculo
do ouro **não muda** ($1/pip, mini lote de 10 oz); muda só a exibição — as três linhas
somem e o rótulo perde o "lote padrão". O texto da fórmula no rodapé continua decidido
por `INDEX_CFD_SPECS`, porque a nota "1 pip = 0,1 ponto do índice" só vale para o USTEC.

## Verificação

Skill `verify` do projeto (navegador real com Supabase stubado), risco de $100:

| Ativo | Stop | Esperado |
|-------|------|----------|
| USTEC | 50 pips | 20,00 lotes · valor do pip $0,10 · risco estimado $100,00 |
| USTEC | 33 pips | 30,30 lotes (não 30,3030) · risco estimado $99,99 — nunca acima do risco |
| USTEC | 2000 pips, risco $1 | 0,00 lote + toast de aviso |
| EUR/USD | 20 pips | 0,50 lote · as três linhas reaparecem · rótulo volta a "1 lote padrão" (regressão) |
| XAU/USD | 20 pips | 1 pip = $1, igual a hoje (regressão) |

Conferir também em tema dark e light.
