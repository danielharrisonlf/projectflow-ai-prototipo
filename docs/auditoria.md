# Auditoria consolidada — ProjectFlow AI (protótipo)

Data: 2026-11-13 · Base auditada: `34d2f52` · Correções: `aaf592e..e7793a0` (18 commits em `main`)
Validação independente: Chromium do Playwright, 1440 e 390 px (mais 1024 na varredura), temas claro e escuro, 5 perfis.

## 1. Resumo executivo

**Veredito da validação independente: aprovado pelo critério de pronto.** Não há achado crítico ou
alto aberto. Os cenários A–G passam com os 5 perfis nos dois temas (59/59 verificações em cada tema).
Nenhum erro de console apareceu em 930 estados de tela. O texto atinge AA em todos os estados medidos,
e não sobrou valor fixo relevante fora dos tokens. A validação achou uma regressão média (a coluna
"Concluído" do Kanban cortada a 1440 px, que reabria o UI-33) e três pontos baixos. **Os quatro já
foram corrigidos e verificados depois da validação; ver §6.** Ficam 8 achados com correção
parcial, todos de severidade média ou baixa e justificados na §4.

### Achados originais por fonte e severidade

| Fonte | Crítica | Alta | Média | Baixa | Total |
|---|---|---|---|---|---|
| E2E funcional (`E2E-xx`) | 0 | 3 | 13 | 19 | 35 |
| Revisão de código (`CODE-xx`) | 0 | 5 | 19 | 15 | 39 |
| UI/UX e acessibilidade (`UI-xx`) | 5 | 11 | 24 | 23 | 63 |
| **Total bruto** | **5** | **19** | **56** | **57** | **137** |

### Depois da deduplicação

São 28 duplicados: 21 E2E e 7 UI apontam para um achado `CODE`. Restam **109 achados únicos**. A
severidade de cada um é a maior entre os aliases. Exemplo: o CODE-04, médio na revisão de código,
vira crítico porque é o mesmo problema do UI-01.

| Severidade (única) | Qtde | Validado nesta rodada | Conferido no código | Declarado, não reverificado | Parcial | Reaberto |
|---|---|---|---|---|---|---|
| Crítica | 4 | 4 | — | — | — | — |
| Alta | 16 | 16 | — | — | — | — |
| Média | 41 | 30 | 3 | 4 | 3 | 1 |
| Baixa | 48 | 25 | 6 | 11 | 6 | — |
| **Total** | **109** | **75** | **9** | **15** | **9** | **1** |

- **Corrigidos:** 99. São 75 reproduzidos e confirmados nesta validação, 9 conferidos por leitura de
  código ou varredura estática e 15 aceitos como declarados pelos corretores, todos de severidade
  média ou baixa.
- **Pendentes:** 10. São 9 correções parciais e 1 regressão (UI-33). Nenhum deles é crítico ou alto.
- **Duplicados:** 28, consolidados na tabela da §3 como aliases.

Legenda de status:
- **Validado:** reproduzido pelo passo original e confirmado nesta rodada.
- **Conferido:** verificado por leitura de código, varredura estática ou captura, sem reproduzir o passo.
- **Declarado:** aceito com base no `status.md` dos corretores, sem reverificação independente.
- **Parcial:** a parte principal foi corrigida e sobra algo listado na §4.
- **Reaberto:** voltou a falhar (§5).

## 2. Metodologia

1. **Três auditorias paralelas sobre `34d2f52`.** Nenhuma alterou código.
   - **E2E funcional:** cenários A–G, permissões por caminhos alternativos (ação direta, drop
     sintético, MCP), CRUD, XSS e persistência.
   - **Revisão de código:** leitura integral de `index.html`, `styles.css` e `js/*.js`, com hipóteses
     confirmadas no Chromium.
   - **UI/UX e acessibilidade:** teclado, foco, ARIA, contraste medido, responsividade em 5 larguras e
     inventário de tokens.
   - Capturas "antes": `output/auditoria/antes/`.
2. **Design system** (`2c17385`, `DESIGN.md`):
   - tokens claro/escuro com `light-dark()`;
   - escalas de espaço, tipo, raio, z-index e movimento;
   - componentes com todos os estados;
   - contraste AA por construção.
   - Capturas: `output/auditoria/ds/`.
