(function() {
  Dashboard.registerFeature('progress-bar', {
    init: function() {
      var style = document.createElement('style');
      style.textContent = [
        '#progress-bar-container { padding: 8px 0 4px 0; }',
        '#progress-bar-label { font-size: 11px; font-family: "SF Mono", monospace; color: var(--text-muted); text-align: right; margin-bottom: 3px; }',
        '#progress-bar-track { width: 100%; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.05); display: flex; overflow: hidden; }',
        '#progress-bar-track .bar-segment { height: 100%; transition: width 0.5s ease; }',
      ].join('\n');
      document.head.appendChild(style);
    },

    render: function(team) {
      var slot = document.getElementById('progress-bar-slot');
      if (!slot) return;

      var tasks = team.tasks || [];
      var total = tasks.length;
      if (total === 0) {
        slot.innerHTML = '';
        return;
      }

      var counts = { completed: 0, in_progress: 0, pending: 0, blocked: 0 };
      for (var i = 0; i < tasks.length; i++) {
        var col = Dashboard.classifyTask(tasks[i], tasks);
        if (counts.hasOwnProperty(col)) counts[col]++;
      }

      var pct = Math.round((counts.completed / total) * 100);

      var segments = [
        { key: 'completed', color: 'var(--green)', count: counts.completed },
        { key: 'in_progress', color: 'var(--cyan)', count: counts.in_progress },
        { key: 'pending', color: 'var(--amber)', count: counts.pending },
        { key: 'blocked', color: 'var(--red)', count: counts.blocked },
      ];

      var barHtml = '';
      for (var j = 0; j < segments.length; j++) {
        var s = segments[j];
        var w = (s.count / total) * 100;
        if (w > 0) {
          barHtml += '<div class="bar-segment" style="width:' + w + '%;background:' + s.color + ';"></div>';
        }
      }

      slot.innerHTML =
        '<div id="progress-bar-container">' +
          '<div id="progress-bar-label">' + pct + '% complete (' + counts.completed + '/' + total + ')</div>' +
          '<div id="progress-bar-track">' + barHtml + '</div>' +
        '</div>';
    }
  });
})();
