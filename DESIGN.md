# ProjectFlow AI — Design system

Fonte de verdade visual do protótipo. A implementação fica em `styles.css`, organizado em camadas
comentadas: tokens → base → layout/shell → componentes → views → utilitários → responsivo.
Qualquer valor novo de cor, espaço, fonte, raio, sombra, z-index ou duração entra primeiro como
token aqui e em `:root`. Componente nenhum usa valor solto.

---

## 1. Princípios

**Cena de uso.** Equipes de engenharia, gestão e consultoria em escritório, em sessões longas (2h+),
com desktop como foco. O modo é **Operate**: familiaridade e densidade são features, e expressão
visual é ruído. Referência de acabamento: Linear, Height, Jira moderno.

1. **Precisão silenciosa.** Cor só para estado (ok, atenção, erro, informação, seleção). Neutros
   carregam a estrutura.
2. **Densidade regular.** Base de 13px, linhas de 32–40px, controles de 32px. Nada aumenta "para
   respirar" quando a tarefa é varrer dados.
3. **Hierarquia por tipo e peso, não por caixas.** Título de página 24/600, título de painel 14/600,
   corpo 13/400, metadado 12. Sem card dentro de card.
4. **Dois temas de primeira classe.** O escuro tem valores próprios (acento mais claro e
   dessaturado, sólidos com texto escuro). Não é inversão do claro.
5. **Estado visível, sempre.** Todo controle entrega default, hover, pressionado, foco, desabilitado,
   carregando, selecionado e erro.
6. **Acessível por construção.** Texto ≥ 4.5:1, bordas de controle e anel de foco ≥ 3:1, piso de
   12px, foco que não muda a forma do elemento.

**Identidade.** Sem gradientes decorativos, barras de acento laterais, emoji como ícone, eyebrows em
caixa alta ou cards aninhados. Ícones são SVG autorais de traço único (1.6px em 24×24, `currentColor`).
Sombra só em overlays.

---

## 2. Mecanismo de tema

Cada token de cor é declarado uma única vez com os dois valores: `--bg: light-dark(#F2F4F7, #0E1116)`.
Quem decide o tema é a propriedade `color-scheme`:

| Situação | Regra | Resultado |
|---|---|---|
| Padrão (preferência "Sistema") | `:root { color-scheme: light dark }` | segue `prefers-color-scheme` |
| Usuário escolheu claro | `:root[data-theme="light"] { color-scheme: light }` | claro |
| Usuário escolheu escuro | `:root[data-theme="dark"] { color-scheme: dark }` | escuro |

`PF.applyTheme()` só põe ou remove `data-theme` no `<html>`; `main.js` aplica o tema persistido antes
do primeiro paint. Durante a troca, `html.theme-switching` desliga transições e animações (flash
killer). `color-scheme` também tematiza controles nativos (calendário do `type=date`, lista do
`<select>`, scrollbar). Requer navegador com `light-dark()` (Chromium 123+, Firefox 120+, Safari 17.5+).

Cores que vêm do dado (`--av` do avatar, `--lc` da etiqueta, hex do tema claro) são clareadas no
escuro por `light-dark(var(--av), color-mix(in oklab, var(--av) 58%, #fff))`, com iniciais em
`--on-cat` (texto escuro). Assim os dados continuam guardando um único hex.

---

## 3. Tokens de cor

Contraste medido (WCAG 2.x). "Pior caso" = menor razão entre `--bg`, `--surface`, `--surface-2`,
`--overlay` e `--selected` do mesmo tema. Os valores das telas reais foram conferidos com
`getComputedStyle` em 19 rotas, drawer, modal, menu e toasts, nos dois temas.

