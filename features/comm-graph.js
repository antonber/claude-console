(function() {
  Dashboard.registerFeature('comm-graph', {
    init: function() {
      var style = document.createElement('style');
      style.textContent = [
        '.comm-graph-wrap { flex: 0 0 280px; }',
        '.comm-graph-title {',
        '  font-size: 11px; font-weight: 700; text-transform: uppercase;',
        '  letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 6px;',
        '}',
        '.comm-graph-svg { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 10px; }',
      ].join('\n');
      document.head.appendChild(style);
    },

    render: function(team) {
      var vizPanel = document.getElementById('viz-panel');
      if (!vizPanel) return;

      var wrap = document.getElementById('comm-graph-container');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'comm-graph-container';
        wrap.className = 'comm-graph-wrap';
        vizPanel.insertBefore(wrap, vizPanel.firstChild);
      }

      var members = Dashboard.getAllMembers(team);
      var inboxes = team.inboxes || {};

      // Count messages between agent pairs (excluding system messages)
      var pairCounts = {};
      var maxCount = 0;
      for (var inboxOwner in inboxes) {
        var msgs = inboxes[inboxOwner];
        for (var m = 0; m < msgs.length; m++) {
          var msg = msgs[m];
          if (!msg.from) continue;
          var isSystem = false;
          try {
            var parsed = JSON.parse(msg.text || '');
            if (['idle_notification', 'shutdown_request', 'shutdown_approved',
                 'shutdown_response', 'task_assignment', 'plan_approval_request',
                 'plan_approval_response'].indexOf(parsed.type) !== -1) {
              isSystem = true;
            }
          } catch(e) {}
          if (isSystem) continue;
          var key = msg.from + '->' + inboxOwner;
          pairCounts[key] = (pairCounts[key] || 0) + 1;
          if (pairCounts[key] > maxCount) maxCount = pairCounts[key];
        }
      }

      var W = 280, H = 200;
      var cx = W / 2, cy = H / 2;
      var radius = Math.min(W, H) / 2 - 36;
      var nodeR = 10;
      var n = members.length;

      var positions = {};
      for (var i = 0; i < n; i++) {
        var angle = (2 * Math.PI * i / n) - Math.PI / 2;
        positions[members[i].name] = {
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle)
        };
      }

      var svg = '<svg class="comm-graph-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';

      svg += '<defs>';
      svg += '<marker id="cg-arrow" viewBox="0 0 8 6" refX="8" refY="3" markerWidth="6" markerHeight="4" orient="auto-start-reverse">';
      svg += '<path d="M0,0 L8,3 L0,6 Z" fill="var(--text-muted)" opacity="0.4"/>';
      svg += '</marker>';
      svg += '</defs>';

      // Draw curved edges
      var edgeIndex = {};
      for (var pk in pairCounts) {
        var pp = pk.split('->');
        var from = pp[0], to = pp[1];
        var pFrom = positions[from], pTo = positions[to];
        if (!pFrom || !pTo) continue;

        var count = pairCounts[pk];
        var thickness = maxCount > 0 ? Math.max(0.5, Math.min(3, (count / maxCount) * 3)) : 0.5;

        // Determine curve offset to avoid overlapping bidirectional lines
        var sortedKey = [from, to].sort().join('|');
        edgeIndex[sortedKey] = (edgeIndex[sortedKey] || 0) + 1;
        var curveDir = from < to ? 1 : -1;

        var dx = pTo.x - pFrom.x, dy = pTo.y - pFrom.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) continue;
        var shorten = nodeR + 4;
        var x1 = pFrom.x + (dx / dist) * shorten;
        var y1 = pFrom.y + (dy / dist) * shorten;
        var x2 = pTo.x - (dx / dist) * shorten;
        var y2 = pTo.y - (dy / dist) * shorten;

        // Curve control point perpendicular to the line
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        var nx = -dy / dist, ny = dx / dist;
        var bulge = 18 * curveDir;
        var cpx = mx + nx * bulge, cpy = my + ny * bulge;

        var fromMember = members.find(function(mm) { return mm.name === from; });
        var c1 = fromMember ? Dashboard.agentColor(fromMember) : 'var(--text-muted)';

        svg += '<path d="M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' Q' + cpx.toFixed(1) + ',' + cpy.toFixed(1) + ' ' + x2.toFixed(1) + ',' + y2.toFixed(1) + '"';
        svg += ' fill="none" stroke="' + c1 + '" stroke-width="' + thickness.toFixed(1) + '" opacity="0.25"';
        svg += ' marker-end="url(#cg-arrow)"/>';
      }

      // Draw nodes
      for (var j = 0; j < members.length; j++) {
        var member = members[j];
        var pos = positions[member.name];
        var color = Dashboard.agentColor(member);
        svg += '<circle cx="' + pos.x.toFixed(1) + '" cy="' + pos.y.toFixed(1) + '" r="' + nodeR + '"';
        svg += ' fill="' + color + '" opacity="0.8"/>';
        var labelY = pos.y + nodeR + 12;
        svg += '<text x="' + pos.x.toFixed(1) + '" y="' + labelY.toFixed(1) + '"';
        svg += ' text-anchor="middle" font-size="9" font-family="SF Mono, monospace" fill="var(--text-muted)">';
        svg += Dashboard.escHtml(member.name);
        svg += '</text>';
      }

      svg += '</svg>';
      wrap.innerHTML = '<div class="comm-graph-title">Communication Graph</div>' + svg;
    }
  });
})();
