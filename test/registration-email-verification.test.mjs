import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hashEmailVerificationToken } from "../lib/email-verification.mjs";

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

async function register(baseUrl, overrides = {}) {
  return fetch(`${baseUrl}/api/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Novo usuário",
      email: "new@example.com",
      phone: "(11) 97178-0101",
      intent: "founder",
      emailVerified: true,
      ...overrides,
    }),
  });
}

test("cadastro e confirmação de e-mail operam em modo seguro", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "fii-select-registration-"));
  const usersPath = join(directory, "users.json");
  const validToken = "token-valido-de-teste";
  const expiredToken = "token-expirado-de-teste";
  const users = [
    {
      id: "verify-user",
      name: "A confirmar",
      email: "verify@example.com",
      accountType: "customer",
      intent: "founder",
      plan: "fundador",
      status: "pending_founder",
      emailVerified: false,
      emailVerificationTokenHash: hashEmailVerificationToken(validToken),
      emailVerificationExpiresAt: "2099-01-01T00:00:00.000Z",
    },
    {
      id: "expired-user",
      name: "Token expirado",
      email: "expired@example.com",
      accountType: "customer",
      intent: "trial",
      plan: "teste_7_dias",
      status: "pending_trial",
      emailVerified: false,
      emailVerificationTokenHash: hashEmailVerificationToken(expiredToken),
      emailVerificationExpiresAt: "2020-01-01T00:00:00.000Z",
    },
    {
      id: "internal-user",
      name: "Conta interna",
      email: "internal@example.com",
      accountType: "internal",
      status: "pending",
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
      ADMIN_USER: "admin-test",
      ADMIN_PASSWORD: "password-test",
      NODE_ENV: "test",
      BREVO_API_KEY: "",
      EMAIL_FROM: "",
    },
    stdio: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  context.after(async () => {
    child.kill("SIGTERM");
    await rm(directory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);

  const invalid = await register(baseUrl, { email: "email-invalido" });
  assert.equal(invalid.status, 400);
  assert.equal((await readUsers(usersPath)).length, 3);

  const created = await register(baseUrl);
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.verificationPending, true);

  let persisted = await readUsers(usersPath);
  const newUsers = persisted.filter((user) => user.email === "new@example.com");
  assert.equal(newUsers.length, 1);
  assert.equal(newUsers[0].emailVerified, false);
  assert.equal(typeof newUsers[0].emailVerificationTokenHash, "string");
  assert.notEqual(newUsers[0].emailVerificationTokenHash, "");

  const duplicate = await register(baseUrl, {
    email: " NEW@EXAMPLE.COM ",
    name: "Nome não deve substituir",
  });
  assert.equal(duplicate.status, 201);
  persisted = await readUsers(usersPath);
  assert.equal(
    persisted.filter((user) => user.email === "new@example.com").length,
    1,
  );
  assert.equal(
    persisted.find((user) => user.email === "new@example.com").name,
    "Novo usuário",
  );

  const unverifiedLogin = await fetch(`${baseUrl}/api/users/login-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "new@example.com" }),
  });
  assert.equal(unverifiedLogin.status, 401);
  assert.match(unverifiedLogin.headers.get("set-cookie") || "", /Max-Age=0/);

  const validConfirmation = await fetch(
    `${baseUrl}/api/users/verify-email?token=${validToken}`,
    { redirect: "manual" },
  );
  assert.equal(validConfirmation.status, 302);
  assert.equal(validConfirmation.headers.get("location"), "/login.html?emailVerified=1");

  persisted = await readUsers(usersPath);
  const confirmed = persisted.find((user) => user.id === "verify-user");
  assert.equal(confirmed.emailVerified, true);
  assert.equal(confirmed.emailVerificationTokenHash, undefined);

  const confirmedLogin = await fetch(`${baseUrl}/api/users/login-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: " VERIFY@EXAMPLE.COM " }),
  });
  assert.equal(confirmedLogin.status, 200);
  assert.equal((await confirmedLogin.json()).authenticated, true);

  const reused = await fetch(
    `${baseUrl}/api/users/verify-email?token=${validToken}`,
    { redirect: "manual" },
  );
  assert.equal(reused.status, 400);

  const expired = await fetch(
    `${baseUrl}/api/users/verify-email?token=${expiredToken}`,
    { redirect: "manual" },
  );
  assert.equal(expired.status, 400);

  const invalidToken = await fetch(
    `${baseUrl}/api/users/verify-email?token=token-inexistente`,
    { redirect: "manual" },
  );
  assert.equal(invalidToken.status, 400);

  const auth = `Basic ${Buffer.from("admin-test:password-test").toString("base64")}`;
  const activateUnverifiedTrial = await fetch(
    `${baseUrl}/admin/api/users/expired-user/status`,
    {
      method: "PATCH",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "trial_active" }),
    },
  );
  assert.notEqual(activateUnverifiedTrial.status, 200);
  persisted = await readUsers(usersPath);
  const unverifiedTrial = persisted.find((user) => user.id === "expired-user");
  assert.equal(unverifiedTrial.status, "pending_trial");
  assert.equal(unverifiedTrial.trialStartAt, undefined);

  const internalLogin = await fetch(`${baseUrl}/api/users/login-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "internal@example.com" }),
  });
  assert.equal(internalLogin.status, 200);
  assert.equal((await internalLogin.json()).authenticated, true);
});

