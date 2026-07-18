import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ferramenta preserva mensagens específicas da estimativa", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(app, /caughtError\.message \|\| "Não foi possível calcular a estimativa deste FII no momento\."/);
  assert.doesNotMatch(
    app,
    /Não foi possível atualizar a estimativa no momento\. Tente novamente em instantes\./,
  );
});
