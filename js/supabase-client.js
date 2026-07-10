/**
 * Cliente Supabase (singleton)
 * --------------------------------------------------------------
 * Importa o SDK v2 do Supabase via CDN ESM (jsDelivr).
 * Compatível 100% com GitHub Pages (sem build step).
 */
// Versão FIXADA (não usar '@2' flutuante): garante que todos os dispositivos
// rodem exatamente o mesmo SDK já validado, e o CDN serve com cache imutável
// (mais rápido). Para atualizar, troque a versão aqui deliberadamente.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, assertConfig } from './config.js';

assertConfig();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,       // mantém sessão entre reloads (localStorage interno do SDK)
    autoRefreshToken: true,     // renova o JWT automaticamente
    detectSessionInUrl: true    // necessário para o link de confirmação por email
  }
});
