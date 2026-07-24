import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditedTestUserEmails } from "../lib/audited-test-user-cleanup.mjs";

const root = new URL("../", import.meta.url);

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Servidor de teste encerrou antes de iniciar.");
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // O servidor ainda está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Servidor de teste não iniciou no prazo esperado.");
}

async function readUsers(usersPath) {
  return JSON.parse(await readFile(usersPath, "utf8"));
}

function authHeader() {
  return `Basic ${Buffer.from("admin-test:password-test").toString("base64")}`;
}

function cleanupUsers() {
  return [
    {
      id: "remove-1",
      name: "Teste Um",
      email: auditedTestUserEmails[0],
      accountType: "customer",
      intent: "founder",
      plan: "fundador",
      status: "pending_founder",
      passwordHash: "nao-retornar",
    },
    {
      id: "keep-old-1",
      name: "Teste Dois preservado",
      email: "11111111@gmail.com",
      accountType: "customer",
      intent: "founder",
      plan: "fundador",
      status: "pending_founder",
    },
    {
      id: "keep-old-2",
      name: "Teste Três preservado",
      email: "rafael.curycaprecci2@gmail.com",
      accountType: "customer",
      intent: "trial",
      plan: "teste_7_dias",
      status: "pending_trial",
    },
    {
      id: "internal-preserved",
      name: "Rafael Cury",
      email: "rafael.cury@2bold.com",
      accountType: "internal",
      intent: "general",
      plan: "",
      status: "active",
    },
    {
      id: "keep-1",
      name: "Cliente Real",
      email: "cliente@exemplo.com",
      accountType: "customer",
      intent: "founder",
      plan: "fundador",
      status: "active",
      emailVerificationTokenHash: "nao-retornar",
    },
  ];
}

test("rota administrativa remove somente cadastros auditados com confirmação explícita", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "fii-select-remove-users-"));
  const usersPath = join(directory, "users.json");
  const backupsPath = join(directory, "backups");
  const originalUsers = cleanupUsers();
  await writeFile(usersPath, JSON.stringify(originalUsers, null, 2));

  const port = await availablePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      USERS_DATA_PATH: usersPath,
      ADMIN_USER: "admin-test",
      ADMIN_PASSWORD: "password-test",
      NODE_ENV: "test",
    },
    stdio: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  context.after(async () => {
    child.kill("SIGTERM");
    await rm(directory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);

  const route = `${baseUrl}/admin/api/maintenance/remove-test-users`;
  const unauthenticated = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "REMOVE_RAF_TEST_USER" }),
  });
  assert.equal(unauthenticated.status, 401);

  const wrongConfirmation = await fetch(route, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirm: "valor-incorreto" }),
  });
  assert.equal(wrongConfirmation.status, 400);
  assert.deepEqual(await readUsers(usersPath), originalUsers);
  await assert.rejects(() => readdir(backupsPath), /ENOENT/);

  const cleanup = await fetch(route, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirm: "REMOVE_RAF_TEST_USER" }),
  });
  assert.equal(cleanup.status, 200);
  const cleanupBody = await cleanup.json();
  assert.equal(cleanupBody.ok, true);
  assert.equal(cleanupBody.removedCount, 1);
  assert.deepEqual(
    cleanupBody.removedUsers.map((user) => user.id),
    ["remove-1"],
  );
  assert.equal(cleanupBody.preservedUser.id, "internal-preserved");
  assert.equal(cleanupBody.preservedUser.accountType, "internal");
  assert.doesNotMatch(JSON.stringify(cleanupBody), /password|hash|token|nao-retornar/i);

  const backupFiles = await readdir(backupsPath);
  assert.equal(backupFiles.length, 1);
  assert.match(backupFiles[0], /^users-before-test-cleanup-\d{8}-\d{6}\.json$/);
  assert.deepEqual(JSON.parse(await readFile(join(backupsPath, backupFiles[0]), "utf8")), originalUsers);

  const remainingUsers = await readUsers(usersPath);
  assert.deepEqual(
    remainingUsers.map((user) => user.id),
    ["keep-old-1", "keep-old-2", "internal-preserved", "keep-1"],
  );
  assert.deepEqual(remainingUsers, [originalUsers[1], originalUsers[2], originalUsers[3], originalUsers[4]]);

  const secondRun = await fetch(route, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirm: "REMOVE_RAF_TEST_USER" }),
  });
  assert.equal(secondRun.status, 400);
  assert.deepEqual(await readUsers(usersPath), remainingUsers);
  assert.equal((await readdir(backupsPath)).length, 1);
});
