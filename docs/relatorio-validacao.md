# Relatório de validação — Protótipo ProjectFlow AI

Data: 2026-10-30 · Ambiente: Chrome (desktop 1536px), emulação iPhone 12 (390px) no
browser embutido do Orca · Execução via servidor estático local e validação de
sintaxe com `node --check` em todos os arquivos JS.

## O que foi implementado e testado

| Área | Evidência do teste |
|---|---|
| Dashboard operacional | KPIs calculados dos dados; filtros por período/projeto/equipe/responsável reagindo; painéis de tarefas, entregas, sprints, favoritos, atividades e resumo por equipe |
| Projetos | listagem com busca/filtros/ordenação, favorito, criação (PRT criado em teste), edição, arquivamento e exclusão com confirmação; detalhe com épicos, marcos, membros e zona de risco |
| Tarefas | drawer completo (status, prioridade, responsável, épico, sprint, vencimento, etiquetas, dependências, critérios de aceite, subtarefas, comentários com menção, histórico); criação validada por modal e criação rápida no Kanban |
| Kanban | 5 colunas, cards com indicadores de atraso/bloqueio/subtarefas, filtros combinados + busca, movimentação PCL-103 A fazer → Em andamento → Em revisão testada ponta a ponta |
| Sprints | iniciar/encerrar (tarefas abertas voltam ao backlog), associação de tarefas do backlog, progresso |
| Cronograma | gantt por projeto com marcos, linha de hoje, janelas de 3/6/12 meses, filtro por equipe |
| IA | 6 intenções de análise + planejamento assistido; proposta de 9 itens aprovada criou 2 épicos e 7 tarefas no backlog, auditadas com origem `ai` |
| MCP | 11 ferramentas; `tasks_create` via console criou PCL-120 com auditoria origem `mcp`; escrita negada para perfil desenvolvedor (`permission_denied`) |
| Webhooks | assinatura criada com endpoint falho → entrega `failed` (HTTP 503, 3 tentativas) → reenvio manual → `success`; segredo mascarado com revelar/copiar; teste manual; catálogo de eventos com contagens |
| Notificações | fan-out por evento e preferências; atribuição de PRT-101 gerou "[PRT-101] Tarefa atribuída a você"; SMS falha por provedor não configurado; reenvio funcional |
| Insights | KPIs, 4 gráficos (linha + barras) recalculados do estado; análise com comparação de projetos, sprints, gargalos e dependências |
| Auditoria | filtros por usuário/projeto/ação/origem/entidade/período; drawer com diff anterior→novo (status EM ANDAMENTO → EM REVISÃO verificado) e JSON do evento emitido |
| Permissões | admin vê 11 projetos, dev vê 3; dev bloqueado em criar projeto (toast + registro `denied` na auditoria), em MCP de escrita, em tarefas de outras equipes e em Insights |
| Persistência | alterações sobreviveram ao reload (`localStorage`); restauração da demo testada; exportação JSON |
| Temas | claro/escuro/sistema com tokens semânticos; troca sem transições; contraste AA nos dois temas |
| Responsivo | 390px: sidebar vira overlay com hambúrguer, sem scroll horizontal; tabelas com rolagem própria |

Paleta de gráficos validada com o validador da skill de dataviz: gráficos usam série
única (magnitude) ou cores de status sempre com ícone + rótulo — nenhuma paleta
categórica multicolorida adjacente (os pares acento/violeta reprovaram no teste de
visão de cores e foram evitados por construção).

## Defeitos encontrados e corrigidos durante a validação

1. Console de teste MCP perdia a resposta porque a execução redesenha a página — estado do console agora persiste entre renders.
2. Botão hambúrguer aparecia no desktop (especificidade de `.btn` sobre `.tb-burger`) — corrigido.
3. Breadcrumb do detalhe do projeto recebia o segmento errado da rota — corrigido.
4. Rótulos de mês colidiam na borda do cronograma — meses parciais estreitos deixam de rotular.
5. Meta dos itens da proposta de IA colava no título — quebra de linha corrigida.

## Problemas conhecidos (não bloqueantes)

- Drag-and-drop não funciona em telas de toque (fallback: seletor de status no drawer).
- O painel de papéis recalcula a matriz simulando o papel por usuário de referência; se um papel não tiver nenhum usuário, a linha aparece vazia.
- A troca de perfil durante um formulário aberto fecha o overlay (por design, evita estado inconsistente).
- Datas do seed são relativas ao primeiro carregamento; "Restaurar demonstração" re-ancora no dia atual.

## Limitações de processo registradas

- **Grupo "Projetos Pessoais" no Orca:** o projeto foi criado e o workspace nomeado
  "ProjectFlow AI — Protótipo" via CLI, mas a CLI desta versão não expõe a atribuição
  de grupo (`projectGroupId`) — mover o card para o grupo "Projetos Pessoais" é um
  arrasto na UI do Orca. Não afirmo que essa etapa foi executada.
- **Pesquisa visual:** uitopic.com e as demais referências não foram navegadas ao vivo;
  a direção veio das skills de design instaladas (impeccable/craft-floor, dark-interfaces,
  dataviz) e dos padrões consolidados de Linear/Jira/ClickUp, registrados em `DESIGN.md`.
