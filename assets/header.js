/* ==========================================================================
   Calcuvelo — Universal Header behaviour
   --------------------------------------------------------------------------
   • Light / dark toggle — persists to localStorage ("cv-theme") so the
     choice follows the visitor across every calculator.
   • "Calculators" dropdown — click to open, close on outside-click / Esc /
     link-click.
   • Highlights the current page inside the dropdown.
   • Re-themes any Chart.js charts on the page when the mode changes.

   Load with `defer`. Safe to include on every page — it self-detects the
   header markup and no-ops if a piece is missing.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var THEME_KEY = 'cv-theme';

  /* ------------------------------------------------------------------ theme */
  function setTheme(dark, persist) {
    root.classList.toggle('dark', !!dark);
    if (persist) {
      try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (e) {}
    }
    document.querySelectorAll('.theme-toggle').forEach(function (t) {
      t.setAttribute('aria-checked', dark ? 'true' : 'false');
      var knob = t.querySelector('.theme-toggle-knob');
      if (knob) knob.style.marginLeft = dark ? '24px' : '0px';   /* 3rem track − 1.25rem knob − padding */
    });
    applyChartTheme();
  }

  document.querySelectorAll('.theme-toggle').forEach(function (t) {
    t.addEventListener('click', function () {
      setTheme(!root.classList.contains('dark'), true);
    });
  });

  /* sync the switch visuals with whatever the pre-paint <head> script decided */
  setTheme(root.classList.contains('dark'), false);

  /* pick up a change made in another tab/window */
  window.addEventListener('storage', function (e) {
    if (e.key === THEME_KEY) setTheme(e.newValue === 'dark', false);
  });

  /* --------------------------------------------------------------- dropdown
     Open/close is driven by inline styles (not a class) because the Tailwind
     Play CDN's runtime injection can out-rank a toggled class in the cascade. */
  document.querySelectorAll('[data-dropdown]').forEach(function (dd) {
    var btn = dd.querySelector('.site-nav-trigger');
    var menu = dd.querySelector('.site-nav-menu');
    if (!btn || !menu) return;

    var caret = dd.querySelector('.site-nav-caret');
    var isOpen = false;

    var setOpen = function (open) {
      isOpen = open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (caret) caret.style.transform = open ? 'rotate(180deg)' : 'none';
      menu.style.visibility   = open ? 'visible' : 'hidden';
      menu.style.opacity      = open ? '1' : '0';
      menu.style.pointerEvents = open ? 'auto' : 'none';
    };

    btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!isOpen); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('click', function (e) { if (!dd.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) { setOpen(false); btn.blur(); }
    });
  });

  /* ------------------------------------------------- mark the current page */
  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('a.site-nav-link[data-nav]').forEach(function (a) {
    if ((a.getAttribute('href') || '').toLowerCase() === here) {
      a.classList.add('is-active');
      a.setAttribute('aria-current', 'page');
    }
  });

  /* --------------------------------------------------- Chart.js re-theming */
  function applyChartTheme() {
    if (!window.Chart || !window.Chart.getChart) return;
    var dark = root.classList.contains('dark');
    var tick = dark ? '#94a3b8' : '#64748b';
    var grid = dark ? 'rgba(148,163,184,0.16)' : '#f1f5f9';

    Chart.defaults.color = tick;

    document.querySelectorAll('canvas').forEach(function (cv) {
      var ch = Chart.getChart(cv);
      if (!ch || !ch.options) return;
      var scales = ch.options.scales || {};
      ['x', 'y', 'r'].forEach(function (axis) {
        var s = scales[axis];
        if (!s) return;
        if (s.grid)  s.grid.color  = grid;
        if (s.ticks) s.ticks.color = tick;
        if (s.title) s.title.color = tick;
      });
      ch.update('none');
    });
  }

  /* charts are built lazily (Alpine x-init) — catch up after they exist */
  window.addEventListener('load', function () {
    applyChartTheme();
    setTimeout(applyChartTheme, 300);
    setTimeout(applyChartTheme, 900);
  });
})();
