/**
 * Trade Images Service — Supabase Storage
 * --------------------------------------------------------------
 * Único ponto do app que fala com o Storage. O bucket é PRIVADO:
 * toda exibição passa por URL assinada, pedida em lote e cacheada.
 *
 * Caminho: {user_id}/{uuid}.webp — a primeira pasta é o que as políticas
 * do bucket conferem contra auth.uid().
 */
import { supabase } from '../supabase-client.js';
import { processImageFile } from '../image-processing.js';

const BUCKET = 'trade-images';
const TTL_SEGUNDOS = 3600; // 1 h
// Renova um pouco antes de expirar, para não servir URL morta na virada
const MARGEM_MS = 5 * 60 * 1000;

const cacheUrls = new Map(); // caminho -> { url, expiraEm }

/**
 * Comprime e sobe as duas versões. Devolve o item pronto para o jsonb.
 * Se a segunda subida falhar, remove a primeira — não deixa meia imagem.
 */
export async function uploadTradeImage(userId, file) {
  const { full, thumb } = await processImageFile(file);

  const id = crypto.randomUUID();
  const caminhoFull  = `${userId}/${id}.webp`;
  const caminhoThumb = `${userId}/${id}_thumb.webp`;

  await subir(caminhoFull, full.blob);
  try {
    await subir(caminhoThumb, thumb.blob);
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([caminhoFull]).catch(() => {});
    throw err;
  }

  return { full: caminhoFull, thumb: caminhoThumb, w: full.w, h: full.h };
}

async function subir(caminho, blob) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, blob, { contentType: 'image/webp', upsert: false });
  if (error) throw new Error('Falha ao enviar a imagem: ' + error.message);
}

/**
 * Apaga os arquivos de uma lista de itens do jsonb (full + thumb de cada).
 */
export async function removeTradeImages(images) {
  const caminhos = (images || []).flatMap((img) => [img.full, img.thumb]).filter(Boolean);
  if (caminhos.length === 0) return;
  caminhos.forEach(invalidateSignedUrl);
  const { error } = await supabase.storage.from(BUCKET).remove(caminhos);
  if (error) throw new Error('Falha ao remover imagens: ' + error.message);
}

/**
 * URLs assinadas em lote. Um bloco cheio pede 35 de uma vez, não 35 vezes.
 * Caminho já cacheado e longe de expirar não vai na requisição.
 */
export async function getSignedUrls(paths) {
  const agora = Date.now();
  const resultado = new Map();
  const faltando = [];

  for (const caminho of new Set((paths || []).filter(Boolean))) {
    const emCache = cacheUrls.get(caminho);
    if (emCache && emCache.expiraEm - MARGEM_MS > agora) {
      resultado.set(caminho, emCache.url);
    } else {
      faltando.push(caminho);
    }
  }

  if (faltando.length === 0) return resultado;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(faltando, TTL_SEGUNDOS);
  if (error) throw new Error('Falha ao carregar as imagens: ' + error.message);

  for (const item of data || []) {
    if (!item.signedUrl) continue; // arquivo sumiu do bucket
    cacheUrls.set(item.path, { url: item.signedUrl, expiraEm: agora + TTL_SEGUNDOS * 1000 });
    resultado.set(item.path, item.signedUrl);
  }
  return resultado;
}

/** Força a próxima leitura a pedir URL nova (expirou, ou o arquivo mudou). */
export function invalidateSignedUrl(path) {
  cacheUrls.delete(path);
}

/**
 * Esvazia a pasta do usuário — usado pelo "Resetar Dados". Sem isso, apagar
 * as operações deixaria todos os prints ocupando a cota.
 */
export async function removeAllUserImages(userId) {
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 1000 });
  if (error) throw new Error('Falha ao listar imagens: ' + error.message);
  if (!data || data.length === 0) return;

  const caminhos = data.map((f) => `${userId}/${f.name}`);
  caminhos.forEach(invalidateSignedUrl);
  const { error: errRemove } = await supabase.storage.from(BUCKET).remove(caminhos);
  if (errRemove) throw new Error('Falha ao remover imagens: ' + errRemove.message);
}
