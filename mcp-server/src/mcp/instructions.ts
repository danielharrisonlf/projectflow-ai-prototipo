/** Instruções enviadas aos clientes MCP (o modelo lê no início da sessão). */
export const SERVER_INSTRUCTIONS = `ProjectFlow AI — gestão de projetos, sprints e tarefas.

Como trabalhar com este servidor:
1. Leia pf://me primeiro: mostra quem você representa, o papel, as capacidades e o escopo
   (organização e equipes). Tudo o que você vê e altera respeita esse escopo; fora dele, projetos
   e tarefas respondem como "não encontrados".
2. Projetos são identificados pela chave (PCL, PAG, APC…); tarefas pelo ref (PCL-124);
   sprints pelo id (sp-pcl-15) ou pelo nome junto com o projeto ("Sprint 15" + PCL).
   Pessoas por nome completo, e-mail ou id (u8).
3. Para ler: projects_list → projects_get; tasks_list (filtros por projeto, status, responsável,
   sprint, atraso, bloqueio) → tasks_get. O quadro Kanban em markdown está em pf://projects/{key}/board.
4. Status de tarefa: backlog, todo, in_progress, in_review, done. Prioridades: urgent, high,
   medium, low. Tipos: task, bug, subtask.
5. Toda alteração fica na auditoria com origem "mcp" e emite eventos de domínio
   (ex.: task.status_changed.v1) que disparam webhooks simulados. Prefira mudanças pequenas e
   explique ao usuário o que vai alterar antes de chamar ferramentas de escrita.
6. Regras que o servidor impõe: uma sprint ativa por projeto; encerrar sprint devolve as tarefas
   abertas ao backlog; dependências não podem formar ciclo; responsável precisa ser membro das
   equipes do projeto; datas no formato AAAA-MM-DD.
7. projects_delete é irreversível e pede confirmação do usuário.
8. Os prompts planejar-sprint, relatorio-de-risco, refinar-tarefa e resumo-semanal trazem o
   contexto real já embutido.`;
