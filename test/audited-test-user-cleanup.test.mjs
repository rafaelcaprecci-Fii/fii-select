import assert from "node:assert/strict";
import test from "node:test";
import {
  auditedTestUserEmails,
  removeAuditedTestUsers,
} from "../lib/audited-test-user-cleanup.mjs";

const preservedInternal = {
  id: "internal-preserved",
  name: "Rafael Cury",
  email: "rafael.cury@2bold.com",
  accountType: "internal",
  intent: "general",
  plan: "",
  status: "active",
};

function cleanupUsers(overrides = {}) {
  return [
    { id: "remove-1", email: auditedTestUserEmails[0], accountType: "customer", status: "pending" },
    { id: "keep-old-1", email: "11111111@gmail.com", accountType: "customer", status: "pending" },
    { id: "keep-old-2", email: "rafael.curycaprecci2@gmail.com", accountType: "customer", status: "pending" },
    preservedInternal,
    { id: "keep-1", email: "cliente@exemplo.com", accountType: "customer", status: "active" },
  ].map((user) => ({ ...user, ...(overrides[user.id] || {}) }));
}

function memoryStore(initialUsers) {
  let users = structuredClone(initialUsers);
  const backups = [];
  return {
    readUsers: async () => structuredClone(users),
    writeUsers: async (nextUsers) => {
      users = structuredClone(nextUsers);
    },
    createBackup: async (name, backupUsers) => {
      backups.push({ name, users: structuredClone(backupUsers) });
      return `/tmp/${name}`;
    },
    snapshot: () => structuredClone(users),
    backups,
  };
}

test("limpeza auditada remove somente o cadastro autorizado e preserva demais registros", async () => {
  const originalUsers = cleanupUsers();
  const store = memoryStore(originalUsers);
  const result = await removeAuditedTestUsers({
    ...store,
    now: new Date("2026-07-10T12:34:56.000Z"),
  });

  assert.equal(result.removedCount, 1);
  assert.deepEqual(result.removedUsers.map((user) => user.email), auditedTestUserEmails);
  assert.equal(result.preservedUser.email, "rafael.cury@2bold.com");
  assert.equal(result.preservedUser.accountType, "internal");
  assert.equal(result.backupPath, "/tmp/users-before-test-cleanup-20260710-123456.json");
  assert.equal(store.backups.length, 1);
  assert.deepEqual(store.backups[0].users, originalUsers);

  const remainingUsers = store.snapshot();
  assert.deepEqual(
    remainingUsers.map((user) => user.id),
    ["keep-old-1", "keep-old-2", "internal-preserved", "keep-1"],
  );
  assert.deepEqual(remainingUsers, [originalUsers[1], originalUsers[2], preservedInternal, originalUsers[4]]);
});

test("limpeza auditada aborta sem escrever quando alvo falta, duplica ou é internal", async () => {
  for (const users of [
    cleanupUsers().filter((user) => user.email !== auditedTestUserEmails[0]),
    [
      ...cleanupUsers(),
      { id: "duplicate", email: auditedTestUserEmails[0].toUpperCase(), accountType: "customer" },
    ],
    cleanupUsers({ "remove-1": { accountType: "internal" } }),
  ]) {
    const store = memoryStore(users);
    await assert.rejects(() => removeAuditedTestUsers(store), /Limpeza abortada/);
    assert.deepEqual(store.snapshot(), users);
    assert.equal(store.backups.length, 0);
  }
});

test("limpeza auditada exige conta preservada internal", async () => {
  for (const users of [
    cleanupUsers().filter((user) => user.email !== "rafael.cury@2bold.com"),
    cleanupUsers({ "internal-preserved": { accountType: "customer" } }),
  ]) {
    const store = memoryStore(users);
    await assert.rejects(() => removeAuditedTestUsers(store), /conta preservada/);
    assert.deepEqual(store.snapshot(), users);
    assert.equal(store.backups.length, 0);
  }
});

test("limpeza auditada executa rollback se validação pós-escrita falhar", async () => {
  const originalUsers = cleanupUsers();
  const store = memoryStore(originalUsers);
  await assert.rejects(
    () => removeAuditedTestUsers({ ...store, simulatePostWriteFailure: true }),
    /Falha pós-escrita simulada/,
  );

  assert.deepEqual(store.snapshot(), originalUsers);
  assert.equal(store.backups.length, 1);
});

test("segunda execução é segura e não remove usuários adicionais", async () => {
  const store = memoryStore(cleanupUsers());
  await removeAuditedTestUsers(store);
  const afterFirstRun = store.snapshot();
  await assert.rejects(() => removeAuditedTestUsers(store), /retornou 0 correspondência/);

  assert.deepEqual(store.snapshot(), afterFirstRun);
  assert.equal(store.backups.length, 1);
});
