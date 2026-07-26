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
 *
 * Pagina em vez de listar tudo numa chamada só: o `list()` do Storage devolve
 * no máximo 1000 itens por página, e cada imagem grava DOIS objetos (full +
 * thumb) — um usuário com mais de 500 imagens já estoura essa página sozinho.
 * Sem paginação, a função removeria só a primeira leva e voltaria sem erro,
 * como se tivesse limpado tudo: o resto ficaria órfão consumindo cota, sem
 * sinal nenhum — falha silenciosa bem no meio do "Resetar Dados", o fluxo
 * mais sensível do app. NÃO simplifique isto de volta para uma chamada única.
 *
 * Estratégia: relista sempre a partir do offset 0, em laço, até a página vir
 * vazia — nunca avança o offset manualmente. Como cada leva já removida some
 * do bucket, a chamada seguinte a offset 0 devolve naturalmente a leva
 * seguinte; se avançássemos o offset enquanto removemos ao mesmo tempo, os
 * itens restantes deslizariam para trás e pularíamos arquivos. O teto de
 * iterações é só uma trava de segurança contra laço infinito por bug de
 * paginação — nunca deve ser atingido em uso normal.
 */
export async function removeAllUserImages(userId) {
  const LIMITE_PAGINA = 1000;
  const TETO_ITERACOES = 50; // 50 * 1000 = 50 mil objetos; nunca deve chegar perto disso

  for (let i = 0; i < TETO_ITERACOES; i++) {
    const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: LIMITE_PAGINA, offset: 0 });
    if (error) throw new Error('Falha ao listar imagens: ' + error.message);
    if (!data || data.length === 0) return;

    const caminhos = data.map((f) => `${userId}/${f.name}`);
    caminhos.forEach(invalidateSignedUrl);
    const { error: errRemove } = await supabase.storage.from(BUCKET).remove(caminhos);
    if (errRemove) throw new Error('Falha ao remover imagens: ' + errRemove.message);
  }
}
