# Resultado 0x0 (zero a zero) na operação

**Data:** 2026-07-27
**Status:** aprovado pelo Nikolas em conversa

## Problema

O diário só reconhece dois resultados: `take` (lucro) e `stop` (prejuízo). Operação
encerrada no preço de entrada — 0x0 — não tem como ser registrada com honestidade.
Hoje ela vira um `take` de R$ 0,00, indistinguível de um `stop` de R$ 0,00, e entra
no win rate como se fosse derrota.

## Decisão

**Terceiro valor em `type`:** `'zero'` no banco, **"0x0" na UI**. O identificador
segue o padrão minúsculo e alfabético de `take`/`stop`; o jargão fica na interface.

**O 0x0 é sempre exatamente R$ 0,00.** Ao escolher o tipo, o campo de valor trava
em `0,00` e desabilita. Não há lançamento de custo residual (corretagem/spread) —
se um dia isso importar, é campo próprio, não distorção do P&L.

**O 0x0 sai do denominador do win rate.** A taxa passa a medir só as operações que
resolveram: `takes ÷ (total − zeros)`. Empate não é acerto nem erro.

Alternativas descartadas:

- **Deduzir 0x0 de `pnl === 0`**, sem tocar no schema. É justamente o estado
  ambíguo de hoje: `take` de zero e `stop` de zero existem e são a mesma coisa na
  tela. Sem um valor explícito, o win rate não teria como excluir com segurança
  quem é empate de verdade e quem é digitação desleixada.
- **Coluna `outcome` separada de `type`.** Dois campos afirmando a mesma coisa,
  livres para divergir. Não paga o custo.

## Design

### Banco (`supabase/schema.sql`)

A constraint do `type` está inline no `create table` (nome gerado pelo Postgres:
`trades_type_check`), então a evolução entra como **seção 10**, no formato
idempotente das seções 8 e 9:

```sql
alter table public.trades drop constraint if exists trades_type_check;
alter table public.trades add constraint trades_type_check
  check (type in ('take','stop','zero'));
```

A linha do `create table` também passa a listar os três valores, para banco novo
nascer certo sem depender da seção 10 — que continua ali para os bancos que já
existem. Reexecutar o arquivo inteiro segue seguro.

Nenhuma migração de dados: as linhas atuais continuam `take`/`stop`. `pnl` grava
`0.00` no 0x0, e `rowToTrade()` não muda — o tipo passa cru.

### Modal da operação

- `index.html`: nova `<option value="zero">0x0 (Zero a zero)</option>` no
  `#trade-type`.
- **Campo de valor trava:** ao selecionar 0x0, `#trade-pnl` recebe `0` e
  `disabled`. Ao voltar para take/stop, **restaura o que o usuário tinha
  digitado** — o valor anterior fica guardado antes de zerar, senão um toque
  acidental no seletor apagaria o número. Idempotente: alternar N vezes dá o
  mesmo resultado.
- **Validação:** o valor deixa de ser obrigatório quando o tipo é 0x0 (hoje
  `isNaN(rawPnl)` barra o salvamento). O sinal em `handleSaveTrade` passa a ser
  de três vias: `zero → 0`, `stop → -abs`, `take → +abs`.
- **R:R continua opcional e intocado** — dá para registrar o risco/retorno que se
  buscava mesmo tendo saído no zero.
- Abrir para editar uma operação 0x0 reabre já com o campo travado.

### KPIs (`computeStats` e as duas telas que a consomem)

`computeStats` passa a devolver também `zeroTrades` e `decided`:

```js
const zeroTrades = trades.filter(t => t.type === 'zero').length;
const decided    = count - zeroTrades;
const winRate    = decided > 0 ? Math.round((winTrades / decided) * 100) : null;
```

- `winTrades` continua sendo `pnl > 0` — mais robusto que `type === 'take'` e já
  exclui o 0x0 por construção.
- **`winRate` nulo vira `—` na tela**, não `0%`: bloco sem nenhuma operação
  decidida não tem taxa de acerto. Vale nos dois lugares que exibem win rate
  (diário e dashboard), incluindo o resumo do rodapé.
- O indicador do card passa a dizer `X de Y vitoriosos` com `Y = decided`.
- **"Operações registradas" e "média por operação" continuam contando o 0x0.**
  Ele ocupou um slot dos 35 e foi uma operação executada — só o win rate o exclui.
- **Saldo neutro:** hoje um acumulado de exatamente R$ 0,00 é rotulado "Saldo
  positivo" e pintado de verde. Com 0x0 no jogo isso passa a acontecer de verdade
  (bloco só de empates), então `accumulated === 0` com `count > 0` passa a exibir
  "Saldo neutro", sem cor. Mesma coisa para a média.

### Card do grid e tabela

- **Card** (`renderGridView`): classe `slot-zero` quando `type === 'zero'`, ao
  lado de `slot-win`/`slot-loss`. Fundo `--bg-card-hover`, borda `--border-color`
  e `.slot-pnl` em `--text-secondary` — variáveis que já existem nos dois temas,
  então o neutro acompanha dark e light sem cor nova. O valor sai como
  `R$ 0,00`, sem o `+`.
- **Tabela** (`renderListView`): a coluna Tipo mostra `0x0` em `--text-secondary`
  (classe `type-zero`), sem herdar `pnl-positive`/`pnl-negative`; a coluna de
  resultado também perde o `+` e fica neutra.

### Import (`bulkImportTrades`)

`type: t.type === 'stop' ? 'stop' : 'take'` vira whitelist dos três valores, com
`take` como fallback. Quando o tipo for `zero`, **força `pnl` em 0** — um JSON
adulterado não pode criar um "0x0" de R$ 300. O export não muda: serializa o
trade como está.

## Verificação

Skill `verify` do projeto (navegador real, Supabase stubado):

| Cenário | Esperado |
|---------|----------|
| Criar operação com tipo 0x0 | Campo de valor travado em 0,00; grava `type: 'zero'`, `pnl: 0` no `__stub_db__` |
| Alternar 0x0 → take → 0x0 no seletor | O valor digitado volta ao reabilitar; nada é perdido |
| Bloco com 3 takes, 2 stops, 2 zeros | Win rate 60% (3 de 5), registradas 7/35, média sobre 7 |
| Bloco só com 0x0 | Win rate `—`; acumulado "Saldo neutro", sem cor |
| Card e tabela do 0x0 | Neutros — sem verde, sem vermelho, sem `+` |
| Editar um 0x0 para stop de R$ 50 | Campo reabilita, grava `-50` |
| Importar JSON com `type: "zero"` e `pnl: 300` | Entra como 0x0 com R$ 0,00 |
| Regressão: take e stop comuns | Sinal, cores e win rate iguais aos de hoje |

Conferir em tema dark e light.
