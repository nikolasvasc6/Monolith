/**
 * Cliente Supabase (singleton)
 * --------------------------------------------------------------
 * Importa o SDK v2 do Supabase via CDN ESM (jsDelivr).
 * Compatível 100% com GitHub Pages (sem build step).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, assertConfig } from './config.js?v=2';

assertConfig();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,       // mantém sessão entre reloads (localStorage interno do SDK)
    autoRefreshToken: true,     // renova o JWT automaticamente
    detectSessionInUrl: true    // necessário para o link de confirmação por email
  }
});
