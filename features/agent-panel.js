(function() {
  Dashboard.registerFeature('agent-panel', {
    init: function() {
      var style = document.createElement('style');
      style.textContent = [
        '#agent-modal { transition: opacity 0.2s ease; }',
        '#agent-modal.ap-visible { opacity: 1; }',
        '#agent-modal.ap-hidden { opacity: 0; }',
        '.ap-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }',
        '.ap-color-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }',
        '.ap-name { font-size: 20px; font-weight: 700; font-family: "SF Mono", "Fira Code", monospace; }',
        '.ap-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }',
        '.ap-section { margin-bottom: 16px; }',
        '.ap-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 8px; }',
        '.ap-task-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid var(--border-subtle); }',
        '.ap-task-row:last-child { border-bottom: none; }',
        '.ap-msg { padding: 8px 12px; border-radius: 8px; margin-bottom: 4px; font-size: 13px; border-left: 3px solid var(--msg-color, var(--cyan)); background: rgba(17,24,39,0.6); }',
        '.ap-msg .ap-msg-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }',
        '.ap-msg .ap-msg-time { color: var(--text-muted); font-size: 11px; font-family: "SF Mono", monospace; }',
        '.ap-msg .ap-msg-text { font-size: 12px; color: var(--text-primary); opacity: 0.85; }',
        '.ap-msg.ap-system { opacity: 0.5; }',
        '.ap-close { position: absolute; top: 16px; right: 16px; background: none; border: 1px solid var(--border-subtle); color: var(--text-muted); width: 28px; height: 28px; border-radius: 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; }',
        '.ap-close:hover { color: var(--text-primary); border-color: var(--border-glow); }'
      ].join('\n');
      document.head.appendChild(style);

      var modal = document.getElementById('agent-modal');
      modal.addEventListener('click', function(e) {
        if (e.target === modal) {
          closeModal();
        }
      });

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
          closeModal();
        }
      });

      function closeModal() {
        modal.classList.remove('ap-visible');
        modal.classList.add('ap-hidden');
        setTimeout(function() {
          modal.style.display = 'none';
          modal.classList.remove('ap-hidden');
        }, 200);
      }

      window._agentPanelClose = closeModal;
    },

    render: function(team) {
      var cards = document.querySelectorAll('#agent-roster .agent-card');
      var members = Dashboard.getAllMembers(team);

      cards.forEach(function(card, idx) {
        if (idx >= members.length) return;
        var member = members[idx];
        card.style.cursor = 'pointer';
        card.onclick = function() {
          openAgentModal(member, team);
        };
      });
    }
  });

  function openAgentModal(member, team) {
    var modal = document.getElementById('agent-modal');
    var content = document.getElementById('agent-modal-content');
    var color = Dashboard.agentColor(member);
    var status = Dashboard.deriveAgentStatus(member.name, team);
    var tasks = team.tasks || [];
    var ownedTasks = tasks.filter(function(t) { return t.owner === member.name; });

    var statusLabels = {
      active: 'Active', idle: 'Idle', working: 'Working',
      shutdown: 'Shut down', initializing: 'Initializing'
    };
    var statusBadgeClass = {
      active: 'badge-in_progress', idle: 'badge-pending', working: 'badge-in_progress',
      shutdown: 'badge-blocked', initializing: 'badge-pending'
    };

    var currentTask = tasks.find(function(t) { return t.owner === member.name && t.status === 'in_progress'; });

    // Collect all messages sent and received by this agent
    var messages = [];
    var inboxes = team.inboxes || {};

    // Messages received (in their inbox)
    var inbox = inboxes[member.name] || [];
    inbox.forEach(function(msg) {
      messages.push({ from: msg.from, to: member.name, text: msg.text, summary: msg.summary, timestamp: msg.timestamp, color: msg.color, direction: 'received' });
    });

    // Messages sent (scan all other inboxes)
    for (var inboxOwner in inboxes) {
      if (inboxOwner === member.name) continue;
      inboxes[inboxOwner].forEach(function(msg) {
        if (msg.from === member.name) {
          messages.push({ from: member.name, to: inboxOwner, text: msg.text, summary: msg.summary, timestamp: msg.timestamp, color: msg.color, direction: 'sent' });
        }
      });
    }

    // Sort by timestamp
    messages.sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });

    // Build HTML
    var html = '';
    html += '<button class="ap-close" onclick="window._agentPanelClose()">&times;</button>';

    // Header
    html += '<div class="ap-header">';
    html += '<div class="ap-color-dot" style="background: ' + color + ';"></div>';
    html += '<div>';
    html += '<div class="ap-name" style="color: ' + color + ';">' + Dashboard.escHtml(member.name) + '</div>';
    html += '<div class="ap-meta">';
    html += Dashboard.escHtml(member.agentType || 'agent');
    if (member.model) html += ' &middot; ' + Dashboard.escHtml(member.model);
    html += '</div>';
    html += '</div>';
    html += '<span class="badge ' + (statusBadgeClass[status] || 'badge-pending') + '" style="margin-left: auto;">' + (statusLabels[status] || status) + '</span>';
    html += '</div>';

    // Current task
    if (currentTask) {
      html += '<div class="ap-section">';
      html += '<div class="ap-section-title">Current Task</div>';
      html += '<div style="background: rgba(34,211,238,0.08); border: 1px solid rgba(34,211,238,0.2); border-radius: 8px; padding: 10px;">';
      html += '<div class="text-sm font-semibold">#' + Dashboard.escHtml(String(currentTask.id)) + ' &mdash; ' + Dashboard.escHtml(currentTask.subject || '') + '</div>';
      if (currentTask.activeForm) {
        html += '<div class="text-xs mt-1" style="color: var(--cyan);">' + Dashboard.escHtml(currentTask.activeForm) + '</div>';
      }
      html += '</div>';
      html += '</div>';
    }

    // All owned tasks
    if (ownedTasks.length > 0) {
      html += '<div class="ap-section">';
      html += '<div class="ap-section-title">Assigned Tasks (' + ownedTasks.length + ')</div>';
      ownedTasks.forEach(function(t) {
        var cls = Dashboard.classifyTask(t, tasks);
        var badgeCls = 'badge-' + cls;
        html += '<div class="ap-task-row">';
        html += '<span class="font-mono text-xs" style="color: var(--text-muted);">#' + Dashboard.escHtml(String(t.id)) + '</span>';
        html += '<span class="text-sm" style="flex: 1;">' + Dashboard.escHtml(t.subject || '') + '</span>';
        html += '<span class="badge ' + badgeCls + '">' + cls.replace('_', ' ') + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Message history
    html += '<div class="ap-section">';
    html += '<div class="ap-section-title">Message History (' + messages.length + ')</div>';
    if (messages.length === 0) {
      html += '<div class="text-xs" style="color: var(--text-muted);">No messages yet</div>';
    } else {
      messages.forEach(function(msg) {
        var isSystem = false;
        var displayText = msg.summary || '';
        try {
          var parsed = JSON.parse(msg.text);
          isSystem = true;
          displayText = displayText || '[' + parsed.type + ']';
        } catch(e) {
          if (!displayText) displayText = (msg.text || '').substring(0, 300);
        }

        var msgColor = color;
        if (msg.direction === 'received') {
          var senderMember = Dashboard.getAllMembers(team).find(function(m) { return m.name === msg.from; });
          if (senderMember) msgColor = Dashboard.agentColor(senderMember);
        }

        var time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
        var arrow = msg.direction === 'sent' ? msg.from + ' &rarr; ' + msg.to : msg.from + ' &rarr; ' + msg.to;

        html += '<div class="ap-msg' + (isSystem ? ' ap-system' : '') + '" style="--msg-color: ' + msgColor + ';">';
        html += '<div class="ap-msg-meta">';
        html += '<span class="status-dot" style="background: ' + msgColor + '; width: 6px; height: 6px;"></span>';
        html += '<span class="font-mono text-xs font-semibold" style="color: ' + msgColor + ';">' + Dashboard.escHtml(msg.from || '?') + '</span>';
        html += '<span class="text-xs" style="color: var(--text-muted);">&rarr; ' + Dashboard.escHtml(msg.to) + '</span>';
        html += '<span class="ap-msg-time" style="margin-left: auto;">' + time + '</span>';
        html += '</div>';
        html += '<div class="ap-msg-text">' + Dashboard.escHtml(displayText) + '</div>';
        html += '</div>';
      });
    }
    html += '</div>';

    content.innerHTML = html;
    content.style.position = 'relative';
    modal.style.display = 'block';
    // Trigger animation
    modal.classList.remove('ap-hidden');
    requestAnimationFrame(function() {
      modal.classList.add('ap-visible');
    });
  }
})();
