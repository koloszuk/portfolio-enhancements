import {
  ENABLE_FOREGROUND_PARTICLES, PARTICLE_COUNT, MIN_PARTICLE_SIZE, MAX_PARTICLE_SIZE,
  MIN_SCROLL_SPEED, MAX_SCROLL_SPEED, PARTICLE_COLOR, PARTICLE_BLEND_MODE,
  PARTICLE_SEED, ENABLE_PARTICLES_ON_MOBILE, PARTICLE_MOBILE_MAX_WIDTH,
} from '../config.js';

let active = null;

// Stable, jittered strata avoid initial clustering or an obvious dot lattice.
export function createParticleDefinitions(count = PARTICLE_COUNT, seed = PARTICLE_SEED) {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const rows = Array.from({ length: count }, (_, i) => i);
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows.map((row, i) => {
    const depth = random();
    return {
      type: 'DOT',
      x: (i + 0.15 + random() * 0.7) / count,
      phase: (row + 0.1 + random() * 0.8) / count,
      size: MIN_PARTICLE_SIZE + depth * (MAX_PARTICLE_SIZE - MIN_PARTICLE_SIZE),
      speed: MIN_SCROLL_SPEED + depth * (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED),
    };
  });
}

export function particlePosition(particle, scrollY, width, height) {
  const margin = 8;
  const period = height + particle.size + margin * 2;
  const distance = particle.phase * period - Math.max(0, scrollY) * particle.speed;
  // Positive modulo wraps in both directions, only beyond the visible edges.
  const y = ((distance % period) + period) % period - particle.size - margin;
  return { x: particle.x * Math.max(0, width - particle.size), y };
}

// Visual creation is independent of scroll math. Future SVG/image/Lottie renderers
// can return a node here without changing definitions or movement calculations.
function renderParticle(particle) {
  const node = document.createElement('span');
  node.className = 'dan-foreground-particle';
  node.style.width = node.style.height = `${particle.size}px`;
  return node;
}

function isEditor() {
  try {
    return /(?:^|\/)edit(?:\/|$)/.test(location.pathname) ||
      /(?:^|\/)edit(?:\/|$)/.test(window.top.location.pathname) ||
      !!document.querySelector('[contenteditable="true"]');
  } catch (_) { return true; }
}

export function mountForegroundParticles() {
  if (active) return active;
  if (!ENABLE_FOREGROUND_PARTICLES || isEditor()) return { destroy() {} };
  const definitions = createParticleDefinitions();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const data = matchMedia('(prefers-reduced-data: reduce)');
  const mobile = matchMedia(`(max-width: ${PARTICLE_MOBILE_MAX_WIDTH}px)`);
  const connection = navigator.connection;
  let overlay = null, visuals = [], width = 0, height = 0, frame = 0, stopped = false;

  function draw() {
    frame = 0;
    if (!overlay || stopped) return;
    const scroll = window.scrollY;
    for (let i = 0; i < definitions.length; i++) {
      const { x, y } = particlePosition(definitions[i], scroll, width, height);
      visuals[i].style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }
  function schedule() {
    if (overlay && !stopped && !frame) frame = requestAnimationFrame(draw);
  }
  function refresh() {
    if (stopped) return;
    const enabled = !isEditor() && !motion.matches && !data.matches && !connection?.saveData &&
      (ENABLE_PARTICLES_ON_MOBILE || !mobile.matches);
    width = window.innerWidth;
    height = window.innerHeight;
    if (!enabled) {
      cancelAnimationFrame(frame); frame = 0;
      overlay?.remove(); overlay = null; visuals = [];
      return;
    }
    if (!overlay && document.body) {
      overlay = document.createElement('div');
      overlay.className = 'dan-foreground-particles';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('--dan-particle-color', PARTICLE_COLOR);
      // Blend the whole transparent layer with the page, rather than blending
      // children inside an otherwise isolated fixed stacking context.
      overlay.style.mixBlendMode = PARTICLE_BLEND_MODE;
      visuals = definitions.map(renderParticle);
      overlay.append(...visuals);
      document.body.append(overlay);
    }
    // Resize/restore uses the current absolute scroll; it never resets the seed.
    schedule();
  }
  function destroy() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    overlay?.remove(); overlay = null; visuals = [];
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', refresh);
    window.removeEventListener('pageshow', refresh);
    for (const query of [motion, data, mobile]) query.removeEventListener('change', refresh);
    connection?.removeEventListener?.('change', refresh);
    active = null;
  }
  active = { destroy };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', refresh, { passive: true });
  window.addEventListener('pageshow', refresh);
  for (const query of [motion, data, mobile]) query.addEventListener('change', refresh);
  connection?.addEventListener?.('change', refresh);
  refresh();
  return active;
}
