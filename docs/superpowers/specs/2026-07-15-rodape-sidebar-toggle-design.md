# Rodapé da sidebar minimalista (toggle "Opções")

**Data:** 2026-07-15
**Status:** aprovado pelo Nikolas em conversa

## Problema

Os 4 botões do rodapé da sidebar (Exportar Dados, Importar Dados, Resetar Dados, Sair)
são ações raras, mas cada um tem caixa, borda e cor própria — "Resetar" e "Sair" em
vermelho. O conjunto briga visualmente com as ações principais do app.

## Decisão

Trocar os 4 botões por um **acordeão inline**: o rodapé mostra só uma linha discreta
("⚙ Opções" + chevron). Clicar expande as 4 ações como itens de texto sem caixa/borda.

Alternativas descartadas: linha de 4 ícones sem rótulo (pior descoberta) e menu
popover (exige fechar-ao-clicar-fora; complexidade sem ganho num acordeão de sidebar).

## Design

- **`index.html`** — o `.sidebar-footer` ganha um botão de toggle
  (`#btn-footer-menu-toggle`, com `aria-expanded`/`aria-controls`) e os 4 botões +
  input de arquivo são envolvidos em `#sidebar-menu` (colapsável). **IDs existentes
  (`btn-export-data`, `btn-import-data`, `btn-reset-app`, `btn-logout`,
  `file-import-input`) não mudam** — os handlers do `app.js` continuam válidos.
- **`style.css`** — itens viram linhas de texto: sem fundo/borda, alinhados à
  esquerda, cor `--text-secondary`, hover como o dos `.nav-item`. "Resetar Dados" é
  cinza em repouso e só fica vermelho no hover. Colapso animado com o truque de grid
  `0fr → 1fr`; chevron rotaciona 180°. Estado inicial sempre fechado, sem persistência.
- **`auth.css`** — remove a regra `.btn-sidebar-action.btn-logout` (vermelho do
  "Sair"), que fica morta com as classes novas.
- **`app.js`** — handler pequeno: clique no toggle alterna `.open` no rodapé e
  atualiza `aria-expanded`. Sem fechar-ao-clicar-fora (é acordeão, não popover).

## Verificação

Skill `verify` do projeto (navegador real com Supabase stubado): toggle
abre/fecha, os 4 fluxos continuam funcionando, visual ok em tema dark e light.
