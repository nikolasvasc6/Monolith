# CLAUDE.md — Monolith

> ⚠️ **Nomes:** o produto aparece como **"Monolith"** na UI; a pasta e o repositório
> GitHub (`nikolasvasc6/Monolith`) também se chamam assim (até jul/2026 ambos eram
> `trades777`). **"PositionPips"** em comentários antigos (`config.js`, `schema.sql`)
> é o mesmo app. Subtítulo de marca na interface: *Excelência Trading*.
> Site publicado: https://nikolasvasc6.github.io/Monolith/

## O que é

App web de **diário de trading** + **calculadoras de gestão de risco**, com sincronização
na nuvem entre dispositivos. Single-page app em **HTML/CSS/JavaScript vanilla (ES Modules)**,
**sem build step** — roda direto no navegador e em GitHub Pages. Backend em **Supabase**
(Auth + Postgres + Realtime).

## Como rodar

- **Sem build e sem npm.** São arquivos estáticos. Como usa ES Modules, **não abra via
  `file://`** — sirva por HTTP local:
  - `python -m http.server 8000` na raiz do projeto → http://localhost:8000
  - ou a extensão **Live Server** do VS Code.
- **Deploy:** GitHub Pages (estático). O repositório já tem `git` com remote `origin`.

## Stack (tudo via CDN, sem dependências locais)

- **Supabase JS v2** — `@supabase/supabase-js@2/+esm` (jsDelivr)
- **Chart.js** — gráfico de performance acumulada
- **Lucide** — ícones
- **Google Fonts** — Inter, Plus Jakarta Sans

## Estrutura

| Arquivo | Papel |
|---------|-------|
| `index.html` | Markup de todas as telas: auth, diário, 4 calculadoras, modal de operação |
| `app.js` | Orquestrador (ES Module): estado, render, CRUD, calculadoras, tema, export/import |
| `js/config.js` | `SUPABASE_URL` + `anon key` (pública por design — protegida por RLS) |
| `js/supabase-client.js` | Singleton do cliente Supabase |
| `js/auth.js` | Wrapper de Supabase Auth (signup/signin/signout/sessão); erros traduzidos p/ pt-BR |
| `js/ui/auth-ui.js` | UI da tela de login/cadastro |
| `js/services/trades.js` | CRUD + Realtime da tabela `trades` |
| `js/services/preferences.js` | SELECT/UPDATE de `user_preferences` (tema + bloco ativo) |
| `js/image-processing.js` | Comprime a imagem escolhida para WebP (1600px + thumb 400px), sem I/O |
| `js/services/trade-images.js` | Upload/remoção no Storage e URLs assinadas em lote (bucket privado) |
| `js/ui/lightbox.js` | Visualização em tela cheia das imagens da operação |
| `js/ui/ocultar-valores.js` | Modo privacidade: máscara `•••••` sobre os valores sensíveis, estado no `localStorage` |
| `tests/image-processing.test.html` | Teste da compressão — abrir no navegador servido por HTTP |
| `tests/ocultar-valores.test.html` | Teste da máscara de valores — abrir no navegador servido por HTTP |
| `style.css`, `auth.css` | Estilos, com tema dark/light |
| `supabase/schema.sql` | Schema idempotente (tabelas, triggers, RLS, realtime) p/ colar no SQL Editor |

## Modelo de dados (Postgres / Supabase)

- **`trades`** — `id` (uuid), `user_id`, `block_index` (≥1), `position` (0–34), `asset`,
  `type` (`'take'` | `'stop'` | `'zero'`), `pnl` `numeric(18,2)`, `trade_date`, `notes`,
  `images` (jsonb, no máximo 10 — ver "Imagens da operação" abaixo),
  `risk_reward` (`numeric(6,2)`, **nullable**: guarda só o lado do retorno, normalizado
  para risco 1, então `3` é 3:1; nulo quer dizer "não informado", nunca zero), timestamps.
  Índice **único** em `(user_id, block_index, position)` — garante no banco o limite de
  35 por bloco (estado defasado de outra aba/dispositivo não consegue gravar uma 36ª).
- **`user_preferences`** — `user_id` (PK), `active_block_index`, `theme` (`'dark'`|`'light'`),
  `updated_at`.
- **Triggers:** `updated_at` automático; criação automática da linha em `user_preferences`
  quando um usuário se registra (`handle_new_user`).
