/* ============================================================
   ProjectFlow AI — núcleo
   Estado global, persistência local, permissões, mutações
   centralizadas (auditoria + eventos + webhooks + notificações),
   roteador e primitivas de UI. Sem dependências externas.
   ============================================================ */
(function () {
  "use strict";

  var PF = window.PF = {};
  var LS_KEY = "projectflow.db.v1";

  /* ---------- persistência ----------
     O estado salvo é validado e migrado ao carregar; se não der para
     aproveitar, volta ao cenário inicial e a pessoa é avisada. */
  var SCHEMA = 2;
  var ARRAYS = ["orgs", "roles", "users", "teams", "projects", "epics", "sprints", "milestones", "tasks", "comments",
    "audit", "events", "webhooks", "deliveries", "notifications", "notifTemplates", "mcpTools", "mcpAgents", "mcpExecutions"];
  var OBJECTS = ["meta", "settings", "notifPrefs", "providers", "taskCounters"];
  function isObj(v) { return v != null && typeof v === "object" && !Array.isArray(v); }
  function shapeOk(db) {
    if (!isObj(db)) return false;
    if (OBJECTS.some(function (k) { return !isObj(db[k]); })) return false;
    if (ARRAYS.some(function (k) { return !Array.isArray(db[k]); })) return false;
    if (!db.users.length || !db.roles.length) return false;
    return db.tasks.every(function (t) { return isObj(t) && typeof t.id === "string" && typeof t.ref === "string" && typeof t.projectId === "string"; })
      && db.users.every(function (u) { return isObj(u) && typeof u.id === "string" && typeof u.name === "string"; })
      && db.projects.every(function (p) { return isObj(p) && typeof p.id === "string" && typeof p.key === "string" && typeof p.name === "string"; });
  }
  // migrações incrementais (schema 1 = estado salvo antes desta versão do protótipo)
  var MIGRATIONS = {
    2: function (db) {
      // data de conclusão real (antes inferida de updatedAt) e favoritos por pessoa
      db.tasks.forEach(function (t) { if (!("doneAt" in t)) t.doneAt = t.status === "done" ? t.updatedAt || null : null; });
      var favIds = db.projects.filter(function (p) { return p.favorite; }).map(function (p) { return p.id; });
      db.users.forEach(function (u) { if (!Array.isArray(u.favoriteProjectIds)) u.favoriteProjectIds = favIds.slice(); });
    }
  };
  // conserta valores fora do domínio que quebrariam a renderização
  function sanitize(db) {
    var ST = ["backlog", "todo", "in_progress", "in_review", "done"], PR = ["urgent", "high", "medium", "low"];
    db.tasks.forEach(function (t) {
      if (ST.indexOf(t.status) < 0) t.status = "todo";
      if (PR.indexOf(t.priority) < 0) t.priority = "medium";
      if (["task", "bug", "subtask"].indexOf(t.type) < 0) t.type = t.parentId ? "subtask" : "task";
      if (typeof t.title !== "string" || !t.title.trim()) t.title = String(t.title || "") || "(sem título)";
      ["labels", "acceptance", "blockedBy"].forEach(function (k) { if (!Array.isArray(t[k])) t[k] = []; });
      if (t.dueDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)) t.dueDate = null;
    });
    db.users.forEach(function (u) { if (!Array.isArray(u.teamIds)) u.teamIds = []; });
    db.teams.forEach(function (t) { if (!Array.isArray(t.memberIds)) t.memberIds = []; });
    db.projects.forEach(function (p) { if (!Array.isArray(p.teamIds)) p.teamIds = []; });
    if (!db.users.some(function (u) { return u.id === db.settings.currentUserId; })) {
      db.settings.currentUserId = (db.users.find(function (u) { return u.roleId === "admin"; }) || db.users[0]).id;
    }
  }
  PF.load = function () {
    var notice = null;
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var db = JSON.parse(raw);
        if (!db || !db.meta || db.meta.seedVersion !== PFSeed.VERSION) {
          notice = "Os dados salvos eram de outra versão da demonstração e foram substituídos pelo cenário inicial.";
        } else if (!shapeOk(db)) {
          notice = "Os dados salvos estavam incompletos e foram substituídos pelo cenário inicial.";
        } else {
          for (var v = (db.meta.schema || 1) + 1; v <= SCHEMA; v++) if (MIGRATIONS[v]) MIGRATIONS[v](db);
          db.meta.schema = SCHEMA;
          sanitize(db);
          PF.db = db;
          return;
        }
      }
    } catch (e) {
      notice = "Os dados salvos não puderam ser lidos e foram substituídos pelo cenário inicial.";
    }
    PF.db = PFSeed.build();
    PF.db.meta.schema = SCHEMA;
    PF.save();
    PF._loadNotice = notice;
  };
  var saveT = null, saveWarned = false;
  function writeNow() {
    saveT = null;
    try { localStorage.setItem(LS_KEY, JSON.stringify(PF.db)); saveWarned = false; }
    catch (e) {
      // quota/modo privado: avisa uma vez em vez de perder alterações em silêncio
      if (!saveWarned && PF.toast) { saveWarned = true; PF.toast("Não foi possível salvar", "O navegador recusou a gravação local; as alterações valem só até recarregar a página.", "warn"); }
    }
  }
  PF.save = function () {
    clearTimeout(saveT);
    saveT = setTimeout(writeNow, 120);
  };
  // grava imediatamente o que estiver pendente (saída ou ocultação da página)
  PF.flushSave = function () {
    if (saveT) { clearTimeout(saveT); writeNow(); }
  };
  PF.resetDemo = function () {
    clearTimeout(saveT);
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    PF.db = PFSeed.build();
    PF.db.meta.schema = SCHEMA;
    PF.save();
    PF.toast("Dados de demonstração restaurados", "Todo o estado voltou ao cenário inicial.", "ok");
    PF.refresh();
  };

  /* ---------- helpers ---------- */
  PF.uid = function (p) { return (p || "id") + Math.random().toString(36).slice(2, 9); };
  PF.byId = function (coll, id) { return PF.db[coll].find(function (x) { return x.id === id; }) || null; };
  PF.user = function (id) { return PF.byId("users", id); };
  PF.me = function () { return PF.user(PF.db.settings.currentUserId); };
  PF.project = function (id) { return PF.byId("projects", id); };
  PF.team = function (id) { return PF.byId("teams", id); };
  PF.task = function (id) { return PF.byId("tasks", id); };

  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  PF.fmtDate = function (iso) {
    if (!iso || typeof iso !== "string") return "—";
    if (iso.length === 10 && !PF.isDateOnly(iso)) return "—";
    var d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    if (isNaN(d.getTime())) return "—";
    return d.getDate() + " " + MESES[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "");
  };
  PF.fmtDateTime = function (iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return PF.fmtDate(iso) + ", " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  PF.rel = function (iso) {
    var ms = Date.now() - new Date(iso).getTime();
    var m = Math.round(ms / 60000);
    if (m < 1) return "agora";
    if (m < 60) return "há " + m + " min";
    var h = Math.round(m / 60);
    if (h < 24) return "há " + h + " h";
    var d = Math.round(h / 24);
    if (d < 30) return "há " + d + " d";
    return PF.fmtDate(iso);
  };
  /* datas "AAAA-MM-DD" são dias do calendário local (não UTC) */
  function pad2(n) { return String(n).padStart(2, "0"); }
  PF.ymd = function (d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
  PF.todayLocal = function (offsetDays) {
    var d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return PF.ymd(d);
  };
  PF.isDateOnly = function (s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split("-").map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  };
  // dias até o prazo: 0 = hoje, -1 = venceu ontem
  PF.daysLeft = function (dateOnly) {
    if (!PF.isDateOnly(dateOnly)) return null;
    var p = dateOnly.split("-").map(Number);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(p[0], p[1] - 1, p[2]) - today) / 86400000);
  };
  // comparador estável (empate = 0)
  PF.cmp = function (a, b) { return a < b ? -1 : a > b ? 1 : 0; };
  PF.isOverdue = function (t) {
    return t.dueDate && t.status !== "done" && PF.daysLeft(t.dueDate) < 0;
  };

  /* ---------- construtor de DOM (conteúdo de usuário sempre como texto) ---------- */
  PF.h = function (tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
      else if (k === "style") el.style.cssText = v;
      else if (k.slice(0, 2) === "on") { if (typeof v === "function") el.addEventListener(k.slice(2), v); } // nunca vira handler inline
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    if (kid instanceof Node) { el.appendChild(kid); return; }
    el.appendChild(document.createTextNode(String(kid)));
  }
  var h = PF.h;

  /* ---------- ícones (traço único 1.6, 24x24) ---------- */
  var IC = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
    folders: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    tasks: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 5-5"/>',
    board: '<rect x="4" y="4" width="4.5" height="16" rx="1.5"/><rect x="10" y="4" width="4.5" height="11" rx="1.5"/><rect x="16" y="4" width="4.5" height="7" rx="1.5"/>',
    backlog: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    sprint: '<path d="M5 12a7 7 0 1 1 2 4.9"/><path d="M5 17v-5h5"/><path d="m12 9 0 3.5 2.5 1.5"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    users: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M15.8 14.6c2.4.2 4.1 1.6 4.7 4.1"/>',
    shield: '<path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6z"/><path d="m9.3 11.8 2 2 3.6-3.8"/>',
    sparkle: '<path d="M12 4l1.8 4.6L18.5 10l-4.7 1.4L12 16l-1.8-4.6L5.5 10l4.7-1.4z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    plug: '<path d="M9 7V3.5M15 7V3.5"/><path d="M7 7h10v4a5 5 0 0 1-10 0z"/><path d="M12 16v4.5"/>',
    bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2.5H4.5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    webhook: '<circle cx="6.5" cy="17" r="2.5"/><circle cx="17.5" cy="17" r="2.5"/><circle cx="12" cy="7" r="2.5"/><path d="M10.8 9.2 7.5 14.6M13.2 9.2l3.3 5.4M9 17h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"/>',
    chart: '<path d="M4 4v16h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
    pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
    scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7"/><path d="M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2"/><path d="M10 9h6M10 13h6"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    chevL: '<path d="m15 6-6 6 6 6"/>',
    chevU: '<path d="m6 15 6-6 6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    filter: '<path d="M4 6h16l-6 7v5l-4 2v-7z"/>',
    flag: '<path d="M6 21V4"/><path d="M6 5h11l-2.5 3.5L17 12H6"/>',
    tag: '<path d="m4 12 8-8h8v8l-8 8z"/><circle cx="15.5" cy="8.5" r="1.3"/>',
    comment: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z"/>',
    link: '<path d="M10 14a4 4 0 0 0 6 .4l2.5-2.5a4 4 0 1 0-5.7-5.7L11.5 7.5"/><path d="M14 10a4 4 0 0 0-6-.4L5.5 12a4 4 0 1 0 5.7 5.7l1.3-1.3"/>',
    play: '<path d="M7 5v14l12-7z"/>',
    refresh: '<path d="M4 12a8 8 0 0 1 14-5.3L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
    moon: '<path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5z"/>',
    check: '<path d="m5 13 4.5 4.5L19 8"/>',
    alert: '<path d="M12 4 2.8 20h18.4z"/><path d="M12 10v4M12 17.2v.3"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.3"/>',
    dots: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
    inbox: '<path d="M4 13.5 6.5 5h11L20 13.5V19H4z"/><path d="M4 13.5h5l1.5 2.5h3l1.5-2.5h5"/>',
    bug: '<circle cx="12" cy="13" r="5"/><path d="M12 8V6M8.5 9 6 6.5M15.5 9 18 6.5M7 13H4M20 13h-3M8.5 17 6 19.5M15.5 17l2.5 2.5"/>',
    epic: '<path d="M12 4l6 8-6 8-6-8z"/>',
    subtask: '<path d="M6 5v10a3 3 0 0 0 3 3h9"/><path d="m14.5 14.5 3.5 3.5-3.5 3.5"/><circle cx="6" cy="5" r="1.6"/>',
    send: '<path d="M4 11.5 20 4l-4.5 16-4-6.5z"/><path d="M11.5 13.5 20 4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a0 0 0 0 1 0 0V5a1 1 0 0 1 1-1h10v1"/><path d="M15 5V4H5a1 1 0 0 0-1 1v10h1"/>',
    eye: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/>',
    eyeOff: '<path d="M4 4l16 16"/><path d="M10 5.3A9.8 9.8 0 0 1 12 5c5.5 0 9 7 9 7a16.7 16.7 0 0 1-2.7 3.4M6.6 6.6C4.3 8.2 3 12 3 12s3.5 7 9 7a8.8 8.8 0 0 0 4-1"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/><path d="M10.5 11v5M13.5 11v5"/>',
    edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 7.5 3 3"/>',
    external: '<path d="M14 5h5v5"/><path d="M19 5 10.5 13.5"/><path d="M19 13v6H5V5h6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    star: '<path d="m12 4 2.4 5 5.6.7-4.1 3.8 1.1 5.5-5-2.8-5 2.8 1.1-5.5L4 9.7 9.6 9z"/>',
    archive: '<rect x="4" y="4" width="16" height="5" rx="1"/><path d="M6 9v10h12V9"/><path d="M10 13h4"/>',
    block: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
    target: '<path d="M12 4l6 8-6 8-6-8z"/><path d="M12 8.5 14.5 12 12 15.5 9.5 12z"/>',
    timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.8M9.5 3.5h5"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/>',
    sms: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
    wapp: '<path d="M12 4a8 8 0 0 0-6.9 12L4 20l4.2-1A8 8 0 1 0 12 4z"/><path d="M9.3 9.5c0 3 2.2 5.2 5.2 5.2l.9-1.5-1.9-1-.8.7a3.8 3.8 0 0 1-1.6-1.6l.7-.8-1-1.9z"/>',
    arrowR: '<path d="M4 12h15M14 6.5 19.5 12 14 17.5"/>',
    grip: '<circle cx="9" cy="6" r="1.1"/><circle cx="15" cy="6" r="1.1"/><circle cx="9" cy="12" r="1.1"/><circle cx="15" cy="12" r="1.1"/><circle cx="9" cy="18" r="1.1"/><circle cx="15" cy="18" r="1.1"/>',
    key: '<circle cx="8" cy="14" r="4"/><path d="m11 11 8-8M16 6l2.5 2.5M13.5 8.5 16 11"/>',
    building: '<rect x="5" y="4" width="14" height="16" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/>',
    briefcase: '<rect x="4" y="8" width="16" height="11" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M4 13h16"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/>'
  };
  PF.icon = function (name, size) {
    size = size || 16;
    var span = document.createElement("span");
    span.style.cssText = "display:inline-flex;flex:none";
    span.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || IC.info) + "</svg>";
    return span;
  };
  var icon = PF.icon;

  /* ---------- metadados de domínio ---------- */
  PF.STATUSES = ["backlog", "todo", "in_progress", "in_review", "done"];
  PF.STATUS_META = {
    backlog: { label: "Backlog", color: "var(--ink-3)" },
    todo: { label: "A fazer", color: "var(--ink-2)" },
    in_progress: { label: "Em andamento", color: "var(--accent)" },
    in_review: { label: "Em revisão", color: "var(--violet)" },
    done: { label: "Concluído", color: "var(--ok)" }
  };
  PF.statusIcon = function (st, size) {
    size = size || 14;
    if (!PF.STATUS_META[st]) st = "todo";
    var c = PF.STATUS_META[st].color;
    var inner = "";
    if (st === "backlog") inner = '<circle cx="12" cy="12" r="7" stroke-dasharray="3.2 3.2"/>';
    else if (st === "todo") inner = '<circle cx="12" cy="12" r="7"/>';
    else if (st === "in_progress") inner = '<circle cx="12" cy="12" r="7"/><path d="M12 12V5.4A6.6 6.6 0 0 1 12 18.6z" fill="' + "currentColor" + '" stroke="none"/>';
    else if (st === "in_review") inner = '<circle cx="12" cy="12" r="7"/><path d="M12 12V5.4A6.6 6.6 0 1 1 5.4 12z" fill="currentColor" stroke="none"/>';
    else inner = '<circle cx="12" cy="12" r="8" fill="currentColor" stroke="none"/><path d="m8.6 12.2 2.3 2.3 4.5-4.7" stroke="var(--surface)" stroke-width="2"/>';
    var span = document.createElement("span");
    span.style.cssText = "display:inline-flex;flex:none;color:" + c;
    span.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' + inner + "</svg>";
    return span;
  };
  PF.statusChip = function (st) {
    var m = PF.STATUS_META[st] || PF.STATUS_META.todo;
    return h("span", { class: "status-chip" }, PF.statusIcon(st), m.label);
  };

  PF.PRIORITIES = ["urgent", "high", "medium", "low"];
  PF.PRIO_META = {
    urgent: { label: "Urgente", color: "var(--danger)", glyph: '<path d="m6 11 6-5 6 5M6 17l6-5 6 5"/>' },
    high: { label: "Alta", color: "var(--warn)", glyph: '<path d="m6 14.5 6-5 6 5"/>' },
    medium: { label: "Média", color: "var(--info)", glyph: '<path d="M6 9.5h12M6 14.5h12"/>' },
    low: { label: "Baixa", color: "var(--ink-3)", glyph: '<path d="m6 9.5 6 5 6-5"/>' }
  };
  PF.prioChip = function (p, bare) {
    var m = PF.PRIO_META[p] || PF.PRIO_META.medium;
    var span = document.createElement("span");
    span.className = "prio";
    span.style.color = m.color;
    span.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + m.glyph + "</svg>";
    if (!bare) span.appendChild(document.createTextNode(m.label));
    else { span.setAttribute("data-tip", m.label); span.setAttribute("role", "img"); span.setAttribute("aria-label", "Prioridade " + m.label); }
    return span;
  };

  PF.TYPE_META = {
    task: { label: "Tarefa", icon: "tasks", color: "var(--accent)" },
    bug: { label: "Bug", icon: "bug", color: "var(--danger)" },
    subtask: { label: "Subtarefa", icon: "subtask", color: "var(--ink-2)" },
    epic: { label: "Épico", icon: "epic", color: "var(--violet)" }
  };
  PF.typeIcon = function (type, size) {
    var m = PF.TYPE_META[type] || PF.TYPE_META.task;
    var s = icon(m.icon, size || 14);
    s.style.color = m.color;
    s.setAttribute("data-tip", m.label);
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", m.label);
    return s;
  };

  PF.avatarEl = function (user, size) {
    if (!user) {
      var ghost = h("span", { class: "avatar " + (size || ""), "data-tip": "Sem responsável", role: "img", "aria-label": "Sem responsável" });
      ghost.style.background = "var(--surface-2)";
      ghost.style.border = "1px dashed var(--border-2)";
      return ghost;
    }
    var a = h("span", { class: "avatar " + (size || ""), "data-tip": user.name, role: "img", "aria-label": user.name }, user.initials);
    a.style.setProperty("--av", user.color);
    return a;
  };
  PF.whoCell = function (userId) {
    var u = PF.user(userId);
    if (!u) return h("span", { class: "muted" }, "—");
    var av = PF.avatarEl(u, "sm");
    av.setAttribute("aria-hidden", "true"); // o nome já está ao lado
    return h("span", { class: "who-cell" }, av, h("span", { class: "nm" }, u.name));
  };
  PF.LABELS = ["backend", "frontend", "mobile", "infra", "dados", "ux", "seguranca", "performance", "documentacao", "cliente"];
  // a chave fica no dado; a interface mostra o nome com acento e caixa corretos
  PF.LABEL_META = {
    backend: "Backend", frontend: "Frontend", mobile: "Mobile", infra: "Infraestrutura", dados: "Dados", ux: "UX",
    seguranca: "Segurança", performance: "Performance", documentacao: "Documentação", cliente: "Cliente"
  };
  PF.labelName = function (key) { return PF.LABEL_META[key] || key; };
  // origem dos registros de auditoria, com um único texto em toda a interface
  PF.SOURCE_META = { ui: "Interface", ai: "IA", mcp: "Agente MCP", automation: "Automação", api: "API" };
  PF.sourceLabel = function (src) { return PF.SOURCE_META[src] || src; };
  PF.plural = function (n, one, many) { return n + " " + (n === 1 ? one : many); };
  PF.labelChip = function (name) {
    var colors = { backend: "#2B5FD9", frontend: "#B23A78", mobile: "#6D4FC4", infra: "#0E7490", dados: "#9A5B00", ux: "#3D7068", seguranca: "#BE3030", performance: "#7A5C2E", documentacao: "#4A6572", cliente: "#1D7A4C" };
    var c = h("span", { class: "label-chip" }, PF.labelName(name));
    c.style.setProperty("--lc", colors[name] || "var(--ink-3)");
    return c;
  };

  /* ---------- permissões ---------- */
  var ALL_CAPS = ["project.view", "project.create", "project.edit", "project.archive", "project.delete", "project.members",
    "task.view", "task.create", "task.edit", "task.move", "task.assign", "task.delete",
    "sprint.view", "sprint.manage", "team.view", "team.manage", "user.manage",
    "webhook.view", "webhook.manage", "notif.view", "notif.manage",
    "mcp.view", "mcp.read", "mcp.write", "audit.view", "insights.view", "ai.use", "ai.apply"];
  var ROLE_CAPS = {
    admin: ALL_CAPS.slice(),
    pm: ["project.view", "project.create", "project.edit", "project.archive", "project.members",
      "task.view", "task.create", "task.edit", "task.move", "task.assign", "task.delete",
      "sprint.view", "sprint.manage", "team.view",
      "webhook.view", "notif.view", "mcp.view", "mcp.read", "mcp.write",
      "audit.view", "insights.view", "ai.use", "ai.apply"],
    lead: ["project.view", "task.view", "task.create", "task.edit", "task.move", "task.assign",
      "sprint.view", "team.view", "team.manage",
      "notif.view", "mcp.view", "mcp.read", "insights.view", "ai.use", "ai.apply"],
    dev: ["project.view", "task.view", "task.create", "task.edit", "task.move",
      "sprint.view", "team.view", "notif.view", "mcp.view", "mcp.read", "ai.use"],
    viewer: ["project.view", "task.view", "sprint.view", "team.view",
      "webhook.view", "notif.view", "mcp.view", "audit.view", "insights.view"]
  };
  PF.can = function (cap) {
    var me = PF.me();
    if (!me) return false;
    return (ROLE_CAPS[me.roleId] || []).indexOf(cap) >= 0;
  };
  PF.roleName = function (roleId) { var r = PF.byId("roles", roleId); return r ? r.name : roleId; };

  // escopo: admin vê todas as organizações; gestor e auditor, a própria organização;
  // líder e dev, só os projetos das próprias equipes. Arquivados só sob pedido.
  PF.visibleProjects = function (opts) {
    var me = PF.me();
    var withArchived = !!(opts && opts.includeArchived);
    var list = PF.db.projects.filter(function (p) { return withArchived || !p.archived; });
    if (me.roleId === "admin") return list;
    if (me.roleId === "pm" || me.roleId === "viewer") return list.filter(function (p) { return p.orgId === me.orgId; });
    return list.filter(function (p) {
      if (p.orgId !== me.orgId) return false;
      if (p.leadId === me.id) return true;
      return p.teamIds.some(function (t) { return me.teamIds.indexOf(t) >= 0; });
    });
  };
  PF.canSeeProject = function (projectId) {
    return PF.visibleProjects().some(function (p) { return p.id === projectId; });
  };
  // organização no escopo do perfil atual (admin enxerga todas)
  PF.inMyOrg = function (orgId) {
    var me = PF.me();
    return me.roleId === "admin" || orgId === me.orgId;
  };
  PF.scopeTeams = function () { return PF.db.teams.filter(function (t) { return PF.inMyOrg(t.orgId); }); };
  PF.scopeUsers = function () { return PF.db.users.filter(function (u) { return PF.inMyOrg(u.orgId); }); };
  // pessoas que podem ser responsáveis por tarefas do projeto (membros ativos das equipes do projeto)
  PF.projectMembers = function (projectId) {
    var p = PF.project(projectId);
    if (!p) return [];
    var ids = {};
    p.teamIds.forEach(function (tid) { var tm = PF.team(tid); if (tm) tm.memberIds.forEach(function (m) { ids[m] = 1; }); });
    return PF.db.users.filter(function (u) { return ids[u.id] && !u.invited && u.orgId === p.orgId; });
  };
  // registro de auditoria visível: admin vê tudo; os demais, só a própria organização
  PF.canSeeAudit = function (a) {
    var me = PF.me();
    if (me.roleId === "admin") return true;
    var p = a.projectId ? PF.project(a.projectId) : null;
    if (p) return p.orgId === me.orgId;
    var actor = PF.user(a.userId);
    return !!actor && actor.orgId === me.orgId;
  };
  // notificações: quem administra usuários ou audita vê as da organização; os demais, só as próprias
  PF.visibleNotifications = function () {
    var me = PF.me();
    var all = PF.can("user.manage") || PF.can("audit.view");
    return PF.db.notifications.filter(function (n) {
      if (n.toUserId === me.id) return true;
      if (!all) return false;
      var u = PF.user(n.toUserId);
      return !!u && PF.inMyOrg(u.orgId);
    });
  };
  PF.canTouchTask = function (t) {
    var me = PF.me();
    if (!PF.can("task.edit")) return false;
    // escopo antes do papel: gestor e admin também não alteram tarefas fora do que enxergam
    if (!PF.canSeeProject(t.projectId)) return false;
    if (me.roleId === "admin" || me.roleId === "pm") return true;
    if (me.roleId === "lead") return me.teamIds.indexOf(t.teamId) >= 0 || t.assigneeId === me.id;
    return t.assigneeId === me.id || t.createdBy === me.id || !t.assigneeId;
  };
  // source: origem da tentativa (ui, mcp, ai…) — o filtro de origem da auditoria depende dela
  PF.deny = function (what, source) {
    var me = PF.me();
    PF.db.audit.unshift({
      id: PF.uid("au"), ts: new Date().toISOString(), userId: me.id,
      action: "denied", entityType: "permission", entityId: null, projectId: null,
      before: null, after: null, summary: "tentativa sem permissão: " + what, source: source || "ui"
    });
    PF.save();
    PF.toast("Sem permissão", "O perfil “" + PF.roleName(me.roleId) + "” não pode " + what + ".", "err");
  };
  PF.guard = function (cap, what, source) {
    if (PF.can(cap)) return true;
    PF.deny(what, source);
    return false;
  };
  PF.roleCaps = function (roleId) { return (ROLE_CAPS[roleId] || []).slice(); };

  /* ---------- auditoria, eventos, webhooks, notificações ---------- */
  // o último registro recebe o id do evento emitido em seguida (correlação exata no drawer da auditoria)
  var lastAudit = {};
  function audit(action, entityType, entityId, projectId, before, after, summary, source) {
    lastAudit = {
      id: PF.uid("au"), ts: new Date().toISOString(), userId: PF.me().id,
      action: action, entityType: entityType, entityId: entityId, projectId: projectId,
      before: before || null, after: after || null, summary: summary, source: source || "ui"
    };
    PF.db.audit.unshift(lastAudit);
    return lastAudit;
  }
  PF.auditPush = audit;

  function deliverWebhook(wh, ev) {
    var fail = wh.health === "failing";
    var attempts = [];
    var now = Date.now();
    if (fail) {
      for (var i = 0; i < 3; i++) attempts.push({ ts: new Date(now + i * 1500).toISOString(), httpStatus: 503, ok: false, durationMs: 900 + Math.floor(Math.random() * 1800) });
    } else {
      attempts.push({ ts: new Date(now).toISOString(), httpStatus: 200, ok: true, durationMs: 60 + Math.floor(Math.random() * 350) });
    }
    PF.db.deliveries.unshift({
      id: PF.uid("dl"), webhookId: wh.id, eventId: ev.id, eventType: ev.type,
      ts: new Date().toISOString(), status: fail ? "failed" : "success",
      httpStatus: fail ? 503 : 200, attempts: attempts,
      payload: { id: ev.id, type: ev.type, occurredAt: ev.ts, data: ev.payload }
    });
    if (fail) PF.toast("Envio de webhook falhou", wh.name + " respondeu 503 — 3 tentativas registradas.", "warn");
  }

  var NOTIF_MAP = {
    "task.assigned.v1": { tpl: "nt-assigned", to: function (ev) { return ev.payload.assignee; } },
    "comment.mention.v1": { tpl: "nt-mention", to: function (ev) { return ev.payload.mentioned; } },
    "sprint.started.v1": { tpl: "nt-sprint-start", to: function (ev) { var p = PF.project(ev.projectId); return p && p.leadId; } },
    "sprint.completed.v1": { tpl: "nt-sprint-end", to: function (ev) { var p = PF.project(ev.projectId); return p && p.leadId; } },
    "task.blocked.v1": { tpl: "nt-blocked", to: function (ev) { return ev.payload.assignee; } }
  };

  function notify(ev) {
    var map = NOTIF_MAP[ev.type];
    if (!map) return;
    var toId = map.to(ev);
    if (!toId) return;
    var tpl = PF.byId("notifTemplates", map.tpl);
    var prefs = PF.db.notifPrefs[tpl.event] || {};
    var toUser = PF.user(toId);
    if (!toUser) return;
    ["email", "whatsapp", "sms"].forEach(function (ch) {
      if (!prefs[ch]) return;
      var provider = PF.db.providers[ch];
      var vars = ev.payload.vars || {};
      var subj = tpl.subject, body = tpl.body;
      Object.keys(vars).forEach(function (k) { subj = subj.split("{" + k + "}").join(vars[k]); body = body.split("{" + k + "}").join(vars[k]); });
      PF.db.notifications.unshift({
        id: PF.uid("nf"), ts: new Date().toISOString(), channel: ch, templateId: tpl.id,
        eventType: tpl.event, toUserId: toId, subject: subj, body: body,
        status: provider.configured ? "delivered" : "failed",
        attempts: 1,
        failReason: provider.configured ? null : "Provedor de " + ch.toUpperCase() + " não configurado"
      });
    });
  }

  PF.emitEvent = function (type, projectId, entityId, payload) {
    var ev = {
      id: PF.uid("ev"), ts: new Date().toISOString(), type: type,
      projectId: projectId, entityId: entityId, actorId: PF.me().id, payload: payload || {}
    };
    PF.db.events.unshift(ev);
    if (!lastAudit.eventId && lastAudit.entityId && lastAudit.entityId === entityId) lastAudit.eventId = ev.id;
    PF.db.webhooks.forEach(function (wh) {
      if (wh.active && wh.events.indexOf(type) >= 0) deliverWebhook(wh, ev);
    });
    notify(ev);
    return ev;
  };

  /* ---------- ações (mutações centralizadas) ---------- */
  var act = PF.act = {};

  // módulos registram aqui o que precisa ser limpo ao trocar de perfil (chat da IA, console MCP, filtros)
  PF.profileHooks = [];
  act.setProfile = function (userId) {
    var u = PF.user(userId);
    if (!u) return;
    PF.db.settings.currentUserId = userId;
    PF.profileHooks.forEach(function (fn) { fn(u); });
    PF.save();
    PF.toast("Perfil alterado", "Agora você está navegando como " + u.name + " (" + PF.roleName(u.roleId) + ").", "info");
    // se a rota atual não é permitida para o novo perfil, volta ao início
    var route = PF.currentRoute();
    if (route && route.cap && !PF.can(route.cap)) PF.navigate(PF.db.settings.activeApp === "insights" ? "/insights" : "/dashboard");
    else PF.refresh();
  };

  // ação de interface: apagar todo o estado exige o perfil administrador
  act.resetDemo = function () {
    if (!PF.guard("user.manage", "restaurar os dados da demonstração")) return;
    PF.resetDemo();
  };

  act.setTheme = function (mode) {
    PF.db.settings.theme = mode;
    PF.save();
    PF.applyTheme();
  };

  act.setApp = function (app) {
    PF.db.settings.activeApp = app;
    PF.save();
    PF.navigate(app === "insights" ? "/insights" : "/dashboard");
  };

  act.setCurrentProject = function (id) {
    PF.db.settings.currentProjectId = id;
    PF.save();
    PF.refresh();
  };

  /* ---------- validação de entrada (UI, IA e MCP passam pelas mesmas regras) ---------- */
  PF.TASK_TYPES = ["task", "bug", "subtask"];
  PF.PROJECT_STATUSES = ["active", "paused", "done"];
  // campos tratados como conjunto: a ordem não é mudança
  var SET_FIELDS = { teamIds: 1, labels: 1, blockedBy: 1, events: 1 };
  function sameValue(k, a, b) {
    if (SET_FIELDS[k] && Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
    }
    return JSON.stringify(a) === JSON.stringify(b);
  }
  PF.sameValue = sameValue;
  function strOk(v, max, required) {
    if (v == null || v === "") return !required;
    return typeof v === "string" && (!required || v.trim().length > 0) && v.length <= max;
  }
  // devolve a mensagem do primeiro problema encontrado ou null; t = tarefa atual (edição) ou null (criação)
  PF.validateTask = function (f, projectId, t) {
    var p = PF.project(projectId);
    if (!p) return "Projeto não encontrado.";
    function changed(k) { return k in f && (!t || !sameValue(k, t[k], f[k])); }
    if ((!t || "title" in f) && !strOk(f.title, 120, true)) return "O título é obrigatório (texto de até 120 caracteres).";
    if (changed("desc") && !strOk(f.desc, 5000)) return "A descrição deve ser texto de até 5000 caracteres.";
    if (changed("status") && PF.STATUSES.indexOf(f.status) < 0) return "Status inválido. Use: " + PF.STATUSES.join(", ") + ".";
    if (changed("priority") && PF.PRIORITIES.indexOf(f.priority) < 0) return "Prioridade inválida. Use: " + PF.PRIORITIES.join(", ") + ".";
    if (changed("type") && PF.TASK_TYPES.indexOf(f.type) < 0) return "Tipo inválido. Use: task ou bug.";
    if (changed("dueDate") && f.dueDate != null && f.dueDate !== "" && !PF.isDateOnly(f.dueDate)) return "Prazo inválido: use o formato AAAA-MM-DD.";
    if (changed("teamId") && f.teamId && p.teamIds.indexOf(f.teamId) < 0) return "A equipe precisa estar associada ao projeto.";
    if (changed("epicId") && f.epicId) {
      var ep = PF.byId("epics", f.epicId);
      if (!ep || ep.projectId !== p.id) return "O épico precisa ser do mesmo projeto.";
    }
    if (changed("sprintId") && f.sprintId) {
      var sp = PF.byId("sprints", f.sprintId);
      if (!sp || sp.projectId !== p.id) return "A sprint precisa ser do mesmo projeto.";
      if (sp.status === "done") return "A " + sp.name + " já foi encerrada; escolha uma sprint ativa ou planejada.";
    }
    if (changed("assigneeId") && f.assigneeId && !PF.projectMembers(p.id).some(function (u) { return u.id === f.assigneeId; })) {
      return "O responsável precisa ser membro ativo das equipes do projeto.";
    }
    if (changed("labels") && (!Array.isArray(f.labels) || f.labels.some(function (l) { return PF.LABELS.indexOf(l) < 0; }))) return "Etiqueta desconhecida.";
    if (changed("acceptance") && (!Array.isArray(f.acceptance) || f.acceptance.some(function (a) { return !a || !strOk(a.text, 300, true); }))) return "Critérios de aceite inválidos.";
    if (changed("blockedBy")) {
      if (!Array.isArray(f.blockedBy)) return "Dependências inválidas.";
      for (var i = 0; i < f.blockedBy.length; i++) {
        var bid = f.blockedBy[i], b = PF.task(bid);
        if (t && t.blockedBy.indexOf(bid) >= 0) continue; // já existentes não são revalidadas
        if (!b || b.projectId !== p.id) return "A tarefa bloqueadora precisa ser do mesmo projeto.";
        if (t && (bid === t.id || PF.wouldCycle(t.id, bid))) return b.ref + " já depende de " + t.ref + " — a dependência seria circular.";
      }
    }
    return null;
  };
  PF.validateProject = function (f, existing) {
    if ((!existing || "name" in f) && !strOk(f.name, 80, true)) return "O nome do projeto é obrigatório (até 80 caracteres).";
    if (!existing && !/^[A-Z]{2,4}$/.test(String(f.key || "").toUpperCase())) return "A chave deve ter de 2 a 4 letras (ex.: PCL).";
    if ("desc" in f && !strOk(f.desc, 2000)) return "A descrição deve ser texto de até 2000 caracteres.";
    if ("priority" in f && f.priority != null && PF.PRIORITIES.indexOf(f.priority) < 0) return "Prioridade inválida.";
    if ("status" in f && f.status != null && PF.PROJECT_STATUSES.indexOf(f.status) < 0) return "Status de projeto inválido.";
    var start = "startDate" in f ? f.startDate : existing && existing.startDate;
    var target = "targetDate" in f ? f.targetDate : existing && existing.targetDate;
    if (start && !PF.isDateOnly(start)) return "Data de início inválida.";
    if (target && !PF.isDateOnly(target)) return "Data de entrega inválida.";
    if (start && target && target < start) return "A data de entrega não pode ser anterior ao início.";
    return null;
  };
  function invalid(msg) { PF.toast("Dados inválidos", msg, "err"); }

  /* ---------- dependências entre tarefas ---------- */
  // bloqueio só conta enquanto a tarefa bloqueadora existe e não foi concluída
  PF.activeBlockers = function (t) {
    return (t.blockedBy || []).map(PF.task).filter(function (b) { return b && b.status !== "done"; });
  };
  PF.isBlocked = function (t) { return t.status !== "done" && PF.activeBlockers(t).length > 0; };
  // blockerId já depende (direta ou indiretamente) de taskId?
  PF.wouldCycle = function (taskId, blockerId) {
    var seen = {}, stack = [blockerId];
    while (stack.length) {
      var id = stack.pop();
      if (id === taskId) return true;
      if (seen[id]) continue;
      seen[id] = 1;
      var x = PF.task(id);
      if (x) stack.push.apply(stack, x.blockedBy || []);
    }
    return false;
  };

  act.createProject = function (f) {
    if (!PF.guard("project.create", "criar projetos", f.source)) return null;
    var err = PF.validateProject(f, null);
    if (err) { invalid(err); return null; }
    var key = String(f.key).toUpperCase();
    if (PF.db.projects.some(function (x) { return x.key === key; })) { invalid("A chave " + key + " já é usada por outro projeto."); return null; }
    var p = {
      id: PF.uid("prj"), orgId: PF.me().orgId, key: key, name: f.name.trim(), desc: f.desc || "",
      teamIds: f.teamIds || [], leadId: f.leadId || PF.me().id, priority: f.priority || "medium",
      status: "active", startDate: f.startDate || PF.todayLocal(),
      targetDate: f.targetDate || null, archived: false,
      createdAt: new Date().toISOString(), color: "#2B5FD9"
    };
    PF.db.projects.push(p);
    PF.db.taskCounters[p.id] = 0;
    audit("create", "project", p.id, p.id, null, { name: p.name, key: p.key }, "criou o projeto " + p.name, f.source || "ui");
    PF.emitEvent("project.created.v1", p.id, p.id, { project: p.name, key: p.key });
    PF.save(); PF.refresh();
    PF.toast("Projeto criado", p.name + " (" + p.key + ") está ativo.", "ok");
    return p;
  };

  act.updateProject = function (id, fields, source) {
    if (!PF.guard("project.edit", "editar projetos", source)) return;
    var p = PF.project(id);
    if (!p || !PF.canSeeProject(id)) { PF.deny("editar este projeto", source); return; }
    var err = PF.validateProject(fields, p);
    if (err) { invalid(err); return; }
    var before = {}, after = {};
    Object.keys(fields).forEach(function (k) {
      if (!sameValue(k, p[k], fields[k])) { before[k] = p[k]; after[k] = fields[k]; p[k] = fields[k]; }
    });
    if (!Object.keys(after).length) return;
    audit("update", "project", p.id, p.id, before, after, "atualizou o projeto " + p.name, source || "ui");
    PF.emitEvent("project.updated.v1", p.id, p.id, { project: p.name, fields: Object.keys(after) });
    PF.save(); PF.refresh();
    PF.toast("Projeto atualizado", p.name, "ok");
  };

  act.archiveProject = function (id) {
    if (!PF.guard("project.archive", "arquivar projetos")) return;
    var p = PF.project(id);
    if (!p || !PF.canSeeProject(id)) { PF.deny("arquivar este projeto"); return; }
    p.archived = true;
    audit("archive", "project", p.id, p.id, { archived: false }, { archived: true }, "arquivou o projeto " + p.name, "ui");
    PF.emitEvent("project.archived.v1", p.id, p.id, { project: p.name, key: p.key });
    PF.save();
    // o detalhe do projeto arquivado não está mais nas listagens: volta para a lista
    if (PF.parseHash()[0] === "projects" && PF.parseHash()[1] === id) PF.navigate("/projects"); else PF.refresh();
    PF.toast("Projeto arquivado", p.name + " saiu das listagens ativas. Para restaurar, filtre por “Arquivados” em Projetos.", "ok");
  };

  act.unarchiveProject = function (id) {
    if (!PF.guard("project.archive", "desarquivar projetos")) return;
    var p = PF.project(id);
    if (!p || !p.archived || !PF.visibleProjects({ includeArchived: true }).some(function (x) { return x.id === id; })) { PF.deny("desarquivar este projeto"); return; }
    p.archived = false;
    audit("unarchive", "project", p.id, p.id, { archived: true }, { archived: false }, "desarquivou o projeto " + p.name, "ui");
    PF.emitEvent("project.unarchived.v1", p.id, p.id, { project: p.name, key: p.key });
    PF.save(); PF.refresh();
    PF.toast("Projeto restaurado", p.name + " voltou às listagens ativas.", "ok");
  };

  act.deleteProject = function (id) {
    if (!PF.guard("project.delete", "excluir projetos")) return;
    var p = PF.project(id);
    if (!p || !PF.visibleProjects({ includeArchived: true }).some(function (x) { return x.id === id; })) { PF.deny("excluir este projeto"); return; }
    var taskIds = {};
    PF.db.tasks.forEach(function (t) { if (t.projectId === id) taskIds[t.id] = 1; });
    PF.db.projects = PF.db.projects.filter(function (x) { return x.id !== id; });
    PF.db.tasks = PF.db.tasks.filter(function (t) { return t.projectId !== id; });
    // nada órfão: épicos, sprints, marcos, comentários e referências de favoritos/bloqueios
    PF.db.epics = PF.db.epics.filter(function (x) { return x.projectId !== id; });
    PF.db.sprints = PF.db.sprints.filter(function (x) { return x.projectId !== id; });
    PF.db.milestones = PF.db.milestones.filter(function (x) { return x.projectId !== id; });
    PF.db.comments = PF.db.comments.filter(function (c) { return !taskIds[c.taskId]; });
    PF.db.tasks.forEach(function (t) { if (t.blockedBy.some(function (b) { return taskIds[b]; })) t.blockedBy = t.blockedBy.filter(function (b) { return !taskIds[b]; }); });
    PF.db.users.forEach(function (u) { if (u.favoriteProjectIds) u.favoriteProjectIds = u.favoriteProjectIds.filter(function (x) { return x !== id; }); });
    delete PF.db.taskCounters[id];
    if (PF.db.settings.currentProjectId === id) PF.db.settings.currentProjectId = null;
    audit("delete", "project", id, id, { name: p.name }, null, "excluiu o projeto " + p.name + " (simulado)", "ui");
    PF.save();
    PF.navigate("/projects");
    PF.toast("Projeto excluído", p.name + " e suas tarefas foram removidos (simulação).", "ok");
  };

  PF.isFavorite = function (projectId) {
    var me = PF.me();
    return (me.favoriteProjectIds || []).indexOf(projectId) >= 0;
  };
  act.toggleFavorite = function (id) {
    var me = PF.me();
    if (!PF.canSeeProject(id)) return;
    var favs = (me.favoriteProjectIds || []).slice();
    var i = favs.indexOf(id);
    if (i >= 0) favs.splice(i, 1); else favs.push(id);
    me.favoriteProjectIds = favs;
    PF.save(); PF.refresh();
    PF.announce(i >= 0 ? "Removido dos favoritos" : "Adicionado aos favoritos");
  };

  act.createEpic = function (projectId, f, source) {
    if (!PF.guard("task.create", "criar épicos", source)) return null;
    if (!PF.project(projectId) || !PF.canSeeProject(projectId)) { PF.deny("criar épicos neste projeto", source); return null; }
    if (!strOk(f.name, 70, true)) { invalid("O nome do épico é obrigatório (até 70 caracteres)."); return null; }
    var ep = { id: PF.uid("ep"), projectId: projectId, name: f.name.trim(), desc: f.desc || "", status: "active", ownerId: f.ownerId || PF.me().id };
    PF.db.epics.push(ep);
    audit("create", "epic", ep.id, projectId, null, { name: ep.name }, "criou o épico " + ep.name, source || "ui");
    PF.save();
    return ep;
  };

  // sem task.assign só é permitido atribuir a si mesmo (ou tirar a própria atribuição)
  function assignAllowed(fromId, toId) {
    if (PF.can("task.assign")) return true;
    var me = PF.me().id;
    return toId ? toId === me : (!fromId || fromId === me);
  }
  PF.assignAllowed = assignAllowed;

  act.createTask = function (f, source) {
    if (!PF.guard("task.create", "criar tarefas", source)) return null;
    if (!PF.canSeeProject(f.projectId)) { PF.deny("criar tarefas neste projeto", source); return null; }
    if (f.assigneeId && !assignAllowed(null, f.assigneeId)) { PF.deny("atribuir tarefas a outras pessoas", source); return null; }
    var err = PF.validateTask(f, f.projectId, null);
    if (!err && f.parentId) { var par = PF.task(f.parentId); if (!par || par.projectId !== f.projectId) err = "A tarefa-mãe precisa ser do mesmo projeto."; }
    if (err) { invalid(err); return null; }
    var p = PF.project(f.projectId);
    PF.db.taskCounters[p.id] = (PF.db.taskCounters[p.id] || 0) + 1;
    var now = new Date().toISOString();
    var t = {
      id: PF.uid("tsk"), ref: p.key + "-" + (100 + PF.db.taskCounters[p.id]),
      projectId: p.id, epicId: f.epicId || null, parentId: f.parentId || null,
      type: f.type || "task", title: f.title.trim(), desc: f.desc || "",
      status: f.status || "todo", priority: f.priority || "medium",
      assigneeId: f.assigneeId || null, teamId: f.teamId || p.teamIds[0] || null,
      sprintId: f.sprintId || null, labels: f.labels || [], acceptance: f.acceptance || [],
      blockedBy: [], createdAt: now, updatedAt: now, doneAt: f.status === "done" ? now : null,
      dueDate: f.dueDate || null, createdBy: PF.me().id
    };
    PF.db.tasks.push(t);
    audit("create", "task", t.id, p.id, null, { title: t.title, status: t.status }, "criou a tarefa " + t.ref, source || "ui");
    PF.emitEvent("task.created.v1", p.id, t.id, { task: t.ref, title: t.title });
    if (t.assigneeId) {
      var u = PF.user(t.assigneeId);
      PF.emitEvent("task.assigned.v1", p.id, t.id, { task: t.ref, assignee: t.assigneeId, vars: { ref: t.ref, nome: u.name.split(" ")[0], titulo: t.title, projeto: p.name } });
    }
    PF.save(); PF.refresh();
    if (!f.silent) PF.toast("Tarefa criada", t.ref + " — " + t.title, "ok");
    return t;
  };

  // devolve true quando algo foi gravado
  act.updateTask = function (id, fields, source) {
    var t = PF.task(id);
    if (!t) return false;
    if (!PF.canTouchTask(t)) { PF.deny("editar a tarefa " + t.ref, source); return false; }
    if ("assigneeId" in fields && (fields.assigneeId || null) !== (t.assigneeId || null) && !assignAllowed(t.assigneeId, fields.assigneeId)) {
      PF.deny("atribuir tarefas a outras pessoas", source); return false;
    }
    var err = PF.validateTask(fields, t.projectId, t);
    if (err) { invalid(err); return false; }
    var p = PF.project(t.projectId);
    var before = {}, after = {};
    Object.keys(fields).forEach(function (k) {
      if (!sameValue(k, t[k], fields[k])) { before[k] = t[k]; after[k] = fields[k]; t[k] = fields[k]; }
    });
    if (!Object.keys(after).length) return false;
    t.updatedAt = new Date().toISOString();
    // data de conclusão real: KPIs de entrega não mudam quando uma tarefa concluída é editada
    if ("status" in after) t.doneAt = after.status === "done" ? t.updatedAt : null;

    if ("status" in after) {
      audit("status", "task", t.id, t.projectId, { status: before.status }, { status: after.status },
        "moveu " + t.ref + " de " + PF.STATUS_META[before.status].label + " para " + PF.STATUS_META[after.status].label, source || "ui");
      PF.emitEvent("task.status_changed.v1", t.projectId, t.id, { task: t.ref, from: before.status, to: after.status });
      if (after.status === "done") PF.emitEvent("task.completed.v1", t.projectId, t.id, { task: t.ref });
    }
    if ("assigneeId" in after) {
      audit("assign", "task", t.id, t.projectId, { assigneeId: before.assigneeId }, { assigneeId: after.assigneeId },
        "atribuiu " + t.ref + (after.assigneeId ? " a " + PF.user(after.assigneeId).name : " a ninguém"), source || "ui");
      if (after.assigneeId) {
        var u = PF.user(after.assigneeId);
        PF.emitEvent("task.assigned.v1", t.projectId, t.id, { task: t.ref, assignee: after.assigneeId, vars: { ref: t.ref, nome: u.name.split(" ")[0], titulo: t.title, projeto: p.name } });
      }
    }
    if ("blockedBy" in after) {
      var prev = before.blockedBy || [];
      after.blockedBy.filter(function (b) { return prev.indexOf(b) < 0; }).forEach(function (blockerId) {
        var blocker = PF.task(blockerId);
        audit("block", "task", t.id, t.projectId, null, { blockedBy: blockerId }, t.ref + " bloqueada por " + (blocker ? blocker.ref : "?"), source || "ui");
        PF.emitEvent("task.blocked.v1", t.projectId, t.id, { task: t.ref, assignee: t.assigneeId, vars: { ref: t.ref, bloqueio: blocker ? blocker.ref : "?" } });
      });
      prev.filter(function (b) { return after.blockedBy.indexOf(b) < 0; }).forEach(function (blockerId) {
        var blocker = PF.task(blockerId);
        audit("unblock", "task", t.id, t.projectId, { blockedBy: blockerId }, null, t.ref + " deixou de depender de " + (blocker ? blocker.ref : "tarefa removida"), source || "ui");
      });
    }
    var other = Object.keys(after).filter(function (k) { return ["status", "assigneeId", "blockedBy"].indexOf(k) < 0; });
    if (other.length) {
      var ob = {}, oa = {};
      other.forEach(function (k) { ob[k] = before[k]; oa[k] = after[k]; });
      audit(other.indexOf("priority") >= 0 ? "priority" : "update", "task", t.id, t.projectId, ob, oa, "atualizou " + t.ref + " (" + other.join(", ") + ")", source || "ui");
    }
    PF.save(); PF.refresh();
    return true;
  };

  act.moveTask = function (id, status, source) {
    if (!PF.guard("task.move", "mover tarefas", source)) return false;
    return act.updateTask(id, { status: status }, source);
  };

  act.deleteTask = function (id, source) {
    var t = PF.task(id);
    if (!t) return;
    if (!PF.guard("task.delete", "excluir tarefas", source)) return;
    if (!PF.canSeeProject(t.projectId)) { PF.deny("excluir a tarefa " + t.ref, source); return; }
    var gone = {};
    PF.db.tasks.forEach(function (x) { if (x.id === id || x.parentId === id) gone[x.id] = 1; });
    PF.db.tasks = PF.db.tasks.filter(function (x) { return !gone[x.id]; });
    // dependentes deixam de apontar para a tarefa excluída; comentários dela saem junto
    PF.db.tasks.forEach(function (x) {
      if (x.blockedBy.some(function (b) { return gone[b]; })) {
        x.blockedBy = x.blockedBy.filter(function (b) { return !gone[b]; });
        audit("unblock", "task", x.id, x.projectId, { blockedBy: id }, null, x.ref + " deixou de depender de " + t.ref + " (excluída)", source || "ui");
      }
    });
    PF.db.comments = PF.db.comments.filter(function (c) { return !gone[c.taskId]; });
    audit("delete", "task", id, t.projectId, { title: t.title }, null, "excluiu a tarefa " + t.ref + " (simulado)", source || "ui");
    PF.save(); PF.refresh();
    PF.toast("Tarefa excluída", t.ref + " removida (simulação).", "ok");
  };

  act.addComment = function (taskId, text) {
    var t = PF.task(taskId);
    if (!t) return;
    if (!PF.canSeeProject(t.projectId) || !PF.can("task.create")) { PF.deny("comentar nesta tarefa"); return; }
    if (!strOk(text, 4000, true)) { invalid("O comentário deve ter até 4000 caracteres."); return; }
    var c = { id: PF.uid("cm"), taskId: taskId, userId: PF.me().id, text: text, createdAt: new Date().toISOString() };
    PF.db.comments.push(c);
    audit("comment", "task", t.id, t.projectId, null, null, "comentou em " + t.ref, "ui");
    // menções: @Nome Sobrenome
    PF.db.users.forEach(function (u) {
      if (u.id !== PF.me().id && text.indexOf("@" + u.name) >= 0) {
        PF.emitEvent("comment.mention.v1", t.projectId, t.id, { task: t.ref, mentioned: u.id, vars: { ref: t.ref, autor: PF.me().name } });
      }
    });
    PF.save(); PF.refresh();
  };

  act.createSprint = function (projectId, f) {
    if (!PF.guard("sprint.manage", "criar sprints")) return null;
    if (!PF.canSeeProject(projectId)) { PF.deny("criar sprints neste projeto"); return null; }
    if (!strOk(f.name, 40, true)) { invalid("O nome da sprint é obrigatório."); return null; }
    if (!PF.isDateOnly(f.startDate) || !PF.isDateOnly(f.endDate) || f.endDate <= f.startDate) { invalid("O término da sprint deve ser depois do início."); return null; }
    if (PF.sprintsOf(projectId).some(function (x) { return x.name.trim().toLowerCase() === f.name.trim().toLowerCase(); })) { invalid("Já existe uma sprint com esse nome neste projeto."); return null; }
    var s = { id: PF.uid("sp"), projectId: projectId, name: f.name.trim(), goal: f.goal || "", status: "planned", startDate: f.startDate, endDate: f.endDate };
    PF.db.sprints.push(s);
    audit("create", "sprint", s.id, projectId, null, { name: s.name }, "criou a " + s.name, "ui");
    PF.save(); PF.refresh();
    PF.toast("Sprint criada", s.name, "ok");
    return s;
  };

  act.startSprint = function (id) {
    if (!PF.guard("sprint.manage", "iniciar sprints")) return;
    var s = PF.byId("sprints", id);
    if (!s || !PF.canSeeProject(s.projectId)) { PF.deny("iniciar esta sprint"); return; }
    if (s.status !== "planned") { PF.toast("Sprint não pode ser iniciada", "Só sprints planejadas podem ser iniciadas.", "warn"); return; }
    // uma sprint ativa por projeto
    var running = PF.sprintsOf(s.projectId).filter(function (x) { return x.status === "active"; })[0];
    if (running) { PF.toast("Já existe uma sprint ativa", "Encerre a " + running.name + " antes de iniciar a " + s.name + ".", "warn"); return; }
    var prevStatus = s.status;
    s.status = "active";
    audit("sprint_start", "sprint", s.id, s.projectId, { status: prevStatus }, { status: "active" }, "iniciou a " + s.name, "ui");
    PF.emitEvent("sprint.started.v1", s.projectId, s.id, { sprint: s.name, vars: { sprint: s.name, projeto: PF.project(s.projectId).name, meta: s.goal } });
    PF.save(); PF.refresh();
    PF.toast("Sprint iniciada", s.name, "ok");
  };

  act.completeSprint = function (id) {
    if (!PF.guard("sprint.manage", "encerrar sprints")) return;
    var s = PF.byId("sprints", id);
    if (!s || !PF.canSeeProject(s.projectId)) { PF.deny("encerrar esta sprint"); return; }
    if (s.status !== "active") { PF.toast("Sprint não pode ser encerrada", "Só a sprint ativa pode ser encerrada.", "warn"); return; }
    var prevStatus = s.status;
    s.status = "done";
    var done = PF.db.tasks.filter(function (t) { return t.sprintId === id && t.status === "done"; }).length;
    var open = PF.db.tasks.filter(function (t) { return t.sprintId === id && t.status !== "done"; });
    open.forEach(function (t) { t.sprintId = null; }); // volta para o backlog da lista
    audit("sprint_end", "sprint", s.id, s.projectId, { status: prevStatus }, { status: "done" },
      "encerrou a " + s.name + " (" + done + " concluídas, " + open.length + " devolvidas ao backlog)", "ui");
    PF.emitEvent("sprint.completed.v1", s.projectId, s.id, { sprint: s.name, done: done, vars: { sprint: s.name, feitas: String(done) } });
    PF.save(); PF.refresh();
    PF.toast("Sprint encerrada", s.name + ": " + done + " tarefas concluídas; " + open.length + " voltaram ao backlog.", "ok");
  };

  // endpoints simulados com falha (mesma regra da dica do formulário e do README)
  PF.FAILING_URL_RE = /fail|erro|500|503|\.local\b/i;

  act.createWebhook = function (f) {
    if (!PF.guard("webhook.manage", "gerenciar webhooks")) return null;
    var wh = {
      id: PF.uid("wh"), name: f.name, url: f.url,
      secret: "whsec_" + Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10),
      events: f.events, active: true, health: PF.FAILING_URL_RE.test(f.url) ? "failing" : "ok",
      createdAt: new Date().toISOString()
    };
    PF.db.webhooks.push(wh);
    audit("create", "webhook", wh.id, null, null, { name: wh.name, url: wh.url }, "cadastrou o webhook " + wh.name, "ui");
    PF.save(); PF.refresh();
    PF.toast("Webhook cadastrado", wh.name, "ok");
    return wh;
  };

  act.updateWebhook = function (id, fields) {
    if (!PF.guard("webhook.manage", "gerenciar webhooks")) return;
    var wh = PF.byId("webhooks", id);
    if (!wh) return;
    var before = {}, after = {};
    Object.keys(fields).forEach(function (k) {
      if (!sameValue(k, wh[k], fields[k])) { before[k] = wh[k]; after[k] = fields[k]; wh[k] = fields[k]; }
    });
    if ("url" in after) wh.health = PF.FAILING_URL_RE.test(wh.url) ? "failing" : "ok";
    if (Object.keys(after).length) audit("update", "webhook", wh.id, null, before, after, "atualizou o webhook " + wh.name, "ui");
    PF.save(); PF.refresh();
  };

  act.deleteWebhook = function (id) {
    if (!PF.guard("webhook.manage", "gerenciar webhooks")) return;
    var wh = PF.byId("webhooks", id);
    if (!wh) return;
    PF.db.webhooks = PF.db.webhooks.filter(function (x) { return x.id !== id; });
    audit("delete", "webhook", id, null, { name: wh.name }, null, "excluiu o webhook " + wh.name, "ui");
    PF.save(); PF.refresh();
    PF.toast("Webhook excluído", wh.name, "ok");
  };

  act.testWebhook = function (id) {
    if (!PF.guard("webhook.manage", "testar webhooks")) return;
    var wh = PF.byId("webhooks", id);
    if (!wh) return;
    if (!wh.active) { PF.toast("Assinatura inativa", "Ative “" + wh.name + "” para enviar um teste.", "warn"); return; }
    var ev = { id: PF.uid("ev"), ts: new Date().toISOString(), type: "ping.v1", projectId: null, entityId: null, actorId: PF.me().id, payload: { message: "Teste manual disparado por " + PF.me().name } };
    PF.db.events.unshift(ev);
    audit("test", "webhook", wh.id, null, null, null, "testou o webhook " + wh.name, "ui");
    lastAudit.eventId = ev.id;
    deliverWebhook(wh, ev);
    PF.save(); PF.refresh();
    if (wh.health !== "failing") PF.toast("Teste enviado", wh.name + " respondeu 200 OK.", "ok");
  };

  act.redeliver = function (deliveryId) {
    if (!PF.guard("webhook.manage", "reenviar entregas")) return;
    var dl = PF.byId("deliveries", deliveryId);
    var wh = dl && PF.byId("webhooks", dl.webhookId);
    // assinatura excluída: nada é alterado
    if (!dl || !wh) { PF.toast("Assinatura removida", "A assinatura desta entrega foi excluída; não há destino para reenviar.", "warn"); return; }
    dl.attempts.push({ ts: new Date().toISOString(), httpStatus: 200, ok: true, durationMs: 120 + Math.floor(Math.random() * 200), manual: true });
    dl.status = "success"; dl.httpStatus = 200;
    audit("redeliver", "webhook", wh.id, null, null, null, "reenviou manualmente o evento " + dl.eventType + " para " + wh.name, "ui");
    PF.save(); PF.refresh();
    PF.toast("Evento reenviado", "Entrega concluída com 200 OK (simulação de endpoint recuperado).", "ok");
  };

  act.resendNotification = function (id) {
    if (!PF.guard("notif.manage", "reenviar notificações")) return;
    var nf = PF.byId("notifications", id);
    if (!nf) return;
    nf.attempts += 1;
    var provider = PF.db.providers[nf.channel];
    var ok = !!(provider && provider.configured);
    if (ok) { nf.status = "delivered"; nf.failReason = null; }
    audit("resend", "notification", nf.id, null, null, { channel: nf.channel, status: nf.status },
      "reenviou a notificação “" + nf.subject + "” (" + nf.channel + ")" + (ok ? "" : " — falhou"), "ui");
    if (ok) PF.toast("Notificação reenviada", "Entregue via " + nf.channel + ".", "ok");
    else PF.toast("Reenvio falhou", "Provedor de " + nf.channel.toUpperCase() + " segue não configurado.", "err");
    PF.save(); PF.refresh();
  };

  act.setNotifPref = function (eventType, channel, val) {
    if (!PF.guard("notif.manage", "alterar preferências de notificação")) return;
    PF.db.notifPrefs[eventType][channel] = val;
    audit("update", "notification", eventType, null, null, { channel: channel, enabled: val }, "alterou preferência de notificação (" + eventType + " / " + channel + ")", "ui");
    PF.save(); PF.refresh();
  };

  act.setProvider = function (channel, fields) {
    if (!PF.guard("notif.manage", "configurar provedores de notificação")) return;
    Object.assign(PF.db.providers[channel], fields);
    audit("update", "notification", channel, null, null, fields, "configurou o provedor de " + channel, "ui");
    PF.save(); PF.refresh();
    PF.toast("Provedor atualizado", PF.db.providers[channel].name, "ok");
  };

  act.createTeam = function (f) {
    if (!PF.guard("user.manage", "criar equipes")) return;
    var orgId = PF.me().orgId;
    var lead = f.leadId ? PF.user(f.leadId) : null;
    if (f.leadId && (!lead || lead.orgId !== orgId)) { PF.toast("Líder inválido", "O líder precisa ser da mesma organização da equipe.", "err"); return; }
    var t = { id: PF.uid("tm"), orgId: orgId, name: f.name, desc: f.desc || "", leadId: lead ? lead.id : null, memberIds: lead ? [lead.id] : [] };
    PF.db.teams.push(t);
    // os dois lados da relação ficam sincronizados (o escopo de projetos usa user.teamIds)
    if (lead && lead.teamIds.indexOf(t.id) < 0) lead.teamIds.push(t.id);
    audit("create", "team", t.id, null, null, { name: t.name }, "criou a equipe " + t.name, "ui");
    PF.save(); PF.refresh();
    PF.toast("Equipe criada", t.name, "ok");
  };

  act.toggleTeamMember = function (teamId, userId) {
    var team = PF.team(teamId);
    var me = PF.me();
    var allowed = PF.can("user.manage") || (PF.can("team.manage") && team.leadId === me.id);
    if (!allowed) { PF.deny("gerenciar os membros da equipe " + team.name); return; }
    var u = PF.user(userId);
    if (!u || u.orgId !== team.orgId) { PF.toast("Pessoa de outra organização", "Só é possível incluir pessoas da organização da equipe.", "err"); return; }
    var idx = team.memberIds.indexOf(userId);
    if (idx >= 0) {
      team.memberIds.splice(idx, 1);
      u.teamIds = u.teamIds.filter(function (x) { return x !== teamId; });
      audit("update", "team", team.id, null, { member: u.name }, null, "removeu " + u.name + " da equipe " + team.name, "ui");
    } else {
      team.memberIds.push(userId);
      if (u.teamIds.indexOf(teamId) < 0) u.teamIds.push(teamId);
      audit("update", "team", team.id, null, null, { member: u.name }, "adicionou " + u.name + " à equipe " + team.name, "ui");
    }
    PF.save(); PF.refresh();
  };

  act.inviteUser = function (f) {
    if (!PF.guard("user.manage", "convidar usuários")) return;
    var parts = f.name.trim().split(" ");
    var orgId = PF.me().orgId;
    var teamIds = (f.teamIds || []).filter(function (tid) { var tm = PF.team(tid); return tm && tm.orgId === orgId; });
    var u = {
      id: PF.uid("u"), name: f.name, email: f.email, title: f.title || "",
      initials: (parts[0][0] + (parts[1] ? parts[parts.length - 1][0] : "")).toUpperCase(),
      color: "#4A6572", roleId: f.roleId, orgId: orgId, teamIds: teamIds, active: false, invited: true
    };
    PF.db.users.push(u);
    teamIds.forEach(function (tid) {
      var tm = PF.team(tid);
      if (tm && tm.memberIds.indexOf(u.id) < 0) tm.memberIds.push(u.id);
    });
    audit("create", "user", u.id, null, null, { name: u.name, role: f.roleId }, "convidou " + u.name + " (" + u.email + ")", "ui");
    PF.save(); PF.refresh();
    PF.toast("Convite enviado", "Convite simulado para " + u.email + ".", "ok");
  };

  act.setUserRole = function (userId, roleId) {
    if (!PF.guard("user.manage", "alterar papéis de acesso")) return;
    var u = PF.user(userId);
    if (!u || !PF.inMyOrg(u.orgId) || !PF.byId("roles", roleId) || u.id === PF.me().id) return;
    var old = u.roleId;
    u.roleId = roleId;
    audit("update", "user", u.id, null, { role: old }, { role: roleId }, "alterou o papel de " + u.name + " para " + PF.roleName(roleId), "ui");
    PF.save(); PF.refresh();
    PF.toast("Papel atualizado", u.name + " agora é " + PF.roleName(roleId) + ".", "ok");
  };

  /* ---------- tema ---------- */
  PF.applyTheme = function () {
    var root = document.documentElement;
    root.classList.add("theme-switching");
    var mode = PF.db.settings.theme;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.remove("theme-switching"); });
    });
    PF.refresh();
  };
  PF.effectiveTheme = function () {
    var mode = PF.db.settings.theme;
    if (mode !== "system") return mode;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  /* ---------- roteador ---------- */
  PF.routes = {};
  PF.navigate = function (path) {
    if (location.hash === "#" + path) PF.refresh();
    else location.hash = "#" + path;
  };
  PF.parseHash = function () {
    var hsh = location.hash.replace(/^#\/?/, "");
    var parts = hsh.split("/").filter(Boolean);
    return parts.length ? parts : ["dashboard"];
  };
  PF.currentRoute = function () {
    var parts = PF.parseHash();
    return PF.routes[parts[0]] || null;
  };
  /* ---------- foco estável entre re-renderizações ----------
     O render recria o DOM; para teclado e leitor de tela não voltarem
     ao início da página, guardamos uma chave do elemento focado
     (data-fk, aria-label, caminho na árvore) e a reaplicamos depois. */
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"); }
  function nodePath(el, root) {
    var path = [];
    for (var n = el; n && n !== root; n = n.parentElement) {
      if (!n.parentElement) return null;
      path.unshift(Array.prototype.indexOf.call(n.parentElement.children, n));
    }
    return path;
  }
  function textKey(el) { return (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80); }
  PF.captureFocus = function () {
    var el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    var root = el.closest("#app, #overlays");
    if (!root) return null;
    var k = { root: root.id, tag: el.tagName, fk: el.getAttribute("data-fk"), label: el.getAttribute("aria-label"), text: textKey(el), path: nodePath(el, root) };
    try { if (typeof el.selectionStart === "number") { k.ss = el.selectionStart; k.se = el.selectionEnd; k.sd = el.selectionDirection; } } catch (e) { /* input sem seleção (date, checkbox) */ }
    return k;
  };
  PF.restoreFocus = function (k) {
    if (!k) return false;
    var root = document.getElementById(k.root);
    if (!root) return false;
    var el = null;
    function uniq(list) { return list.length === 1 ? list[0] : null; }
    if (k.fk) el = root.querySelector('[data-fk="' + cssEsc(k.fk) + '"]');
    if (!el && k.label) el = uniq(root.querySelectorAll(k.tag + '[aria-label="' + cssEsc(k.label) + '"]'));
    if (!el && k.path) {
      var n = root;
      for (var i = 0; n && i < k.path.length; i++) n = n.children[k.path[i]];
      if (n && n.tagName === k.tag && (/^(INPUT|SELECT|TEXTAREA)$/.test(k.tag) || textKey(n) === k.text)) el = n;
    }
    if (!el && k.text && /^(BUTTON|A)$/.test(k.tag)) {
      el = uniq(Array.prototype.filter.call(root.querySelectorAll(k.tag), function (x) { return textKey(x) === k.text; }));
    }
    if (!el || el.disabled || !el.isConnected) return false;
    el.focus({ preventScroll: true });
    if (k.ss != null) { try { el.setSelectionRange(k.ss, k.se, k.sd || "none"); } catch (e) { /* ignorado */ } }
    return document.activeElement === el;
  };
  // quando o elemento focado deixou de existir: foco vai para o contêiner estável mais próximo
  PF.focusFallback = function (rootId) {
    var target = null;
    if (rootId === "overlays") { var ds = document.querySelectorAll("#overlays [role=dialog]"); target = ds[ds.length - 1] || null; }
    if (!target) target = document.getElementById("conteudo");
    if (target) target.focus({ preventScroll: true });
  };

  var refreshDeferred = false;
  PF.refresh = function () {
    if (PF._batchDepth) { PF._batchDirty = true; return; }
    // mudança disparada ao sair de um campo de texto: espera o foco chegar ao destino
    var ev = window.event;
    if (ev && ev.type === "change" && ev.target && /^(TEXTAREA|INPUT)$/.test(ev.target.tagName) && !/^(checkbox|radio|date|range|color|file)$/.test(ev.target.type || "")) {
      if (!refreshDeferred) { refreshDeferred = true; setTimeout(function () { refreshDeferred = false; PF.refresh(); }, 0); }
      return;
    }
    var fk = PF.captureFocus();
    var content = document.querySelector(".content");
    var st = content ? content.scrollTop : 0;
    var dBody = document.querySelector("#overlays .drawer-body");
    var dst = dBody ? dBody.scrollTop : 0;
    PF.renderApp();
    var c2 = document.querySelector(".content");
    if (c2) c2.scrollTop = st;
    if (PF._drawerRefresh) PF._drawerRefresh();
    var d2 = document.querySelector("#overlays .drawer-body");
    if (d2) d2.scrollTop = dst;
    if (fk && !PF.restoreFocus(fk)) PF.focusFallback(fk.root);
  };
  // agrupa várias mutações em um único re-render
  PF.batch = function (fn) {
    PF._batchDepth = (PF._batchDepth || 0) + 1;
    try { return fn(); } finally {
      PF._batchDepth--;
      if (!PF._batchDepth && PF._batchDirty) { PF._batchDirty = false; PF.refresh(); }
    }
  };

  /* ---------- região viva (anúncios para leitor de tela) ---------- */
  PF.announce = function (msg, assertive) {
    var el = document.getElementById(assertive ? "live-assertive" : "live-polite");
    if (!el || !msg) return;
    el.textContent = "";
    setTimeout(function () { el.textContent = msg; }, 30);
  };

  /* ---------- camadas: modal, drawer, menu e navegação móvel ----------
     Pilha única: foco inicial, foco preso no diálogo do topo, fundo inerte,
     Esc fecha só a camada do topo e o foco volta ao gatilho. */
  var overlays = function () { return document.getElementById("overlays"); };
  var layers = [];
  var FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

  function layerEl(l) { return l.getEl ? l.getEl() : l.el; }
  function isDialog(l) { return l.kind === "modal" || l.kind === "drawer"; }
  function syncInert() {
    var app = document.getElementById("app");
    var dialogs = layers.filter(isDialog);
    if (app) app.inert = dialogs.length > 0;
    // diálogos abaixo do topo (ex.: drawer sob uma confirmação) também ficam inertes
    dialogs.forEach(function (l, i) {
      var below = i < dialogs.length - 1;
      l.el.inert = below;
      if (l.parts) l.parts.forEach(function (p) { p.inert = below; });
    });
  }
  function focusablesIn(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (el) {
      return !el.closest("[inert]") && (el.offsetParent !== null || el === document.activeElement);
    });
  }
  function returnFocus(l) {
    var t = l.trigger;
    if (t && t.isConnected && !t.closest("[inert]") && t !== document.body) { t.focus({ preventScroll: true }); return; }
    if (l.triggerKey && PF.restoreFocus(l.triggerKey)) return;
    var top = layers[layers.length - 1];
    if (top && layerEl(top)) { var f = focusablesIn(layerEl(top))[0]; if (f) { f.focus(); return; } }
    PF.focusFallback("app");
  }
  PF.pushLayer = function (l) {
    l.trigger = l.trigger || document.activeElement;
    l.triggerKey = PF.captureFocus();
    layers.push(l);
    syncInert();
    return l;
  };
  PF.closeLayer = function (l, opts) {
    var i = layers.indexOf(l);
    if (i < 0) return;
    while (layers.length > i) {
      var x = layers.pop();
      if (x.teardown) x.teardown();
      if (x.onClose) x.onClose();
    }
    syncInert();
    if (!opts || opts.restore !== false) returnFocus(l);
  };
  PF.topLayer = function () { return layers[layers.length - 1] || null; };
  // fecha todas as camadas (rota nova, ação concluída)
  PF.closeOverlays = function (opts) {
    if (layers.length) PF.closeLayer(layers[0], opts);
    overlays().replaceChildren();
    PF._drawerRefresh = null;
  };
  function closeKind(kind) {
    var l = layers.filter(function (x) { return x.kind === kind; })[0];
    if (l) PF.closeLayer(l, { restore: false });
  }

  function trapTab(root, e) {
    var list = focusablesIn(root);
    if (!list.length) { e.preventDefault(); root.focus(); return; }
    var first = list[0], last = list[list.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || !root.contains(a))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !root.contains(a))) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener("keydown", function (e) {
    var top = PF.topLayer();
    if (!top) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); PF.closeLayer(top); return; }
    if (top.onKey && top.onKey(e) === true) return;
    if (e.key === "Tab") {
      if (top.kind === "menu") { PF.closeLayer(top); return; } // o Tab segue a partir do gatilho
      var root = layerEl(top);
      if (root) trapTab(root, e);
    }
  }, true);

  function stackZ(base) { return base + 2 * layers.filter(isDialog).length; }

  PF.modal = function (opts) {
    closeMenu(); closeKind("nav");
    layers.filter(function (l) { return l.kind === "modal"; }).slice(0, 1).forEach(function (l) { PF.closeLayer(l, { restore: false }); });
    var titleId = PF.uid("dlg");
    var card = h("div", { class: "modal-card" + (opts.wide ? " wide" : ""), role: opts.alert ? "alertdialog" : "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabindex: "-1" });
    var layer;
    function close() { PF.closeLayer(layer); }
    card.appendChild(h("div", { class: "modal-head" },
      h("h3", { id: titleId }, opts.title),
      h("span", { class: "grow" }),
      h("button", { class: "btn btn-ghost btn-icon", "aria-label": "Fechar", onclick: close }, icon("x"))
    ));
    var body = h("div", { class: "modal-body" });
    append(body, opts.body);
    card.appendChild(body);
    if (opts.foot) { var f = h("div", { class: "modal-foot" }); append(f, opts.foot); card.appendChild(f); }
    var z = stackZ(95);
    var wrap = h("div", { class: "modal", style: "z-index:" + z }, card);
    var bd = h("div", { class: "backdrop", style: "z-index:" + (z - 1), onclick: close });
    // clique fora do cartão (área do .modal) também fecha
    wrap.addEventListener("mousedown", function (e) { if (e.target === wrap) close(); });
    overlays().append(bd, wrap);
    layer = PF.pushLayer({ kind: "modal", el: card, parts: [wrap, bd], onClose: opts.onClose, teardown: function () { bd.remove(); wrap.remove(); } });
    var first = card.querySelector("input:not([disabled]), select:not([disabled]), textarea:not([disabled]), .modal-foot button, button:not([aria-label=Fechar])");
    (first || card).focus();
    return { close: close, card: card, layer: layer };
  };

  PF.confirm = function (opts) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (done) return; done = true; resolve(v); }
      var m = PF.modal({
        title: opts.title || "Confirmar", alert: true,
        body: h("p", { style: "margin:0" }, opts.msg),
        onClose: function () { finish(false); },
        foot: [
          h("button", { class: "btn", onclick: function () { m.close(); finish(false); } }, "Cancelar"),
          h("button", { class: "btn " + (opts.danger ? "btn-danger" : "btn-primary"), onclick: function () { finish(true); m.close(); } }, opts.confirmLabel || "Confirmar")
        ]
      });
    });
  };

  PF.drawer = function (opts) {
    closeMenu(); closeKind("nav");
    // abrir outro drawer a partir de um drawer mantém o gatilho original
    var prev = layers.filter(function (l) { return l.kind === "drawer"; })[0];
    var trigger = document.activeElement, triggerKey = null;
    if (prev && trigger && overlays().contains(trigger)) { trigger = prev.trigger; triggerKey = prev.triggerKey; }
    if (layers.length) PF.closeLayer(layers[0], { restore: false });
    overlays().replaceChildren();
    var dr = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": opts.label || "Detalhes", tabindex: "-1" });
    var layer;
    function close() { PF.closeLayer(layer); }
    var head = h("div", { class: "drawer-head" });
    append(head, opts.head);
    head.appendChild(h("span", { class: "grow" }));
    if (opts.headActions) append(head, opts.headActions);
    head.appendChild(h("button", { class: "btn btn-ghost btn-icon", "aria-label": "Fechar", onclick: close }, icon("x")));
    var body = h("div", { class: "drawer-body" });
    append(body, opts.body);
    dr.append(head, body);
    if (opts.foot) { var f = h("div", { class: "drawer-foot" }); append(f, opts.foot); dr.appendChild(f); }
    var bd = h("div", { class: "backdrop", onclick: close });
    overlays().append(bd, dr);
    layer = PF.pushLayer({ kind: "drawer", el: dr, parts: [bd], trigger: trigger, teardown: function () { bd.remove(); dr.remove(); PF._drawerRefresh = null; } });
    if (triggerKey) layer.triggerKey = triggerKey;
    dr.focus();
    return { close: close, body: body, head: head, layer: layer };
  };

  /* menu (padrão APG Menu Button) */
  PF.menuOpen = null;
  PF.menu = function (anchor, items, opts) {
    opts = opts || {};
    closeMenu();
    var menuId = PF.uid("mn");
    var m = h("div", { class: "menu", role: "menu", id: menuId, "aria-label": opts.label || anchor.getAttribute("aria-label") || (anchor.textContent || "").trim() || "Menu" });
    var layer;
    items.forEach(function (it) {
      if (it === "sep") { m.appendChild(h("div", { class: "menu-sep", role: "separator" })); return; }
      if (it.head) { m.appendChild(h("div", { class: "menu-head", role: "presentation" }, it.head)); return; }
      var role = it.radio ? "menuitemradio" : (it.checked != null ? "menuitemcheckbox" : "menuitem");
      var btn = h("button", {
        class: "menu-item" + (it.danger ? " danger" : ""), role: role, tabindex: "-1",
        "aria-checked": role === "menuitem" ? null : (it.checked ? "true" : "false"),
        onclick: function () { PF.closeLayer(layer); if (it.onClick) it.onClick(); }
      });
      if (it.icon) btn.appendChild(icon(it.icon, 15));
      if (it.node) btn.appendChild(it.node);
      var txt = h("span", { class: "grow" }, it.label);
      if (it.sub) txt.appendChild(h("span", { class: "mi-sub" }, it.sub));
      btn.appendChild(txt);
      if (it.checked) btn.appendChild(icon("check", 14));
      m.appendChild(btn);
    });
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    var mw = m.offsetWidth, mh = m.offsetHeight;
    var x = Math.min(r.left, window.innerWidth - mw - 8);
    var y = r.bottom + 6;
    if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 6);
    m.style.left = Math.max(8, x) + "px"; m.style.top = y + "px";
    anchor.setAttribute("aria-haspopup", "menu");
    anchor.setAttribute("aria-expanded", "true");
    anchor.setAttribute("aria-controls", menuId);
    function itemsList() { return Array.prototype.slice.call(m.querySelectorAll(".menu-item")); }
    function onDoc(e) { if (!m.contains(e.target) && !anchor.contains(e.target)) PF.closeLayer(layer, { restore: false }); }
    var typed = "", typedT = null;
    layer = PF.pushLayer({
      kind: "menu", el: m, trigger: anchor,
      teardown: function () {
        document.removeEventListener("click", onDoc, true);
        m.remove(); PF.menuOpen = null;
        anchor.setAttribute("aria-expanded", "false");
        anchor.removeAttribute("aria-controls");
      },
      onKey: function (e) {
        var list = itemsList(), i = list.indexOf(document.activeElement);
        var go = function (j) { if (list.length) list[(j + list.length) % list.length].focus(); };
        if (e.key === "ArrowDown") { e.preventDefault(); go(i + 1); return true; }
        if (e.key === "ArrowUp") { e.preventDefault(); go(i < 0 ? -1 : i - 1); return true; }
        if (e.key === "Home") { e.preventDefault(); go(0); return true; }
        if (e.key === "End") { e.preventDefault(); go(-1); return true; }
        if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          clearTimeout(typedT); typed += e.key.toLowerCase(); typedT = setTimeout(function () { typed = ""; }, 600);
          var start = typed.length === 1 ? i + 1 : Math.max(i, 0);
          for (var k = 0; k < list.length; k++) {
            var cand = list[(start + k) % list.length];
            if ((cand.textContent || "").trim().toLowerCase().indexOf(typed) === 0) { cand.focus(); break; }
          }
          return true;
        }
        return false;
      }
    });
    PF.menuOpen = m;
    m._close = function () { PF.closeLayer(layer, { restore: false }); };
    setTimeout(function () { document.addEventListener("click", onDoc, true); }, 0);
    var first = itemsList()[0];
    if (first) first.focus();
  };
  function closeMenu() { closeKind("menu"); }
  PF.closeMenu = closeMenu;

  /* navegação lateral off-canvas (≤ 860px) */
  PF.isNarrow = function () { return !!(window.matchMedia && window.matchMedia("(max-width: 860px)").matches); };
  PF._navOpen = false;
  PF.applyNavState = function () {
    var shell = document.querySelector(".shell");
    if (!shell) return;
    var sb = shell.querySelector(".sidebar"), main = shell.querySelector(".main"), burger = shell.querySelector(".tb-burger");
    shell.classList.toggle("nav-open", PF._navOpen);
    if (sb) sb.inert = PF.isNarrow() && !PF._navOpen;
    if (main) main.inert = PF._navOpen;
    if (burger) burger.setAttribute("aria-expanded", PF._navOpen ? "true" : "false");
    var closeBtn = sb && sb.querySelector(".sb-close");
    if (closeBtn) closeBtn.style.display = PF._navOpen ? "" : "none";
  };
  PF.openNav = function () {
    if (PF._navOpen) return;
    closeMenu();
    PF._navOpen = true;
    var layer;
    var bd = h("div", { class: "backdrop", style: "z-index:105", onclick: function () { PF.closeLayer(layer); } });
    overlays().appendChild(bd);
    layer = PF.pushLayer({
      kind: "nav", getEl: function () { return document.querySelector(".sidebar"); },
      teardown: function () { bd.remove(); PF._navOpen = false; PF.applyNavState(); }
    });
    PF.applyNavState();
    var sb = document.querySelector(".sidebar");
    var cur = sb && (sb.querySelector(".sb-item.active") || focusablesIn(sb)[0]);
    if (cur) cur.focus();
  };
  PF.closeNav = function (opts) { var l = layers.filter(function (x) { return x.kind === "nav"; })[0]; if (l) PF.closeLayer(l, opts); };

  /* avisos: fechar, pausa com mouse/foco, erro fica até ser fechado,
     no máximo 3 visíveis e repetidos agrupados com contador */
  var MAX_TOASTS = 3;
  PF.toast = function (title, msg, kind, opts) {
    kind = kind || "info"; opts = opts || {};
    var host = document.getElementById("toasts");
    var key = kind + "|" + title + "|" + (msg || "");
    PF.announce(title + (msg ? ". " + msg : ""), kind === "err");
    var live = Array.prototype.filter.call(host.children, function (el) { return !el.classList.contains("leaving"); });
    var same = live.filter(function (el) { return el._key === key; })[0];
    if (same) {
      same._count++;
      same.querySelector(".t-count").textContent = " (" + same._count + "×)";
      same._arm();
      return same;
    }
    var icons = { ok: "check", err: "block", warn: "alert", info: "info" };
    var duration = opts.duration != null ? opts.duration : (kind === "err" ? 0 : 4200);
    var timer = null;
    function dismiss() {
      clearTimeout(timer);
      if (t.classList.contains("leaving")) return;
      var hadFocus = t.contains(document.activeElement);
      t.classList.add("leaving");
      setTimeout(function () { t.remove(); }, 220);
      if (hadFocus) PF.focusFallback("app");
    }
    var t = h("div", { class: "toast " + kind },
      h("span", { class: "t-ic", "aria-hidden": "true" }, icon(icons[kind] || "info", 16)),
      h("div", { class: "grow" }, h("b", {}, title, h("small", { class: "t-count num" })), msg ? h("span", {}, msg) : null),
      h("button", { class: "btn btn-ghost btn-icon btn-sm toast-close", "aria-label": "Fechar aviso: " + title, style: "margin-left:auto;flex:none", onclick: dismiss }, icon("x", 12))
    );
    t._key = key; t._count = 1;
    t._arm = function () { clearTimeout(timer); if (duration) timer = setTimeout(dismiss, duration); };
    t.addEventListener("mouseenter", function () { clearTimeout(timer); });
    t.addEventListener("focusin", function () { clearTimeout(timer); });
    t.addEventListener("mouseleave", function () { if (!t.contains(document.activeElement)) t._arm(); });
    t.addEventListener("focusout", function (e) { if (!t.contains(e.relatedTarget)) t._arm(); });
    host.appendChild(t);
    // excedente: sai o mais antigo
    live.push(t);
    while (live.length > MAX_TOASTS) { var old = live.shift(); old.classList.add("leaving"); old.remove(); }
    t._arm();
    return t;
  };
  // reset mínimo de <button> usado como link de linha (cor, peso e foco vêm de .row-link no CSS)
  PF.ROWLINK_STYLE = "background:none;border:0;padding:0;margin:0;text-align:left;cursor:pointer";

  // a Clipboard API devolve Promise: o aviso de sucesso só aparece quando a cópia acontece de fato
  PF.copyText = function (text, okTitle) {
    function fail() { PF.toast("Não foi possível copiar", "O navegador bloqueou a área de transferência.", "warn"); }
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) { fail(); return; }
      navigator.clipboard.writeText(text).then(function () { PF.toast(okTitle || "Copiado", "", "ok"); }, fail);
    } catch (e) { fail(); }
  };

  // opts.compact: variante para painel (mesma estrutura, classe extra)
  PF.emptyState = function (iconName, title, msg, action, opts) {
    return h("div", { class: "empty" + (opts && opts.compact ? " compact" : "") },
      h("div", { class: "e-ic" }, icon(iconName, 20)),
      h("b", {}, title),
      h("p", {}, msg || ""),
      action || null
    );
  };

  /* campos: label ligado ao controle; dica e erro ligados por aria-describedby */
  function addDescribedBy(el, id) {
    var cur = (el.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
    if (cur.indexOf(id) < 0) cur.push(id);
    el.setAttribute("aria-describedby", cur.join(" "));
  }
  function removeDescribedBy(el, id) {
    var cur = (el.getAttribute("aria-describedby") || "").split(" ").filter(function (x) { return x && x !== id; });
    if (cur.length) el.setAttribute("aria-describedby", cur.join(" ")); else el.removeAttribute("aria-describedby");
  }
  PF.field = function (label, control, opts) {
    opts = opts || {};
    if (!control.id) control.id = PF.uid("fld-");
    // obrigatório: asterisco visual vem de .field.required (CSS); aria-required informa o leitor de tela
    var lbl = h("label", { for: control.id }, label);
    if (opts.required) control.setAttribute("aria-required", "true");
    var f = h("div", { class: "field" + (opts.span2 ? " span2" : "") + (opts.required ? " required" : "") }, lbl, control);
    if (opts.hint) {
      var hid = PF.uid("hint-");
      f.appendChild(h("span", { class: "hint", id: hid }, opts.hint));
      addDescribedBy(control, hid);
    }
    return f;
  };
  // grupo de caixas de seleção (etiquetas, equipes, eventos) com nome acessível
  PF.fieldGroup = function (label, content, opts) {
    opts = opts || {};
    var lid = PF.uid("grp-");
    return h("div", { class: "field" + (opts.span2 ? " span2" : ""), role: "group", "aria-labelledby": lid },
      h("label", { id: lid }, label), content);
  };
  PF.setInvalid = function (fieldEl, msg) {
    fieldEl.classList.add("invalid");
    var old = fieldEl.querySelector(".err");
    if (old) old.remove();
    var eid = PF.uid("err-");
    fieldEl.appendChild(h("span", { class: "err", id: eid }, icon("alert", 12), msg));
    var isGroup = fieldEl.getAttribute("role") === "group";
    var ctl = isGroup ? fieldEl : fieldEl.querySelector("input:not([type=checkbox]), select, textarea");
    if (ctl) {
      if (!isGroup) ctl.setAttribute("aria-invalid", "true");
      addDescribedBy(ctl, eid);
      fieldEl._errId = eid;
    }
    // foco no primeiro campo inválido do formulário
    var form = fieldEl.closest("[data-pf-form]");
    if (form && !form._invalidFocused) {
      form._invalidFocused = true;
      var target = isGroup ? fieldEl.querySelector("input") : ctl;
      if (target) target.focus();
    }
  };
  PF.clearInvalid = function (form) {
    form.setAttribute("data-pf-form", "");
    form._invalidFocused = false;
    form.querySelectorAll(".field.invalid").forEach(function (f) {
      f.classList.remove("invalid");
      var e = f.querySelector(".err"); if (e) e.remove();
      var ctl = f.getAttribute("role") === "group" ? f : f.querySelector("[aria-invalid]");
      if (ctl) { ctl.removeAttribute("aria-invalid"); if (f._errId) removeDescribedBy(ctl, f._errId); }
    });
  };

  PF.select = function (options, value, onChange, attrs) {
    var s = h("select", Object.assign({ class: "select", onchange: function () { onChange && onChange(s.value); } }, attrs || {}));
    options.forEach(function (o) {
      var opt = h("option", { value: o.value }, o.label);
      if (o.value === value) opt.selected = true;
      s.appendChild(opt);
    });
    return s;
  };

  PF.switchEl = function (checked, onChange, label) {
    var input = h("input", { type: "checkbox", role: "switch", "aria-label": label || "Alternar" });
    input.checked = !!checked;
    input.addEventListener("change", function () { onChange(input.checked); });
    return h("span", { class: "switch" }, input, h("span", { class: "tr" }));
  };

  PF.progressBar = function (pct, ok, label) {
    var p = h("div", { class: "progress" + (ok ? " ok" : ""), role: "progressbar", "aria-valuenow": Math.round(pct),
      "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuetext": Math.round(pct) + "%", "aria-label": label || "Progresso" },
      h("i", { style: "width:" + Math.max(0, Math.min(100, pct)) + "%" }));
    return p;
  };

  /* ---------- derivações de domínio ---------- */
  // dia (calendário local) em que a tarefa foi concluída
  PF.doneDay = function (t) { return t.status === "done" && t.doneAt ? PF.ymd(new Date(t.doneAt)) : null; };
  PF.projectTasks = function (projectId) {
    return PF.db.tasks.filter(function (t) { return t.projectId === projectId; });
  };
  PF.projectProgress = function (projectId) {
    var ts = PF.projectTasks(projectId).filter(function (t) { return !t.parentId; });
    if (!ts.length) return 0;
    return Math.round(100 * ts.filter(function (t) { return t.status === "done"; }).length / ts.length);
  };
  PF.visibleTasks = function () {
    var vis = {};
    PF.visibleProjects().forEach(function (p) { vis[p.id] = 1; });
    return PF.db.tasks.filter(function (t) { return vis[t.projectId]; });
  };
  PF.epicsOf = function (projectId) {
    return PF.db.epics.filter(function (e) { return e.projectId === projectId; });
  };
  PF.sprintsOf = function (projectId) {
    return PF.db.sprints.filter(function (s) { return s.projectId === projectId; });
  };
  PF.projectRisk = function (p) {
    var ts = PF.projectTasks(p.id).filter(function (t) { return !t.parentId; });
    var late = ts.filter(PF.isOverdue).length;
    var blocked = ts.filter(PF.isBlocked).length;
    var target = p.targetDate ? PF.daysLeft(p.targetDate) : 99;
    var prog = PF.projectProgress(p.id);
    if (p.status === "done") return { level: "ok", label: "Entregue" };
    if (late >= 3 || (target != null && target < 15 && prog < 60) || blocked >= 2) return { level: "high", label: "Em risco", late: late, blocked: blocked };
    if (late >= 1 || (target != null && target < 30 && prog < 50)) return { level: "mid", label: "Atenção", late: late, blocked: blocked };
    return { level: "ok", label: "Saudável", late: late, blocked: blocked };
  };

  PF.load();
})();
