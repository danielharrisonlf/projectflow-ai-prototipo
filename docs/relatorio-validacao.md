# Relatório de validação — Protótipo ProjectFlow AI

Data: 2026-11-13 · Validação independente depois da rodada de auditoria e correções
(`aaf592e..e7793a0`; consolidado em [`auditoria.md`](auditoria.md)).

Ambiente:
- Chromium headless do Playwright, `locale pt-BR`, servidor estático local.
- `localStorage` limpo no início de cada sessão.
- Larguras de 1440×900 e 390×844, mais 1024 na varredura do tema claro.
- Temas claro e escuro: o tema "sistema" com `prefers-color-scheme` emulado, mais a troca manual.
- Os 5 perfis de demonstração.

Validação anterior: 2026-10-30, no Chrome desktop a 1536 px e no iPhone 12 emulado no Orca.

## Resultado

**Aprovado pelo critério de pronto:**
- nenhum crítico ou alto aberto;
- A–G passando nos 5 perfis e 2 temas;
- zero erro de console;
- AA;
- sem valor fixo relevante fora dos tokens.

Fica uma regressão média: a 1440 px a coluna "Concluído" do Kanban aparece cortada (VAL-01, abaixo).

| Verificação | Resultado |
|---|---|
| Cenários A–G pela interface (claro / escuro) | 59/59 · 59/59 |
| Achados críticos e altos reproduzidos | 20/20 confirmados (4 críticos, 16 altos únicos) |
| Achados médios reproduzidos | 30 confirmados, 1 falhou (UI-33, regressão) |
| Achados baixos reproduzidos | 25 confirmados |
| Varredura: estados de tela (32 rotas × 5 perfis + camadas) | 930 (1440 e 390 nos dois temas; 1024 no claro) |
| Erros de console / `pageerror` | 0 |
| Rolagem horizontal da página ou do `.content` | 0 |
| Texto abaixo de 4.5:1 (3:1 para texto grande) | 0. As únicas leituras abaixo do mínimo vieram do toast "Perfil alterado" no meio da animação de saída; em repouso ele passa |
| Fonte abaixo de 12px | Só iniciais de avatar (10–11px), exceção documentada no DESIGN.md |
| Elementos cortados sem reticências / fora da janela | 0 (fora de contêineres com rolagem própria) |
| Sobreposição de controles | Só camadas esperadas: resultados da busca sobre a página, navegação móvel aberta e corpo de modal com rolagem |
| Teclado, persistência, restauração e exportação | 12/12 |
| Adversarial: XSS, MCP e `localStorage` corrompido | 14/14 |
| Scripts dos corretores (`f0`–`f7`) reexecutados | todos passam (f7: 16/16; f0: 0 erro em 3 configurações) |

## Cenários A–G (pela interface)

Cada cenário roda com o perfil adequado e é repetido com os perfis que devem ser bloqueados.
"Negação" significa sem botão, ação recusada com aviso e registro `denied` na auditoria. Mesmo
resultado nos dois temas.

