// tools/load-testing/health-smoke.js
// Lightweight HTTP smoke/load probe against /api/health when full k6 isn’t available.
// Configuration: BASE_URL env var (default http://localhost:8080), VU (default 10), DURATION_SECONDS (default 30).

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const VU = Number(process.env.VU || 10);
const DURATION_SECONDS = Number(process.env.DURATION_SECONDS || 30);

async function worker(stopAt, metrics) {
  while (Date.now() < stopAt) {
    const start = performance.now();
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      const elapsed = performance.now() - start;
      metrics.count++;
      metrics.latencies.push(elapsed);
      if (!res.ok) metrics.failures++;
    } catch (err) {
      metrics.failures++;
    }
  }
}

(async () => {
  const metrics = { count: 0, failures: 0, latencies: [] };
  const stopAt = Date.now() + DURATION_SECONDS * 1000;
  const tasks = Array.from({ length: VU }, () => worker(stopAt, metrics));
  await Promise.all(tasks);

  const sorted = metrics.latencies.slice().sort((a, b) => a - b);
  const percentile = (p) => {
    if (!sorted.length) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  };
  const avg =
    sorted.length === 0
      ? 0
      : sorted.reduce((sum, v) => sum + v, 0) / sorted.length;

  console.log(
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        vu: VU,
        durationSeconds: DURATION_SECONDS,
        totalRequests: metrics.count,
        failures: metrics.failures,
        failureRate: metrics.count
          ? (metrics.failures / metrics.count).toFixed(4)
          : "0",
        latencyMs: {
          avg: Number(avg.toFixed(2)),
          p50: Number(percentile(50).toFixed(2)),
          p95: Number(percentile(95).toFixed(2)),
        },
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
})();