### 3.1 Neutros

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#F2F4F7` | `#0E1116` | fundo da aplicação |
| `--surface` | `#FFFFFF` | `#161A21` | painel, sidebar, topbar, card |
| `--surface-2` | `#EBEEF2` | `#10141A` | rebaixado: coluna do Kanban, código, trilho de controle segmentado |
| `--surface-hover` / `--surface-press` | `#F2F4F7` / `#E6E9EE` | `#1C212A` / `#232934` | hover/pressão opacos (botão secundário, linha de tabela) |
| `--overlay` | `#FFFFFF` | `#1E242E` | menu, drawer, modal, toast (no escuro, elevação = superfície mais clara) |
| `--neutral-bg` | `#EBEEF2` | `#252B35` | chip neutro, contador, balão da IA |
| `--hover` / `--press` | ink 5.5% / 10% | ink 6% / 11% | véu translúcido de hover/pressão (ghost, menu, item de nav) |
| `--selected` | `#E8EEFC` | `#1D2738` | item de nav ativo, linha/card selecionado |
| `--track` | `#E3E7ED` | `#2A303A` | trilho de progresso |
| `--scrim` | `#101620` 40% | `#000` 56% | véu atrás de drawer, modal e nav móvel |

### 3.2 Texto

| Token | Claro | Pior caso | Escuro | Pior caso | Uso |
|---|---|---|---|---|---|
| `--ink` | `#1C2127` | 13.92 | `#E6E8EB` | 12.22 | texto principal, títulos |
| `--ink-2` | `#4E5866` | 6.20 | `#AEB5BF` | 7.26 | rótulos, metadados, cabeçalho de tabela |
| `--ink-3` | `#5F6978` | 4.78 | `#8A93A0` | 4.83 | terciário: datas, refs, contadores, placeholder |
| `--ink-disabled` | `#9AA3AF` | — | `#5A626E` | — | só desabilitado (isento pela WCAG) |

No claro, `--ink-2` e `--ink-3` ficam próximos de propósito: os dois passam AA, e o terciário se
diferencia mais por tamanho (12px) e posição do que por cor.

### 3.3 Bordas

| Token | Claro | Escuro | Contraste | Uso |
|---|---|---|---|---|
| `--border` | `#D8DEE6` | `#262B33` | decorativo | divisores, contorno de painel e card |
| `--border-2` | `#C3CBD5` | `#343B46` | decorativo | divisor forte, hover de card, scrollbar |
| `--border-ctl` | `#7D8794` | `#687180` | claro 3.13–3.64 · escuro 3.05–3.84 | contorno de input, select, textarea, checkbox, trilho do switch, botão secundário |
| `--border-ctl-hover` | `#5F6978` | `#8A93A0` | > 4.5 | hover de controle |

### 3.4 Acento e estados

Cada estado tem quatro papéis: `--X` (sólido **e** texto sobre superfícies), `--X-bg` (fundo suave),
`--X-border` (contorno do suave) e `--X-ink` (texto sobre o sólido). O acento tem ainda `--accent-fg`
(texto/ícone de acento, um pouco mais escuro no claro) e `--accent-hover`/`--accent-press`. Os
aliases `--X-soft` = `--X-bg` existem porque o JS os usa em estilos inline.

| Token | Claro | Escuro | Texto, pior caso (C / E) | Sobre o próprio `-bg` (C / E) | `-ink` sobre sólido (C / E) |
|---|---|---|---|---|---|
| `--accent` | `#2B5FD9` | `#7FA0F4` | 4.82 / 5.89 | 4.83 / 5.89 | 5.61 / 7.42 |
| `--accent-fg` | `#2453C7` | `#8EABF5` | 5.75 / 6.64 | 5.76 / 6.64 | — |
| `--ok` | `#1A7346` | `#63C98E` | 5.03 / 7.34 | 5.06 / 7.51 | 5.86 / 9.25 |
| `--warn` | `#8F5400` | `#E0A95C` | 5.25 / 7.14 | 5.38 / 7.45 | 6.11 / 9.00 |
| `--danger` | `#B92D2D` | `#EC8279` | 5.19 / 5.74 | 5.15 / 6.13 | 6.04 / 7.33 |
| `--info` | `#0B6A85` | `#5FB9D3` | 5.28 / 6.69 | 5.31 / 7.00 | — |
| `--violet` | `#6447BD` | `#AE97EA` | 5.68 / 6.01 | 5.60 / 6.37 | 6.61 / 7.58 |

