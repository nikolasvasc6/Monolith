# Imagens por Operação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada operação do diário aceita até 10 imagens, com miniatura no card do bloco e lightbox para leitura do gráfico.

**Architecture:** As imagens vão para um bucket privado do Supabase Storage em `{user_id}/{uuid}.webp`; a linha do trade guarda só os caminhos, numa coluna `images` jsonb. O navegador comprime para WebP e gera duas versões (400px para o card, 1600px para o lightbox) antes de subir. Exibição usa URLs assinadas pedidas em lote e cacheadas em memória.

**Tech Stack:** HTML/CSS/JavaScript vanilla (ES Modules), sem build e sem npm. Supabase (Auth + Postgres + Storage + Realtime). Canvas API para compressão — nenhuma biblioteca nova.

**Spec:** `docs/superpowers/specs/2026-07-26-imagens-por-operacao-design.md`

## Global Constraints

- **Vanilla JS + ES Modules, sem framework e sem build step.** O app roda direto do GitHub Pages. Nenhuma dependência npm nova; nenhuma biblioteca via CDN além das que já existem (Supabase JS, Chart.js, Lucide).
- **Todo texto de UI e mensagem de erro em pt-BR**, com acentuação correta.
- **Toda I/O de dados passa por `js/services/`** — nunca chamar `supabase` direto do `app.js`.
- **snake_case no banco ↔ camelCase no app.** A ponte é `rowToTrade()` em `js/services/trades.js`; ao mexer num campo, atualize os dois lados.
- **Limite de 10 imagens por operação**, valendo no cliente e no banco.
- **Compressão: WebP, aresta máxima 1600px (full) e 400px (thumb).** Nunca ampliar imagem menor que o alvo.
- **Arquivo de entrada acima de 15 MB é recusado** antes de decodificar.
- **Seletores CSS de ícone precisam casar `i` e `svg`** (`:is(i, svg)`) — o Lucide troca um pelo outro na renderização.
- **O `supabase/schema.sql` é idempotente**: pode ser reexecutado inteiro sem perda. Todo SQL novo segue essa regra.

---

### Task 1: Schema, bucket e políticas do Storage

**Files:**
- Modify: `supabase/schema.sql` (acrescentar seção 8, ao final do arquivo)

**Interfaces:**
- Consumes: nada
- Produces: coluna `public.trades.images` (jsonb, default `'[]'`, no máximo 10 itens); bucket `trade-images` privado; 4 políticas em `storage.objects` restringindo tudo à pasta `auth.uid()`

- [ ] **Step 1: Acrescentar a seção 8 ao final de `supabase/schema.sql`**

```sql
-- ----------------------------------------------------------------------------
-- 8. Imagens por operação
--    Caminhos ficam na linha do trade; os arquivos, no bucket trade-images.
--    O caminho é {user_id}/{uuid}.webp — a pasta do usuário é o que as
--    políticas do Storage conferem, então não há pasta por operação.
-- ----------------------------------------------------------------------------
alter table public.trades
  add column if not exists images jsonb not null default '[]'::jsonb;

-- Teto de 10 garantido no banco: estado defasado no cliente não grava a 11ª
alter table public.trades drop constraint if exists trades_images_max;
alter table public.trades add constraint trades_images_max
  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 10);

-- Bucket privado (exibição sempre por URL assinada)
insert into storage.buckets (id, name, public)
values ('trade-images', 'trade-images', false)
on conflict (id) do nothing;

-- Políticas: espelham o RLS da tabela — a 1ª pasta do caminho é o dono
drop policy if exists "trade_images_select_own" on storage.objects;
drop policy if exists "trade_images_insert_own" on storage.objects;
drop policy if exists "trade_images_update_own" on storage.objects;
drop policy if exists "trade_images_delete_own" on storage.objects;

create policy "trade_images_select_own"
  on storage.objects for select
  using (bucket_id = 'trade-images'
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "trade_images_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'trade-images'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "trade_images_update_own"
  on storage.objects for update
  using (bucket_id = 'trade-images'
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "trade_images_delete_own"
  on storage.objects for delete
  using (bucket_id = 'trade-images'
         and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Nikolas roda o arquivo no Supabase**

Painel do Supabase → SQL Editor → New query → colar **todo** o `schema.sql` → Run.
Esperado: "Success. No rows returned". O arquivo é idempotente; rodar de novo não quebra.

- [ ] **Step 3: Conferir que o schema entrou**

No SQL Editor:

```sql
select column_name, data_type, column_default
  from information_schema.columns
 where table_name = 'trades' and column_name = 'images';

select id, public from storage.buckets where id = 'trade-images';

select policyname from pg_policies
 where tablename = 'objects' and policyname like 'trade_images%';
```

Esperado: a coluna `images` como `jsonb` com default `'[]'::jsonb`; o bucket com `public = false`; **4** políticas listadas.

- [ ] **Step 4: Conferir que o teto de 10 é real**

```sql
-- deve FALHAR com violação da constraint trades_images_max
update public.trades
   set images = (select jsonb_agg(jsonb_build_object('full','x','thumb','y'))
                   from generate_series(1, 11))
 where id = (select id from public.trades limit 1);
```

Esperado: erro `new row for relation "trades" violates check constraint "trades_images_max"`.
Se não houver nenhuma operação cadastrada, pule este passo e refaça depois da Task 6.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "Abre espaço no banco para as imagens das operações"
```

---

### Task 2: Compressão de imagem (`image-processing.js`)

Módulo puro, sem I/O e sem Supabase — é a única parte com teste automatizado de verdade.

**Files:**
- Create: `js/image-processing.js`
- Test: `tests/image-processing.test.html`

**Interfaces:**
- Consumes: nada
- Produces:
  - `processImageFile(file) -> Promise<{ full: {blob: Blob, w: number, h: number}, thumb: {blob: Blob, w: number, h: number} }>`
  - `MAX_INPUT_BYTES = 15728640`, `FULL_MAX_EDGE = 1600`, `THUMB_MAX_EDGE = 400`
  - Em erro, lança `Error` com mensagem pronta para o toast, em pt-BR.

- [ ] **Step 1: Escrever a página de teste que falha**

