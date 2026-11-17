# ProjectFlow AI — servidor MCP

Servidor [Model Context Protocol](https://modelcontextprotocol.io) do ProjectFlow AI, feito em
**NestJS 12** com o módulo oficial **`@nestjs/mcp`** (0.0.4). Ele dá a agentes de IA (Claude Code,
Claude Desktop, MCP Inspector, qualquer cliente MCP) acesso a projetos, tarefas, sprints, equipes,
auditoria, webhooks e indicadores do ProjectFlow, **com as mesmas regras do protótipo**: capacidades
por papel, escopo por organização e equipe, validações, auditoria, eventos de domínio e webhooks.

No protótipo (`../js/views-intel.js`) o "servidor MCP" era simulado no navegador. Aqui ele é real:
Streamable HTTP com OAuth 2.1 (resource server) e stdio, com estado próprio persistido em arquivo.

- 30 ferramentas (as 11 do protótipo com os mesmos nomes + 19 novas)
- 4 recursos, 4 templates de recurso e 4 prompts
- 95 testes unitários/integração + 20 e2e (HTTP e stdio reais)

## Sumário

- [Arquitetura](#arquitetura)
- [Instalação e execução](#instalação-e-execução)
- [Identidade, tokens e scopes](#identidade-tokens-e-scopes)
- [Catálogo de primitivas](#catálogo-de-primitivas)
- [Usando com clientes](#usando-com-clientes)
- [Estado: seed, importação e exportação](#estado-seed-importação-e-exportação)
- [Autenticação em produção](#autenticação-em-produção)
- [Testes](#testes)
- [Configuração (variáveis de ambiente)](#configuração-variáveis-de-ambiente)
- [Decisões](#decisões)
- [Limitações](#limitações)

## Arquitetura

```
 cliente MCP (Claude Code, Inspector…)
        │  Streamable HTTP  POST /mcp  (Bearer token)        stdio (PF_USER)
        ▼                                                       ▼
 ┌──────────────────────── @nestjs/mcp ─────────────────────────────────┐
 │ Host/Origin · OAuth (StaticTokenVerifier) · scopes por primitiva     │
 │ CapabilityGuard (@RequiresCap) → McpCallLogInterceptor → handler      │
 │ DomainErrorFilter (erro de domínio → isError / erro JSON-RPC)         │
 └───────────────────────────────┬──────────────────────────────────────┘
          providers MCP finos    │  projects.mcp · tasks.mcp · sprints.mcp · teams.mcp
          (@Tool/@Resource/…)    │  insights.mcp · audit.mcp · webhooks.mcp · state-admin.mcp
                                 │  identity.mcp · planning.prompts
                                 ▼
          services de regra      ProjectsService · TasksService · SprintsService · TeamsService
          (testáveis, sem MCP)   InsightsService · AuditService · EventsService · WebhooksService
                                 │
          domínio puro           domain/: access (PF.can, visibleProjects, canTouchTask…),
          (portado de core.js)   validation, metrics, state-shape, lookup
                                 ▼
          StateStore ── transação (cópia + commit) ── StateRepository (porta)
                                                       └─ FileStateRepository: data/state.json
                                                          (tmp + rename; seed: ../js/data.js via node:vm)
```

| Pasta | Conteúdo |
|---|---|
| `src/domain/` | Tipos do estado (mesmo formato do `projectflow.db.v1`), papéis × capacidades, permissões, validações, métricas, migração/saneamento — funções puras portadas de `js/core.js` |
| `src/state/` | `StateRepository` (porta), `FileStateRepository`, `SeedProvider` (executa o `js/data.js`), `StateStore` (transações) |
| `src/<domínio>/` | `*.service.ts` (regra de negócio) + `*.mcp.ts` (primitivas MCP que só delegam) |
| `src/mcp/` | verificador de tokens e scopes, guard `@RequiresCap`, interceptor de log, filtro de erros, schemas Zod e instruções do servidor |
| `src/main.ts` / `src/stdio.ts` | os dois transportes, sobre o mesmo `AppModule` |

Toda mutação roda em `StateStore.transaction()`: sobre uma cópia do estado, que só substitui o
estado e é gravada se nada falhar — mutação, registro de auditoria, evento e entregas de webhook são
atômicos. A exceção é a negação de permissão: o registro `denied` é gravado mesmo com a transação desfeita.

## Instalação e execução

Requer Node.js ≥ 20.19 (testado no 24).

```bash
cd mcp-server
npm install
npm run build          # gera dist/main.js e dist/stdio.js

npm start              # HTTP em http://localhost:3333/mcp  (saúde: GET /health)
npm run start:stdio    # stdio (usuário de PF_USER; padrão u2, o gestor)
npm run dev            # tsc --watch + reinício automático do HTTP
```

Na primeira execução o servidor cria `data/state.json` a partir do seed do protótipo. Para começar
do zero, apague o arquivo (ou use a ferramenta `state_reset`).

Conferindo à mão:

```bash
curl -s localhost:3333/health
curl -si -X POST localhost:3333/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'            # 401 + WWW-Authenticate
curl -s -X POST localhost:3333/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'authorization: Bearer pf-demo-gestor-5b81f0c6aa' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

## Identidade, tokens e scopes

Duas camadas de autorização, sempre as duas:

1. **Scope OAuth do token** — o que o *agente* pode fazer. Checado pelo `@nestjs/mcp` antes do método;
   faltando, a resposta é HTTP 403 `insufficient_scope` (o cliente SDK lança `InsufficientScopeError`
   e pode pedir step-up). Só em HTTP: em stdio a especificação manda tirar credenciais do ambiente.
2. **Capacidade do papel + escopo de organização/equipe** — o que o *usuário* pode fazer, exatamente
   como no protótipo. `CapabilityGuard` (`@RequiresCap('task.create')`) e os services checam; a negação
   vira erro de ferramenta claro e um registro `denied` na auditoria com origem `mcp`. Fora do escopo,
   projeto e tarefa respondem "não encontrado ou fora do seu escopo" (sem vazar que existem), e a
   tentativa de alteração fica na auditoria.

### Tokens de demonstração (`config/tokens.demo.json`)

São públicos, só para a demo. Cada token aponta para um usuário do seed:

| Perfil | Token | Usuário | Scopes |
|---|---|---|---|
| admin | `pf-demo-admin-7c2e9a41d3` | Helena Costa (u1, Administrador) | todos |
| gestor | `pf-demo-gestor-5b81f0c6aa` | Ricardo Nogueira (u2, Gestor) | `projects:read/write`, `tasks:read/write`, `sprints:write`, `audit:read` |
| gestor-leitura | `pf-demo-gestor-leitura-e4d2c9` | Ricardo Nogueira (u2) | `projects:read`, `tasks:read` |
| lider | `pf-demo-lider-93ad17be42` | Ana Souza (u4, Líder) | `projects:read`, `tasks:read/write` |
| dev | `pf-demo-dev-2f6c84d1e9` | Camila Freitas (u8, Desenvolvedora) | `projects:read`, `tasks:read/write` |
| auditor | `pf-demo-auditor-c07b5e3f18` | Sérgio Tavares (u18, Auditor) | `projects:read`, `tasks:read`, `audit:read` |

Formato do arquivo (ou de `PF_TOKENS`, um JSON inline):

```json
{ "tokens": [ { "token": "≥16 caracteres", "profile": "nome", "userId": "u2",
                "scopes": ["projects:read"], "expiresAt": "2027-01-01T00:00:00Z" } ] }
```

Sem `expiresAt`, o token vale por `PF_TOKEN_TTL_SECONDS` (padrão 3600) a partir de cada verificação.
O `AuthInfo` devolvido tem `resource` = URL canônica (`PF_PUBLIC_URL` + `/mcp`), como o módulo exige.

### Scopes

| Scope | Libera |
|---|---|
| `projects:read` | projetos, sprints, equipes, insights, `pf://projects`, `pf://projects/{key}`, `pf://sprints/{id}` |
| `projects:write` | criar, editar, arquivar, desarquivar e excluir projetos |
| `tasks:read` | tarefas, `pf://tasks/{ref}`, quadro Kanban |
| `tasks:write` | criar, editar, mover, atribuir, comentar, dependências |
| `sprints:write` | criar, iniciar, encerrar sprints e associar tarefas |
| `audit:read` | auditoria e histórico de webhooks |
| `admin` | exclusão de projeto, reenvio de webhook, exportar/importar/restaurar estado |

`pf://me`, `pf://roles` e `pf://catalog/events` não pedem scope (qualquer token válido).

## Catálogo de primitivas

Descrições e argumentos estão em português, escritos para o modelo; todo argumento tem `.describe()`.
Leituras têm `readOnlyHint`/`idempotentHint`; as principais devolvem `structuredContent` validado por `outputSchema`.

### Ferramentas (30)

| Ferramenta | Faz | Scope | Capacidade |
|---|---|---|---|
| **projects_list** | lista projetos visíveis (filtro de situação; `archived`) | projects:read | project.view |
| **projects_get** | detalhe: risco, contagem por status, épicos, marcos, sprints | projects:read | project.view |
| **projects_create** | cria projeto (chave única 2–4 letras) · `project.created.v1` | projects:write | project.create |
| projects_update | altera nome, descrição, prioridade, situação, datas, responsável | projects:write | project.edit |
| projects_archive / projects_unarchive | arquiva/restaura | projects:write | project.archive |
| projects_delete | exclui em cascata; **confirmação por elicitação** | projects:write + admin | project.delete |
| **tasks_list** | filtros: projeto, status, responsável (`me`/`none`), sprint, tipo, prioridade, etiqueta, atraso, bloqueio, busca | tasks:read | task.view |
| **tasks_get** | detalhe com comentários, dependências e histórico | tasks:read | task.view |
| **tasks_create** | cria tarefa (ref `PCL-125`) · `task.created.v1` | tasks:write | task.create |
| **tasks_update** | título, descrição, prioridade, prazo, etiquetas, critérios, épico | tasks:write | task.edit + canTouchTask |
| **tasks_move** | muda status; `doneAt` ao concluir · `task.status_changed.v1` | tasks:write | task.move + canTouchTask |
| **tasks_assign** | define/remove responsável (sem task.assign, só a si mesmo) | tasks:write | task.edit |
| tasks_comment | comenta; `@Nome Sobrenome` notifica | tasks:write | task.create |
| tasks_link_dependency / tasks_unlink_dependency | bloqueios (mesmo projeto, sem ciclo) | tasks:write | task.edit |
| **sprints_list** | sprints com progresso | projects:read | sprint.view |
| sprints_create | planeja sprint (nome único, datas válidas) | sprints:write | sprint.manage |
| sprints_start | inicia (uma ativa por projeto) | sprints:write | sprint.manage |
| sprints_close | encerra; abertas voltam ao backlog | sprints:write | sprint.manage |
| sprints_assign_tasks | lote com progresso e cancelamento | sprints:write + tasks:write | sprint.manage |
| **teams_list** | equipes, integrantes e projetos | projects:read | team.view |
| insights_summary | KPIs da Visão executiva | projects:read | insights.view |
| audit_search | auditoria com filtros e diff | audit:read | audit.view |
| webhooks_list / webhooks_deliveries | assinaturas (segredo mascarado) e entregas | audit:read | webhook.view |
| webhooks_redeliver | reenvio manual (200 simulado) | admin | webhook.manage |
| state_export / state_import / state_reset | estado em JSON; importar/restaurar com progresso | admin | user.manage |

Em negrito, as 11 do protótipo (mesmos nomes de `js/data.js`).

Exemplos (argumentos):

```jsonc
// tasks_list — o que está atrasado no Portal do Cliente
{ "project": "PCL", "overdue": true }
// tasks_create
{ "project": "PCL", "title": "Validar contestação com 3 clientes piloto", "priority": "high", "assignee": "Camila Freitas", "dueDate": "2026-12-05" }
// tasks_update (mesmo formato `fields` do protótipo)
{ "ref": "PCL-103", "fields": { "priority": "urgent", "acceptance": [{ "text": "Anexo até 10 MB", "done": false }] } }
// tasks_move
{ "ref": "PCL-101", "status": "in_review" }
// sprints_assign_tasks
{ "sprint": "Sprint 16", "project": "PCL", "refs": ["PCL-109", "PCL-111"] }
// audit_search — o que agentes MCP alteraram hoje
{ "source": "mcp", "from": "2026-11-17" }
```

Erros de domínio voltam como resultado `isError` com código e mensagem, por exemplo
`Conflito [conflict]: Já existe uma sprint ativa: encerre a Sprint 15 antes de iniciar a Sprint 16.` ou
`Permissão negada [permission_denied]: Sem permissão: o perfil “Desenvolvedor / Colaborador” não pode editar a tarefa PCL-101.`
Argumentos fora do schema são recusados pelo SDK antes do método (`Input validation error`). Erros
inesperados viram `Internal server error`, sem stack (o detalhe fica no log).

**projects_delete**: com cliente da revisão 2026-07-28 que declara `elicitation`, o servidor devolve
`inputRequired` e o cliente pergunta ao usuário ("Excluir definitivamente o projeto WEB — …?"); recusar
cancela. Clientes 2025 (ou sem elicitação) precisam enviar `confirm: true` depois de confirmar com o usuário.
Antes de perguntar, o servidor confere permissão e escopo — não se pede confirmação do que não se pode excluir.

### Recursos (4)

| URI | Conteúdo |
|---|---|
| `pf://me` | quem o agente representa: usuário, papel, capacidades, organização, equipes, projetos visíveis, scopes, transporte |
| `pf://projects` | projetos visíveis (JSON) |
| `pf://roles` | matriz papel × capacidade |
| `pf://catalog/events` | eventos de webhook (`task.status_changed.v1`…), quando disparam e ocorrências |

### Templates de recurso (4)

| Template | Conteúdo |
|---|---|
| `pf://projects/{key}` | detalhe do projeto (JSON) |
| `pf://projects/{key}/board` | quadro Kanban em markdown |
| `pf://tasks/{ref}` | tarefa com comentários e histórico (JSON) |
| `pf://sprints/{id}` | sprint com progresso e tarefas (JSON) |

### Prompts (4)

Cada prompt devolve duas mensagens: o contexto real como recurso JSON embutido e as instruções com os dados em markdown.

| Prompt | Argumentos | Para |
|---|---|---|
| `planejar-sprint` | `projeto`, `capacidade` | proposta de sprint a partir do backlog real, prioridades, prazos e dependências |
| `relatorio-de-risco` | `projeto` | atrasos, bloqueios (com quem bloqueia), marcos, recomendações |
| `refinar-tarefa` | `ref` | descrição, critérios de aceite e subtarefas a partir de dados e comentários |
| `resumo-semanal` | `equipe` | entregas dos últimos 7 dias, andamento, revisão, atrasos e bloqueios |

## Usando com clientes

**Claude Code (stdio)** — o `.mcp.json` na raiz do repositório já registra o servidor:

```json
{ "mcpServers": { "projectflow": { "type": "stdio", "command": "node",
    "args": ["mcp-server/dist/stdio.js"], "env": { "PF_USER": "ricardo.nogueira@vetorlabs.dev" } } } }
```

Rode `npm run build` em `mcp-server/` antes; troque `PF_USER` para agir como outro perfil
(`u1` admin, `u4` líder, `u8` dev, `u18` auditor).

**Claude Code (HTTP)**, com o servidor no ar (`npm start`):

```bash
claude mcp add --transport http projectflow http://localhost:3333/mcp \
  --header "Authorization: Bearer pf-demo-gestor-5b81f0c6aa"
```

**MCP Inspector**:

```bash
npx @modelcontextprotocol/inspector node mcp-server/dist/stdio.js    # stdio
npx @modelcontextprotocol/inspector                                  # HTTP: URL http://localhost:3333/mcp,
                                                                     # header Authorization: Bearer <token>
```

O endpoint aceita `Origin` de `localhost`/`127.0.0.1` (o Inspector roda em `http://localhost:6274`);
outros sites recebem 403. Para liberar outra origem, use `PF_ALLOWED_ORIGINS` e `PF_CORS_ORIGINS`.

## Estado: seed, importação e exportação

- **Arquivo**: `data/state.json` (ou `PF_DATA_FILE`), ignorado pelo git. Escrita atômica (arquivo
  temporário + `rename`, com novas tentativas no Windows). Formato idêntico ao `localStorage`
  `projectflow.db.v1` do protótipo — por isso `PF_DATA_FILE` pode apontar direto para um JSON
  exportado pelo botão **Configurações → Dados da demonstração → Exportar estado (JSON)**.
- **Seed**: o `../js/data.js` do protótipo é executado com `node:vm` num sandbox com `window` falso e
  `window.PFSeed.build()` gera o cenário — os dados não são copiados para o servidor. Fallback, se o
  arquivo não puder ser executado: `PF_SEED_JSON` (um JSON exportado) e, por último, um estado mínimo
  (uma organização, os cinco papéis e um administrador `u1`, sem projetos), com aviso no log.
- **Carga**: o estado salvo passa pela mesma validação, migração (schema 2) e saneamento do `PF.load`.
  Estado de outra versão do seed ou corrompido é guardado como `state.json.invalid-<data>.json` e o seed é recriado.
- **Ferramentas** (admin): `state_export` devolve o JSON como recurso embutido; `state_import`
  substitui o estado pelo JSON (até ~3,5 MB; o corpo HTTP aceita 4 MB) com progresso em 4 etapas;
  `state_reset` volta ao cenário inicial. Importação e restauração exigem `confirm: true`.

O caminho inverso (levar o estado do servidor para o protótipo) é manual: cole o JSON exportado no
`localStorage['projectflow.db.v1']` pelo DevTools — o protótipo não tem importação.

## Autenticação em produção

O `StaticTokenVerifier` existe para a demonstração. Em produção, o servidor continua sendo um OAuth 2.1
resource server do `@nestjs/mcp`; troque apenas o verificador por um que valide JWT contra o JWKS do
seu provedor de identidade. Com o `JwtVerifier` de `@nestjs/authentication` (assinatura conferida no
`.d.ts` da 0.1.6: `new JwtVerifier({ jwks, issuer, audience })` e `verify(token): Promise<JwtClaims>`),
o adaptador para a interface `McpTokenVerifier` fica assim:

```ts
import { Injectable } from '@nestjs/common';
import { JwtVerifier } from '@nestjs/authentication';
import type { McpTokenVerifier } from '@nestjs/mcp';
import type { AuthInfo } from '@modelcontextprotocol/server';

const RESOURCE = 'https://mcp.suaempresa.com/mcp';

@Injectable()
export class JwtTokenVerifier implements McpTokenVerifier {
  private readonly jwt = new JwtVerifier({
    jwks: 'https://login.suaempresa.com/.well-known/jwks.json',
    issuer: 'https://login.suaempresa.com',
    audience: RESOURCE,
  });

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const claims = await this.jwt.verify(token); // JwtError (status 401) → 401 com desafio
    return {
      token,
      clientId: String(claims.azp ?? claims.client_id ?? claims.sub),
      scopes: String(claims.scope ?? '').split(' ').filter(Boolean),
      expiresAt: claims.exp,
      resource: new URL(RESOURCE),
      extra: { userId: claims.sub }, // id do usuário no ProjectFlow (ou um claim próprio)
    };
  }
}
```

Depois, em `src/mcp/mcp-options.factory.ts`, use esse verificador em `auth.verifier` (no
`McpAuthModule`, no lugar do `StaticTokenVerifier`) e aponte `authorizationServers` para o emissor real.

Requisitos do `AuthInfo` que o verificador devolve: `scopes` do claim `scope`, `expiresAt` (exp),
`resource` = audiência (comparada com `auth.resource`) e `extra.userId` com o id do usuário no
ProjectFlow (de `sub` ou de um claim próprio) — é o que o `ActorResolver` usa. Erro com `status: 401`
vira 401 com desafio `WWW-Authenticate`; qualquer outro, 500. Publique o servidor atrás de TLS e
ajuste `PF_PUBLIC_URL`, `PF_ALLOWED_HOSTS` e `PF_ALLOWED_ORIGINS`.

## Testes

```bash
npm run typecheck   # tsc sobre src e test
npm run lint        # oxlint
npm test            # unitários + integração (95 testes)
npm run test:e2e    # compila e roda HTTP real (listen(0)) e stdio real (dist/stdio.js) — 20 testes
```

- **Unitários** (`test/unit`): permissões e escopo, validações, ciclo de dependência, `doneAt`, uma
  sprint ativa por projeto, encerramento devolvendo ao backlog, lote com progresso/cancelamento,
  auditoria `denied`, webhooks com 503 ×3, repositório em arquivo (atômico, corrompido), seed via `node:vm`, verificador de tokens.
- **Integração** (`test/integration`, cliente MCP em memória do `@nestjs/mcp/testing`): catálogo,
  `callTool`/`readResource`/`getPrompt`, tokens de perfis diferentes, `InsufficientScopeError`, sem
  token (`SdkHttpError`), gestor da Vetor x tarefas da Atlas, validação de input, elicitação (aceitar e
  recusar) e `confirm` no legacy, importação com progresso.
- **E2E** (`test/e2e`): 401 com `resource_metadata`, metadata RFC 9728, 403 para `Origin`
  estrangeiro, 403 `insufficient_scope`, clientes SDK modern e legacy pelo socket, JSON de mais de
  100 KB; stdio com `StdioClientTransport` nas duas eras, logs no stderr, guard em stdio.

Cada teste usa um arquivo de estado temporário próprio.

## Configuração (variáveis de ambiente)

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` / `HOST` | `3333` / `127.0.0.1` | onde o HTTP escuta |
| `PF_PUBLIC_URL` | `http://localhost:$PORT` | URL pública; o `resource` OAuth é `$PF_PUBLIC_URL/mcp` |
| `PF_AUTH_ISSUER` | `https://auth.projectflow.example` | servidor de autorização anunciado no metadata |
| `PF_DATA_FILE` | `data/state.json` | arquivo de estado |
| `PF_SEED_FILE` | `../js/data.js` | seed do protótipo |
| `PF_SEED_JSON` | — | fallback de seed (JSON exportado) |
| `PF_TOKENS` / `PF_TOKENS_FILE` | `config/tokens.demo.json` | tokens (JSON inline ou arquivo) |
| `PF_TOKEN_TTL_SECONDS` | `3600` | validade dos tokens sem `expiresAt` |
| `PF_USER` | `u2` | usuário do stdio (id ou e-mail) |
| `PF_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | `Host` aceitos (anti DNS rebinding) |
| `PF_ALLOWED_ORIGINS` | padrão do módulo (localhost) | `Origin` aceitos; `off` desliga |
| `PF_CORS_ORIGINS` | localhost em qualquer porta | origens do CORS do Express |

A configuração é validada com Zod na subida; valores inválidos impedem o boot com mensagem clara.

## Decisões

- **Estado em arquivo com porta de repositório**: o protótipo não tem backend; o arquivo mantém o
  formato do `localStorage` para ir e voltar entre os dois. Trocar por PostgreSQL é implementar
  `StateRepository` (e trocar as transações por transações do banco).
- **Regras portadas, não reescritas**: `src/domain/` segue `core.js` função a função (mesmas mensagens,
  mesmos limites); os services só orquestram. As capacidades `mcp.read`/`mcp.write` do protótipo, que
  simulavam "o que o agente pode", foram substituídas pelos scopes OAuth do token; a capacidade de
  negócio de cada operação continua valendo.
- **`tasks_assign`** usa a regra de `core.js` (`assignAllowed`: sem `task.assign`, só atribuir a si
  mesmo), não a checagem mais estrita que o console simulado fazia.
- **Fora do escopo = não encontrado** para o agente (como no `PF.mcpExecute`), mas a tentativa de
  alteração entra na auditoria como `denied`.
- **Confirmação**: elicitação no modern (com a capacidade declarada); `confirm: true` no legacy,
  inclusive em stdio, onde o SDK até permitiria perguntar — um único comportamento por era.
  `state_import` e `state_reset` pedem `confirm: true` no schema.
- **Histórico de execuções**: chamadas de ferramenta entram em `mcpExecutions` (aba Execuções do protótipo).

## Limitações

- Um processo por arquivo de estado: duas instâncias apontando para o mesmo `state.json` se sobrescrevem
  (o endpoint é stateless, mas o estado não é compartilhado entre processos).
- Tokens estáticos sem revogação; não há servidor de autorização (o `PF_AUTH_ISSUER` é ilustrativo).
- Webhooks e notificações continuam simulados: nenhuma requisição sai do servidor.
- Chamadas negadas pelo guard de capacidade vão para a auditoria, mas não para `mcpExecutions`.
- A auditoria, os eventos e as entregas crescem sem limite no arquivo (a demo não faz rotação).
- `npm audit` aponta um ReDoS no `picomatch` puxado pelo `vitest` (só dependência de desenvolvimento).