test("e-mail de verificação usa template Brevo com LINK_EMAIL", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "fii-select-verification-template-"));
  const usersPath = join(directory, "users.json");
  const payloadPath = join(directory, "brevo-payload.json");
  const preloadPath = join(directory, "mock-fetch.mjs");
  await writeFile(usersPath, "[]");
  await writeFile(
    preloadPath,
    [
      "const originalFetch = globalThis.fetch;",
      `const payloadPath = ${JSON.stringify(payloadPath)};`,
      "globalThis.fetch = async (url, options = {}) => {",
      "  if (String(url) === 'https://api.brevo.com/v3/smtp/email') {",
      "    const { writeFile } = await import('node:fs/promises');",
      "    await writeFile(payloadPath, JSON.stringify({ url, body: JSON.parse(options.body) }, null, 2));",
      "    return new Response('{}', { status: 201 });",
      "  }",
      "  return originalFetch(url, options);",
      "};",
    ].join("\n"),
  );

  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
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
      BREVO_API_KEY: "fake-api-key",
      EMAIL_FROM: "FII Select <noreply@example.com>",
      BREVO_TEMPLATE_EMAIL_VERIFICACAO: "10",
      APP_BASE_URL: baseUrl,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import ${preloadPath}`.trim(),
    },
    stdio: "ignore",
  });
  context.after(async () => {
    child.kill("SIGTERM");
    await rm(directory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);

  const created = await register(baseUrl, {
    name: "Verificação Template",
    email: "template@example.com",
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).verificationEmail.ok, true);

  const payload = JSON.parse(await readFile(payloadPath, "utf8"));
  assert.equal(payload.body.templateId, 10);
  assert.deepEqual(Object.keys(payload.body.params), ["LINK_EMAIL"]);
  assert.match(
    payload.body.params.LINK_EMAIL,
    new RegExp(`^${baseUrl.replaceAll(".", "\\.")}/api/users/verify-email\\?token=.+`),
  );
  assert.equal(payload.body.subject, undefined);
  assert.equal(payload.body.htmlContent, undefined);
  assert.deepEqual(payload.body.to, [
    { email: "template@example.com", name: "Verificação Template" },
  ]);
});

test("configuração ausente ou inválida do template de verificação falha sem impedir cadastro", async (context) => {
  for (const [caseName, templateValue] of [
    ["missing", undefined],
    ["invalid", "template-invalido"],
  ]) {
    const directory = await mkdtemp(join(tmpdir(), `fii-select-verification-config-${caseName}-`));
    const usersPath = join(directory, "users.json");
    await writeFile(usersPath, "[]");

    const port = await availablePort();
    const env = {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      USERS_DATA_PATH: usersPath,
      ADMIN_USER: "admin-test",
      ADMIN_PASSWORD: "password-test",
      NODE_ENV: "test",
      BREVO_API_KEY: "fake-api-key",
      EMAIL_FROM: "FII Select <noreply@example.com>",
    };
    if (templateValue !== undefined) {
      env.BREVO_TEMPLATE_EMAIL_VERIFICACAO = templateValue;
    } else {
      delete env.BREVO_TEMPLATE_EMAIL_VERIFICACAO;
    }
    const child = spawn(process.execPath, ["server.mjs"], {
      cwd: root,
      env,
      stdio: "ignore",
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    context.after(async () => {
      child.kill("SIGTERM");
      await rm(directory, { recursive: true, force: true });
    });
    await waitForServer(baseUrl, child);

    const created = await register(baseUrl, {
      email: `${caseName}-template@example.com`,
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.verificationPending, true);
    assert.equal(body.verificationEmail.ok, false);

    const users = await readUsers(usersPath);
    assert.equal(users.length, 1);
    assert.equal(users[0].emailVerified, false);
    assert.match(users[0].lastEmailError, /Não foi possível enviar o e-mail agora/);
  }
});