Create `tests/image-processing.test.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>Teste — image-processing</title>
<style>
  body { font: 14px/1.5 monospace; padding: 24px; background: #0c0f17; color: #e2e8f0; }
  .ok   { color: #10b981; }
  .fail { color: #f43f5e; }
  h1 { font-size: 16px; }
</style>
<h1>image-processing</h1>
<div id="saida"></div>
<script type="module">
  import { processImageFile, MAX_INPUT_BYTES } from '../js/image-processing.js';

  const saida = document.getElementById('saida');
  let falhas = 0;

  function conta(nome, condicao, detalhe = '') {
    const li = document.createElement('div');
    li.className = condicao ? 'ok' : 'fail';
    li.textContent = `${condicao ? 'PASSOU' : 'FALHOU'} — ${nome}${detalhe ? ' :: ' + detalhe : ''}`;
    saida.appendChild(li);
    if (!condicao) falhas++;
  }

  // Gera um File de imagem sintética com as dimensões pedidas
  async function imagemFalsa(w, h, tipo = 'image/png', nome = 'grafico.png') {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#10b981'; ctx.fillRect(0, h / 2, w, 4); // "candle"
    const blob = await new Promise(r => cv.toBlob(r, tipo));
    return new File([blob], nome, { type: tipo });
  }

  async function erroDe(promessa) {
    try { await promessa; return null; } catch (e) { return e.message; }
  }

  // 1. Imagem grande encolhe para 1600 (full) e 400 (thumb), virando WebP
  {
    const r = await processImageFile(await imagemFalsa(3000, 2000));
    conta('full encolhe para 1600 de aresta maior', r.full.w === 1600 && r.full.h === 1067,
          `${r.full.w}x${r.full.h}`);
    conta('thumb encolhe para 400 de aresta maior', r.thumb.w === 400 && r.thumb.h === 267,
          `${r.thumb.w}x${r.thumb.h}`);
    conta('as duas versões saem em WebP',
          r.full.blob.type === 'image/webp' && r.thumb.blob.type === 'image/webp',
          `${r.full.blob.type} / ${r.thumb.blob.type}`);
    conta('thumb é bem mais leve que a full', r.thumb.blob.size < r.full.blob.size,
          `${r.thumb.blob.size} < ${r.full.blob.size}`);
  }

  // 2. Imagem menor que o alvo NÃO é ampliada
  {
    const r = await processImageFile(await imagemFalsa(300, 200));
    conta('full não amplia imagem pequena', r.full.w === 300 && r.full.h === 200,
          `${r.full.w}x${r.full.h}`);
    conta('thumb não amplia imagem pequena', r.thumb.w === 300 && r.thumb.h === 200,
          `${r.thumb.w}x${r.thumb.h}`);
  }

  // 3. Imagem em retrato usa a ALTURA como aresta maior
  {
    const r = await processImageFile(await imagemFalsa(1000, 3000));
    conta('retrato limita pela altura', r.full.h === 1600 && r.full.w === 533,
          `${r.full.w}x${r.full.h}`);
  }

  // 4. Arquivo que não é imagem é recusado com mensagem em pt-BR
  {
    const txt = new File(['isto não é imagem'], 'nota.txt', { type: 'text/plain' });
    const msg = await erroDe(processImageFile(txt));
    conta('recusa arquivo que não é imagem', msg !== null && /imagem/i.test(msg), String(msg));
  }

  // 5. HEIC é recusado com mensagem própria (o navegador não decodifica)
  {
    const heic = new File([new Uint8Array(10)], 'IMG_0001.heic', { type: 'image/heic' });
    const msg = await erroDe(processImageFile(heic));
    conta('recusa HEIC com dica de conversão', msg !== null && /heic/i.test(msg), String(msg));
  }

  // 6. Arquivo acima do teto é recusado ANTES de decodificar
  {
    const gordo = new File([new Uint8Array(MAX_INPUT_BYTES + 1)], 'enorme.png', { type: 'image/png' });
    const msg = await erroDe(processImageFile(gordo));
    conta('recusa arquivo acima de 15 MB', msg !== null && /15 MB/.test(msg), String(msg));
  }

  const resumo = document.createElement('h1');
  resumo.className = falhas === 0 ? 'ok' : 'fail';
  resumo.textContent = falhas === 0 ? 'TUDO PASSOU' : `${falhas} FALHA(S)`;
  resumo.id = 'resumo';
  saida.appendChild(resumo);
</script>
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
python -m http.server 8000
```

Abrir `http://localhost:8000/tests/image-processing.test.html`.
Esperado: página em branco e, no console, `Failed to resolve module specifier` / 404 em `js/image-processing.js` — o módulo ainda não existe.

- [ ] **Step 3: Escrever `js/image-processing.js`**

```js
/**
 * Compressão de imagem no navegador — sem I/O, sem Supabase, sem dependência.
 * Recebe o File que o usuário escolheu e devolve duas versões WebP:
 * `full` (1600px) para o lightbox e `thumb` (400px) para o card do grid.
 *
 * Por que duas: um bloco cheio tem 35 cards. Com a versão grande em cada
 * miniatura, abrir um bloco baixaria ~10 MB; com a thumb, ~1 MB.
 */

export const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB
export const FULL_MAX_EDGE  = 1600;
export const THUMB_MAX_EDGE = 400;

const QUALIDADE_FULL  = 0.82;
const QUALIDADE_THUMB = 0.70;

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
```

- [ ] **Step 4: Rodar e ver passar**

Recarregar `http://localhost:8000/tests/image-processing.test.html`.
Esperado: todas as linhas em verde e **TUDO PASSOU** no fim.

Se "recusa arquivo que não é imagem" falhar: confira que a validação de `type` roda **antes** de `createImageBitmap`, senão a mensagem que chega é a de decodificação.

- [ ] **Step 5: Commit**

```bash
git add js/image-processing.js tests/image-processing.test.html
git commit -m "Comprime imagem para WebP em duas versões antes de subir"
```

---

### Task 3: Serviço do Storage (`trade-images.js`)

**Files:**
- Create: `js/services/trade-images.js`

**Interfaces:**
- Consumes: `processImageFile` da Task 2; `supabase` de `js/supabase-client.js`
- Produces:
  - `uploadTradeImage(userId, file) -> Promise<{full: string, thumb: string, w: number, h: number}>` (os caminhos, prontos para o jsonb)
  - `removeTradeImages(images) -> Promise<void>` — recebe o array de itens do jsonb
  - `getSignedUrls(paths) -> Promise<Map<string, string>>` — lote, com cache
  - `invalidateSignedUrl(path) -> void`
  - `removeAllUserImages(userId) -> Promise<void>`

