(function() {
  Dashboard.registerFeature('timeline', {
    init: function() {
      var style = document.createElement('style');
      style.textContent = [
        '.timeline-wrap { flex: 1; min-width: 0; overflow: hidden; }',
        '.timeline-title {',
        '  font-size: 11px; font-weight: 700; text-transform: uppercase;',
        '  letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 6px;',
        '}',
        '.tl-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 10px; overflow: hidden; font-size: 11px; }',
        '.tl-table th { text-align: left; padding: 6px 10px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); }',
        '.tl-row { border-bottom: 1px solid var(--border-subtle); }',
        '.tl-row:last-child { border-bottom: none; }',
        '.tl-row:hover { background: rgba(255,255,255,0.02); }',
        '.tl-label { padding: 5px 10px; white-space: nowrap; font-family: "SF Mono", monospace; color: var(--text-muted); width: 160px; min-width: 160px; }',
        '.tl-label .tl-id { color: var(--text-primary); font-weight: 600; }',
        '.tl-bar-cell { padding: 5px 10px; position: relative; }',
        '.tl-bar-track { position: relative; height: 18px; border-radius: 4px; background: rgba(255,255,255,0.03); overflow: visible; }',
        '.tl-bar { position: absolute; top: 0; height: 100%; border-radius: 4px; display: flex; align-items: center; padding: 0 6px; font-size: 9px; font-family: "SF Mono", monospace; color: white; font-weight: 500; min-width: 18px; transition: width 0.5s ease; }',
        '.tl-bar.in-progress::after { content: ""; position: absolute; right: 0; top: 0; width: 4px; height: 100%; border-radius: 0 4px 4px 0; animation: tl-pulse 1.5s ease-in-out infinite; }',
        '@keyframes tl-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }',
        '.tl-dur { font-size: 9px; font-family: "SF Mono", monospace; color: var(--text-muted); margin-left: 6px; white-space: nowrap; position: absolute; top: 50%; transform: translateY(-50%); }',
        '.tl-axis { display: flex; justify-content: space-between; padding: 3px 10px 3px 170px; font-size: 8px; font-family: "SF Mono", monospace; color: var(--text-muted); border-top: 1px solid var(--border-subtle); }',
      ].join('\n');
      document.head.appendChild(style);
    },

    render: function(team) {
      var vizPanel = document.getElementById('viz-panel');
      if (!vizPanel) return;

      var wrap = document.getElementById('timeline-container');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'timeline-container';
        wrap.className = 'timeline-wrap';
        vizPanel.appendChild(wrap);
      }

      var tasks = team.tasks || [];
      var inboxes = team.inboxes || {};
      var members = Dashboard.getAllMembers(team);

      if (tasks.length === 0) {
        wrap.innerHTML = '<div class="timeline-title">Task Timeline</div><div style="color:var(--text-muted);font-size:12px;padding:16px;">No tasks yet</div>';
        return;
      }

      var now = Date.now();
      var taskTimes = [];
      var globalMin = Infinity, globalMax = -Infinity;

      for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        var startTime = null, endTime = null;

        // Scan inboxes for timing
        for (var inboxOwner in inboxes) {
          var msgs = inboxes[inboxOwner];
          for (var m = 0; m < msgs.length; m++) {
            var msg = msgs[m];
            if (!msg.timestamp) continue;
            var ts = new Date(msg.timestamp).getTime();
            if (isNaN(ts)) continue;
            try {
              var parsed = JSON.parse(msg.text || '');
              if (parsed.type === 'task_assignment' && String(parsed.taskId) === String(task.id)) {
                if (startTime === null || ts < startTime) startTime = ts;
              }
            } catch(e) {
              if (msg.from === task.owner && task.owner) {
                if (startTime === null || ts < startTime) startTime = ts;
              }
            }
          }
        }

        if (task.status === 'completed' && task.owner) {
          for (var io in inboxes) {
            var ms = inboxes[io];
            for (var mi = ms.length - 1; mi >= 0; mi--) {
              var mm = ms[mi];
              if (mm.from === task.owner && mm.timestamp) {
                var ets = new Date(mm.timestamp).getTime();
                if (!isNaN(ets) && (endTime === null || ets > endTime)) endTime = ets;
              }
            }
          }
        }

        if (task.status === 'in_progress') endTime = now;
        if (startTime !== null) {
          if (endTime === null) endTime = startTime + 2000;
          taskTimes.push({ task: task, start: startTime, end: endTime, inProgress: task.status === 'in_progress' });
          if (startTime < globalMin) globalMin = startTime;
          if (endTime > globalMax) globalMax = endTime;
        } else if (task.status === 'pending' || task.status === 'completed') {
          // No timing data — show as zero-width at the end
          taskTimes.push({ task: task, start: null, end: null, inProgress: false });
        }
      }

      var timeSpan = globalMax - globalMin;
      if (timeSpan <= 0) timeSpan = 1000;

      function formatDur(ms) {
        var sec = Math.floor(ms / 1000);
        if (sec < 60) return sec + 's';
        var min = Math.floor(sec / 60);
        if (min < 60) return min + 'm ' + (sec % 60) + 's';
        var hr = Math.floor(min / 60);
        return hr + 'h ' + (min % 60) + 'm';
      }

      function formatRel(ms) {
        var sec = Math.floor(ms / 1000);
        if (sec < 60) return 'T+' + sec + 's';
        var min = Math.floor(sec / 60);
        if (min < 60) return 'T+' + min + 'm';
        var hr = Math.floor(min / 60);
        var rm = min % 60;
        return 'T+' + hr + 'h' + (rm > 0 ? rm + 'm' : '');
      }

      // Build HTML table
      var html = '<div class="timeline-title">Task Timeline</div>';
      html += '<table class="tl-table"><thead><tr><th>Task</th><th style="width:100%">Duration</th></tr></thead><tbody>';

      for (var r = 0; r < taskTimes.length; r++) {
        var tt = taskTimes[r];
        var tk = tt.task;
        var ownerMember = members.find(function(mm) { return mm.name === tk.owner; });
        var barColor = ownerMember ? Dashboard.agentColor(ownerMember) : '#6b7280';

        // Truncate subject
        var subj = tk.subject || '';
        if (subj.length > 22) subj = subj.substring(0, 20) + '..';

        html += '<tr class="tl-row">';
        html += '<td class="tl-label"><span class="tl-id">#' + tk.id + '</span> ' + Dashboard.escHtml(subj) + '</td>';
        html += '<td class="tl-bar-cell"><div class="tl-bar-track">';

        if (tt.start !== null) {
          var leftPct = ((tt.start - globalMin) / timeSpan * 100).toFixed(1);
          var widthPct = Math.max(2, ((tt.end - tt.start) / timeSpan * 100)).toFixed(1);
          var dur = formatDur(tt.end - tt.start);
          var ipClass = tt.inProgress ? ' in-progress' : '';

          html += '<div class="tl-bar' + ipClass + '" style="left:' + leftPct + '%; width:' + widthPct + '%; background:' + barColor + '; opacity:0.75; --bar-color:' + barColor + ';">';
          // Only show duration inside bar if it's wide enough
          if (parseFloat(widthPct) > 8) html += dur;
          html += '</div>';
          // Duration label outside if bar is narrow
          if (parseFloat(widthPct) <= 8) {
            var durLeft = (parseFloat(leftPct) + parseFloat(widthPct) + 0.5);
            html += '<span class="tl-dur" style="left:' + durLeft + '%">' + dur + '</span>';
          }
        } else {
          html += '<div style="padding:2px 0; font-size:9px; color:var(--text-muted);">No timing data</div>';
        }

        html += '</div></td></tr>';
      }

      html += '</tbody></table>';

      // Time axis
      var tickCount = 6;
      html += '<div class="tl-axis">';
      for (var t = 0; t <= tickCount; t++) {
        html += '<span>' + formatRel(t / tickCount * timeSpan) + '</span>';
      }
      html += '</div>';

      wrap.innerHTML = html;
    }
  });
})();
