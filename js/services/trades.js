/**
 * Trades Service — CRUD + Realtime
 * --------------------------------------------------------------
 * Toda operação na tabela `trades` passa por aqui. O user_id é
 * preenchido automaticamente pelo Supabase (auth.uid) — basta o
 * cliente estar autenticado. O RLS no banco impede qualquer leak.
 */
import { supabase } from '../supabase-client.js';

const TABLE = 'trades';

/**
 * Busca TODOS os trades do usuário autenticado, agrupados por block_index.
 * Retorna o mesmo formato usado pelo app legado:
 *   { "1": [trade,...], "2": [trade,...] }
 */
export async function fetchAllTradesByBlock(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('block_index', { ascending: true })
    .order('position',    { ascending: true })
    // desempate determinístico caso duas linhas tenham a mesma posição
    // (dado antigo corrompido) — a autocura decide qual delas move
    .order('created_at',  { ascending: true });

  if (error) throw new Error('Falha ao carregar operações: ' + error.message);

  const blocks = { '1': [] };
  for (const row of data) {
    const key = String(row.block_index);
    if (!blocks[key]) blocks[key] = [];
    blocks[key].push(rowToTrade(row));
  }
  return blocks;
}

export async function insertTrade(userId, { blockIndex, position, asset, type, pnl, date, notes, images, riskReward }) {
  const payload = {
    user_id:     userId,
    block_index: blockIndex,
    position,
    asset,
    type,
    pnl,
    trade_date:  date,
    notes:       notes || null,
    images:      Array.isArray(images) ? images : [],
    // Campo opcional: qualquer coisa que não seja número positivo vira null,
    // senão a constraint do banco recusaria a linha inteira
    risk_reward: normalizaRiskReward(riskReward)
  };
  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error('Falha ao salvar operação: ' + error.message);
  return rowToTrade(data);
}

export async function updateTrade(tradeId, { asset, type, pnl, date, notes, blockIndex, position, images, riskReward }) {
  const payload = {
    asset,
    type,
    pnl,
    trade_date: date,
    notes: notes || null
  };
  // Só grava images quando veio na chamada: editTrade chama sem images
  // ao salvar alterações no ativo/nota, e sempre passar a chave apagaria o gravado
  if (images     !== undefined) payload.images      = images;
  if (blockIndex !== undefined) payload.block_index = blockIndex;
  if (position   !== undefined) payload.position    = position;
  // Mesmo guard do images: quem não fala de R:R não pode apagar o que está
  // gravado. Hoje o único chamador é editTrade, que sempre passa o campo (a
  // renumeração e a autocura usam updateTradePlacements, não esta função) —
  // o guard é defesa para o próximo chamador, não para um caso atual.
  // `null` aqui é valor legítimo: é como o usuário limpa o campo.
  if (riskReward !== undefined) payload.risk_reward = normalizaRiskReward(riskReward);

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', tradeId)
    .select()
    .single();
  if (error) throw new Error('Falha ao atualizar operação: ' + error.message);
  return rowToTrade(data);
}

/**
 * Corrige bloco/posição de operações (usado pela autocura e pela renumeração
 * após excluir). Atualiza uma a uma, na ordem recebida — com o índice único
 * (user_id, block_index, position) no banco, a ordem crescente garante que
 * cada update entra numa posição já livre.
 */
export async function updateTradePlacements(changes) {
  for (const { id, blockIndex, position } of changes) {
    const { error } = await supabase
      .from(TABLE)
      .update({ block_index: blockIndex, position })
      .eq('id', id);
    if (error) throw new Error('Falha ao corrigir posição da operação: ' + error.message);
  }
}

export async function deleteTrade(tradeId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', tradeId);
  if (error) throw new Error('Falha ao excluir operação: ' + error.message);
}

/**
 * Apaga TODOS os trades do usuário (usado pelo "Resetar Dados").
 */
export async function deleteAllTrades(userId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId);
  if (error) throw new Error('Falha ao resetar operações: ' + error.message);
}

/**
 * Importa em lote (usado pelo "Importar Dados").
 * Recebe a estrutura legada { blocks: { "1": [...] } }.
 * `blockOffset` desloca os blocos do arquivo para depois dos blocos já
 * usados na conta — importar nunca grava por cima de posições existentes.
 */
export async function bulkImportTrades(userId, blocks, blockOffset = 0) {
  const rows = [];
  for (const [blockIdx, list] of Object.entries(blocks || {})) {
    list.forEach((t, position) => {
      rows.push({
        user_id:     userId,
        block_index: Number(blockIdx) + blockOffset,
        position,
        asset:       String(t.asset || '').toUpperCase().slice(0, 64),
        type:        t.type === 'stop' ? 'stop' : 'take',
        pnl:         Number(t.pnl) || 0,
        trade_date:  t.date || new Date().toISOString().slice(0, 10),
        notes:       t.notes || null,
        // Backup JSON não carrega imagem (elas vivem no Storage)
        images:      [],
        // O R:R vai no backup, mas é normalizado na volta: arquivo antigo não
        // tem o campo, e um valor estragado no JSON não pode derrubar o lote
        risk_reward: normalizaRiskReward(t.riskReward)
      });
    });
  }
  if (rows.length === 0) return;
  const { error } = await supabase.from(TABLE).insert(rows);
  if (error) throw new Error('Falha ao importar operações: ' + error.message);
}

/**
 * Assina mudanças em tempo real na tabela trades para um usuário.
 * Sempre que qualquer linha do user_id mudar (INSERT/UPDATE/DELETE)
 * o callback é chamado — o app refaz fetch para re-hidratar o estado.
 */
export function subscribeRealtime(userId, onChange) {
  const channel = supabase
    .channel(`trades-realtime-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
      (payload) => onChange(payload)
    )
    .subscribe();
  return channel;
}

export function unsubscribeRealtime(channel) {
  if (channel) supabase.removeChannel(channel);
}

// ---------- helpers ----------
/**
 * Devolve o R:R pronto para o banco, ou null quando não há valor utilizável.
 * O campo é opcional, então "não informado" é null — nunca 0, que no domínio
 * significaria retorno zero. O teto de 999 espelha a constraint
 * `trades_risk_reward_valido`: barrar aqui dá mensagem de campo em vez de
 * derrubar o insert inteiro no Postgres.
 */
function normalizaRiskReward(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0 || n > 999) return null;
  // 2 casas: é o que numeric(6,2) guarda, e evita 3.0000000000000004
  return Math.round(n * 100) / 100;
}

function rowToTrade(row) {
  return {
    id:    row.id,
    asset: row.asset,
    type:  row.type,
    pnl:   Number(row.pnl),
    date:  row.trade_date,
    notes: row.notes || '',
    // Linha antiga (anterior à coluna) vem como null — normaliza para lista
    images: Array.isArray(row.images) ? row.images : [],
    // R:R é opcional: null quando não informado, e assim continua (não vira 0,
    // que significaria "risco/retorno zero" em vez de "não sei")
    riskReward: row.risk_reward === null || row.risk_reward === undefined
      ? null
      : Number(row.risk_reward),
    blockIndex: row.block_index,
    position:   row.position
  };
}