- [ ] **Step 1: Criar `js/services/trade-images.js`**

```js
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
```

- [ ] **Step 2: Verificar o serviço no console do navegador**

Com o app aberto e logado em `http://localhost:8000`, no console:

```js
const svc = await import('/js/services/trade-images.js');
const { data: { user } } = await (await import('/js/supabase-client.js')).supabase.auth.getUser();

// sobe uma imagem sintética
const cv = document.createElement('canvas'); cv.width = 2000; cv.height = 1200;
cv.getContext('2d').fillRect(0, 0, 2000, 1200);
const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
const item = await svc.uploadTradeImage(user.id, new File([blob], 't.png', { type: 'image/png' }));
console.log('caminhos:', item);           // { full, thumb, w: 1600, h: 960 }

const urls = await svc.getSignedUrls([item.full, item.thumb]);
console.log('urls:', urls.size);          // 2
window.open(urls.get(item.thumb));        // deve abrir a miniatura

await svc.removeTradeImages([item]);      // limpa
```

Esperado: `w: 1600, h: 960`; duas URLs; a miniatura abre; nenhum erro no `remove`.
No painel do Supabase (Storage → trade-images) a pasta do seu `user_id` deve ficar vazia ao final.

- [ ] **Step 3: Verificar que o isolamento por usuário funciona**

Ainda no console, tente subir para a pasta de outro usuário:

```js
const { supabase } = await import('/js/supabase-client.js');
const r = await supabase.storage.from('trade-images')
  .upload('00000000-0000-0000-0000-000000000000/invasao.webp', new Blob(['x']));
console.log(r.error?.message);
```

Esperado: erro de violação de política (`new row violates row-level security policy`).
Se isso **subir**, as políticas da Task 1 não foram aplicadas — pare e refaça a Task 1.

- [ ] **Step 4: Commit**

```bash
git add js/services/trade-images.js
git commit -m "Cria o serviço de imagens sobre o Supabase Storage"
```

---

### Task 4: `trades.js` passa a carregar e gravar `images`

**Files:**
- Modify: `js/services/trades.js` (`rowToTrade`, `insertTrade`, `updateTrade`, `bulkImportTrades`)

**Interfaces:**
- Consumes: coluna `images` da Task 1
- Produces: todo objeto de trade no app passa a ter `images: Array<{full,thumb,w,h}>` (nunca `undefined`); `insertTrade` e `updateTrade` aceitam `images` no payload

- [ ] **Step 1: `rowToTrade` devolve `images`**

Em `js/services/trades.js`, dentro de `rowToTrade`, depois da linha `notes: row.notes || '',`:

```js
    // Linha antiga (anterior à coluna) vem como null — normaliza para lista
    images: Array.isArray(row.images) ? row.images : [],
```

- [ ] **Step 2: `insertTrade` aceita `images`**

Trocar a assinatura e o payload:

```js
export async function insertTrade(userId, { blockIndex, position, asset, type, pnl, date, notes, images }) {
  const payload = {
    user_id:     userId,
    block_index: blockIndex,
    position,
    asset,
    type,
    pnl,
    trade_date:  date,
    notes:       notes || null,
    images:      Array.isArray(images) ? images : []
  };
```

- [ ] **Step 3: `updateTrade` só toca em `images` quando recebe o campo**

Trocar a assinatura e acrescentar ao payload:

```js
export async function updateTrade(tradeId, { asset, type, pnl, date, notes, blockIndex, position, images }) {
  const payload = {
    asset,
    type,
    pnl,
    trade_date: date,
    notes: notes || null
  };
  // Só sobrescreve se veio no update — chamada que não fala de imagem
  // (renumeração, autocura) não pode zerar o que já está gravado
  if (images     !== undefined) payload.images      = images;
  if (blockIndex !== undefined) payload.block_index = blockIndex;
  if (position   !== undefined) payload.position    = position;
```

- [ ] **Step 4: `bulkImportTrades` grava lista vazia**

Em `bulkImportTrades`, dentro do `rows.push({...})`, depois de `notes: t.notes || null`:

```js
        // Backup JSON não carrega imagem (elas vivem no Storage)
        images:      []
```

- [ ] **Step 5: Verificar no console**

Com o app logado, no console:

```js
const t = await import('/js/services/trades.js');
const { data: { user } } = await (await import('/js/supabase-client.js')).supabase.auth.getUser();
const blocos = await t.fetchAllTradesByBlock(user.id);
const primeiro = Object.values(blocos).flat()[0];
console.log(Array.isArray(primeiro.images), primeiro.images);
```

Esperado: `true []` para operações antigas — nenhuma quebra, e nada de `undefined`.

- [ ] **Step 6: Commit**

```bash
git add js/services/trades.js
git commit -m "Leva as imagens da operação de ponta a ponta no serviço de trades"
```

---

### Task 5: Seção de imagens no modal

Só a UI de escolher, ver o preview e remover. O envio é a Task 6 — aqui os arquivos ficam na memória.

**Files:**
- Modify: `index.html` (dentro de `.modal-body`, depois de `.form-group-notes`)
- Modify: `style.css` (bloco novo depois das regras do modal)
- Modify: `app.js` (`cacheDOM`, `openTradeModal`, `closeTradeModal`, listeners)

**Interfaces:**
- Consumes: nada do Storage ainda
- Produces: estado de módulo em `app.js` — `modalImagens` (array de `{tipo:'existente', item}` ou `{tipo:'nova', file, previewUrl}`), e as funções `renderModalImagens()`, `resetModalImagens()`

- [ ] **Step 1: Markup no `index.html`**

Depois do `<div class="form-group form-group-notes">…</div>`, ainda dentro de `.modal-body`:

```html
          <div class="form-group form-group-imagens">
            <label>Imagens da operação (até 10)</label>
            <div class="imagens-faixa" id="trade-images-strip"></div>
            <button type="button" class="btn-add-imagem" id="btn-add-image">
              <i data-lucide="image-plus"></i> Adicionar imagens
            </button>
            <input type="file" id="trade-image-input" accept="image/png,image/jpeg,image/webp" multiple hidden>
          </div>
```

- [ ] **Step 2: CSS no `style.css`**

Depois do bloco `.form-group-notes` (por volta da linha 1470):

