(function() {
  Dashboard.registerFeature('elapsed-timers', {
    init: function() {
      var style = document.createElement('style');
      style.textContent = [
        '.elapsed-timer {',
        '  font-family: "SF Mono", "Fira Code", monospace;',
        '  font-size: 11px;',
        '  color: var(--text-muted);',
        '  margin-top: 4px;',
        '}',
      ].join('\n');
      document.head.appendChild(style);

      // Tick every second to update all timers
      setInterval(function() {
        var timers = document.querySelectorAll('.elapsed-timer[data-start-time]');
        var now = Date.now();
        for (var i = 0; i < timers.length; i++) {
          var start = parseInt(timers[i].getAttribute('data-start-time'), 10);
          if (isNaN(start)) continue;
          timers[i].textContent = formatElapsed(now - start);
        }
      }, 1000);

      function formatElapsed(ms) {
        var totalSec = Math.max(0, Math.floor(ms / 1000));
        var h = Math.floor(totalSec / 3600);
        var m = Math.floor((totalSec % 3600) / 60);
        var s = totalSec % 60;
        if (h > 0) {
          return h + 'h ' + String(m).padStart(2, '0') + 'm';
        }
        return m + 'm ' + String(s).padStart(2, '0') + 's';
      }
    },

    render: function(team) {
      var tasks = team.tasks || [];
      var inboxes = team.inboxes || {};
      var members = Dashboard.getAllMembers(team);

      // Build a map of start times for in-progress tasks
      var taskStartTimes = {};
      for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        if (task.status !== 'in_progress' || !task.owner) continue;
        var startTime = findTaskStartTime(task, inboxes);
        if (startTime) taskStartTimes[task.id] = startTime;
      }

      // Inject timers into task cards that are in-progress
      var taskCards = document.querySelectorAll('.task-card.status-in_progress');
      for (var j = 0; j < taskCards.length; j++) {
        var card = taskCards[j];
        // Already has a timer? skip
        if (card.querySelector('.elapsed-timer')) continue;
        // Extract task id from the card text
        var idSpan = card.querySelector('.font-mono.text-xs');
        if (!idSpan) continue;
        var idText = idSpan.textContent.replace('#', '').trim();
        var st = taskStartTimes[idText];
        if (!st) continue;
        var timerEl = document.createElement('div');
        timerEl.className = 'elapsed-timer';
        timerEl.setAttribute('data-start-time', String(st));
        timerEl.textContent = '0m 00s';
        card.appendChild(timerEl);
      }

      // Inject timers into working agent cards
      var agentCards = document.querySelectorAll('.agent-card.working');
      for (var k = 0; k < agentCards.length; k++) {
        var agentCard = agentCards[k];
        if (agentCard.querySelector('.elapsed-timer')) continue;
        // Find agent name from the card
        var nameEl = agentCard.querySelector('.font-mono.text-sm');
        if (!nameEl) continue;
        var agentName = nameEl.textContent.trim().replace(/\u2605/g, '').trim();
        // Find earliest in-progress task start time for this agent
        var earliest = null;
        for (var t = 0; t < tasks.length; t++) {
          if (tasks[t].owner === agentName && tasks[t].status === 'in_progress') {
            var ts = taskStartTimes[tasks[t].id];
            if (ts && (earliest === null || ts < earliest)) earliest = ts;
          }
        }
        if (!earliest) continue;
        var agentTimerEl = document.createElement('div');
        agentTimerEl.className = 'elapsed-timer';
        agentTimerEl.setAttribute('data-start-time', String(earliest));
        agentTimerEl.textContent = '0m 00s';
        agentCard.appendChild(agentTimerEl);
      }

      function findTaskStartTime(task, inboxes) {
        var earliest = null;
        // Scan all inbox messages for task-related assignments or messages from the owner
        for (var owner in inboxes) {
          var msgs = inboxes[owner];
          for (var m = 0; m < msgs.length; m++) {
            var msg = msgs[m];
            if (!msg.timestamp) continue;
            // Check for task_assignment referencing this task
            try {
              var parsed = JSON.parse(msg.text || '');
              if (parsed.type === 'task_assignment' && String(parsed.taskId) === String(task.id)) {
                var ts = new Date(msg.timestamp).getTime();
                if (!isNaN(ts) && (earliest === null || ts < earliest)) earliest = ts;
              }
            } catch(e) {
              // Not JSON; check if from task owner
              if (msg.from === task.owner) {
                var ts2 = new Date(msg.timestamp).getTime();
                if (!isNaN(ts2) && (earliest === null || ts2 < earliest)) earliest = ts2;
              }
            }
          }
        }
        return earliest;
      }
    }
  });
})();