3. **Correções de lógica e marcação** (`aaf592e` → `43d5de4`), em temas:
   - render e foco;
   - camadas;
   - permissões;
   - regras de negócio;
   - dados e migração;
   - componentes acessíveis;
   - texto;
   - alinhamento da marcação ao design system.
4. **Salto visual** (`095afbb` → `ed158f5`), seguido da documentação (`cfa3559`, `e7793a0`):
   - moldura;
   - KPIs com sparkline;
   - barra de visão do Kanban;
   - inspector de tarefa;
   - gráficos na largura real.
   - Capturas "depois": `output/auditoria/depois/`.
5. **Validação independente** (este documento e `docs/relatorio-validacao.md`). Os scripts são
   próprios, sem reaproveitar os dos corretores, e os desses também foram executados para comparação.
   Todos foram escritos sem editar o código. Foram 8 roteiros:
   - cenários A–G por perfil e tema;
   - reprodução de achados em 59 verificações;
   - varredura de 32 rotas × 5 perfis × 2 temas × (1440, 390, e 1024 no claro), mais camadas:
     drawer, modal com erro, menu, avisos, navegação móvel e busca;
   - teclado;
   - persistência, restauração e exportação;
   - XSS, payloads MCP e 11 variantes de `localStorage` corrompido;
   - bordas de controle e anel de foco.
   - Capturas: `output/auditoria/validacao/`.

## 3. Tabela consolidada (deduplicada)

Os aliases (duplicados) ficam entre parênteses. "Commit" é o commit que corrigiu o achado.

### Crítica (4)

| ID | Sev. | Área | Descrição curta | Status | Commit |
|---|---|---|---|---|---|
| CODE-04 (UI-01, UI-02) | Crítica | Foco/busca | Buscas do Kanban e das tabelas perdiam foco e texto a cada tecla | Validado | aaf592e |
| CODE-22 (UI-04) | Crítica | Leitor de tela | `#app` era live region e anunciava a página inteira | Validado | aaf592e |
| CODE-24 (UI-05) | Crítica | Teclado | Linhas de tabela, cabeçalhos, KPIs e barras só respondiam a mouse | Validado | 73d96eb |
| UI-03 | Crítica | Foco | Qualquer re-render mandava o foco para `<body>` | Validado | aaf592e |

### Alta (16)

| ID | Sev. | Área | Descrição curta | Status | Commit |
|---|---|---|---|---|---|
| CODE-01 | Alta | Regras/datas | `daysLeft` com erro de um dia: ontem não contava como atraso | Validado | 5a13d9c |
| CODE-02 (E2E-02) | Alta | Permissão | Gestor alterava tarefas de outra organização pelo MCP | Validado | 8c3eea1 |
| CODE-03 (E2E-01, E2E-07, E2E-17, E2E-18) | Alta | MCP/dados | Entrada sem validação corrompia o estado de forma persistente | Validado | 5a13d9c |
| CODE-05 | Alta | Projetos | Salvar projeto sem mudanças trocava o responsável | Validado | 8c3eea1 |
| CODE-09 (E2E-03) | Alta | Permissão | Segredo HMAC revelado/copiado sem `webhook.manage` | Validado | 8c3eea1 |
| CODE-20 (UI-21, E2E-11) | Alta | Dados | "Restaurar demonstração" sem confirmação e para qualquer perfil | Validado | 8c3eea1 |
| CODE-21 (UI-11) | Alta | Responsivo/teclado | Navegação off-canvas sem backdrop, Esc e `inert` | Validado | d4f628f |
| CODE-23 (UI-09) | Alta | Formulários | Labels sem `for`/`id` e campos sem nome acessível | Validado | 73d96eb |
| UI-06 | Alta | Modal | Sem foco preso, fundo inerte e retorno ao gatilho | Validado | d4f628f |
| UI-07 | Alta | Drawer | Foco não entrava no drawer e Tab vazava | Validado | d4f628f |
| UI-08 | Alta | Menus | Sem padrão APG (setas, Tab, `aria-expanded`) | Validado | d4f628f |
| UI-10 | Alta | Kanban | Mover tarefa exigia mouse | Validado | 73d96eb |
| UI-25 | Alta | Contraste | `--ink-3` abaixo de 4.5:1 nos dois temas | Validado | 2c17385 |
| UI-26 | Alta | Contraste | `.btn-danger` no escuro com 2.85:1 | Validado | 2c17385 |
| UI-27 | Alta | Contraste | Bordas de controle entre 1.36 e 1.80:1 | Validado (ressalva na §6) | 2c17385 |
| UI-32 | Alta | Responsivo | Rolagem horizontal do conteúdo em 6 rotas a 390 px | Validado | 2c17385 |

