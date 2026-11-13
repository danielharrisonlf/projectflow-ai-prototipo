/* ============================================================
   ProjectFlow AI — inicialização
   ============================================================ */
(function () {
  "use strict";

  // tema persistido antes do primeiro paint
  var mode = PF.db.settings.theme;
  if (mode && mode !== "system") document.documentElement.setAttribute("data-theme", mode);

  // regiões só para leitor de tela: estilo inline garante o ocultamento visual mesmo sem a classe no CSS
  var SR = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
  document.querySelectorAll(".sr-only").forEach(function (el) { el.style.cssText = SR; });

  // "Pular para o conteúdo": visível só com foco; não altera o hash (o roteador usa o hash)
  var skip = document.querySelector(".skip-link");
  if (skip) {
    var SKIP_ON = "position:fixed;left:8px;top:8px;z-index:1000;padding:8px 12px;background:var(--surface);color:var(--ink);border:1px solid var(--border);border-radius:var(--r-ctl, 6px);font-weight:600";
    skip.style.cssText = SR;
    skip.addEventListener("focus", function () { skip.style.cssText = SKIP_ON; });
    skip.addEventListener("blur", function () { skip.style.cssText = SR; });
    skip.addEventListener("click", function (e) {
      e.preventDefault();
      var main = document.getElementById("conteudo");
      if (main) main.focus();
    });
  }

  window.addEventListener("hashchange", function () {
    // navegação por abas internas mantém o foco na aba; o resto vai para o título da página
    var fromTabs = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-keep-focus]");
    var fk = fromTabs ? PF.captureFocus() : null;
    PF.closeMenu();
    PF.closeOverlays();
    PF.renderApp();
    if (!(fk && PF.restoreFocus(fk))) PF.focusPageTitle();
    PF.announceRoute();
  });

  // tema do sistema mudou e preferimos "system"
  if (window.matchMedia) {
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
        if (PF.db.settings.theme === "system") PF.refresh();
      });
    } catch (e) { /* navegadores antigos */ }
  }

  // atalho: "n" cria tarefa quando não há campo focado
  document.addEventListener("keydown", function (e) {
    if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (["INPUT", "TEXTAREA", "SELECT"].indexOf(tag) >= 0) return;
      if (document.querySelector(".modal, .drawer, .menu")) return;
      if (PF.can("task.create")) { e.preventDefault(); PF.ui.taskModal(); }
    }
  });

  if (!location.hash) location.hash = "#/dashboard";
  PF.renderApp();
  PF.announceRoute();
})();