```css
/* Imagens da operação — faixa de miniaturas no modal */
.form-group-imagens {
  flex-shrink: 0;
  margin-top: 20px;
  margin-bottom: 0;
}

.imagens-faixa {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.imagens-faixa:empty {
  display: none;
}

.imagem-miniatura {
  position: relative;
  width: 96px;
  height: 64px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
  background-color: var(--surface-3);
  cursor: zoom-in;
}

.imagem-miniatura img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Enquanto a URL assinada não chega */
.imagem-miniatura.carregando::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, var(--surface-3), var(--surface-6), var(--surface-3));
  animation: imagem-pulso 1.2s ease-in-out infinite;
}

@keyframes imagem-pulso {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 0.8; }
}

.btn-remover-imagem {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background-color: rgba(3, 4, 7, 0.75);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: var(--transition-fast);
}

.btn-remover-imagem:hover {
  background-color: var(--color-danger);
}

.btn-remover-imagem :is(i, svg) {
  width: 12px;
  height: 12px;
}

.btn-add-imagem {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  color: var(--color-primary-hover);
  font-family: var(--font-primary);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 0;
  transition: var(--transition-fast);
}

.btn-add-imagem:hover { color: var(--color-primary); }
.btn-add-imagem:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-add-imagem :is(i, svg) {
  width: 16px;
  height: 16px;
}
```

- [ ] **Step 3: Cachear os elementos novos no `app.js`**

Em `cacheDOM()`, junto dos outros do modal (depois de `DOM.tradeNotes`):

```js
  DOM.tradeImagesStrip  = document.getElementById('trade-images-strip');
  DOM.tradeImageInput   = document.getElementById('trade-image-input');
  DOM.btnAddImage       = document.getElementById('btn-add-image');
```

- [ ] **Step 4: Estado e renderização das miniaturas no `app.js`**

Logo antes de `function openTradeModal(`:

```js
// ==========================================================================
// IMAGENS DO MODAL
// ==========================================================================
const MAX_IMAGENS_POR_TRADE = 10;

// Itens: { tipo: 'existente', item } — já no Storage, com caminhos
//        { tipo: 'nova', file, previewUrl } — escolhida agora, ainda na memória
let modalImagens = [];

function resetModalImagens(imagensExistentes = []) {
  // Libera os object URLs das que não chegaram a subir
  modalImagens.forEach((i) => { if (i.tipo === 'nova') URL.revokeObjectURL(i.previewUrl); });
  modalImagens = imagensExistentes.map((item) => ({ tipo: 'existente', item }));
  renderModalImagens();
}

function renderModalImagens() {
  if (!DOM.tradeImagesStrip) return;
  DOM.tradeImagesStrip.innerHTML = '';

  modalImagens.forEach((entrada, indice) => {
    const fig = document.createElement('div');
    fig.className = 'imagem-miniatura';
    fig.innerHTML = `
      <img alt="Imagem ${indice + 1} da operação">
      <button type="button" class="btn-remover-imagem" title="Remover imagem">
        <i data-lucide="x"></i>
      </button>`;

    const img = fig.querySelector('img');
    if (entrada.tipo === 'nova') {
      img.src = entrada.previewUrl;
    } else {
      fig.classList.add('carregando');
      // A URL assinada chega na Task 6; por ora fica no estado de carregamento
    }

    fig.querySelector('.btn-remover-imagem').addEventListener('click', (e) => {
      e.stopPropagation();
      const [removida] = modalImagens.splice(indice, 1);
      if (removida.tipo === 'nova') URL.revokeObjectURL(removida.previewUrl);
      renderModalImagens();
    });

    DOM.tradeImagesStrip.appendChild(fig);
  });

  // Chegou no teto: não dá para escolher mais
  if (DOM.btnAddImage) {
    DOM.btnAddImage.disabled = modalImagens.length >= MAX_IMAGENS_POR_TRADE;
    DOM.btnAddImage.textContent = '';
    DOM.btnAddImage.innerHTML = modalImagens.length >= MAX_IMAGENS_POR_TRADE
      ? '<i data-lucide="image-off"></i> Limite de 10 imagens atingido'
      : '<i data-lucide="image-plus"></i> Adicionar imagens';
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function adicionarImagensEscolhidas(fileList) {
  const vagas = MAX_IMAGENS_POR_TRADE - modalImagens.length;
  const escolhidas = Array.from(fileList || []);
  if (escolhidas.length > vagas) {
    toast(`Cabem só mais ${vagas} imagem(ns) nesta operação.`, 'info');
  }
  escolhidas.slice(0, vagas).forEach((file) => {
    modalImagens.push({ tipo: 'nova', file, previewUrl: URL.createObjectURL(file) });
  });
  renderModalImagens();
}
```

- [ ] **Step 5: Ligar ao ciclo do modal**

Em `openTradeModal`, no ramo de operação nova (depois de `DOM.tradeNotes.value = '';`):

```js
    resetModalImagens([]);
```

No ramo de edição (depois de `DOM.tradeNotes.value = trade.notes || '';`):

```js
    resetModalImagens(trade.images || []);
```

Em `closeTradeModal`, antes do `DOM.tradeForm.reset()`:

```js
  resetModalImagens([]);
```

Em `setupEventListeners()`, junto dos listeners do modal:

```js
  if (DOM.btnAddImage) {
    DOM.btnAddImage.addEventListener('click', () => DOM.tradeImageInput.click());
  }
  if (DOM.tradeImageInput) {
    DOM.tradeImageInput.addEventListener('change', (e) => {
      adicionarImagensEscolhidas(e.target.files);
      e.target.value = ''; // permite escolher o MESMO arquivo de novo
    });
  }
```

- [ ] **Step 6: Verificar no navegador**

Abrir o app, clicar num slot vazio do diário:
1. "Adicionar imagens" abre o seletor de arquivos.
2. Escolher 3 imagens → aparecem 3 miniaturas com preview imediato.
3. Clicar no "x" de uma → some, sobram 2.
4. Escolher até chegar a 10 → o botão vira "Limite de 10 imagens atingido" e fica desabilitado.
5. Fechar o modal e reabrir → a faixa está vazia (nada vazou entre aberturas).
6. Escolher a mesma imagem duas vezes seguidas → entra as duas vezes (o `value = ''` faz o `change` disparar de novo).

- [ ] **Step 7: Commit**

