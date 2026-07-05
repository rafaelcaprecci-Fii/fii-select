import assert from "node:assert/strict";
import test from "node:test";
import {
  accountTypeForPublicRegistration,
  canAccountAccessTool,
  isInternalAccount,
  shouldRunCommercialAutomation,
} from "../lib/user-account-policy.mjs";

test("cadastro público sempre cria conta comum", () => {
  assert.equal(accountTypeForPublicRegistration(), "customer");
  assert.equal(accountTypeForPublicRegistration({ accountType: "internal" }), "customer");
});

test("conta interna acessa a ferramenta independentemente do status comercial", () => {
  const user = { accountType: "internal", status: "pending_founder" };
  assert.equal(isInternalAccount(user), true);
  assert.equal(canAccountAccessTool(user, "pending_founder"), true);
});

test("contas comuns preservam a regra atual de acesso", () => {
  assert.equal(canAccountAccessTool({ accountType: "customer" }, "active"), true);
  assert.equal(canAccountAccessTool({ accountType: "customer" }, "trial_active"), true);
  assert.equal(canAccountAccessTool({ accountType: "customer" }, "pending_founder"), false);
});

test("conta interna não executa automações comerciais", () => {
  assert.equal(shouldRunCommercialAutomation({ accountType: "internal" }), false);
  assert.equal(shouldRunCommercialAutomation({ accountType: "customer" }), true);
});
