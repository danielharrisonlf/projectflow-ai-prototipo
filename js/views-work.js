/* ============================================================
   ProjectFlow AI — tarefas, kanban, backlog, sprints, cronograma
   ============================================================ */
(function () {
  "use strict";
  var h = PF.h, icon = PF.icon;
  var LABELS = PF.LABELS;

  /* ============================ MODAL DE TAREFA ============================ */
  PF.ui.taskModal = function (defaults) {
    defaults = defaults || {};
    if (!PF.can("task.create")) { PF.deny("criar tarefas"); return; }
    var projects = PF.visibleProjects().filter(function (p) { return p.status !== "done"; });
    if (!projects.length) { PF.toast("Sem projetos", "Não há projetos disponíveis para o seu perfil.", "warn"); return; }
    var projectId = defaults.projectId && projects.some(function (p) { return p.id === defaults.projectId; }) ? defaults.projectId : projects[0].id;

    var f = {
      project: PF.select(projects.map(function (p) { return { value: p.id, label: p.name }; }), projectId, function (v) { projectId = v; syncDependent(); }),
      title: h("input", { class: "input", maxlength: "120", placeholder: "O que precisa ser feito?" }),
      type: PF.select([{ value: "task", label: "Tarefa" }, { value: "bug", label: "Bug" }], defaults.type || "task"),
      priority: PF.select(PF.PRIORITIES.map(function (p) { return { value: p, label: PF.PRIO_META[p].label }; }), defaults.priority || "medium"),
      assignee: h("select", { class: "select" }),
      epic: h("select", { class: "select" }),
      sprint: h("select", { class: "select" }),
      due: h("input", { class: "input", type: "date", value: defaults.dueDate || "" }),
      desc: h("textarea", { class: "textarea", placeholder: "Contexto, requisitos, links…" }),
      accept: h("textarea", { class: "textarea", placeholder: "Um critério de aceite por linha" })
    };
    var labelBoxes = LABELS.map(function (l) {
      var chip = PF.labelChip(l);
      var b = h("button", { type: "button", class: "label-chip", "aria-pressed": "false", "data-label": l,
        onclick: function () { b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true"); } }, PF.labelName(l));
      b.style.cssText = chip.style.cssText;
      return b;
    });

    function fillSelect(sel, options, value) {
      sel.replaceChildren();
      options.forEach(function (o) {
        var opt = h("option", { value: o.value }, o.label);
        if (o.value === value) opt.selected = true;
        sel.appendChild(opt);
      });
    }
    function syncDependent() {
      var me = PF.me();
      var members = PF.projectMembers(projectId).filter(function (u) { return PF.can("task.assign") || u.id === me.id; });
      fillSelect(f.assignee, [{ value: "", label: "Sem responsável" }].concat(members.map(function (u) { return { value: u.id, label: u.name }; })), defaults.assigneeId || "");
      fillSelect(f.epic, [{ value: "", label: "Sem épico" }].concat(PF.epicsOf(projectId).map(function (e) { return { value: e.id, label: e.name }; })), defaults.epicId || "");
      fillSelect(f.sprint, [{ value: "", label: "Sem sprint (backlog)" }].concat(PF.sprintsOf(projectId).filter(function (s) { return s.status !== "done"; }).map(function (s) { return { value: s.id, label: s.name + (s.status === "active" ? " (ativa)" : "") }; })), defaults.sprintId || "");
    }
    syncDependent();

    var form = h("div", { class: "form-grid" },
      PF.field("Projeto", f.project, { span2: true }),
      PF.field("Título", f.title, { span2: true, required: true }),
      PF.field("Tipo", f.type), PF.field("Prioridade", f.priority),
      PF.field("Responsável", f.assignee), PF.field("Épico", f.epic),
      PF.field("Sprint", f.sprint), PF.field("Prazo", f.due),
      PF.fieldGroup("Etiquetas", h("div", { class: "chip-toggles" }, labelBoxes), { span2: true }),
      PF.field("Descrição", f.desc, { span2: true }),
      PF.field("Critérios de aceite", f.accept, { span2: true })
    );

    form.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); createBtn.click(); }
    });
    var createBtn;
    PF.modal({
      title: "Nova tarefa", wide: true, body: form,
      foot: [
        h("span", { class: "foot-hint" }, h("kbd", {}, "Ctrl"), h("kbd", {}, "Enter"), "cria a tarefa"),
        h("button", { class: "btn", onclick: PF.closeOverlays }, "Cancelar"),
        createBtn = h("button", { class: "btn btn-primary", "aria-keyshortcuts": "Control+Enter Meta+Enter", onclick: function () {
          PF.clearInvalid(form);
          if (!f.title.value.trim()) { PF.setInvalid(f.title.closest(".field"), "Informe o título da tarefa"); return; }
          var acceptance = f.accept.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean)
            .map(function (s) { return { text: s, done: false }; });
          var t = PF.act.createTask({
            projectId: projectId, title: f.title.value.trim(), type: f.type.value,
            priority: f.priority.value, assigneeId: f.assignee.value || null,
            epicId: f.epic.value || null, sprintId: f.sprint.value || null,
            dueDate: f.due.value || null, desc: f.desc.value.trim(),
            labels: labelBoxes.filter(function (b) { return b.getAttribute("aria-pressed") === "true"; }).map(function (b) { return b.getAttribute("data-label"); }),
            acceptance: acceptance, status: defaults.status || "todo"
          });
          if (t) PF.closeOverlays();
        } }, "Criar tarefa")
      ]
    });
  };

  /* ============================ DRAWER DE TAREFA (inspector) ============================ */
  // marca a tarefa aberta no inspector (card do Kanban, linha de tabela, linha de lista)
  function markOpen(id) {
    PF._openTaskId = id;
    document.querySelectorAll('#app .kcard[aria-current="true"], #app .list-item[aria-current="true"]').forEach(function (el) { el.removeAttribute("aria-current"); });
    document.querySelectorAll("#app tr.is-selected").forEach(function (el) { el.classList.remove("is-selected"); });
    if (!id) return;
    var card = document.querySelector('#app [data-fk="kcard-' + id + '"]');
    if (card) card.setAttribute("aria-current", "true");
    var row = document.querySelector('#app [data-fk="row-' + id + '"]');
    if (row && row.closest("tr")) row.closest("tr").classList.add("is-selected");
    var li = document.querySelector('#app [data-fk="trow-' + id + '"]');
    if (li) li.setAttribute("aria-current", "true");
  }
  // glifo decorativo (o texto ao lado já diz o valor)
  function deco(el) { ["data-tip", "role", "aria-label"].forEach(function (a) { el.removeAttribute(a); }); el.setAttribute("aria-hidden", "true"); return el; }
  var SRC_NODE = { ui: "accent", ai: "violet", mcp: "violet", automation: "info", api: "warn" };

  PF.ui.openTask = function (taskId) {
    var t0 = PF.task(taskId);
    if (!t0) return;
    if (!PF.canSeeProject(t0.projectId)) { PF.deny("ver esta tarefa"); return; }
    var p0 = PF.project(t0.projectId);

    var copyBtn = h("button", { class: "btn btn-ghost btn-icon", "aria-label": "Copiar referência " + t0.ref, onclick: function () { PF.copyText(t0.ref, "Referência " + t0.ref + " copiada"); } }, icon("copy", 15));
    var dr = PF.drawer({
      label: "Tarefa " + t0.ref,
      head: h("div", { class: "drawer-crumb" },
        PF.typeIcon(t0.type, 16),
        h("span", { class: "ref" }, t0.ref),
        h("span", { class: "sep", "aria-hidden": "true" }, icon("chevR", 12)),
        h("a", { href: "#/projects/" + p0.id, onclick: function () { PF.closeOverlays(); } }, PF.projectDot(p0), p0.name)),
      headActions: [copyBtn, taskMenuBtn(taskId)],
      body: h("div"),
      onClose: function () { markOpen(null); }
    });
    markOpen(taskId);

    function render() {
      var t = PF.task(taskId);
      if (!t) { PF.closeOverlays(); return; }
      var body = dr.body;
      body.replaceChildren();
      var canEdit = PF.canTouchTask(t);
      var p = PF.project(t.projectId);

      // título
      var titleIn = h("textarea", { class: "textarea task-title", rows: "1", "aria-label": "Título da tarefa", disabled: !canEdit }, t.title);
      titleIn.addEventListener("change", function () {
        var v = titleIn.value.trim();
        if (!v) {
          titleIn.value = t.title;
          PF.toast("Título obrigatório", "O título não pode ficar vazio; o valor anterior foi mantido.", "warn");
          return;
        }
        if (v !== t.title) PF.act.updateTask(t.id, { title: v });
      });
      body.appendChild(titleIn);
      if (!canEdit) body.appendChild(h("p", { class: "ro-note" }, icon("block", 12), "Somente leitura para o perfil atual."));

      // bloqueios ativos: faixa de atenção com links para os bloqueadores
      var activeBl = t.status !== "done" ? PF.activeBlockers(t) : [];
      if (activeBl.length) {
        var blTxt = h("span", {}, "Bloqueada por ");
        activeBl.forEach(function (bt, i) {
          if (i) blTxt.appendChild(document.createTextNode(", "));
          blTxt.appendChild(h("a", { href: "#", onclick: function (e) { e.preventDefault(); PF.ui.openTask(bt.id); } }, bt.ref));
        });
        body.appendChild(h("div", { class: "banner warn", role: "status" }, icon("block", 14), blTxt));
      }

      // propriedades
      var props = h("div", { class: "task-props" });
      function prop(label, ic, control) {
        props.appendChild(h("span", { class: "pl" }, icon(ic, 14), label));
        props.appendChild(control);
      }

      prop("Status", "check2", canEdit ? PF.propButton({
        label: "Status", fk: "prop-status", value: t.status,
        options: PF.STATUSES.map(function (s) { return { value: s, label: PF.STATUS_META[s].label, node: function () { return PF.statusIcon(s); } }; }),
        onChange: function (v) { PF.act.moveTask(t.id, v); }
      }) : PF.propValue(PF.statusIcon(t.status), PF.STATUS_META[t.status].label));

      prop("Prioridade", "flag", canEdit ? PF.propButton({
        label: "Prioridade", fk: "prop-priority", value: t.priority,
        options: PF.PRIORITIES.map(function (pr) { return { value: pr, label: PF.PRIO_META[pr].label, node: function () { return deco(PF.prioChip(pr, true)); } }; }),
        onChange: function (v) { PF.act.updateTask(t.id, { priority: v }); }
      }) : PF.propValue(deco(PF.prioChip(t.priority, true)), PF.PRIO_META[t.priority].label));

      var me = PF.me();
      var members = PF.projectMembers(p.id).filter(function (u) { return PF.can("task.assign") || u.id === me.id; });
      // o responsável atual sempre aparece (mesmo que tenha saído da equipe)
      if (t.assigneeId && !members.some(function (u) { return u.id === t.assigneeId; }) && PF.user(t.assigneeId)) members.push(PF.user(t.assigneeId));
      var canAssign = canEdit && (PF.can("task.assign") || !t.assigneeId || t.assigneeId === me.id);
      var who = PF.user(t.assigneeId);
      function av(u) { return function () { var a = PF.avatarEl(u, "sm"); a.setAttribute("aria-hidden", "true"); a.removeAttribute("data-tip"); return a; }; }
      prop("Responsável", "user", canAssign ? PF.propButton({
        label: "Responsável", fk: "prop-assignee", value: t.assigneeId || "", empty: "Sem responsável",
        options: [{ value: "", label: "Sem responsável", node: av(null) }].concat(members.map(function (u) { return { value: u.id, label: u.name, node: av(u) }; })),
        onChange: function (v) { PF.act.updateTask(t.id, { assigneeId: v || null }); }
      }) : PF.propValue(av(who)(), who ? who.name : "Sem responsável", !who));

      var team = PF.team(t.teamId);
      prop("Equipe", "users", canEdit ? PF.propButton({
        label: "Equipe", fk: "prop-team", value: t.teamId, icon: "users",
        options: p.teamIds.map(function (tid) { var tm = PF.team(tid); return { value: tid, label: tm ? tm.name : tid }; }),
        onChange: function (v) { PF.act.updateTask(t.id, { teamId: v }); }
      }) : PF.propValue(null, team ? team.name : "—", !team));

      var epic = PF.byId("epics", t.epicId);
      prop("Épico", "epic", canEdit ? PF.propButton({
        label: "Épico", fk: "prop-epic", value: t.epicId || "", empty: "Sem épico",
        options: [{ value: "", label: "Sem épico" }].concat(PF.epicsOf(p.id).map(function (e) { return { value: e.id, label: e.name, node: function () { return deco(PF.typeIcon("epic")); } }; })),
        onChange: function (v) { PF.act.updateTask(t.id, { epicId: v || null }); }
      }) : PF.propValue(epic ? deco(PF.typeIcon("epic")) : null, epic ? epic.name : "Sem épico", !epic));

      var SPRINT_ST = { active: "ativa", planned: "planejada", done: "encerrada" };
      var sprint = PF.byId("sprints", t.sprintId);
      prop("Sprint", "sprint", canEdit ? PF.propButton({
        label: "Sprint", fk: "prop-sprint", value: t.sprintId || "", empty: "Sem sprint", icon: "sprint",
        options: [{ value: "", label: "Sem sprint" }].concat(PF.sprintsOf(p.id).filter(function (s) { return s.status !== "done" || s.id === t.sprintId; })
          .map(function (s) { return { value: s.id, label: s.name + " (" + SPRINT_ST[s.status] + ")" }; })),
        onChange: function (v) { PF.act.updateTask(t.id, { sprintId: v || null }); }
      }) : PF.propValue(null, sprint ? sprint.name : "Sem sprint", !sprint));

      var dueIn = h("input", { class: "input", type: "date", value: t.dueDate || "", disabled: !canEdit, "aria-label": "Prazo" });
      dueIn.addEventListener("change", function () { PF.act.updateTask(t.id, { dueDate: dueIn.value || null }); });
      var dueWrap = h("div", { class: "pv-row" }, dueIn);
      if (PF.isOverdue(t)) dueWrap.appendChild(h("span", { class: "chip danger" }, (-PF.daysLeft(t.dueDate)) + "d de atraso"));
      else if (t.dueDate && t.status !== "done" && PF.daysLeft(t.dueDate) <= 2) dueWrap.appendChild(h("span", { class: "chip warn" }, PF.daysLeft(t.dueDate) === 0 ? "Vence hoje" : "Vence em " + PF.daysLeft(t.dueDate) + "d"));
      prop("Prazo", "calendar", dueWrap);

      // etiquetas e bloqueios como propriedades
      var labRow = h("div", { class: "pv-row" });
      t.labels.forEach(function (l) { labRow.appendChild(PF.labelChip(l)); });
      if (canEdit) {
        var addLab = h("button", { type: "button", class: "prop-btn" + (t.labels.length ? "" : " is-empty"), "aria-label": t.labels.length ? "Editar etiquetas" : "Adicionar etiquetas", "aria-haspopup": "menu", "aria-expanded": "false", "data-fk": "prop-labels" },
          icon(t.labels.length ? "edit" : "plus", 13), h("span", { class: "pv" }, t.labels.length ? "Editar" : "Adicionar"));
        addLab.addEventListener("click", function () {
          PF.menu(addLab, [{ head: "Etiquetas" }].concat(LABELS.map(function (l) {
            return {
              label: PF.labelName(l), checked: t.labels.indexOf(l) >= 0,
              onClick: function () {
                var ls = t.labels.slice();
                var i = ls.indexOf(l);
                if (i >= 0) ls.splice(i, 1); else ls.push(l);
                PF.act.updateTask(t.id, { labels: ls });
              }
            };
          })), { label: "Etiquetas" });
        });
        labRow.appendChild(addLab);
      } else if (!t.labels.length) labRow.appendChild(h("span", { class: "subtle" }, "Sem etiquetas"));
      prop("Etiquetas", "tag", labRow);

      var blRow = h("div", { class: "pv-row" });
      t.blockedBy.map(PF.task).filter(Boolean).forEach(function (bt) {
        blRow.appendChild(h("a", { href: "#", class: "chip" + (bt.status === "done" ? "" : " warn"), onclick: function (e) { e.preventDefault(); PF.ui.openTask(bt.id); } },
          h("span", { class: "mono" }, bt.ref)));
      });
      if (canEdit) {
        var blockBtn = h("button", { type: "button", class: "prop-btn" + (t.blockedBy.length ? "" : " is-empty"), "aria-label": t.blockedBy.length ? "Editar bloqueios" : "Adicionar bloqueio", "aria-haspopup": "menu", "aria-expanded": "false", "data-fk": "prop-blocks" },
          icon(t.blockedBy.length ? "edit" : "plus", 13), h("span", { class: "pv" }, t.blockedBy.length ? "Editar" : "Adicionar"));
        blockBtn.addEventListener("click", function () {
          var current = t.blockedBy.map(PF.task).filter(Boolean);
          var candidates = PF.projectTasks(p.id).filter(function (x) {
            return x.id !== t.id && !x.parentId && x.status !== "done" && t.blockedBy.indexOf(x.id) < 0 && !PF.wouldCycle(t.id, x.id);
          }).slice(0, 12);
          PF.menu(blockBtn, [{ head: "Esta tarefa está bloqueada por…" }].concat(current.concat(candidates).map(function (x) {
            return {
              label: x.ref + " — " + x.title.slice(0, 40), checked: t.blockedBy.indexOf(x.id) >= 0,
              sub: x.status === "done" ? "concluída — não bloqueia mais" : null,
              onClick: function () {
                var bb = t.blockedBy.slice();
                var i = bb.indexOf(x.id);
                if (i >= 0) bb.splice(i, 1); else bb.push(x.id);
                PF.act.updateTask(t.id, { blockedBy: bb });
              }
            };
          })), { label: "Bloqueios" });
        });
        blRow.appendChild(blockBtn);
      } else if (!t.blockedBy.length) blRow.appendChild(h("span", { class: "subtle" }, "Nenhum"));
      prop("Bloqueada por", "block", blRow);

      prop("Criada", "clock", h("span", { class: "meta-line" }, PF.fmtDateTime(t.createdAt) + " · atualizada " + PF.rel(t.updatedAt)));
      body.appendChild(props);

      // descrição
      body.appendChild(h("h2", { class: "section-h" }, "Descrição"));
      var descIn = h("textarea", { class: "textarea", placeholder: "Sem descrição.", disabled: !canEdit, "aria-label": "Descrição" }, t.desc || "");
      descIn.addEventListener("change", function () { PF.act.updateTask(t.id, { desc: descIn.value.trim() }); });
      body.appendChild(descIn);

      // critérios de aceite
      var accDone = t.acceptance.filter(function (a) { return a.done; }).length;
      body.appendChild(h("h2", { class: "section-h" }, "Critérios de aceite",
        t.acceptance.length ? h("span", { class: "sh-aside" }, accDone + "/" + t.acceptance.length + " atendidos") : null));
      if (t.acceptance.length) body.appendChild(PF.progressBar(100 * accDone / t.acceptance.length, accDone === t.acceptance.length, "Critérios atendidos"));
      if (!t.acceptance.length) body.appendChild(h("p", { class: "subtle" }, "Nenhum critério definido."));
      t.acceptance.forEach(function (a, idx) {
        var cb = h("input", { type: "checkbox", disabled: !canEdit, "aria-label": a.text });
        cb.checked = a.done;
        cb.addEventListener("change", function () {
          var acc = t.acceptance.map(function (x, i) { return i === idx ? { text: x.text, done: cb.checked } : x; });
          PF.act.updateTask(t.id, { acceptance: acc });
        });
        body.appendChild(h("div", { class: "acc-item" + (a.done ? " done" : "") }, cb, h("span", {}, a.text)));
      });
      if (canEdit) {
        var accIn = h("input", { class: "input", placeholder: "Adicionar critério e Enter…", "aria-label": "Novo critério" });
        accIn.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && accIn.value.trim()) {
            PF.act.updateTask(t.id, { acceptance: t.acceptance.concat([{ text: accIn.value.trim(), done: false }]) });
          }
        });
        body.appendChild(h("div", { class: "add-row" }, accIn));
      }

      // subtarefas
      var subs = PF.db.tasks.filter(function (x) { return x.parentId === t.id; });
      if (subs.length || (canEdit && !t.parentId)) {
        var subDone = subs.filter(function (x) { return x.status === "done"; }).length;
        body.appendChild(h("h2", { class: "section-h" }, "Subtarefas", h("span", { class: "count" }, String(subs.length)),
          subs.length ? h("span", { class: "sh-aside" }, subDone + "/" + subs.length + " concluídas") : null));
        if (subs.length) {
          var subList = h("div", { class: "list sub-list" });
          subs.forEach(function (s) {
            subList.appendChild(h("button", { type: "button", class: "list-item compact", onclick: function () { PF.ui.openTask(s.id); } },
              PF.statusIcon(s.status), h("span", { class: "li-ref" }, s.ref),
              h("span", { class: "li-main" }, h("span", { class: "li-title" }, s.title)), PF.avatarEl(PF.user(s.assigneeId), "sm")));
          });
          body.appendChild(subList);
        }
        if (canEdit && !t.parentId) {
          var subIn = h("input", { class: "input", placeholder: "Nova subtarefa e Enter…", "aria-label": "Nova subtarefa" });
          subIn.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && subIn.value.trim()) {
              PF.act.createTask({ projectId: t.projectId, parentId: t.id, type: "subtask", title: subIn.value.trim(), epicId: t.epicId, sprintId: t.sprintId, teamId: t.teamId, silent: true });
            }
          });
          body.appendChild(h("div", { class: "add-row" }, subIn));
        }
      }

      // comentários
      var cms = PF.db.comments.filter(function (c) { return c.taskId === t.id; }).sort(function (a, b) { return PF.cmp(a.createdAt, b.createdAt); });
      body.appendChild(h("h2", { class: "section-h" }, "Comentários", h("span", { class: "count" }, String(cms.length))));
      cms.forEach(function (c) {
        var u = PF.user(c.userId);
        body.appendChild(h("div", { class: "comment" },
          PF.avatarEl(u),
          h("div", { class: "grow" },
            h("div", { class: "c-head" }, h("b", {}, u ? u.name : "?"), h("time", {}, PF.rel(c.createdAt))),
            h("div", { class: "c-body" }, c.text))));
      });
      var cmIn = h("textarea", { class: "textarea", placeholder: "Escreva um comentário… use @Nome Sobrenome para mencionar", "aria-label": "Novo comentário", "aria-keyshortcuts": "Control+Enter Meta+Enter" });
      function sendComment() { if (cmIn.value.trim()) PF.act.addComment(t.id, cmIn.value.trim()); }
      cmIn.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendComment(); } });
      var cmBtn = h("button", { class: "btn btn-primary btn-sm", onclick: sendComment }, icon("send", 13), "Comentar");
      body.appendChild(h("div", { class: "comment-box" }, cmIn,
        h("div", { class: "cb-foot" }, h("span", { class: "hint" }, h("kbd", {}, "Ctrl"), h("kbd", {}, "Enter"), "envia"), cmBtn)));

      // histórico (linha do tempo; a origem aparece no nó e no rótulo)
      var hist = PF.db.audit.filter(function (a) { return a.entityType === "task" && a.entityId === t.id; }).slice(0, 12);
      body.appendChild(h("h2", { class: "section-h" }, "Histórico"));
      if (!hist.length) body.appendChild(h("p", { class: "subtle" }, "Sem registros ainda."));
      else {
        var tl = h("div", { class: "timeline" });
        hist.forEach(function (a) {
          var u = PF.user(a.userId);
          tl.appendChild(h("div", { class: "hist-item" },
            h("span", { class: "tl-node " + (SRC_NODE[a.source] || ""), "aria-hidden": "true" }, icon(a.source === "ai" || a.source === "mcp" ? "sparkle" : a.source === "automation" ? "refresh" : a.source === "api" ? "plug" : "user", 11)),
            h("span", { class: "tl-txt" }, h("span", { class: "src-tag " + a.source }, PF.sourceLabel(a.source)), " ", h("b", {}, u ? u.name : "?"), " " + a.summary),
            h("time", {}, PF.rel(a.ts))));
        });
        body.appendChild(tl);
      }
    }
    PF._drawerRefresh = render;
    render();
  };

  function taskMenuBtn(taskId) {
    var btn = h("button", { class: "btn btn-ghost btn-icon", "aria-label": "Ações da tarefa", "aria-haspopup": "menu", "aria-expanded": "false" }, icon("dots", 15));
    btn.addEventListener("click", function () {
      var t = PF.task(taskId);
      var items = [];
      if (PF.canTouchTask(t) && PF.can("task.move")) {
        PF.STATUSES.forEach(function (s) {
          if (s !== t.status) items.push({ label: "Mover para " + PF.STATUS_META[s].label, onClick: function () { PF.act.moveTask(taskId, s); } });
        });
        items.push("sep");
      }
      items.push({ icon: "copy", label: "Copiar referência (" + t.ref + ")", onClick: function () {
        PF.copyText(t.ref, "Referência " + t.ref + " copiada");
      } });
      if (PF.can("task.delete")) items.push({ icon: "trash", label: "Excluir tarefa…", danger: true, onClick: function () {
        PF.confirm({ title: "Excluir tarefa", msg: "Remove " + t.ref + " e suas subtarefas (simulação). Não pode ser desfeito.", confirmLabel: "Excluir", danger: true })
          .then(function (ok) { if (ok) { PF.closeOverlays(); PF.act.deleteTask(taskId); } });
      } });
      PF.menu(btn, items);
    });
    return btn;
  }

  /* ============================ TABELA DE TAREFAS ============================ */
  var tblState = { q: "", status: "", priority: "", assignee: "", sort: "due", dir: 1, page: 0 };

  PF.ui.renderTaskTable = function (container, opts) {
    opts = opts || {};
    var st = opts.state || tblState;

    // barra de filtros criada uma única vez: digitar na busca redesenha só a tabela
    var fbar = h("div", { class: "fbar" });
    var qIn = h("input", { class: "input search", type: "search", placeholder: "Buscar por título ou ID…", value: st.q, "aria-label": "Buscar tarefas", "data-fk": "tbl-busca" });
    qIn.addEventListener("input", function () { st.q = qIn.value; st.page = 0; draw(); });
    fbar.appendChild(qIn);
    var fsStatus = PF.filterSelect("Status", [{ value: "", label: "Todos" }].concat(PF.STATUSES.map(function (s) { return { value: s, label: PF.STATUS_META[s].label }; })), st.status, function (v) { st.status = v; st.page = 0; draw(); });
    var fsPrio = PF.filterSelect("Prioridade", [{ value: "", label: "Todas" }].concat(PF.PRIORITIES.map(function (p) { return { value: p, label: PF.PRIO_META[p].label }; })), st.priority, function (v) { st.priority = v; st.page = 0; draw(); });
    fbar.append(fsStatus, fsPrio);
    var fsWho = null;
    if (!opts.assigneeId) {
      fsWho = PF.filterSelect("Responsável", [{ value: "", label: "Todos" }].concat(PF.scopeUsers().filter(function (u) { return !u.invited; }).map(function (u) { return { value: u.id, label: u.name }; })), st.assignee, function (v) { st.assignee = v; st.page = 0; draw(); });
      fbar.appendChild(fsWho);
    }
    var clearBtn = h("button", { class: "btn btn-ghost btn-sm", onclick: function () {
      st.q = st.status = st.priority = st.assignee = ""; st.page = 0;
      qIn.value = "";
      [fsStatus, fsPrio, fsWho].forEach(function (f) { if (f) f.querySelector("select").value = ""; });
      draw(); qIn.focus();
    } }, icon("x", 12), "Limpar");
    fbar.appendChild(clearBtn);
    container.appendChild(fbar);
    var holder = h("div");
    container.appendChild(holder);

    function draw() {
      var fk = PF.captureFocus();
      drawTable();
      if (fk && (document.activeElement === document.body || !document.activeElement)) PF.restoreFocus(fk);
    }
    function drawTable() {
      clearBtn.hidden = !(st.q || st.status || st.priority || st.assignee);
      fsStatus.classList.toggle("is-set", !!st.status);
      fsPrio.classList.toggle("is-set", !!st.priority);
      if (fsWho) fsWho.classList.toggle("is-set", !!st.assignee);
      holder.replaceChildren();
      var tasks = PF.visibleTasks().filter(function (t) {
        if (t.parentId) return false;
        if (opts.projectId && t.projectId !== opts.projectId) return false;
        if (opts.assigneeId && t.assigneeId !== opts.assigneeId) return false;
        if (opts.backlogMode && (t.sprintId || t.status === "done")) return false;
        if (st.status && t.status !== st.status) return false;
        if (st.priority && t.priority !== st.priority) return false;
        if (st.assignee && t.assigneeId !== st.assignee) return false;
        var q = st.q.trim().toLowerCase();
        if (q && t.title.toLowerCase().indexOf(q) < 0 && t.ref.toLowerCase().indexOf(q) < 0) return false;
        return true;
      });

      // ordenação
      var sorters = {
        ref: function (t) { return t.ref; },
        title: function (t) { return t.title.toLowerCase(); },
        status: function (t) { return PF.STATUSES.indexOf(t.status); },
        priority: function (t) { return PF.PRIORITIES.indexOf(t.priority); },
        due: function (t) { return t.dueDate || "9999"; },
        updated: function (t) { return t.updatedAt; }
      };
      tasks.sort(function (a, b) {
        return PF.cmp(sorters[st.sort](a), sorters[st.sort](b)) * st.dir || PF.cmp(a.ref, b.ref);
      });

      var PAGE = 15;
      var pages = Math.max(1, Math.ceil(tasks.length / PAGE));
      if (st.page >= pages) st.page = pages - 1;
      var slice = tasks.slice(st.page * PAGE, st.page * PAGE + PAGE);

      if (!tasks.length) {
        var filtered = st.q || st.status || st.priority || st.assignee;
        holder.appendChild(filtered
          ? PF.emptyState("filter", "Nenhuma tarefa corresponde aos filtros", "Ajuste a busca ou limpe os filtros para ver todas as tarefas.",
            h("button", { class: "btn", onclick: function () { clearBtn.click(); } }, icon("x", 12), "Limpar filtros"))
          : PF.emptyState("tasks", "Nenhuma tarefa por aqui", "Crie uma tarefa para começar.",
            PF.can("task.create") ? h("button", { class: "btn btn-primary", onclick: function () { PF.ui.taskModal({ projectId: opts.projectId }); } }, icon("plus", 14), "Nova tarefa") : null));
        return;
      }

      function th(key, label, cls) {
        var on = st.sort === key;
        return h("th", { class: "sortable " + (cls || ""), "aria-sort": on ? (st.dir > 0 ? "ascending" : "descending") : "none" },
          h("button", {
            type: "button", class: "th-sort", "data-fk": "sort-" + key,
            onclick: function () {
              if (st.sort === key) st.dir = -st.dir; else { st.sort = key; st.dir = 1; }
              draw();
              PF.announce("Ordenado por " + label + (st.dir > 0 ? ", crescente" : ", decrescente"));
            }
          }, label)); // a seta vem de th[aria-sort] .th-sort no CSS
      }

      var tbl = h("table", { class: "tbl" },
        h("thead", {}, h("tr", {},
          h("th", { class: "col-icon" }, h("span", { class: "sr-only" }, "Tipo")),
          th("ref", "ID"), th("title", "Título"), th("status", "Status"),
          th("priority", "Prioridade"), h("th", {}, "Responsável"),
          opts.projectId ? h("th", {}, "Sprint") : h("th", {}, "Projeto"),
          th("due", "Prazo"), th("updated", "Atualizada"))));
      var tb = h("tbody");
      slice.forEach(function (t) {
        var late = PF.isOverdue(t);
        var proj = PF.project(t.projectId);
        tb.appendChild(h("tr", { class: "row-click" + (PF._openTaskId === t.id ? " is-selected" : ""), onclick: function () { PF.ui.openTask(t.id); } },
          h("td", {}, PF.typeIcon(t.type)),
          h("td", { class: "mono nowrap subtle" }, t.ref),
          h("td", {}, h("div", { class: "cell-title" },
            h("div", { class: "tt" }, h("button", { type: "button", class: "row-link", "data-fk": "row-" + t.id, "aria-label": t.ref + " — " + t.title }, t.title),
              PF.isBlocked(t) ? h("span", { class: "chip warn" }, icon("block", 12), "Bloqueada") : null),
            t.labels.length ? h("div", { class: "cell-chips" }, t.labels.map(function (l) { return PF.labelChip(l); })) : null)),
          h("td", {}, PF.statusChip(t.status)),
          h("td", {}, PF.prioChip(t.priority)),
          h("td", {}, PF.whoCell(t.assigneeId)),
          opts.projectId
            ? h("td", {}, t.sprintId ? (PF.byId("sprints", t.sprintId) || { name: "—" }).name : h("span", { class: "subtle" }, "—"))
            : h("td", {}, h("span", { class: "cell-main" }, PF.projectDot(proj), proj.name)),
          h("td", { class: "date" }, t.dueDate ? h("span", { class: late ? "text-danger" : "" }, PF.fmtDate(t.dueDate)) : h("span", { class: "subtle" }, "—")),
          h("td", { class: "date subtle" }, PF.rel(t.updatedAt))));
      });
      tbl.appendChild(tb);

      var panel = h("div", { class: "panel" }, h("div", { class: "tbl-wrap" }, tbl));
      if (pages > 1) {
        panel.appendChild(h("div", { class: "pager" },
          h("span", { class: "num" }, PF.plural(tasks.length, "tarefa", "tarefas")),
          h("span", { class: "grow" }),
          h("button", { class: "btn btn-sm", disabled: st.page === 0, onclick: function () { st.page--; draw(); } }, icon("chevL", 12), "Anterior"),
          h("span", { class: "num" }, (st.page + 1) + " / " + pages),
          h("button", { class: "btn btn-sm", disabled: st.page >= pages - 1, onclick: function () { st.page++; draw(); } }, "Próxima", icon("chevR", 12))));
      } else {
        panel.appendChild(h("div", { class: "pager" }, h("span", { class: "num" }, PF.plural(tasks.length, "tarefa", "tarefas"))));
      }
      holder.appendChild(panel);
    }
    draw();
  };

  /* ============================ MINHAS TAREFAS ============================ */
  var myState = { q: "", status: "", priority: "", assignee: "", sort: "due", dir: 1, page: 0 };
  PF.profileHooks.push(function () {
    [tblState, myState, backlogState].forEach(function (st) { st.assignee = ""; st.page = 0; });
    boardF.assignee = boardF.sprint = ""; quickAddOpen = null;
  });
  PF.routes["my-tasks"] = {
    title: "Minhas tarefas", app: "workspace",
    render: function (page) {
      var me = PF.me();
      page.appendChild(PF.ui.pageHead("Minhas tarefas", "Tudo o que está atribuído a " + me.name + ".",
        PF.can("task.create") ? h("button", { class: "btn btn-primary", onclick: function () { PF.ui.taskModal({ assigneeId: me.id }); } }, icon("plus", 14), "Nova tarefa") : null));
      PF.ui.renderTaskTable(page, { assigneeId: me.id, state: myState });
    }
  };

  /* ============================ SELETOR DE PROJETO ============================ */
  // mesmo controle e mesma posição (ao lado do título) em Kanban, Backlog e Sprints
  function projectPicker() {
    var projects = PF.visibleProjects().filter(function (p) { return p.status !== "done"; });
    var cur = PF.project(PF.db.settings.currentProjectId);
    if (!cur || !projects.some(function (p) { return p.id === cur.id; })) {
      cur = projects[0] || null;
      if (cur) PF.db.settings.currentProjectId = cur.id;
    }
    if (!cur) return { el: h("span", { class: "muted" }, "Nenhum projeto disponível"), project: null };
    var sel = PF.select(projects.map(function (p) { return { value: p.id, label: p.name + " (" + p.key + ")" }; }), cur.id,
      function (v) { PF.act.setCurrentProject(v); }, { "aria-label": "Projeto atual", "data-fk": "project-switch" });
    var dot = PF.projectDot(cur, true);
    return { el: h("div", { class: "project-switch" }, dot, sel), project: cur };
  }

  /* ============================ KANBAN ============================ */
  var boardF = { q: "", assignee: "", priority: "", label: "", sprint: "", group: "none" };
  var quickAddOpen = null; // coluna com criação rápida aberta (sobrevive ao re-render)
  var SORT_LABEL = { none: "Criação", priority: "Prioridade", due: "Prazo" };

  // filtros do quadro: nome, opções (valor, rótulo, glifo) e rótulo do valor atual
  function boardFilterDefs(p) {
    return [
      { key: "assignee", name: "Responsável", ic: "user", all: "Todos",
        options: PF.projectMembers(p.id).map(function (u) { return { value: u.id, label: u.name, node: function () { var a = PF.avatarEl(u, "sm"); a.setAttribute("aria-hidden", "true"); a.removeAttribute("data-tip"); return a; } }; }) },
      { key: "priority", name: "Prioridade", ic: "flag", all: "Todas",
        options: PF.PRIORITIES.map(function (pr) { return { value: pr, label: PF.PRIO_META[pr].label, node: function () { var g = PF.prioChip(pr, true); g.removeAttribute("role"); g.removeAttribute("aria-label"); g.removeAttribute("data-tip"); g.setAttribute("aria-hidden", "true"); return g; } }; }) },
      { key: "sprint", name: "Sprint", ic: "sprint", all: "Todas",
        options: PF.sprintsOf(p.id).map(function (s) { return { value: s.id, label: s.name + (s.status === "active" ? " (ativa)" : s.status === "done" ? " (encerrada)" : "") }; }) },
      { key: "label", name: "Etiqueta", ic: "tag", all: "Todas",
        options: LABELS.map(function (l) { return { value: l, label: PF.labelName(l) }; }) }
    ];
  }
  function clearBoardFilters() { boardF.q = boardF.assignee = boardF.priority = boardF.sprint = boardF.label = ""; }
  function focusFk(k) { var el = document.querySelector('[data-fk="' + k + '"]'); if (el) el.focus(); }

  PF.routes.board = {
    title: "Kanban", app: "workspace", wide: true,
    render: function (page) {
      var pick = projectPicker();
      if (!pick.project) { page.appendChild(PF.emptyState("board", "Nenhum projeto", "Crie um projeto para usar o Kanban.")); return; }
      var p = pick.project;
      // sprint e responsável de outro projeto (ou fora do escopo) deixam de filtrar
      var sprintsHere = PF.sprintsOf(p.id);
      if (boardF.sprint && !sprintsHere.some(function (s) { return s.id === boardF.sprint; })) boardF.sprint = "";
      if (boardF.assignee && !PF.projectMembers(p.id).some(function (u) { return u.id === boardF.assignee; })) boardF.assignee = "";
      if (quickAddOpen && quickAddOpen.projectId !== p.id) quickAddOpen = null;

      page.appendChild(PF.ui.pageHead("Kanban", null, [
        PF.can("task.create") ? h("button", { class: "btn btn-primary", onclick: function () { PF.ui.taskModal({ projectId: p.id }); } }, icon("plus", 14), "Nova tarefa") : null
      ], pick.el));

      // barra de visão: busca · Filtro (popover) · chips removíveis · Ordenar
      var defs = boardFilterDefs(p);
      var vb = h("div", { class: "fbar viewbar" });
      var qIn = h("input", { class: "input search", type: "search", placeholder: "Buscar por título ou ID…", value: boardF.q, "aria-label": "Buscar no quadro", "data-fk": "board-busca" });
      var deb = null;
      qIn.addEventListener("input", function () { clearTimeout(deb); deb = setTimeout(function () { boardF.q = qIn.value; PF.refresh(); }, 180); });
      vb.appendChild(qIn);

      var active = defs.filter(function (d) { return boardF[d.key]; });
      var filterBtn = h("button", { class: "btn", "aria-haspopup": "menu", "aria-expanded": "false", "data-fk": "board-filtro",
        "aria-label": active.length ? "Filtro, " + PF.plural(active.length, "ativo", "ativos") : "Filtro" },
        icon("filter", 14), "Filtro", active.length ? h("span", { class: "btn-count", "aria-hidden": "true" }, String(active.length)) : null);
      function valueMenu(d) {
        PF.menu(filterBtn, [{ head: d.name }, { label: d.all, checked: !boardF[d.key], radio: true, onClick: function () { boardF[d.key] = ""; PF.refresh(); } }]
          .concat(d.options.map(function (o) {
            return { label: o.label, node: o.node ? o.node() : null, checked: boardF[d.key] === o.value, radio: true,
              onClick: function () { boardF[d.key] = o.value; PF.refresh(); } };
          })), { label: d.name });
      }
      filterBtn.addEventListener("click", function () {
        PF.menu(filterBtn, [{ head: "Filtrar por" }].concat(defs.map(function (d) {
          var cur = d.options.filter(function (o) { return o.value === boardF[d.key]; })[0];
          return { icon: d.ic, label: d.name, sub: cur ? cur.label : null, onClick: function () { valueMenu(d); } };
        })), { label: "Filtrar por" });
      });
      vb.appendChild(filterBtn);

      active.forEach(function (d) {
        var cur = d.options.filter(function (o) { return o.value === boardF[d.key]; })[0];
        var val = cur ? cur.label : boardF[d.key];
        vb.appendChild(h("button", { type: "button", class: "fchip", "data-fk": "fchip-" + d.key, "aria-label": "Remover filtro " + d.name + ": " + val,
          onclick: function () { boardF[d.key] = ""; PF.refresh(); focusFk("board-filtro"); } },
          h("span", { class: "fk" }, d.name), h("span", {}, val), h("span", { class: "fx", "aria-hidden": "true" }, icon("x", 12))));
      });
      if (active.length > 1 || (active.length && boardF.q)) {
        vb.appendChild(h("button", { class: "btn btn-ghost btn-sm", onclick: function () { clearBoardFilters(); PF.refresh(); focusFk("board-filtro"); } }, "Limpar tudo"));
      }
      vb.appendChild(h("span", { class: "grow" }));
      var sortBtn = h("button", { class: "btn", "aria-haspopup": "menu", "aria-expanded": "false", "data-fk": "board-ordem", "aria-label": "Ordenar por " + SORT_LABEL[boardF.group] },
        icon("backlog", 14), h("span", { class: "subtle" }, "Ordenar:"), SORT_LABEL[boardF.group], icon("chevD", 12));
      sortBtn.addEventListener("click", function () {
        PF.menu(sortBtn, [{ head: "Ordenar tarefas por" }].concat(["none", "priority", "due"].map(function (g) {
          return { label: SORT_LABEL[g], checked: boardF.group === g, radio: true, onClick: function () { boardF.group = g; PF.refresh(); } };
        })), { label: "Ordenar tarefas por" });
      });
      vb.appendChild(sortBtn);
      page.appendChild(vb);

      var tasks = PF.projectTasks(p.id).filter(function (t) {
        if (t.parentId) return false;
        if (boardF.assignee && t.assigneeId !== boardF.assignee) return false;
        if (boardF.priority && t.priority !== boardF.priority) return false;
        if (boardF.sprint && t.sprintId !== boardF.sprint) return false;
        if (boardF.label && t.labels.indexOf(boardF.label) < 0) return false;
        var q = boardF.q.trim().toLowerCase();
        if (q && t.title.toLowerCase().indexOf(q) < 0 && t.ref.toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      if (boardF.group === "priority") tasks.sort(function (a, b) { return PF.PRIORITIES.indexOf(a.priority) - PF.PRIORITIES.indexOf(b.priority) || PF.cmp(a.ref, b.ref); });
      if (boardF.group === "due") tasks.sort(function (a, b) { return PF.cmp(a.dueDate || "9999", b.dueDate || "9999") || PF.cmp(a.ref, b.ref); });

      var filtering = boardF.q || boardF.assignee || boardF.priority || boardF.sprint || boardF.label;
      if (filtering && !tasks.length) {
        var hidden = PF.projectTasks(p.id).filter(function (t) { return !t.parentId; }).length;
        page.appendChild(PF.emptyState("filter", "Nenhuma tarefa corresponde aos filtros",
          hidden + (hidden === 1 ? " tarefa oculta" : " tarefas ocultas") + " pelos filtros atuais.",
          h("button", { class: "btn", onclick: function () { clearBoardFilters(); PF.refresh(); } }, icon("x", 12), "Limpar filtros")));
        return;
      }
      var canMoveHere = PF.can("task.move");
      var board = h("div", { class: "board" });
      PF.STATUSES.forEach(function (status) {
        var colTasks = tasks.filter(function (t) { return t.status === status; });
        var lateN = colTasks.filter(PF.isOverdue).length;
        var col = h("div", { class: "col", dataset: { status: status } });
        var head = h("div", { class: "col-head" },
          PF.statusIcon(status),
          h("b", {}, PF.STATUS_META[status].label),
          h("span", { class: "count" }, String(colTasks.length)),
          lateN ? h("span", { class: "chip danger", role: "img", "aria-label": PF.plural(lateN, "tarefa atrasada", "tarefas atrasadas"), "data-tip": PF.plural(lateN, "atrasada", "atrasadas") }, icon("alert", 12), String(lateN)) : null);
        if (PF.can("task.create")) {
          head.appendChild(h("button", {
            class: "btn btn-ghost btn-icon btn-sm", "aria-label": "Criação rápida em " + PF.STATUS_META[status].label,
            onclick: function () { quickAdd(col, p, status); }
          }, icon("plus", 13)));
        }
        col.appendChild(head);
        var bodyEl = h("div", { class: "col-body" });
        colTasks.forEach(function (t) { bodyEl.appendChild(kanbanCard(t)); });
        if (!colTasks.length) bodyEl.appendChild(h("div", { class: "col-empty" },
          h("span", {}, "Sem tarefas"), canMoveHere ? h("span", {}, "Arraste uma tarefa para cá") : null));
        col.appendChild(bodyEl);

        // drag & drop
        col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("drop-over"); });
        col.addEventListener("dragleave", function () { col.classList.remove("drop-over"); });
        col.addEventListener("drop", function (e) {
          e.preventDefault();
          col.classList.remove("drop-over");
          var id = e.dataTransfer.getData("text/task-id");
          if (!id) return;
          var t = PF.task(id);
          if (t && t.status !== status) PF.act.moveTask(id, status);
        });
        board.appendChild(col);
      });
      page.appendChild(board);
      // criação rápida continua aberta depois do Enter
      if (quickAddOpen) {
        var qCol = board.querySelector('.col[data-status="' + quickAddOpen.status + '"]');
        if (qCol) quickAdd(qCol, p, quickAddOpen.status);
      }
    }
  };

  function kanbanCard(t) {
    var canDrag = PF.canTouchTask(t) && PF.can("task.move");
    var card = h("div", {
      class: "kcard", tabindex: "0", role: "button",
      "aria-label": t.ref + " — " + t.title + ". " + PF.STATUS_META[t.status].label + (canDrag ? ". Alt+seta esquerda ou direita move entre colunas" : ""),
      "aria-keyshortcuts": canDrag ? "Alt+ArrowLeft Alt+ArrowRight" : null,
      "aria-current": PF._openTaskId === t.id ? "true" : null,
      "data-fk": "kcard-" + t.id,
      draggable: canDrag ? "true" : null
    });
    var subs = PF.db.tasks.filter(function (x) { return x.parentId === t.id; });
    card.appendChild(h("div", { class: "kc-top" },
      PF.typeIcon(t.type, 14),
      h("span", { class: "ref" }, t.ref),
      h("span", { class: "grow" }),
      PF.avatarEl(PF.user(t.assigneeId), "sm")));
    card.appendChild(h("div", { class: "kc-title" }, t.title));
    if (t.labels.length) card.appendChild(h("div", { class: "kc-labels" }, t.labels.map(function (l) { return PF.labelChip(l); })));
    var due = PF.daysLeft(t.dueDate);
    var late = PF.isOverdue(t);
    card.appendChild(h("div", { class: "kc-foot" },
      PF.prioChip(t.priority, true),
      PF.isBlocked(t) ? h("span", { class: "blocked-flag" }, icon("block", 12), "Bloqueada") : null,
      t.dueDate ? h("span", { class: "due" + (late ? " late" : t.status !== "done" && due != null && due <= 2 ? " soon" : "") }, icon("calendar", 12),
        late ? (-due) + "d de atraso" : due === 0 ? "Hoje" : due === 1 ? "Amanhã" : PF.fmtDate(t.dueDate)) : null,
      subs.length ? h("span", { class: "due", "aria-label": "Subtarefas concluídas: " + subs.filter(function (s) { return s.status === "done"; }).length + " de " + subs.length }, icon("subtask", 12), subs.filter(function (s) { return s.status === "done"; }).length + "/" + subs.length) : null));

    card.addEventListener("click", function () { PF.ui.openTask(t.id); });
    card.addEventListener("keydown", function (e) {
      if (e.target !== card) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); PF.ui.openTask(t.id); return; }
      if (canDrag && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        var i = PF.STATUSES.indexOf(t.status) + (e.key === "ArrowRight" ? 1 : -1);
        if (i < 0 || i >= PF.STATUSES.length) return;
        var to = PF.STATUSES[i];
        if (PF.act.moveTask(t.id, to)) PF.announce(t.ref + " movida para " + PF.STATUS_META[to].label);
      }
    });
    if (canDrag) {
      card.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/task-id", t.id);
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", function () { card.classList.remove("dragging"); });
    }
    return card;
  }

  function quickAdd(col, project, status) {
    if (col.querySelector(".quick-add")) return;
    var input = h("input", { class: "input", placeholder: "Título e Enter…", "aria-label": "Nova tarefa em " + PF.STATUS_META[status].label, "data-fk": "quick-add-" + status });
    var wrap = h("div", { class: "quick-add col-add" }, input);
    function closeQuick() { quickAddOpen = null; wrap.remove(); }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); closeQuick(); }
      if (e.key === "Enter" && input.value.trim()) {
        // a sprint filtrada só vale se for deste projeto e não estiver encerrada
        var sp = boardF.sprint ? PF.byId("sprints", boardF.sprint) : null;
        quickAddOpen = { projectId: project.id, status: status };
        var t = PF.act.createTask({ projectId: project.id, title: input.value.trim(), status: status, sprintId: sp && sp.projectId === project.id && sp.status !== "done" ? sp.id : null });
        if (!t) quickAddOpen = null;
      }
    });
    // saiu do campo (e ele ainda está na tela): fecha; re-render não conta como saída
    input.addEventListener("blur", function () { setTimeout(function () { if (wrap.isConnected && !wrap.contains(document.activeElement)) closeQuick(); }, 150); });
    col.insertBefore(wrap, col.querySelector(".col-body"));
    input.focus();
  }

  /* ============================ BACKLOG ============================ */
  var backlogState = { q: "", status: "", priority: "", assignee: "", sort: "priority", dir: 1, page: 0 };
  PF.routes.backlog = {
    title: "Backlog", app: "workspace",
    render: function (page) {
      var pick = projectPicker();
      if (!pick.project) { page.appendChild(PF.emptyState("backlog", "Nenhum projeto", "Crie um projeto para planejar o backlog.")); return; }
      page.appendChild(PF.ui.pageHead("Backlog", "Tarefas de " + pick.project.name + " ainda fora de sprint.", [
        PF.can("task.create") ? h("button", { class: "btn btn-primary", onclick: function () { PF.ui.taskModal({ projectId: pick.project.id, status: "backlog" }); } }, icon("plus", 14), "Nova tarefa") : null
      ], pick.el));
      PF.ui.renderTaskTable(page, { projectId: pick.project.id, backlogMode: true, state: backlogState });
    }
  };

  /* ============================ SPRINTS ============================ */
  PF.routes.sprints = {
    title: "Sprints", app: "workspace",
    render: function (page) {
      var pick = projectPicker();
      if (!pick.project) { page.appendChild(PF.emptyState("sprint", "Nenhum projeto", "Crie um projeto para planejar sprints.")); return; }
      var p = pick.project;
      page.appendChild(PF.ui.pageHead("Sprints", "Planejamento e histórico de " + p.name + ".", [
        PF.can("sprint.manage") ? h("button", { class: "btn btn-primary", onclick: function () { sprintModal(p); } }, icon("plus", 14), "Nova sprint") : null
      ], pick.el));

      var sprints = PF.sprintsOf(p.id);
      var order = { active: 0, planned: 1, done: 2 };
      sprints.sort(function (a, b) { return order[a.status] - order[b.status] || PF.cmp(b.startDate, a.startDate) || PF.cmp(a.name, b.name); });
      if (!sprints.length) {
        page.appendChild(PF.emptyState("sprint", "Nenhuma sprint", "Crie a primeira sprint para organizar o trabalho em ciclos.",
          PF.can("sprint.manage") ? h("button", { class: "btn btn-primary", onclick: function () { sprintModal(p); } }, icon("plus", 14), "Nova sprint") : null));
        return;
      }

      var sprStack = h("div", { class: "stack" });
      page.appendChild(sprStack);
      sprints.forEach(function (s) {
        var ts = PF.db.tasks.filter(function (t) { return t.sprintId === s.id && !t.parentId; });
        var done = ts.filter(function (t) { return t.status === "done"; }).length;
        var pct = ts.length ? Math.round(100 * done / ts.length) : 0;
        var panel = h("div", { class: "panel sprint-panel" + (s.status === "active" ? " is-active" : "") });
        var stChip = s.status === "active" ? h("span", { class: "chip accent" }, icon("play", 12), "Ativa")
          : s.status === "planned" ? h("span", { class: "chip" }, icon("calendar", 12), "Planejada")
          : h("span", { class: "chip ok" }, icon("check", 12), "Concluída");
        var headActions = [];
        if (PF.can("sprint.manage")) {
          if (s.status === "planned") headActions.push(h("button", { class: "btn btn-sm btn-primary", onclick: function () { PF.act.startSprint(s.id); } }, icon("play", 12), "Iniciar sprint"));
          if (s.status === "active") headActions.push(h("button", { class: "btn btn-sm", onclick: function () {
            PF.confirm({ title: "Encerrar " + s.name, msg: "Tarefas não concluídas voltam para o backlog do projeto.", confirmLabel: "Encerrar sprint" })
              .then(function (ok) { if (ok) PF.act.completeSprint(s.id); });
          } }, "Encerrar sprint"));
          if (s.status !== "done") {
            var addBtn = h("button", { class: "btn btn-sm", "aria-haspopup": "menu", "aria-expanded": "false" }, icon("plus", 12), "Adicionar do backlog");
            addBtn.addEventListener("click", function () {
              var backlog = PF.projectTasks(p.id).filter(function (t) { return !t.sprintId && !t.parentId && t.status !== "done"; }).slice(0, 14);
              if (!backlog.length) { PF.toast("Backlog vazio", "Não há tarefas fora de sprint neste projeto.", "info"); return; }
              PF.menu(addBtn, [{ head: "Associar à " + s.name }].concat(backlog.map(function (t) {
                return { label: t.ref + " — " + t.title.slice(0, 44), onClick: function () { PF.act.updateTask(t.id, { sprintId: s.id }); } };
              })));
            });
            headActions.push(addBtn);
          }
        }
        panel.appendChild(h("div", { class: "panel-head" },
          h("h3", {}, s.name), stChip,
          h("span", { class: "subtle num" }, PF.fmtDate(s.startDate) + " → " + PF.fmtDate(s.endDate)),
          h("span", { class: "spacer" }), headActions));
        var body = h("div", { class: "panel-body sprint-sum" });
        body.appendChild(h("div", { class: "sprint-goal" }, icon("flag", 14), s.goal ? h("span", {}, h("span", { class: "subtle" }, "Meta "), s.goal) : h("span", { class: "subtle" }, "Sem meta definida")));
        body.appendChild(h("div", { class: "sprint-prog" },
          PF.progressBar(pct, pct === 100, "Progresso da " + s.name),
          h("span", { class: "num" }, h("b", {}, done + "/" + ts.length), " concluídas · " + pct + "%")));
        panel.appendChild(body);
        if (ts.length) {
          var list = h("div", { class: "list sprint-list" });
          ts.sort(function (a, b) { return PF.STATUSES.indexOf(a.status) - PF.STATUSES.indexOf(b.status) || PF.cmp(a.ref, b.ref); }).slice(0, 8).forEach(function (t) {
            list.appendChild(PF.ui.taskRow(t));
          });
          if (ts.length > 8) list.appendChild(h("a", { class: "list-item compact more-row", href: "#/board", onclick: function () { boardF.sprint = s.id; PF.act.setCurrentProject(p.id); } },
            icon("board", 14), h("span", { class: "li-main" }, "Ver mais " + PF.plural(ts.length - 8, "tarefa", "tarefas") + " no Kanban"), h("span", { class: "chev" }, icon("chevR", 14))));
          panel.appendChild(list);
        } else panel.appendChild(h("div", { class: "panel-body sprint-empty" }, PF.emptyState("tasks", "Nenhuma tarefa nesta sprint", s.status === "done" ? "A sprint terminou sem tarefas associadas." : "Use “Adicionar do backlog” para planejar o ciclo.", null, { compact: true })));
        sprStack.appendChild(panel);
      });
    }
  };

  function sprintModal(project) {
    if (!PF.guard("sprint.manage", "criar sprints")) return;
    var existing = PF.sprintsOf(project.id);
    var nextN = existing.length + 1;
    var m = existing.map(function (s) { return parseInt((s.name.match(/\d+/) || [0])[0], 10); });
    if (m.length) nextN = Math.max.apply(null, m) + 1;
    var name = h("input", { class: "input", value: "Sprint " + nextN, maxlength: "40" });
    var goal = h("input", { class: "input", maxlength: "90", placeholder: "Qual o objetivo desta sprint?" });
    var start = h("input", { class: "input", type: "date", value: PF.todayLocal() });
    var end = h("input", { class: "input", type: "date", value: PF.todayLocal(14) });
    var form = h("div", { class: "form-grid" },
      PF.field("Nome", name, { span2: true }), PF.field("Meta", goal, { span2: true }),
      PF.field("Início", start), PF.field("Término", end));
    PF.modal({
      title: "Nova sprint em " + project.name, body: form,
      foot: [
        h("button", { class: "btn", onclick: PF.closeOverlays }, "Cancelar"),
        h("button", { class: "btn btn-primary", onclick: function () {
          PF.clearInvalid(form);
          var ok = true;
          if (!name.value.trim()) { PF.setInvalid(name.closest(".field"), "Informe o nome"); ok = false; }
          else if (existing.some(function (s) { return s.name.trim().toLowerCase() === name.value.trim().toLowerCase(); })) { PF.setInvalid(name.closest(".field"), "Já existe uma sprint com esse nome neste projeto"); ok = false; }
          if (!start.value || !end.value || end.value <= start.value) { PF.setInvalid(end.closest(".field"), "Término deve ser depois do início"); ok = false; }
          if (!ok) return;
          PF.act.createSprint(project.id, { name: name.value.trim(), goal: goal.value.trim(), startDate: start.value, endDate: end.value });
          PF.closeOverlays();
        } }, "Criar sprint")
      ]
    });
  }

  /* ============================ CRONOGRAMA ============================ */
  var tlF = { span: 180, teamId: "" };
  PF.routes.timeline = {
    title: "Cronograma", app: "workspace", wide: true,
    render: function (page) {
      page.appendChild(PF.ui.pageHead("Cronograma", "Janelas dos projetos e marcos de entrega."));
      var fbar = h("div", { class: "fbar" });
      fbar.appendChild(PF.filterSelect("Janela", [
        { value: "90", label: "3 meses" }, { value: "180", label: "6 meses" }, { value: "365", label: "12 meses" }
      ], String(tlF.span), function (v) { tlF.span = +v; PF.refresh(); }, null, { def: "180" }));
      fbar.appendChild(PF.filterSelect("Equipe", [{ value: "", label: "Todas" }].concat(PF.scopeTeams().map(function (t) { return { value: t.id, label: t.name }; })),
        tlF.teamId, function (v) { tlF.teamId = v; PF.refresh(); }));
      page.appendChild(fbar);

      var DAY = 86400000;
      var from = Date.now() - Math.round(tlF.span * 0.35) * DAY;
      var to = Date.now() + Math.round(tlF.span * 0.65) * DAY;
      var total = to - from;
      function pos(dateStr) {
        var tms = new Date(dateStr + (dateStr.length === 10 ? "T12:00:00" : "")).getTime();
        return Math.max(0, Math.min(100, 100 * (tms - from) / total));
      }

      var projs = PF.visibleProjects().filter(function (p) {
        if (tlF.teamId && p.teamIds.indexOf(tlF.teamId) < 0) return false;
        return p.startDate && p.targetDate;
      });

      var panel = h("div", { class: "panel" });
      var gantt = h("div", { class: "gantt" });
      var grid = h("div", { class: "g-grid" });

      // cabeçalho de meses
      var months = h("div", { class: "g-months" }, h("div", { class: "g-months-cell" }, "Projeto"));
      var cur = new Date(from);
      cur.setDate(1);
      var track = h("div", { class: "g-track-head" });
      while (cur.getTime() < to) {
        var mStart = Math.max(cur.getTime(), from);
        var next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1).getTime();
        var mEnd = Math.min(next, to);
        var w = 100 * (mEnd - mStart) / total;
        if (w > 5) track.appendChild(h("div", { style: "width:" + w + "%" },
          ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][cur.getMonth()] + (cur.getMonth() === 0 ? " " + cur.getFullYear() : "")));
        cur = new Date(next);
      }
      months.appendChild(track);
      grid.appendChild(months);

      projs.forEach(function (p) {
        var row = h("div", { class: "g-row" });
        row.appendChild(h("div", { class: "g-label", title: p.name }, PF.projectDot(p), h("span", { class: "truncate" }, p.name)));
        var tr = h("div", { class: "g-track" });
        var x1 = pos(p.startDate), x2 = pos(p.targetDate);
        var prog = PF.projectProgress(p.id);
        var late = p.status !== "done" && PF.daysLeft(p.targetDate) < 0;
        var cls = p.status === "done" ? "done" : late ? "late" : "";
        var bar = h("a", {
          class: "g-bar " + cls, href: "#/projects/" + p.id,
          style: "left:" + x1 + "%;width:" + Math.max(3, x2 - x1) + "%",
          "data-tip": p.name + " · " + prog + "%",
          "aria-label": p.name + ", " + prog + "% concluído, de " + PF.fmtDate(p.startDate) + " a " + PF.fmtDate(p.targetDate) + (late ? ", prazo estourado" : p.status === "done" ? ", concluído" : "")
        }, p.key + " · " + prog + "%");
        tr.appendChild(bar);
        PF.db.milestones.filter(function (m) { return m.projectId === p.id; }).forEach(function (m) {
          tr.appendChild(h("div", {
            class: "g-ms" + (m.status === "done" ? " done" : ""),
            style: "left:calc(" + pos(m.date) + "% - 7px)",
            "data-tip": m.name + " · " + PF.fmtDate(m.date),
            role: "img", "aria-label": "Marco: " + m.name + ", " + PF.fmtDate(m.date) + (m.status === "done" ? ", entregue" : "")
          }));
        });
        // linha de hoje
        tr.appendChild(h("div", { class: "g-today", style: "left:" + pos(new Date().toISOString()) + "%" }));
        row.appendChild(tr);
        grid.appendChild(row);
      });
      if (!projs.length) grid.appendChild(PF.emptyState("calendar", "Nenhum projeto no cronograma", "Projetos precisam de início e data de entrega para aparecer aqui.", null, { compact: true }));

      gantt.appendChild(grid);
      panel.appendChild(gantt);
      page.appendChild(panel);
      page.appendChild(h("div", { class: "legend" },
        h("span", {}, h("i", { class: "lg-bar accent" }), "Em andamento"),
        h("span", {}, h("i", { class: "lg-bar ok" }), "Concluído"),
        h("span", {}, h("i", { class: "lg-bar danger" }), "Prazo estourado"),
        h("span", {}, h("i", { class: "lg-ms" }), "Marco"),
        h("span", {}, h("i", { class: "lg-today" }), "Hoje")));
    }
  };
})();
