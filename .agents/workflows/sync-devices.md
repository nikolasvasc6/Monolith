---
description: armazenar dados
---

Quero transformar meu aplicativo atual em uma aplicação com persistência de dados online e sincronização entre dispositivos.

Objetivo principal:

* Todos os dados salvos no app devem ficar armazenados na nuvem.
* O usuário deve conseguir acessar os mesmos dados em qualquer dispositivo.
* O app será hospedado no GitHub Pages.
* Use obrigatoriamente o Supabase como backend.
* O projeto deve funcionar corretamente mesmo sendo hospedado como site estático no GitHub Pages.
* Priorize simplicidade, segurança, organização e facilidade de manutenção.

Quero que você atue como um engenheiro de software sênior especialista em:

* Frontend web
* Arquitetura SaaS
* Supabase
* GitHub Pages
* Persistência de dados
* Autenticação
* Segurança
* JavaScript/TypeScript
* Banco de dados PostgreSQL

Sua tarefa é:

1. Analisar a estrutura atual do aplicativo.
2. Identificar exatamente onde os dados atualmente estão sendo salvos localmente.
3. Migrar toda persistência local para o Supabase.
4. Criar uma arquitetura limpa e escalável.
5. Garantir que os dados sincronizem automaticamente entre dispositivos.
6. Manter compatibilidade total com GitHub Pages.
7. Implementar autenticação de usuários utilizando Supabase Auth.
8. Garantir que cada usuário visualize apenas os próprios dados.
9. Implementar Row Level Security (RLS) corretamente.
10. Criar o SQL completo das tabelas necessárias.
11. Explicar exatamente onde devo colocar cada variável e configuração.
12. Criar um passo a passo extremamente detalhado de:

* criação do projeto no Supabase
* criação das tabelas
* configuração das policies
* obtenção das chaves
* integração frontend
* deploy no GitHub Pages

Requisitos técnicos obrigatórios:

* Usar Supabase JS SDK mais recente.
* Usar PostgreSQL do Supabase.
* Persistência em tempo real quando necessário.
* Código modularizado e organizado.
* Separar:

  * configuração do Supabase
  * serviços de banco
  * autenticação
  * lógica da aplicação
* Não usar backend próprio, servidor Node.js ou VPS.
* Tudo deve funcionar apenas com:

  * frontend estático
  * GitHub Pages
  * Supabase

Quero que você:

* modifique os arquivos existentes corretamente;
* crie novos arquivos quando necessário;
* preserve funcionalidades atuais;
* não remova recursos já existentes;
* explique todas as alterações realizadas;
* forneça código completo, nunca pseudo-código;
* forneça código pronto para produção;
* siga boas práticas modernas;
* trate erros adequadamente;
* implemente loading states;
* implemente validações;
* implemente tratamento de sessão autenticada;
* implemente logout;
* implemente recuperação automática de sessão;
* implemente proteção contra acesso indevido aos dados.

Fluxo esperado:

1. Usuário cria conta/login.
2. Usuário salva dados no app.
3. Dados ficam armazenados no Supabase.
4. Ao acessar em outro dispositivo e fazer login:

   * todos os dados aparecem automaticamente.

Quero também:

* sugestões de melhorias de arquitetura;
* sugestões de performance;
* sugestões de segurança;
* sugestões de escalabilidade futura;
* sugestões de organização de código.

Formato da resposta:

1. Diagnóstico do app atual
2. Estratégia de migração
3. Estrutura ideal de pastas
4. SQL completo do Supabase
5. Configuração do Supabase
6. Código completo dos arquivos
7. Explicação detalhada das alterações
8. Guia completo de deploy no GitHub Pages
9. Checklist final de validação
10. Melhorias futuras recomendadas

Importante:

* Nunca assuma detalhes sem analisar os arquivos do projeto.
* Se faltar alguma informação, investigue os arquivos primeiro.
* Antes de modificar qualquer coisa, explique a arquitetura atual encontrada.
* Sempre preserve compatibilidade com GitHub Pages.
* Sempre priorize segurança dos dados dos usuários.
* Sempre implemente RLS corretamente.
* Sempre explique como testar tudo localmente e em produção.
* Sempre entregue código pronto para copiar e usar.