### Média (41)

| ID | Sev. | Área | Descrição curta | Status | Commit |
|---|---|---|---|---|---|
| CODE-06 | Média | Performance | Listener de clique acumulado a cada render | Validado | aaf592e |
| CODE-07 (E2E-04) | Média | Permissão | `task.assign` só era checado no MCP | Validado | 8c3eea1 |
| CODE-08 (E2E-05, E2E-21) | Média | Permissão | Auditor reenviava notificações; favoritos eram globais | Validado | 8c3eea1 |
| CODE-10 (E2E-14) | Média | Escopo | Dados da Atlas vazavam para perfis da Vetor Labs | Validado | 8c3eea1 |
| CODE-11 (E2E-23) | Média | Escopo | Chat da IA e console MCP sobreviviam à troca de perfil | Validado | 8c3eea1 |
| CODE-12 (E2E-08, E2E-20) | Média | Regras | Dependências penduradas e remoção sem auditoria | Validado | 5a13d9c |
| CODE-13 (E2E-27) | Média | Equipes | `createTeam` não atualizava `user.teamIds` | Validado | 8c3eea1 |
| CODE-14 (E2E-09) | Média | Webhooks | Reenviar entrega de assinatura excluída lançava TypeError | Validado | 5a13d9c |
| CODE-15 (E2E-15) | Média | Projetos | Arquivar não tinha volta; MCP alterava projeto arquivado | Validado | 5a13d9c |
| CODE-16 | Média | Filtros | Filtros presos a outro projeto ou perfil | Validado | 5a13d9c |
| CODE-17 (E2E-10) | Média | Insights | Data de conclusão inferida de `updatedAt` | Validado | 0f8f8f9 |
| CODE-18 | Média | Auditoria | Negações registradas sempre com origem `ui` | Validado | 8c3eea1 |
| CODE-19 | Média | Auditoria | Diffs espúrios por ordem de arrays | Validado | 5a13d9c |
| CODE-29 (E2E-13) | Média | Sprints | Duas sprints ativas no mesmo projeto | Validado | 5a13d9c |
| CODE-33 (E2E-12) | Média | Webhooks | URL `.local` não simulava falha | Validado | 5a13d9c |
| E2E-06 | Média | Projetos | Entrega anterior ao início era aceita | Validado | 5a13d9c |
| E2E-16 | Média | MCP | `tasks_assign` aceitava pessoa de fora do projeto/organização | Validado | 8c3eea1 |
| UI-12 | Média | Teclado | Esc fechava menu e drawer juntos | Validado | d4f628f |
| UI-13 | Média | Formulários | Erro sem `aria-invalid` e sem foco no 1º inválido | Validado | 73d96eb |
| UI-14 | Média | Estrutura | Sem `<main>`, `<header>` e skip link | Validado | aaf592e |
| UI-15 | Média | ARIA | Abas e segmentados sem semântica | Validado | 73d96eb |
| UI-16 | Média | Tabelas | Ordenação sem botão e sem `aria-sort` | Validado | 73d96eb |
| UI-17 | Média | Teclado | KPIs e barras do gantt clicáveis sem foco | Validado | 73d96eb |
| UI-18 | Média | ARIA | Informação só no tooltip (prioridade, tipo, avatar) | Validado | 73d96eb |
| UI-19 | Média | Avisos | Toast sem fechar, sem pausa, sem limite, sem ação | **Parcial** (sem "Desfazer") | 73d96eb |
| UI-22 | Média | Kanban | Vazio por filtro sem "N ocultas · Limpar" | Validado | 73d96eb |
| UI-28 | Média | Avatares | Iniciais de 8.5px; equipe como avatar | Conferido (exceção documentada: iniciais 10–11px) | 2c17385, 095afbb |
| UI-29 | Média | Gráficos | Rótulos de ~5–8px e último rótulo cortado | Validado | 13f6ee6 |
| UI-33 | Média | Kanban | Coluna "Concluído" fora da tela a 1440 | **Reaberto** (regressão de 095afbb, §5) | 2c17385 → 095afbb |
| UI-34 | Média | Tabelas | Tabelas rolam em ≤1024 sem coluna fixa nem layout alternativo | **Parcial** | 2c17385 |
| UI-35 | Média | Cronograma | Rótulos cortados e losango sobre o texto da barra | **Parcial** (losango) | 73d96eb, 2c17385 |
| UI-36 | Média | Kanban | Barra de filtros em 2–3 linhas | Validado | 48aeccb |
| UI-40 | Média | Design system | 163 espaçamentos fora da escala | Conferido (resta 1 literal: `72px` na busca) | 2c17385 |
| UI-41 | Média | Tipografia | Tamanhos fora da escala e abaixo do piso | Validado (só iniciais de avatar < 12px) | 2c17385 |
| UI-42 | Média | Foco | `:focus-visible` mudava a forma do elemento | Conferido (anel ≥ 3:1 em 44 paradas de Tab) | 2c17385 |
| UI-43 | Média | Design system | Três "linhas de lista" para o mesmo conceito | Declarado | 095afbb, f9be2ef |
| UI-44 | Média | Design system | Botões e controles divergentes | Declarado | 2c17385 |
| UI-45 | Média | Design system | Estados de componente faltando | Declarado | 2c17385 |
| UI-46 | Média | Hierarquia | Hierarquia visual fraca | Declarado | f9be2ef |
| UI-47 | Média | Inspector | Drawer de tarefa parecia formulário | Validado (prazo segue `input type=date`, §4) | 48aeccb |
| UI-54 | Média | Texto | "Origem" da auditoria escrita de 4 formas | Validado | fa4de02 |

