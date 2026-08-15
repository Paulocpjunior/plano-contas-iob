(function (root) {
  'use strict';

  const STORAGE_KEY = 'sp_saas_theme';
  const LEGACY_KEYS = ['auditAI_theme', 'plano_contas_iob_theme'];
  let applying = false;

  function normalizeTheme(value) {
    return value === 'dark' ? 'dark' : value === 'light' ? 'light' : '';
  }

  function storedTheme() {
    try {
      const shared = normalizeTheme(localStorage.getItem(STORAGE_KEY));
      if (shared) return shared;
      for (const key of LEGACY_KEYS) {
        const legacy = normalizeTheme(localStorage.getItem(key));
        if (legacy) return legacy;
      }
    } catch (e) {}
    return root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function syncButtons(theme) {
    const dark = theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-pressed', dark ? 'true' : 'false');
      button.setAttribute('title', dark ? 'Mudar para visualização clara' : 'Mudar para visualização escura');
      const icon = button.querySelector('[data-theme-icon]');
      const label = button.querySelector('[data-theme-label]');
      if (icon) icon.textContent = dark ? '☀️' : '🌙';
      if (label) label.textContent = dark ? 'Claro' : 'Escuro';
    });
  }

  function syncCharts(theme) {
    if (!root.Chart) return;
    const dark = theme === 'dark';
    root.Chart.defaults.color = dark ? '#cbd5e1' : '#64748b';
    root.Chart.defaults.borderColor = dark ? 'rgba(148,163,184,.20)' : 'rgba(100,116,139,.18)';
    const instances = root.Chart.instances || {};
    Object.keys(instances).forEach(function (key) {
      try { instances[key].update('none'); } catch (e) {}
    });
  }

  function persist(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
      LEGACY_KEYS.forEach(function (key) { localStorage.setItem(key, theme); });
    } catch (e) {}
  }

  function apply(theme, options) {
    const next = normalizeTheme(theme) || storedTheme();
    applying = true;
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.style.colorScheme = next;
    applying = false;
    if (!options || options.persist !== false) persist(next);
    syncButtons(next);
    syncCharts(next);
    try { root.dispatchEvent(new CustomEvent('sp-saas-theme-change', { detail: { theme: next } })); } catch (e) {}
    return next;
  }

  function toggle() {
    return apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  }

  function enhanceAuditAIBrand() {
    document.querySelectorAll('header h1').forEach(function (title) {
      if (!/SP ASSESSORIA CONT[ÁA]BIL/i.test(title.textContent || '')) return;
      const titleWrap = title.parentElement;
      const brandRow = titleWrap && titleWrap.parentElement;
      if (!brandRow || brandRow.querySelector('[data-sp-official-logo]')) return;
      const possibleIcon = brandRow.firstElementChild;
      if (possibleIcon && possibleIcon !== titleWrap && possibleIcon.querySelector('svg')) {
        // O cabecalho pertence ao React. Substituir ou inserir nos filhos dele
        // durante a montagem faz o reconciliador perder a referencia do no e
        // pode deixar o AuditAI em branco. A identidade visual e aplicada sem
        // alterar a arvore controlada pelo React.
        possibleIcon.setAttribute('data-sp-official-logo', 'runtime');
        possibleIcon.classList.add('sp-official-logo-runtime');
        possibleIcon.style.backgroundImage = 'url("/sp-logo.png")';
        possibleIcon.style.backgroundPosition = 'center';
        possibleIcon.style.backgroundRepeat = 'no-repeat';
        possibleIcon.style.backgroundSize = '34px 34px';
      }
    });
  }

  function enhanceAuditAIThemeToggle() {
    document.querySelectorAll('header button').forEach(function (button) {
      const text = (button.textContent || '').trim();
      if (text !== '☀' && text !== '🌙') return;
      button.classList.add('sp-audit-theme-toggle');
      const theme = document.documentElement.dataset.theme || storedTheme();
      const label = theme === 'dark' ? 'Claro' : 'Escuro';
      button.setAttribute('aria-label', 'Alternar para modo ' + label.toLowerCase());
      button.title = 'Modo ' + label;
    });
  }

  function enhance() {
    syncButtons(document.documentElement.dataset.theme || storedTheme());
    enhanceAuditAIBrand();
    enhanceAuditAIThemeToggle();
    syncCharts(document.documentElement.dataset.theme || storedTheme());
  }

  root.SPSaaSTheme = { apply: apply, toggle: toggle, current: function () {
    return document.documentElement.dataset.theme || storedTheme();
  }};

  apply(storedTheme());

  let enhanceScheduled = false;
  function scheduleEnhance() {
    if (enhanceScheduled) return;
    enhanceScheduled = true;
    root.requestAnimationFrame(function () {
      enhanceScheduled = false;
      enhanceAuditAIBrand();
      enhanceAuditAIThemeToggle();
    });
  }

  const observer = new MutationObserver(function (mutations) {
    if (applying) return;
    const classChanged = mutations.some(function (mutation) {
      return mutation.target === document.documentElement && mutation.attributeName === 'class';
    });
    if (classChanged) {
      const externalTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      if (document.documentElement.dataset.theme !== externalTheme) apply(externalTheme);
    }
    if (mutations.some(function (mutation) { return mutation.type === 'childList'; })) {
      scheduleEnhance();
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance);
  else enhance();
  root.addEventListener('load', enhance);
})(window);
