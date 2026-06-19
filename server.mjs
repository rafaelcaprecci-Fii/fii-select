import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const outputDir = join(root, "outputs");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const brapiToken = process.env.BRAPI_TOKEN || "";
const sandboxTickers = new Set(["MXRF11", "HGLG11"]);
const cache = new Map();
const fiiCatalog = [
  { ticker: "MXRF11", segmentType: "papel", label: "Maxi Renda", sandbox: true },
  { ticker: "KNCR11", segmentType: "papel", label: "Kinea Rendimentos", sandbox: false },
  { ticker: "KNSC11", segmentType: "papel", label: "Kinea Securities", sandbox: false },
  { ticker: "KNIP11", segmentType: "papel", label: "Kinea Indices de Precos", sandbox: false },
  { ticker: "RBRR11", segmentType: "papel", label: "RBR Rendimento High Grade", sandbox: false },
  { ticker: "CPTS11", segmentType: "papel", label: "Capitania Securities II", sandbox: false },
  { ticker: "HGLG11", segmentType: "tijolo", label: "Patria Log", sandbox: true },
  { ticker: "XPLG11", segmentType: "tijolo", label: "XP Log", sandbox: false },
  { ticker: "BTLG11", segmentType: "tijolo", label: "BTG Pactual Logistica", sandbox: false },
  { ticker: "LVBI11", segmentType: "tijolo", label: "VBI Logistico", sandbox: false },
  { ticker: "BRCO11", segmentType: "tijolo", label: "Bresco Logistica", sandbox: false },
  { ticker: "GGRC11", segmentType: "tijolo", label: "GGR Covepi Renda", sandbox: false },
];

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function numberParam(url, name, fallback, min, max) {
  const raw = url.searchParams.get(name);
  const value = raw === null || raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`O campo "${name}" deve ficar entre ${min} e ${max}.`);
  }
  return value;
}

async function cached(key, ttlMs, loader) {
  const stored = cache.get(key);
  if (stored && Date.now() - stored.at < ttlMs) return stored.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function upstream(url) {
  const headers = brapiToken ? { Authorization: `Bearer ${brapiToken}` } : {};
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Fonte de dados respondeu ${response.status}: ${message.slice(0, 180)}`);
  }
  return response.json();
}

async function getSelic() {
  return cached("selic", 60 * 60 * 1000, async () => {
    const response = await fetch(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json",
    );
    if (!response.ok) throw new Error("Nao foi possivel consultar a Selic no Banco Central.");
    const [latest] = await response.json();
    return { annualRate: Number(latest.valor) / 100, asOfDate: latest.data };
  });
}

async function getFiiData(ticker) {
  if (!brapiToken && !sandboxTickers.has(ticker)) {
    throw new Error(
      "Modo demonstracao: use MXRF11 ou HGLG11. Para consultar outros fundos, configure BRAPI_TOKEN.",
    );
  }

  return cached(`fii:${ticker}`, 15 * 60 * 1000, async () => {
    const [indicatorsPayload, dividendsPayload] = await Promise.all([
      upstream(`https://brapi.dev/api/v2/fii/indicators?symbols=${encodeURIComponent(ticker)}`),
      upstream(`https://brapi.dev/api/v2/fii/dividends?symbols=${encodeURIComponent(ticker)}&sortOrder=desc`),
    ]);

    const indicators = indicatorsPayload.fiis?.[0];
    if (!indicators) throw new Error("Ticker nao encontrado na fonte de dados.");

    const dividends = (dividendsPayload.dividends || [])
      .filter((item) => item.symbol === ticker && item.label === "RENDIMENTO")
      .slice(0, 12);

    if (dividends.length < 6) {
      throw new Error("Historico insuficiente de rendimentos para calcular uma media confiavel.");
    }

    return { indicators, dividends };
  });
}