- **RLS:** cada usuário só lê/escreve os próprios dados (`auth.uid() = user_id`). Realtime
  habilitado nas duas tabelas.

## Conceitos do domínio

- **Bloco de 35 operações** (`TRADES_PER_BLOCK = 35`): o diário agrupa trades em blocos de
  35; ao completar um bloco, o próximo abre automaticamente. A UI navega entre blocos.
  Posições são contíguas (0..n-1): excluir renumera as seguintes no banco, e a autocura
  no carregamento (`healBlockLayout`) reflui excedentes de blocos com mais de 35 para o
  bloco seguinte. Importar entra sempre **depois** do último bloco usado.
- **`take` / `stop` / `zero`:** `take` = lucro (pnl positivo), `stop` = prejuízo (pnl
  gravado negativo), `zero` = **0x0**, operação encerrada no preço de entrada, com pnl
  sempre 0. No modal o usuário digita o **valor absoluto**; o sinal vem do tipo. No 0x0 o
  campo de valor **trava em 0,00**, e o que estava digitado volta se ele trocar o tipo de
  novo (guardado em `dataset.valorAntesDoZero`) — `form.reset()` não desfaz `disabled`,
  então `openTradeModal` destrava sempre antes de reaplicar o modo.
  **No card do grid o 0x0 mostra o rótulo `0 x 0` no lugar do valor** — `$0.00` se lê como
  um resultado medido, e o empate é ausência de resultado. **Na tabela o valor continua**
  (`$0.00`, em neutro), porque lá a coluna *Tipo* já carrega o `0x0` e repetir o rótulo na
  coluna de resultado deixaria a linha dizendo a mesma coisa duas vezes. (Decisão do
  Nikolas, 2026-07-27 — o design original mandava só apagar a cor do valor no card.)
- **KPIs:** operações registradas, resultado acumulado, win rate, média por operação. O
  gráfico é a **soma acumulada** do P&L do bloco. O **0x0 fica fora do denominador do win
  rate** (`takes ÷ (total − zeros)`) — empate não é acerto nem erro —, mas continua
  contando nas operações registradas e na média por operação, porque ocupou um slot do
  bloco. Bloco sem nenhuma operação decidida mostra `—`, não `0%`, e saldo/média
  exatamente zero saem **sem sinal e sem cor** — é assim que o zero neutro se distingue
  do lucro e do prejuízo.
- **Acumulado e média não têm linha de indicador** (ago/2026). "Saldo positivo",
  "Média negativa" e companhia repetiam o que o sinal e a cor do valor já diziam, e
  custavam uma linha em cada card. **Win rate mantém a dele** (`3 de 5 vitoriosos`),
  que não é redundante: informa a base do cálculo, invisível no percentual. Vale nas
  duas telas — Diário e Dashboard.
- **Calculadoras de risco** (não persistem nada): Forex (lote por pip), Futuros EUA/CME,
  B3 (WIN/IND/WDO/DOL) e BTC CFD. Todas dimensionam a posição **arredondando para baixo**
  para nunca ultrapassar o risco definido.
- **Forex além dos pares:** o seletor da Calculadora Forex também tem XAU/USD e o CFD de
  índice USTEC/Nasdaq 100 (**1 pip = 0,1 ponto do índice → $0,10 por lote**). Para esses,
  `isForexNonCurrencyAsset()` tira a menção a "lote padrão" no rótulo do valor do pip —
  não existe lote de 100.000 unidades fora de par de moedas. Ao adicionar um ativo que não
  seja par de moedas, registre-o em `INDEX_CFD_SPECS` (índice, com valor do pip) ou em
  `FX_NON_CURRENCY_ASSETS`.
- **O painel de resultado do Forex é enxuto de propósito:** risco máximo, valor do pip,
  tamanho do lote e risco estimado. "Lotes mini/micro" e "Unidades totais" saíram em
  2026-07-26 (eram o tamanho do lote com a vírgula deslocada). **Não reintroduzir.**
- **Valor do pip vem de tabela, não de cotação ao vivo** (`FX_PIP_VALUE_PER_LOT`): pares
  XXX/USD valem $10 por pip sempre, e os que têm iene, franco ou dólar canadense na
  cotação dependem do câmbio — esses ficam gravados com um câmbio de referência datado em
  `FX_QUOTES_DATE`, citado no rodapé da calculadora. **Esse número envelhece:** revise
  quando o câmbio andar muito, recalculando pelas fórmulas do comentário sobre a tabela.
  Par que não estiver na tabela faz a calculadora **recusar o cálculo** em vez de assumir
  $10 — o bug anterior (até 2026-07-26) era justamente um preço fixo de 1,085 que passava
  despercebido e fazia o USD/JPY reportar $921,66 por pip e o USD/CHF estourar o risco
  em 35%.
