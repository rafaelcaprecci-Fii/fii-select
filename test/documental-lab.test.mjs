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
  assert.match(interfaceSource, /Variação no número de cotistas/);
  assert.match(interfaceSource, /Leitura documental assistida/);
  assert.match(interfaceSource, /data-documental-assisted/);
  assert.match(interfaceSource, /data-documental-assisted-meta/);
  assert.match(interfaceSource, /Fonte: Relatório Gerencial \+ Informe Mensal \+ Fato Relevante/);
  assert.match(interfaceSource, /documentalSummaryItems/);
  assert.match(interfaceSource, /Resumo do mês/);
  assert.match(interfaceSource, /Tipo de gestão/);
  assert.match(interfaceSource, /Explicação financeira de aquisições/);
  assert.match(interfaceSource, /Dado não identificado nos documentos analisados\./);
  assert.match(interfaceSource, /data-documental-facts-meta/);
  assert.doesNotMatch(interfaceSource, /data-documental-facts-footer/);
  assert.doesNotMatch(interfaceSource, /data-save-documental-history>/);
  assert.doesNotMatch(interfaceSource, /Salvar resumo no histórico documental<\/button>/);
  assert.doesNotMatch(interfaceSource, /supportLine/);
  assert.match(interfaceSource, /Fontes documentais/);
  assert.match(interfaceSource, /data-documental-sources/);
  assert.match(interfaceSource, /data-documental-investors-variation/);
  assert.match(interfaceSource, /Importar da planilha/);
  assert.match(interfaceSource, /POST \/admin\/api\/documental-history\/import-sheet/);
  assert.match(interfaceSource, /Indicadores isolados/);
  assert.match(interfaceSource, /data-documental-metrics/);
  assert.match(interfaceSource, /Abrir/);
  assert.match(interfaceSource, /Não cadastrado/);
  assert.doesNotMatch(interfaceSource, /Documentos \/ Relatórios disponíveis/);
  assert.doesNotMatch(interfaceSource, /Pontos de atenção documentais/);
  assert.doesNotMatch(interfaceSource, /<h2>Histórico documental<\/h2>/);
  assert.doesNotMatch(interfaceSource, /<h2>Linha do tempo documental<\/h2>/);
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
  const documentalHistoryPath = join(directory, "fund-documental-history.json");
  const documentalTimelinePath = join(directory, "fund-timeline-events.json");
  const documentalSourcesPath = join(directory, "fund-document-sources.json");
  const documentalMetricsPath = join(directory, "fund-documental-metrics.json");
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
      DOCUMENTAL_HISTORY_PATH: documentalHistoryPath,
      DOCUMENTAL_TIMELINE_PATH: documentalTimelinePath,
      DOCUMENTAL_SOURCES_PATH: documentalSourcesPath,
      DOCUMENTAL_METRICS_PATH: documentalMetricsPath,
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