`-bg`: accent `#E8EEFC`/`#1D2738`, ok `#E3F2E9`/`#15291F`, warn `#FBEFDD`/`#2B2214`, danger
`#FBE9E7`/`#331B19`, info `#E1F1F6`/`#11262D`, violet `#EEEAFA`/`#251E38`.
`-ink`: `#FFFFFF` no claro; `#0E1116` no escuro (danger: `#1A0B0A`). No escuro os sólidos são claros
e o texto é escuro, o que corrige o antigo `.btn-danger` (2.85:1) e o logo do Insights (2.68:1).
Hover dos sólidos: accent `#2453C7`/`#93B0F6` (6.69 / 8.81), danger `#9E2424`/`#F09A92` (7.69 / 8.89).

Regras: âmbar nunca é texto pequeno sobre claro, exceto `--warn` (`#8F5400`, AA). Violeta é a marca
do Insights e a cor de "em revisão"/épico. Vermelho só para erro, atraso e ação destrutiva.

### 3.5 Categóricas (avatar, projeto, etiqueta)

`--cat-1` … `--cat-10`: claro `#2B5FD9 #6D4FC4 #0E7490 #1D7A4C #9A5B00 #BE3030 #B23A78 #4A6572 #7A5C2E #3D7068`;
escuro `#8DA9F2 #B19DEB #6CC1D9 #6FCB97 #E2AE66 #EE8E86 #E68DBB #9CB2BD #C9A979 #86C0B6`.
Texto sobre categórica: `--on-cat` (`#FFFFFF` / `#0E1116`, ≥ 5.3:1 em todas).

### 3.6 Outros

`--tooltip-bg`/`--tooltip-ink` (invertido: 16.2 / 15.4), `--selection`, `--skeleton`, `--focus-color`
(= `--accent`: 5.09 sobre `--bg` claro, 7.42 sobre `--bg` escuro, 6.12 sobre `--overlay` escuro).

---

## 4. Tipografia

**IBM Plex Sans** para texto e display; **IBM Plex Mono** para identificadores (`PCL-124`), payloads,
nomes de evento e ferramenta. Números que mudam usam `font-variant-numeric: tabular-nums` (`.num`).

| Token | Tamanho / linha | Papel |
|---|---|---|
| `--text-24` / `--lh-24` | 24 / 32 | h1 de página, valor de KPI |
| `--text-19` / `--lh-19` | 19 / 28 | h1 e KPI em telas ≤ 860px |
| `--text-16` / `--lh-16` | 16 / 24 | título de modal e drawer |
| `--text-14` / `--lh-14` | 14 / 20 | título de painel, título de estado vazio |
| `--text-13` / `--lh-13` | 13 / 20 | corpo, células, botões, menu |
| `--text-12` / `--lh-12` | 12 / 16 | metadados, rótulos, chips, cabeçalho de tabela, toast |
| `--text-11`, `--text-10` | — | **só** iniciais de avatar (24px e 20px) |

Pesos: `--weight-regular` 400, `--weight-medium` 500 (rótulos, botões, itens), `--weight-semibold`
600 (títulos, valores), `--weight-bold` 700 (só o logo). `--tracking-tight` (−0.015em) em h1 e KPI.
`--leading-snug` (1.4) para títulos que quebram em duas linhas (card do Kanban).

**Piso de 12px.** A única exceção são as iniciais de avatar (10–11px): elas repetem o nome que
está no tooltip/`aria-label` e não são texto de leitura. Sem caixa alta decorativa: cabeçalhos de
tabela, títulos de seção da sidebar e do inspector são em caixa normal.

---

## 5. Espaço, dimensão, raio, elevação, camadas, movimento

**Espaçamento** (`--space-*`): 1 = 4, 2 = 8, 3 = 12, 4 = 16, 5 = 24, 6 = 32, 7 = 48.
`--space-0` (2px) existe só para ajuste óptico (folga do segmentado, alinhamento de checkbox).

| Onde | Valor |
|---|---|
| Página | 24 lateral e topo, 48 base (16 em ≤ 860px) |
| Painel, drawer | 16 |
| Modal | 24 lateral, 16 vertical |
| Gap de grids e entre seções | 16 |
| Linha de tabela | 8 × 12 |
| Barra de filtros, ações | gap 8 |

