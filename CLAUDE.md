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
| `tests/image-processing.test.html` | Teste da compressão — abrir no navegador servido por HTTP |
| `style.css`, `auth.css` | Estilos, com tema dark/light |
| `supabase/schema.sql` | Schema idempotente (tabelas, triggers, RLS, realtime) p/ colar no SQL Editor |

## Modelo de dados (Postgres / Supabase)

- **`trades`** — `id` (uuid), `user_id`, `block_index` (≥1), `position` (0–34), `asset`,
  `type` (`'take'` | `'stop'`), `pnl` `numeric(18,2)`, `trade_date`, `notes`,
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
- **`take` / `stop`:** `take` = lucro (pnl positivo), `stop` = prejuízo (pnl gravado
  negativo). No modal o usuário digita o **valor absoluto**; o sinal vem do tipo.
- **KPIs:** operações registradas, resultado acumulado, win rate, média por operação. O
  gráfico é a **soma acumulada** do P&L do bloco.
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

## Segurança / cuidados

- A `anon key` em `config.js` é **pública** (ok ir para o GitHub). **Nunca** coloque a
  `service_role` key no frontend.
- **"Resetar Dados"** apaga **todas** as operações do usuário na nuvem — pede confirmação
  dupla (incluindo digitar `DELETAR`). Trate com cuidado ao mexer nesse fluxo.
