/**
 * Lightbox das imagens da operação.
 * Não conhece Supabase nem o formato do trade: recebe URLs prontas.
 *
 * Foco (decisão desta task): NÃO há focus trap aqui, pelo mesmo motivo que não
 * há no modal da operação — um trap que vaza num erro é pior que nenhum, e ter
 * trap só na camada de cima criaria dois comportamentos diferentes no mesmo
 * app. O que existe é o mínimo que evita defeito real de teclado:
 * - fechado, o overlay fica `inert` — sem isso os três botões (fechar,
 *   anterior, próxima) continuariam no Tab de todas as telas do app, porque
 *   `opacity: 0` + `pointer-events: none` escondem do mouse mas não do teclado;
 * - aberto, o foco vai para o botão de fechar (Esc e Enter fecham) e volta,
 *   ao fechar, para quem estava focado antes.
 */

let itens = [];  // [{ url, w, h }]
let indice = 0;
let el = null;   // { overlay, img, contador, prev, next, fechar }
let focoAnterior = null;    // elemento que tinha o foco quando o lightbox abriu
let ultimoEscTratado = null; // o último evento de Esc que ESTE módulo consumiu

export function initLightbox() {
  el = {
    overlay:  document.getElementById('lightbox'),
    img:      document.getElementById('lightbox-img'),
    contador: document.getElementById('lightbox-counter'),
    prev:     document.getElementById('lightbox-prev'),
    next:     document.getElementById('lightbox-next'),
    fechar:   document.getElementById('lightbox-close')
  };
  if (!el.overlay) return;

  el.overlay.inert = true; // fechado no boot: fora do Tab e da árvore de acessibilidade

  el.fechar.addEventListener('click', fecharLightbox);
  el.prev.addEventListener('click', () => mover(-1));
  el.next.addEventListener('click', () => mover(1));

  // Clique no fundo (não na imagem nem nos botões) fecha
  el.overlay.addEventListener('click', (e) => {
    if (e.target === el.overlay) fecharLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (!lightboxEstaAberto()) return;
    if (e.key === 'Escape') {
      // Marca ANTES de fechar: assim que fecharLightbox() tira a classe
      // .active, lightboxEstaAberto() passa a responder false — quem rodar
      // depois nesta MESMA tecla precisa de outro jeito de saber que o Esc já
      // foi consumido aqui. Guarda só a referência do evento (um objeto,
      // trocado a cada Esc consumido).
      ultimoEscTratado = e;
      e.preventDefault();
      fecharLightbox();
    }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); mover(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); mover(1); }
  });
}

/*
 * As duas funções abaixo existem para uma coisa só: deixar quem está POR BAIXO
 * (o modal da operação) ignorar um Esc que era do lightbox. Os dois handlers de
 * Esc estão registrados no mesmo nó (document), onde nem preventDefault nem
 * stopPropagation separam listeners — e usá-las em par é o que torna a guarda
 * insensível à ordem de registro, que é o ponto:
 *
 * - modal registrado primeiro  → ele roda antes de o lightbox fechar, ainda vê
 *   lightboxEstaAberto() === true;
 * - lightbox registrado primeiro → quando o modal roda, a classe .active já
 *   sumiu, mas lightboxTratouEsc(e) === true para AQUELE evento.
 *
 * Uma das duas sempre segura. Testar só uma delas dá um app que funciona hoje e
 * quebra em silêncio no dia em que alguém reordenar duas linhas do boot,
 * descartando as imagens não salvas do usuário.
 */
export function lightboxEstaAberto() {
  return !!el && !!el.overlay && el.overlay.classList.contains('active');
}

/** Este Esc específico já foi consumido pelo lightbox? (identidade do evento) */
export function lightboxTratouEsc(evento) {
  return !!evento && evento === ultimoEscTratado;
}

export function abrirLightbox(listaDeItens, indiceInicial = 0) {
  if (!el || !el.overlay || !listaDeItens || listaDeItens.length === 0) return;
  itens = listaDeItens;
  indice = Math.min(Math.max(indiceInicial, 0), itens.length - 1);
  focoAnterior = document.activeElement;
  el.overlay.classList.toggle('solo', itens.length === 1);
  el.overlay.inert = false;
  el.overlay.classList.add('active');
  mostrar();
  el.fechar.focus();
}

export function fecharLightbox() {
  if (!el || !el.overlay) return;
  el.overlay.classList.remove('active');
  el.overlay.inert = true; // tira o foco de dentro antes de devolvê-lo
  el.img.src = '';
  el.img.style.aspectRatio = '';
  itens = [];
  // Devolve o foco a quem abriu, se ainda estiver na página
  if (focoAnterior && focoAnterior.isConnected && typeof focoAnterior.focus === 'function') {
    focoAnterior.focus();
  }
  focoAnterior = null;
}

function mover(passo) {
  if (itens.length < 2) return;
  indice = (indice + passo + itens.length) % itens.length; // circular
  mostrar();
}

function mostrar() {
  const atual = itens[indice];
  // Reserva a proporção ANTES de a imagem carregar: sem isso a caixa nasce
  // com o tamanho da anterior e a tela pula quando o arquivo chega
  el.img.style.aspectRatio = atual.w && atual.h ? `${atual.w} / ${atual.h}` : '';
  el.img.src = atual.url;
  el.contador.textContent = `${indice + 1} / ${itens.length}`;
}
