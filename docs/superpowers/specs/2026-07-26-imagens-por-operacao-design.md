# Imagens por operação no Diário

**Data:** 2026-07-26
**Status:** aprovado pelo Nikolas em conversa

## Problema

O diário registra o número da operação, mas não o gráfico. Revisar um trade depois
depende de lembrar o setup — o print, que é a evidência do que foi visto na hora,
mora fora do app (pasta de screenshots, celular) e se desconecta da operação.

Cada operação passa a aceitar **até 10 imagens**, visíveis como miniatura no card do
bloco e ampliáveis para leitura do gráfico.

## Decisão

**Supabase Storage, bucket privado.** Descartado guardar base64 na linha do trade: o
app faz `select('*')` de todas as operações no boot (`fetchAllTradesByBlock`), então
imagem dentro da linha seria baixada inteira a cada abertura do app, com 33% de inchaço
do base64 e o banco free (500 MB) enchendo rápido. Descartado também só aceitar link
externo — dá trabalho manual a cada operação e o histórico quebra quando o link sai do ar.

**Vínculo por coluna `images` (jsonb) em `trades`**, não por tabela filha. O app já
busca as operações num select só; os caminhos vêm de carona, sem requisição nova, sem
segundo canal de Realtime e sem um segundo conjunto de políticas RLS para manter em
sincronia. Tabela filha só se pagaria se as imagens tivessem vida própria (busca por
imagem, reuso entre operações), que não é o caso. Descartado derivar do Storage sem
schema: num grid de 35 cards viraria uma listagem por card, sem ordem estável.

**Compressão no navegador, WebP até 1600px.** Print de gráfico continua legível, o
upload funciona no 4G e a cota de 1 GB rende ~5× mais. O arquivo original exato não é
preservado — troca aceita conscientemente.

**Duas versões por imagem:** `thumb` de 400px para o card e `full` de 1600px para o
lightbox. Sem isso, um bloco cheio baixaria ~10 MB em miniaturas contra ~1 MB — e o
plano free dá 5 GB de banda por mês. Custo: dobra a contagem de arquivos no bucket.

**Bucket privado com URL assinada**, não público com nome aleatório. São prints do
diário pessoal; a simplicidade do bucket público não paga o acesso por link a quem o
obtiver.

## Design

### Schema (`supabase/schema.sql`, idempotente como o resto do arquivo)

```sql
alter table public.trades
  add column if not exists images jsonb not null default '[]'::jsonb;

alter table public.trades drop constraint if exists trades_images_max;
alter table public.trades add constraint trades_images_max
  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 10);
```

Item do array: `{ "full": "<caminho>", "thumb": "<caminho>", "w": 1600, "h": 900 }`.
`w`/`h` são as dimensões da versão `full`, gravadas para o card e o lightbox reservarem
a proporção antes de a imagem chegar — sem isso o layout pula quando ela carrega.
A **ordem do array é a ordem de exibição**, e a primeira imagem é a que vira miniatura
no card.

O limite de 10 fica **nos dois lados** — o app esconde o botão ao chegar em 10, e o
`check` recusa caso o app erre.

### Storage

Bucket `trade-images`, **privado**. Caminho `{user_id}/{uuid}.webp` e
`{user_id}/{uuid}_thumb.webp` — sem pasta por operação, porque numa operação nova o
`trade_id` só existe depois do insert e prendê-lo ao caminho forçaria gravar duas
vezes. O vínculo é o jsonb; a pasta do usuário é a única hierarquia que a política
precisa conhecer.

Políticas em `storage.objects` espelham o RLS da tabela: select/insert/update/delete
apenas onde `bucket_id = 'trade-images'` e
`(storage.foldername(name))[1] = auth.uid()::text`.

### Módulos novos

Toda I/O passa por `js/services/`, como manda a convenção do projeto.

- **`js/services/trade-images.js`** — único ponto que fala com o Storage: sobe as duas
  versões, remove por caminho, gera URLs assinadas **em lote** (`createSignedUrls`,
  validade de 1 h, cache em memória invalidado por caminho) e limpa a pasta do usuário.
  O grid pede as URLs de uma vez por bloco, não uma por card.
