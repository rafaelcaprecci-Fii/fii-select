import assert from "node:assert/strict";
import test from "node:test";
import {
  accountTypeForPublicRegistration,
  canAccountAccessTool,
  findUniqueUserByEmail,
  isInternalAccount,
  normalizeAdministrativeAccountType,
  normalizeAdministrativeEmail,
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

test("conta comercial não verificada não acessa a ferramenta", () => {
  assert.equal(
    canAccountAccessTool(
      { accountType: "customer", emailVerified: false },
      "active",
    ),
    false,
  );
});

test("contas comuns preservam a regra atual de acesso", () => {
  assert.equal(canAccountAccessTool({ accountType: "customer" }, "active"), true);
  assert.equal(canAccountAccessTool({ accountType: "customer" }, "trial_active"), true);
  assert.equal(canAccountAccessTool({ accountType: "customer" }, "pending_founder"), false);
});

test("conta interna não executa automações comerciais", () => {
  assert.equal(shouldRunCommercialAutomation({ accountType: "internal" }), false);
  assert.equal(shouldRunCommercialAutomation({ accountType: "customer" }), true);
  assert.equal(
    shouldRunCommercialAutomation({ accountType: "customer", emailVerified: false }),
    false,
  );
});

test("busca administrativa localiza somente e-mail exato normalizado", () => {
  const users = [
    { id: "one", email: "primeiro@exemplo.com", accountType: "customer" },
    { id: "target", email: "usuario@dominio.com", accountType: "customer" },
  ];

  assert.equal(normalizeAdministrativeEmail("  USUARIO@DOMINIO.COM  "), "usuario@dominio.com");
  assert.equal(findUniqueUserByEmail(users, "  USUARIO@DOMINIO.COM  ").user.id, "target");
  assert.equal(findUniqueUserByEmail(users, "usuario@dominio").status, 404);
});

test("busca administrativa rejeita e-mail inexistente ou duplicado", () => {
  const users = [
    { id: "one", email: "duplicado@exemplo.com" },
    { id: "two", email: "DUPLICADO@EXEMPLO.COM" },
  ];

  assert.equal(findUniqueUserByEmail(users, "ausente@exemplo.com").status, 404);
  assert.equal(findUniqueUserByEmail(users, "duplicado@exemplo.com").status, 409);
});

test("somente accountType internal é aceito pela operação administrativa", () => {
  assert.equal(normalizeAdministrativeAccountType(" INTERNAL "), "internal");
  assert.equal(normalizeAdministrativeAccountType("customer"), "");
  assert.equal(normalizeAdministrativeAccountType("trial"), "");
});

test("seleção por e-mail não altera outros usuários", () => {
  const users = [
    { id: "target", email: "usuario@dominio.com", accountType: "customer" },
    { id: "other", email: "outro@dominio.com", accountType: "customer" },
  ];
  const match = findUniqueUserByEmail(users, "usuario@dominio.com");

  match.user.accountType = "internal";

  assert.equal(users[0].accountType, "internal");
  assert.equal(users[1].accountType, "customer");
});