### Baixa (48)

| ID | Sev. | Área | Descrição curta | Status | Commit |
|---|---|---|---|---|---|
| CODE-25 | Baixa | Datas | "Hoje" calculado em UTC | Conferido (`PF.todayLocal`) | 5a13d9c |
| CODE-26 | Baixa | Dados | `PF.load` sem validação nem migração | Validado (11 variantes) | 0f8f8f9 |
| CODE-27 (E2E-24) | Baixa | Sidebar | Badge "Minhas tarefas" contava subtarefas | Validado | 8c3eea1 |
| CODE-28 | Baixa | Escopo | Sino e página de notificações com escopos diferentes | Declarado | 8c3eea1 |
| CODE-30 | Baixa | Ordenação | Comparadores sem empate (ordem instável) | Declarado | 5a13d9c |
| CODE-31 | Baixa | Camadas | Confirmação fechava o drawer; Promise sem resolver | Validado | d4f628f |
| CODE-32 | Baixa | Área de transferência | "Copiado" aparecia mesmo com falha | Declarado | 8c3eea1 |
| CODE-34 | Baixa | Permissão | Provedores protegidos por `webhook.manage` | Validado | 8c3eea1 |
| CODE-35 | Baixa | Seed | Líderes de equipe com papel `dev` | **Parcial** (sem migração, §4) | 0f8f8f9 |
| CODE-36 | Baixa | IA | Contagem e órfãos ao aplicar a proposta | Validado (contagem 7 tarefas e 2 épicos) | 5a13d9c |
| CODE-37 | Baixa | Auditoria | Evento correlacionado errado no drawer | Validado (`eventId`) | 5a13d9c |
| CODE-38 | Baixa | Código | Código morto e sinks latentes de XSS | Conferido | fa4de02 |
| CODE-39 | Baixa | CSS/ARIA | Seletores mortos, z-index sem token, ARIA menor | **Parcial** (z-index inline no modal) | d4f628f, 73d96eb, 2c17385 |
| E2E-19 | Baixa | Regras | Dependência circular aceita | Validado | 5a13d9c |
| E2E-22 | Baixa | IA | Briefing de planejamento caía na análise de risco | Validado | 5a13d9c |
| E2E-25 | Baixa | Dados | Alteração perdida ao recarregar em < 120 ms | Validado | 0f8f8f9 |
| E2E-26 | Baixa | Dados | Excluir projeto deixava épicos e comentários órfãos | Declarado | 5a13d9c |
| E2E-28 | Baixa | Validação | Épico, sprint, equipe e e-mail duplicados | Validado (modais; equipe e e-mail só no modal) | 5a13d9c |
| E2E-29 | Baixa | Permissão | "Mover para" em tarefa somente leitura | Validado | 8c3eea1 |
| E2E-30 | Baixa | Sprints | Drawer associava sprint encerrada | Validado | 5a13d9c |
| E2E-31 | Baixa | Papéis | Matriz zerava papel sem usuários | Validado | 8c3eea1 |
| E2E-32 | Baixa | Avisos | Enxurrada de toasts ao aplicar a proposta | Validado | 73d96eb |
| E2E-33 | Baixa | Kanban | Criação rápida fechava após cada Enter | Validado | 5a13d9c |
| E2E-34 | Baixa | Drawer | Título apagado ignorado sem aviso | Validado | 5a13d9c |
| E2E-35 | Baixa | Webhooks | "Testar" funcionava em assinatura inativa | Validado | 5a13d9c |
| UI-20 | Baixa | ARIA | Barras de progresso sem min, max e rótulo | Validado | 73d96eb |
| UI-23 | Baixa | Estados | Estados vazios em três padrões | Declarado | 73d96eb, 43d5de4 |
| UI-24 | Baixa | Estados | Sem skeleton, erro de gravação ou erro JSON legível | **Parcial** (sem skeleton) | 0f8f8f9, 73d96eb |
| UI-30 | Baixa | Contraste | Logo do Insights no escuro com 2.68:1 | Validado | 2c17385 |
| UI-31 | Baixa | Tokens | Cores categóricas em hex fixo | Conferido (`PF.catVar` → `--cat-N`) | 095afbb |
| UI-37 | Baixa | Responsivo | Stat strip com bordas erradas em 390/768 | Declarado | 2c17385 |
| UI-38 | Baixa | Topbar | Breadcrumb cortado a 1024; placeholder cortado a 390 | **Parcial** (placeholder) | 2c17385, f9be2ef |
| UI-39 | Baixa | Consistência | Seletor de projeto em posições diferentes | Validado | 48aeccb |
| UI-48 | Baixa | Tokens | Raios fora dos tokens | Conferido (0 literais) | 2c17385 |
| UI-49 | Baixa | Tokens | Sombras em controles | Conferido | 2c17385 |
| UI-50 | Baixa | Tooltip | Duas implementações de tooltip | Declarado | 13f6ee6 |
| UI-51 | Baixa | Cor | Cor semântica em texto que não é estado | Declarado | fa4de02 |
| UI-52 | Baixa | Gráficos | Barras de status sem a cor do status | Validado | 7e9d614 |
| UI-53 | Baixa | Modal | "Nova tarefa" denso e sem atalho de envio | Validado (Ctrl+Enter) | 48aeccb |
| UI-55 | Baixa | Texto | "Meus projetos" vs "Projetos" | Validado | fa4de02 |
| UI-56 | Baixa | Texto | Pessoa, membro e usuário misturados | Declarado | fa4de02 |
| UI-57 | Baixa | Texto | "Datas" e "entregas" ambíguos | Declarado | fa4de02 |
| UI-58 | Baixa | Texto | Plurais com "(s)" | Conferido | fa4de02 |
| UI-59 | Baixa | Texto | Etiquetas sem acento | Validado | fa4de02 |
| UI-60 | Baixa | Texto | Jargão interno e caixa alta | **Parcial** ("Ordenar cards por") | fa4de02 |
| UI-61 | Baixa | Texto | Capitalização dos chips | Declarado | fa4de02 |
| UI-62 | Baixa | Texto | "Bom dia" fixo | Validado | fa4de02 |
| UI-63 | Baixa | Texto | Rótulos ambíguos | **Parcial** ("Restaurar dados da/de demonstração") | fa4de02, f9be2ef |