async function valuation(url) {
  const ticker = (url.searchParams.get("ticker") || "MXRF11").trim().toUpperCase();
  if (!/^[A-Z]{4}[0-9]{2}$/.test(ticker)) {
    throw new Error("Informe um ticker de FII no formato MXRF11.");
  }

  const riskRate = numberParam(url, "riskRate", 0.025, 0, 0.3);
  const growthRate = numberParam(url, "growthRate", 0.03, -0.1, 0.15);
  const recurrence = numberParam(url, "recurrence", 0.95, 0.5, 1);
  const [{ annualRate: selicRate, asOfDate: selicAsOfDate }, { indicators, dividends }] =
    await Promise.all([getSelic(), getFiiData(ticker)]);

  const requiredReturn = selicRate + riskRate;
  if (requiredReturn <= growthRate) {
    throw new Error("O retorno exigido deve ser maior que o crescimento esperado.");
  }

  const averageMonthlyDividend =
    dividends.reduce((sum, item) => sum + Number(item.rate || 0), 0) / dividends.length;
  const normalizedMonthlyDividend = averageMonthlyDividend * recurrence;
  const nextTwelveMonthsDividend = normalizedMonthlyDividend * 12 * (1 + growthRate);
  const fairValue = nextTwelveMonthsDividend / (requiredReturn - growthRate);
  const currentPrice = Number(indicators.price);
  const navPerShare = Number(indicators.navPerShare);
  const priceToNav = Number(indicators.priceToNav);
  const premiumDiscount = currentPrice / fairValue - 1;
  const reading =
    premiumDiscount < -0.05
      ? "DESAGIO"
      : premiumDiscount > 0.05
        ? "AGIO"
        : "PROXIMO DO JUSTO";
  const patrimonialReading =
    priceToNav < 0.95
      ? "DESCONTO PATRIMONIAL"
      : priceToNav > 1.05
        ? "PREMIO PATRIMONIAL"
        : "PROXIMO DO VP";
  const divergence =
    reading === "DESAGIO" && priceToNav >= 1.05
      ? "Renda sugere desagio, mas a cota negocia acima do VP. Vale investigar a qualidade e a recorrencia dos rendimentos."
      : reading === "AGIO" && priceToNav <= 0.95
        ? "Renda sugere agio, mas a cota negocia abaixo do VP. O relatorio gerencial pode explicar riscos ou eventos que pressionam o preco."
        : "As leituras por renda e patrimonio nao apresentam uma divergencia relevante.";

  return {
    ticker,
    fund: {
      name: indicators.name,
      segmentType: indicators.segmentType,
      segmentoAtuacao: indicators.segmentoAtuacao,
      currentPrice: round(currentPrice),
      navPerShare: round(navPerShare),
      priceToNav: round(priceToNav, 4),
      patrimonialReading,
      dataAsOfDate: indicators.asOfDate,
    },
    assumptions: {
      selicRate,
      selicAsOfDate,
      riskRate,
      growthRate,
      recurrence,
      requiredReturn,
    },
    valuation: {
      dividendsUsed: dividends.length,
      averageMonthlyDividend: round(averageMonthlyDividend, 4),
      normalizedMonthlyDividend: round(normalizedMonthlyDividend, 4),
      nextTwelveMonthsDividend: round(nextTwelveMonthsDividend, 4),
      fairValue: round(fairValue),
      premiumDiscount: round(premiumDiscount, 4),
      reading,
      divergence,
    },
    source: {
      provider: "brapi.dev + Banco Central do Brasil",
      sandbox: !brapiToken,
      methodology: "Valor justo = D1 / (k - g)",
    },
  };
}

function suggestions(url) {
  const ticker = (url.searchParams.get("ticker") || "MXRF11").trim().toUpperCase();
  if (!/^[A-Z]{4}[0-9]{2}$/.test(ticker)) {
    throw new Error("Informe um ticker de FII no formato MXRF11.");
  }
  const selected = fiiCatalog.find((item) => item.ticker === ticker);
  const segmentType = selected?.segmentType || url.searchParams.get("segmentType") || "papel";
  const matches = fiiCatalog
    .filter((item) => item.ticker !== ticker && item.segmentType === segmentType)
    .slice(0, 5)
    .map((item) => ({
      ...item,
      availableNow: Boolean(brapiToken || item.sandbox),
      reason: `Mesmo tipo de fundo: ${segmentType}`,
    }));

  return {
    ticker,
    segmentType,
    suggestions: matches,
    source: selected ? "catalogo inicial do MVP" : "tipo informado pelo usuario",
  };
}

