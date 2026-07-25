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

**Valor do ponto: $1 por lote** (contract size 1, padrão de Exness/IC Markets/
Pepperstone/Vantage). Conta em USD, sem conversão de moeda.

Alternativas descartadas: aba "Índices CFD" separada e fusão com a aba BTC CFD (ambas
criam tela nova para um ativo só); campo editável de valor do ponto (mais um campo
para preencher a cada cálculo, sem ganho enquanto a corretora não mudar).

Escopo: **só USTEC**. US30/US500 não entram agora — a estrutura deixa a adição em uma
linha de código + uma `<option>`.

## Design

- **`app.js` — tabela nova**, no estilo de `FUTURES_SPECS`/`B3_SPECS`/`BTC_PIP_SPECS`:

  ```js
  const INDEX_CFD_SPECS = { USTEC: { pointValue: 1 } };
  ```

  É a **única fonte de verdade** de "este ativo é índice, e não par de moedas" —
  cálculo e UI consultam ela, sem lista de ativos duplicada.

- **`app.js` — `forexPipValuePerLot(pair, price)`** ganha uma linha no topo:
  `if (INDEX_CFD_SPECS[pair]) return INDEX_CFD_SPECS[pair].pointValue;`. O resto da
  função fica intacto. Fórmula e arredondamento (0,01 lote, para baixo, para nunca
  ultrapassar o risco) são os mesmos de sempre — só a origem do valor do pip muda.

- **`app.js` — `applyForexAssetMode(pair)`** (nova): ajusta a UI ao ativo. Em modo
  índice, esconde as linhas "Lotes mini (0,1)", "Lotes micro (0,01)" e "Unidades
  totais" (× 100.000 é conversão de par de moedas; para índice seria número
  mentiroso) e troca os rótulos de "pips" para "pontos" — label do stop, "Valor por
  pip (1 lote padrão)" → "Valor por ponto (1 lote)", e o texto da fórmula no rodapé.
  Em modo forex, restaura tudo. **Idempotente:** alternar o seletor N vezes dá o
  mesmo resultado.

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
  label do stop, o rótulo do valor por pip e o `small.calc-help`). **Nenhum ID
  existente muda** — os handlers atuais continuam válidos.

- **Erro novo:** quando o lote arredondado for 0,00 (risco pequeno demais para o
  stop), `toast` de aviso *"Risco insuficiente para 0,01 lote com esse stop."* Hoje a
  tela mostra 0.00 e $0.00 sem explicar. Vale para todos os ativos da Forex.

Fora de escopo, levantado e deixado como está a pedido: XAU/USD sofre do mesmo
defeito de "Unidades totais" (lote × 100.000 não significa nada para ouro, que é
dimensionado em mini lotes de 10 oz). O mecanismo desta spec resolveria de graça,
mas mexe em tela que já está em uso.

## Verificação

Skill `verify` do projeto (navegador real com Supabase stubado), risco de $100:

| Ativo | Stop | Esperado |
|-------|------|----------|
| USTEC | 50 pontos | 2,00 lotes · valor do ponto $1,00 · risco estimado $100,00 |
| USTEC | 33 pontos | 3,03 lotes (não 3,0303) · risco estimado $99,99 — nunca acima do risco |
| USTEC | 200 pontos, risco $1 | 0,00 lote + toast de aviso |
| EUR/USD | 20 pips | 0,50 lote · as três linhas reaparecem · rótulos voltam a "pips" (regressão) |
| XAU/USD | 20 pips | 1 pip = $1, igual a hoje (regressão) |

Conferir também em tema dark e light.