## 4. Pendentes e justificativas

| Item | Situação | Justificativa / próximo passo |
|---|---|---|
| **UI-19:** "Desfazer" no toast | Não feito | Desfazer exige reverter cada mutação e o que ela já disparou: auditoria, evento, entrega de webhook e notificação. Na implementação definitiva, isso vira uma ação compensatória no serviço, com o próprio registro de auditoria. Fechar, pausar, agrupar e limitar a 3 foram entregues. |
| **UI-24:** skeleton | Não feito | Toda operação do protótipo é síncrona; um skeleton exigiria atraso artificial. As classes `.skeleton` existem no CSS para o React/Vue. |
| **UI-47:** seletor de data no inspector | Não feito | "Prazo" segue como `input type=date` nativo, sem o popover de data curta ("14 nov") sugerido no `ds-markup.md`. É funcional e acessível, mas destoa dos demais `prop-btn`. |
| **CODE-39:** z-index inline | Parcial | `PF.modal` aplica `style="z-index: 95 + 2n"` (`js/core.js:1394-1395`) para empilhar confirmação sobre drawer. Os números batem com `--z-modal`, mas o valor não vem do token. Ler `--z-modal` via `getComputedStyle` resolve. |
| **UI-35:** losango do cronograma | Parcial | O marco (`.g-ms`, `left: calc(x% - 7px)` em `js/views-work.js:980`) ainda cobre o rótulo da barra quando cai no início dela. Exemplo: "◆JV · 33%" em Migração para Nuvem (`rota-timeline-1440-dark.png`). A correção é uma faixa própria para marcos ou o rótulo fora da barra. |
| **CODE-35:** sem migração | Parcial (decisão) | O seed passou os líderes u12, u13, u14 e u16 a `lead`. Um estado já salvo mantém o papel antigo de propósito, para não sobrescrever escolhas da pessoa. O efeito colateral (CODE-05) foi corrigido à parte. |
| **UI-34:** tabelas em ≤1024 | Parcial | Não há rolagem da página, mas a tabela rola dentro do `.tbl-wrap` sem coluna de identificação fixa e sem layout de lista abaixo de 640 px. A 390 px, Status e Progresso ficam à direita, fora da vista. |
| **UI-38:** placeholder da topbar a 390 | Parcial | O título da página agora aparece na topbar móvel. O placeholder "Buscar tarefas e projetos…" é cortado em "Buscar tarefas e p". O sugerido era "Buscar…" ou um botão de ícone que abre a busca. |
| **UI-60 / UI-63:** texto | Parcial | O menu de ordenação do Kanban diz "Ordenar cards por" (`js/views-work.js:651`). O rótulo da restauração diverge: a sidebar diz "Restaurar dados **da** demonstração" (`views-core.js:148`); Configurações e o título da confirmação dizem "**de**" (`views-core.js:325`, `:1247`). |

