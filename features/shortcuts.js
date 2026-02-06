(function() {
  var highlightedIdx = -1;
  var overlayVisible = false;
  var taskElements = [];

  function injectCSS() {
    var style = document.createElement('style');
    style.textContent = [
      '.shortcut-highlight { outline: 2px solid var(--cyan) !important; outline-offset: -2px; }',
      '#shortcuts-overlay {',
      '  position: fixed; inset: 0; z-index: 300;',
      '  background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);',
      '  display: flex; align-items: center; justify-content: center;',
      '}',
      '#shortcuts-overlay .panel {',
      '  background: var(--bg-card); border: 1px solid var(--border-glow);',
      '  border-radius: 16px; padding: 24px 32px; max-width: 420px; width: 90vw;',
      '}',
      '#shortcuts-overlay h2 {',
      '  font-size: 16px; font-weight: 700; color: var(--cyan); margin-bottom: 16px;',
      '}',
      '#shortcuts-overlay .row {',
      '  display: flex; justify-content: space-between; padding: 6px 0;',
      '  border-bottom: 1px solid var(--border-subtle);',
      '}',
      '#shortcuts-overlay .row:last-child { border-bottom: none; }',
      '#shortcuts-overlay kbd {',
      '  background: rgba(255,255,255,0.08); border: 1px solid var(--border-glow);',
      '  border-radius: 4px; padding: 1px 7px; font-family: monospace;',
      '  font-size: 12px; color: var(--cyan);',
      '}',
      '#shortcuts-overlay .desc { font-size: 13px; color: var(--text-muted); }',
      '#shortcuts-help-btn {',
      '  position: fixed; bottom: 16px; right: 16px; z-index: 50;',
      '  width: 32px; height: 32px; border-radius: 50%;',
      '  background: var(--bg-card); border: 1px solid var(--border-subtle);',
      '  color: var(--text-muted); font-size: 16px; font-weight: 700;',
      '  cursor: pointer; display: flex; align-items: center; justify-content: center;',
      '  transition: all 0.2s;',
      '}',
      '#shortcuts-help-btn:hover { color: var(--cyan); border-color: var(--cyan); }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function getVisibleTaskCards() {
    var board = document.getElementById('task-board');
    if (!board) return [];
    return Array.from(board.querySelectorAll('.task-card'));
  }

  function clearHighlight() {
    var cards = getVisibleTaskCards();
    cards.forEach(function(c) { c.classList.remove('shortcut-highlight'); });
  }

  function highlightCard(idx) {
    var cards = getVisibleTaskCards();
    clearHighlight();
    if (idx >= 0 && idx < cards.length) {
      highlightedIdx = idx;
      cards[idx].classList.add('shortcut-highlight');
      cards[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function showOverlay() {
    if (document.getElementById('shortcuts-overlay')) return;
    overlayVisible = true;
    var shortcuts = [
      ['1-9', 'Select task by number'],
      ['j / Arrow Down', 'Next task'],
      ['k / Arrow Up', 'Previous task'],
      ['Enter', 'Expand / collapse task'],
      ['Escape', 'Close modal / overlay / clear'],
      ['[ / ]', 'Previous / next team'],
      ['/', 'Focus search'],
      ['e', 'Export report'],
      ['?', 'Toggle this help']
    ];
    var rows = shortcuts.map(function(s) {
      return '<div class="row"><kbd>' + s[0] + '</kbd><span class="desc">' + s[1] + '</span></div>';
    }).join('');
    var overlay = document.createElement('div');
    overlay.id = 'shortcuts-overlay';
    overlay.innerHTML = '<div class="panel"><h2>Keyboard Shortcuts</h2>' + rows + '</div>';
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) hideOverlay();
    });
    document.body.appendChild(overlay);
  }

  function hideOverlay() {
    overlayVisible = false;
    var el = document.getElementById('shortcuts-overlay');
    if (el) el.remove();
  }

  function toggleOverlay() {
    if (overlayVisible) hideOverlay();
    else showOverlay();
  }

  function switchTeam(dir) {
    var select = document.getElementById('team-select');
    if (!select) return;
    var opts = Array.from(select.options).filter(function(o) { return !o.disabled; });
    var curIdx = opts.findIndex(function(o) { return o.selected; });
    var next = curIdx + dir;
    if (next < 0) next = opts.length - 1;
    if (next >= opts.length) next = 0;
    opts[next].selected = true;
    select.dispatchEvent(new Event('change'));
  }

  function isInputFocused() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }

  function handleKeydown(e) {
    var key = e.key;

    // Escape always works
    if (key === 'Escape') {
      if (overlayVisible) { hideOverlay(); e.preventDefault(); return; }
      var modal = document.getElementById('agent-modal');
      if (modal && modal.style.display !== 'none') { modal.style.display = 'none'; e.preventDefault(); return; }
      var search = document.getElementById('feed-search');
      if (search && document.activeElement === search) { search.blur(); search.value = ''; e.preventDefault(); return; }
      clearHighlight();
      highlightedIdx = -1;
      return;
    }

    // Don't capture when input focused (except Escape handled above)
    if (isInputFocused()) return;

    if (key === '?') {
      e.preventDefault();
      toggleOverlay();
      return;
    }

    if (overlayVisible) return;

    if (key === '/') {
      e.preventDefault();
      var search = document.getElementById('feed-search');
      if (search) {
        search.style.display = 'block';
        search.focus();
      }
      return;
    }

    if (key === 'e') {
      e.preventDefault();
      var btn = document.getElementById('export-btn');
      if (btn) btn.click();
      return;
    }

    if (key === '[') {
      e.preventDefault();
      switchTeam(-1);
      return;
    }

    if (key === ']') {
      e.preventDefault();
      switchTeam(1);
      return;
    }

    // Number keys 1-9: select task
    var num = parseInt(key, 10);
    if (num >= 1 && num <= 9) {
      e.preventDefault();
      var cards = getVisibleTaskCards();
      var idx = num - 1;
      if (idx < cards.length) {
        highlightCard(idx);
        cards[idx].click();
      }
      return;
    }

    // j/k or arrow navigation
    if (key === 'j' || key === 'ArrowDown') {
      e.preventDefault();
      var cards = getVisibleTaskCards();
      if (cards.length === 0) return;
      var next = highlightedIdx + 1;
      if (next >= cards.length) next = 0;
      highlightCard(next);
      return;
    }

    if (key === 'k' || key === 'ArrowUp') {
      e.preventDefault();
      var cards = getVisibleTaskCards();
      if (cards.length === 0) return;
      var prev = highlightedIdx - 1;
      if (prev < 0) prev = cards.length - 1;
      highlightCard(prev);
      return;
    }

    if (key === 'Enter') {
      e.preventDefault();
      var cards = getVisibleTaskCards();
      if (highlightedIdx >= 0 && highlightedIdx < cards.length) {
        cards[highlightedIdx].click();
      }
      return;
    }
  }

  Dashboard.registerFeature('shortcuts', {
    init: function() {
      injectCSS();
      document.addEventListener('keydown', handleKeydown);

      var btn = document.createElement('button');
      btn.id = 'shortcuts-help-btn';
      btn.textContent = '?';
      btn.title = 'Keyboard shortcuts';
      btn.addEventListener('click', toggleOverlay);
      document.body.appendChild(btn);
    },

    render: function() {
      // Reset highlight index if the board re-rendered and cards changed
      // Keep the index valid
      var cards = getVisibleTaskCards();
      if (highlightedIdx >= cards.length) {
        highlightedIdx = cards.length - 1;
      }
      if (highlightedIdx >= 0 && cards[highlightedIdx]) {
        cards[highlightedIdx].classList.add('shortcut-highlight');
      }
    }
  });
})();
