import {
  ENABLE_FOREGROUND_PARTICLES, PARTICLE_COUNT, MIN_PARTICLE_SIZE, MAX_PARTICLE_SIZE,
  MIN_SCROLL_SPEED, MID_SCROLL_SPEED, MAX_SCROLL_SPEED, PARTICLE_COLOR, PARTICLE_BLEND_MODE,
  PARTICLE_SEED, ENABLE_PARTICLES_ON_MOBILE, PARTICLE_MOBILE_MAX_WIDTH,
  MIN_LIFETIME, MAX_LIFETIME, SHRINK_DURATION, SHRINK_TARGET_SCALE, SHRINK_EASING,
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
    const depth = count > 1 ? row / (count - 1) : 0.5;
    return {
      type: 'DOT',
      x: (i + 0.15 + random() * 0.7) / count,
      phase: (row + 0.1 + random() * 0.8) / count,
      size: MIN_PARTICLE_SIZE + depth * (MAX_PARTICLE_SIZE - MIN_PARTICLE_SIZE),
      speed: depth <= 0.5
        ? MIN_SCROLL_SPEED + depth * 2 * (MID_SCROLL_SPEED - MIN_SCROLL_SPEED)
        : MID_SCROLL_SPEED + (depth - 0.5) * 2 * (MAX_SCROLL_SPEED - MID_SCROLL_SPEED),
    };
  });
}

export function particlePosition(particle, scrollY, width, height) {
  const margin = 8;
  const period = height + particle.size + margin * 2;
  const distance = particle.phase * period - Math.max(0, scrollY) * particle.speed;
  // Positive modulo wraps in both directions, only beyond the visible edges.
  const y = ((distance % period) + period) % period - particle.size - margin;
  return { x: particle.x * Math.max(0, width - particle.size), y, cycle: Math.floor(distance / period) };
}

export function particleLifetime(index, cycle, seed = PARTICLE_SEED) {
  let hash = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(cycle, 0x85ebca6b)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  const fraction = ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
  return MIN_LIFETIME + fraction * (MAX_LIFETIME - MIN_LIFETIME);
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
  let lifetimes = [], geometryChanged = false;

  function resetLifetime(i, cycle) {
    const previous = lifetimes[i];
    clearTimeout(previous?.timer);
    previous?.animation?.cancel();
    visuals[i].style.scale = '1';
    return lifetimes[i] = { cycle, started: false };
  }
  function clearLifetimes() {
    for (const record of lifetimes) {
      clearTimeout(record.timer);
      record.animation?.cancel();
    }
    lifetimes = [];
  }

  function draw() {
    frame = 0;
    if (!overlay || stopped) return;
    const scroll = window.scrollY;
    for (let i = 0; i < definitions.length; i++) {
      const { x, y, cycle } = particlePosition(definitions[i], scroll, width, height);
      visuals[i].style.transform = `translate3d(${x}px, ${y}px, 0)`;
      let record = lifetimes[i];
      // A resize changes modulo geometry, not the particle's lifetime. Only a
      // real scroll-driven wrap (fully outside the viewport) restores its scale.
      if (!record) record = resetLifetime(i, cycle);
      else if (geometryChanged) record.cycle = cycle;
      else if (record.cycle !== cycle) record = resetLifetime(i, cycle);
      if (!record.started && y < height && y + definitions[i].size > 0) {
        record.started = true;
        record.timer = setTimeout(() => {
          if (stopped || lifetimes[i] !== record) return;
          const node = visuals[i];
          node.style.scale = String(SHRINK_TARGET_SCALE);
          try {
            record.animation = node.animate([
              { scale: 1 }, { scale: SHRINK_TARGET_SCALE },
            ], { duration: SHRINK_DURATION, easing: SHRINK_EASING, fill: 'forwards' });
          } catch (_) { /* Static scale is the fallback if individual-scale animation is unavailable. */ }
        }, particleLifetime(i, cycle));
      }
    }
    geometryChanged = false;
  }
  function schedule() {
    if (overlay && !stopped && !frame) frame = requestAnimationFrame(draw);
  }
  function refresh() {
    if (stopped) return;
    const enabled = !isEditor() && !motion.matches && !data.matches && !connection?.saveData &&
      (ENABLE_PARTICLES_ON_MOBILE || !mobile.matches);
    geometryChanged = geometryChanged || height !== window.innerHeight;
    width = window.innerWidth;
    height = window.innerHeight;
    if (!enabled) {
      cancelAnimationFrame(frame); frame = 0;
      clearLifetimes();
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
    clearLifetimes();
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