| Cenário | Perfil que executa | Resultado | Perfis bloqueados (verificado) |
|---|---|---|---|
| **A** projeto → épico → tarefas → dashboard | Gestor (Ricardo) | Projeto PPA criado pelo modal; épico e 2 tarefas com épico e prazo; KPIs "Projetos ativos" 7→8 e "Tarefas atrasadas" +1; projeto no filtro do Início | Líder, Dev e Auditor: sem "Novo projeto" e chamada direta negada (+1 `denied` cada). Admin tem o botão |
| **B** Kanban: filtro → arrastar → histórico → auditoria | Admin; Líder (Ana) com Alt+→ | Filtro Prioridade=Alta (14→2 cards, chip removível); arrasto PCL-103 A fazer→Em andamento; histórico "moveu … para Em andamento"; auditoria origem Interface com before/after; evento `task.status_changed.v1`; linha na Central de auditoria | Líder: drop sintético em tarefa de outra equipe negado. Auditor: nenhum card arrastável, Alt+→ sem efeito, sem criação rápida. Dev: só arrasta o que pode alterar |
| **C** webhook → falha 503×3 → reenvio | Admin | Assinatura `https://qa.fail.dev/hook` em `task.status_changed.v1`; evento gerado por Alt+→ no Kanban; entrega `failed` com 3× HTTP 503; "Reenviar evento" no drawer → `success` (4ª tentativa) e auditoria `redeliver` | Gestor e Auditor: rota visível, sem "Nova assinatura", segredo mascarado (`whsec_••••…a1c5`) e sem revelar/copiar. Líder e Dev: rota restrita. Criação direta negada nos 4 perfis |
| **D** IA: briefing → proposta → aprovação → Kanban | Gestor | Proposta com 9 itens; +2 épicos e +7 tarefas no PCL (6 com critérios de aceite); 9 registros com origem IA; itens no Kanban | Dev: consulta, mas "Adicionar selecionadas" é negado (0 tarefas, +1 `denied`). Auditor: Assistente restrito. Líder: acessa e não vê o chat da Dev |
| **E** MCP: 11 ferramentas | Admin | 11/11 `ok:true`; `tasks_create` aparece no Kanban e na auditoria com origem `mcp` | Gestor: leitura e escrita. Líder e Dev: leitura ok, escrita `permission_denied` com `denied` origem `mcp`. Auditor: leitura e escrita negadas |
| **F** Insights reagem ao estado; diff | Admin, Gestor, Líder; Auditor lê | "Tarefas concluídas" +1 após concluir uma tarefa (33→34, 30→31, 14→15); drawer da auditoria com diff "Status Em andamento → Concluído" e JSON do evento | Dev: Insights restrito |
| **G** permissionamento e escopo | 5 perfis | Projetos visíveis: Admin 13 (2 organizações), Gestor 11, Auditor 11 (só Vetor Labs), Líder 5, Dev 3. A tabela bate com `PF.visibleProjects()` | Negados: Dev abre projeto fora do escopo por URL, muda papel, move tarefa alheia e atribui a outra pessoa. Auditor comenta e reenvia notificação. Líder exclui tarefa e inicia sprint. Gestor exclui projeto, gerencia integrantes, restaura a demo e abre projeto da Atlas por URL. Usuários e permissões do Auditor sem e-mails e sem pessoas da Atlas |

## O que foi testado, por área

