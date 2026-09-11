// =============================================================
// site.js — Mobile nav, dark mode, publication filter, toggles,
//           scroll effects, copy bibtex, back-to-top
// =============================================================

(function () {
  'use strict';

  // Icons come from the inline sprite in _includes/icons.svg
  function iconHTML(name) {
    return '<svg class="icon" aria-hidden="true" focusable="false"><use href="#icon-' + name + '"></use></svg>';
  }
  function setIcon(svg, name) {
    var use = svg && svg.querySelector('use');
    if (use) use.setAttribute('href', '#icon-' + name);
  }

  // ----- Mobile Navigation -----

  var navToggler = document.querySelector('.navbar-toggler');
  var navMenu = document.getElementById('navbarNav');

  if (navToggler && navMenu) {
    navToggler.addEventListener('click', function () {
      var open = navMenu.classList.toggle('show');
      navToggler.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // Close the menu after a link is chosen
    navMenu.addEventListener('click', function (e) {
      if (e.target.closest('a.nav-link')) {
        navMenu.classList.remove('show');
        navToggler.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ----- Dark Mode Toggle -----

  var toggle = document.getElementById('darkModeToggle');
  var icon = document.getElementById('themeIcon');

  if (toggle) {
    var systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    var modes = ['auto', 'light', 'dark'];
    var labels = { auto: 'Auto', light: 'Light', dark: 'Dark' };
    var mode = 'auto';
    try {
      var savedTheme = localStorage.getItem('theme');
      if (modes.includes(savedTheme)) mode = savedTheme;
    } catch (error) {}

    function applyTheme() {
      var theme = mode === 'auto' ? (systemTheme.matches ? 'dark' : 'light') : mode;
      var next = modes[(modes.indexOf(mode) + 1) % modes.length];
      document.documentElement.setAttribute('data-bs-theme', theme);
      setIcon(icon, theme === 'dark' ? 'moon' : 'sun');
      document.getElementById('themeLabel').textContent = labels[mode];
      var description = 'Theme: ' + labels[mode] + (mode === 'auto' ? ' (system)' : '') + '. Switch to ' + labels[next];
      toggle.setAttribute('aria-label', description);
      toggle.title = description;
    }

    applyTheme();
    systemTheme.addEventListener('change', function () {
      if (mode === 'auto') applyTheme();
    });

    toggle.addEventListener('click', function () {
      mode = modes[(modes.indexOf(mode) + 1) % modes.length];
      try { localStorage.setItem('theme', mode); } catch (error) {}
      applyTheme();
    });
  }

  // ----- Publication Expand/Collapse -----

  document.addEventListener('click', function (e) {
    var button = e.target.closest('[data-toggle-target]');
    if (!button) return;

    var targetId = button.getAttribute('data-toggle-target');
    var target = document.getElementById(targetId);
    if (!target) return;

    var expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    target.hidden = !expanded;
  });

  // ----- Publication Search/Filter -----

  var searchInput = document.getElementById('pubSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var query = this.value.toLowerCase().trim();
      var entries = document.querySelectorAll('[data-pub-searchable]');

      entries.forEach(function (entry) {
        if (!query) {
          entry.style.display = '';
          return;
        }
        var text = entry.textContent.toLowerCase();
        entry.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }

  // ----- Copy BibTeX Button -----

  document.querySelectorAll('.pub-collapse').forEach(function (collapse) {
    // Only add copy to bibtex blocks (id starts with "bib-")
    if (!collapse.id || !collapse.id.startsWith('bib-')) return;

    var pre = collapse.querySelector('pre');
    if (!pre) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'copy-wrapper';
    wrapper.style.position = 'relative';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.innerHTML = iconHTML('copy') + '<span class="copy-label">Copy</span>';
    btn.title = 'Copy BibTeX';
    btn.setAttribute('aria-label', 'Copy BibTeX to clipboard');
    var status = document.createElement('p');
    status.className = 'copy-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    var resetTimer;

    btn.addEventListener('click', async function () {
      clearTimeout(resetTimer);
      btn.disabled = true;
      status.textContent = '';
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(pre.textContent.trim());
        btn.innerHTML = iconHTML('check') + '<span class="copy-label">Copied</span>';
        btn.classList.add('copied');
        status.textContent = 'BibTeX copied.';
      } catch (error) {
        btn.innerHTML = iconHTML('copy') + '<span class="copy-label">Retry</span>';
        btn.classList.remove('copied');
        status.textContent = 'Could not copy automatically. Select the BibTeX text and copy it manually, or try again.';
      } finally {
        btn.disabled = false;
      }
      resetTimer = setTimeout(function () {
        btn.innerHTML = iconHTML('copy') + '<span class="copy-label">Copy</span>';
        btn.classList.remove('copied');
      }, 2000);
    });

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.append(btn, pre, status);
  });

  // ----- Back to Top Button -----

  var topBtn = document.createElement('button');
  topBtn.className = 'back-to-top';
  topBtn.innerHTML = iconHTML('arrow-up');
  topBtn.setAttribute('aria-label', 'Back to top');
  document.body.appendChild(topBtn);

  topBtn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', function () {
    if (window.scrollY > 400) {
      topBtn.classList.add('visible');
    } else {
      topBtn.classList.remove('visible');
    }
  }, { passive: true });

  // ----- Navbar Scroll Shadow -----

  var navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 10) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  // ----- Fade-in on Scroll -----

  var fadeElements = document.querySelectorAll('.fade-in-section');
  if (fadeElements.length > 0 && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    fadeElements.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    fadeElements.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  // ----- Site Search -----

  var searchToggleBtn = document.getElementById('searchToggle');
  var searchOverlay = document.getElementById('searchOverlay');
  var searchInputEl = document.getElementById('searchInput');
  var searchResultsEl = document.getElementById('searchResults');
  var searchStatus = document.getElementById('searchStatus');
  var searchCloseBtn = document.getElementById('searchClose');
  var searchData = null;
  var searchOpener = null;
  var debounceTimer;
  var searchVersion = 0;

  function openSearch() {
    if (!searchOverlay || searchOverlay.open) return;
    searchOpener = document.activeElement;
    searchOverlay.showModal();
    searchInputEl.focus();
  }

  function closeSearch() {
    if (searchOverlay && searchOverlay.open) searchOverlay.close();
  }

  if (searchToggleBtn) searchToggleBtn.addEventListener('click', openSearch);
  if (searchCloseBtn) searchCloseBtn.addEventListener('click', closeSearch);

  if (searchOverlay) {
    searchOverlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
        return;
      }
      if (e.key !== 'Tab') return;
      var controls = searchOverlay.querySelectorAll('input, button, a[href]');
      var first = controls[0];
      var last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
    // Reset pending work and restore the opener on every close path.
    searchOverlay.addEventListener('close', function () {
      clearTimeout(debounceTimer);
      searchVersion++;
      searchInputEl.value = '';
      searchResultsEl.replaceChildren();
      searchStatus.textContent = '';
      if (searchOpener && searchOpener.isConnected) searchOpener.focus();
    });
    searchOverlay.addEventListener('click', function (e) {
      var bounds = searchOverlay.getBoundingClientRect();
      if (e.target === searchOverlay &&
          (e.clientX < bounds.left || e.clientX > bounds.right ||
           e.clientY < bounds.top || e.clientY > bounds.bottom)) closeSearch();
    });
  }

  if (searchResultsEl) {
    searchResultsEl.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var destination = new URL(link.href);
      if (destination.pathname !== location.pathname || !destination.hash) return;
      var target = document.getElementById(decodeURIComponent(destination.hash.slice(1)));
      if (!target) return;
      if (searchInput) {
        searchInput.value = '';
        document.querySelectorAll('[data-pub-searchable]').forEach(function (entry) { entry.style.display = ''; });
      }
      if (navMenu && navToggler) {
        navMenu.classList.remove('show');
        navToggler.setAttribute('aria-expanded', 'false');
      }
      // Native anchor navigation scrolls; dialog close restores focus to the paper.
      searchOpener = target;
      closeSearch();
    });
  }

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && searchOverlay) {
      e.preventDefault();
      if (searchOverlay.open) closeSearch();
      else openSearch();
    }
  });

  var baseurl = (document.body && document.body.getAttribute('data-baseurl')) || '';

  function showSearchMessage(message) {
    var notice = document.createElement('div');
    notice.className = 'search-no-results';
    notice.textContent = message;
    searchResultsEl.replaceChildren(notice);
    searchStatus.textContent = message;
  }

  function renderResults(query, data) {
    var q = query.toLowerCase();
    var matches = data.filter(function (item) {
      return item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q);
    }).sort(function (a, b) {
      return Number(b.kind === 'publication') - Number(a.kind === 'publication');
    });
    if (matches.length === 0) {
      showSearchMessage('No results for "' + query + '"');
      return;
    }

    var results = document.createDocumentFragment();
    matches.forEach(function (item) {
      var link = document.createElement('a');
      link.className = 'search-result-item';
      link.href = item.url;
      var title = document.createElement('div');
      title.className = 'search-result-title';
      title.textContent = item.title;
      var snippet = document.createElement('div');
      snippet.className = 'search-result-snippet';
      var matchAt = item.content.toLowerCase().indexOf(q);
      var start = Math.max(0, matchAt - 45);
      if (start > 0) {
        var nextSpace = item.content.indexOf(' ', start);
        if (nextSpace >= 0 && nextSpace < matchAt) start = nextSpace + 1;
      }
      var end = Math.min(item.content.length, Math.max(start + 150, matchAt + query.length + 45));
      snippet.textContent = (start > 0 ? '…' : '') + item.content.slice(start, end).trim() +
        (end < item.content.length ? '…' : '');
      link.append(title, snippet);
      results.appendChild(link);
    });
    searchResultsEl.replaceChildren(results);
    searchStatus.textContent = matches.length + (matches.length === 1 ? ' result' : ' results');
  }

  if (searchInputEl) {
    searchInputEl.addEventListener('input', function () {
      var query = this.value.trim();
      var version = ++searchVersion;
      clearTimeout(debounceTimer);
      searchResultsEl.replaceChildren();
      searchStatus.textContent = '';
      if (!query) return;
      debounceTimer = setTimeout(function () {
        var request = searchData ? Promise.resolve(searchData) :
          fetch(baseurl + '/assets/search.json').then(function (response) {
            if (!response.ok) throw new Error('Search index unavailable');
            return response.json();
          });
        request.then(function (data) {
          searchData = data;
          if (version === searchVersion && searchOverlay.open) renderResults(query, data);
        }).catch(function () {
          if (version === searchVersion && searchOverlay.open) {
            showSearchMessage('Could not load search index. Please try again.');
          }
        });
      }, 150);
    });
  }

})();
