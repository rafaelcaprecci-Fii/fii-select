import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home contém FAQ sobre FII e footer centralizado", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(html, /<h3>O que é um FII\?<\/h3>/);
  assert.match(
    html,
    /FII é a sigla para Fundo de Investimento Imobiliário\. É uma modalidade de investimento coletivo/,
  );
  assert.match(css, /\.home-page \.home-footer \{[\s\S]*grid-template-columns: repeat\(3, 1fr\);/);
  assert.match(css, /\.home-page \.home-footer \{[\s\S]*justify-items: center;/);
  assert.match(css, /\.home-page \.home-social \{[\s\S]*margin-left: 0;/);
});
