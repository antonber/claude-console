(function() {
  var prevAllDone = false;
  var canvas = null;
  var ctx = null;
  var particles = [];
  var animating = false;
  var animStart = 0;
  var DURATION = 3000;

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticles(team) {
    var members = Dashboard.getAllMembers(team);
    var colors = members.map(function(m) { return Dashboard.agentColor(m); });
    if (colors.length === 0) colors = ['#34d399', '#22d3ee', '#fbbf24', '#a78bfa', '#f472b6', '#60a5fa'];

    particles = [];
    for (var i = 0; i < 180; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        w: Math.random() * 8 + 4,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 2,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.15,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
        opacity: 1
      });
    }
  }

  function animate(now) {
    if (!animating) return;

    var elapsed = now - animStart;
    var progress = Math.min(elapsed / DURATION, 1);
    var fadeStart = 0.7;
    var globalAlpha = progress > fadeStart ? 1 - ((progress - fadeStart) / (1 - fadeStart)) : 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx;
      p.vy += 0.08;
      p.y += p.vy;
      p.rot += p.rotV;

      ctx.save();
      ctx.globalAlpha = globalAlpha * p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      animating = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function fire(team) {
    if (animating) return;
    resize();
    createParticles(team);
    animating = true;
    animStart = performance.now();
    requestAnimationFrame(animate);
  }

  Dashboard.registerFeature('confetti', {
    init: function() {
      canvas = document.getElementById('confetti-canvas');
      if (canvas) {
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
      }
    },

    render: function(team) {
      var tasks = team.tasks || [];
      if (tasks.length === 0) {
        prevAllDone = false;
        return;
      }

      var allDone = tasks.every(function(t) { return t.status === 'completed'; });

      if (allDone && !prevAllDone) {
        fire(team);
      }

      prevAllDone = allDone;
    }
  });
})();