test("rotas administrativas persistem histórico, timeline e fontes documentais", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "fii-select-documental-store-"));
  const usersPath = join(directory, "users.json");
  const searchesPath = join(directory, "fii-searches.json");
  const comparisonsPath = join(directory, "user-comparisons.json");
  const documentalHistoryPath = join(directory, "fund-documental-history.json");
  const documentalTimelinePath = join(directory, "fund-timeline-events.json");
  const documentalSourcesPath = join(directory, "fund-document-sources.json");
  const documentalMetricsPath = join(directory, "fund-documental-metrics.json");
  const usersContent = JSON.stringify([{ id: "u1", name: "Admin Teste", email: "admin@example.com", status: "active" }]);
  const searchesContent = JSON.stringify([{ userId: "u1", ticker: "HGLG11", searchedAt: "2026-07-01T00:00:00.000Z" }]);
  const comparisonsContent = JSON.stringify([{ userId: "u1", tickers: ["HGLG11"] }]);
  await writeFile(usersPath, usersContent);
  await writeFile(searchesPath, searchesContent);
  await writeFile(comparisonsPath, comparisonsContent);

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
      DOCUMENTAL_HISTORY_PATH: documentalHistoryPath,
      DOCUMENTAL_TIMELINE_PATH: documentalTimelinePath,
      DOCUMENTAL_SOURCES_PATH: documentalSourcesPath,
      DOCUMENTAL_METRICS_PATH: documentalMetricsPath,
      ADMIN_USER: "admin-test",
      ADMIN_PASSWORD: "password-test",
      NODE_ENV: "test",
    },
    stdio: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const auth = `Basic ${Buffer.from("admin-test:password-test").toString("base64")}`;
  context.after(async () => {
    child.kill("SIGTERM");
    await rm(directory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);

  const unauthenticatedHistory = await fetch(`${baseUrl}/admin/api/documental-history?ticker=JSRE11`);
  assert.equal(unauthenticatedHistory.status, 401);

  const unauthenticatedHistoryImport = await fetch(`${baseUrl}/admin/api/documental-history/import-sheet`, {
    method: "POST",
  });
  assert.equal(unauthenticatedHistoryImport.status, 401);

  const unauthenticatedMetrics = await fetch(`${baseUrl}/admin/api/documental-metrics?ticker=BTLG11`);
  assert.equal(unauthenticatedMetrics.status, 401);

  const emptyHistory = await fetch(`${baseUrl}/admin/api/documental-history?ticker=JSRE11`, {
    headers: { Authorization: auth },
  });
  assert.equal(emptyHistory.status, 200);
  assert.deepEqual((await emptyHistory.json()).history, []);

  const historyPayload = {
    ticker: "JSRE11",
    competencia: "2026-06",
    segmento: "Lajes / Multiestratégia",
    status: "analisado",
    fontes: { official: { name: "Safra Asset" } },
    resumoMes: "Resumo inicial",
    rendimentoOrigemDy: "Rendimento validado",
    portfolioQualidadeAtivos: "Portfólio corporativo",
    contratosInquilinos: "Dado não identificado nos documentos analisados.",
    obrasExpansoes: "Dado não identificado nos documentos analisados.",
    estrategiaVsPortfolio: "Estratégia coerente com lajes.",
    tipoGestao: "Ativa",
    estruturaCapitalAlavancagem: "Alavancagem sob acompanhamento.",
    historicoEmissoes: "Sem emissão identificada.",
    pontosPositivos: "Vacância menor.",
    pontosAtencao: "Concentração a validar.",
    eventosNaoRecorrentes: "Nenhum evento não recorrente identificado.",
    dadosNaoIdentificados: "WALE por receita.",
    explicacaoFinanceiraAquisicoes: "Dado não identificado nos documentos analisados.",
  };
  const createHistory = await fetch(`${baseUrl}/admin/api/documental-history`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(historyPayload),
  });
  assert.equal(createHistory.status, 201);
  const createdHistory = await createHistory.json();
  assert.equal(createdHistory.ok, true);
  assert.equal(createdHistory.record.ticker, "JSRE11");
  assert.equal(createdHistory.record.competencia, "2026-06");
  assert.doesNotMatch(JSON.stringify(createdHistory), /\.pdf|password|token|ADMIN_PASSWORD/i);
  const originalCreatedAt = createdHistory.record.createdAt;
  await new Promise((resolve) => setTimeout(resolve, 10));

  const updateHistory = await fetch(`${baseUrl}/admin/api/documental-history`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ ...historyPayload, resumoMes: "Resumo atualizado" }),
  });
  assert.equal(updateHistory.status, 200);
  const updatedHistory = await updateHistory.json();
  assert.equal(updatedHistory.created, false);
  assert.equal(updatedHistory.record.createdAt, originalCreatedAt);
  assert.notEqual(updatedHistory.record.updatedAt, originalCreatedAt);
  assert.equal(updatedHistory.record.resumoMes, "Resumo atualizado");

  const savedHistory = await fetch(`${baseUrl}/admin/api/documental-history?ticker=JSRE11`, {
    headers: { Authorization: auth },
  });
  const savedHistoryBody = await savedHistory.json();
  assert.equal(savedHistoryBody.history.length, 1);
  assert.equal(JSON.parse(await readFile(documentalHistoryPath, "utf8")).length, 1);

  const importHistory = await fetch(`${baseUrl}/admin/api/documental-history/import-sheet`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: "btlg11",
      competencia: "2026-06",
      segmento: "Logística",
      status: "analisado",
      fontes: "Relatório Gerencial + Informe Mensal + Fato Relevante",
      resumoMes: "Resumo importado da planilha.",
      tipoGestao: "",
      explicacaoFinanceiraAquisicoes: "Aquisições explicadas na planilha.",
    }),
  });
  assert.equal(importHistory.status, 201);
  const importHistoryBody = await importHistory.json();
  assert.equal(importHistoryBody.imported, true);
  assert.equal(importHistoryBody.ticker, "BTLG11");
  assert.equal(importHistoryBody.updated, false);

  const updateImportedHistory = await fetch(`${baseUrl}/admin/api/documental-history/import-sheet`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: "BTLG11",
      competencia: "2026-06",
      segmento: "Logística",
      resumoMes: "Resumo importado atualizado.",
    }),
  });
  assert.equal(updateImportedHistory.status, 200);
  const updateImportedHistoryBody = await updateImportedHistory.json();
  assert.equal(updateImportedHistoryBody.updated, true);

  const importedHistory = await fetch(`${baseUrl}/admin/api/documental-history?ticker=BTLG11`, {
    headers: { Authorization: auth },
  });
  const importedHistoryBody = await importedHistory.json();
  assert.equal(importedHistoryBody.history.length, 1);
  assert.equal(importedHistoryBody.history[0].resumoMes, "Resumo importado atualizado.");
  assert.equal(importedHistoryBody.history[0].fontes && Object.keys(importedHistoryBody.history[0].fontes).length, 0);

  const rejectedPdfHistory = await fetch(`${baseUrl}/admin/api/documental-history/import-sheet`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ ticker: "BTLG11", competencia: "2026-07", pdfUrl: "https://example.com/a.pdf" }),
  });
  assert.equal(rejectedPdfHistory.status, 400);

  const createEvent = await fetch(`${baseUrl}/admin/api/documental-timeline`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: "JSRE11",
      competencia: "2026-06",
      tipoEvento: "Vacância",
      classificacao: "Atenção",
      titulo: "WT Morumbi segue em negociação",
      descricao: "Evento registrado para acompanhamento.",
      fonte: "Relatório gerencial",
      status: "analisado",
    }),
  });
  assert.equal(createEvent.status, 201);
  const timeline = await fetch(`${baseUrl}/admin/api/documental-timeline?ticker=JSRE11`, {
    headers: { Authorization: auth },
  });
  const timelineBody = await timeline.json();
  assert.equal(timelineBody.events.length, 1);
  assert.equal(timelineBody.events[0].tipoEvento, "Vacância");

  const createSources = await fetch(`${baseUrl}/admin/api/documental-sources`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: "JSRE11",
      fonteOficialNome: "Safra Asset",
      fonteOficialUrl: "https://www.safra.com.br/safra-asset/fundo-imobiliario/js-real-estate.htm",
      fonteRegulatoriaNome: "FNET / CVM",
      fonteRegulatoriaUrl: "",
      atalhoConsultaNome: "Clube FII",
      atalhoConsultaUrl: "https://www.clubefii.com.br/fiis/JSRE11",
      driveFolderUrl: "https://drive.google.com/drive/folders/exemplo",
    }),
  });
  assert.equal(createSources.status, 201);
  const updateSources = await fetch(`${baseUrl}/admin/api/documental-sources`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: "jsre11",
      fonteOficialNome: "Safra Asset",
      atalhoConsultaNome: "Clube FII",
    }),
  });
  assert.equal(updateSources.status, 200);
  const sources = await fetch(`${baseUrl}/admin/api/documental-sources?ticker=JSRE11`, {
    headers: { Authorization: auth },
  });
  const sourcesBody = await sources.json();
  assert.equal(sourcesBody.sources.fonteOficialNome, "Safra Asset");
  assert.equal(JSON.parse(await readFile(documentalSourcesPath, "utf8")).length, 1);

  const createMetrics = await fetch(`${baseUrl}/admin/api/documental-metrics`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: "BTLG11",
      competencia: "2026-06",
      segmento: "Logística",
      vacanciaFisica: "4,4%",
      caixa: "R$ 7.081.112.753,36",
      abl: "1.435.343",
      cotaPatrimonial: "107,039120",
      fonte: "Informe Mensal + Relatório Gerencial",
      observacoes: "",
    }),
  });
  assert.equal(createMetrics.status, 201);
  const createMetricsBody = await createMetrics.json();
  assert.equal(createMetricsBody.record.vacanciaFisica, 4.4);
  assert.equal(createMetricsBody.record.caixa, 7081112753.36);
  assert.equal(createMetricsBody.record.abl, 1435343);
  assert.equal(createMetricsBody.record.cotaPatrimonial, 107.039120);
  assert.equal(createMetricsBody.record.dividendYield, null);

  const updateMetrics = await fetch(`${baseUrl}/admin/api/documental-metrics`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: "BTLG11",
      competencia: "2026-06",
      segmento: "Logística",
      dividendYield: 0.8562,
    }),
  });
  assert.equal(updateMetrics.status, 200);
  const updateMetricsBody = await updateMetrics.json();
  assert.equal(updateMetricsBody.updated, true);
  assert.equal(updateMetricsBody.record.dividendYield, 0.8562);

  const importMetrics = await fetch(`${baseUrl}/admin/api/documental-metrics/import-sheet`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: "BTLG11",
      competencia: "2026-07",
      segmento: "Logística",
      vacanciaFinanceira: "",
      passivos: "236.622.592,67",
      fonte: "Planilha documental",
    }),
  });
  assert.equal(importMetrics.status, 201);
  const importMetricsBody = await importMetrics.json();
  assert.equal(importMetricsBody.ticker, "BTLG11");

  const rejectedPdfMetrics = await fetch(`${baseUrl}/admin/api/documental-metrics/import-sheet`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ ticker: "BTLG11", competencia: "2026-08", filePath: "/tmp/a.pdf" }),
  });
  assert.equal(rejectedPdfMetrics.status, 400);

  const metrics = await fetch(`${baseUrl}/admin/api/documental-metrics?ticker=BTLG11`, {
    headers: { Authorization: auth },
  });
  const metricsBody = await metrics.json();
  assert.deepEqual(metricsBody.metrics.map((record) => record.competencia), ["2026-07", "2026-06"]);
  assert.equal(metricsBody.metrics[0].passivos, 236622592.67);
  assert.equal(JSON.parse(await readFile(documentalMetricsPath, "utf8")).length, 2);

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