| Área | Evidência do teste (2026-11-13) |
|---|---|
| Dashboard operacional | KPIs com ícone, sparkline e delta; filtros com rótulo visível (Período, Projeto, Equipe, Responsável); KPIs são links; foco fica no select após trocar o filtro |
| Projetos | Criação, edição sem mudanças (sem troca de líder e sem auditoria), datas invertidas rejeitadas com `aria-invalid` e foco no campo, arquivar → filtro "Arquivados" → "Desarquivar"; MCP não altera projeto arquivado |
| Tarefas (inspector) | Foco entra no drawer e o Tab fica preso; Esc devolve o foco ao card; propriedades por teclado (Enter, End, Enter); comentário com Ctrl+Enter; título apagado volta com aviso; dependência circular rejeitada; bloqueio só conta com bloqueadora aberta; excluir limpa referências |
| Kanban | Busca preserva foco, texto e caret ("fat" + pausa + "ura" → "fatura"; Home + "X" → "Xfatura"); Espaço abre; Alt+→/← move com anúncio "PCL-103 movida para Em andamento" e o foco segue o card; criação rápida continua aberta; vazio por filtro "11 tarefas ocultas · Limpar filtros"; barra de visão em 1 linha. **VAL-01:** a 1440 a última coluna fica 56 px fora da área visível |
| Backlog / Minhas tarefas / aba Tarefas | Busca mantém foco e texto (digitação com pausas de 300 ms); linhas abrem pelo teclado (`row-link` + Enter); ordenação com `aria-sort` |
| Sprints | Uma sprint ativa por projeto; drawer não oferece sprint encerrada; nomes duplicados rejeitados |
| Cronograma | Barras são links com rótulo completo; rótulo do projeto com `title`; marco ainda cobre o rótulo da barra no início dela (pendente) |
| IA | Planejamento tem precedência sobre palavras de análise ("análise de risco de crédito" gera proposta); chat separado por perfil |
| MCP | 11 ferramentas; 19 payloads inválidos rejeitados (ver Adversarial); erro de JSON no próprio campo: "JSON inválido na linha 2, coluna 20…" com `aria-invalid` |
| Webhooks | `.local` simula falha; reenviar entrega de assinatura excluída não muta nem lança; "Testar" desabilitado em assinatura inativa; segredo só para `webhook.manage` |
| Notificações | Reenvio negado ao Auditor; provedores exigem `notif.manage` |
| Insights | KPIs reagem; editar tarefa concluída não altera os KPIs (`doneAt`); rótulos do gráfico a 12px sem corte a 1440 e a 390 |
| Auditoria | Escopo por organização (Gestor não vê registros da Atlas, exceto as próprias tentativas negadas); origem `mcp`/`ai` nas negações; `eventId` correlaciona status → `task.status_changed.v1` |
| Permissões | Ver cenário G. `canTouchTask` checa escopo antes do papel; Gestor recebe `not_found` em CMA-101 por `tasks_move`, `tasks_update` e `tasks_assign` |
| Camadas e teclado | Modal: foco inicial, 40 Tabs sem sair, `#app` inerte, Esc devolve o foco ao gatilho. Menu de perfil no padrão APG (`menuitemradio`, setas, End, Tab fecha, Esc volta ao gatilho, `aria-expanded` alterna). Esc dentro do drawer fecha só o menu. Confirmação empilha sobre o drawer. Ctrl+K foca a busca em qualquer rota (ignorado com modal aberto); setas e Enter abrem o resultado |
| Navegação móvel (390) | Sidebar inerte quando fechada (o Tab não entra nela); burger com `aria-expanded`; backdrop fecha; Esc fecha e devolve o foco ao burger |
| Persistência | Status, tema escuro e perfil Líder sobrevivem ao reload; alteração gravada logo antes do reload persiste (`flushSave`) |
| Restauração | Só o Admin vê o atalho da sidebar e o botão em Configurações; abre `alertdialog`; Esc cancela; confirmar volta ao seed e persiste. Chamada direta pelo Auditor é negada |
| Exportação | `projectflow-demo.json` baixado com o mesmo número de tarefas e o status atual |
| Temas | Claro, escuro e sistema; seletor de tema como `radiogroup` com `aria-checked` |
| Responsivo | 0 rolagem horizontal da página e do conteúdo a 390, 1024 e 1440 nas 32 rotas e 5 perfis. Tabelas rolam dentro do próprio contêiner, sem coluna fixa |

## Contraste medido

Os valores foram medidos com `getComputedStyle` e conversão por canvas (o canvas resolve
`light-dark()` e `color-mix()`), fundo efetivo por mistura alfa dos ancestrais e opacidade acumulada.
Foram medidos todos os nós de texto visíveis dos 930 estados: **0 abaixo de 4.5:1** (3:1 para texto
≥ 24px ou ≥ 18.66px em negrito), descontado o toast em animação.

| Token | Claro | Escuro |
|---|---|---|
| `--ink` / `--surface` | #1C2127 · 16.20 | #E6E8EB · 14.21 |
| `--ink-2` / `--surface` · `--bg` | #4E5866 · 7.21 · 6.55 | #AEB5BF · 8.44 · 9.15 |
| `--ink-3` / `--surface` · `--bg` · `--surface-2` · `--overlay` | #5F6978 · 5.56 · 5.04 · 4.78 · 5.56 | #8A93A0 · 5.62 · 6.09 · 5.95 · 5.02 |
| `--accent` / `--surface` | #2B5FD9 · 5.61 | #7FA0F4 · 6.84 |
| `--danger` / `--surface`; `--danger-ink` / `--danger` (botão destrutivo) | #B92D2D · 6.04; 6.04 | #EC8279 · 6.68; 7.33 |
| `--warn` / `--surface` | #8F5400 · 6.11 | #E0A95C · 8.31 |
| `--ok` / `--surface` | #1A7346 · 5.86 | #63C98E · 8.54 |
| `--border-ctl` / `--surface` · `--bg` · `--overlay` (≥ 3:1) | #7D8794 · 3.64 · 3.31 · 3.64 | #687180 · 3.54 · 3.84 · 3.16 |
| Anel de foco / `--surface` · `--bg` (≥ 3:1) | 5.61 · 5.09 | 6.84 · 7.42 |

