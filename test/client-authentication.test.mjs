import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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

function cookieFrom(response) {
  return response.headers.get("set-cookie") || "";
}

async function login(baseUrl, email, cookie = "") {
  return fetch(`${baseUrl}/api/users/login-status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ email }),
    redirect: "manual",
  });
}

test("login e ferramenta operam em modo fail-closed", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "fii-select-auth-"));
  const usersPath = join(directory, "users.json");
  const users = [
    {
      id: "internal-user",
      name: "Conta interna",
      email: "internal@example.com",
      accountType: "internal",
      intent: "general",
      plan: "fundador",
      status: "pending",
    },
    {
      id: "active-user",
      name: "Conta ativa",
      email: "active@example.com",
      accountType: "customer",
      intent: "founder",
      plan: "fundador",
      status: "active",
    },
    {
      id: "trial-user",
      name: "Teste ativo",
      email: "trial@example.com",
      accountType: "customer",
      intent: "trial",
      plan: "teste_7_dias",
      status: "trial_active",
    },
    {
      id: "pending-user",
      name: "Conta pendente",
      email: "pending@example.com",
      accountType: "customer",
      intent: "founder",
      plan: "fundador",
      status: "pending_founder",
    },
    {
      id: "duplicate-one",
      name: "Duplicado um",
      email: "duplicate@example.com",
      status: "active",
    },
    {
      id: "duplicate-two",
      name: "Duplicado dois",
      email: "DUPLICATE@EXAMPLE.COM",
      status: "active",
    },
  ];
  await writeFile(usersPath, JSON.stringify(users, null, 2));

  const port = await availablePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      USERS_DATA_PATH: usersPath,
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

  const directTool = await fetch(`${baseUrl}/ferramenta.html`, { redirect: "manual" });
  assert.equal(directTool.status, 302);
  assert.equal(directTool.headers.get("location"), "/login.html");

  for (const email of [
    "missing@example.com",
    "",
    "   ",
    "active@",
    "active@example.co",
    "duplicate@example.com",
  ]) {
    const response = await login(baseUrl, email);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).authenticated, false);
    assert.match(cookieFrom(response), /Max-Age=0/);
  }

  for (const email of [
    " INTERNAL@EXAMPLE.COM ",
    "active@example.com",
    "trial@example.com",
  ]) {
    const response = await login(baseUrl, email);
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.authenticated, true);
    assert.ok(result.user?.id);
    assert.match(cookieFrom(response), /fii_select_session=[^;]/);
    assert.doesNotMatch(cookieFrom(response), /Max-Age=0/);
  }

  const pendingLogin = await login(baseUrl, "pending@example.com");
  assert.equal(pendingLogin.status, 200);
  const pendingCookie = cookieFrom(pendingLogin).split(";")[0];
  const pendingTool = await fetch(`${baseUrl}/ferramenta.html`, {
    headers: { Cookie: pendingCookie },
    redirect: "manual",
  });
  assert.equal(pendingTool.status, 302);
  assert.equal(pendingTool.headers.get("location"), "/login.html");

  const validLogin = await login(baseUrl, "internal@example.com");
  const validCookie = cookieFrom(validLogin).split(";")[0];
  const validTool = await fetch(`${baseUrl}/ferramenta.html`, {
    headers: { Cookie: validCookie },
    redirect: "manual",
  });
  assert.equal(validTool.status, 200);

  const invalidAfterValid = await login(baseUrl, "missing@example.com", validCookie);
  assert.equal(invalidAfterValid.status, 401);
  assert.match(cookieFrom(invalidAfterValid), /Max-Age=0/);

  const oldSessionAfterFailure = await fetch(`${baseUrl}/ferramenta.html`, {
    headers: { Cookie: validCookie },
    redirect: "manual",
  });
  assert.equal(oldSessionAfterFailure.status, 302);
  assert.equal(oldSessionAfterFailure.headers.get("location"), "/login.html");

  await writeFile(usersPath, "{json inválido");
  const readFailure = await login(baseUrl, "internal@example.com");
  assert.equal(readFailure.status, 503);
  assert.equal((await readFailure.json()).authenticated, false);
  assert.match(cookieFrom(readFailure), /Max-Age=0/);
});
