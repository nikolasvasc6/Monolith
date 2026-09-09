// Rodar: node --experimental-vm-modules --test tests/registro-trade.test.cjs
// Executa os módulos reais; só o relógio, o DOM e a conexão externa são simulados.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');
const fusoAnterior = process.env.TZ;
process.env.TZ = 'America/Sao_Paulo';
after(() => {
  if (fusoAnterior === undefined) delete process.env.TZ;
  else process.env.TZ = fusoAnterior;
});

async function ambiente(instante) {
  class Relogio extends Date {
    constructor(...args) { super(...(args.length ? args : [instante])); }
    static now() { return new Date(instante).getTime(); }
  }
  const gravadas = [];
  const conexao = {
    from(tabela) {
      assert.equal(tabela, 'trades');
      return {
        async insert(linhas) {
          gravadas.push(...linhas);
          return { error: null };
        }
      };
    }
  };
  const contexto = vm.createContext({
    Date: Relogio, console,
    document: { addEventListener() {} }
  });
  const modulos = new Map();
  function carregar(arquivo) {
    if (modulos.has(arquivo)) return modulos.get(arquivo);
    let modulo;
    if (arquivo === path.join(raiz, 'js', 'supabase-client.js')) {
      modulo = new vm.SyntheticModule(['supabase'], function () {
        this.setExport('supabase', conexao);
      }, { context: contexto, identifier: arquivo });
    } else {
      let fonte = fs.readFileSync(arquivo, 'utf8');
      // Expõe os pontos de entrada apenas dentro deste contexto de teste.
      if (arquivo === path.join(raiz, 'app.js')) fonte += '\nexport { DOM, openTradeModal };';
      modulo = new vm.SourceTextModule(fonte, { context: contexto, identifier: arquivo });
    }
    modulos.set(arquivo, modulo);
    return modulo;
  }
  const app = carregar(path.join(raiz, 'app.js'));
  await app.link((nome, origem) => carregar(path.resolve(path.dirname(origem.identifier), nome)));
  await app.evaluate();
  const campos = ['modalTitle', 'tradeIdInput', 'tradeSlotInput', 'tradeDate',
    'tradeAsset', 'tradeType', 'tradePnL', 'tradeNotes', 'tradeRR', 'btnDeleteTrade', 'tradeModal'];
  for (const nome of campos) {
    app.namespace.DOM[nome] = {
      value: '', dataset: {}, style: {}, disabled: false,
      classList: { add() {} }, focus() {}
    };
  }
  return {
    app: app.namespace,
    trades: modulos.get(path.join(raiz, 'js', 'services', 'trades.js')).namespace,
    gravadas
  };
}

for (const [descricao, instante, esperado] of [
  ['antes da virada em UTC', '2026-09-05T20:59:00-03:00', '2026-09-05'],
  ['à noite, quando UTC já está no dia seguinte', '2026-09-05T22:00:00-03:00', '2026-09-05'],
  ['na virada do ano em UTC', '2026-12-31T23:30:00-03:00', '2026-12-31'],
  ['em dia bissexto', '2028-02-29T23:30:00-03:00', '2028-02-29'],
  ['depois da meia-noite local', '2027-01-01T00:01:00-03:00', '2027-01-01']
]) {
  test(`novo registro usa a data local ${descricao}`, async () => {
    const { app } = await ambiente(instante);
    app.openTradeModal(null, 0);
    assert.equal(app.DOM.tradeDate.value, esperado);
  });
}

test('editar preserva a data registrada, mesmo diferente de hoje', async () => {
  const { app } = await ambiente('2026-09-09T22:00:00-03:00');
  app.openTradeModal({ id: 'antigo', asset: 'EURUSD', type: 'take', pnl: 100, date: '2026-08-01' }, 0);
  assert.equal(app.DOM.tradeDate.value, '2026-08-01');
  assert.equal(app.DOM.tradePnL.value, 100);
});

test('importação usa data local só quando o arquivo não informa data', async () => {
  const { trades, gravadas } = await ambiente('2026-09-05T22:00:00-03:00');
  await trades.bulkImportTrades('usuario-sintetico', { '1': [
    { asset: 'EURUSD', type: 'take', pnl: 100 },
    { asset: 'EURUSD', type: 'stop', pnl: -50, date: '2026-08-01' }
  ] });
  assert.equal(gravadas[0].trade_date, '2026-09-05');
  assert.equal(gravadas[1].trade_date, '2026-08-01');
  assert.equal(gravadas[0].pnl, 100);
  assert.equal(gravadas[1].pnl, -50);
});
