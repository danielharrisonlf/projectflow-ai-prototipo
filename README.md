# ProjectFlow AI — Protótipo navegável

Protótipo de alta fidelidade da plataforma de gestão de projetos **ProjectFlow AI**,
cobrindo os dois ambientes do produto — **Workspace** (futuro frontend React) e
**Insights** (futuro frontend Vue 3) — em HTML, CSS e JavaScript puros, com dados
simulados e sem backend.

> Este protótipo valida regras de negócio, fluxos e experiência de uso. Ele não
> substitui a implementação acadêmica definitiva em React e Vue.

## Como executar

Abra `index.html` diretamente no navegador (duplo clique funciona — não há
dependências nem build), ou sirva a pasta com qualquer servidor estático:

```bash
npx http-server .   # ou: python -m http.server
```

A única dependência externa é a fonte IBM Plex (Google Fonts); sem internet o
protótipo funciona normalmente com a fonte do sistema.

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
- **Servidor MCP** — estado e endpoint ilustrativos; a execução das ferramentas é real sobre o estado local.

## Persistência

Todo o estado vive no `localStorage` (`projectflow.db.v1`) e sobrevive ao reload.
**Configurações → Dados da demonstração → Restaurar dados de demonstração** volta ao
cenário inicial. A ação exige o perfil **Administrador** e uma confirmação; o atalho no
rodapé da sidebar só aparece para ele. Há exportação do estado em JSON.

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
