/**
 * Auth — wrapper sobre Supabase Auth
 * --------------------------------------------------------------
 * Centraliza signup, signin, signout, getSession e onAuthStateChange.
 * Toda mensagem de erro vem em pt-BR.
 */
import { supabase } from './supabase-client.js';

function translateError(err) {
  if (!err) return 'Erro desconhecido.';
  const msg = (err.message || String(err)).toLowerCase();
  if (msg.includes('invalid login credentials'))      return 'E-mail ou senha inválidos.';
  if (msg.includes('email not confirmed'))            return 'Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).';
  if (msg.includes('user already registered'))        return 'Já existe uma conta com este e-mail. Faça login.';
  if (msg.includes('password should be at least'))    return 'A senha deve ter pelo menos 6 caracteres.';
  if (msg.includes('rate limit'))                     return 'Muitas tentativas. Aguarde alguns segundos e tente novamente.';
  if (msg.includes('network'))                        return 'Falha de rede. Verifique sua conexão.';
  return err.message || 'Erro ao processar a solicitação.';
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(translateError(error));
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateError(error));
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(translateError(error));
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(translateError(error));
  return data.session;
}

export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/**
 * Inscreve um callback que é chamado em toda mudança de auth
 * (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, ...).
 * Retorna o subscription para poder dar unsubscribe se quiser.
 */
export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return subscription;
}

export async function resetPassword(email) {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(translateError(error));
}
