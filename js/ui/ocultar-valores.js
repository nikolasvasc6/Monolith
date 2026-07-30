/**
 * Ocultar valores (modo privacidade)
 * --------------------------------------------------------------
 * Troca todo valor sensível do Diário e do Dashboard por bolinhas,
 * para usar o app com alguém por perto.
 *
 * A fonte da verdade é o atributo `data-valor-real`, nunca o texto que
 * está na tela: ler a tela para mascarar gravaria `•••••` por cima do
 * valor verdadeiro na segunda passada, e o número se perderia até o
 * próximo fetch. Como só se lê do dataset, aplicar mil vezes dá o
 * mesmo resultado de aplicar uma.
 *
 * Fica no localStorage, não no user_preferences: privacidade é
 * propriedade de ONDE você está, não de quem você é — o notebook levado
 * para fora fica oculto, o PC de casa fica aberto.
 */

const CHAVE = 'monolith:valores-ocultos';

export const MASCARA = '•••••';
/** Eixo Y do gráfico: o tick é estreito, 5 bolinhas não cabem. */
export const MASCARA_CURTA = '•••';

let oculto = false;

export function estaOculto() {
  return oculto;
}

/** Lê a preferência gravada e aplica. Chamar uma vez, antes do primeiro render. */
export function inicializarOcultacao() {
  definirOculto(localStorage.getItem(CHAVE) === '1');
  return oculto;
}

export function definirOculto(valor) {
  oculto = Boolean(valor);
  if (oculto) localStorage.setItem(CHAVE, '1');
  else        localStorage.removeItem(CHAVE);
  document.body.classList.toggle('valores-ocultos', oculto);
}

export function alternarOculto() {
  definirOculto(!oculto);
  return oculto;
}

/** Escreve um valor sensível: guarda o real e mostra o que for devido. */
export function escreverValor(el, texto) {
  if (!el) return;
  el.dataset.valorReal = texto;
  el.textContent = oculto ? MASCARA : texto;
}

/**
 * Reaplica o estado atual em tudo que carrega `data-valor-real` dentro da
 * raiz. Para HTML montado por template string, que não passou por
 * escreverValor.
 */
export function aplicarOcultacao(raiz = document) {
  raiz.querySelectorAll('[data-valor-real]').forEach((el) => {
    el.textContent = oculto ? MASCARA : el.dataset.valorReal;
  });
}
