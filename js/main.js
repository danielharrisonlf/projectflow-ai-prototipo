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

  // "Pular para o conteúdo" (visível só com foco, via .skip-link no CSS); não altera o hash, que é do roteador
  var skip = document.querySelector(".skip-link");
  if (skip) {
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

  // grava alterações pendentes antes de sair ou esconder a página
  window.addEventListener("pagehide", function () { PF.flushSave(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") PF.flushSave(); });

  if (!location.hash) location.hash = "#/dashboard";
  PF.renderApp();
  PF.announceRoute();
  if (PF._loadNotice) { PF.toast("Dados restaurados", PF._loadNotice, "warn"); PF._loadNotice = null; }
})();
