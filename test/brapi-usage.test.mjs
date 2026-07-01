import assert from "node:assert/strict";
import test from "node:test";
import { createBrapiUsageTracker } from "../lib/brapi-usage.mjs";

test("contador agrega chamadas sem armazenar dados pessoais ou credenciais", () => {
  const usage = createBrapiUsageTracker({ lastRequestsLimit: 2 });

  usage.record({
    internalEndpoint: "/api/valuation",
    brapiRoute: "/api/v2/fii/indicators",
    ticker: "HGLG11",
    status: 200,
    success: true,
  });
  usage.record({
    internalEndpoint: "/api/crossed-reading",
    brapiRoute: "/api/v2/fii/properties",
    ticker: "HGLG11",
    status: 503,
    success: false,
  });
  usage.record({
    internalEndpoint: "/api/valuation",
    brapiRoute: "/api/v2/fii/dividends",
    ticker: "KNCR11",
    status: 200,
    success: true,
  });

  const snapshot = usage.snapshot();
  assert.equal(snapshot.totalRequests, 3);
  assert.deepEqual(snapshot.byInternalEndpoint, {
    "/api/valuation": 2,
    "/api/crossed-reading": 1,
  });
  assert.equal(snapshot.byBrapiRoute["/api/v2/fii/indicators"], 1);
  assert.deepEqual(snapshot.byTicker, { HGLG11: 2, KNCR11: 1 });
  assert.equal(snapshot.errors, 1);
  assert.equal(snapshot.lastRequests.length, 2);
  assert.equal(snapshot.lastRequests[0].ticker, "KNCR11");
  assert.equal(JSON.stringify(snapshot).includes("token"), false);
  assert.equal(JSON.stringify(snapshot).includes("email"), false);
});

test("snapshot não permite alterar o estado interno do contador", () => {
  const usage = createBrapiUsageTracker();
  usage.record({
    internalEndpoint: "/api/valuation",
    brapiRoute: "/api/v2/fii/indicators",
    ticker: "MXRF11",
    status: 200,
    success: true,
  });

  const snapshot = usage.snapshot();
  snapshot.totalRequests = 99;
  snapshot.byTicker.MXRF11 = 99;
  snapshot.lastRequests[0].ticker = "ALTERADO";

  const nextSnapshot = usage.snapshot();
  assert.equal(nextSnapshot.totalRequests, 1);
  assert.equal(nextSnapshot.byTicker.MXRF11, 1);
  assert.equal(nextSnapshot.lastRequests[0].ticker, "MXRF11");
});