**Alturas.** Controles: `--control-h-sm` 24, `--control-h-md` 32 (padrão), `--control-h-lg` 36.
Linhas: `--row-h-sm` 32 (menu, lista compacta), `--row-h` 40 (lista, cronograma, cabeçalho de coluna),
`--row-h-lg` 48 (cabeçalho de painel). Topbar e cabeçalho do drawer: `--topbar-h` 48.
Dimensões intrínsecas de componente (checkbox 16, switch 32×20, avatar 20/24/32, ponto 8, largura
de sidebar 240) ficam declaradas no próprio componente.

**Raios.** `--radius-xs` 4 (chip retangular, etiqueta, kbd, barra do cronograma), `--radius-sm` 6
(controles), `--radius-md` 8 (painel, card, menu, toast), `--radius-lg` 10 (modal), `--radius-full`
(pílula, avatar, switch).

**Elevação — só overlays.** `--shadow-popover` (menu, toast, resultados de busca) e
`--shadow-overlay` (drawer, modal, nav móvel); a cor da sombra vem de `--shadow-1/2`, mais densa no
escuro. Controles não têm sombra: o segmento ativo usa borda `--border-ctl`. O divisor do stat strip
é uma hairline de 1px (`box-shadow` sem blur), não elevação.

**Camadas (`--z-*`).** `base` 0 · `raised` 1 · `sticky` 10 · `backdrop` 90 · `drawer` 95 ·
`modal` 95 · `nav` 110 · `dropdown` 120 · `toast` 200 · `tooltip` 300.
Menus ficam acima de drawer e modal porque abrem de dentro deles. O JS empilha diálogos a partir de
95, somando 2 por camada (confirmação sobre drawer = 97), põe o véu da nav móvel em 105 e o tooltip
de gráfico em 300: alterar esses tokens exige alterar o JS junto.

**Movimento.** `--dur-fast` 120ms (cor, borda, hover), `--dur-base` 180ms (entrada de overlay,
switch, saída de toast), `--dur-slow` 240ms (reservado); `--ease-out` para entrar, `--ease-in`
para sair, `--ease-standard` para mudança de estado. `--tooltip-delay` 400ms. Com
`prefers-reduced-motion: reduce`, animações e transições caem para ~0 e o skeleton para de pulsar.

**Foco.** `:focus-visible` = `outline: 2px solid var(--accent)` com `outline-offset: 2px`. O anel
segue o raio do elemento e não o altera. Campos de texto usam offset −1px (o anel se funde à borda,
sem colidir com o vizinho em formulários densos), também no clique. Itens dentro de contêineres com
rolagem (aba, item de menu, linha) usam offset negativo para não serem cortados. Alvos de foco
programático não operáveis (`main#conteudo`, `h1[tabindex=-1]`, cartão do modal) não mostram anel.
`--focus-ring` (anel duplo em `box-shadow`) fica disponível para elementos com `overflow: hidden`.

---

## 6. Componentes

Notação: **classe** → markup esperado → variantes → estados. Os estados por atributo ARIA já estão
estilizados, então a lógica só precisa pôr o atributo.

### Botão — `.btn`
`<button class="btn [btn-primary|btn-ghost|btn-danger] [btn-sm|btn-lg] [btn-icon]">ícone? texto</button>`
- Variantes: secundário (padrão: `--surface` + borda `--border-ctl`), `btn-primary` (uma por tela),
  `btn-ghost` (toolbar, ícones, "Ver todas"), `btn-danger` (ação destrutiva confirmada).
- Tamanhos: `btn-sm` 24 / padrão 32 / `btn-lg` 36. `btn-icon` é quadrado e exige `aria-label`.
- Estados: `:hover`, `:active`, `:focus-visible`, `:disabled`/`[aria-disabled=true]` (opacidade .5),
  `.is-loading`/`[aria-busy=true]` (spinner na cor do texto da variante, rótulo oculto),
  `[aria-expanded=true]` (menu aberto: fundo pressionado), `[aria-pressed=true]` (alternância:
  secundário ganha `--selected` + borda de acento; ghost só muda a cor para `--accent-fg`).
