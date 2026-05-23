/**
 * Configuração do Supabase
 * ----------------------------------------------------------------
 * Substitua os valores abaixo pelos do SEU projeto Supabase:
 *   1. Acesse https://supabase.com  →  abra o projeto
 *   2. Vá em  Project Settings → API
 *   3. Copie:
 *        - Project URL          → SUPABASE_URL
 *        - anon public key      → SUPABASE_ANON_KEY
 *
 * IMPORTANTE
 * - A chave "anon" é PÚBLICA por design (pode ir para o GitHub).
 *   Quem protege os dados é o Row Level Security (RLS) — já
 *   configurado em supabase/schema.sql.
 * - NUNCA exponha a chave "service_role" no frontend.
 */
export const SUPABASE_URL      = 'https://aaudbtgqrxlzjdufljdu.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdWRidGdxcnhsempkdWZsamR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0OTY0MjksImV4cCI6MjA5NTA3MjQyOX0.Dy82TN2pO1PdWDNlWei7D_onOn3Q2AA92HaMgSKm1SA';

// Validação básica em tempo de execução para detectar config esquecida
export function assertConfig() {
  if (!SUPABASE_URL || SUPABASE_URL.startsWith('COLE_AQUI') ||
      !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.startsWith('COLE_AQUI')) {
    throw new Error(
      '[PositionPips] Supabase não configurado. Edite js/config.js ' +
      'e preencha SUPABASE_URL e SUPABASE_ANON_KEY.'
    );
  }
}