- **`js/image-processing.js`** — redimensiona e converte para WebP via canvas, gerando
  `thumb` e `full`. Sem I/O e sem dependência externa, é a parte que dá para exercitar
  isolada.
- **`js/ui/lightbox.js`** — abre em tela cheia, navega entre as imagens com as setas,
  fecha no Esc. Não sabe nada de Supabase: recebe uma lista de URLs e um índice.

No `app.js` entram só os pontos de costura — `openTradeModal` carrega as imagens
existentes, `handleSaveTrade` sobe antes de gravar, `handleDeleteTrade` limpa. O
arquivo já tem 1399 linhas; a lógica nova não engorda ele.

### Fluxo do upload

Escolher o arquivo mostra o preview local na hora (`URL.createObjectURL`) e mantém o
arquivo **só na memória**. O envio acontece ao clicar em **Salvar Registro**: comprime,
sobe as duas versões, grava a linha com os caminhos. Fechar o modal no meio não deixa
lixo no bucket, porque nada subiu. O botão mostra progresso ("Enviando 2 de 3…"); se um
upload falhar, **nada é gravado** e o modal continua aberto para nova tentativa.

### UI

- **Modal:** seção "Imagens da operação (até 10)" abaixo das observações, com faixa de
  miniaturas, "x" para remover cada uma e o botão de adicionar.
- **Card do bloco:** a thumb da **primeira** imagem entra como faixa no topo, com altura
  fixa — o card mantém a altura dos vizinhos e o grid não muda de forma. Card sem imagem
  fica igual ao de hoje. Clicar no card segue abrindo o modal; clicar na miniatura abre
  o lightbox direto, já posicionado nessa imagem — nos dois lugares, card e modal.

### Exclusão e limpeza

Excluir uma operação remove os arquivos listados no jsonb **antes** da linha. Se a
remoção falhar, a linha é apagada mesmo assim e a falha vai para o console — um arquivo
órfão incomoda menos que uma operação que se recusa a sumir. O **Resetar Dados** passa a
limpar a pasta inteira do usuário no bucket; sem isso, apagaria as operações e deixaria
todos os prints ocupando a cota.

### Export / Import

O JSON **não inclui** as imagens e passa a dizer quantas ficaram de fora, com a nota de
que elas vivem na nuvem. O backup real das imagens é o próprio Supabase. JSON exportado
antes desta mudança importa normal — a coluna nasce com `[]`.

## Casos de borda

- **Arquivo > 15 MB:** recusado antes de decodificar; decodificar um arquivo enorme
  trava a aba.
- **HEIC (padrão da câmera do iPhone):** não decodifica no Chrome nem no Firefox. O app
  avisa em vez de falhar em silêncio.
- **Imagem menor que 1600px:** não é ampliada, só convertida.
- **URL assinada expirada** (app aberto o dia todo): o `<img>` que falhar pede uma URL
  nova e tenta **uma** vez — resolve tanto a expiração quanto uma falha de rede pontual.
- **Realtime:** editar a mesma operação em outro dispositivo já dispara UPDATE e
  re-renderiza o bloco; o cache de URLs é invalidado por caminho, então imagem removida
  em outro lugar não fica fantasma na tela.

## Verificação

**`image-processing.js` isolado**, no navegador: gera imagem sintética, comprime e
confere dimensão, tipo e peso das duas versões — incluindo imagem menor que o alvo,
arquivo gigante e formato recusado.

**Roteiro manual no app real** (conta de teste): subir 1 imagem; subir 10; tentar a
11ª; excluir uma do meio; abrir o lightbox e navegar; excluir a operação e conferir que
o bucket ficou limpo; rodar o Resetar Dados.

## Fora de escopo

Colar print com Ctrl+V, arrastar e soltar, reordenar imagens, legenda por imagem e
qualquer edição/marcação. O Ctrl+V é o mais tentador — é o gesto natural depois de
recortar um gráfico — e encaixa em poucas linhas depois, se fizer falta no uso.
