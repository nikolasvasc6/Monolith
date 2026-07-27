/**
 * Compressão de imagem no navegador — sem I/O, sem Supabase, sem dependência.
 * Recebe o File que o usuário escolheu e devolve duas versões WebP:
 * `full` (1600px) para o lightbox e `thumb` (900px) para o card do grid.
 *
 * Por que duas: um bloco cheio tem 35 cards. Com a versão grande em cada
 * miniatura, abrir um bloco baixaria ~6 MB; com a thumb, ~2 MB.
 */

export const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB
export const FULL_MAX_EDGE  = 1600;
/* 900, não 400: a faixa do card tem 216px de largura CSS e usa object-fit:
   cover, então um print 16:9 é renderizado a ~251px de largura — que em tela
   com DPR 2 (retina, ou escala 150% do Windows) são ~500px de verdade. Com
   400 a miniatura era AMPLIADA para caber, e o gráfico de velas saía borrado.
   900 cobre DPR 2 com folga e ainda pesa ~1/3 da full. */
export const THUMB_MAX_EDGE = 900;

const QUALIDADE_FULL  = 0.82;
/* Mesma qualidade da full: linha fina de candle e texto de gráfico são o pior
   caso do WebP com perdas, e a 0.70 os artefatos apareciam no card mesmo com
   resolução sobrando. O ganho de peso não compensava — quem segura o tamanho
   da miniatura é a resolução, não a compressão. */
const QUALIDADE_THUMB = 0.82;

export async function processImageFile(file) {
  validarEntrada(file);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Chega aqui quando o arquivo tem cara de imagem mas o navegador não abre
    throw new Error('Não consegui abrir esta imagem. Tente exportá-la como PNG ou JPG.');
  }

  try {
    const full  = await redimensionar(bitmap, FULL_MAX_EDGE,  QUALIDADE_FULL);
    const thumb = await redimensionar(bitmap, THUMB_MAX_EDGE, QUALIDADE_THUMB);
    return { full, thumb };
  } finally {
    bitmap.close();
  }
}

function validarEntrada(file) {
  if (!file) throw new Error('Nenhum arquivo selecionado.');

  // HEIC vem da câmera do iPhone e não decodifica no Chrome nem no Firefox.
  // Checa nome também: nesses navegadores o `type` costuma vir vazio.
  const ehHeic = /^image\/hei[cf]$/.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (ehHeic) {
    throw new Error('O navegador não abre imagem .heic. Exporte como PNG ou JPG antes de anexar.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Só dá para anexar imagem (PNG, JPG ou WebP).');
  }

  // Antes de decodificar: um arquivo enorme trava a aba na hora de abrir
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Imagem muito grande (máximo 15 MB). Reduza antes de anexar.');
  }
}

/**
 * Encolhe mantendo proporção. Nunca amplia: imagem menor que o alvo só é
 * convertida para WebP, no tamanho original.
 */
async function redimensionar(bitmap, arestaMax, qualidade) {
  const escala = Math.min(1, arestaMax / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width  * escala);
  const h = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao converter a imagem.'))),
      'image/webp',
      qualidade
    );
  });

  return { blob, w, h };
}
