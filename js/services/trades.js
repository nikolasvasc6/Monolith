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
    .order('position',    { ascending: true });

  if (error) throw new Error('Falha ao carregar operações: ' + error.message);

  const blocks = { '1': [] };
  for (const row of data) {
    const key = String(row.block_index);
    if (!blocks[key]) blocks[key] = [];
    blocks[key].push(rowToTrade(row));
  }
  return blocks;
}

export async function insertTrade(userId, { blockIndex, position, asset, type, pnl, date, notes }) {
  const payload = {
    user_id:     userId,
    block_index: blockIndex,
    position,
    asset,
    type,
    pnl,
    trade_date:  date,
    notes:       notes || null
  };
  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error('Falha ao salvar operação: ' + error.message);
  return rowToTrade(data);
}

export async function updateTrade(tradeId, { asset, type, pnl, date, notes, blockIndex, position }) {
  const payload = {
    asset,
    type,
    pnl,
    trade_date: date,
    notes: notes || null
  };
  if (blockIndex !== undefined) payload.block_index = blockIndex;
  if (position   !== undefined) payload.position    = position;

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', tradeId)
    .select()
    .single();
  if (error) throw new Error('Falha ao atualizar operação: ' + error.message);
  return rowToTrade(data);
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
 */
export async function bulkImportTrades(userId, blocks) {
  const rows = [];
  for (const [blockIdx, list] of Object.entries(blocks || {})) {
    list.forEach((t, position) => {
      rows.push({
        user_id:     userId,
        block_index: Number(blockIdx),
        position,
        asset:       String(t.asset || '').toUpperCase().slice(0, 64),
        type:        t.type === 'stop' ? 'stop' : 'take',
        pnl:         Number(t.pnl) || 0,
        trade_date:  t.date || new Date().toISOString().slice(0, 10),
        notes:       t.notes || null
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
function rowToTrade(row) {
  return {
    id:    row.id,
    asset: row.asset,
    type:  row.type,
    pnl:   Number(row.pnl),
    date:  row.trade_date,
    notes: row.notes || '',
    blockIndex: row.block_index,
    position:   row.position
  };
}
