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
| `PF.mcpExecute` + registro de execuções | `mcp-server` | as 11 ferramentas e suas permissões já definem o contrato MCP |
| `localStorage` (`projectflow.db.v1`) | PostgreSQL | o seed (`js/data.js`) vira fixture/seeder |
| Auditoria com before/after + origem | `ms-projects`/transversal | gravada na mesma transação da mutação (atomicidade), origem = ui/api/mcp/automation/ai |

## Contratos que o protótipo já fixa

- Catálogo de eventos versionados (`task.status_changed.v1`, …) e payload `{id, type, occurredAt, data}`.
- Estados de tarefa (5), prioridades (4), tipos (épico/tarefa/bug/subtarefa) e seus glifos.
- Matriz papel × capacidade (tela Usuários e permissões → Papéis).
- Tokens de design claro/escuro (DESIGN.md) compartilhados entre React e Vue.