```bash
git add index.html style.css app.js
git commit -m "Deixa escolher e revisar as imagens no modal da operação"
```

---

### Task 6: Enviar ao salvar, com progresso

**Files:**
- Modify: `app.js` (`handleSaveTrade`, `createTrade`, `editTrade`, `setSubmitLoading`, `renderModalImagens`)

**Interfaces:**
- Consumes: `uploadTradeImage`, `removeTradeImages`, `getSignedUrls` da Task 3; `modalImagens` da Task 5
- Produces: `resolverImagensDoModal() -> Promise<Array<{full,thumb,w,h}>>`; trades gravados com `images` preenchido

- [ ] **Step 1: Importar o serviço no topo do `app.js`**

Depois do import de `./js/services/plan.js`:

```js
import {
  uploadTradeImage,
  removeTradeImages,
  getSignedUrls,
  removeAllUserImages
} from './js/services/trade-images.js';
```

- [ ] **Step 2: Mostrar progresso no botão**

Trocar `setSubmitLoading` por uma versão que aceita rótulo:

```js
function setSubmitLoading(loading, rotulo = 'Salvando…') {
  if (DOM.btnSubmitModal) {
    DOM.btnSubmitModal.disabled = loading;
    DOM.btnSubmitModal.textContent = loading ? rotulo : 'Salvar Operação';
  }
  if (DOM.btnDeleteTrade) DOM.btnDeleteTrade.disabled = loading;
  if (DOM.btnAddImage)    DOM.btnAddImage.disabled = loading || modalImagens.length >= MAX_IMAGENS_POR_TRADE;
}
```

- [ ] **Step 3: Subir as novas e devolver a lista final**

Logo depois de `adicionarImagensEscolhidas`:

```js
/**
 * Sobe as imagens escolhidas agora e devolve a lista completa na ordem da
 * faixa. Se qualquer upload falhar, remove as que já subiram nesta rodada
 * e propaga o erro — a operação não é gravada pela metade.
 */
async function resolverImagensDoModal() {
  const novas = modalImagens.filter((i) => i.tipo === 'nova');
  if (novas.length === 0) return modalImagens.map((i) => i.item);

  const subidasAgora = [];
  try {
    let feitas = 0;
    for (const entrada of modalImagens) {
      if (entrada.tipo !== 'nova') continue;
      feitas++;
      setSubmitLoading(true, `Enviando ${feitas} de ${novas.length}…`);
      const item = await uploadTradeImage(currentUser.id, entrada.file);
      subidasAgora.push(item);
      // Vira 'existente' para não subir de novo se o salvamento repetir
      entrada.tipo = 'existente';
      entrada.item = item;
      URL.revokeObjectURL(entrada.previewUrl);
      delete entrada.previewUrl;
      delete entrada.file;
    }
  } catch (err) {
    await removeTradeImages(subidasAgora).catch(() => {});
    throw err;
  } finally {
    setSubmitLoading(true);
  }

  return modalImagens.map((i) => i.item);
}
```

- [ ] **Step 4: Chamar no `handleSaveTrade`**

Dentro do `try`, antes do `if (id === '')`:

```js
    const images = await resolverImagensDoModal();
```

E passar adiante nas duas chamadas:

```js
    if (id === '') {
      await createTrade({ asset, type, pnl, date, notes, images });
    } else {
      await editTrade(id, { asset, type, pnl, date, notes, images });
    }
```

- [ ] **Step 5: Repassar `images` no `createTrade`**

Trocar a assinatura e a chamada do `insertTrade`:

```js
async function createTrade({ asset, type, pnl, date, notes, images }) {
```

```js
  const trade = await insertTrade(currentUser.id, {
    blockIndex, position, asset, type, pnl, date, notes, images
  });
```

`editTrade` já repassa `fields` inteiro para `updateTrade`, então não muda.

- [ ] **Step 6: Apagar do Storage o que foi removido na edição**

Ainda em `handleSaveTrade`, guarde a lista original ao abrir e limpe depois de gravar. Em `openTradeModal`, no ramo de edição, depois do `resetModalImagens(trade.images || [])`:

```js
    imagensOriginaisDoModal = (trade.images || []).slice();
```

No ramo de operação nova, depois do `resetModalImagens([])`:

```js
    imagensOriginaisDoModal = [];
```

Declare junto de `modalImagens`:

```js
let imagensOriginaisDoModal = []; // para saber o que o usuário tirou na edição
```

E no `handleSaveTrade`, depois do `await editTrade(...)` (dentro do `else`):

```js
      // Arquivos que saíram da faixa nesta edição não têm mais dono
      const mantidos = new Set(images.map((i) => i.full));
      const orfas = imagensOriginaisDoModal.filter((i) => !mantidos.has(i.full));
      if (orfas.length) {
        removeTradeImages(orfas).catch((e) => console.warn('Imagem órfã não removida:', e));
      }
```

- [ ] **Step 7: Miniatura de imagem já salva aparece no modal**

Em `renderModalImagens`, trocar o comentário do ramo `existente` por carregamento real:

```js
    } else {
      fig.classList.add('carregando');
      const caminho = entrada.item.thumb;
      getSignedUrls([caminho])
        .then((mapa) => {
          const url = mapa.get(caminho);
          if (!url) return;
          img.src = url;
          img.addEventListener('load', () => fig.classList.remove('carregando'), { once: true });
        })
        .catch((e) => console.warn('Falha ao assinar URL da miniatura:', e));
    }
```

- [ ] **Step 8: Verificar no navegador**

1. Nova operação com 2 imagens → o botão mostra "Enviando 1 de 2…", depois "Enviando 2 de 2…", e a operação aparece no grid.
2. No painel do Supabase (Storage → trade-images → sua pasta): 4 arquivos (2 full + 2 thumb).
3. Reabrir a operação → as 2 miniaturas carregam (piscam no cinza e aparecem).
4. Remover 1, salvar → no Storage sobram 2 arquivos; reabrir mostra 1 miniatura.
5. Desligar a rede e tentar salvar com imagem nova → toast de erro, modal continua aberto, e o bucket **não** ganhou arquivo solto.
6. No SQL Editor: `select id, jsonb_array_length(images) from trades order by created_at desc limit 3;` — bate com o que a tela mostra.

- [ ] **Step 9: Commit**

```bash
git add app.js
git commit -m "Envia as imagens ao salvar a operação, com progresso no botão"
```

---

