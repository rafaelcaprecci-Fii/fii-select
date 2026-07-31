import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("interface do laboratório documental oculta fonte técnica e usa flags amigáveis", async () => {
  const [html, js] = await Promise.all([
    readFile(new URL("../public/admin-documental-lab.html", import.meta.url), "utf8"),
    readFile(new URL("../public/documental-lab.js", import.meta.url), "utf8"),
  ]);
  const interfaceSource = `${html}\n${js}`;

  assert.doesNotMatch(interfaceSource, /BRAPI|\/api\/v2\/fii\/indicators|\/api\/v2\/fii\/reports|\/api\/v2\/fii\/dividends|INSUFFICIENT|\bOK\b|is-ok/);
  assert.match(interfaceSource, /Preocupante/);
  assert.match(interfaceSource, /Atenção/);
  assert.match(interfaceSource, /Positivo/);
  assert.match(interfaceSource, /URL não informada/);
  assert.match(interfaceSource, /Abrir documento/);
  assert.match(interfaceSource, /Leitura documental assistida/);
  assert.match(interfaceSource, /data-documental-assisted/);
  assert.match(interfaceSource, /Fontes documentais/);
  assert.match(interfaceSource, /data-documental-sources/);
  assert.match(interfaceSource, /Fonte oficial não cadastrada\./);
});

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

