/* ============================================================
   ProjectFlow AI — Insights (visão executiva, análise, auditoria)
   Gráficos em SVG puro, sem bibliotecas. Regras de cor:
   série única por gráfico (magnitude) ou cores de status sempre
   acompanhadas de ícone + rótulo — nunca cor sozinha.
   ============================================================ */
(function () {
  "use strict";
  var h = PF.h, icon = PF.icon;
  var SVG = "http://www.w3.org/2000/svg";

  function s(tag, attrs) {
    var el = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid != null) el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return el;
  }

  // tooltip único dos gráficos (componente .tooltip do design system)
  var tipEl = null;
  function chartTip(x, y, lines) {
    if (!tipEl || !tipEl.isConnected) {
      tipEl = h("div", { class: "tooltip", role: "tooltip", hidden: true });
      document.body.appendChild(tipEl);
    }
    if (!lines) { tipEl.hidden = true; return; }
    tipEl.textContent = lines.join("\n");
    tipEl.hidden = false;
    var w = tipEl.offsetWidth, hgt = tipEl.offsetHeight;
    tipEl.style.left = Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8)) + "px";
    tipEl.style.top = Math.max(8, y - hgt - 12) + "px";
  }

  /* gráfico de linha (série única, acento). Desenhado na largura real do
     contêiner (1 unidade do SVG = 1px), então os rótulos ficam em 12px em
     qualquer largura; redesenha quando o contêiner muda de tamanho. */
  // teto do eixo y divisível em 4 faixas inteiras (0, 2, 4, 6, 8 …)
  function niceMax(v) {
    var raw = Math.max(1, v / 4);
    var p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    var step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
    return step * 4;
  }
  function lineChart(points, opts) {
    opts = opts || {};
    var wrap = h("div", { class: "chart" });
    var H = 200, padL = 32, padR = 12, padT = 16, padB = 28;
    var maxY = niceMax(Math.max.apply(null, points.map(function (p) { return p.y; })));
    function draw(W) {
      var iw = W - padL - padR, ih = H - padT - padB;
      function px(i) { return padL + (points.length < 2 ? iw / 2 : i * iw / (points.length - 1)); }
      function py(v) { return padT + ih - (v / maxY) * ih; }
      var svg = s("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": opts.label || "Gráfico de linha" });
      // grade recessiva em 4 faixas, com rótulo do eixo y
      [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
        var y = Math.round(padT + ih - f * ih) + 0.5;
        svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: y, y2: y, class: f === 0 ? "axis" : "grid-line" }));
        svg.appendChild(s("text", { x: padL - 8, y: y + 4, "text-anchor": "end" }, String(Math.round(maxY * f))));
      });
      // rótulos x: quantos couberem (≥ 64px entre eles); 1º à esquerda, último à direita
      var step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 64))));
      points.forEach(function (p, i) {
        var last = i === points.length - 1;
        if (i % step !== 0 && !last) return;
        if (!last && points.length - 1 - i < step / 2 && i !== 0) return; // não encosta no último
        svg.appendChild(s("text", { x: px(i), y: H - 8, "text-anchor": i === 0 ? "start" : last ? "end" : "middle" }, p.label));
      });
      var dLine = points.map(function (p, i) { return (i ? "L" : "M") + px(i).toFixed(1) + " " + py(p.y).toFixed(1); }).join(" ");
      svg.appendChild(s("path", { class: "ch-area", d: dLine + " L" + px(points.length - 1).toFixed(1) + " " + (padT + ih) + " L" + px(0).toFixed(1) + " " + (padT + ih) + " Z" }));
      var cross = s("line", { class: "ch-cross", x1: 0, x2: 0, y1: padT, y2: padT + ih });
      svg.appendChild(cross);
      svg.appendChild(s("path", { class: "ch-line", d: dLine }));
      points.forEach(function (p, i) {
        var last = i === points.length - 1;
        var dot = s("circle", { class: "ch-dot" + (last ? " last" : ""), cx: px(i), cy: py(p.y), r: last ? 4 : 3 });
        svg.appendChild(dot);
        // alvo de hover: faixa vertical inteira da coluna
        var band = Math.max(12, iw / Math.max(1, points.length - 1));
        var hit = s("rect", { class: "ch-hit", x: px(i) - band / 2, y: padT, width: band, height: ih });
        hit.addEventListener("mousemove", function () {
          var r = dot.getBoundingClientRect();
          chartTip(r.left + r.width / 2, r.top, [p.label, p.y + " " + (opts.unit || "")]);
          dot.setAttribute("r", 5);
          cross.setAttribute("x1", px(i)); cross.setAttribute("x2", px(i)); cross.classList.add("on");
        });
        hit.addEventListener("mouseleave", function () { chartTip(0, 0, null); dot.setAttribute("r", last ? 4 : 3); cross.classList.remove("on"); });
        svg.appendChild(hit);
      });
      // valor do último ponto, à direita
      var lp = points[points.length - 1];
      if (lp) svg.appendChild(s("text", { class: "ch-val", x: px(points.length - 1) - 8, y: py(lp.y) - 10, "text-anchor": "end" }, String(lp.y)));
      wrap.replaceChildren(svg);
    }
    var lastW = 0;
    function fit() {
      var w = Math.round(wrap.clientWidth);
      if (w > 0 && w !== lastW) { lastW = w; draw(w); }
    }
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { if (!wrap.isConnected) { ro.disconnect(); return; } fit(); });
      ro.observe(wrap);
    }
    // primeira pintura assim que o contêiner entra no documento
    requestAnimationFrame(fit);
    draw(640);
    return wrap;
  }

  /* barras horizontais (HTML): rótulo + ícone à esquerda, valor em texto */
  function barList(items, opts) {
    opts = opts || {};
    var max = Math.max(1, Math.max.apply(null, items.map(function (i) { return i.value; })));
    var wrap = h("div", { class: "bar-list", role: "img", "aria-label": (opts.label || "Gráfico de barras") + ": " + items.map(function (it) { return it.label + " " + (it.display != null ? it.display : it.value); }).join(", ") });
    if (opts.labelW) wrap.style.setProperty("--bar-lw", opts.labelW + "px");
    items.forEach(function (it) {
      var fill = h("i", {});
      fill.style.width = Math.round(100 * it.value / max) + "%";
      if (it.color) fill.style.setProperty("--bar", it.color);
      var row = h("div", { class: "bar-row" },
        h("span", { class: "bar-label" }, it.icon || null, h("span", {}, it.label)),
        h("span", { class: "bar-track" }, fill),
        h("span", { class: "bar-value" }, it.display != null ? it.display : String(it.value)));
      row.addEventListener("mousemove", function (e) { chartTip(e.clientX, e.clientY - 4, [it.label, (it.display != null ? it.display : it.value) + (opts.unit ? " " + opts.unit : "")]); });
      row.addEventListener("mouseleave", function () { chartTip(0, 0, null); });
      wrap.appendChild(row);
    });
    return wrap;
  }
  function tone(color, ic) { var x = icon(ic, 14); x.style.color = color; return x; }

  function onTimeRate(tasks) {
    var withDue = tasks.filter(function (t) { return t.status === "done" && t.dueDate; });
    if (!withDue.length) return null;
    var ok = withDue.filter(function (t) { var d = PF.doneDay(t); return d && d <= t.dueDate; }).length;
    return Math.round(100 * ok / withDue.length);
  }

  /* ---------- filtros compartilhados do Insights ---------- */
  var insF = { orgId: "", projectId: "", teamId: "", period: 90 };

  PF.profileHooks.push(function () {
    insF.orgId = insF.projectId = insF.teamId = "";
    audF.userId = audF.projectId = ""; audF.page = 0;
  });

  function insFilterBar(extra) {
    if (insF.teamId && !PF.scopeTeams().some(function (t) { return t.id === insF.teamId; })) insF.teamId = "";
    if (insF.projectId && !PF.canSeeProject(insF.projectId)) insF.projectId = "";
    var fbar = h("div", { class: "fbar" });
    // só o administrador enxerga mais de uma organização
    if (PF.me().roleId === "admin") {
      fbar.appendChild(PF.filterSelect("Organização", [{ value: "", label: "Todas" }].concat(PF.db.orgs.map(function (o) { return { value: o.id, label: o.name }; })),
        insF.orgId, function (v) { insF.orgId = v; insF.projectId = ""; PF.refresh(); }));
    } else insF.orgId = "";
    fbar.appendChild(PF.filterSelect("Projeto", [{ value: "", label: "Todos" }].concat(scopeProjects(true).map(function (p) { return { value: p.id, label: p.name }; })),
      insF.projectId, function (v) { insF.projectId = v; PF.refresh(); }));
    fbar.appendChild(PF.filterSelect("Equipe", [{ value: "", label: "Todas" }].concat(PF.scopeTeams().map(function (t) { return { value: t.id, label: t.name }; })),
      insF.teamId, function (v) { insF.teamId = v; PF.refresh(); }));
    fbar.appendChild(PF.filterSelect("Período", [
      { value: "30", label: "Últimos 30 dias" }, { value: "60", label: "Últimos 60 dias" },
      { value: "90", label: "Últimos 90 dias" }, { value: "180", label: "Últimos 180 dias" }
    ], String(insF.period), function (v) { insF.period = +v; PF.refresh(); }, null, { def: "90" }));
    if (insF.orgId || insF.projectId || insF.teamId) {
      fbar.appendChild(h("button", { class: "btn btn-ghost btn-sm", onclick: function () { insF.orgId = insF.projectId = insF.teamId = ""; PF.refresh(); } }, icon("x", 12), "Limpar"));
    }
    if (extra) fbar.appendChild(extra);
    return fbar;
  }

  function scopeProjects(ignoreProject) {
    return PF.visibleProjects().filter(function (p) {
      if (insF.orgId && p.orgId !== insF.orgId) return false;
      if (!ignoreProject && insF.projectId && p.id !== insF.projectId) return false;
      if (insF.teamId && p.teamIds.indexOf(insF.teamId) < 0) return false;
      return true;
    });
  }
  function scopeTasks() {
    var ids = {};
    scopeProjects().forEach(function (p) { ids[p.id] = 1; });
    return PF.db.tasks.filter(function (t) {
      if (!ids[t.projectId] || t.parentId) return false;
      if (insF.teamId && t.teamId !== insF.teamId) return false;
      return true;
    });
  }

  /* ============================ VISÃO EXECUTIVA ============================ */
  PF.routes.insights = {
    title: "Visão executiva", app: "insights", cap: "insights.view",
    render: function (page) {
      page.appendChild(PF.ui.pageHead("Visão executiva",
        "Indicadores calculados sobre o estado atual da demonstração — eles reagem às alterações feitas no Workspace."));
      page.appendChild(insFilterBar());

      var projects = scopeProjects();
      var tasks = scopeTasks();
      var cutoff = Date.now() - insF.period * 86400000;
      var doneP = tasks.filter(function (t) { return t.status === "done" && t.doneAt && new Date(t.doneAt).getTime() >= cutoff; });
      var late = tasks.filter(PF.isOverdue);
      var rate = onTimeRate(tasks);

      // série semanal de conclusões (usada no KPI e no gráfico de evolução)
      var weeks = Math.min(13, Math.max(6, Math.round(insF.period / 7)));
      var buckets = [];
      for (var wgi = weeks - 1; wgi >= 0; wgi--) {
        var start = Date.now() - (wgi + 1) * 7 * 86400000;
        var end = Date.now() - wgi * 7 * 86400000;
        var n = tasks.filter(function (t) {
          var ts = t.doneAt ? new Date(t.doneAt).getTime() : NaN;
          return t.status === "done" && ts >= start && ts < end;
        }).length;
        buckets.push({ label: PF.fmtDate(new Date(end).toISOString()), y: n });
      }

      var strip = h("div", { class: "stat-strip" });
      function stat(ic, lbl, val, ctx, cls, spark) {
        strip.appendChild(h("div", { class: "stat" }, h("div", { class: "lbl" }, icon(ic, 14), lbl),
          h("div", { class: "stat-row" }, h("div", { class: "val" }, String(val)), spark || null),
          ctx ? h("div", { class: "ctx " + (cls || "") }, ctx) : null));
      }
      stat("folders", "Projetos ativos", projects.filter(function (p) { return p.status === "active"; }).length, PF.plural(projects.length, "projeto nos filtros", "projetos nos filtros"));
      stat("flag", "Projetos concluídos", projects.filter(function (p) { return p.status === "done"; }).length, "entregues");
      var atRisk = projects.filter(function (p) { return p.status === "active" && PF.projectRisk(p).level === "high"; }).length;
      stat("alert", "Projetos em risco", atRisk, atRisk ? "exigem atenção" : "nenhum", atRisk ? "bad" : "good");
      stat("check2", "Tarefas concluídas", doneP.length, "últimos " + insF.period + " dias", "", PF.sparkline(buckets.map(function (b) { return b.y; })));
      stat("clock", "Tarefas atrasadas", late.length, "em aberto hoje", late.length ? "bad" : "good");
      stat("target", "Cumprimento de prazos", rate == null ? "—" : rate + "%", "tarefas concluídas no prazo", rate != null && rate < 70 ? "bad" : "");
      page.appendChild(strip);

      var grid = h("div", { class: "grid c2" });

      // evolução das entregas (semana a semana)
      var totalW = buckets.reduce(function (acc, b) { return acc + b.y; }, 0);
      var p1 = h("div", { class: "panel" },
        h("div", { class: "panel-head" }, h("h3", {}, "Evolução das conclusões"), h("span", { class: "spacer" }), h("span", { class: "subtle t12" }, "por semana")),
        h("div", { class: "panel-body" },
          h("div", { class: "chart-head" }, h("span", { class: "big" }, String(totalW)), h("span", { class: "muted" }, "tarefas concluídas em " + weeks + " semanas · média " + (totalW / weeks).toFixed(1).replace(".", ",") + "/semana")),
          lineChart(buckets, { label: "Tarefas concluídas por semana: " + buckets.map(function (b) { return b.label + " " + b.y; }).join(", "), unit: "concluídas" })));
      grid.appendChild(p1);

      // distribuição por status: cor do status, sempre com glifo + rótulo (nunca cor sozinha)
      var p2 = h("div", { class: "panel" },
        h("div", { class: "panel-head" }, h("h3", {}, "Tarefas por status")));
      var statusItems = PF.STATUSES.map(function (st) {
        return { label: PF.STATUS_META[st].label, icon: PF.statusIcon(st, 13), color: PF.STATUS_META[st].color, value: tasks.filter(function (t) { return t.status === st; }).length };
      });
      p2.appendChild(h("div", { class: "panel-body" }, barList(statusItems, { label: "Distribuição de tarefas por status", labelW: 130, unit: "tarefas" })));
      grid.appendChild(p2);

      // projetos por situação (paleta de status com ícone + rótulo)
      var p3 = h("div", { class: "panel" },
        h("div", { class: "panel-head" }, h("h3", {}, "Projetos por situação")));
      var situ = [
        { label: "Saudáveis", icon: tone("var(--ok)", "check"), color: "var(--ok)", value: 0 },
        { label: "Atenção", icon: tone("var(--warn)", "info"), color: "var(--warn)", value: 0 },
        { label: "Em risco", icon: tone("var(--danger)", "alert"), color: "var(--danger)", value: 0 },
        { label: "Entregues", icon: tone("var(--ink-3)", "flag"), color: "var(--ink-3)", value: 0 }
      ];
      projects.forEach(function (p) {
        if (p.status === "done") { situ[3].value++; return; }
        var r = PF.projectRisk(p);
        if (r.level === "high") situ[2].value++;
        else if (r.level === "mid") situ[1].value++;
        else situ[0].value++;
      });
      p3.appendChild(h("div", { class: "panel-body" }, barList(situ, { label: "Projetos por situação", labelW: 120, unit: "projetos" })));
      grid.appendChild(p3);

      // cumprimento de prazo por equipe
      var p4 = h("div", { class: "panel" },
        h("div", { class: "panel-head" }, h("h3", {}, "Prazos por equipe"), h("span", { class: "spacer" }), h("span", { class: "subtle t12" }, "% de tarefas concluídas no prazo")));
      var teamItems = [];
      PF.scopeTeams().forEach(function (tm) {
        var tts = tasks.filter(function (t) { return t.teamId === tm.id; });
        var r = onTimeRate(tts);
        // abaixo de 70% no prazo a barra fica em atenção (o valor em texto acompanha)
        if (r != null) teamItems.push({ label: tm.name, value: r, display: r + "%", color: r < 70 ? "var(--warn)" : null });
      });
      teamItems.sort(function (a, b) { return b.value - a.value; });
      p4.appendChild(h("div", { class: "panel-body" }, teamItems.length ? barList(teamItems, { label: "Cumprimento de prazos por equipe", labelW: 130 }) : PF.emptyState("calendar", "Sem tarefas concluídas com prazo", "Conclua tarefas com prazo definido para medir o cumprimento.", null, { compact: true })));
      grid.appendChild(p4);
      page.appendChild(grid);

      // resumo por equipe + atividades
      var grid2 = h("div", { class: "grid c2-1 mt" });
      var pt = h("div", { class: "panel" });
      pt.appendChild(h("div", { class: "panel-head" }, h("h3", {}, "Resumo por equipe")));
      var tbl = h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", {}, "Equipe"), h("th", { class: "num" }, "Abertas"), h("th", { class: "num" }, "Concluídas"), h("th", { class: "num" }, "Atrasadas"), h("th", { class: "num" }, "No prazo"))));
      var tb = h("tbody");
      PF.scopeTeams().forEach(function (tm) {
        var tts = tasks.filter(function (t) { return t.teamId === tm.id; });
        if (!tts.length) return;
        var open = tts.filter(function (t) { return t.status !== "done"; }).length;
        var done = tts.length - open;
        var lateN = tts.filter(PF.isOverdue).length;
        var r = onTimeRate(tts);
        tb.appendChild(h("tr", {},
          h("td", {}, tm.name),
          h("td", { class: "num" }, String(open)),
          h("td", { class: "num" }, String(done)),
          h("td", { class: "num" }, lateN ? h("span", { class: "text-danger" }, String(lateN)) : h("span", { class: "subtle" }, "0")),
          h("td", { class: "num" }, r == null ? "—" : r + "%")));
      });
      tbl.appendChild(tb);
      pt.appendChild(h("div", { class: "tbl-wrap" }, tbl));
      grid2.appendChild(pt);

      var pa = h("div", { class: "panel" });
      pa.appendChild(h("div", { class: "panel-head" }, h("h3", {}, "Atividades recentes"), h("span", { class: "spacer" }),
        PF.can("audit.view") ? h("button", { class: "btn btn-ghost btn-sm", onclick: function () { PF.navigate("/insights/audit"); } }, "Auditoria", icon("arrowR", 12)) : null));
      var paB = h("div", { class: "panel-body" });
      var ids = {}; projects.forEach(function (p) { ids[p.id] = 1; });
      var insActs = PF.db.audit.filter(function (a) { return a.action !== "denied" && (a.projectId ? ids[a.projectId] : PF.canSeeAudit(a)); }).slice(0, 7);
      if (insActs.length) paB.appendChild(PF.ui.activityFeed(insActs));
      else paB.appendChild(PF.emptyState("pulse", "Sem atividade nos filtros", "Ajuste os filtros para ver as ações recentes.", null, { compact: true }));
      pa.appendChild(paB);
      grid2.appendChild(pa);
      page.appendChild(grid2);
    }
  };

  /* ============================ ANÁLISE DE PROJETOS ============================ */
  PF.routes["insights/analytics"] = {
    title: "Análise de projetos", app: "insights", cap: "insights.view",
    render: function (page) {
      page.appendChild(PF.ui.pageHead("Análise de projetos e desempenho",
        "Comparação entre projetos, sprints e equipes, com leitura de gargalos e dependências."));
      page.appendChild(insFilterBar());

      var projects = scopeProjects();
      var tasks = scopeTasks();

      // comparação de projetos
      var pc = h("div", { class: "panel mb" });
      pc.appendChild(h("div", { class: "panel-head" }, h("h3", {}, "Comparação de projetos")));
      var tbl = h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", {}, "Projeto"), h("th", {}, "Progresso"),
          h("th", { class: "num" }, "Tarefas"), h("th", { class: "num" }, "Atrasadas"), h("th", { class: "num" }, "Bloqueadas"),
          h("th", { class: "num" }, "No prazo"), h("th", {}, "Data de entrega"), h("th", {}, "Situação"))));
      var tb = h("tbody");
      projects.forEach(function (p) {
        var ts = tasks.filter(function (t) { return t.projectId === p.id; });
        var prog = PF.projectProgress(p.id);
        var lateN = ts.filter(PF.isOverdue).length;
        var blockedN = ts.filter(PF.isBlocked).length;
        var r = onTimeRate(ts);
        tb.appendChild(h("tr", { class: "row-click", onclick: function () { PF.navigate("/projects/" + p.id); } },
          h("td", {}, h("div", { class: "cell-main" }, PF.projectDot(p, true), h("div", {}, h("a", { href: "#/projects/" + p.id, class: "row-link" }, p.name), h("span", { class: "cell-sub mono" }, p.key)))),
          h("td", {}, h("div", { class: "cell-prog" }, PF.progressBar(prog, prog === 100, "Progresso de " + p.name), h("span", { class: "pct", "aria-hidden": "true" }, prog + "%"))),
          h("td", { class: "num" }, String(ts.length)),
          h("td", { class: "num" }, lateN ? h("span", { class: "text-danger" }, String(lateN)) : h("span", { class: "subtle" }, "0")),
          h("td", { class: "num" }, blockedN ? h("span", { class: "text-warn" }, String(blockedN)) : h("span", { class: "subtle" }, "0")),
          h("td", { class: "num" }, r == null ? "—" : r + "%"),
          h("td", { class: "date" }, PF.fmtDate(p.targetDate)),
          h("td", {}, PF.ui.riskChip(PF.projectRisk(p)))));
      });
      tbl.appendChild(tb);
      pc.appendChild(h("div", { class: "tbl-wrap" }, tbl));
      page.appendChild(pc);

      var grid = h("div", { class: "grid c2" });

      // indicadores por sprint
      var ps = h("div", { class: "panel" });
      ps.appendChild(h("div", { class: "panel-head" }, h("h3", {}, "Indicadores por sprint")));
      var tbl2 = h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", {}, "Sprint"), h("th", {}, "Status"), h("th", { class: "num" }, "Tarefas"), h("th", { class: "num" }, "Concluídas"), h("th", {}, "Conclusão"))));
      var tb2 = h("tbody");
      var pids = {}; projects.forEach(function (p) { pids[p.id] = 1; });
      PF.db.sprints.filter(function (sp) { return pids[sp.projectId]; }).forEach(function (sp) {
        var ts = PF.db.tasks.filter(function (t) { return t.sprintId === sp.id && !t.parentId; });
        var done = ts.filter(function (t) { return t.status === "done"; }).length;
        var pct = ts.length ? Math.round(100 * done / ts.length) : 0;
        tb2.appendChild(h("tr", {},
          h("td", {}, h("b", {}, sp.name), h("span", { class: "cell-sub" }, PF.project(sp.projectId).name)),
          h("td", {}, sp.status === "active" ? h("span", { class: "chip accent" }, "Ativa") : sp.status === "done" ? h("span", { class: "chip ok" }, "Concluída") : h("span", { class: "chip" }, "Planejada")),
          h("td", { class: "num" }, String(ts.length)),
          h("td", { class: "num" }, String(done)),
          h("td", {}, h("div", { class: "cell-prog" }, PF.progressBar(pct, pct === 100, "Conclusão da " + sp.name), h("span", { class: "pct", "aria-hidden": "true" }, pct + "%")))));
      });
      tbl2.appendChild(tb2);
      ps.appendChild(h("div", { class: "tbl-wrap" }, tbl2));
      grid.appendChild(ps);

      // progresso por equipe
      var pt = h("div", { class: "panel" });
      pt.appendChild(h("div", { class: "panel-head" }, h("h3", {}, "Progresso por equipe"), h("span", { class: "spacer" }), h("span", { class: "subtle t12" }, "% de tarefas concluídas")));
      var teamItems = [];
      PF.scopeTeams().forEach(function (tm) {
        var ts = tasks.filter(function (t) { return t.teamId === tm.id; });
        if (!ts.length) return;
        var pct = Math.round(100 * ts.filter(function (t) { return t.status === "done"; }).length / ts.length);
        teamItems.push({ label: tm.name, value: pct, display: pct + "%" });
      });
      teamItems.sort(function (a, b) { return b.value - a.value; });
      pt.appendChild(h("div", { class: "panel-body" }, barList(teamItems, { label: "Progresso por equipe", labelW: 130 })));
      grid.appendChild(pt);
      page.appendChild(grid);

      var grid2 = h("div", { class: "grid c2 mt" });

      // gargalos
      var pg = h("div", { class: "panel" });
      pg.appendChild(h("div", { class: "panel-head" }, h("h3", {}, "Gargalos e carga")));
      var pgB = h("div", { class: "panel-body" });
      var wip = tasks.filter(function (t) { return t.status === "in_progress"; });
      var review = tasks.filter(function (t) { return t.status === "in_review"; });
      pgB.appendChild(barList([
        { label: "Em andamento", icon: PF.statusIcon("in_progress", 13), color: PF.STATUS_META.in_progress.color, value: wip.length },
        { label: "Em revisão", icon: PF.statusIcon("in_review", 13), color: PF.STATUS_META.in_review.color, value: review.length },
        { label: "Bloqueadas", icon: tone("var(--warn)", "block"), color: "var(--warn)", value: tasks.filter(PF.isBlocked).length }
      ], { label: "Trabalho em progresso", labelW: 130, unit: "tarefas" }));
      var load = {};
      wip.forEach(function (t) { if (t.assigneeId) load[t.assigneeId] = (load[t.assigneeId] || 0) + 1; });
      var top = Object.keys(load).sort(function (a, b) { return load[b] - load[a]; }).slice(0, 4);
      if (top.length) {
        pgB.appendChild(h("div", { class: "section-h" }, "Maior carga em andamento"));
        top.forEach(function (uid) {
          pgB.appendChild(h("div", { class: "hist-item" }, PF.avatarEl(PF.user(uid), "sm"),
            h("span", { class: "grow" }, PF.user(uid).name),
            h("span", { class: "num" + (load[uid] >= 3 ? " text-danger" : "") }, load[uid] + " tarefas")));
        });
      }
      pg.appendChild(pgB);
      grid2.appendChild(pg);

      // dependências críticas
      var pd = h("div", { class: "panel" });
      pd.appendChild(h("div", { class: "panel-head" }, h("h3", {}, "Tarefas bloqueadas e dependências críticas")));
      var pdB = h("div", { class: "panel-body" });
      var blocked = tasks.filter(PF.isBlocked);
      if (!blocked.length) pdB.appendChild(PF.emptyState("check", "Nenhum bloqueio ativo", "Nenhuma tarefa aguarda outra nos filtros atuais.", null, { compact: true }));
      blocked.forEach(function (t) {
        var blockers = PF.activeBlockers(t);
        pdB.appendChild(h("div", { class: "hist-item" },
          tone("var(--warn)", "block"),
          h("span", { class: "grow" },
            h("a", { href: "#", class: "mono", onclick: function (e) { e.preventDefault(); PF.ui.openTask(t.id); } }, t.ref),
            " " + t.title,
            h("div", { class: "subtle t12" }, "aguarda " + blockers.map(function (b) { return b.ref + " (" + PF.STATUS_META[b.status].label + ")"; }).join(", "))),
          PF.isOverdue(t) ? h("span", { class: "chip danger" }, "Atrasada") : null));
      });
      pd.appendChild(pdB);
      grid2.appendChild(pd);
      page.appendChild(grid2);
    }
  };

  /* ============================ CENTRAL DE AUDITORIA ============================ */
  var audF = { userId: "", projectId: "", action: "", source: "", entityType: "", period: 90, page: 0 };
  var ACTION_LABELS = {
    create: "Criação", update: "Atualização", status: "Mudança de status", priority: "Mudança de prioridade",
    assign: "Atribuição", comment: "Comentário", block: "Bloqueio", unblock: "Desbloqueio", archive: "Arquivamento", unarchive: "Desarquivamento", "delete": "Exclusão",
    sprint_start: "Início de sprint", sprint_end: "Encerramento de sprint", test: "Teste de webhook",
    redeliver: "Reenvio de webhook", resend: "Reenvio de notificação", denied: "Permissão negada", ai_query: "Consulta à IA"
  };
  var ENTITY_LABELS = { task: "Tarefa", project: "Projeto", sprint: "Sprint", epic: "Épico", team: "Equipe", user: "Usuário", webhook: "Webhook", notification: "Notificação", mcp: "Agente MCP", permission: "Permissão", ai: "IA" };

  PF.routes["insights/audit"] = {
    title: "Central de auditoria", app: "insights", cap: "audit.view",
    render: function (page) {
      page.appendChild(PF.ui.pageHead("Central de auditoria",
        "Trilha completa das ações: quem fez, o quê, em qual entidade, com valores anteriores e novos, e a origem (interface, IA, agente MCP, automação ou API)."));

      if (audF.userId && !PF.scopeUsers().some(function (u) { return u.id === audF.userId; })) audF.userId = "";
      if (audF.projectId && !PF.db.projects.some(function (p) { return p.id === audF.projectId && PF.inMyOrg(p.orgId); })) audF.projectId = "";
      var fbar = h("div", { class: "fbar" });
      fbar.appendChild(PF.filterSelect("Usuário", [{ value: "", label: "Todos" }].concat(PF.scopeUsers().map(function (u) { return { value: u.id, label: u.name }; })),
        audF.userId, function (v) { audF.userId = v; audF.page = 0; PF.refresh(); }));
      fbar.appendChild(PF.filterSelect("Projeto", [{ value: "", label: "Todos" }].concat(PF.db.projects.filter(function (p) { return PF.inMyOrg(p.orgId); }).map(function (p) { return { value: p.id, label: p.name + (p.archived ? " (arquivado)" : "") }; })),
        audF.projectId, function (v) { audF.projectId = v; audF.page = 0; PF.refresh(); }));
      fbar.appendChild(PF.filterSelect("Ação", [{ value: "", label: "Todas" }].concat(Object.keys(ACTION_LABELS).map(function (a) { return { value: a, label: ACTION_LABELS[a] }; })),
        audF.action, function (v) { audF.action = v; audF.page = 0; PF.refresh(); }));
      fbar.appendChild(PF.filterSelect("Origem", [{ value: "", label: "Todas" }].concat(Object.keys(PF.SOURCE_META).map(function (k) { return { value: k, label: PF.SOURCE_META[k] }; })),
        audF.source, function (v) { audF.source = v; audF.page = 0; PF.refresh(); }));
      fbar.appendChild(PF.filterSelect("Entidade", [{ value: "", label: "Todas" }].concat(Object.keys(ENTITY_LABELS).map(function (e) { return { value: e, label: ENTITY_LABELS[e] }; })),
        audF.entityType, function (v) { audF.entityType = v; audF.page = 0; PF.refresh(); }));
      fbar.appendChild(PF.filterSelect("Período", [{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }, { value: "365", label: "1 ano" }],
        String(audF.period), function (v) { audF.period = +v; audF.page = 0; PF.refresh(); }, null, { def: "90" }));
      if (audF.userId || audF.projectId || audF.action || audF.source || audF.entityType) {
        fbar.appendChild(h("button", { class: "btn btn-ghost btn-sm", onclick: function () { audF.userId = audF.projectId = audF.action = audF.source = audF.entityType = ""; audF.page = 0; PF.refresh(); } }, icon("x", 12), "Limpar"));
      }
      page.appendChild(fbar);

      var cutoff = Date.now() - audF.period * 86400000;
      var rows = PF.db.audit.filter(function (a) {
        if (!PF.canSeeAudit(a)) return false;
        if (new Date(a.ts).getTime() < cutoff) return false;
        if (audF.userId && a.userId !== audF.userId) return false;
        if (audF.projectId && a.projectId !== audF.projectId) return false;
        if (audF.action && a.action !== audF.action) return false;
        if (audF.source && a.source !== audF.source) return false;
        if (audF.entityType && a.entityType !== audF.entityType) return false;
        return true;
      });

      var PAGE = 20;
      var pages = Math.max(1, Math.ceil(rows.length / PAGE));
      if (audF.page >= pages) audF.page = pages - 1;
      var slice = rows.slice(audF.page * PAGE, audF.page * PAGE + PAGE);

      if (!rows.length) { page.appendChild(PF.emptyState("scroll", "Nenhum registro", "Ajuste os filtros ou realize ações no Workspace.")); return; }

      var tbl = h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", {}, "Quando"), h("th", {}, "Usuário"), h("th", {}, "Ação"), h("th", {}, "Entidade"), h("th", {}, "Projeto"), h("th", {}, "Origem"), h("th", {}, "Resumo"))));
      var tb = h("tbody");
      slice.forEach(function (a) {
        var proj = a.projectId ? PF.project(a.projectId) : null;
        tb.appendChild(h("tr", { class: "row-click", onclick: function () { auditDrawer(a.id); } },
          h("td", { class: "nowrap muted t12" }, PF.fmtDateTime(a.ts)),
          h("td", {}, PF.whoCell(a.userId)),
          h("td", {}, h("span", { class: "chip" + (a.action === "denied" ? " danger" : a.action === "delete" ? " warn" : "") }, ACTION_LABELS[a.action] || a.action)),
          h("td", {}, ENTITY_LABELS[a.entityType] || a.entityType),
          h("td", {}, proj ? proj.name : "—"),
          h("td", {}, h("span", { class: "src-tag " + a.source }, PF.sourceLabel(a.source))),
          h("td", { class: "cell-trunc" }, h("button", { type: "button", class: "row-link", title: a.summary }, a.summary))));
      });
      tbl.appendChild(tb);
      var panel = h("div", { class: "panel" }, h("div", { class: "tbl-wrap" }, tbl));
      panel.appendChild(h("div", { class: "pager" },
        h("span", { class: "num" }, PF.plural(rows.length, "registro", "registros")),
        h("span", { class: "grow" }),
        h("button", { class: "btn btn-sm", disabled: audF.page === 0, onclick: function () { audF.page--; PF.refresh(); } }, icon("chevL", 12), "Anterior"),
        h("span", { class: "num" }, (audF.page + 1) + " / " + pages),
        h("button", { class: "btn btn-sm", disabled: audF.page >= pages - 1, onclick: function () { audF.page++; PF.refresh(); } }, "Próxima", icon("chevR", 12))));
      page.appendChild(panel);
    }
  };

  function fmtVal(key, val) {
    if (val == null) return "—";
    if (key === "assigneeId") { var u = PF.user(val); return u ? u.name : String(val); }
    if (key === "status" && PF.STATUS_META[val]) return PF.STATUS_META[val].label;
    if (key === "priority" && PF.PRIO_META[val]) return PF.PRIO_META[val].label;
    if (key === "labels" && Array.isArray(val)) return val.length ? val.map(PF.labelName).join(", ") : "—";
    if ((key === "blockedBy" || key === "teamIds") && val != null) {
      var arr = Array.isArray(val) ? val : [val];
      return arr.map(function (id) { var x = key === "teamIds" ? PF.team(id) : PF.task(id); return x ? (x.ref || x.name) : id; }).join(", ") || "—";
    }
    if ((key === "sprintId" || key === "epicId") && val) { var o = PF.byId(key === "sprintId" ? "sprints" : "epics", val); return o ? o.name : String(val); }
    if (Array.isArray(val)) return val.length ? val.join(", ") : "—";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  }

  function auditDrawer(id) {
    var a = PF.byId("audit", id);
    if (!a) return;
    var u = PF.user(a.userId);
    var proj = a.projectId ? PF.project(a.projectId) : null;
    var dr = PF.drawer({
      label: "Registro de auditoria",
      head: h("h2", { class: "drawer-title" }, icon("scroll", 16), h("b", {}, ACTION_LABELS[a.action] || a.action)),
      body: h("div")
    });
    var body = dr.body;
    body.appendChild(h("div", { class: "task-props" },
      h("span", { class: "pl" }, "Usuário"), PF.whoCell(a.userId),
      h("span", { class: "pl" }, "Papel"), h("span", {}, u ? PF.roleName(u.roleId) : "—"),
      h("span", { class: "pl" }, "Entidade"), h("span", {}, (ENTITY_LABELS[a.entityType] || a.entityType) + (a.entityId ? " · " + a.entityId : "")),
      h("span", { class: "pl" }, "Projeto"), proj ? h("a", { href: "#/projects/" + proj.id, onclick: function () { PF.closeOverlays(); } }, proj.name) : h("span", {}, "—"),
      h("span", { class: "pl" }, "Origem"), h("span", {}, h("span", { class: "src-tag " + a.source }, PF.sourceLabel(a.source))),
      h("span", { class: "pl" }, "Data e hora"), h("span", {}, PF.fmtDateTime(a.ts))));

    body.appendChild(h("div", { class: "section-h" }, "O que aconteceu"));
    body.appendChild(h("p", {}, (u ? u.name + " " : "") + a.summary + "."));

    if (a.before || a.after) {
      body.appendChild(h("div", { class: "section-h" }, "Alterações"));
      var keys = {};
      Object.keys(a.before || {}).forEach(function (k) { keys[k] = 1; });
      Object.keys(a.after || {}).forEach(function (k) { keys[k] = 1; });
      var FIELD_PT = { status: "Status", priority: "Prioridade", assigneeId: "Responsável", title: "Título", name: "Nome", desc: "Descrição", dueDate: "Prazo", archived: "Arquivado", teamIds: "Equipes", labels: "Etiquetas", role: "Papel", active: "Ativo", url: "URL", events: "Eventos", member: "Membro", blockedBy: "Bloqueada por", targetDate: "Data de entrega", startDate: "Início", key: "Chave", leadId: "Responsável", fields: "Campos", acceptance: "Critérios", sprintId: "Sprint", epicId: "Épico", channel: "Canal", enabled: "Ligado", goal: "Meta" };
      var tbl = h("table", { class: "diff-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Campo"), h("th", {}, "Valor anterior"), h("th", {}, "Novo valor"))));
      var tb = h("tbody");
      Object.keys(keys).forEach(function (k) {
        tb.appendChild(h("tr", {},
          h("td", {}, FIELD_PT[k] || k),
          h("td", {}, a.before && k in a.before ? h("span", { class: "diff-old" }, fmtVal(k, a.before[k])) : h("span", { class: "subtle" }, "—")),
          h("td", {}, a.after && k in a.after ? h("span", { class: "diff-new" }, fmtVal(k, a.after[k])) : h("span", { class: "subtle" }, "—"))));
      });
      tbl.appendChild(tb);
      body.appendChild(tbl);
    }

    // evento correlacionado
    var ev = a.eventId ? PF.byId("events", a.eventId)
      : a.entityId ? PF.db.events.find(function (e) { return e.entityId === a.entityId && Math.abs(new Date(e.ts) - new Date(a.ts)) < 5000; }) : null;
    if (ev) {
      body.appendChild(h("div", { class: "section-h" }, "Evento emitido"));
      body.appendChild(h("pre", { class: "code" }, JSON.stringify({ id: ev.id, type: ev.type, occurredAt: ev.ts, data: ev.payload }, null, 2)));
    }
    if (a.entityType === "task" && PF.task(a.entityId)) {
      body.appendChild(h("div", { class: "mt-3" },
        h("button", { class: "btn btn-sm", onclick: function () { PF.ui.openTask(a.entityId); } }, "Abrir tarefa", icon("arrowR", 12))));
    }
  }
})();