Bordas de controle: 67 controles por tema em 9 rotas, modal e drawer. Ficaram abaixo de 3:1 só:
- os chips de sugestão do Assistente (1.64 e 1.55, decisão de design; VAL-02);
- os campos inline do inspector, que não têm borda em repouso (título e Prazo).

Anel de foco: 44 paradas de Tab no Kanban por tema, todas com anel ≥ 3:1. No seletor de projeto o anel
fica no contêiner, via `:focus-within`.

Paleta de gráficos validada na rodada anterior com o validador da skill de dataviz. Os gráficos usam
série única (magnitude) ou cores de status sempre com ícone e rótulo; nenhuma paleta categórica
multicolorida adjacente. Continua válido: as barras "Tarefas por status" usam a cor do status com
glifo e rótulo (`7e9d614`).

## Adversarial

- **XSS:** 5 payloads (`<img onerror>`, `<script>`, `<svg onload>`, `<iframe src=javascript:>`,
  `javascript:`) em 12 pontos de entrada:
  - título (modal e inspector), descrição, comentário com menção, critério e subtarefa;
  - nome e descrição de projeto, épico, equipe, webhook e sprint;
  - convite, prompt da IA e busca global.

  Nenhuma execução, nenhum nó injetado e nenhum diálogo, após percorrer 17 rotas e os drawers. O
  payload aparece como texto literal.
- **Console MCP:** 19 casos rejeitados com `invalid_json`, `invalid_args`, `not_found` ou `conflict`:
  - JSON truncado; `[]`, `"texto"`, `42`;
  - título de 5.000 caracteres;
  - `{"$ne":null}` como projeto;
  - `tasks_update` tentando trocar `projectId`, `id` e `ref`;
  - `fields:null`; responsável de outra organização; status `__proto__`;
  - chave duplicada; `constructor`/`toString` como chave.

  `__proto__` no objeto de argumentos não polui o protótipo. As telas renderizam depois de todos os
  casos.
- **`localStorage` corrompido, seguido de reload:** 11 variantes:
  - JSON inválido; `null`, string e array;
  - `seedVersion` antigo; schema 1 sem `doneAt` e sem favoritos (migrado sem aviso);
  - sem `tasks`, sem `settings`, `users` vazio;
  - valores fora do domínio (prioridade, status, prazo, título numérico, etiquetas nulas, usuário atual
    inexistente);
  - referências órfãs.

  Em todas, o app abre sem erro, com aviso quando volta ao seed, e as 8 telas principais renderizam.

## Defeitos

### Encontrados nesta validação (2026-11-13), não corrigidos

O código não foi editado nesta rodada.

1. **VAL-01 (média, regressão):** a 1440 px a coluna "Concluído" do Kanban fica cortada 56 px. Causa:
   `.board` tem 1152 px úteis para 5 colunas de mínimo 232 px mais 4 vãos de 12 px (1208 px).
   - Arquivo: `styles.css:1327`. O mínimo era 220 px em `2c17385` e virou 232 px em `095afbb`.
   - Correção: `min-width` ≤ 220 px.
   - Evidência: `output/auditoria/validacao/regressao-kanban-1440-coluna-cortada-light.png`.
2. **VAL-02 (baixa):** borda dos chips de sugestão do Assistente abaixo de 3:1 (`styles.css:1589-1593`).
3. **VAL-03 (baixa):** o atalho `n` (nova tarefa, `js/main.js:46-53`) não está na tabela de atalhos do
   README.
4. Texto (baixa):
   - "Ordenar cards por" (`js/views-work.js:651`);
   - "Restaurar dados da demonstração" na sidebar vs "de demonstração" em Configurações e na
     confirmação (`js/views-core.js:148`, `:325`, `:1247`).

