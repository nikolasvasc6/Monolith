/**
 * Auth UI — tela de login/cadastro
 * --------------------------------------------------------------
 * Não acopla com o resto do app. Expõe:
 *   showAuthScreen()  →  mostra a tela
 *   hideAuthScreen()  →  esconde a tela
 *   onAuthenticated(fn) →  callback quando login/cadastro tem sucesso
 *
 * O fluxo segue:
 *   1. Usuário entra → ou clica "criar conta"
 *   2. Submit → chama auth.js
 *   3. Em caso de sucesso (com sessão), dispara o callback registrado
 */
import { signIn, signUp, resetPassword } from '../auth.js';

let onAuthenticatedCb = null;

export function showAuthScreen() {
  document.getElementById('auth-screen')?.classList.add('active');
  document.getElementById('app-shell')?.classList.add('hidden');
}

export function hideAuthScreen() {
  document.getElementById('auth-screen')?.classList.remove('active');
  document.getElementById('app-shell')?.classList.remove('hidden');
}

export function onAuthenticated(callback) {
  onAuthenticatedCb = callback;
}

export function initAuthUI() {
  const form         = document.getElementById('auth-form');
  const emailEl      = document.getElementById('auth-email');
  const passEl       = document.getElementById('auth-password');
  const submitBtn    = document.getElementById('auth-submit');
  const switchBtn    = document.getElementById('auth-switch-mode');
  const forgotBtn    = document.getElementById('auth-forgot');
  const errorBox     = document.getElementById('auth-error');
  const infoBox      = document.getElementById('auth-info');
  const titleEl      = document.getElementById('auth-title');
  const subtitleEl   = document.getElementById('auth-subtitle');

  let mode = 'signin'; // 'signin' | 'signup'

  function renderMode() {
    if (mode === 'signin') {
      titleEl.textContent    = 'Entrar';
      subtitleEl.textContent = 'Acesse seu diário de trading na nuvem';
      submitBtn.textContent  = 'Entrar';
      switchBtn.innerHTML    = 'Não tem conta? <strong>Cadastre-se</strong>';
      forgotBtn.style.display = 'inline';
    } else {
      titleEl.textContent    = 'Criar conta';
      subtitleEl.textContent = 'Comece a salvar suas operações na nuvem';
      submitBtn.textContent  = 'Cadastrar';
      switchBtn.innerHTML    = 'Já tem conta? <strong>Entrar</strong>';
      forgotBtn.style.display = 'none';
    }
    clearMessages();
  }

  function clearMessages() {
    errorBox.textContent = '';
    errorBox.style.display = 'none';
    infoBox.textContent = '';
    infoBox.style.display = 'none';
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
    infoBox.style.display = 'none';
  }

  function showInfo(msg) {
    infoBox.textContent = msg;
    infoBox.style.display = 'block';
    errorBox.style.display = 'none';
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    switchBtn.disabled = loading;
    submitBtn.textContent = loading
      ? (mode === 'signin' ? 'Entrando…' : 'Cadastrando…')
      : (mode === 'signin' ? 'Entrar' : 'Cadastrar');
  }

  switchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    mode = mode === 'signin' ? 'signup' : 'signin';
    renderMode();
  });

  forgotBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = emailEl.value.trim();
    if (!email) { showError('Informe seu e-mail para recuperar a senha.'); return; }
    try {
      await resetPassword(email);
      showInfo('Enviamos um link de recuperação para o seu e-mail.');
    } catch (err) {
      showError(err.message);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();

    const email = emailEl.value.trim();
    const password = passEl.value;

    if (!email || !email.includes('@')) { showError('Informe um e-mail válido.'); return; }
    if (!password || password.length < 6) { showError('A senha deve ter pelo menos 6 caracteres.'); return; }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { user, session } = await signUp(email, password);
        if (session) {
          // Confirmação de email desabilitada no Supabase → já tem sessão
          onAuthenticatedCb?.(session);
        } else {
          // Email confirmation habilitada → aguarda confirmação
          showInfo('Conta criada! Verifique seu e-mail para confirmar o cadastro e depois faça login.');
          mode = 'signin';
          renderMode();
        }
      } else {
        const { session } = await signIn(email, password);
        onAuthenticatedCb?.(session);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  });

  renderMode();
}
