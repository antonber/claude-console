(function() {
  Dashboard.registerFeature('export', {
    init: function() {
      var btn = document.getElementById('export-btn');
      btn.style.display = 'inline-block';

      btn.addEventListener('click', function() {
        var archive = Dashboard.getViewingArchive();

        if (archive && archive.data) {
          // Client-side export for archived teams
          var md = generateMarkdown(archive.data);
          downloadMarkdown(md, (archive.data.name || 'archive') + '-report.md');
        } else {
          // Live team: fetch from server
          var teamName = Dashboard.getSelectedTeam();
          if (!teamName) return;
          var a = document.createElement('a');
          a.href = '/api/export/' + encodeURIComponent(teamName);
          a.download = teamName + '-report.md';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      });
    },

    render: function(team) {
      var btn = document.getElementById('export-btn');
      var archive = Dashboard.getViewingArchive();
      var name = '';
      if (archive && archive.data) {
        name = archive.data.name || 'archive';
      } else {
        name = Dashboard.getSelectedTeam() || '';
      }
      btn.textContent = 'Export ' + name;
      btn.style.display = name ? 'inline-block' : 'none';
    }
  });

  function generateMarkdown(team) {
    var lines = [];
    var name = team.name || 'Swarm';
    lines.push('# ' + name + ' - Mission Report');
    lines.push('');
    if (team.archivedAt) {
      lines.push('*Archived: ' + new Date(team.archivedAt).toLocaleString() + '*');
      lines.push('');
    }

    // Members
    var members = Dashboard.getAllMembers(team);
    lines.push('## Agents (' + members.length + ')');
    lines.push('');
    members.forEach(function(m) {
      var status = Dashboard.deriveAgentStatus(m.name, team);
      lines.push('- **' + m.name + '** — ' + (m.agentType || 'agent') + ' [' + status + ']' + (m.model ? ' (' + m.model + ')' : ''));
    });
    lines.push('');

    // Tasks
    var tasks = team.tasks || [];
    lines.push('## Tasks (' + tasks.length + ')');
    lines.push('');
    var completed = tasks.filter(function(t) { return t.status === 'completed'; }).length;
    lines.push('Progress: ' + completed + '/' + tasks.length + ' completed');
    lines.push('');
    lines.push('| # | Task | Owner | Status |');
    lines.push('|---|------|-------|--------|');
    tasks.forEach(function(t) {
      var cls = Dashboard.classifyTask(t, tasks);
      lines.push('| ' + t.id + ' | ' + (t.subject || '') + ' | ' + (t.owner || '-') + ' | ' + cls.replace('_', ' ') + ' |');
    });
    lines.push('');

    // Messages
    var allMessages = [];
    for (var inboxOwner in (team.inboxes || {})) {
      var msgs = team.inboxes[inboxOwner];
      msgs.forEach(function(msg) {
        allMessages.push({ from: msg.from, to: inboxOwner, text: msg.text, summary: msg.summary, timestamp: msg.timestamp });
      });
    }
    allMessages.sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });

    // Deduplicate
    var seen = {};
    var unique = allMessages.filter(function(msg) {
      var key = (msg.from || '') + '|' + (msg.timestamp || '') + '|' + ((msg.text || '').substring(0, 80));
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    // Filter out system messages
    var humanMessages = unique.filter(function(msg) {
      try { JSON.parse(msg.text); return false; } catch(e) { return true; }
    });

    lines.push('## Activity Log (' + humanMessages.length + ' messages)');
    lines.push('');
    humanMessages.forEach(function(msg) {
      var time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
      var text = msg.summary || (msg.text || '').substring(0, 200);
      lines.push('- **[' + time + '] ' + (msg.from || '?') + ' -> ' + (msg.to || '?') + ':** ' + text);
    });

    return lines.join('\n');
  }

  function downloadMarkdown(content, filename) {
    var blob = new Blob([content], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
})();