## 5. Achados da validação independente

| ID | Sev. | Descrição | Passos | Esperado | Obtido | Provável |
|---|---|---|---|---|---|---|
| VAL-01 (reabre UI-33) | Média | Regressão: a 1440 px a coluna "Concluído" do Kanban fica cortada | Admin → Kanban (PCL), viewport 1440×900 | 5 colunas visíveis, como diz o comentário do CSS ("cabem 5 em 1440") e o commit `2c17385` | `.board` com `scrollWidth 1208 > clientWidth 1152`; borda direita da última coluna em x=1472 (56 px além da janela) | `styles.css:1327`: `.col { min-width: 232px }`, alterado de 220px no commit `095afbb`. Cabem 5 colunas com mínimo ≤ 220px ((1152 − 4×12) / 5 = 220,8). Evidência: `output/auditoria/validacao/regressao-kanban-1440-coluna-cortada-light.png` |
| VAL-02 | Baixa | Chips de sugestão do Assistente com borda de 1.64:1 (claro) e 1.55:1 (escuro) | Assistente de IA, sem conversa | Pelo DESIGN.md §1.6, bordas de controle ≥ 3:1 | `.chat-suggest .btn { border-color: var(--border-2) }` | `styles.css:1589-1593`. É decisão consciente ("sugestões são prompts… formato de chip"), e o texto identifica o botão, então WCAG 1.4.11 não exige a borda. Mas contradiz a regra do próprio design system. |
| VAL-03 | Baixa | Atalho `n` (nova tarefa) não aparece na tabela de atalhos do README | Ler README §Atalhos; `js/main.js:46-53` | Atalho documentado | Ausente | README.md, tabela "Atalhos de teclado" |

