(function() {
  var searchText = '';
  var agentFilter = {}; // agentName -> true/false (true = hidden)

  Dashboard.registerFeature('search-filter', {
    init: function() {
      var style = document.createElement('style');
      style.textContent = [
        '.sf-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }',
        '.sf-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; font-family: "SF Mono", monospace; }',
        '.sf-chip:hover { opacity: 0.9; }',
        '.sf-chip.sf-active { border-color: currentColor; }',
        '.sf-chip.sf-muted { opacity: 0.3; }',
        '.sf-chip .sf-dot { width: 6px; height: 6px; border-radius: 50%; }',
        '.sf-highlight { background: rgba(251,191,36,0.35); color: var(--text-primary); padding: 0 1px; border-radius: 2px; }',
        '#feed-search { display: inline-block !important; }'
      ].join('\n');
      document.head.appendChild(style);

      // Show the search input
      var searchInput = document.getElementById('feed-search');
      searchInput.style.display = 'inline-block';

      searchInput.addEventListener('input', function() {
        searchText = this.value.trim().toLowerCase();
        var team = Dashboard.getCurrentTeam();
        if (team) applyFilters(team);
      });
    },

    render: function(team) {
      ensureChips(team);
      applyFilters(team);
    }
  });

  function ensureChips(team) {
    var feedPanel = document.querySelector('.feed-panel');
    if (!feedPanel) return;

    var existing = document.getElementById('sf-agent-chips');
    if (existing) existing.remove();

    var members = Dashboard.getAllMembers(team);
    if (members.length === 0) return;

    var container = document.createElement('div');
    container.id = 'sf-agent-chips';
    container.className = 'sf-chips';

    members.forEach(function(m) {
      var color = Dashboard.agentColor(m);
      var chip = document.createElement('span');
      var hidden = agentFilter[m.name] === true;
      chip.className = 'sf-chip' + (hidden ? ' sf-muted' : ' sf-active');
      chip.style.color = color;
      chip.style.background = hidden ? 'transparent' : hexToRgba(color, 0.12);
      chip.innerHTML = '<span class="sf-dot" style="background:' + color + ';"></span>' + Dashboard.escHtml(m.name);
      chip.addEventListener('click', function() {
        agentFilter[m.name] = !agentFilter[m.name];
        var t = Dashboard.getCurrentTeam();
        if (t) {
          ensureChips(t);
          applyFilters(t);
        }
      });
      container.appendChild(chip);
    });

    var header = feedPanel.querySelector('.flex.items-center.justify-between.mb-2');
    if (header && header.nextSibling) {
      feedPanel.insertBefore(container, header.nextSibling);
    } else {
      feedPanel.insertBefore(container, feedPanel.querySelector('#activity-feed'));
    }
  }

  function applyFilters(team) {
    var feed = document.getElementById('activity-feed');
    if (!feed) return;

    var msgs = feed.querySelectorAll('.feed-msg');
    msgs.forEach(function(el) {
      // Extract from and to from the element
      var fromEl = el.querySelector('.font-mono.text-xs.font-semibold');
      var toEl = el.querySelectorAll('.text-xs')[0];
      var fromName = fromEl ? fromEl.textContent.trim() : '';
      var toText = '';
      // The "to" field is the element after fromEl with arrow
      var spans = el.querySelectorAll('.flex.items-center.gap-2.mb-1 > span');
      spans.forEach(function(s) {
        var txt = s.textContent.trim();
        if (txt.indexOf('\u2192') === 0 || txt.indexOf('→') === 0) {
          toText = txt.replace(/^[\u2192→]\s*/, '').trim();
        }
      });

      var show = true;

      // Agent filter: hide if the sender is filtered out
      if (agentFilter[fromName] === true) {
        show = false;
      }

      // Search text filter
      if (show && searchText) {
        var fullText = el.textContent.toLowerCase();
        if (fullText.indexOf(searchText) === -1) {
          show = false;
        }
      }

      el.style.display = show ? '' : 'none';

      // Highlight matching text
      if (show && searchText) {
        highlightEl(el.querySelector('.text-xs:last-child'), searchText);
      } else if (!searchText) {
        removeHighlights(el);
      }
    });
  }

  function highlightEl(el, term) {
    if (!el) return;
    // Remove old highlights first
    removeHighlights(el.parentNode);
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(function(node) {
      var text = node.textContent;
      var lower = text.toLowerCase();
      var idx = lower.indexOf(term);
      if (idx === -1) return;

      var frag = document.createDocumentFragment();
      var lastIdx = 0;
      while (idx !== -1) {
        if (idx > lastIdx) {
          frag.appendChild(document.createTextNode(text.substring(lastIdx, idx)));
        }
        var span = document.createElement('span');
        span.className = 'sf-highlight';
        span.textContent = text.substring(idx, idx + term.length);
        frag.appendChild(span);
        lastIdx = idx + term.length;
        idx = lower.indexOf(term, lastIdx);
      }
      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.substring(lastIdx)));
      }
      node.parentNode.replaceChild(frag, node);
    });
  }

  function removeHighlights(el) {
    if (!el) return;
    var highlights = el.querySelectorAll('.sf-highlight');
    highlights.forEach(function(h) {
      var parent = h.parentNode;
      parent.replaceChild(document.createTextNode(h.textContent), h);
      parent.normalize();
    });
  }

  function hexToRgba(hex, alpha) {
    // Handle named CSS vars or hex
    if (hex.indexOf('#') !== 0) return hex;
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
})();
