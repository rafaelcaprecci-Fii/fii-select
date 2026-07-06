import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ensureUsersFile,
  readUsersFile,
  resolveUsersDataPath,
  writeUsersFile,
} from "../lib/users-json-store.mjs";

test("usa data/users.json quando USERS_DATA_PATH não é informado", () => {
  assert.equal(
    resolveUsersDataPath({ rootDir: "/app", configuredPath: "" }),
    join("/app", "data", "users.json"),
  );
});

test("usa o caminho absoluto configurado por USERS_DATA_PATH", () => {
  assert.equal(
    resolveUsersDataPath({ rootDir: "/app", configuredPath: "  /data/users.json  " }),
    "/data/users.json",
  );
});

test("resolve caminho configurado relativo à raiz da aplicação", () => {
  assert.equal(
    resolveUsersDataPath({ rootDir: "/app", configuredPath: "persistent/users.json" }),
    join("/app", "persistent", "users.json"),
  );
});

test("cria diretório e arquivo vazio sem quebrar a aplicação", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "fii-select-users-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const filePath = join(root, "missing", "users.json");

  await ensureUsersFile(filePath);

  assert.equal(await readFile(filePath, "utf8"), "[]");
  assert.deepEqual(await readUsersFile(filePath), []);
});

test("preserva integralmente um arquivo de usuários existente", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "fii-select-users-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const filePath = join(root, "users.json");
  const existing = [
    {
      id: "existing-user",
      email: "usuario@exemplo.com",
      accountType: "internal",
      intent: "founder",
      plan: "fundador",
      status: "active",
    },
  ];
  const original = JSON.stringify(existing, null, 2);
  await writeFile(filePath, original);

  await ensureUsersFile(filePath);

  assert.equal(await readFile(filePath, "utf8"), original);
  assert.deepEqual(await readUsersFile(filePath), existing);
});

test("grava e relê o mesmo formato usado por cadastro, login e Admin", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "fii-select-users-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const filePath = join(root, "data", "users.json");
  const users = [
    {
      id: "new-user",
      name: "Investidor",
      email: "investidor@exemplo.com",
      accountType: "customer",
      intent: "trial",
      plan: "teste_7_dias",
      status: "pending_trial",
    },
  ];

  await writeUsersFile(filePath, users);
  const stored = await readUsersFile(filePath);

  assert.deepEqual(stored, users);
  assert.equal(stored.find((user) => user.email === "investidor@exemplo.com")?.id, "new-user");
});