### Task 7: Miniatura no card do bloco

**Files:**
- Modify: `app.js` (`renderGridView`)
- Modify: `style.css` (regras do `.grid-slot`)

**Interfaces:**
- Consumes: `getSignedUrls` da Task 3; `trade.images` da Task 4
- Produces: `hidratarMiniaturasDoGrid(trades)` — assina em lote e preenche os `<img>` já no DOM

- [ ] **Step 1: CSS da faixa de imagem no card**

Depois de `.grid-slot.slot-filled:hover` (por volta da linha 930):

```css
/* Card com print: a imagem ocupa a faixa de cima, sangrando até a borda.
   A altura do card não muda — o texto só se acomoda no que sobra. */
.grid-slot.slot-has-image .slot-thumb {
  margin: -12px -12px 8px;
  height: 46%;
  overflow: hidden;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background-color: var(--surface-3);
  cursor: zoom-in;
  flex-shrink: 0;
}

.grid-slot.slot-has-image .slot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transition: opacity var(--transition-normal);
}

/* Só aparece quando a URL assinada chega e a imagem carrega */
.grid-slot.slot-has-image .slot-thumb img.carregada {
  opacity: 1;
}

.grid-slot.slot-has-image .slot-header {
  margin-bottom: 2px;
}

/* Selo com a contagem, quando há mais de uma */
.slot-thumb-contador {
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: rgba(3, 4, 7, 0.72);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: 2px 6px;
  border-radius: 999px;
}
```

- [ ] **Step 2: Renderizar a faixa no `renderGridView`**

Em `app.js`, no ramo `if (trade)`, trocar a montagem do slot por:

```js
      const temImagem = Array.isArray(trade.images) && trade.images.length > 0;
      slotEl.className = `grid-slot slot-filled ${trade.pnl >= 0 ? 'slot-win' : 'slot-loss'}`
                       + (temImagem ? ' slot-has-image' : '');
      slotEl.innerHTML = `
        ${temImagem ? `
        <div class="slot-thumb" data-caminho="${escapeHTML(trade.images[0].thumb)}">
          <img alt="Print da operação ${escapeHTML(trade.asset)}">
          ${trade.images.length > 1 ? `<span class="slot-thumb-contador">${trade.images.length}</span>` : ''}
        </div>` : ''}
        <div class="slot-header">
          <span class="slot-asset">${escapeHTML(trade.asset)}</span>
          <span class="slot-type-badge ${trade.type}">${trade.type === 'take' ? 'Take' : 'Stop'}</span>
        </div>
        <div class="slot-body">
          <div class="slot-pnl">${trade.pnl >= 0 ? '+' : ''} ${formatCurrency(trade.pnl)}</div>
        </div>
        <div class="slot-footer">
          <span class="slot-index">#${String(i + 1).padStart(2, '0')}</span>
          <span class="slot-date">${formatDateBR(trade.date)}</span>
        </div>
      `;
      slotEl.addEventListener('click', () => openTradeModal(trade, i));
```

- [ ] **Step 3: Hidratar as miniaturas em lote**

`renderGridView` hoje termina com `DOM.gridContainer.appendChild(slotEl);`, o `}` do
laço e o `}` da função. Acrescente a chamada **entre** as duas chaves e escreva a função
nova logo abaixo — o trecho a seguir já mostra o `}` de fechamento da `renderGridView`,
não crie outro:

```js
    DOM.gridContainer.appendChild(slotEl);
  }
  hidratarMiniaturasDoGrid(trades);
}

/**
 * Assina as URLs de todas as miniaturas do bloco de uma vez só — 35 cards
 * pedindo sozinhos seriam 35 requisições. Se uma URL expirar com o app
 * aberto, o onerror pede outra e tenta mais uma vez.
 */
async function hidratarMiniaturasDoGrid(trades) {
  const caminhos = trades
    .filter((t) => Array.isArray(t.images) && t.images.length > 0)
    .map((t) => t.images[0].thumb);
  if (caminhos.length === 0) return;

  let mapa;
  try {
    mapa = await getSignedUrls(caminhos);
  } catch (err) {
    console.warn('Falha ao assinar miniaturas do bloco:', err);
    return;
  }

  DOM.gridContainer.querySelectorAll('.slot-thumb').forEach((caixa) => {
    const caminho = caixa.dataset.caminho;
    const url = mapa.get(caminho);
    if (!url) return;
    const img = caixa.querySelector('img');
    let jaTentou = false;

    img.addEventListener('load', () => img.classList.add('carregada'), { once: true });
    img.addEventListener('error', async () => {
      if (jaTentou) return;
      jaTentou = true;
      invalidateSignedUrl(caminho);
      try {
        const novo = await getSignedUrls([caminho]);
        if (novo.get(caminho)) img.src = novo.get(caminho);
      } catch { /* miniatura fica no fundo cinza */ }
    });

    img.src = url;
  });
}
```

Acrescentar `invalidateSignedUrl` ao import de `./js/services/trade-images.js`.

- [ ] **Step 4: Verificar no navegador**

1. Bloco com operações com e sem imagem → os cards têm **a mesma altura**; só os com print mostram a faixa.
2. Operação com 3 imagens → aparece o selo "3" no canto.
3. Na aba Network, filtrando por `sign`: **uma** requisição por bloco, não uma por card.
4. Trocar de bloco e voltar → as miniaturas voltam do cache, sem nova requisição de assinatura.
5. No tema claro, conferir que a faixa não fica com borda estranha no topo.

- [ ] **Step 5: Commit**

```bash
git add app.js style.css
git commit -m "Mostra o print da operação no card do bloco"
```

---

### Task 8: Lightbox

**Files:**
- Create: `js/ui/lightbox.js`
- Modify: `index.html` (markup do lightbox, antes do `<script type="module">`)
- Modify: `style.css`
- Modify: `app.js` (abrir a partir do card e da faixa do modal)

**Interfaces:**
- Consumes: nada do Supabase — recebe itens prontos
- Produces: `abrirLightbox(itens: Array<{url: string, w: number, h: number}>, indiceInicial = 0) -> void`; `initLightbox() -> void` (liga os controles uma vez, no boot)
- O `w`/`h` gravados no jsonb (Task 2) entram aqui: viram `aspect-ratio` na imagem, para a caixa já nascer na proporção certa e a tela não pular quando o arquivo grande termina de carregar.