test("laboratório documental é interno, read-only e sanitizado", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "fii-select-documental-lab-"));
  const usersPath = join(directory, "users.json");
  const searchesPath = join(directory, "fii-searches.json");
  const comparisonsPath = join(directory, "user-comparisons.json");
  const preloadPath = join(directory, "mock-fetch.mjs");
  const usersContent = JSON.stringify(
    [{ id: "u1", name: "Admin Teste", email: "admin@example.com", status: "active" }],
    null,
    2,
  );
  const searchesContent = JSON.stringify([{ userId: "u1", ticker: "MXRF11", searchedAt: "2026-07-01T00:00:00.000Z" }]);
  const comparisonsContent = JSON.stringify([{ userId: "u1", tickers: ["MXRF11"] }]);
  await writeFile(usersPath, usersContent);
  await writeFile(searchesPath, searchesContent);
  await writeFile(comparisonsPath, comparisonsContent);
  await writeFile(
    preloadPath,
    [
      "const originalFetch = globalThis.fetch;",
      "globalThis.fetch = async (url, options = {}) => {",
      "  const href = String(url);",
      "  if (href.includes('brapi.dev/api/v2/fii/indicators')) {",
      "    return Response.json({ fiis: [{ symbol: 'HGLG11', name: 'FII Teste', price: 100, navPerShare: 80, priceToNav: 0.8, equity: 1000, totalAssets: 1200, sharesOutstanding: 10, totalInvestors: 12345, segmentType: 'tijolo', segmentoAtuacao: 'Logística', administratorName: 'Administrador Teste', managerName: 'Gestor Teste', asOfDate: '2026-06-01' }] });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/reports')) {",
      "    return Response.json({ reports: [{ symbol: 'HGLG11', referenceDate: '2026-06-01', version: 2, totalAssets: 1100, equity: 900, navPerShare: 90, monthlyDividendYield: 0.01, adminFeeRate: 0.001, cash: 50, cri: 0, lci: 0, fiiHoldings: 20, totalLiabilities: 300, documentUrl: 'https://example.com/report.pdf' }] });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/properties')) {",
      "    return Response.json({ fiis: [{ symbol: 'HGLG11', referenceDate: '2026-06-01', summary: { count: 3, totalArea: 12000, vacancyRate: 0.04 }, properties: [] }] });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/portfolio')) {",
      "    return Response.json({ fiis: [{ symbol: 'HGLG11', referenceDate: '2026-06-01', summary: { totalItems: 1, declaredValue: 1000 }, allocations: [] }] });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/dividends')) {",
      "    return Response.json({ dividends: [{ symbol: 'HGLG11', label: 'RENDIMENTO', rate: 1, referenceDate: '2026-06-01' }] });",
      "  }",
      "  return originalFetch(url, options);",
      "};",
    ].join("\n"),
  );

  const port = await availablePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      USERS_DATA_PATH: usersPath,
      FII_SEARCH_LOG_PATH: searchesPath,
      USER_COMPARISONS_PATH: comparisonsPath,
      ADMIN_USER: "admin-test",
      ADMIN_PASSWORD: "password-test",
      BRAPI_TOKEN: "fake-brapi-token",
      NODE_ENV: "test",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import ${preloadPath}`.trim(),
    },
    stdio: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  context.after(async () => {
    child.kill("SIGTERM");
    await rm(directory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);

  const unauthenticatedPage = await fetch(`${baseUrl}/admin/documental-lab.html`);
  assert.equal(unauthenticatedPage.status, 401);

  const unauthenticatedApi = await fetch(`${baseUrl}/admin/api/documental-lab?ticker=HGLG11`);
  assert.equal(unauthenticatedApi.status, 401);

  const auth = `Basic ${Buffer.from("admin-test:password-test").toString("base64")}`;
  const invalid = await fetch(`${baseUrl}/admin/api/documental-lab?ticker=abc`, {
    headers: { Authorization: auth },
  });
  assert.equal(invalid.status, 400);

  const response = await fetch(`${baseUrl}/admin/api/documental-lab?ticker=HGLG11`, {
    headers: { Authorization: auth },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(body.ok, true);
  assert.equal(body.ticker, "HGLG11");
  assert.equal(body.summary.administrator, "Administrador Teste");
  assert.ok(body.facts.some((fact) => fact.key === "totalInvestors" && fact.value === 12345));
  assert.ok(body.documents.some((document) => document.documentUrl === "https://example.com/report.pdf"));
  assert.ok(body.checks.some((check) => check.id === "nav-per-share" && check.status === "concerning"));
  assert.ok(body.checks.some((check) => check.status === "insufficient"));
  assert.ok(body.checks.some((check) => check.status === "positive"));
  assert.ok(body.checks.some((check) => check.id === "report-version" && check.status === "attention"));
  assert.equal(body.source, "Dados estruturados CVM");
  assert.ok(body.documents.every((document) => document.source === "Dados estruturados CVM"));
  assert.equal(body.documentalSources.official, null);
  assert.equal(body.documentalSources.regulatory.name, "FNET / CVM");
  assert.equal(body.documentalSources.shortcut.name, "Clube FII");
  assert.equal(body.documentalSources.shortcut.url, "https://www.clubefii.com.br/fiis/HGLG11");
  assert.equal(body.assistedReading.length, 12);
  assert.deepEqual(body.assistedReading.map((block) => block.title), [
    "Resumo do mês",
    "Rendimento e origem do DY",
    "Portfólio e qualidade dos ativos",
    "Contratos e inquilinos",
    "Obras, expansões e imóveis em desenvolvimento",
    "Estratégia do fundo vs portfólio atual",
    "Estrutura de capital e alavancagem",
    "Histórico de emissões de cotas",
    "Pontos positivos",
    "Pontos de atenção / riscos",
    "Eventos não recorrentes",
    "Dados não identificados nos documentos",
  ]);
  assert.match(JSON.stringify(body.assistedReading), /Dado não identificado nos documentos analisados\./);
  assert.ok(body.assistedReading.some((block) => block.id === "positive-points" && block.items.some((item) => item.support?.length)));
  assert.ok(body.assistedReading.some((block) => block.id === "risks" && block.items.some((item) => item.support?.length)));
  assert.ok(body.assistedReading.some((block) => block.id === "non-recurring-events" && /Nenhum evento não recorrente/.test(block.text)));
  const missingData = body.assistedReading.find((block) => block.id === "missing-data");
  assert.ok(missingData.items.some((item) => item.title === "tipo de contrato típico/atípico"));
  assert.ok(missingData.items.some((item) => item.title === "principais inquilinos"));
  assert.ok(missingData.items.some((item) => item.title === "concentração por inquilino"));
  assert.ok(!missingData.items.some((item) => item.title === "vendas dos lojistas"));
  assert.ok(!missingData.items.some((item) => item.title === "fluxo de visitantes"));
  assert.doesNotMatch(JSON.stringify(body.assistedReading), /\b(compre|venda|recomendado|melhor fundo|oportunidade|garantia|preço-alvo)\b/i);
  assert.doesNotMatch(serialized, /fake-brapi-token|ADMIN_PASSWORD|admin-test|password-test|\/api\/v2\/fii\/indicators|\/api\/v2\/fii\/reports|\/api\/v2\/fii\/dividends/i);

  assert.equal(await readFile(usersPath, "utf8"), usersContent);
  assert.equal(await readFile(searchesPath, "utf8"), searchesContent);
  assert.equal(await readFile(comparisonsPath, "utf8"), comparisonsContent);
});

test("dados não identificados são segmentados por tipo de fundo", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(server, /shopping:[\s\S]*"vendas dos lojistas"[\s\S]*"fluxo de visitantes"/);
  assert.match(server, /papel:[\s\S]*"devedores"[\s\S]*"garantias"[\s\S]*"eventos de crédito"/);
  assert.match(server, /"lajes-corporativas":[\s\S]*"concentração percentual por locatário individual"[\s\S]*"WALE por receita"/);
  assert.match(server, /multicategoria\|multiestrategia/);
});

test("fontes documentais incluem cadastro inicial do JSRE11 e atalho por ticker", async () => {
  const [server, js] = await Promise.all([
    readFile(new URL("../server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/documental-lab.js", import.meta.url), "utf8"),
  ]);

  assert.match(server, /JSRE11:[\s\S]*Safra Asset/);
  assert.match(server, /https:\/\/www\.safra\.com\.br\/safra-asset\/fundo-imobiliario\/js-real-estate\.htm/);
  assert.match(server, /FNET \/ CVM/);
  assert.match(server, /https:\/\/www\.clubefii\.com\.br\/fiis\/\$\{encodeURIComponent\(normalizedTicker\)\}/);
  assert.match(js, /target="_blank" rel="noopener"/);
});