- Implementação por variáveis locais (`--btn-bg`, `--btn-bg-hover`, `--btn-bg-press`, `--btn-fg`,
  `--btn-border`, `--spinner`): uma variante nova redefine só essas variáveis.

### Campos — `.input`, `.select`, `.textarea`, `.field`
```html
<div class="field [span2] [required]">
  <label for="f1">Título</label>
  <input id="f1" class="input" aria-describedby="f1-hint f1-err" aria-invalid="true" required>
  <span class="hint" id="f1-hint">…</span>
  <span class="err" id="f1-err"><svg/> Informe o título</span>
</div>
```
- 32px, borda `--border-ctl`, raio 6; `.select` com chevron próprio (`appearance:none`); `.textarea`
  com mínimo de 80px. `.mono` para JSON e URLs.
- Estados: hover (borda `--border-ctl-hover`), foco (borda e anel `--accent`), `:disabled`
  (`--surface-2`, texto `--ink-3`), `[readonly]`, erro por `[aria-invalid=true]` **ou**
  `.field.invalid` (borda e anel `--danger`). Obrigatório: `[required]`/`[aria-required]` no controle
  ou `.field.required` acrescenta " *" ao rótulo.
- Grupos (etiquetas, equipes, eventos) usam `<fieldset class="field"><legend>`.
- `.form-grid`: duas colunas (gap 16), `.span2` ocupa as duas; uma coluna em ≤ 860px.

### Checkbox, rádio, switch, segmentado
- `input[type=checkbox|radio]` nativos redesenhados: 16px, borda `--border-ctl`, marcado em
  `--accent`; `:indeterminate`, `:disabled`, `[aria-invalid]`. `.check` = label com gap 8.
- `.switch > input[role=switch] + .tr`: trilho 32×20 em `--border-ctl` (desligado) ou `--accent`.
- `.seg` (e `.app-switch`): trilho `--surface-2`; o ativo (`.active`, `[aria-checked=true]`,
  `[aria-selected=true]`, `[aria-pressed=true]`, `[aria-current=page]`) recebe `--surface` + borda
  `--border-ctl`. Markup esperado: `role="radiogroup"` com `role="radio"` + `aria-checked`, ou
  navegação com `aria-current`.

### Chip / badge — `.chip`
`<span class="chip [accent|ok|warn|danger|info|violet]">Ativo</span>` — 20px, 12/500, pílula.
Neutro em `--neutral-bg`/`--ink-2`; variantes em `-bg` + `--X` + `-border`. Rótulo com inicial
maiúscula. `button.chip` é a versão interativa (filtro removível, sugestão) com `[aria-pressed]`.
Relacionados: `.status-chip` (glifo de status + rótulo), `.prio` (glifo + rótulo, cor por
prioridade), `.label-chip` (etiqueta: retângulo de raio 4 com quadrado de cor `--lc`), `.src-tag`
(origem da auditoria: ui/mcp/automation/api/ai), `.count` (contador tabular em pílula),
`.kbd` (atalho de teclado).

### Avatar — `.avatar`
`<span class="avatar [sm|lg]" style="--av:#hex" aria-label="Nome" data-tip="Nome">HC</span>` —
20/24/32px, iniciais em `--on-cat`. Sem responsável: fundo `--surface-2` e borda tracejada.
`.avatar-stack` sobrepõe 4px com anel `--surface`. `.who-cell` = avatar + nome com reticências.
Equipes não usam avatar: usam chip com o nome.

### Painel — `.panel`
`.panel > .panel-head (h2|h3 + .spacer + ações) + .panel-body[.flush]`. Cabeçalho com mínimo de
48px, quebra linha (`flex-wrap`) quando as ações não cabem, título 14/600. Corpo com 16 de padding;
`.flush` para tabelas e listas que vão de borda a borda. Grids: `.grid.c2`, `.c3`, `.c2-1`, com
colunas `minmax(0, 1fr)`; em ≤ 1100px viram uma coluna.

### KPI — `.stat-strip > .stat`
`.stat > .lbl (12/500 --ink-2) + .val (24/600 tabular) + .ctx (12 --ink-2; .bad/.good só quando o
número descreve estado)`. Hairlines de 1px por célula, sem buracos com qualquer número de colunas.
KPI navegável: `a.stat` (ou `.stat.clickable` até o markup mudar).

