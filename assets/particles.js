(() => {
  const canvas = document.createElement('canvas');
  canvas.className = 'particle-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['103, 220, 239', '114, 139, 255', '193, 214, 255'];
  const lightSources = [
    { x: .16, y: .32, color: '30, 175, 235', phase: .4, speed: .22 },
    { x: .82, y: .52, color: '115, 93, 255', phase: 2.1, speed: .17 },
    { x: .55, y: .12, color: '47, 223, 229', phase: 4.2, speed: .2 }
  ];
  let width = 0;
  let height = 0;
  let ratio = 1;
  let particles = [];
  let frame = 0;
  let running = false;

  function makeParticle(randomY = true) {
    return {
      x: Math.random() * width,
      y: randomY ? Math.random() * height : height + 8,
      vx: (Math.random() - .5) * .22,
      vy: -.08 - Math.random() * .2,
      radius: .7 + Math.random() * 1.4,
      alpha: .16 + Math.random() * .42,
      color: colors[Math.floor(Math.random() * colors.length)],
      phase: Math.random() * Math.PI * 2,
      glint: Math.random() < .14
    };
  }

  function resize() {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.max(22, Math.min(66, Math.round(width * height / 15500)));
    particles = Array.from({ length: count }, () => makeParticle());
    draw(performance.now());
  }

  function draw(time = 0) {
    context.clearRect(0, 0, width, height);
    const seconds = time / 1000;

    // Slow, wide light pools create an ambient sci-fi glow behind the interface.
    context.save();
    context.globalCompositeOperation = 'screen';
    for (const source of lightSources) {
      const drift = reduceMotion ? 0 : Math.sin(seconds * source.speed + source.phase);
      const x = width * source.x + drift * width * .07;
      const y = height * source.y + Math.cos(seconds * source.speed * .72 + source.phase) * height * .045;
      const radius = Math.min(width, height) * .38;
      const breath = reduceMotion ? 1 : .78 + (Math.sin(seconds * .7 + source.phase) + 1) * .16;
      const glow = context.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(${source.color}, ${.2 * breath})`);
      glow.addColorStop(.22, `rgba(${source.color}, ${.075 * breath})`);
      glow.addColorStop(1, `rgba(${source.color}, 0)`);
      context.fillStyle = glow;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    // A faint diagonal beam drifts across the background like a scanner light.
    const sweep = reduceMotion ? .5 : (Math.sin(seconds * .16) + 1) / 2;
    const beamX = -width * .2 + sweep * width * 1.4;
    const beam = context.createLinearGradient(beamX - 110, height, beamX + 110, 0);
    beam.addColorStop(0, 'rgba(88, 184, 255, 0)');
    beam.addColorStop(.5, 'rgba(88, 184, 255, .045)');
    beam.addColorStop(1, 'rgba(148, 102, 255, 0)');
    context.fillStyle = beam;
    context.fillRect(0, 0, width, height);
    context.restore();

    for (const particle of particles) {
      if (!reduceMotion) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.y < -10) Object.assign(particle, makeParticle(false), { y: height + 8 });
        if (particle.x < -8) particle.x = width + 8;
        if (particle.x > width + 8) particle.x = -8;
      }
      context.beginPath();
      const twinkle = reduceMotion ? .72 : .35 + .65 * ((Math.sin(seconds * 1.4 + particle.phase) + 1) / 2);
      context.fillStyle = `rgba(${particle.color}, ${particle.alpha * twinkle})`;
      context.shadowColor = `rgba(${particle.color}, .65)`;
      context.shadowBlur = particle.radius > 1.45 ? 15 : 8;
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();

      if (particle.glint && twinkle > .94) {
        context.save();
        context.globalAlpha = (twinkle - .94) * 12;
        context.strokeStyle = `rgba(${particle.color}, .9)`;
        context.lineWidth = .7;
        context.shadowColor = `rgba(${particle.color}, .9)`;
        context.shadowBlur = 12;
        context.beginPath();
        context.moveTo(particle.x - 5, particle.y);
        context.lineTo(particle.x + 5, particle.y);
        context.moveTo(particle.x, particle.y - 5);
        context.lineTo(particle.x, particle.y + 5);
        context.stroke();
        context.restore();
      }
    }
    context.shadowBlur = 0;

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 112) {
          context.beginPath();
          context.strokeStyle = `rgba(97, 174, 219, ${(1 - distance / 112) * .12})`;
          context.lineWidth = .7;
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }
    }
    if (!reduceMotion && running) frame = window.requestAnimationFrame(draw);
  }

  function start() {
    if (running || reduceMotion || document.hidden) return;
    running = true;
    frame = window.requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    window.cancelAnimationFrame(frame);
  }

  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  resize();
  start();
})();