- **Imagens da operação (até 10):** ficam no bucket **privado** `trade-images` do
  Supabase Storage, em `{user_id}/{uuid}.webp`; a linha do trade guarda só os caminhos,
  na coluna `images` (jsonb). São **duas versões por imagem** — `full` (1600px) para o
  lightbox e `thumb` (900px, mesma qualidade da full) para o card, senão um bloco cheio
  baixaria a `full` 35 vezes. A thumb foi **400px/q0.70 até jul/2026** e saía borrada no
  card: com `object-fit: cover`, a faixa de 216px do card renderiza a imagem a ~251px
  CSS, que numa tela DPR 2 são ~500px reais — a de 400 era ampliada para caber. Ao mexer
  na largura do card (`--largura-card-trade`), refaça essa conta: quem define a
  resolução mínima da thumb é a largura do card vezes o DPR, não o tamanho do arquivo
  original. **Imagem já enviada mantém a thumb com que foi criada** — melhorar o alvo só
  vale para envios novos. Exibição é sempre por **URL assinada**, pedida em lote por bloco e
  cacheada por 1 h. O upload só acontece ao **salvar** o registro: até lá o arquivo fica
  na memória, então cancelar o modal não deixa lixo no bucket. Excluir operação e
  "Resetar Dados" apagam **primeiro no banco**, sempre; a limpeza do Storage só roda
  depois, e se falhar o aviso vai só para o console — a exclusão já aconteceu de
  qualquer jeito. A ordem é essa e não o inverso **de propósito**: apagar do Storage
  antes deixaria, se o delete no banco falhasse, uma operação viva apontando para um
  arquivo que já não existe mais. **O export JSON não leva as imagens**, só avisa
  quantas ficaram de fora.
- **Ocultar valores (modo privacidade):** o botão de olho no Diário e no Dashboard troca
  todo valor sensível das duas páginas por `•••••` — acumulado, win rate, média, o
  indicador do win rate (`3 de 5 vitoriosos`), o resumo do gráfico, o eixo Y e o
  tooltip, o valor do card e a coluna de resultado da tabela. **"Operações registradas"
  e "Trades: N" ficam visíveis**: dizem quanto do bloco foi preenchido, não como você
  foi, e são o que permite continuar usando o app com os valores fechados. **Cor é
  valor** — no modo ativo a máscara sai neutra, o realce `win-trend`/`loss-trend` do card
  fica suspenso e a linha do gráfico vai de cinza; a supressão é CSS sob
  `body.valores-ocultos` porque `updateKPIs` reescreve `className` a cada render.
  **A cor take/stop dos 35 cards do grid permanece**, e isso é deliberado: neutralizar
  tudo vira uma parede cinza ilegível. Como **"Operações registradas" continua visível**
  junto dos cards coloridos, o win rate é **dedutível por contagem** (verdes ÷ (verdes +
  vermelhos)), não uma estimativa — o que o modo de fato fecha é **a magnitude**:
  acumulado, média, valor de cada operação. Fica no `localStorage`
  (`monolith:valores-ocultos`), **não** no `user_preferences`: privacidade é propriedade
  de onde você está, não de quem você é. Calculadoras, modal e export JSON ficam fora.
  **Limitação conhecida:** duas abas abertas não sincronizam o estado do modo entre si —
  ocultar numa deixa a outra à mostra.

## Convenções ao trabalhar aqui

- **Mantenha vanilla JS + ES Modules, sem framework e sem build** (compatível com GitHub Pages).
- **O card do diário tem largura fixa (`--largura-card-trade`, 216px), não coluna `1fr`.**
  Quem decide quantas colunas o grid tem é quantos cards cabem (`auto-fill`), e a sobra
  vira margem — não largura de card. Com `repeat(N, 1fr)` o card esticava junto com a
  janela (em 1920 ia a 307×368) e o bloco virava uma parede de cards enormes. Abaixo de
  1100px a coluna volta a ser fluida, porque aí a largura fixa desperdiçaria faixas
  inteiras. **Não reintroduza degrau de número de colunas por breakpoint.**
