(function() {
  var prevTaskStatuses = {};
  var prevAgentNames = [];
  var prevAgentStatuses = {};
  var prevAllDone = false;
  var initialized = false;

  var colorEmojis = {
    green: '\uD83D\uDFE2', blue: '\uD83D\uDD35', yellow: '\uD83D\uDFE1', purple: '\uD83D\uDFE3',
    red: '\uD83D\uDD34', cyan: '\uD83D\uDD35', pink: '\uD83D\uDFE3', orange: '\uD83D\uDFE0',
    teal: '\uD83D\uDFE2', indigo: '\uD83D\uDFE3', lime: '\uD83D\uDFE2', rose: '\uD83D\uDD34'
  };

  function getColorEmoji(member) {
    if (member.color && colorEmojis[member.color]) return colorEmojis[member.color];
    return '\uD83D\uDD35';
  }

  function sendNotification(title, body) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (document.hasFocus()) return;

    try {
      var n = new Notification(title, {
        body: body,
        icon: undefined,
        silent: true
      });
      n.onclick = function() {
        window.focus();
        n.close();
      };
    } catch(e) {
      // Notification creation can fail in some contexts
    }
  }

  Dashboard.registerFeature('notifications', {
    init: function() {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    },

    render: function(team) {
      var tasks = team.tasks || [];
      var members = Dashboard.getAllMembers(team);

      // Build current state
      var currentTaskStatuses = {};
      tasks.forEach(function(t) {
        currentTaskStatuses[t.id] = t.status;
      });

      var currentAgentNames = members.map(function(m) { return m.name; });
      var currentAgentStatuses = {};
      members.forEach(function(m) {
        currentAgentStatuses[m.name] = Dashboard.deriveAgentStatus(m.name, team);
      });

      // Skip first render to avoid spam on load
      if (!initialized) {
        prevTaskStatuses = currentTaskStatuses;
        prevAgentNames = currentAgentNames.slice();
        prevAgentStatuses = currentAgentStatuses;
        prevAllDone = tasks.length > 0 && tasks.every(function(t) { return t.status === 'completed'; });
        initialized = true;
        return;
      }

      // Check for newly completed tasks
      tasks.forEach(function(t) {
        if (t.status === 'completed' && prevTaskStatuses[t.id] && prevTaskStatuses[t.id] !== 'completed') {
          sendNotification(
            'Task Completed',
            'Task #' + t.id + ' completed by ' + (t.owner || 'unknown')
          );
        }
      });

      // Check for new agents
      currentAgentNames.forEach(function(name) {
        if (prevAgentNames.indexOf(name) === -1) {
          var member = members.find(function(m) { return m.name === name; });
          var emoji = member ? getColorEmoji(member) : '\uD83D\uDD35';
          sendNotification(
            'Agent Joined',
            emoji + ' Agent \'' + name + '\' joined the team'
          );
        }
      });

      // Check for agent shutdowns
      members.forEach(function(m) {
        var currentStatus = currentAgentStatuses[m.name];
        var prevStatus = prevAgentStatuses[m.name];
        if (currentStatus === 'shutdown' && prevStatus && prevStatus !== 'shutdown') {
          var emoji = getColorEmoji(m);
          sendNotification(
            'Agent Shut Down',
            emoji + ' Agent \'' + m.name + '\' shut down'
          );
        }
      });

      // Check for all tasks done
      var allDone = tasks.length > 0 && tasks.every(function(t) { return t.status === 'completed'; });
      if (allDone && !prevAllDone) {
        sendNotification(
          'Mission Complete!',
          'All ' + tasks.length + ' tasks completed! \uD83C\uDF89'
        );
      }

      // Update previous state
      prevTaskStatuses = currentTaskStatuses;
      prevAgentNames = currentAgentNames.slice();
      prevAgentStatuses = currentAgentStatuses;
      prevAllDone = allDone;
    }
  });
})();
