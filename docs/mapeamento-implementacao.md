# Mapeamento protótipo → implementação definitiva

## Telas → frontends

| Tela do protótipo | App definitivo | Módulo sugerido |
|---|---|---|
| Início (dashboard operacional) | React (Workspace) | `features/dashboard` |
| Projetos (lista/detalhe/config/membros) | React | `features/projects` |
| Minhas tarefas, drawer de tarefa | React | `features/tasks` (drawer como rota paralela) |
| Kanban (DnD) | React | `features/board` (dnd-kit) |
| Backlog / Sprints / Cronograma | React | `features/planning` |
| Equipes / Usuários e permissões | React | `features/org` |
| Assistente de IA | React | `features/assistant` (streaming do ms-ai) |
| Agentes MCP | React | `features/mcp` |
| Webhooks | React | `features/webhooks` |
| Notificações | React | `features/notifications` |
| Visão executiva / Análise | Vue 3 (Insights) | `views/executive`, `views/analytics` |
| Central de auditoria | Vue 3 | `views/audit` |

## Módulos do protótipo → microsserviços

| Código do protótipo | Serviço | Observações |
|---|---|---|
| `PF.visibleProjects`, `PF.can`, papéis/equipes (core.js) | `ms-identity` | matriz de capacidades e escopo por equipe/organização viram políticas no serviço |
| `PF.act.create/update Task/Project/Sprint` (core.js) | `ms-projects` | REST + GraphQL; contadores de ref (`PCL-124`) por sequência no PostgreSQL |
| `notify()` + templates/prefs/providers | `ms-notifications` | consumidor SQS dos eventos; entrega por canal |
| `PF.emitEvent` + `deliverWebhook` + tentativas | `ms-webhooks` | transactional outbox → SNS → SQS; DLQ substitui a simulação de 3 tentativas |
| `answer()` / `buildProposal()` (views-intel.js) | `ms-ai` | troca o casamento de intenções por chamadas ao modelo; proposta revisável mantém o mesmo contrato (épicos/tarefas/subtarefas/critérios) |
| `PF.mcpExecute` + registro de execuções | `mcp-server` | **implementado** em NestJS 12 + `@nestjs/mcp` ([`mcp-server/`](../mcp-server/README.md)): as 11 ferramentas com os mesmos nomes + 19 novas, recursos, prompts, OAuth com scopes e stdio |
| `localStorage` (`projectflow.db.v1`) | PostgreSQL | o seed (`js/data.js`) vira fixture/seeder |
| Auditoria com before/after + origem | `ms-projects`/transversal | gravada na mesma transação da mutação (atomicidade), origem = ui/api/mcp/automation/ai |

## Contratos que o protótipo já fixa

- Catálogo de eventos versionados (`task.status_changed.v1`, …) e payload `{id, type, occurredAt, data}`.
- Estados de tarefa (5), prioridades (4), tipos (épico/tarefa/bug/subtarefa) e seus glifos.
- Matriz papel × capacidade (tela Usuários e permissões → Papéis).
- Tokens de design claro/escuro (DESIGN.md) compartilhados entre React e Vue.

## Servidor MCP: prototipado → implementado

| No protótipo | Em `mcp-server/` |
|---|---|
| `PF.mcpExecute` no navegador, console de teste | servidor MCP real: Streamable HTTP (`POST /mcp`) e stdio, sobre `@nestjs/mcp` |
| permissão por `mcp.read` / `mcp.write` do papel | scopes OAuth do token (`projects:read`, `tasks:write`, `admin`…) **e** a capacidade de negócio de cada operação (`@RequiresCap`, `canTouchTask`, escopo por organização/equipe) |
| perfil ativo do seletor | usuário do token (HTTP) ou `PF_USER` (stdio) |
| `PF.act.*`, `PF.validate*`, `PF.can`, `visibleProjects` (core.js) | `src/domain/` (funções puras portadas) + services por domínio |
| `localStorage` `projectflow.db.v1` | `mcp-server/data/state.json`, mesmo formato; importar/exportar o JSON do protótipo |
| `js/data.js` (seed) | o mesmo arquivo, executado com `node:vm` (sem cópia de dados) |
| auditoria com origem `mcp`, eventos, entregas simuladas | iguais, gravados na mesma transação da mutação |
| `mcpExecutions` (aba Execuções) | preenchido a cada chamada de ferramenta |

Próximo passo para produção: trocar o verificador de tokens estáticos por JWT/JWKS do provedor de
identidade e o repositório em arquivo pelo PostgreSQL do `ms-projects`.