- **O grid para em 5 colunas, e o teto é um `max-width`, não um `repeat(5, ...)`.**
  São 35 operações por bloco, então 5 colunas fecham **7 linhas cheias**, sem última
  linha pela metade — daí o número. O teto sai de `--colunas-card-trade` e vale em
  qualquer tela (medido: 5 colunas tanto em 1920 quanto em 2560; sem ele o `auto-fill`
  abria 6 em 1920). Travar a **largura da faixa** é o que preserva o card em 216px:
  fixar a *contagem de colunas* o faria esticar de novo, que é o defeito de jul/2026.
  Se um dia `TRADES_PER_BLOCK` mudar, revise o 5 junto — os dois números andam casados.
- **A página tem uma coluna de conteúdo só, e ela é a faixa do bloco de 35.**
  `--largura-conteudo` (1128px = 5 × 216 + 4 × 12) centraliza toda `.page-section`;
  cabeçalho, KPIs, gráfico, barra de controle, grid e tabela compartilham a mesma borda.
  Antes (até ago/2026) só o grid era centralizado e o resto esticava até o fim da janela,
  o que dava à página duas bordas esquerdas. Três detalhes que não são enfeite:
  o `max-width` **soma o padding** (`box-sizing: border-box` o desconta da faixa útil —
  sem somar, o `auto-fill` cairia de 5 colunas para 4); o `width: 100%` impede que a seção
  estoure o pai (item flex com margem auto no eixo transversal para de esticar e vira
  scroll horizontal em janela < 1192px); e a **topbar fica de fora**, de propósito.
  Página nova **não cria centralização própria** — herda a da `.page-section`.
- **Todo texto de UI e mensagens de erro em pt-BR.**
- **Toda I/O de dados passa pelos serviços** (`js/services/*`) — não chame `supabase`
  diretamente do `app.js`.
- **Chamada ao SDK do Storage devolve `{ data, error }` e nunca rejeita** — inclusive em
  falha de rede, que vem dentro de `error`. Um `.catch()` nela é **código morto** e a
  falha some sem rastro; desestruture `error` e trate. Prefira passar pelos wrappers de
  `js/services/trade-images.js`, que convertem em `throw` — foi ao chamar o Storage cru
  que um log de órfã virou linha morta.
- **Estado mutável de módulo lido depois de um `await` precisa de retrato antes do `try`.**
  Foi o defeito mais caro deste app: cinco perdas de dado graves na feature de imagens,
  todas do mesmo formato — `modalImagens`, `imagensOriginaisDoModal` e índices de
  `state.blocks` lidos depois da espera, quando o usuário (ou o Realtime, que **substitui**
  `state.blocks` inteiro) já tinha mudado aquilo. Vale para qualquer fluxo assíncrono aqui:
  tire o retrato antes do primeiro `await` e trabalhe sobre ele; para achar um registro
  depois da espera, **refaça a busca por `id`**, nunca reaproveite índice. E **nunca apague
  arquivo do Storage antes de o estado de destino estar confirmado no banco** — arquivo
  órfão incomoda menos que operação viva apontando para arquivo que não existe mais.
- **snake_case no banco ↔ camelCase no app:** o banco usa `block_index`/`trade_date`; o app
  usa `blockIndex`/`date`. A ponte é a função `rowToTrade()` em `js/services/trades.js` —
  ao adicionar/renomear um campo, atualize os **dois lados**.
- **Valor sensível novo na tela nasce por `escreverValor()`** (`js/ui/ocultar-valores.js`),
  nunca por `el.textContent =`. Em HTML de template string, emita
  `data-valor-real="${escapeHTML(texto)}"` e chame `aplicarOcultacao(container)` ao final
  do render. **A fonte da verdade é o atributo, jamais o texto que está na tela:** mascarar
  lendo o `textContent` grava `•••••` por cima do valor real na segunda passada e o número
  se perde até o próximo fetch — foi por isso que a máscara nasceu idempotente.

## Segurança / cuidados

- A `anon key` em `config.js` é **pública** (ok ir para o GitHub). **Nunca** coloque a
  `service_role` key no frontend.
- **"Resetar Dados"** apaga **todas** as operações do usuário na nuvem — pede confirmação
  dupla (incluindo digitar `DELETAR`). Trate com cuidado ao mexer nesse fluxo.
