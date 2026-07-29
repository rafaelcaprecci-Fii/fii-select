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

test("ferramenta separa leitura do fundo e leitura cruzada sem blocos documentais", async () => {
  const [html, app, styles] = await Promise.all([
    readFile(new URL("../public/ferramenta.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  ]);

  for (const id of [
    "fund-administrator",
    "fund-classification",
    "fund-manager",
    "fund-data-date",
    "current-price",
    "premium-discount",
    "price-to-nav",
    "nav-per-share",
    "selic",
    "required-return",
    "normalized-dividend",
    "dividends-used",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.doesNotMatch(html, /Documentos \/ Relatórios disponíveis/);
  assert.doesNotMatch(html, /Pontos de atenção documentais/);
  assert.match(app, /setText\("#fund-administrator", optionalText\(result\.fund\.administratorName\)\)/);
  assert.match(app, /setText\("#fund-manager", optionalText\(result\.fund\.managerName\)\)/);
  assert.match(app, /setText\("#fund-data-date", optionalDate\(result\.fund\.dataAsOfDate\)\)/);

  const orderedLabels = [
    "Patrimônio líquido",
    "Ativos totais",
    "Passivos totais",
    "Passivos / ativos",
    "Quantidade de imóveis",
    "Vacância consolidada",
    "Vacância por imóvel",
    "Participação na receita",
    "CRI",
    "LCI",
    "Cotas de FIIs",
    "Caixa",
    "Número de cotistas",
    "Taxa de administração",
    "Cotas emitidas",
    "Alavancagem",
    "Área declarada",
    "Inadimplência por imóvel",
    "Principais imóveis",
  ];
  let cursor = -1;
  for (const label of orderedLabels) {
    const index = app.indexOf(`"${label}"`);
    assert.ok(index > cursor, `${label} deve aparecer na ordem definida`);
    cursor = index;
  }

  assert.match(styles, /body\.tool-page \.crossed-reading-grid\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /body\.tool-page \.crossed-reading-grid article\.wide/);
  assert.match(styles, /overflow-wrap: anywhere/);
});
