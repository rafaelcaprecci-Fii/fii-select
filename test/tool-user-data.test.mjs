import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
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

async function login(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/users/login-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("pesquisas e comparação são persistidas por usuário autenticado", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "fii-select-tool-data-"));
  const usersPath = join(directory, "users.json");
  const searchesPath = join(directory, "fii-searches.json");
  const comparisonsPath = join(directory, "user-comparisons.json");
  const preloadPath = join(directory, "mock-fetch.mjs");

  await writeFile(
    usersPath,
    JSON.stringify(
      [
        {
          id: "active-user",
          name: "Conta ativa",
          email: "active@example.com",
          accountType: "customer",
          status: "active",
        },
        {
          id: "internal-user",
          name: "Conta interna",
          email: "internal@example.com",
          accountType: "internal",
          status: "pending",
        },
      ],
      null,
      2,
    ),
  );
  await writeFile(
    preloadPath,
    [
      "const originalFetch = globalThis.fetch;",
      "const dividends = Array.from({ length: 12 }, (_, index) => ({ symbol: 'HGLG11', label: 'RENDIMENTO', rate: 1 + index / 100 }));",
      "globalThis.fetch = async (url, options = {}) => {",
      "  const href = String(url);",
      "  if (href.includes('api.bcb.gov.br')) {",
      "    return Response.json([{ valor: '10.50', data: '07/07/2026' }]);",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/indicators') && href.includes('APIF11')) {",
      "    return new Response('falha simulada', { status: 500 });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/indicators') && href.includes('XXXX11')) {",
      "    return Response.json({ fiis: [] });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/indicators') && href.includes('NAVN11')) {",
      "    return Response.json({ fiis: [{ symbol: 'NAVN11', name: 'Sem Patrimonio', price: 100, segmentType: 'tijolo', segmentoAtuacao: 'Logística' }] });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/indicators') && href.includes('SEMD11')) {",
      "    return Response.json({ fiis: [{ symbol: 'SEMD11', name: 'Sem Dividendos', price: 100, navPerShare: 100, priceToNav: 1, segmentType: 'tijolo', segmentoAtuacao: 'Logística' }] });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/indicators') && href.includes('FAGR11')) {",
      "    return Response.json({ fiis: [{ symbol: 'FAGR11', name: 'Fiagro Teste', price: 100, navPerShare: 100, priceToNav: 1, segmentType: 'fiagro', segmentoAtuacao: 'Agronegócio' }] });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/indicators')) {",
      "    return Response.json({ fiis: [{ symbol: 'HGLG11', name: 'Pátria Log', price: 160, navPerShare: 155, priceToNav: 1.03, segmentType: 'tijolo', segmentoAtuacao: 'Logística' }] });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/dividends') && href.includes('SEMD11')) {",
      "    return Response.json({ dividends: [] });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/dividends') && href.includes('NAVN11')) {",
      "    return Response.json({ dividends: dividends.map((item) => ({ ...item, symbol: 'NAVN11' })) });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/dividends') && href.includes('FAGR11')) {",
      "    return Response.json({ dividends: dividends.map((item) => ({ ...item, symbol: 'FAGR11' })) });",
      "  }",
      "  if (href.includes('brapi.dev/api/v2/fii/dividends')) {",
      "    return Response.json({ dividends });",
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

  const activeCookie = await login(baseUrl, "active@example.com");
  const internalCookie = await login(baseUrl, "internal@example.com");
  assert.match(activeCookie, /fii_select_session=/);
  assert.match(internalCookie, /fii_select_session=/);

  const validSearch = await fetch(`${baseUrl}/api/valuation?ticker= hglg11 `, {
    headers: { Cookie: activeCookie },
  });
  assert.equal(validSearch.status, 200);

  const invalidSearch = await fetch(`${baseUrl}/api/valuation?ticker=abc`, {
    headers: { Cookie: activeCookie },
  });
  assert.equal(invalidSearch.status, 400);
  assert.deepEqual(await invalidSearch.json(), {
    error: "Ticker inválido. Verifique o código do FII e tente novamente.",
    code: "invalid_ticker",
  });

  const missingSearch = await fetch(`${baseUrl}/api/valuation?ticker=XXXX11`, {
    headers: { Cookie: activeCookie },
  });
  assert.equal(missingSearch.status, 400);
  assert.deepEqual(await missingSearch.json(), {
    error: "Não encontramos dados para este ticker.",
    code: "ticker_not_found",
  });

  const noDividendsSearch = await fetch(`${baseUrl}/api/valuation?ticker=SEMD11`, {
    headers: { Cookie: activeCookie },
  });
  assert.equal(noDividendsSearch.status, 400);
  assert.deepEqual(await noDividendsSearch.json(), {
    error: "Ainda não há dados suficientes para calcular a estimativa deste FII.",
    code: "insufficient_data",
  });

  const noPatrimonySearch = await fetch(`${baseUrl}/api/valuation?ticker=NAVN11`, {
    headers: { Cookie: activeCookie },
  });
  assert.equal(noPatrimonySearch.status, 400);
  assert.deepEqual(await noPatrimonySearch.json(), {
    error: "Ainda não há dados suficientes para calcular a estimativa deste FII.",
    code: "insufficient_data",
  });

  const apiFailureSearch = await fetch(`${baseUrl}/api/valuation?ticker=APIF11`, {
    headers: { Cookie: activeCookie },
  });
  assert.equal(apiFailureSearch.status, 400);
  assert.deepEqual(await apiFailureSearch.json(), {
    error: "Não conseguimos consultar os dados deste FII agora. Tente novamente em alguns instantes.",
    code: "api_unavailable",
  });

  const unsupportedTypeSearch = await fetch(`${baseUrl}/api/valuation?ticker=FAGR11`, {
    headers: { Cookie: activeCookie },
  });
  assert.equal(unsupportedTypeSearch.status, 400);
  assert.deepEqual(await unsupportedTypeSearch.json(), {
    error: "Este tipo de fundo ainda está em evolução na metodologia do FII Select.",
    code: "unsupported_type",
  });

  const internalSearch = await fetch(`${baseUrl}/api/valuation?ticker=HGLG11`, {
    headers: { Cookie: internalCookie },
  });
  assert.equal(internalSearch.status, 200);

  const suggestions = await fetch(
    `${baseUrl}/api/suggestions?ticker=HGLG11&exclude=BTLG11,BRCO11`,
    { headers: { Cookie: activeCookie } },
  );
  assert.equal(suggestions.status, 200);
  const suggestionTickers = (await suggestions.json()).suggestions.map((item) => item.ticker);
  assert.ok(!suggestionTickers.includes("BTLG11"));
  assert.ok(!suggestionTickers.includes("BRCO11"));
  assert.equal(new Set(suggestionTickers).size, suggestionTickers.length);
  assert.ok(suggestionTickers.length > 0);

  const searchEvents = await readJson(searchesPath);
  assert.deepEqual(
    searchEvents.map((event) => ({ userId: event.userId, ticker: event.ticker })),
    [
      { userId: "active-user", ticker: "HGLG11" },
      { userId: "internal-user", ticker: "HGLG11" },
    ],
  );
  assert.ok(searchEvents.every((event) => event.searchedAt));
  assert.ok(searchEvents.every((event) => !("email" in event)));

  await writeFile(
    searchesPath,
    JSON.stringify(
      [
        {
          userId: "active-user",
          ticker: "HGLG11",
          searchedAt: "2026-07-07T10:00:00.000Z",
          email: "nao-deve-aparecer@example.com",
        },
        {
          userId: "active-user",
          ticker: "hglg11",
          searchedAt: "2026-07-07T10:05:00.000Z",
        },
        {
          userId: "internal-user",
          ticker: "MXRF11",
          searchedAt: "2026-07-07T10:10:00.000Z",
        },
      ],
      null,
      2,
    ),
  );
  const adminAuth = `Basic ${Buffer.from("admin-test:password-test").toString("base64")}`;
  const unauthenticatedSearches = await fetch(`${baseUrl}/admin/api/fii-searches`);
  assert.equal(unauthenticatedSearches.status, 401);

  const beforeAdminRead = await readFile(searchesPath, "utf8");
  const adminSearches = await fetch(`${baseUrl}/admin/api/fii-searches`, {
    headers: { Authorization: adminAuth },
  });
  assert.equal(adminSearches.status, 200);
  const summary = await adminSearches.json();
  assert.equal(summary.ok, true);
  assert.equal(summary.totalSearches, 3);
  assert.equal(summary.uniqueUsers, 2);
  assert.deepEqual(summary.topTickers, [
    { ticker: "HGLG11", total: 2, uniqueUsers: 1 },
    { ticker: "MXRF11", total: 1, uniqueUsers: 1 },
  ]);
  assert.deepEqual(
    summary.recentSearches.map((event) => event.ticker),
    ["MXRF11", "HGLG11", "HGLG11"],
  );
  assert.doesNotMatch(JSON.stringify(summary), /email|@/i);
  assert.equal(await readFile(searchesPath, "utf8"), beforeAdminRead);

  await unlink(searchesPath);
  const emptySearches = await fetch(`${baseUrl}/admin/api/fii-searches`, {
    headers: { Authorization: adminAuth },
  });
  assert.equal(emptySearches.status, 200);
  assert.deepEqual(await emptySearches.json(), {
    ok: true,
    totalSearches: 0,
    uniqueUsers: 0,
    topTickers: [],
    recentSearches: [],
  });

  const saved = await fetch(`${baseUrl}/api/user-comparison`, {
    method: "PATCH",
    headers: {
      Cookie: activeCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tickers: [" hglg11 ", "BTLG11", "HGLG11", "XPML11", "KNCR11", "MXRF11", "VISC11"],
    }),
  });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).tickers, ["HGLG11", "BTLG11", "XPML11", "KNCR11", "MXRF11"]);

  const restored = await fetch(`${baseUrl}/api/user-comparison`, {
    headers: { Cookie: activeCookie },
  });
  assert.deepEqual((await restored.json()).tickers, ["HGLG11", "BTLG11", "XPML11", "KNCR11", "MXRF11"]);

  const otherUser = await fetch(`${baseUrl}/api/user-comparison`, {
    headers: { Cookie: internalCookie },
  });
  assert.deepEqual((await otherUser.json()).tickers, ["MXRF11"]);

  const cleared = await fetch(`${baseUrl}/api/user-comparison`, {
    method: "PATCH",
    headers: {
      Cookie: activeCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tickers: [] }),
  });
  assert.equal(cleared.status, 200);
  assert.deepEqual((await cleared.json()).tickers, []);

  const persistedComparisons = await readJson(comparisonsPath);
  assert.deepEqual(persistedComparisons.find((item) => item.userId === "active-user").tickers, []);
});
