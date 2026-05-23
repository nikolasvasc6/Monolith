/**
 * Preferences Service — tema e bloco ativo
 * --------------------------------------------------------------
 * A linha em user_preferences é criada automaticamente pelo trigger
 * on_auth_user_created. Aqui só fazemos SELECT/UPDATE com upsert
 * defensivo (caso o trigger não tenha rodado por alguma razão).
 */
import { supabase } from '../supabase-client.js?v=2';

const TABLE = 'user_preferences';

const DEFAULTS = { active_block_index: 1, theme: 'dark' };

export async function fetchPreferences(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('active_block_index, theme')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error('Falha ao carregar preferências: ' + error.message);

  if (!data) {
    // Trigger não rodou — cria agora
    const { data: created, error: insErr } = await supabase
      .from(TABLE)
      .insert({ user_id: userId, ...DEFAULTS })
      .select('active_block_index, theme')
      .single();
    if (insErr) throw new Error('Falha ao criar preferências: ' + insErr.message);
    return normalize(created);
  }
  return normalize(data);
}

export async function updatePreferences(userId, patch) {
  const payload = {};
  if (patch.activeBlockIndex !== undefined) payload.active_block_index = patch.activeBlockIndex;
  if (patch.theme            !== undefined) payload.theme              = patch.theme;
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('user_id', userId);
  if (error) throw new Error('Falha ao salvar preferências: ' + error.message);
}

function normalize(row) {
  return {
    activeBlockIndex: row?.active_block_index ?? DEFAULTS.active_block_index,
    theme:            row?.theme              ?? DEFAULTS.theme
  };
}
