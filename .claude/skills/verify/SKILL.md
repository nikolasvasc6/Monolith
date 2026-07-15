---
name: verify
description: Verifica mudanças do Monolith no navegador real com Supabase stubado (sem rede/credenciais). Use ao validar qualquer mudança de UI/fluxo antes de commitar.
---

# Verificar o Monolith localmente (stub + puppeteer)

O app exige login no Supabase; para verificar sem credenciais, sirva o app por
HTTP e intercepte `js/supabase-client.js` com o stub deste diretório
(`stub-supabase-client.js`): cliente falso em memória, com store persistido em
`localStorage` (chave `__stub_db__`) — então **F5 preserva os dados**, o que
permite testar persistência de verdade.

## Receita que funciona

1. Servir o app (raiz do repo): `python -m http.server 8077 &`
2. Driver com `puppeteer-core` (instale via `npm i puppeteer-core` num diretório
   temporário; NÃO adicione node_modules ao repo) apontando para o Chrome do
   sistema: `executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'`,
   `headless: 'new'`, `args: ['--no-sandbox']`.
3. Interceptação:

```js
await page.setRequestInterception(true);
page.on('request', req => {
  if (req.url().includes('/js/supabase-client.js')) {
    req.respond({ status: 200, contentType: 'application/javascript; charset=utf-8', body: STUB });
  } else req.continue();
});
```

4. Boot: aguardar `#app-shell:not(.hidden)` e o overlay `#app-loading` sumir;
   dar ~700ms para os ícones Lucide (CDN).
5. Navegação entre abas: `page.click('[data-tab="..."]')` → conferir
   `.page-section.active`.
6. Toasts: observar `#toast-container` via `waitForFunction` no `textContent`.
7. Conferir o "banco": `JSON.parse(localStorage.getItem('__stub_db__'))` no
   `page.evaluate` (tabelas: `trades`, `user_preferences`, `trading_plans`).
8. Export (download de `data:` URI): CDP
   `Browser.setDownloadBehavior {behavior:'allow', downloadPath}`, clicar
   `#btn-export-data` e ler o `.json` baixado.
9. Import: `input.uploadFile(...)` direto no `#file-import-input` + handler
   `page.on('dialog', d => d.accept())` para os `confirm()`.

## Gotchas

- `confirm()`/`prompt()` do app travam o headless sem o handler de dialog.
- O stub cobre a API usada pelos services: `auth.getSession/refreshSession/
  onAuthStateChange/signOut`, builder `from().select/eq/order/maybeSingle/
  single/insert/update/upsert/delete` e `channel/removeChannel` (no-op).
  Se um service novo usar método novo do SDK, adicione ao stub.
- `favicon.ico` dá 404 no console — pré-existente, ignorar.
- Defina um viewport realista (`page.setViewport({ width: 1440, height: 900 })`);
  o padrão do headless é 800×600. (Em jul/2026 um viewport estreito revelou bug
  real: a página ganhava scroll horizontal e o conteúdo deslizava sob a sidebar
  fixa, que "roubava" cliques — corrigido com `min-width: 0` no `.main-content`
  e `overflow-x: auto` no `.table-container`.)
- Após fechar o modal (Escape), aguarde o fade-out do overlay
  (`pointer-events: none` / `opacity: 0`) antes do próximo clique — durante a
  transição o overlay ainda intercepta cliques.
- Em caminhos Windows dentro de `node -e "..."` no Git Bash, use barras
  normais (`C:/...`); barras invertidas somem no escaping.