async function comparison(url) {
  const tickers = [...new Set((url.searchParams.get("tickers") || "")
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean))];

  if (!tickers.length || tickers.length > 5) {
    throw new Error("Escolha entre 1 e 5 tickers para comparar.");
  }

  const sharedRiskRate = numberParam(url, "riskRate", 0.025, 0, 0.3);
  const growthRate = numberParam(url, "growthRate", 0.03, -0.1, 0.15);
  const recurrence = numberParam(url, "recurrence", 0.95, 0.5, 1);
  const individualRiskRates = Object.fromEntries(
    (url.searchParams.get("individualRiskRates") || "")
      .split(",")
      .map((pair) => pair.split(":"))
      .filter(([ticker, value]) => ticker && Number.isFinite(Number(value)))
      .map(([ticker, value]) => [ticker.toUpperCase(), Number(value)]),
  );

  const rows = await Promise.all(
    tickers.map(async (ticker) => {
      const riskRate = individualRiskRates[ticker] ?? sharedRiskRate;
      const innerUrl = new URL("http://localhost/api/valuation");
      innerUrl.searchParams.set("ticker", ticker);
      innerUrl.searchParams.set("riskRate", String(riskRate));
      innerUrl.searchParams.set("growthRate", String(growthRate));
      innerUrl.searchParams.set("recurrence", String(recurrence));
      try {
        return { ok: true, ...(await valuation(innerUrl)) };
      } catch (error) {
        return {
          ok: false,
          ticker,
          riskRate,
          error: error.message,
          requiresToken: !brapiToken && !sandboxTickers.has(ticker),
        };
      }
    }),
  );

  return { rows, sharedRiskRate, source: brapiToken ? "token configurado" : "sandbox" };
}

async function serveStatic(req, res, pathname) {
  const routeMap = {
    "/": "index.html",
    "/cadastro": "cadastro.html",
    "/cadastro-teste": "cadastro-teste.html",
    "/cadastro-assinatura": "cadastro-assinatura.html",
    "/login": "login.html",
    "/login-teste": "login-teste.html",
    "/login-assinatura": "login-assinatura.html",
    "/confirmacao-email-teste": "confirmacao-email-teste.html",
    "/confirmacao-email-assinatura": "confirmacao-email-assinatura.html",
    "/teste": "teste.html",
    "/status-teste-pendente": "status-teste-pendente.html",
    "/status-teste-ativo": "status-teste-ativo.html",
    "/teste-encerrado": "teste-encerrado.html",
    "/assinar": "assinar.html",
    "/status-pendente": "status-pendente.html",
    "/status-aprovado": "status-aprovado.html",
    "/conta": "conta.html",
    "/conta-inativa": "conta-inativa.html",
    "/ferramenta": "ferramenta.html",
    "/admin/login": "admin-login.html",
    "/admin": "admin.html",
    "/admin/usuarios": "admin.html",
  };
  const relative = routeMap[pathname] || pathname.slice(1);
  const file = normalize(join(publicDir, relative));
  if (!file.startsWith(publicDir)) return json(res, 403, { error: "Acesso negado." });
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  } catch {
    json(res, 404, { error: "Pagina nao encontrada." });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        provider: "brapi.dev",
        mode: brapiToken ? "token configurado" : "sandbox",
      });
    }
    if (url.pathname === "/api/valuation") return json(res, 200, await valuation(url));
    if (url.pathname === "/api/suggestions") return json(res, 200, suggestions(url));
    if (url.pathname === "/api/comparison") return json(res, 200, await comparison(url));
    if (url.pathname === "/api/demo-video" && req.method === "POST") {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 30 * 1024 * 1024) throw new Error("Video excedeu o limite de 30 MB.");
        chunks.push(chunk);
      }
      await mkdir(outputDir, { recursive: true });
      const path = join(outputDir, "fii-select-widget-demo.webm");
      await writeFile(path, Buffer.concat(chunks));
      return json(res, 200, { ok: true, path, bytes: size });
    }
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    return json(res, 400, { error: error.message || "Falha inesperada." });
  }
});

server.listen(port, host, () => {
  console.log(`FII Select widget: http://${host}:${port}`);
  console.log(brapiToken ? "API: token configurado" : "API: sandbox MXRF11/HGLG11");
});
