/* Opt-in local benchmarks measure rendered frames, without creating another animation loop. */
(() => {
  'use strict';
  function summarize(intervals) {
    if (!intervals.length) return { frames: 0, averageFps: null, low1PercentFps: null };
    const slowest = [...intervals].sort((a, b) => b - a).slice(0, Math.ceil(intervals.length * .01));
    return {
      frames: intervals.length,
      averageFps: 1000 * intervals.length / intervals.reduce((sum, ms) => sum + ms, 0),
      low1PercentFps: 1000 * slowest.length / slowest.reduce((sum, ms) => sum + ms, 0)
    };
  }
  const api = window.IntroPerformance = {
    summarize,
    create(intro) {
      if (!intro.benchmark) return null;
      const phases = new Map();
      let finished = false;
      return {
        begin(name, timestamp) { phases.set(name, { previous: timestamp, intervals: [] }); },
        paint(name, timestamp) {
          const phase = phases.get(name);
          if (!phase || finished) return;
          const elapsed = timestamp - phase.previous;
          if (elapsed > 0) phase.intervals.push(elapsed);
          phase.previous = timestamp;
        },
        finish(status) {
          if (finished) return;
          finished = true;
          const result = {
            status,
            viewport: [innerWidth, innerHeight],
            dpr: window.devicePixelRatio || 1,
            browser: window.navigator.userAgent,
            phases: Object.fromEntries([...phases].map(([name, phase]) => [name, summarize(phase.intervals)]))
          };
          api.lastResult = result;
          const report = document.createElement('aside');
          report.className = 'intro-performance';
          const format = fps => fps === null ? 'n/a' : fps.toFixed(1);
          report.textContent = `Intro benchmark (${status})\n` + Object.entries(result.phases).map(([name, metrics]) =>
            `${name}: average ${format(metrics.averageFps)} fps | 1% low ${format(metrics.low1PercentFps)} fps | ${metrics.frames} intervals`
          ).join('\n');
          document.body.append(report);
          console.info('Intro benchmark', result);
        }
      };
    }
  };
})();
