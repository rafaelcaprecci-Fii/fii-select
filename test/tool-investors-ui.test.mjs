import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("frontend renderiza número de cotistas com formatação pt-BR", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(app, /new Intl\.NumberFormat\("pt-BR", \{ maximumFractionDigits: 0 \}\)/);
  assert.match(app, /Número de cotistas/);
  assert.match(app, /\$\{integer\(Math\.trunc\(number\)\)\} cotistas/);
  assert.match(app, /optionalInvestors\(common\.totalInvestors\)/);
});