### Corrigidos durante a validação de 2026-10-30 (histórico)

1. Console de teste MCP perdia a resposta porque a execução redesenha a página — estado do console agora persiste entre renders.
2. Botão hambúrguer aparecia no desktop (especificidade de `.btn` sobre `.tb-burger`) — corrigido.
3. Breadcrumb do detalhe do projeto recebia o segmento errado da rota — corrigido.
4. Rótulos de mês colidiam na borda do cronograma — meses parciais estreitos deixam de rotular.
5. Meta dos itens da proposta de IA colava no título — quebra de linha corrigida.

## Problemas conhecidos (não bloqueantes)

- Drag-and-drop não funciona em telas de toque. A alternativa é a propriedade Status no inspector, e
  no teclado Alt+←/→ no card.
- A troca de perfil durante um formulário aberto fecha o overlay (por design, evita estado
  inconsistente).
- Datas do seed são relativas ao primeiro carregamento; "Restaurar dados de demonstração" re-ancora no
  dia atual.
- Pendentes da auditoria (detalhes em `auditoria.md` §4):
  - "Desfazer" em toast;
  - skeleton;
  - seletor de data no inspector;
  - z-index inline no modal;
  - losango do cronograma sobre o rótulo;
  - CODE-35 sem migração do papel salvo;
  - tabelas sem coluna fixa em ≤ 1024;
  - placeholder da busca cortado a 390.
- `light-dark()` exige Chromium 123+, Firefox 120+ e Safari 17.5+, sem fallback no CSS.
- *Resolvido desde 2026-10-30:* a matriz de papéis não depende mais de existir usuário com o papel
  (E2E-31, `PF.roleCaps`).

## Evidências

- `output/auditoria/antes/`: estado de `34d2f52`.
  - 32 rotas × 2 temas a 1440;
  - overlays e estados vazios, de erro e de carregamento;
  - `responsivo/` em 1280/1024/768/390.
- `output/auditoria/ds/`: design system aplicado (`2c17385`), por rota, largura e tema.
- `output/auditoria/depois/`: após as correções e o salto visual.
- `output/auditoria/validacao/`: capturas desta validação (103):
  - **Rotas:** `rota-*-{1440,390}-{light,dark}.png`.
  - **Estados:** drawer, modal com erro, menu de perfil, avisos, navegação móvel aberta, acesso
    restrito do Auditor, segredo mascarado, Kanban da Dev.
  - **Cenários:** `A-modal-projeto`, `B-kanban-filtro`, `C-drawer-entrega`, `D-proposta`,
    `F-auditoria-diff`, cada um nos dois temas.
  - **Avulsas:** `xss-texto-literal-auditoria`, `mcp-json-invalido`, `persistencia-tema-escuro-lider`,
    `regressao-kanban-1440-coluna-cortada-light`.
- Scripts da validação independente (temporários, fora do repositório), em
  `%TEMP%/claude/…/scratchpad/validate/`:
  - `v1-scenarios`; `v2-findings`; `v3-sweep` com `sweep-fn.js`;
  - `v4-keyboard-persist`; `v5-adversarial`; `v6-borders`; `v7-shots`; `v8-low`.

## Limitações de processo registradas

- **Grupo "Projetos Pessoais" no Orca:** o projeto foi criado e o workspace nomeado
  "ProjectFlow AI — Protótipo" via CLI, mas a CLI desta versão não expõe a atribuição
  de grupo (`projectGroupId`) — mover o card para o grupo "Projetos Pessoais" é um
  arrasto na UI do Orca. Não afirmo que essa etapa foi executada.
- **Pesquisa visual:** uitopic.com e as demais referências não foram navegadas ao vivo;
  a direção veio das skills de design instaladas (impeccable/craft-floor, dark-interfaces,
  dataviz) e dos padrões consolidados de Linear/Jira/ClickUp, registrados em `DESIGN.md`.
- **Validação de 2026-11-13:** feita só em Chromium. Firefox e Safari não foram exercitados, o que
  importa por causa do `light-dark()`. Os 15 achados marcados "Declarado" em `auditoria.md` foram
  aceitos sem roteiro próprio.
