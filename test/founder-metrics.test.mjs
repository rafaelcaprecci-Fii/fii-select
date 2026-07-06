import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFounderMetrics,
  isFounderUser,
  isInternalAccount,
  isTrialUser,
} from "../public/founder-metrics.js";

test("conta apenas usuários explicitamente identificados como fundadores", () => {
  const users = [
    { intent: "founder", plan: "fundador", status: "active" },
    { intent: "general", plan: "fundador", status: "approved" },
    { intent: "trial", plan: "teste_7_dias", status: "trial_active" },
    { intent: "general", plan: "", status: "active" },
  ];

  assert.deepEqual(calculateFounderMetrics(users), {
    total: 2,
    approved: 2,
    active: 1,
    inactiveOrArchived: 0,
  });
});

test("inativos e arquivados não entram em fundadores aprovados", () => {
  const users = [
    { intent: "founder", plan: "fundador", status: "active" },
    { intent: "founder", plan: "fundador", status: "inactive" },
    { intent: "founder", plan: "fundador", status: "archived" },
    { intent: "founder", plan: "fundador", status: "pending_founder" },
  ];

  assert.deepEqual(calculateFounderMetrics(users), {
    total: 4,
    approved: 1,
    active: 1,
    inactiveOrArchived: 2,
  });
});

test("status de teste nunca é contado como fundador", () => {
  assert.equal(
    isFounderUser({
      intent: "founder",
      plan: "fundador",
      status: "trial_active",
    }),
    false,
  );
});

test("conta interna nunca entra nas métricas de fundador ou trial", () => {
  const internal = {
    accountType: "internal",
    intent: "founder",
    plan: "fundador",
    status: "trial_active",
  };

  assert.equal(isInternalAccount(internal), true);
  assert.equal(isFounderUser(internal), false);
  assert.equal(isTrialUser(internal), false);
  assert.deepEqual(calculateFounderMetrics([internal]), {
    total: 0,
    approved: 0,
    active: 0,
    inactiveOrArchived: 0,
  });
});

test("conta não verificada não entra nas métricas comerciais", () => {
  const unverified = {
    emailVerified: false,
    intent: "founder",
    plan: "fundador",
    status: "active",
  };

  assert.equal(isFounderUser(unverified), false);
  assert.equal(isTrialUser(unverified), false);
  assert.deepEqual(calculateFounderMetrics([unverified]), {
    total: 0,
    approved: 0,
    active: 0,
    inactiveOrArchived: 0,
  });
});
