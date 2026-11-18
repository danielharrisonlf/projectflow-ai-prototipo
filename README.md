# ProjectFlow AI — Protótipo navegável

Protótipo de alta fidelidade da plataforma de gestão de projetos **ProjectFlow AI**,
cobrindo os dois ambientes do produto — **Workspace** (futuro frontend React) e
**Insights** (futuro frontend Vue 3) — em HTML, CSS e JavaScript puros, com dados
simulados. Acompanha um **servidor MCP real em NestJS** ([`mcp-server/`](mcp-server/README.md))
que expõe as mesmas regras de negócio a agentes de IA (Claude Code, Claude Desktop, MCP Inspector…).

> Este protótipo valida regras de negócio, fluxos e experiência de uso. Ele não
> substitui a implementação acadêmica definitiva em React e Vue.

## Início rápido

### Pré-requisitos

| Para | Precisa de |
|---|---|
| Usar o protótipo | Só um navegador moderno — Chrome/Edge 123+, Firefox 120+ ou Safari 17.5+ (o CSS usa `light-dark()`) |
| Rodar o servidor MCP | [Node.js](https://nodejs.org) **20.19 ou superior** (testado no 24) e npm |
| Clonar | Git |

### 1. Clonar

```bash
git clone https://github.com/danielharrisonlf/projectflow-ai-prototipo.git
cd projectflow-ai-prototipo
```

### 2. Abrir o protótipo (sem instalar nada)

Abra `index.html` com duplo clique — não há build nem dependências. Se preferir servir por HTTP:

```bash
npx http-server .        # ou: python -m http.server 8080
```

e acesse o endereço mostrado no terminal (ex.: `http://localhost:8080`). Os dados são simulados e ficam
no `localStorage` do navegador; troque de perfil pelo seletor no canto superior direito. A única
dependência externa é a fonte IBM Plex (Google Fonts); sem internet o protótipo usa a fonte do sistema.

### 3. Rodar o servidor MCP (opcional)

```bash
cd mcp-server
npm ci                 # instala as dependências exatas do package-lock
npm run build          # gera dist/main.js (HTTP) e dist/stdio.js (stdio)

npm start              # HTTP em http://localhost:3333/mcp  (saúde: http://localhost:3333/health)
# ou
npm run start:stdio    # stdio, para clientes que iniciam o processo
```

O estado do servidor é criado em `mcp-server/data/state.json` na primeira execução, a partir do mesmo
seed do protótipo (`js/data.js`). Variáveis de ambiente (`PORT`, `PF_USER`, `PF_DATA_FILE`, `PF_TOKENS_FILE`…)
estão em [`mcp-server/README.md`](mcp-server/README.md#configuração-variáveis-de-ambiente).

### 4. Conectar um agente

**Claude Code (stdio, já configurado):** o [`.mcp.json`](.mcp.json) da raiz registra o servidor
`projectflow`. Depois do passo 3 (o `dist/` não vai para o git), abra o Claude Code **na raiz do
repositório** e aprove o servidor quando ele perguntar. O agente atua como o gestor Ricardo Nogueira;
para outro perfil, troque `PF_USER` no `.mcp.json` (id ou e-mail de um usuário do seed).

**Claude Code (HTTP):** com `npm start` rodando,

```bash
claude mcp add --transport http projectflow-http http://localhost:3333/mcp \
  --header "Authorization: Bearer pf-demo-gestor-5b81f0c6aa"
```

**MCP Inspector (para explorar as ferramentas):**

```bash
npx @modelcontextprotocol/inspector node mcp-server/dist/stdio.js
```

Os tokens de demonstração por perfil (admin, gestor, líder, dev, auditor) e seus scopes estão em
[`mcp-server/config/tokens.demo.json`](mcp-server/config/tokens.demo.json). **São públicos de propósito
— não os use fora da demonstração.** Como trocar por JWT/OAuth real está em
[`mcp-server/README.md`](mcp-server/README.md#autenticação-em-produção).

### 5. Rodar os testes do servidor

```bash
cd mcp-server
npm run typecheck && npm run lint
npm test               # unitários + integração com cliente MCP em memória
npm run test:e2e       # HTTP real (OAuth, Origin/Host) e stdio real — exige npm run build antes
```

## Estrutura do repositório

```
index.html, styles.css, js/   protótipo (HTML/CSS/JS puros, sem build)
  js/data.js                  seed determinístico — fonte única dos dados (também usado pelo servidor MCP)
  js/core.js                  estado, permissões, regras, auditoria, eventos e webhooks simulados
  js/views-*.js               telas do Workspace, integrações e Insights
mcp-server/                   servidor MCP em NestJS 12 + @nestjs/mcp (TypeScript, ESM)
.mcp.json                     registro do servidor stdio para o Claude Code
DESIGN.md                     design system: tokens, componentes, padrões e acessibilidade
docs/                         mapeamento de implementação, auditoria e relatório de validação
```

## Telas disponíveis

**ProjectFlow Workspace**
- Início (dashboard operacional: KPIs com tendência, filtros rotulados por período, projeto, equipe e responsável)
- Projetos (favoritos por pessoa, filtro de status com **Arquivados** e ação **Desarquivar** para quem pode arquivar) · detalhe do projeto (visão geral, tarefas, membros, configurações)
- Minhas tarefas · Equipes
- Kanban (drag-and-drop ou **Alt+←/→** no card focado, filtros em chips removíveis pelo botão Filtro, ordenação, criação rápida, indicadores de atraso/bloqueio)
- Backlog · Sprints (planejar, iniciar, encerrar, associar tarefas; **uma sprint ativa por projeto**) · Cronograma (gantt com marcos)
- Assistente de IA (análises + planejamento assistido com proposta revisável)
- Agentes MCP (ferramentas, console de teste, agentes, histórico de execuções)
- Webhooks (assinaturas, segredo HMAC, **Histórico de envios** com tentativas e reenvio, catálogo de eventos)
- Notificações (histórico multicanal, preferências, templates, provedores). Cada pessoa vê as notificações enviadas a ela; Administrador e perfis com auditoria (Gestor, Visualizador/Auditor) veem as de toda a organização
- Usuários e permissões (convites, papéis, matriz de capacidades)
- Configurações (tema, arquitetura simulada, restauração dos dados — só Administrador)

**ProjectFlow Insights**
- Visão executiva (KPIs, evolução de entregas, distribuição por status, situação dos projetos, prazos por equipe)
- Análise de projetos (comparação, sprints, progresso por equipe, gargalos, dependências críticas)
- Central de auditoria (filtros por usuário/projeto/ação/origem/entidade/período; diff de valores anteriores → novos; evento emitido)

## Perfis de demonstração

Troque pelo seletor no canto superior direito — sem recarregar a página. Favoritos são
preferência de cada pessoa (não geram auditoria):

| Perfil | Usuário | O que muda |
|---|---|---|
| Administrador da organização | Helena Costa | tudo visível, gerencia usuários, webhooks e integrações |
| Gestor de projetos | Ricardo Nogueira | cria projetos/sprints, aplica IA, auditoria; não gerencia usuários |
| Líder de equipe | Ana Souza | escopo das próprias equipes; gerencia integrantes da equipe |
| Desenvolvedor | Camila Freitas | só projetos das suas equipes; edita as próprias tarefas; sem Insights |
| Visualizador / Auditor | Sérgio Tavares | somente leitura; relatórios e auditoria |

As operações validam a permissão de fato (não apenas escondem botões); tentativas
negadas geram toast e registro na auditoria.

## Atalhos de teclado

| Atalho | Onde | Ação |
|---|---|---|
| `Ctrl+K` / `⌘K` | qualquer tela | foca a busca global (setas navegam nos resultados) |
| `Enter` / `Espaço` | card do Kanban | abre o painel da tarefa |
| `Alt+←` / `Alt+→` | card do Kanban | move a tarefa para a coluna vizinha |
| `Ctrl+Enter` / `⌘Enter` | modal Nova tarefa, comentário | cria a tarefa / envia o comentário |
| `n` | qualquer tela, fora de campos de texto | abre o modal Nova tarefa (se o perfil puder criar) |
| `Esc` | menu, painel, modal | fecha só a camada do topo |

## Fluxos implementados (cenários A–G do briefing)

- **A** Gestor cria projeto → equipe → épico → tarefas → aparece no dashboard.
- **B** Kanban: filtrar, arrastar card, status atualiza → histórico da tarefa → auditoria.
- **C** Webhook assinado em `task.status_changed.v1` → evento → entrega simulada → falha (503 ×3 tentativas) → reenvio manual com sucesso.
- **D** Assistente de IA: briefing → proposta de épicos/tarefas/subtarefas com critérios de aceite → revisão → aprovação → itens no Kanban com origem `ai` na auditoria.
- **E** MCP: console de teste executa as 11 ferramentas; escrita (`tasks_create`, `tasks_move`…) altera os dados reais do protótipo respeitando o papel ativo.
- **F** Insights: KPIs e gráficos reagem ao estado; auditoria com diff anterior/novo.
- **G** Permissionamento: operações bloqueadas por papel, dados escopados por equipe/organização.

## Funcionalidades simuladas

- **Respostas da IA** — intenções fixas calculadas sobre os dados reais da demo (badge "resposta simulada" na interface).
- **Entregas de webhook** — nenhuma requisição HTTP externa; URLs com `fail`/`.local` simulam endpoint com falhas (503 + retentativas, espelhando outbox → SNS/SQS → DLQ).
- **Notificações** — e-mail/WhatsApp/SMS apenas registrados no histórico; canal sem provedor configurado falha de propósito (SMS).
- **Servidor MCP (no navegador)** — o console da tela Agentes MCP executa as ferramentas sobre o estado local; o servidor MCP de verdade está em [`mcp-server/`](mcp-server/README.md).

## Persistência

Todo o estado vive no `localStorage` (`projectflow.db.v1`) e sobrevive ao reload.
**Configurações → Dados da demonstração → Restaurar dados de demonstração** volta ao
cenário inicial. A ação exige o perfil **Administrador** e uma confirmação; o atalho no
rodapé da sidebar só aparece para ele. Há exportação do estado em JSON.

## Servidor MCP (NestJS)

A pasta [`mcp-server/`](mcp-server/README.md) tem um servidor MCP real, em NestJS 12 com o módulo
oficial `@nestjs/mcp`, que expõe a agentes de IA as mesmas regras do protótipo (papéis, escopo por
organização e equipe, validações, auditoria com origem `mcp`, eventos e webhooks simulados):

- 30 ferramentas — as 11 do console (`projects_list`, `tasks_move`…) com os mesmos nomes, mais
  sprints, dependências, comentários, arquivamento/exclusão de projetos, insights, auditoria,
  webhooks e exportar/importar/restaurar o estado;
- recursos `pf://me`, `pf://projects`, `pf://roles`, `pf://catalog/events` e templates
  `pf://projects/{key}`, `pf://projects/{key}/board`, `pf://tasks/{ref}`, `pf://sprints/{id}`;
- prompts `planejar-sprint`, `relatorio-de-risco`, `refinar-tarefa` e `resumo-semanal`;
- Streamable HTTP com OAuth 2.1 (tokens de demonstração por perfil e scopes) e stdio.

O estado do servidor fica em `mcp-server/data/state.json`, no mesmo formato do
**Exportar estado (JSON)** — o seed vem do próprio `js/data.js`, e um JSON exportado do protótipo
pode ser importado para o agente trabalhar sobre os seus dados.

Como instalar, rodar e conectar está no [Início rápido](#início-rápido) (passos 3–5). Arquitetura,
catálogo completo com exemplos, tokens e scopes, autenticação em produção, decisões e limitações em
[`mcp-server/README.md`](mcp-server/README.md).

## Limitações conhecidas

- Drag-and-drop usa a API HTML5 (desktop); no toque, mova tarefas pela propriedade Status no painel da tarefa.
- A IA usa casamento de intenções por palavras-chave; briefings fora dos padrões caem na proposta genérica de backlog.
- Busca global cobre títulos/refs de tarefas e projetos (não comentários).
- Sem colaboração multiusuário real — o "usuário atual" é o perfil simulado selecionado.
- Gráficos com janela semanal fixa; sem exportação de relatórios.

## Próximos passos (React + Vue)

Ver [`docs/mapeamento-implementacao.md`](docs/mapeamento-implementacao.md) para a
correspondência tela → módulo React/Vue → microsserviço, e
[`docs/relatorio-validacao.md`](docs/relatorio-validacao.md) para o relatório de testes.
A direção visual e os tokens estão em [`DESIGN.md`](DESIGN.md).