### Tabela — `table.tbl` dentro de `.tbl-wrap`
- Cabeçalho 36px, 12/500 `--ink-2`, caixa normal, `position: sticky` (≥ 1280px fica preso ao topo
  do conteúdo; abaixo disso a tabela rola dentro do painel).
- Linhas: 8×12, divisor `--border`, hover `--surface-hover`, selecionada por `[aria-selected=true]`
  ou `.is-selected` (`--selected`). `td.num` à direita e tabular. `.actions-col` reserva 72px, para
  que o selo de estado nunca encoste no botão.
- Ordenação: `<th aria-sort="ascending|descending|none"><button class="th-sort">Prazo</button></th>`
  desenha o chevron sozinho. O legado `th.sortable` + `.arr` continua estilizado.
- Linha clicável acessível: célula primária com `<a class="row-link" href>`; o `::after` do link
  cobre a linha, e botões/selects da linha ficam por cima (`z-index: raised`). `tr.row-click`
  continua funcionando para o markup antigo.
- `.pager` no rodapé do painel.

### Lista — `.list > .list-item` (ListRow)
`.list-item (a|button) > .li-lead? + .li-main (.li-title + .li-meta) + .li-trail` — 40px
(`.compact` 32px), separador controlado pelo contêiner, hover, foco interno,
`[aria-current=true]`/`.is-selected`. Substitui `taskRow`, favoritos, subtarefas e `.hist-item`.
`.hist-item` (linha de histórico/atividade/membro: 40px, divisor sólido, `time` à direita) segue
estilizado para o markup atual.

### Abas — `.tabs > .tab`
36px, 13/500 `--ink-2`; ativa (`.active`, `[aria-selected=true]` ou `[aria-current=page]`) em
`--ink` com barra de 2px `--accent`; hover mostra barra `--border-2`. Como trocam a rota, o markup
recomendado é `<nav class="tabs" aria-label="…"><a class="tab" aria-current="page">`.

### Menu / dropdown — `.menu`
`.menu[role=menu] > .menu-head | .menu-sep | .menu-item[role=menuitem|menuitemcheckbox|menuitemradio]`.
`--overlay`, raio 8, `--shadow-popover`, padding 4, entrada `pop-in`. Item de 32px+, hover/foco
`--hover`, `.danger` em `--danger` (hover `--danger-bg`), `[aria-checked=true]` pinta o check em
`--accent-fg`, `[aria-disabled]` em `--ink-disabled`, `.mi-sub` 12 `--ink-3`. O gatilho leva
`aria-haspopup="menu"` + `aria-expanded`. `.tb-search .results` reusa os itens de menu.

### Drawer — `.drawer`
`aside.drawer[role=dialog] > .drawer-head (48px) + .drawer-body (16) + .drawer-foot?`, largura
`min(560px, 100vw)`, `--overlay`, borda esquerda, `--shadow-overlay`, véu `.backdrop`.
**Inspector de tarefa:** o título (primeira `textarea` do corpo) não tem borda até o hover e cresce
com o conteúdo; `.task-props` é uma grade de 120px (rótulo 13 `--ink-2`) + valor, e selects/inputs
dentro dela viram "botões de propriedade" (sem borda, chevron só no hover/foco, desabilitado
vira texto). Seções (`.section-h`, 13/600) são separadas por divisor no topo. Campos desabilitados
no drawer (somente leitura) aparecem como texto. Componente alvo: `.prop-btn` (ícone + valor).

### Modal — `.modal > .modal-card[.wide]`
560px (760 em `.wide`), raio 10, `.modal-head` (título 16/600 + fechar), `.modal-body` (24 lateral,
rola), `.modal-foot` (ações à direita: secundária, depois primária). Entrada `dialog-in` (escala .98).

### Toast — `#toasts > .toast.[ok|warn|err|info]`
Canto inferior direito, até 360px, `--overlay` + `--shadow-popover`, ícone colorido por tipo (cor
nunca sozinha: o título descreve), borda `--danger-border`/`--warn-border` em erro e atenção.
`b` título 13/600, `span` mensagem 12 `--ink-2`. Slots previstos: `.t-actions` (ex.: "Desfazer")
e `.t-close` (botão ghost sm). Saída `.leaving` em 180ms.