Nenhuma falha encontrada em: XSS (5 payloads em 12 pontos de entrada), payloads inválidos do MCP
(19 casos) e `localStorage` corrompido (11 variantes). Os detalhes estão no `relatorio-validacao.md`.

## 6. Riscos e observações

- **`light-dark()` exige Chromium 123+, Firefox 120+ e Safari 17.5+.** Em navegador mais antigo, os
  tokens de cor são descartados e a interface fica sem cores de superfície e texto. Não há fallback.
  Se o público usar Safari < 17.5 (iOS 17.4 ou anterior), vale um bloco `@supports not
  (color: light-dark(#000, #fff))` com os valores do tema claro.
- **Exceção ao piso de 12px:** as iniciais de avatar usam 10–11px (`--text-10`/`--text-11`). A
  exceção está documentada no DESIGN.md e o nome também está no `aria-label`. É a única ocorrência
  abaixo de 12px em 930 estados medidos.
- **UI-27, ressalva:** os campos inline do inspector (título e "Prazo") não têm borda em repouso, por
  decisão de design (estilo painel de propriedades). A borda aparece no hover e no foco. A identificação
  vem do rótulo da linha e do ícone. Fora isso e o VAL-02, 67 controles por tema medem ≥ 3:1.
- **Avisos de erro persistem até serem fechados (UI-19).** Numa sequência de negações, três avisos
  ocupam o canto inferior direito por cima de conteúdo (≈ 360×260 px a 1440). É o comportamento
  pedido, mas convém lembrar disso em demonstrações.
- **Filtros sem escopo persistem entre perfis.** Ação, origem e entidade da Central de auditoria
  continuam aplicados após trocar de perfil; só usuário e projeto são zerados. Isso é coerente, porque
  esses filtros não vazam dados, mas pode surpreender numa demo. O botão "Limpar" fica visível.
- **Validação só no modal:** equipe e e-mail duplicados são barrados no modal, não em `act.*`. Hoje não
  há caminho alternativo (sem ferramenta MCP para isso), mas a regra precisa estar no serviço
  (`ms-identity`) na implementação definitiva.
- **Mensagem de dado não lido:** um `localStorage` com `null`, string ou array mostra "eram de outra
  versão da demonstração". Seria mais exato dizer "não puderam ser lidos". É só texto; o
  comportamento (voltar ao seed com aviso) está correto.
- **Fontes:** IBM Plex vem do Google Fonts. Sem internet, cai na fonte do sistema e as medidas de
  largura (ex.: Kanban) mudam um pouco.
- **Escopo da validação:** os 15 itens "Declarado" (texto, estados e consistência visual) foram aceitos
  com base no `status.md` e nas capturas, sem roteiro próprio. Nenhum deles é crítico ou alto.

## 6. Correções pós-validação

| ID | Correção | Verificação |
|---|---|---|
| VAL-01 / UI-33 | `.col { min-width: 216px }` em `styles.css`. As 5 colunas cabem em 1440 px. | `.board` com `scrollWidth 1152 = clientWidth 1152`; última coluna termina em x=1416, nos dois temas (`output/auditoria/validacao/fix-kanban-1440-{light,dark}.png`) |
| VAL-02 | Chips de sugestão usam `--border-ctl` (hover em `--border-ctl-hover`). | Borda medida: 3.64:1 no claro e 3.54:1 no escuro |
| VAL-03 | Atalho `n` incluído na tabela de atalhos do README. | — |
| UI-60 / UI-63 (resíduo) | "Ordenar cards por" virou "Ordenar tarefas por". O rótulo de restauração ficou "Restaurar dados de demonstração" em todos os pontos. | `grep` sem ocorrências restantes |

Regressões reexecutadas depois dessas correções: `f7-scenarios` (A–G) 16/16 PASS; `f0-sweep`
(32 rotas × 5 perfis × temas × 390 px) TOTAL 0; `f2-layers` e `f6-components` sem erros; zero erros
de console.