- [ ] **Step 1: Markup no `index.html`**

Depois do fechamento do `#trade-modal`:

```html
  <!-- Lightbox (visualização das imagens da operação) -->
  <div class="lightbox-overlay" id="lightbox">
    <button class="lightbox-fechar" id="lightbox-close" title="Fechar (Esc)">
      <i data-lucide="x"></i>
    </button>
    <button class="lightbox-nav lightbox-anterior" id="lightbox-prev" title="Anterior">
      <i data-lucide="chevron-left"></i>
    </button>
    <img class="lightbox-imagem" id="lightbox-img" alt="Imagem da operação">
    <button class="lightbox-nav lightbox-proxima" id="lightbox-next" title="Próxima">
      <i data-lucide="chevron-right"></i>
    </button>
    <div class="lightbox-contador" id="lightbox-counter"></div>
  </div>
```

- [ ] **Step 2: CSS no `style.css`**

No fim do arquivo:

```css
/* ==========================================================================
   LIGHTBOX (imagens da operação)
   ========================================================================== */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000; /* acima do modal, que está em 1000 */
  background-color: rgba(3, 4, 7, 0.92);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition-normal);
}

.lightbox-overlay.active {
  opacity: 1;
  pointer-events: all;
}

.lightbox-imagem {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius-md);
}

.lightbox-fechar,
.lightbox-nav {
  position: absolute;
  background-color: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #fff;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition-fast);
}

.lightbox-fechar:hover,
.lightbox-nav:hover { background-color: rgba(255, 255, 255, 0.18); }

.lightbox-fechar   { top: 24px; right: 24px; }
.lightbox-anterior { left: 24px; }
.lightbox-proxima  { right: 24px; }

/* Com uma imagem só, as setas não fazem sentido */
.lightbox-overlay.solo .lightbox-nav,
.lightbox-overlay.solo .lightbox-contador { display: none; }

.lightbox-fechar :is(i, svg),
.lightbox-nav :is(i, svg) {
  width: 20px;
  height: 20px;
}

.lightbox-contador {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.4px;
}

@media (max-width: 768px) {
  .lightbox-overlay { padding: 16px; }
  .lightbox-fechar   { top: 12px; right: 12px; }
  .lightbox-anterior { left: 8px; }
  .lightbox-proxima  { right: 8px; }
}
```

- [ ] **Step 3: Criar `js/ui/lightbox.js`**

```js
/**
 * Lightbox das imagens da operação.
 * Não conhece Supabase nem o formato do trade: recebe URLs prontas.
 */

let itens = [];  // [{ url, w, h }]
let indice = 0;
let el = null;   // { overlay, img, contador, prev, next, fechar }

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

  el.fechar.addEventListener('click', fecharLightbox);
  el.prev.addEventListener('click', () => mover(-1));
  el.next.addEventListener('click', () => mover(1));

  // Clique no fundo (não na imagem nem nos botões) fecha
  el.overlay.addEventListener('click', (e) => {
    if (e.target === el.overlay) fecharLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (!el.overlay.classList.contains('active')) return;
    if (e.key === 'Escape')     { e.preventDefault(); fecharLightbox(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); mover(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); mover(1); }
  });
}

export function abrirLightbox(listaDeItens, indiceInicial = 0) {
  if (!el || !el.overlay || !listaDeItens || listaDeItens.length === 0) return;
  itens = listaDeItens;
  indice = Math.min(Math.max(indiceInicial, 0), itens.length - 1);
  el.overlay.classList.toggle('solo', itens.length === 1);
  el.overlay.classList.add('active');
  mostrar();
}

export function fecharLightbox() {
  if (!el || !el.overlay) return;
  el.overlay.classList.remove('active');
  el.img.src = '';
  el.img.style.aspectRatio = '';
  itens = [];
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
```

- [ ] **Step 4: Ligar no boot do `app.js`**

No import:

```js
import { initLightbox, abrirLightbox } from './js/ui/lightbox.js';
```

Em `DOMContentLoaded`, depois de `lucide.createIcons();`:

```js
  initLightbox();
```

- [ ] **Step 5: Abrir a partir do card**

Em `hidratarMiniaturasDoGrid`, dentro do `forEach`, antes de `img.src = url;`:

```js
    caixa.addEventListener('click', async (e) => {
      e.stopPropagation(); // não abre o modal junto
      const trade = trades.find((t) => t.images?.[0]?.thumb === caminho);
      if (!trade) return;
      try {
        const mapaFull = await getSignedUrls(trade.images.map((i) => i.full));
        const lista = trade.images
          .map((i) => ({ url: mapaFull.get(i.full), w: i.w, h: i.h }))
          .filter((i) => i.url);
        abrirLightbox(lista, 0);
      } catch (err) {
        toast('Não consegui abrir as imagens: ' + err.message, 'error');
      }
    });
```

- [ ] **Step 6: Abrir a partir da faixa do modal**

Em `renderModalImagens`, depois do listener do botão de remover:

```js
    fig.addEventListener('click', async () => {
      try {
        const lista = [];
        for (const entrada of modalImagens) {
          if (entrada.tipo === 'nova') {
            // Ainda não subiu: usa o preview local. Sem w/h aqui — o arquivo
            // original não passou pelo processamento, então a proporção
            // exata só se conhece depois que a imagem carrega
            lista.push({ url: entrada.previewUrl, w: 0, h: 0 });
          } else {
            const mapa = await getSignedUrls([entrada.item.full]);
            const url = mapa.get(entrada.item.full);
            if (url) lista.push({ url, w: entrada.item.w, h: entrada.item.h });
          }
        }
        abrirLightbox(lista, indice);
      } catch (err) {
        toast('Não consegui abrir a imagem: ' + err.message, 'error');
      }
    });
```

- [ ] **Step 7: Verificar no navegador**

1. Clicar na miniatura de um card → abre em tela cheia; o modal da operação **não** abre junto.
2. Setas do teclado e botões passam entre as imagens, circulando do fim para o começo.
3. Esc e o clique no fundo fecham.
4. Operação com uma imagem só → sem setas e sem contador.
5. Dentro do modal, clicar numa miniatura ainda **não enviada** → abre o preview local.
6. Com o modal aberto, o lightbox aparece **por cima** dele.

- [ ] **Step 8: Commit**

```bash
git add index.html style.css app.js js/ui/lightbox.js
git commit -m "Abre o print em tela cheia para revisar o setup"
```