### Tooltip
`[data-tip]` mostra o texto no hover **e** no `:focus-visible`, após 400ms, invertido
(`--tooltip-bg`), 12/500. Tooltip não é a única fonte da informação: o elemento precisa de
`aria-label` ou texto `.sr-only` equivalente. `.tooltip[role=tooltip]` é a versão posicionada por JS
(gráficos, contêineres com `overflow`).

### Estado vazio — `.empty`
`.empty > .e-ic (ícone 40px) + b (14/600) + p (13 --ink-2, máx. 380px) + ação`. Em página: 48 de
padding; dentro de painel, automaticamente 32/16; `.empty.inline` é a versão de linha (sem ícone,
alinhada à esquerda). Sempre com a próxima ação; a variante "filtrado" informa quantos itens estão
ocultos e oferece "Limpar filtros".

### Feedback inline — `.banner.[info|ok|warn|danger]`
Faixa persistente no topo de uma área (erro de persistência, modo somente leitura, endpoint com
falha). Primeiro filho é o ícone colorido.

### Skeleton — `.skeleton`
`.skeleton.line[.short]`, `.skeleton.circle`, `.skeleton.block`: blocos `--skeleton` que pulsam em
opacidade (sem gradiente). Usar com `aria-busy="true"` no contêiner.

### Progresso — `.progress > i`
6px, pílula, trilho `--track`, preenchimento `--accent` (`.ok`, `.warn`, `.danger`). Markup:
`role="progressbar" aria-valuenow aria-valuemin="0" aria-valuemax="100" aria-label="Progresso de …"`.

### Shell
- `.shell` (grid 240px + conteúdo, 100dvh) › `.sidebar` (`.sb-brand` 48px, `.app-switch`,
  `.sb-nav > .sb-section > .sb-section-title + .sb-item`, `.sb-footer`) e `.main` (`header.topbar` 48px,
  `main.content#conteudo` com rolagem, `.page[.wide]`).
- `.sb-item`: 32px, ativo por `.active` ou `[aria-current=page]` (`--selected`, ícone `--accent-fg`;
  violeta no Insights). O item do rodapé ("Restaurar demonstração") fica `--ink-3` e acende em
  `--danger` no hover, sinalizando que apaga dados.
- `.page-head`: h1 24/600 + `.sub` (máx. 72ch) + `.page-actions` à direita (selects em largura
  automática).
- `.skip-link` aparece no primeiro Tab. `.sr-only` para texto só de leitor de tela.
- ≤ 860px: sidebar off-canvas (`.shell.nav-open`), oculta por `visibility` quando fechada (sai da
  ordem de Tab mesmo sem `inert`); breadcrumb mostra só a página atual; busca ocupa o espaço livre.

---

## 7. Padrões

**Formulários.** Rótulo acima (12/500 `--ink-2`), controle de 32px, dica abaixo em `--ink-3`, erro
abaixo em `--danger` com ícone e texto (nunca só cor). Validar no envio, marcar `aria-invalid`,
ligar o erro por `aria-describedby` e focar o primeiro inválido. Ações no rodapé: Cancelar
(secundário) à esquerda da primária. Atalho `Ctrl/⌘+Enter` envia.

**Tabelas.** Coluna primária é link; números à direita e tabulares; datas no formato curto ("14 nov");
coluna de ação com largura reservada; ordenação por `aria-sort`; sem zebra (divisor basta).
Em ≤ 640px, preferir lista (`.list-item`) a rolar horizontalmente.

**Filtros.** `.fbar` com controles de 32px e gap 8; busca primeiro; "Limpar" (ghost sm) só aparece
com filtro ativo. Com muitos filtros (Kanban), o destino é chip de filtro + popover (ver pendências).

**Estados vazios.** Três casos distintos: nada criado ainda (CTA de criar), filtro sem resultado
(contagem oculta + limpar), sem permissão (explica o perfil e oferece voltar).

