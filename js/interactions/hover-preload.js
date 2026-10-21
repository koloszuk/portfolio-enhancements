// Deduplicate transfers; retain only promises/state and let HTTP caching keep
// the bytes. No offscreen Image elements or persistent decoded-GIF cache.
export function createHoverPreloader({ backgroundLimit = 2, totalLimit = 3 } = {}) {
  const jobs = new Map();
  const backgroundCap = Math.max(1, Math.floor(backgroundLimit));
  const totalCap = Math.max(backgroundCap, Math.floor(totalLimit));
  let running = 0, backgroundRunning = 0, enabled = false, stopped = false, scheduled = false;
  function schedule() {
    if (!stopped && !scheduled) { scheduled = true; queueMicrotask(pump); }
  }
  function pump() {
    scheduled = false;
    if (stopped) return;
    // Map insertion order is the configured gallery order; hover jobs go first.
    const queued = [...jobs.values()].filter(j => j.state === 'queued')
      .sort((a, b) => Number(b.urgent) - Number(a.urgent));
    for (const job of queued) {
      if (running >= totalCap) break;
      if (!job.urgent && (!enabled || backgroundRunning >= backgroundCap)) continue;
      const background = !job.urgent;
      job.state = 'loading'; running++; if (background) backgroundRunning++;
      job.controller = new AbortController();
      fetch(job.url, {
        signal: job.controller.signal, credentials: 'omit', cache: 'force-cache',
        priority: background ? 'low' : 'high',
      }).then(response => {
        if (!response.ok) throw new Error(`GIF preload: ${response.status}`);
        // Consume the response so the browser can complete its normal cache entry.
        return response.arrayBuffer();
      }).then(() => { job.state = 'ready'; job.resolve(true); })
        .catch(() => {
          job.state = 'error'; job.resolve(false);
          // Hover may still load directly if fetch/CORS or the preload failed.
        }).finally(() => {
          running--; if (background) backgroundRunning--;
          schedule();
        });
    }
  }
  function request(url, urgent = false) {
    let job = jobs.get(url);
    if (!job) {
      let resolve;
      const promise = new Promise(yes => { resolve = yes; });
      job = { url, urgent, state: 'queued', promise, resolve };
      jobs.set(url, job);
    } else if (urgent) job.urgent = true;
    schedule();
    return job.promise;
  }
  return {
    request,
    setBackgroundEnabled(value) { enabled = value; schedule(); },
    destroy() {
      stopped = true;
      for (const job of jobs.values()) {
        job.controller?.abort(); job.resolve(false);
      }
      jobs.clear();
    },
  };
}
