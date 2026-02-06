(function() {
  var audioCtx = null;
  var muted = true;
  var prevTaskStatuses = {};
  var prevMessageCount = 0;
  var prevAllDone = false;
  var prevAgentStatuses = {};
  var initialized = false;

  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, duration, type, gainVal) {
    if (muted) return;
    var ctx = getCtx();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainVal || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  function soundTaskCompleted() {
    if (muted) return;
    playTone(520, 0.12, 'sine', 0.15);
    setTimeout(function() { playTone(680, 0.15, 'sine', 0.15); }, 100);
  }

  function soundNewMessage() {
    if (muted) return;
    playTone(880, 0.1, 'sine', 0.1);
  }

  function soundAllDone() {
    if (muted) return;
    var ctx = getCtx();
    var freqs = [523, 659, 784];
    freqs.forEach(function(f) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    });
  }

  function soundAgentShutdown() {
    if (muted) return;
    playTone(400, 0.15, 'sine', 0.12);
    setTimeout(function() { playTone(300, 0.2, 'sine', 0.12); }, 120);
  }

  function countMessages(team) {
    var count = 0;
    var inboxes = team.inboxes || {};
    for (var key in inboxes) {
      if (inboxes.hasOwnProperty(key)) {
        count += inboxes[key].length;
      }
    }
    return count;
  }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem('swarm-sounds-muted', muted ? '1' : '0');
    updateButton();
    if (!muted) {
      getCtx();
    }
  }

  function updateButton() {
    var btn = document.getElementById('sounds-mute-btn');
    if (!btn) return;
    btn.textContent = muted ? 'Unmute' : 'Mute';
    btn.classList.toggle('active', !muted);
  }

  Dashboard.registerFeature('sounds', {
    init: function() {
      var stored = localStorage.getItem('swarm-sounds-muted');
      muted = stored === '0' ? false : true;

      var style = document.createElement('style');
      style.textContent = '#sounds-mute-btn { margin-left: 4px; }';
      document.head.appendChild(style);

      var rawBtn = document.getElementById('toggle-raw');
      if (rawBtn && rawBtn.parentNode) {
        var btn = document.createElement('button');
        btn.id = 'sounds-mute-btn';
        btn.className = 'toggle-btn';
        btn.addEventListener('click', toggleMute);
        rawBtn.parentNode.insertBefore(btn, rawBtn.nextSibling);
        updateButton();
      }
    },

    render: function(team) {
      var tasks = team.tasks || [];

      if (!initialized) {
        tasks.forEach(function(t) { prevTaskStatuses[t.id] = t.status; });
        prevMessageCount = countMessages(team);
        var members = Dashboard.getAllMembers(team);
        members.forEach(function(m) {
          prevAgentStatuses[m.name] = Dashboard.deriveAgentStatus(m.name, team);
        });
        prevAllDone = tasks.length > 0 && tasks.every(function(t) { return t.status === 'completed'; });
        initialized = true;
        return;
      }

      // Detect newly completed tasks
      var newlyCompleted = false;
      tasks.forEach(function(t) {
        if (t.status === 'completed' && prevTaskStatuses[t.id] && prevTaskStatuses[t.id] !== 'completed') {
          newlyCompleted = true;
        }
        prevTaskStatuses[t.id] = t.status;
      });

      // Detect all tasks done
      var allDone = tasks.length > 0 && tasks.every(function(t) { return t.status === 'completed'; });
      if (allDone && !prevAllDone) {
        soundAllDone();
      } else if (newlyCompleted) {
        soundTaskCompleted();
      }
      prevAllDone = allDone;

      // Detect new messages
      var msgCount = countMessages(team);
      if (msgCount > prevMessageCount) {
        soundNewMessage();
      }
      prevMessageCount = msgCount;

      // Detect agent shutdown
      var members = Dashboard.getAllMembers(team);
      members.forEach(function(m) {
        var status = Dashboard.deriveAgentStatus(m.name, team);
        if (status === 'shutdown' && prevAgentStatuses[m.name] && prevAgentStatuses[m.name] !== 'shutdown') {
          soundAgentShutdown();
        }
        prevAgentStatuses[m.name] = status;
      });
    }
  });
})();