**Feedback.** Ação concluída → toast `ok` curto. Falha recuperável → toast `err` persistente com ação.
Condição contínua → `.banner`. Carregando → `aria-busy` + skeleton (área) ou `.is-loading` (botão).
Destrutivo → `PF.confirm` com `btn-danger` e consequência escrita.

**Kanban.** Colunas flexíveis de 220–340px: as cinco cabem em 1440; abaixo disso a última aparece
cortada, sinal de que há mais à direita, e o quadro rola dentro de si (a página não rola). O quadro
ocupa a altura útil (`.page:has(> .board)` vira coluna flex), então a barra de rolagem fica visível.
Card: ref mono 12 `--ink-3`, título 13/500, rodapé 12; selecionado (`[aria-current=true]`) com
contorno de 2px `--accent`.

**Cronograma.** Linhas de 40px, rótulo fixo à esquerda, meses em minúsculas, linha "hoje" (2px
`--danger`) atrás das barras, marcos em losango com anel `--surface`.

**Gráficos.** Rótulos em `--ink-2`, eixos em `--border`, série em `--accent`; status com as cores de
status. Texto de SVG em unidades do `viewBox` (15) para render ≥ 12px a 1440; o primeiro rótulo do
eixo x alinha à esquerda e o último à direita.

---

## 8. Acessibilidade (checklist)

- [x] Texto ≥ 4.5:1 nos dois temas, inclusive sobre `--selected`, `-bg` e `--overlay` (medido).
- [x] Contorno de controle e anel de foco ≥ 3:1 (`--border-ctl`, `--accent`).
- [x] Foco visível em tudo que é interativo, sem mudar forma; nunca `outline: none` sem substituto.
- [x] Piso de 12px (exceção: iniciais de avatar).
- [x] Estado nunca só por cor: ícone, texto ou peso acompanham.
- [x] Estados ARIA estilizados: `aria-current`, `aria-selected`, `aria-pressed`, `aria-expanded`,
      `aria-checked`, `aria-invalid`, `aria-busy`, `aria-sort`, `aria-disabled`.
- [x] `prefers-reduced-motion` respeitado; troca de tema sem transição.
- [x] Sem rolagem horizontal da página em 390px; alvos de toque ≥ 24px.
- [ ] Tooltips com equivalente acessível (`aria-label`) — depende do markup.
- [ ] Linhas de tabela com link real (`.row-link`) — depende do markup.

---

## 9. Fazer / não fazer

| Fazer | Não fazer |
|---|---|
| Usar token (`var(--space-3)`, `var(--text-12)`) | Escrever `14px`, `11.5px`, `#fff`, `rgba()` soltos |
| Uma ação primária por tela | Dois `btn-primary` lado a lado |
| Cor para estado (atraso, erro, ok) | Cor em texto descritivo ("últimos 30 dias" verde) |
| Hierarquia por tamanho/peso | Card dentro de card, borda dentro de borda |
| Sombra em menu, drawer, modal, toast | Sombra em botão, segmento, card ou switch |
| Estado por atributo ARIA | Estado só por classe visual sem semântica |
| Chip com inicial maiúscula ("Atrasada") | Mistura "atrasada"/"Em risco"/"FALHOU" |
| Ícone SVG de traço com `currentColor` | Emoji ou ícone preenchido decorativo |
| Glifo de prioridade/status + texto ou `aria-label` | Informação só no tooltip |

---

## 10. Linguagem de domínio

- **Prioridade:** glifo próprio (chevrons empilhados) + cor — urgente `--danger`, alta `--warn`,
  média `--info`, baixa `--ink-3`.
- **Status:** anel de progresso estilo Linear — backlog (tracejado, `--ink-3`), a fazer (vazio,
  `--ink-2`), em andamento (meio, `--accent`), em revisão (3/4, `--violet`), concluído (cheio, `--ok`).
- **Tipo:** épico (losango, `--violet`), tarefa (quadrado com check, `--accent`), bug (`--danger`),
  subtarefa (ramo, `--ink-2`).
- **Origem (auditoria):** interface `--accent`, MCP e IA `--violet`, automação `--info`, API `--warn`.