---

### Task 9: Excluir operação e Resetar Dados limpam o bucket

**Files:**
- Modify: `app.js` (`handleDeleteTrade`, `resetApp`)

**Interfaces:**
- Consumes: `removeTradeImages`, `removeAllUserImages` da Task 3
- Produces: nenhum arquivo órfão depois de excluir ou resetar

- [ ] **Step 1: Limpar ao excluir a operação**

Em `handleDeleteTrade`, dentro do `try`, **antes** do `await remoteDeleteTrade(id)`:

```js
    // Localiza as imagens antes de a linha sumir do estado
    let imagensDoTrade = [];
    for (const lista of Object.values(state.blocks)) {
      const achado = lista.find((t) => t.id === id);
      if (achado) { imagensDoTrade = achado.images || []; break; }
    }

    if (imagensDoTrade.length) {
      // Órfão no bucket incomoda menos que operação que se recusa a sumir:
      // falha aqui não impede a exclusão
      await removeTradeImages(imagensDoTrade)
        .catch((e) => console.warn('Imagens não removidas do Storage:', e));
    }
```

- [ ] **Step 2: Limpar no Resetar Dados**

Em `resetApp`, dentro do `try`, antes de `await deleteAllTrades(currentUser.id);`:

```js
    await removeAllUserImages(currentUser.id)
      .catch((e) => console.warn('Imagens não removidas no reset:', e));
```

- [ ] **Step 3: Verificar no navegador**

1. Criar operação com 2 imagens → 4 arquivos na sua pasta do bucket.
2. Excluir a operação pelo modal → a pasta fica vazia.
3. Criar 2 operações com imagem, rodar **Resetar Dados** (digitando `DELETAR`) → pasta vazia e diário zerado.
4. Simular falha: no painel do Supabase, apagar o arquivo à mão e depois excluir a operação pelo app → a operação some normalmente e o console mostra o aviso, sem toast de erro para o usuário.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Limpa o bucket ao excluir a operação e ao resetar os dados"
```

---

### Task 10: Aviso no export e documentação

**Files:**
- Modify: `app.js` (`exportData`)
- Modify: `CLAUDE.md` (seção "Conceitos do domínio" e tabela de estrutura)

**Interfaces:**
- Consumes: `state.blocks` com `images`
- Produces: export que informa quantas imagens ficaram de fora; `CLAUDE.md` descrevendo a feature

- [ ] **Step 1: Contar e avisar no `exportData`**

Substituir o corpo de `exportData` por:

```js
function exportData() {
  const todas = Object.values(state.blocks).flat();
  const totalImagens = todas.reduce((soma, t) => soma + (t.images?.length || 0), 0);

  const payload = {
    activeBlockIndex: state.activeBlockIndex,
    blocks: state.blocks,
    userEmail: state.userEmail,
    theme: state.theme,
    plan: state.plan,
    exportedAt: new Date().toISOString(),
    // Os caminhos vão no JSON, mas os arquivos ficam no Storage: reimportar
    // em outra conta traz as operações sem as imagens
    imagensNaoIncluidas: totalImagens
  };
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const a = document.createElement('a');
  a.setAttribute('href', dataStr);
  a.setAttribute('download', `monolith_backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(a); a.click(); a.remove();

  if (totalImagens > 0) {
    toast(`Backup gerado. As ${totalImagens} imagens não vão no arquivo — elas ficam na nuvem.`, 'info');
  }
}
```

- [ ] **Step 2: Documentar no `CLAUDE.md`**

Na tabela "Estrutura", acrescentar:

```markdown
| `js/image-processing.js` | Comprime a imagem escolhida para WebP (1600px + thumb 400px), sem I/O |
| `js/services/trade-images.js` | Upload/remoção no Storage e URLs assinadas em lote (bucket privado) |
| `js/ui/lightbox.js` | Visualização em tela cheia das imagens da operação |
| `tests/image-processing.test.html` | Teste da compressão — abrir no navegador servido por HTTP |
```

Em "Conceitos do domínio", acrescentar:

```markdown
- **Imagens da operação (até 10):** ficam no bucket **privado** `trade-images` do
  Supabase Storage, em `{user_id}/{uuid}.webp`; a linha do trade guarda só os caminhos,
  na coluna `images` (jsonb). São **duas versões por imagem** — `full` (1600px) para o
  lightbox e `thumb` (400px) para o card, senão um bloco cheio baixaria ~10 MB de
  miniaturas. Exibição é sempre por **URL assinada**, pedida em lote por bloco e
  cacheada por 1 h. O upload só acontece ao **salvar** o registro: até lá o arquivo fica
  na memória, então cancelar o modal não deixa lixo no bucket. Excluir operação e
  "Resetar Dados" limpam o Storage — se essa limpeza falhar, a exclusão acontece mesmo
  assim e o aviso vai para o console. **O export JSON não leva as imagens**, só avisa
  quantas ficaram de fora.
```

- [ ] **Step 3: Verificar**

1. Exportar com imagens cadastradas → toast informa a contagem, e o JSON tem `imagensNaoIncluidas` batendo.
2. Exportar sem nenhuma imagem → nenhum toast extra.
3. Importar esse JSON numa conta limpa → operações entram com `images: []`, sem erro.

- [ ] **Step 4: Commit**

```bash
git add app.js CLAUDE.md
git commit -m "Avisa que o backup não leva as imagens e documenta a feature"
```

---

## Verificação final (depois da Task 10)

Roteiro completo, em conta de teste, servido por `python -m http.server 8000`:

- [ ] Subir 1 imagem numa operação nova; conferir card, modal e lightbox
- [ ] Subir 10 imagens; conferir que o botão trava na 11ª
- [ ] Anexar um `.heic` → recusa com a mensagem de conversão
- [ ] Anexar arquivo acima de 15 MB → recusa antes de travar a aba
- [ ] Excluir uma imagem do meio da faixa e salvar → a ordem das outras se mantém
- [ ] Abrir o mesmo diário em duas abas; alterar imagens numa → a outra reflete pelo Realtime
- [ ] Excluir a operação → bucket limpo
- [ ] Resetar Dados → pasta do usuário vazia
- [ ] Repetir o essencial no **tema claro** e numa janela estreita (390px)
- [ ] Rodar `tests/image-processing.test.html` uma última vez: TUDO PASSOU
