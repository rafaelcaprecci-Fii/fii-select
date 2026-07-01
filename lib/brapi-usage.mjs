function increment(counter, key) {
  if (!key) return;
  counter[key] = (counter[key] || 0) + 1;
}

export function createBrapiUsageTracker({ lastRequestsLimit = 50 } = {}) {
  const stats = {
    totalRequests: 0,
    byInternalEndpoint: {},
    byBrapiRoute: {},
    byTicker: {},
    errors: 0,
    lastRequests: [],
  };

  return {
    record({ internalEndpoint, brapiRoute, ticker, status, success }) {
      stats.totalRequests += 1;
      increment(stats.byInternalEndpoint, internalEndpoint);
      increment(stats.byBrapiRoute, brapiRoute);
      increment(stats.byTicker, ticker);
      if (!success) stats.errors += 1;

      stats.lastRequests.unshift({
        at: new Date().toISOString(),
        ticker: ticker || null,
        route: brapiRoute,
        status: Number.isInteger(status) ? status : null,
        success: Boolean(success),
      });
      stats.lastRequests.splice(lastRequestsLimit);
    },

    snapshot() {
      return {
        totalRequests: stats.totalRequests,
        byInternalEndpoint: { ...stats.byInternalEndpoint },
        byBrapiRoute: { ...stats.byBrapiRoute },
        byTicker: { ...stats.byTicker },
        errors: stats.errors,
        lastRequests: stats.lastRequests.map((request) => ({ ...request })),
      };
    },
  };
}
