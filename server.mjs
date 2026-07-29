import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCrossedReading } from "./lib/crossed-reading.mjs";
import { createBrapiUsageTracker } from "./lib/brapi-usage.mjs";
import { buildAppUrl } from "./lib/app-urls.mjs";
import {
  applyEmailVerification,
  createEmailVerification,
  hashEmailVerificationToken,
  validateEmailVerificationToken,
} from "./lib/email-verification.mjs";
import {
  ensureUsersFile,
  readUsersFile,
  resolveUsersDataPath,
  writeUsersFile,
} from "./lib/users-json-store.mjs";
import {
  ensureJsonFile,
  readJsonFile,
  resolveJsonDataPath,
  writeJsonFileAtomic,
} from "./lib/json-file-store.mjs";
import {
  accountTypeForPublicRegistration,
  canAccountAccessTool,
  findUniqueUserByEmail,
  isEmailVerified,
  isInternalAccount,
  normalizeAdministrativeAccountType,
  normalizeAdministrativeEmail,
  shouldRunCommercialAutomation,
} from "./lib/user-account-policy.mjs";
import {
  normalizeFundClassification,
  selectComparableFunds,
} from "./lib/fund-comparables.mjs";
import {
  auditedTestUserCleanupConfirmation,
  removeAuditedTestUsers,
} from "./lib/audited-test-user-cleanup.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const outputDir = join(root, "outputs");
const usersFile = resolveUsersDataPath({
  rootDir: root,
  configuredPath: process.env.USERS_DATA_PATH,
});
const fiiSearchLogFile = resolveJsonDataPath({
  rootDir: root,
  configuredPath: process.env.FII_SEARCH_LOG_PATH,
  fallbackRelativePath: join("data", "fii-searches.json"),
});
const userComparisonsFile = resolveJsonDataPath({
  rootDir: root,
  configuredPath: process.env.USER_COMPARISONS_PATH,
  fallbackRelativePath: join("data", "user-comparisons.json"),
});
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const brapiToken = process.env.BRAPI_TOKEN || "";
const adminUser = process.env.ADMIN_USER || "";
const adminPassword = process.env.ADMIN_PASSWORD || "";
const clientSessionCookie = "fii_select_session";
const clientSessionMaxAge = 60 * 60 * 24 * 30;
const protectedAdminRoutes = new Set([
  "/admin",
  "/admin.html",
  "/admin/documental-lab",
  "/admin/documental-lab.html",
  "/admin/login",
  "/admin-login.html",
  "/admin-negativa.html",
  "/admin/usuarios",
  "/admin/testar-email",
]);
const protectedAdminApiPrefix = "/admin/api/";
const platformContactUrl =
  "https://wa.me/5511971780101?text=Ol%C3%A1.%20Quero%20reativar%20meu%20acesso%20ao%20FII%20Select.";
const templateEnvByEvent = {
  cadastroRecebidoTeste: "BREVO_TEMPLATE_CADASTRO_RECEBIDO_TESTE",
  cadastroRecebidoFundador: "BREVO_TEMPLATE_CADASTRO_RECEBIDO_FUNDADOR",
  cadastroNaoAprovado: "BREVO_TEMPLATE_CADASTRO_NAO_APROVADO",
  testeFinalizado: "BREVO_TEMPLATE_TESTE_FINALIZADO",
  contaArquivada: "BREVO_TEMPLATE_CONTA_ARQUIVADA",
  contaInativada: "BREVO_TEMPLATE_CONTA_INATIVADA",
  acessoLiberadoFundador: "BREVO_TEMPLATE_ACESSO_LIBERADO_FUNDADOR",
  acessoLiberadoTeste: "BREVO_TEMPLATE_ACESSO_LIBERADO_TESTE",
};
const eventLabel = {
  cadastroRecebidoTeste: "Cadastro de teste recebido",
  cadastroRecebidoFundador: "Cadastro do Plano Fundador recebido",
  cadastroNaoAprovado: "Cadastro não aprovado",
  testeFinalizado: "Teste de 7 dias terminou",
  contaArquivada: "Conta arquivada",
  contaInativada: "Conta inativada",
  acessoLiberadoFundador: "Acesso ao Plano Fundador liberado",
  acessoLiberadoTeste: "Acesso ao teste de 7 dias liberado",
};
const sandboxTickers = new Set(["MXRF11", "HGLG11"]);
const brapiTestTickers = ["MXRF11", "HGLG11", "KNCR11", "XPML11", "VISC11"];
const cache = new Map();
const brapiUsage = createBrapiUsageTracker({ lastRequestsLimit: 50 });
const clientSessions = new Map();
const rateLimits = new Map();
let usersQueue = Promise.resolve();
let fiiSearchLogQueue = Promise.resolve();
let userComparisonsQueue = Promise.resolve();
const fiiCatalog = [
  { ticker: "MXRF11", segmentType: "papel", segmentoAtuacao: "Títulos e Valores Mobiliários", label: "Maxi Renda", sandbox: true },
  { ticker: "KNCR11", segmentType: "papel", segmentoAtuacao: "Títulos e Valores Mobiliários", label: "Kinea Rendimentos", sandbox: false },
  { ticker: "KNSC11", segmentType: "papel", segmentoAtuacao: "Títulos e Valores Mobiliários", label: "Kinea Securities", sandbox: false },
  { ticker: "KNIP11", segmentType: "papel", segmentoAtuacao: "Títulos e Valores Mobiliários", label: "Kinea Índices de Preços", sandbox: false },
  { ticker: "RBRR11", segmentType: "papel", segmentoAtuacao: "Títulos e Valores Mobiliários", label: "RBR Rendimento High Grade", sandbox: false },
  { ticker: "CPTS11", segmentType: "papel", segmentoAtuacao: "Títulos e Valores Mobiliários", label: "Capitania Securities II", sandbox: false },
  { ticker: "HGLG11", segmentType: "tijolo", segmentoAtuacao: "Logística", label: "Pátria Log", sandbox: true },
  { ticker: "XPLG11", segmentType: "tijolo", segmentoAtuacao: "Logística", label: "XP Log", sandbox: false },
  { ticker: "BTLG11", segmentType: "tijolo", segmentoAtuacao: "Logística", label: "BTG Pactual Logística", sandbox: false },
  { ticker: "LVBI11", segmentType: "tijolo", segmentoAtuacao: "Logística", label: "VBI Logístico", sandbox: false },
  { ticker: "BRCO11", segmentType: "tijolo", segmentoAtuacao: "Logística", label: "Bresco Logística", sandbox: false },
  { ticker: "HGRE11", segmentType: "tijolo", segmentoAtuacao: "Lajes Corporativas", label: "Pátria Escritórios", sandbox: false },
  { ticker: "RCRB11", segmentType: "tijolo", segmentoAtuacao: "Lajes Corporativas", label: "Rio Bravo Renda Corporativa", sandbox: false },
  { ticker: "BRCR11", segmentType: "tijolo", segmentoAtuacao: "Lajes Corporativas", label: "BTG Pactual Corporate Office", sandbox: false },
  { ticker: "PVBI11", segmentType: "tijolo", segmentoAtuacao: "Lajes Corporativas", label: "VBI Prime Properties", sandbox: false },
  { ticker: "XPML11", segmentType: "tijolo", segmentoAtuacao: "Shoppings", label: "XP Malls", sandbox: false },
  { ticker: "VISC11", segmentType: "tijolo", segmentoAtuacao: "Shoppings", label: "Vinci Shopping Centers", sandbox: false },
  { ticker: "HGBS11", segmentType: "tijolo", segmentoAtuacao: "Shoppings", label: "Hedge Brasil Shopping", sandbox: false },
  { ticker: "HSML11", segmentType: "tijolo", segmentoAtuacao: "Shoppings", label: "HSI Malls", sandbox: false },
  { ticker: "HGRU11", segmentType: "tijolo", segmentoAtuacao: "Renda Urbana", label: "Pátria Renda Urbana", sandbox: false },
  { ticker: "TRXF11", segmentType: "tijolo", segmentoAtuacao: "Renda Urbana", label: "TRX Real Estate", sandbox: false },
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
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data:",
      "font-src 'self' https://fonts.gstatic.com",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  };
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local")
    .split(",")[0]
    .trim();
}

function checkRateLimit(req, res, bucket, limit, windowMs) {
  const now = Date.now();
  const key = `${bucket}:${clientIp(req)}`;
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  current.count += 1;
  if (current.count <= limit) return true;

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  res.writeHead(429, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Retry-After": String(retryAfter),
  });
  res.end(JSON.stringify({ ok: false, error: "Muitas tentativas. Tente novamente em instantes." }));
  return false;
}

function isAdminPath(pathname) {
  return protectedAdminRoutes.has(pathname) || pathname.startsWith(protectedAdminApiPrefix);
}

function safeCompare(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [decodeURIComponent(part), ""]
          : [decodeURIComponent(part.slice(0, separator)), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function createClientSession(res, req, userId) {
  const token = randomUUID();
  const expiresAt = Date.now() + clientSessionMaxAge * 1000;
  const secure = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";

  clientSessions.set(token, { userId, expiresAt });
  res.setHeader(
    "Set-Cookie",
    `${clientSessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clientSessionMaxAge}${secure ? "; Secure" : ""}`,
  );
}

function clearClientSession(res, req) {
  const token = parseCookies(req)[clientSessionCookie] || "";
  if (token) clientSessions.delete(token);
  const secure = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  res.setHeader(
    "Set-Cookie",
    `${clientSessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`,
  );
}

async function sessionUser(req) {
  const token = parseCookies(req)[clientSessionCookie] || "";
  const session = clientSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    clientSessions.delete(token);
    return null;
  }

  return withUsers(async (users) => users.find((user) => user.id === session.userId) || null);
}

function requireAdminAuth(req, res) {
  if (!adminUser || !adminPassword) {
    json(res, 503, { error: "Admin indisponivel: credenciais nao configuradas." });
    return false;
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.writeHead(401, {
      ...securityHeaders(),
      "WWW-Authenticate": 'Basic realm="FII Select Admin"',
      "Cache-Control": "no-store",
    });
    res.end("Autenticacao obrigatoria.");
    return false;
  }

  const [user, ...passwordParts] = Buffer.from(encoded, "base64").toString("utf8").split(":");
  const password = passwordParts.join(":");
  if (!safeCompare(user, adminUser) || !safeCompare(password, adminPassword)) {
    res.writeHead(401, {
      ...securityHeaders(),
      "WWW-Authenticate": 'Basic realm="FII Select Admin"',
      "Cache-Control": "no-store",
    });
    res.end("Credenciais invalidas.");
    return false;
  }

  return true;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel ${name} nao configurada.`);
  return value;
}

function parseEmailFrom(value) {
  const match = value.match(/^(.*)<([^>]+)>$/);
  if (!match) return { email: value.trim() };
  const name = match[1].trim().replace(/^"|"$/g, "");
  return { email: match[2].trim(), ...(name ? { name } : {}) };
}

function originFrom(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const forwardedHost = req.headers["x-forwarded-host"];
  return `${protocol}://${forwardedHost || req.headers.host || "localhost"}`;
}

function formatBrazilDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatBrazilDateTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nonEmptyString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function logInternalError(context, error) {
  console.error(`${context}: ${error.message || "Falha inesperada."}`);
}

function publicEmailError() {
  return "Não foi possível enviar o e-mail agora. Tente novamente em instantes.";
}

function publicDataError() {
  return "Não foi possível consultar os dados no momento. Tente novamente em instantes.";
}

const valuationErrorMessages = {
  invalid_ticker: "Ticker inválido. Verifique o código do FII e tente novamente.",
  ticker_not_found: "Não encontramos dados para este ticker.",
  insufficient_data: "Ainda não há dados suficientes para calcular a estimativa deste FII.",
  api_unavailable: "Não conseguimos consultar os dados deste FII agora. Tente novamente em alguns instantes.",
  unsupported_type: "Este tipo de fundo ainda está em evolução na metodologia do FII Select.",
  calculation_error: "Não foi possível calcular a estimativa deste FII no momento.",
};

function valuationError(code, { status = 400, internalMessage = "" } = {}) {
  const error = new Error(valuationErrorMessages[code] || valuationErrorMessages.calculation_error);
  error.publicCode = code;
  error.status = status;
  if (internalMessage) error.internalMessage = internalMessage;
  return error;
}

function isValuationError(error) {
  return Boolean(error?.publicCode && valuationErrorMessages[error.publicCode]);
}

function brevoTemplateParams(user) {
  const name = nonEmptyString(user.name, "Investidor");
  const email = nonEmptyString(user.email);
  return {
    NOME: name,
    EMAIL: email,
    LINK_LOGIN: buildAppUrl("/login.html"),
    LINK_ACESSO: "",
    LINK_PLANOS: nonEmptyString(user.linkPlanos, buildAppUrl("/assinar.html")),
    LINK_REATIVACAO: nonEmptyString(user.linkReativacao, platformContactUrl),
    DATA_INICIO_TESTE: formatBrazilDate(user.trialStartAt || user.trialStartedAt),
    DATA_FIM_TESTE: formatBrazilDate(user.trialEndAt || user.trialEndsAt),
  };
}

function brevoTemplatePayload({ user, event, origin, emailFrom }) {
  const templateEnv = templateEnvByEvent[event];
  if (!templateEnv) throw new Error(`Evento Brevo desconhecido: ${event}.`);

  const templateId = Number(requireEnv(templateEnv));
  const params = brevoTemplateParams(user);
  if (["cadastroRecebidoTeste", "cadastroRecebidoFundador"].includes(event)) {
    delete params.LINK_ACESSO;
  } else if (event === "acessoLiberadoTeste") {
    params.LINK_ACESSO = buildAppUrl("/status-teste-ativo.html");
    delete params.LINK_LOGIN;
  } else if (event === "acessoLiberadoFundador") {
    params.LINK_ACESSO = buildAppUrl("/status-aprovado.html");
    delete params.LINK_LOGIN;
  } else if (event === "contaInativada") {
    params.LINK_ACESSO = buildAppUrl("/conta-inativa.html");
    delete params.LINK_LOGIN;
  } else if (event === "contaArquivada") {
    params.LINK_ACESSO = buildAppUrl("/conta-arquivada.html");
    delete params.LINK_LOGIN;
  } else {
    delete params.LINK_LOGIN;
    delete params.LINK_ACESSO;
  }
  if (!params.EMAIL) throw new Error("E-mail do usuario vazio. Envio nao realizado.");
  if (!Number.isInteger(templateId) || templateId <= 0) {
    throw new Error(`Template Brevo invalido para ${templateEnv}.`);
  }

  return {
    sender: parseEmailFrom(emailFrom),
    to: [{ email: params.EMAIL, name: params.NOME }],
    templateId,
    params,
  };
}

async function sendEmailVerificationEmail({ user, token }) {
  const brevoApiKey = requireEnv("BREVO_API_KEY");
  const emailFrom = requireEnv("EMAIL_FROM");
  const templateEnv = "BREVO_TEMPLATE_EMAIL_VERIFICACAO";
  let templateId;
  try {
    templateId = Number(requireEnv(templateEnv));
    if (!Number.isInteger(templateId) || templateId <= 0) {
      throw new Error(`Template Brevo invalido para ${templateEnv}.`);
    }
  } catch (error) {
    const safeError = new Error(publicEmailError());
    safeError.internalMessage = error.message || `Template Brevo invalido para ${templateEnv}.`;
    throw safeError;
  }
  const verificationUrl = buildAppUrl(
    `/api/users/verify-email?token=${encodeURIComponent(token)}`,
  );
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: parseEmailFrom(emailFrom),
      to: [{ email: user.email, name: nonEmptyString(user.name, "Investidor") }],
      templateId,
      params: {
        LINK_EMAIL: verificationUrl,
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    const error = new Error(publicEmailError());
    error.internalMessage = `Brevo API respondeu ${response.status}: ${message.slice(0, 180)}`;
    throw error;
  }
}

async function sendBrevoTransactionalEmail({ user, event, origin }) {
  const brevoApiKey = requireEnv("BREVO_API_KEY");
  const emailFrom = requireEnv("EMAIL_FROM");
  const payload = brevoTemplatePayload({ user, event, origin, emailFrom });

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    const error = new Error(publicEmailError());
    error.internalMessage = `Brevo API respondeu ${response.status}: ${message.slice(0, 180)}`;
    throw error;
  }

  return { templateId: payload.templateId };
}

async function sendBrevoApiTestEmail() {
  const user = {
    name: "Rafael Caprecci",
    email: "rafael.caprecci@2bold.com.br",
  };
  const brevoApiKey = requireEnv("BREVO_API_KEY");
  const emailFrom = requireEnv("EMAIL_FROM");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: parseEmailFrom(emailFrom),
      to: [{ email: user.email, name: user.name }],
      subject: "Teste Brevo API FII Select",
      textContent: "O envio de e-mail do FII Select via Brevo API funcionou.",
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    const error = new Error(publicEmailError());
    error.internalMessage = `Brevo API respondeu ${response.status}: ${message.slice(0, 180)}`;
    throw error;
  }
}

async function readUsers() {
  return readUsersFile(usersFile);
}

async function writeUsers(users) {
  return writeUsersFile(usersFile, users);
}

function withUsers(mutator) {
  const run = usersQueue.then(async () => {
    const users = await readUsers();
    const result = await mutator(users);
    await writeUsers(users);
    return result;
  });
  usersQueue = run.catch(() => {});
  return run;
}

async function removeAuditedTestUsersFromStore() {
  return removeAuditedTestUsers({
    readUsers,
    writeUsers: (users) => writeJsonFileAtomic(usersFile, users),
    createBackup: async (backupName, users) => {
      const backupPath = join(dirname(usersFile), "backups", backupName);
      await writeJsonFileAtomic(backupPath, users);
      return backupPath;
    },
  });
}

function normalizeFiiTicker(value) {
  const ticker = String(value || "").trim().toUpperCase();
  return /^[A-Z]{4}[0-9]{2}$/.test(ticker) ? ticker : "";
}

function sanitizeComparisonTickers(value) {
  const rawTickers = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const tickers = [];
  for (const item of rawTickers) {
    const ticker = normalizeFiiTicker(item);
    if (!ticker || tickers.includes(ticker)) continue;
    tickers.push(ticker);
    if (tickers.length >= 5) break;
  }
  return tickers;
}

function withFiiSearchLog(mutator) {
  const run = fiiSearchLogQueue.then(async () => {
    const events = await readJsonFile(fiiSearchLogFile, []);
    const result = await mutator(events);
    await writeJsonFileAtomic(fiiSearchLogFile, events);
    return result;
  });
  fiiSearchLogQueue = run.catch(() => {});
  return run;
}

function withUserComparisons(mutator) {
  const run = userComparisonsQueue.then(async () => {
    const comparisons = await readJsonFile(userComparisonsFile, []);
    const result = await mutator(comparisons);
    await writeJsonFileAtomic(userComparisonsFile, comparisons);
    return result;
  });
  userComparisonsQueue = run.catch(() => {});
  return run;
}

async function recordFiiSearch(user, ticker) {
  const normalizedTicker = normalizeFiiTicker(ticker);
  if (!user?.id || !normalizedTicker) return;
  await withFiiSearchLog(async (events) => {
    events.push({
      userId: user.id,
      ticker: normalizedTicker,
      searchedAt: new Date().toISOString(),
    });
  });
}

async function getUserComparison(userId) {
  return withUserComparisons(async (comparisons) => {
    const comparison = comparisons.find((item) => item.userId === userId);
    return {
      tickers: sanitizeComparisonTickers(comparison?.tickers || ["MXRF11"]),
      updatedAt: comparison?.updatedAt || "",
    };
  });
}

async function saveUserComparison(userId, tickers) {
  const normalizedTickers = sanitizeComparisonTickers(tickers);
  return withUserComparisons(async (comparisons) => {
    const now = new Date().toISOString();
    const existing = comparisons.find((item) => item.userId === userId);
    if (existing) {
      existing.tickers = normalizedTickers;
      existing.updatedAt = now;
    } else {
      comparisons.push({ userId, tickers: normalizedTickers, updatedAt: now });
    }
    return { tickers: normalizedTickers, updatedAt: now };
  });
}

async function readFiiSearchEventsReadOnly() {
  try {
    const events = JSON.parse(await readFile(fiiSearchLogFile, "utf8"));
    return Array.isArray(events) ? events : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function fiiSearchesSummary() {
  const events = (await readFiiSearchEventsReadOnly())
    .map((event) => ({
      userId: String(event.userId || ""),
      ticker: normalizeFiiTicker(event.ticker),
      searchedAt: String(event.searchedAt || ""),
    }))
    .filter((event) => event.userId && event.ticker && event.searchedAt);
  const byTicker = new Map();
  for (const event of events) {
    const entry = byTicker.get(event.ticker) || {
      ticker: event.ticker,
      total: 0,
      users: new Set(),
    };
    entry.total += 1;
    entry.users.add(event.userId);
    byTicker.set(event.ticker, entry);
  }

  return {
    ok: true,
    totalSearches: events.length,
    uniqueUsers: new Set(events.map((event) => event.userId)).size,
    topTickers: [...byTicker.values()]
      .map((entry) => ({
        ticker: entry.ticker,
        total: entry.total,
        uniqueUsers: entry.users.size,
      }))
      .sort(
        (left, right) =>
          right.total - left.total ||
          right.uniqueUsers - left.uniqueUsers ||
          left.ticker.localeCompare(right.ticker),
      ),
    recentSearches: events
      .slice()
      .sort((left, right) => String(right.searchedAt).localeCompare(String(left.searchedAt)))
      .slice(0, 50)
      .map((event) => ({
        ticker: event.ticker,
        searchedAt: event.searchedAt,
        userId: event.userId,
      })),
  };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Payload excedeu o limite de 1 MB.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: isEmailVerified(user),
    phone: user.phone,
    accountType: user.accountType || "customer",
    intent: user.intent || "general",
    plan: user.plan,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    trialStartAt: user.trialStartAt || user.trialStartedAt || "",
    trialEndAt: user.trialEndAt || user.trialEndsAt || "",
    lastEmailSentAt: user.lastEmailSentAt,
    lastEmailTemplate: user.lastEmailTemplate,
    lastEmailError: user.lastEmailError,
    lastPaymentLinkSentAt: user.lastPaymentLinkSentAt || "",
    paymentStatus: user.paymentStatus || "",
    history: user.history || [],
    operationalEvents: user.operationalEvents || [],
    broker: user.broker || user.corretora || "",
    personType: user.personType || user.tipoPessoa || "",
    lastBillingAt: user.lastBillingAt || user.lastChargeAt || "",
    paymentEmail: user.paymentEmail || user.email || "",
    trialUsed:
      typeof user.trialUsed === "boolean"
        ? user.trialUsed
        : Boolean(user.trialStartAt || user.trialStartedAt),
    internalNotes: user.internalNotes || user.notes || user.observations || "",
  };
}

function adminUserEmailLookupResult(user) {
  return {
    id: user.id,
    name: user.name || "",
    email: user.email || "",
    accountType: user.accountType || "customer",
    intent: user.intent || "general",
    plan: user.plan || "",
    status: user.status || "",
  };
}

function validateRegistrationInput(input) {
  const name = cleanText(input.name, 80);
  const email = cleanText(input.email, 254).toLowerCase();
  const phone = String(input.phone || "").replace(/\D/g, "");
  const broker = cleanText(input.broker || input.corretora, 80);
  const personType = cleanText(input.personType || input.tipoPessoa, 40);
  const internalNotes = cleanText(input.internalNotes || input.notes || input.observations, 500);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validPhone = phone.length >= 10 && phone.length <= 13 && !/^(\d)\1+$/.test(phone);

  if (!name) throw new Error("Informe seu nome.");
  if (!email) throw new Error("Informe seu e-mail.");
  if (!emailPattern.test(email)) throw new Error("Informe um e-mail válido.");
  if (!phone) throw new Error("Informe seu WhatsApp.");
  if (!validPhone) throw new Error("Informe um WhatsApp válido.");

  return {
    ...input,
    name,
    email,
    phone,
    broker,
    personType,
    internalNotes,
  };
}

function createUser(input) {
  const now = new Date().toISOString();
  const intent = ["trial", "founder", "general"].includes(input.intent) ? input.intent : "general";
  const plan =
    intent === "trial"
      ? "teste_7_dias"
      : intent === "founder"
        ? "fundador"
        : String(input.plan || "fundador").trim();
  const status = intent === "trial" ? "pending_trial" : intent === "founder" ? "pending_founder" : "pending";
  return {
    id: randomUUID(),
    name: input.name,
    email: input.email,
    phone: input.phone,
    emailVerified: false,
    accountType: accountTypeForPublicRegistration(),
    intent,
    plan: cleanText(plan, 40),
    status,
    createdAt: now,
    updatedAt: now,
    trialStartAt: "",
    trialEndAt: "",
    lastEmailSentAt: "",
    lastEmailTemplate: "",
    lastEmailError: "",
    lastPaymentLinkSentAt: "",
    paymentStatus: "",
    broker: input.broker || "",
    personType: input.personType || "",
    internalNotes: input.internalNotes || "",
    history: [`${formatBrazilDateTime(now)} - Cadastro criado`],
  };
}

function registrationTemplateEvent(user) {
  const isTrial =
    user.intent === "trial" ||
    user.status === "pending_trial" ||
    String(user.plan || "").toLowerCase().includes("teste");
  return isTrial ? "cadastroRecebidoTeste" : "cadastroRecebidoFundador";
}

function statusTemplateEvents(nextStatus) {
  if (["approved", "active", "aprovado", "ativo"].includes(nextStatus)) {
    return ["acessoLiberadoFundador"];
  }
  if (["trial_active", "teste_ativo", "teste"].includes(nextStatus)) {
    return ["acessoLiberadoTeste"];
  }
  if (["trial_finished", "trial_ended", "teste_finalizado", "teste_encerrado"].includes(nextStatus)) {
    return ["testeFinalizado"];
  }
  if (["inactive", "inativo", "inativado"].includes(nextStatus)) {
    return ["contaInativada"];
  }
  if (["archived", "arquivado"].includes(nextStatus)) {
    return ["contaArquivada"];
  }
  return [];
}

function normalizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  const map = {
    approved: "active",
    aprovado: "active",
    ativo: "active",
    recusado: "rejected",
    rejeitado: "rejected",
    teste: "trial_active",
    teste_ativo: "trial_active",
    teste_finalizado: "trial_finished",
    teste_encerrado: "trial_finished",
    trial_ended: "trial_finished",
    arquivado: "archived",
    inativo: "inactive",
    inativado: "inactive",
    awaiting_payment: "awaiting_payment",
    payment_pending: "payment_pending",
    pendente: "pending",
    pending_trial: "pending_trial",
    pending_founder: "pending_founder",
  };
  return map[value] || value || "pending";
}

function canAccessTool(user) {
  return canAccountAccessTool(user, normalizeStatus(user?.status));
}

function clientFlowPath(user) {
  if (isInternalAccount(user)) return "/status-aprovado.html";

  const status = normalizeStatus(user?.status);
  const paymentStatus = user?.paymentStatus ? normalizeStatus(user.paymentStatus) : "";

  if (
    ["awaiting_payment", "payment_pending"].includes(status)
    || ["awaiting_payment", "payment_pending"].includes(paymentStatus)
  ) {
    return "/status-pendente.html";
  }
  if (status === "active") return "/status-aprovado.html";
  if (status === "trial_active") return "/status-teste-ativo.html";
  if (status === "pending_trial" || user?.intent === "trial") return "/teste.html";
  return "/assinar.html";
}

function statusLabel(status) {
  return {
    pending: "Pendente",
    pending_trial: "Teste em análise",
    pending_founder: "Plano Fundador em análise",
    approved: "Aprovado",
    active: "Ativo",
    rejected: "Recusado",
    trial_active: "Teste grátis ativo",
    trial_finished: "Teste finalizado",
    archived: "Arquivado",
    inactive: "Inativo",
  }[status] || status;
}

function applyTrialDates(user, now = new Date()) {
  user.trialStartAt = now.toISOString();
  user.trialEndAt = addDays(now, 7).toISOString();
  delete user.trialStartedAt;
  delete user.trialEndsAt;
}

function recordOperationalEvent(user, action, previousStatus, newStatus, occurredAt = new Date().toISOString()) {
  user.operationalEvents = user.operationalEvents || [];
  user.operationalEvents.unshift({
    userId: user.id,
    email: user.email,
    name: user.name,
    action,
    previousStatus,
    newStatus,
    occurredAt,
    occurredAtSaoPaulo: formatBrazilDateTime(occurredAt),
  });
}

async function sendAndRecord(user, event, origin) {
  try {
    const { templateId } = await sendBrevoTransactionalEmail({ user, event, origin });
    user.lastEmailSentAt = new Date().toISOString();
    user.lastEmailTemplate = event;
    user.lastEmailError = "";
    user.history = user.history || [];
    user.history.unshift(`${formatBrazilDateTime(user.lastEmailSentAt)} - E-mail enviado: ${eventLabel[event]}`);
    return { ok: true, event, templateId };
  } catch (error) {
    if (error.internalMessage) logInternalError(`Brevo ${event}`, { message: error.internalMessage });
    user.lastEmailError = error.message || publicEmailError();
    user.history = user.history || [];
    user.history.unshift(`${formatBrazilDateTime(new Date())} - Falha no e-mail ${eventLabel[event]}: ${user.lastEmailError}`);
    return { ok: false, event, error: user.lastEmailError };
  }
}

async function issueEmailVerification(user) {
  const verification = createEmailVerification();
  user.emailVerificationTokenHash = verification.tokenHash;
  user.emailVerificationExpiresAt = verification.expiresAt;
  user.updatedAt = new Date().toISOString();

  try {
    await sendEmailVerificationEmail({ user, token: verification.token });
    user.lastEmailSentAt = new Date().toISOString();
    user.lastEmailTemplate = "emailVerification";
    user.lastEmailError = "";
    user.history = user.history || [];
    user.history.unshift(
      `${formatBrazilDateTime(user.lastEmailSentAt)} - E-mail de confirmação enviado`,
    );
    return { ok: true };
  } catch (error) {
    if (error.internalMessage) {
      logInternalError("Brevo confirmação de e-mail", { message: error.internalMessage });
    }
    user.lastEmailError = error.message || publicEmailError();
    user.history = user.history || [];
    user.history.unshift(
      `${formatBrazilDateTime(new Date())} - Falha no e-mail de confirmação: ${user.lastEmailError}`,
    );
    return { ok: false, error: user.lastEmailError };
  }
}

async function registerUser(input, origin) {
  const validatedInput = validateRegistrationInput(input);
  return withUsers(async (users) => {
    const duplicates = users.filter(
      (item) => String(item.email || "").trim().toLowerCase() === validatedInput.email,
    );
    if (duplicates.length > 1) {
      throw new Error("Não foi possível processar este cadastro. Entre em contato com o suporte.");
    }
    if (duplicates.length === 1) {
      const existingUser = duplicates[0];
      if (isEmailVerified(existingUser)) {
        throw new Error(
          "Este e-mail já possui cadastro. Tente entrar ou aguarde a análise do seu acesso.",
        );
      }
      const verificationEmail = await issueEmailVerification(existingUser);
      return {
        user: publicUser(existingUser),
        verificationEmail,
        verificationPending: true,
        existing: true,
      };
    }

    const user = createUser(validatedInput);
    users.unshift(user);
    const verificationEmail = await issueEmailVerification(user);
    return {
      user: publicUser(user),
      verificationEmail,
      verificationPending: true,
      existing: false,
    };
  });
}

async function confirmUserEmail(token, origin) {
  const tokenHash = hashEmailVerificationToken(token);
  return withUsers(async (users) => {
    const matches = users.filter(
      (user) => user.emailVerificationTokenHash === tokenHash,
    );
    if (matches.length !== 1 || !validateEmailVerificationToken(matches[0], token)) {
      throw new Error(
        "Link de confirmação inválido, expirado ou já utilizado.",
      );
    }

    const user = matches[0];
    applyEmailVerification(user);
    user.updatedAt = new Date().toISOString();
    user.history = user.history || [];
    user.history.unshift(`${formatBrazilDateTime(user.updatedAt)} - E-mail confirmado`);
    const email = await sendAndRecord(user, registrationTemplateEvent(user), origin);
    return { user: publicUser(user), email };
  });
}

async function changeUserStatus(id, status, origin, options = {}) {
  return withUsers(async (users) => {
    const user = users.find((item) => item.id === id);
    if (!user) throw new Error("Usuario nao encontrado.");

    const previousStatus = normalizeStatus(user.status);
    const nextStatus = normalizeStatus(status);
    if (
      !isInternalAccount(user)
      && !isEmailVerified(user)
      && ["active", "trial_active"].includes(nextStatus)
    ) {
      throw new Error("Confirme o e-mail do usuário antes de liberar o acesso.");
    }
    user.status = nextStatus;
    user.updatedAt = new Date().toISOString();
    user.history = user.history || [];
    user.history.unshift(`${formatBrazilDateTime(user.updatedAt)} - Status alterado para ${statusLabel(nextStatus)}`);

    if (options.operationalAction) {
      recordOperationalEvent(user, options.operationalAction, previousStatus, nextStatus, user.updatedAt);
    }

    if (nextStatus === "active" && shouldRunCommercialAutomation(user)) {
      user.plan = "fundador";
    }
    if (nextStatus === "trial_active" && shouldRunCommercialAutomation(user)) {
      user.plan = "teste_7_dias";
      applyTrialDates(user);
      user.updatedAt = new Date().toISOString();
      user.history.unshift(
        `${formatBrazilDateTime(user.updatedAt)} - Teste gratuito iniciado ate ${formatBrazilDate(user.trialEndAt)}`,
      );
    }

    const emailResults = [];
    if (shouldRunCommercialAutomation(user)) {
      for (const event of statusTemplateEvents(nextStatus)) {
        emailResults.push(await sendAndRecord(user, event, origin));
      }
    }

    return { user: publicUser(user), emailResults };
  });
}

async function recordClientAccountEvent(id, action) {
  return withUsers(async (users) => {
    const user = users.find((item) => item.id === id);
    if (!user) throw new Error("Usuario nao encontrado.");

    const status = normalizeStatus(user.status);
    recordOperationalEvent(user, action, status, status);
    return { user: publicUser(user) };
  });
}

function currentTemplateEvent(user) {
  const events = statusTemplateEvents(user.status);
  if (["pending", "pending_trial", "pending_founder"].includes(user.status)) {
    return registrationTemplateEvent(user);
  }
  return events.at(-1) || registrationTemplateEvent(user);
}

async function resendUserEmail(id, origin) {
  return withUsers(async (users) => {
    const user = users.find((item) => item.id === id);
    if (!user) throw new Error("Usuario nao encontrado.");
    return {
      user: publicUser(user),
      email: {
        ok: false,
        skipped: true,
        error: "Envio de e-mail desativado temporariamente.",
      },
    };
  });
}

async function findUserForLogin(email) {
  const normalizedEmail = cleanText(email, 254).toLowerCase();
  if (!normalizedEmail) return null;

  const users = await readUsers();
  const match = findUniqueUserByEmail(users, normalizedEmail);
  if (!match.ok) return null;

  const user = match.user;
  if (!isInternalAccount(user) && !isEmailVerified(user)) return null;
  return {
    id: user.id,
    name: user.name,
    accountType: user.accountType || "customer",
    intent: user.intent || "general",
    status: normalizeStatus(user.status),
    paymentStatus: user.paymentStatus || "",
  };
}

async function markUserAsInternal(id) {
  return withUsers(async (users) => {
    const user = users.find((item) => item.id === id);
    if (!user) throw new Error("Usuario nao encontrado.");

    return markInternalAccount(user);
  });
}

function markInternalAccount(user) {
  user.accountType = "internal";
  user.updatedAt = new Date().toISOString();
  user.history = user.history || [];
  user.history.unshift(`${formatBrazilDateTime(user.updatedAt)} - Conta marcada como interna`);
  return { user: publicUser(user) };
}

async function markUserAsInternalByEmail(email) {
  return withUsers(async (users) => {
    const match = findUniqueUserByEmail(users, email);
    if (!match.ok) return match;

    const result = markInternalAccount(match.user);
    return { ok: true, ...result };
  });
}

async function prepareFounderPayment(id) {
  return withUsers(async (users) => {
    const user = users.find((item) => item.id === id);
    if (!user) throw new Error("Usuario nao encontrado.");

    const phone = String(user.phone || "").replace(/\D/g, "");
    if (!phone) throw new Error("Este usuário não possui WhatsApp cadastrado.");

    const paymentUrl =
      process.env.PAGBANK_PAYMENT_URL ||
      process.env.FOUNDER_PAYMENT_URL ||
      process.env.PAYMENT_LINK_URL ||
      "";
    if (!paymentUrl.trim()) throw new Error("Link de pagamento PagBank não configurado.");

    const now = new Date().toISOString();
    const whatsappPhone = phone.startsWith("55") ? phone : `55${phone}`;
    const message = [
      `Olá, ${user.name?.trim() || "Investidor"}!`,
      "Segue o link PagBank para pagamento do Plano Fundador do FII Select:",
      paymentUrl.trim(),
      "Após o pagamento, a confirmação e a liberação do acesso serão feitas manualmente.",
    ].join("\n\n");
    const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;

    user.lastPaymentLinkSentAt = now;
    user.paymentStatus = "awaiting_payment";
    user.updatedAt = now;
    user.history = user.history || [];
    user.history.unshift(`${formatBrazilDateTime(now)} - Contato de pagamento do Plano Fundador preparado`);

    return {
      user: publicUser(user),
      url: whatsappUrl,
      mode: "whatsapp_pagbank",
    };
  });
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

async function trackedBrapiFetch(url, { internalEndpoint, ticker } = {}) {
  const brapiRoute = new URL(url).pathname;
  try {
    const response = await fetch(url, {
      headers: brapiToken ? { Authorization: `Bearer ${brapiToken}` } : {},
    });
    brapiUsage.record({
      internalEndpoint,
      brapiRoute,
      ticker,
      status: response.status,
      success: response.ok,
    });
    return response;
  } catch (error) {
    brapiUsage.record({
      internalEndpoint,
      brapiRoute,
      ticker,
      status: null,
      success: false,
    });
    throw error;
  }
}

async function upstream(url, metadata = {}) {
  const response = await trackedBrapiFetch(url, metadata);
  if (!response.ok) {
    const message = await response.text();
    const error = new Error(publicDataError());
    error.internalMessage = `Fonte de dados respondeu ${response.status}: ${message.slice(0, 180)}`;
    throw error;
  }
  return response.json();
}

async function getSelic() {
  return cached("selic", 60 * 60 * 1000, async () => {
    const response = await fetch(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json",
    );
    if (!response.ok) throw new Error(publicDataError());
    const [latest] = await response.json();
    return { annualRate: Number(latest.valor) / 100, asOfDate: latest.data };
  });
}

async function getFiiData(ticker, internalEndpoint = "/api/valuation") {
  if (!brapiToken && !sandboxTickers.has(ticker)) {
    throw valuationError("api_unavailable", {
      internalMessage: `BRAPI_TOKEN ausente para ${ticker} fora do sandbox.`,
    });
  }

  return cached(`fii:${ticker}`, 15 * 60 * 1000, async () => {
    let indicatorsPayload;
    let dividendsPayload;
    try {
      [indicatorsPayload, dividendsPayload] = await Promise.all([
        upstream(
          `https://brapi.dev/api/v2/fii/indicators?symbols=${encodeURIComponent(ticker)}`,
          { internalEndpoint, ticker },
        ),
        upstream(
          `https://brapi.dev/api/v2/fii/dividends?symbols=${encodeURIComponent(ticker)}&sortOrder=desc`,
          { internalEndpoint, ticker },
        ),
      ]);
    } catch (error) {
      throw valuationError("api_unavailable", {
        internalMessage: error.internalMessage || `Falha ao consultar dados da BRAPI para ${ticker}.`,
      });
    }

    const indicators = indicatorsPayload.fiis?.[0];
    if (!indicators) throw valuationError("ticker_not_found");
    const classification = normalizeFundClassification(
      {
        ticker,
        segmentType: indicators.segmentType,
        segmentoAtuacao: indicators.segmentoAtuacao,
      },
      fiiCatalog,
    );
    if (classification.type === "fiagro") {
      throw valuationError("unsupported_type", {
        internalMessage: `Tipo de fundo ainda não suportado na estimativa: ${ticker} (${classification.label}).`,
      });
    }

    const dividends = (dividendsPayload.dividends || [])
      .filter((item) => item.symbol === ticker && item.label === "RENDIMENTO")
      .slice(0, 12);

    if (dividends.length < 6) {
      throw valuationError("insufficient_data", {
        internalMessage: `Histórico insuficiente de rendimentos para ${ticker}: ${dividends.length} registro(s).`,
      });
    }

    return { indicators, dividends };
  });
}

async function testBrapiIndicators() {
  if (!brapiToken) {
    return {
      ok: false,
      configured: false,
      endpoint: "/api/v2/fii/indicators",
      error: "BRAPI_TOKEN não configurado no backend.",
      results: [],
    };
  }

  const results = await Promise.all(
    brapiTestTickers.map(async (ticker) => {
      try {
        const payload = await upstream(
          `https://brapi.dev/api/v2/fii/indicators?symbols=${encodeURIComponent(ticker)}`,
          { internalEndpoint: "/admin/api/brapi-test", ticker },
        );
        const indicator = payload.fiis?.find((item) => item.symbol === ticker) || payload.fiis?.[0];
        if (!indicator) throw new Error("FII não encontrado na resposta da BRAPI.");

        return {
          ticker,
          ok: true,
          name: indicator.name || "",
          price: Number.isFinite(Number(indicator.price)) ? Number(indicator.price) : null,
          asOfDate: indicator.asOfDate || "",
        };
      } catch (error) {
        if (error.internalMessage) logInternalError(`BRAPI teste ${ticker}`, { message: error.internalMessage });
        return {
          ticker,
          ok: false,
          error: error.message || publicDataError(),
        };
      }
    }),
  );

  return {
    ok: results.every((result) => result.ok),
    configured: true,
    endpoint: "/api/v2/fii/indicators",
    results,
  };
}

function pickDefined(source, fields) {
  if (!source || typeof source !== "object") return {};
  return Object.fromEntries(
    fields
      .filter((field) => source[field] !== undefined)
      .map((field) => [field, source[field]]),
  );
}

function availableFields(source) {
  return source && typeof source === "object" ? Object.keys(source).sort() : [];
}

async function diagnosticBrapiRequest(
  path,
  { internalEndpoint = "/admin/api/maintenance/brapi-fii-diagnostic", ticker } = {},
) {
  if (!brapiToken) {
    return {
      ok: false,
      status: null,
      error: "BRAPI_TOKEN não configurado no backend.",
      data: null,
    };
  }

  try {
    const response = await trackedBrapiFetch(`https://brapi.dev${path}`, {
      internalEndpoint,
      ticker,
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: "A BRAPI não retornou dados para esta consulta.",
        data: null,
      };
    }
    return { ok: true, status: response.status, error: null, data: await response.json() };
  } catch {
    return {
      ok: false,
      status: null,
      error: "Não foi possível consultar a BRAPI no momento.",
      data: null,
    };
  }
}

async function brapiFiiDiagnostic(
  ticker,
  {
    includeQuote = true,
    includeCdi = true,
    internalEndpoint = "/admin/api/maintenance/brapi-fii-diagnostic",
  } = {},
) {
  const endpointPaths = {
    indicators: `/api/v2/fii/indicators?symbols=${encodeURIComponent(ticker)}`,
    properties: `/api/v2/fii/properties?symbols=${encodeURIComponent(ticker)}`,
    portfolio: `/api/v2/fii/portfolio?symbols=${encodeURIComponent(ticker)}`,
    reports: `/api/v2/fii/reports?symbols=${encodeURIComponent(ticker)}&sortOrder=desc&limit=1`,
    dividends: `/api/v2/fii/dividends?symbols=${encodeURIComponent(ticker)}&sortOrder=desc`,
  };
  if (includeQuote) endpointPaths.quote = `/api/quote/${encodeURIComponent(ticker)}`;
  if (includeCdi) endpointPaths.cdi = "/api/v2/macro/latest?symbols=cdi";
  const entries = await Promise.all(
    Object.entries(endpointPaths).map(async ([name, path]) => [
      name,
      await diagnosticBrapiRequest(path, { internalEndpoint, ticker }),
    ]),
  );
  const responses = Object.fromEntries(entries);
  const indicator = responses.indicators.data?.fiis?.[0] || null;
  const propertiesPayload = responses.properties.data?.fiis?.[0] || null;
  const portfolioPayload = responses.portfolio.data?.fiis?.[0] || null;
  const report = responses.reports.data?.reports?.[0] || null;
  const quote = responses.quote?.data?.results?.[0] || null;
  const dividends = (responses.dividends.data?.dividends || [])
    .filter((item) => !item.symbol || item.symbol === ticker)
    .slice(0, 24);
  const cdiResult = (responses.cdi?.data?.results || []).find(
    (item) => item.series?.slug === "cdi",
  ) || responses.cdi?.data?.results?.[0] || null;
  const properties = (propertiesPayload?.properties || []).map((property) => ({
    ...pickDefined(property, [
      "name",
      "identifier",
      "address",
      "city",
      "state",
      "propertyClass",
      "area",
      "unitCount",
      "vacancyRate",
      "delinquencyRate",
      "revenueShare",
      "leasedRate",
    ]),
    availableFields: availableFields(property),
  }));
  const portfolioLists = Object.fromEntries(
    ["allocations", "financialAssets", "fundHoldings", "properties", "lands", "rights"]
      .filter((key) => Array.isArray(portfolioPayload?.[key]))
      .map((key) => [
        key,
        portfolioPayload[key].slice(0, 50).map((item) => ({
          ...pickDefined(item, [
            "name",
            "symbol",
            "ticker",
            "cnpj",
            "type",
            "category",
            "assetClass",
            "description",
            "issuer",
            "issuerCnpj",
            "indexer",
            "rate",
            "delinquencyRate",
            "creditDelinquencyRate",
            "value",
            "amount",
            "quantity",
            "count",
            "declaredValue",
            "percentage",
            "share",
            "area",
            "state",
            "city",
          ]),
          availableFields: availableFields(item),
        })),
      ]),
  );
  const endpointStatus = Object.fromEntries(
    Object.entries(responses).map(([name, result]) => [
      name,
      {
        ok: result.ok,
        status: result.status,
        error: result.error,
      },
    ]),
  );
  const successfulEndpoints = Object.entries(endpointStatus)
    .filter(([, result]) => result.ok)
    .map(([name]) => name);
  const failedEndpoints = Object.entries(endpointStatus)
    .filter(([, result]) => !result.ok)
    .map(([name]) => name);
  const propertySummary = pickDefined(propertiesPayload?.summary, [
    "count",
    "totalArea",
    "vacancyRate",
    "averageVacancyRate",
    "propertiesWithVacancy",
  ]);
  const portfolioSummary = {
    ...pickDefined(portfolioPayload, ["symbol", "cnpj", "referenceDate", "version"]),
    ...pickDefined(portfolioPayload?.summary, [
      "totalItems",
      "declaredValue",
      "totalValue",
      "totalAssets",
      "equity",
      "cash",
      "totalInvested",
      "propertyCount",
      "creditDelinquencyRate",
    ]),
    availableFields: availableFields(portfolioPayload?.summary),
  };

  const diagnostic = {
    ok: failedEndpoints.length === 0,
    status: {
      ticker,
      requestedAt: new Date().toISOString(),
      brapiTokenConfigured: Boolean(brapiToken),
      endpointsConsulted: Object.keys(endpointPaths),
      successfulEndpoints,
      failedEndpoints,
      endpointStatus,
    },
    data: {
      market: {
        ...pickDefined(indicator, [
          "price",
          "dividendYield12m",
          "dividendYield1m",
          "monthlyReturn",
          "asOfDate",
        ]),
        ...pickDefined(quote, [
          "regularMarketPrice",
          "regularMarketChange",
          "regularMarketChangePercent",
          "regularMarketVolume",
          "regularMarketDayHigh",
          "regularMarketDayLow",
          "regularMarketTime",
        ]),
        indicatorFields: availableFields(indicator),
        quoteFields: availableFields(quote),
      },
      patrimonial: {
        ...pickDefined(indicator, [
          "navPerShare",
          "priceToNav",
          "equity",
          "totalAssets",
          "sharesOutstanding",
          "totalInvestors",
        ]),
      },
      cadastral: {
        ...pickDefined(indicator, [
          "symbol",
          "name",
          "cnpj",
          "segmentType",
          "segmentoAtuacao",
          "mandate",
          "tipoGestao",
          "administratorName",
          "administratorCnpj",
          "administratorWebsite",
          "managerName",
        ]),
      },
      propertiesAndVacancy: {
        ...propertySummary,
        availableSummaryFields: availableFields(propertiesPayload?.summary),
        properties,
      },
      portfolio: {
        summary: portfolioSummary,
        ...portfolioLists,
      },
      report: report
        ? {
          ...pickDefined(report, [
            "symbol",
            "cnpj",
            "referenceDate",
            "version",
            "totalAssets",
            "equity",
            "navPerShare",
            "adminFeeRate",
            "monthlyReturn",
            "monthlyPatrimonialReturn",
            "monthlyDividendYield",
            "amortizationRate",
            "cash",
            "liquidityNeeds",
            "governmentBonds",
            "privateBonds",
            "fixedIncomeFunds",
            "totalInvested",
            "realEstateAssets",
            "cri",
            "lci",
            "fiiHoldings",
            "receivables",
            "rentalReceivables",
            "creditDelinquencyRate",
            "totalLiabilities",
            "url",
            "documentUrl",
            "downloadUrl",
          ]),
          availableFields: availableFields(report),
        }
        : null,
      dividends: dividends.map((dividend) => ({
        ...pickDefined(dividend, [
          "symbol",
          "label",
          "rate",
          "referenceDate",
          "declaredDate",
          "lastDatePrior",
          "paymentDate",
          "type",
        ]),
        availableFields: availableFields(dividend),
      })),
      cdi: cdiResult
        ? {
          series: pickDefined(cdiResult.series, [
            "slug",
            "name",
            "description",
            "unit",
            "frequency",
            "category",
          ]),
          latest: pickDefined(cdiResult.latest, ["date", "value"]),
          availableFields: availableFields(cdiResult),
        }
        : null,
    },
    toolDiagnostic: {
      crossedReadingCandidates: {
        priceToNav: indicator?.priceToNav ?? null,
        navPerShare: indicator?.navPerShare ?? null,
        equity: indicator?.equity ?? null,
        dividendYield12m: indicator?.dividendYield12m ?? null,
        propertyCount: propertiesPayload?.summary?.count ?? (properties.length || null),
        declaredArea: propertiesPayload?.summary?.totalArea ?? null,
        consolidatedVacancy: propertiesPayload?.summary?.vacancyRate ?? null,
        hasVacancyByProperty: properties.some((property) => property.vacancyRate != null),
        hasDelinquencyByProperty: properties.some((property) => property.delinquencyRate != null),
        hasRevenueShareByProperty: properties.some((property) => property.revenueShare != null),
        segmentType: indicator?.segmentType ?? null,
        segmentoAtuacao: indicator?.segmentoAtuacao ?? null,
        hasPortfolioComposition: Object.values(portfolioLists).some((items) => items.length > 0),
        historicalDividendsReturned: dividends.length,
        cdiAvailable: Boolean(cdiResult?.latest?.value),
      },
      cautions: [
        "O campo area é apresentado como área declarada; não deve ser chamado de ABL sem confirmação da semântica.",
        "Vacância física e financeira não são separadas quando a BRAPI não fornece campos distintos.",
        "A presença do CDI permite comparação educacional como benchmark, mas não comprova exposição do fundo ao CDI.",
        "Exposição a CDI, IPCA ou prefixado só deve ser informada quando houver campo explícito na carteira.",
      ],
    },
  };
  diagnostic.normalizedCrossedReading = normalizeCrossedReading({
    ticker,
    data: diagnostic.data,
  });
  return diagnostic;
}

function documentalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function documentalPositiveNumber(value) {
  const number = documentalNumber(value);
  return number != null && number > 0 ? number : null;
}

function documentalDiff(left, right) {
  const a = documentalNumber(left);
  const b = documentalNumber(right);
  if (a == null || b == null) return null;
  const denominator = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / denominator;
}

function documentalSource(endpoint, competence, collectedAt) {
  return {
    source: `BRAPI ${endpoint}`,
    competence: competence || null,
    collectedAt,
  };
}

function documentalFact(facts, key, label, value, source) {
  if (value === undefined || value === null || value === "") return;
  facts.push({ key, label, value, ...source });
}

function documentalCheck({ id, label, status, message, fields = [] }) {
  return {
    id,
    label,
    status,
    message,
    fields,
  };
}

function buildDocumentalLab(diagnostic) {
  const data = diagnostic.data || {};
  const market = data.market || {};
  const patrimonial = data.patrimonial || {};
  const cadastral = data.cadastral || {};
  const properties = data.propertiesAndVacancy || {};
  const portfolio = data.portfolio || {};
  const report = data.report || {};
  const dividends = Array.isArray(data.dividends) ? data.dividends : [];
  const collectedAt = diagnostic.status?.requestedAt || new Date().toISOString();
  const facts = [];
  const checks = [];
  const attentionMessage =
    "Inconsistência detectada entre fontes ou competências. Verifique a origem dos dados antes de concluir.";
  const insufficientMessage = "Dados insuficientes para esta checagem.";
  const indicatorSource = documentalSource(
    "/api/v2/fii/indicators",
    market.asOfDate,
    collectedAt,
  );
  const reportSource = documentalSource(
    "/api/v2/fii/reports",
    report.referenceDate,
    collectedAt,
  );
  const propertiesSource = documentalSource(
    "/api/v2/fii/properties",
    properties.referenceDate,
    collectedAt,
  );
  const portfolioSource = documentalSource(
    "/api/v2/fii/portfolio",
    portfolio.summary?.referenceDate || portfolio.summary?.symbol,
    collectedAt,
  );
  const dividendSource = documentalSource(
    "/api/v2/fii/dividends",
    dividends[0]?.referenceDate,
    collectedAt,
  );

  documentalFact(facts, "totalInvestors", "Número de cotistas", patrimonial.totalInvestors, indicatorSource);
  documentalFact(facts, "equity", "Patrimônio líquido", patrimonial.equity, indicatorSource);
  documentalFact(facts, "reportEquity", "Patrimônio líquido no report", report.equity, reportSource);
  documentalFact(facts, "totalAssets", "Ativos totais", patrimonial.totalAssets, indicatorSource);
  documentalFact(facts, "reportTotalAssets", "Ativos totais no report", report.totalAssets, reportSource);
  documentalFact(facts, "totalLiabilities", "Passivos totais", report.totalLiabilities, reportSource);
  documentalFact(facts, "sharesOutstanding", "Cotas emitidas", patrimonial.sharesOutstanding, indicatorSource);
  documentalFact(facts, "navPerShare", "VP por cota", patrimonial.navPerShare, indicatorSource);
  documentalFact(facts, "priceToNav", "P/VP", patrimonial.priceToNav, indicatorSource);
  documentalFact(facts, "latestDividend", "Distribuição/rendimento", dividends[0]?.rate, dividendSource);
  documentalFact(facts, "monthlyDividendYield", "DY mensal", report.monthlyDividendYield, reportSource);
  documentalFact(facts, "adminFeeRate", "Taxa de administração", report.adminFeeRate, reportSource);
  documentalFact(facts, "propertyCount", "Quantidade de imóveis", properties.count, propertiesSource);
  documentalFact(facts, "vacancyRate", "Vacância consolidada", properties.vacancyRate, propertiesSource);
  documentalFact(facts, "cash", "Caixa", report.cash ?? portfolio.summary?.cash, report.cash != null ? reportSource : portfolioSource);
  documentalFact(facts, "cri", "CRI", report.cri, reportSource);
  documentalFact(facts, "lci", "LCI", report.lci, reportSource);
  documentalFact(facts, "fiiHoldings", "Cotas de FIIs", report.fiiHoldings, reportSource);

  const documents = [];
  if (report && Object.keys(report).length) {
    documents.push({
      type: "Relatório CVM estruturado",
      competence: report.referenceDate || null,
      publishedAt: report.referenceDate || null,
      url: report.url || null,
      documentUrl: report.documentUrl || null,
      downloadUrl: report.downloadUrl || null,
      source: "BRAPI / CVM",
      status: report.url || report.documentUrl || report.downloadUrl
        ? "metadados disponíveis"
        : "metadados estruturados sem URL",
    });
  }

  const expectedNavPerShare =
    documentalPositiveNumber(patrimonial.equity) && documentalPositiveNumber(patrimonial.sharesOutstanding)
      ? documentalNumber(patrimonial.equity) / documentalNumber(patrimonial.sharesOutstanding)
      : null;
  const navDiff = documentalDiff(patrimonial.navPerShare, expectedNavPerShare);
  checks.push(
    expectedNavPerShare == null || documentalNumber(patrimonial.navPerShare) == null
      ? documentalCheck({
        id: "nav-per-share",
        label: "VP/cota vs patrimônio líquido / cotas emitidas",
        status: "insufficient",
        message: insufficientMessage,
      })
      : documentalCheck({
        id: "nav-per-share",
        label: "VP/cota vs patrimônio líquido / cotas emitidas",
        status: navDiff > 0.01 ? "attention" : "ok",
        message: navDiff > 0.01 ? attentionMessage : "Dados coerentes na checagem objetiva.",
        fields: [
          { label: "VP/cota informado", value: patrimonial.navPerShare, ...indicatorSource },
          { label: "VP/cota calculado", value: expectedNavPerShare, ...indicatorSource },
        ],
      }),
  );

  const dividendYieldSource = documentalNumber(report.monthlyDividendYield) != null
    ? reportSource
    : indicatorSource;
  const reportedMonthlyYield = report.monthlyDividendYield ?? market.dividendYield1m;
  const expectedMonthlyYield =
    documentalPositiveNumber(dividends[0]?.rate) && documentalPositiveNumber(market.price)
      ? documentalNumber(dividends[0].rate) / documentalNumber(market.price)
      : null;
  const yieldDiff = documentalDiff(reportedMonthlyYield, expectedMonthlyYield);
  checks.push(
    expectedMonthlyYield == null || documentalNumber(reportedMonthlyYield) == null
      ? documentalCheck({
        id: "monthly-yield",
        label: "DY mensal vs distribuição / preço",
        status: "insufficient",
        message: insufficientMessage,
      })
      : documentalCheck({
        id: "monthly-yield",
        label: "DY mensal vs distribuição / preço",
        status: yieldDiff > 0.15 ? "attention" : "ok",
        message: yieldDiff > 0.15 ? attentionMessage : "Dados coerentes na checagem objetiva.",
        fields: [
          { label: "DY mensal informado", value: reportedMonthlyYield, ...dividendYieldSource },
          { label: "DY mensal calculado", value: expectedMonthlyYield, ...dividendSource },
        ],
      }),
  );

  const liabilitiesToEquity =
    documentalPositiveNumber(report.totalLiabilities) && documentalPositiveNumber(report.equity ?? patrimonial.equity)
      ? documentalNumber(report.totalLiabilities) / documentalNumber(report.equity ?? patrimonial.equity)
      : null;
  checks.push(
    liabilitiesToEquity == null
      ? documentalCheck({
        id: "liabilities-to-equity",
        label: "Passivos / patrimônio",
        status: "insufficient",
        message: insufficientMessage,
      })
      : documentalCheck({
        id: "liabilities-to-equity",
        label: "Passivos / patrimônio",
        status: liabilitiesToEquity > 0.25 ? "attention" : "ok",
        message: liabilitiesToEquity > 0.25
          ? "Passivos / patrimônio acima do limite simples definido para o laboratório documental."
          : "Dados coerentes na checagem objetiva.",
        fields: [{ label: "Passivos / patrimônio", value: liabilitiesToEquity, ...reportSource }],
      }),
  );

  const equityDiff = documentalDiff(patrimonial.equity, report.equity);
  checks.push(
    documentalNumber(patrimonial.equity) == null || documentalNumber(report.equity) == null
      ? documentalCheck({
        id: "equity-sources",
        label: "Patrimônio dos indicators vs patrimônio do report",
        status: "insufficient",
        message: insufficientMessage,
      })
      : documentalCheck({
        id: "equity-sources",
        label: "Patrimônio dos indicators vs patrimônio do report",
        status: equityDiff > 0.02 ? "attention" : "ok",
        message: equityDiff > 0.02 ? attentionMessage : "Dados coerentes na checagem objetiva.",
        fields: [
          { label: "Patrimônio indicators", value: patrimonial.equity, ...indicatorSource },
          { label: "Patrimônio report", value: report.equity, ...reportSource },
        ],
      }),
  );

  checks.push(
    documentalCheck({
      id: "investors-variation",
      label: "Variação abrupta no número de cotistas",
      status: "insufficient",
      message: "Dados insuficientes para esta checagem. O laboratório ainda não consulta histórico de cotistas.",
    }),
  );

  checks.push(
    report.version && Number(report.version) > 1
      ? documentalCheck({
        id: "report-version",
        label: "Documento retificado ou versão diferente",
        status: "attention",
        message: "Documento com versão superior a 1. Verifique se houve reapresentação antes de concluir.",
        fields: [{ label: "Versão do report", value: report.version, ...reportSource }],
      })
      : documentalCheck({
        id: "report-version",
        label: "Documento retificado ou versão diferente",
        status: report.version ? "ok" : "insufficient",
        message: report.version ? "Dados coerentes na checagem objetiva." : insufficientMessage,
      }),
  );

  return {
    ok: true,
    ticker: diagnostic.status?.ticker,
    collectedAt,
    source: "BRAPI / CVM estruturado",
    status: diagnostic.status,
    summary: {
      ticker: diagnostic.status?.ticker,
      type: cadastral.segmentType || null,
      segment: cadastral.segmentoAtuacao || null,
      administrator: cadastral.administratorName || null,
      manager: cadastral.managerName || null,
    },
    facts,
    documents,
    checks,
    attention: checks.filter((check) => check.status === "attention"),
    notes: [
      "Laboratório interno de leitura documental. Não representa recomendação de investimento.",
      "Sem IA, OCR, scraping ou download em massa de PDFs nesta etapa.",
    ],
  };
}

async function documentalLab(ticker) {
  const diagnostic = await brapiFiiDiagnostic(ticker, {
    includeCdi: false,
    internalEndpoint: "/admin/api/documental-lab",
  });
  return buildDocumentalLab(diagnostic);
}

async function crossedReading(ticker) {
  return cached(`crossed-reading:${ticker}`, 15 * 60 * 1000, async () => {
    const diagnostic = await brapiFiiDiagnostic(ticker, {
      includeQuote: false,
      includeCdi: false,
      internalEndpoint: "/api/crossed-reading",
    });
    const result = diagnostic.normalizedCrossedReading;
    result.common.classification = normalizeFundClassification(
      {
        ticker,
        fundType: result.type,
        segment: result.common.segment,
      },
      fiiCatalog,
    );
    return result;
  });
}

async function valuation(url, internalEndpoint = "/api/valuation") {
  const ticker = (url.searchParams.get("ticker") || "MXRF11").trim().toUpperCase();
  if (!/^[A-Z]{4}[0-9]{2}$/.test(ticker)) {
    throw valuationError("invalid_ticker");
  }

  const riskRate = numberParam(url, "riskRate", 0.025, 0, 0.3);
  const growthRate = numberParam(url, "growthRate", 0.03, -0.1, 0.15);
  const recurrence = numberParam(url, "recurrence", 0.95, 0.5, 1);
  const [{ annualRate: selicRate, asOfDate: selicAsOfDate }, { indicators, dividends }] =
    await Promise.all([getSelic(), getFiiData(ticker, internalEndpoint)]);

  const requiredReturn = selicRate + riskRate;
  if (requiredReturn <= growthRate) {
    throw new Error("O retorno exigido deve ser maior que o crescimento esperado.");
  }

  const averageMonthlyDividend =
    dividends.reduce((sum, item) => sum + Number(item.rate || 0), 0) / dividends.length;
  if (!Number.isFinite(averageMonthlyDividend) || averageMonthlyDividend <= 0) {
    throw valuationError("insufficient_data", {
      internalMessage: `Dividendos inválidos para ${ticker}.`,
    });
  }
  const dividendVariance =
    dividends.reduce((sum, item) => sum + (Number(item.rate || 0) - averageMonthlyDividend) ** 2, 0) /
    dividends.length;
  const dividendVariation =
    averageMonthlyDividend > 0 ? Math.sqrt(dividendVariance) / averageMonthlyDividend : Infinity;
  const recurrenceNote =
    dividends.length < 9
      ? "Não há dados suficientes para avaliar a recorrência dos dividendos com segurança."
      : dividendVariation <= 0.15
        ? "A recorrência dos dividendos parece consistente no histórico disponível, mas rendimentos passados não garantem pagamentos futuros."
        : dividendVariation <= 0.35
          ? "O fundo apresenta distribuições recorrentes no histórico disponível, mas a análise deve considerar as variações dos rendimentos ao longo do tempo."
          : "Os rendimentos apresentam variações relevantes no histórico disponível. A recorrência deve ser analisada com cautela.";
  const normalizedMonthlyDividend = averageMonthlyDividend * recurrence;
  const nextTwelveMonthsDividend = normalizedMonthlyDividend * 12 * (1 + growthRate);
  const fairValue = nextTwelveMonthsDividend / (requiredReturn - growthRate);
  const currentPrice = Number(indicators.price);
  const navPerShare = Number(indicators.navPerShare);
  const priceToNav = Number(indicators.priceToNav);
  const totalInvestors = Number(indicators.totalInvestors);
  if (
    !Number.isFinite(fairValue) ||
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(navPerShare) ||
    !Number.isFinite(priceToNav)
  ) {
    throw valuationError("insufficient_data", {
      internalMessage: `Preço ou dados patrimoniais insuficientes para ${ticker}.`,
    });
  }
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
      ? "Renda sugere deságio, mas a cota negocia acima do VP. Vale investigar a qualidade e a recorrência dos rendimentos."
      : reading === "AGIO" && priceToNav <= 0.95
        ? "Renda sugere ágio, mas a cota negocia abaixo do VP. O relatório gerencial pode explicar riscos ou eventos que pressionam o preço."
        : "As leituras por renda e patrimônio não apresentam uma divergência relevante.";

  return {
    ticker,
    fund: {
      name: indicators.name,
      segmentType: indicators.segmentType,
      segmentoAtuacao: indicators.segmentoAtuacao,
      currentPrice: round(currentPrice),
      navPerShare: round(navPerShare),
      priceToNav: round(priceToNav, 4),
      totalInvestors:
        Number.isFinite(totalInvestors) && totalInvestors > 0
          ? Math.trunc(totalInvestors)
          : null,
      administratorName: indicators.administratorName || null,
      managerName: indicators.managerName || null,
      patrimonialReading,
      dataAsOfDate: indicators.asOfDate,
      classification: normalizeFundClassification(
        {
          ticker,
          segmentType: indicators.segmentType,
          segmentoAtuacao: indicators.segmentoAtuacao,
        },
        fiiCatalog,
      ),
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
      recurrenceNote,
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
  const excludedTickers = new Set(
    String(url.searchParams.get("exclude") || "")
      .split(",")
      .map((item) => normalizeFiiTicker(item))
      .filter(Boolean),
  );
  const selected = fiiCatalog.find((item) => item.ticker === ticker);
  const segmentType = selected?.segmentType || url.searchParams.get("segmentType") || "";
  const segmentoAtuacao = selected?.segmentoAtuacao || url.searchParams.get("segmentoAtuacao") || "";
  const origin = {
    ...(selected || {}),
    ticker,
    segmentType,
    segmentoAtuacao,
  };
  const { precision, matches: comparableMatches } = selectComparableFunds(
    origin,
    fiiCatalog,
    fiiCatalog.length,
  );
  const originClassification = normalizeFundClassification(origin);
  const matches = comparableMatches
    .filter((item) => !excludedTickers.has(item.ticker))
    .slice(0, 5)
    .map((item) => ({
      ...item,
      classification: normalizeFundClassification(item, fiiCatalog),
      availableNow: Boolean(brapiToken || item.sandbox),
      reason:
        precision === "segmento"
          ? `Mesmo tipo e segmento: ${originClassification.label}`
          : `Mesmo tipo de fundo: ${originClassification.type}`,
    }));

  return {
    ticker,
    segmentType,
    segmentoAtuacao,
    precision,
    suggestions: matches,
    note:
      precision === "segmento"
        ? "Comparáveis priorizados pelo mesmo tipo e segmento de atuação."
        : precision === "tipo"
          ? "Não há comparáveis suficientes do mesmo segmento no catálogo atual. A seleção considera apenas o tipo do fundo e pode ser menos precisa."
          : "Não há dados suficientes de tipo e segmento para sugerir comparáveis com segurança.",
    source: "catálogo inicial do MVP com classificação da consulta atual",
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
        return { ok: true, ...(await valuation(innerUrl, "/api/comparison")) };
      } catch (error) {
        if (error.internalMessage) logInternalError(`BRAPI comparação ${ticker}`, { message: error.internalMessage });
        return {
          ok: false,
          ticker,
          riskRate,
          error: error.message || publicDataError(),
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
    "/cadastro-confirmado": "cadastro-confirmado.html",
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
    "/admin/documental-lab": "admin-documental-lab.html",
    "/admin/documental-lab.html": "admin-documental-lab.html",
  };
  if (protectedAdminRoutes.has(pathname) && !requireAdminAuth(req, res)) return;
  if (["/ferramenta", "/ferramenta.html"].includes(pathname)) {
    const user = await sessionUser(req);
    if (!canAccessTool(user)) {
      res.writeHead(302, { ...securityHeaders(), Location: "/login.html", "Cache-Control": "no-store" });
      res.end();
      return;
    }
  }

  const relative = routeMap[pathname] || pathname.slice(1);
  const file = normalize(join(publicDir, relative));
  if (!file.startsWith(publicDir)) return json(res, 403, { error: "Acesso negado." });
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      ...securityHeaders(),
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
  const origin = originFrom(req);
  try {
    if (isAdminPath(url.pathname) && !checkRateLimit(req, res, "admin", 120, 15 * 60 * 1000)) return;
    if (url.pathname === "/admin/testar-email") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "Metodo nao permitido." });
      if (!requireAdminAuth(req, res)) return;
      return json(res, 503, { ok: false, error: "Envio de e-mail desativado temporariamente." });
    }
    if (url.pathname.startsWith(protectedAdminApiPrefix)) {
      if (!requireAdminAuth(req, res)) return;

      if (url.pathname === "/admin/api/users" && req.method === "GET") {
        const result = await withUsers(async (users) => ({
          users: users.map(publicUser),
          emailResults: [],
        }));
        return json(res, 200, { ok: true, ...result });
      }

      if (url.pathname === "/admin/api/users/by-email") {
        if (req.method !== "GET") {
          return json(res, 405, { ok: false, error: "Metodo nao permitido." });
        }
        const email = normalizeAdministrativeEmail(url.searchParams.get("email") || "");
        if (!email) {
          return json(res, 400, { ok: false, error: "Informe um e-mail válido." });
        }
        const matches = await withUsers(async (users) =>
          users
            .filter((user) => normalizeAdministrativeEmail(user?.email) === email)
            .map(adminUserEmailLookupResult),
        );
        return json(res, 200, {
          ok: true,
          count: matches.length,
          users: matches,
        });
      }

      if (url.pathname === "/admin/api/fii-searches") {
        if (req.method !== "GET") {
          return json(res, 405, { ok: false, error: "Metodo nao permitido." });
        }
        try {
          return json(res, 200, await fiiSearchesSummary());
        } catch (error) {
          if (error.internalMessage) logInternalError("Histórico de pesquisas", { message: error.internalMessage });
          return json(res, 500, {
            ok: false,
            error: "Não foi possível consultar o histórico de pesquisas agora.",
          });
        }
      }

      if (url.pathname === "/admin/api/users" && req.method === "POST") {
        try {
          const body = await readJsonBody(req);
          const result = await registerUser(body, origin);
          return json(res, 201, { ok: true, ...result });
        } catch (error) {
          return json(res, 400, { ok: false, error: error.message || "Cadastro inválido." });
        }
      }

      if (url.pathname === "/admin/api/brapi-test" && req.method === "GET") {
        const result = await testBrapiIndicators();
        return json(res, result.configured ? 200 : 503, result);
      }

      if (url.pathname === "/admin/api/maintenance") {
        if (req.method !== "GET") {
          return json(res, 405, { ok: false, error: "Método não permitido." });
        }
        return json(res, 200, {
          ok: true,
          service: "FII Select Maintenance",
          environment:
            process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || "development",
          timestamp: new Date().toISOString(),
          endpoints: {
            brapiDiagnostic: {
              method: "GET",
              path: "/admin/api/maintenance/brapi-fii-diagnostic?ticker=JSRE11",
              description: "Diagnóstico interno de dados estruturados de FIIs",
            },
            brapiUsage: {
              method: "GET",
              path: "/admin/api/maintenance/brapi-usage",
              description: "Contagem interna de requisições da BRAPI",
            },
          },
          notes: [
            "Endpoint protegido por autenticação interna.",
            "Não expõe tokens, dados pessoais ou informações sensíveis.",
          ],
        });
      }

      if (url.pathname === "/admin/api/maintenance/brapi-fii-diagnostic") {
        if (req.method !== "GET") {
          return json(res, 405, { ok: false, error: "Método não permitido." });
        }
        const ticker = String(
          url.searchParams.get("ticker") || url.searchParams.get("Ticker") || "JSRE11",
        ).trim().toUpperCase();
        if (!/^[A-Z]{4}[0-9]{2}$/.test(ticker)) {
          return json(res, 400, {
            ok: false,
            error: "Informe um ticker de FII no formato JSRE11.",
          });
        }
        const result = await brapiFiiDiagnostic(ticker);
        return json(res, result.status.brapiTokenConfigured ? 200 : 503, result);
      }

      if (url.pathname === "/admin/api/documental-lab") {
        if (req.method !== "GET") {
          return json(res, 405, { ok: false, error: "Método não permitido." });
        }
        const ticker = String(
          url.searchParams.get("ticker") || url.searchParams.get("Ticker") || "",
        ).trim().toUpperCase();
        if (!/^[A-Z]{4}[0-9]{2}$/.test(ticker)) {
          return json(res, 400, {
            ok: false,
            error: "Informe um ticker de FII no formato HGLG11.",
          });
        }
        const result = await documentalLab(ticker);
        return json(res, result.status.brapiTokenConfigured ? 200 : 503, result);
      }

      if (url.pathname === "/admin/api/maintenance/brapi-usage") {
        if (req.method !== "GET") {
          return json(res, 405, { ok: false, error: "Método não permitido." });
        }
        return json(res, 200, { ok: true, ...brapiUsage.snapshot() });
      }

      if (url.pathname === "/admin/api/maintenance/remove-test-users") {
        if (req.method !== "POST") {
          return json(res, 405, { ok: false, error: "Método não permitido." });
        }
        const body = await readJsonBody(req);
        if (body.confirm !== auditedTestUserCleanupConfirmation) {
          return json(res, 400, { ok: false, error: "Confirmação inválida. Nenhum usuário foi alterado." });
        }
        try {
          const result = await removeAuditedTestUsersFromStore();
          return json(res, 200, result);
        } catch (error) {
          if (error.rollbackExecuted) {
            logInternalError("Limpeza controlada de usuários", {
              message: "Rollback executado após falha de validação pós-escrita.",
            });
          }
          return json(res, 400, {
            ok: false,
            error: error.message || "Limpeza abortada. Nenhum usuário foi removido.",
            rollbackExecuted: Boolean(error.rollbackExecuted),
          });
        }
      }

      const statusMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/status$/);
      if (statusMatch && req.method === "PATCH") {
        if (!checkRateLimit(req, res, "admin-status", 60, 10 * 60 * 1000)) return;
        const body = await readJsonBody(req);
        const result = await changeUserStatus(decodeURIComponent(statusMatch[1]), body.status, origin);
        return json(res, 200, { ok: true, ...result });
      }

      const accountTypeMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/account-type$/);
      if (accountTypeMatch && req.method === "PATCH") {
        if (!checkRateLimit(req, res, "admin-account-type", 20, 10 * 60 * 1000)) return;
        const body = await readJsonBody(req);
        if (!normalizeAdministrativeAccountType(body.accountType)) {
          return json(res, 400, { ok: false, error: "Tipo de conta inválido." });
        }
        const result = await markUserAsInternal(decodeURIComponent(accountTypeMatch[1]));
        return json(res, 200, { ok: true, ...result });
      }

      if (url.pathname === "/admin/api/users/account-type-by-email" && req.method === "PATCH") {
        if (!checkRateLimit(req, res, "admin-account-type", 20, 10 * 60 * 1000)) return;
        const body = await readJsonBody(req);
        if (!normalizeAdministrativeAccountType(body.accountType)) {
          return json(res, 400, { ok: false, error: "Tipo de conta inválido." });
        }
        const result = await markUserAsInternalByEmail(body.email);
        if (!result.ok) return json(res, result.status, result);
        return json(res, 200, result);
      }

      const resendMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/resend-email$/);
      if (resendMatch && req.method === "POST") {
        const result = await resendUserEmail(decodeURIComponent(resendMatch[1]), origin);
        return json(res, 200, { ok: true, ...result });
      }

      const paymentMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/payment-link$/);
      if (paymentMatch && req.method === "POST") {
        if (!checkRateLimit(req, res, "admin-payment", 60, 10 * 60 * 1000)) return;
        const result = await prepareFounderPayment(decodeURIComponent(paymentMatch[1]));
        return json(res, 200, { ok: true, ...result });
      }

      return json(res, 404, { ok: false, error: "Rota administrativa nao encontrada." });
    }
    if (url.pathname === "/api/users/register" && req.method === "POST") {
      if (!checkRateLimit(req, res, "register", 20, 10 * 60 * 1000)) return;
      try {
        const body = await readJsonBody(req);
        const result = await registerUser(body, origin);
        return json(res, 201, { ok: true, ...result });
      } catch (error) {
        return json(res, 400, { ok: false, error: error.message || "Cadastro inválido." });
      }
    }
    if (url.pathname === "/api/users/verify-email" && req.method === "GET") {
      try {
        await confirmUserEmail(url.searchParams.get("token") || "", origin);
        res.writeHead(302, {
          ...securityHeaders(),
          Location: "/login.html?emailVerified=1",
          "Cache-Control": "no-store",
        });
        res.end();
        return;
      } catch (error) {
        return json(res, 400, {
          ok: false,
          error: error.message || "Não foi possível confirmar o e-mail.",
        });
      }
    }
    if (url.pathname === "/api/users/resend-verification" && req.method === "POST") {
      if (!checkRateLimit(req, res, "resend-verification", 10, 30 * 60 * 1000)) return;
      try {
        const body = await readJsonBody(req);
        const email = cleanText(body.email, 254).toLowerCase();
        const result = await withUsers(async (users) => {
          const match = findUniqueUserByEmail(users, email);
          if (!match.ok || isEmailVerified(match.user)) {
            return { ok: true };
          }
          const verificationEmail = await issueEmailVerification(match.user);
          return { ok: true, verificationEmail };
        });
        return json(res, 200, result);
      } catch {
        return json(res, 200, { ok: true });
      }
    }
    if (url.pathname === "/api/users/login-status" && req.method === "POST") {
      clearClientSession(res, req);
      if (!checkRateLimit(req, res, "client-login", 30, 10 * 60 * 1000)) return;
      try {
        const body = await readJsonBody(req);
        const user = await findUserForLogin(body.email);
        if (!user) {
          return json(res, 401, {
            ok: false,
            authenticated: false,
            error: "Cadastro não encontrado.",
          });
        }

        createClientSession(res, req, user.id);
        return json(res, 200, {
          ok: true,
          authenticated: true,
          user,
          redirectTo: clientFlowPath(user),
        });
      } catch (error) {
        logInternalError("Login de cliente", { message: error.message || "Falha de leitura." });
        return json(res, 503, {
          ok: false,
          authenticated: false,
          error: "Não foi possível entrar agora. Tente novamente em instantes.",
        });
      }
    }
    if (url.pathname === "/api/users/session" && req.method === "GET") {
      const user = await sessionUser(req);
      if (!user) return json(res, 401, { ok: false, authenticated: false });
      return json(res, 200, {
        ok: true,
        authenticated: true,
        user: publicUser(user),
        canAccessTool: canAccessTool(user),
      });
    }
    if (url.pathname === "/api/users/account-status" && req.method === "PATCH") {
      if (!checkRateLimit(req, res, "account-status", 20, 10 * 60 * 1000)) return;
      const user = await sessionUser(req);
      if (!user) return json(res, 401, { ok: false, error: "Faça login para alterar sua conta." });

      const body = await readJsonBody(req);
      const nextStatus = normalizeStatus(body.status);
      const accountActions = {
        inactive: {
          operationalAction: "cliente inativou conta",
          redirectTo: "/conta-inativa.html",
        },
        archived: {
          operationalAction: "cliente arquivou conta",
          redirectTo: "/conta-arquivada.html",
        },
      };
      const accountAction = accountActions[nextStatus];
      if (!accountAction) {
        return json(res, 400, { ok: false, error: "Ação de conta inválida." });
      }

      const result = await changeUserStatus(user.id, nextStatus, origin, {
        operationalAction: accountAction.operationalAction,
      });
      return json(res, 200, {
        ok: true,
        ...result,
        redirectTo: accountAction.redirectTo,
      });
    }
    if (url.pathname === "/api/users/account-event" && req.method === "POST") {
      const user = await sessionUser(req);
      if (!user) return json(res, 401, { ok: false, error: "Faça login para registrar esta ação." });

      const body = await readJsonBody(req);
      const accountEvents = {
        reactivation_requested: "cliente solicitou reativação",
      };
      const action = accountEvents[String(body.event || "")];
      if (!action) return json(res, 400, { ok: false, error: "Evento de conta inválido." });

      const result = await recordClientAccountEvent(user.id, action);
      return json(res, 200, { ok: true, ...result });
    }
    if (url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        provider: "brapi.dev",
        mode: brapiToken ? "token configurado" : "sandbox",
      });
    }
    if (url.pathname === "/api/user-comparison") {
      const user = await sessionUser(req);
      if (!user) return json(res, 401, { ok: false, error: "Faça login para acessar a comparação." });
      if (!canAccessTool(user)) {
        return json(res, 403, { ok: false, error: "A ferramenta ainda não está liberada para este cadastro." });
      }
      if (req.method === "GET") {
        return json(res, 200, { ok: true, ...(await getUserComparison(user.id)) });
      }
      if (req.method === "PATCH") {
        const body = await readJsonBody(req);
        return json(res, 200, { ok: true, ...(await saveUserComparison(user.id, body.tickers)) });
      }
      return json(res, 405, { ok: false, error: "Metodo nao permitido." });
    }
    if (
      ["/api/valuation", "/api/suggestions", "/api/comparison", "/api/crossed-reading"]
        .includes(url.pathname)
    ) {
      const user = await sessionUser(req);
      if (!user) return json(res, 401, { error: "Faça login para acessar a ferramenta." });
      if (!canAccessTool(user)) {
        return json(res, 403, { error: "A ferramenta ainda não está liberada para este cadastro." });
      }
      try {
        if (url.pathname === "/api/valuation") {
          const result = await valuation(url);
          await recordFiiSearch(user, result.ticker);
          return json(res, 200, result);
        }
        if (url.pathname === "/api/suggestions") return json(res, 200, suggestions(url));
        if (url.pathname === "/api/crossed-reading") {
          const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
          if (!/^[A-Z]{4}[0-9]{2}$/.test(ticker)) {
            return json(res, 400, { error: "Informe um ticker de FII no formato MXRF11." });
          }
          return json(res, 200, await crossedReading(ticker));
        }
        return json(res, 200, await comparison(url));
      } catch (error) {
        if (error.internalMessage) {
          logInternalError(`BRAPI ${url.pathname}`, { message: error.internalMessage });
        } else if (url.pathname === "/api/valuation" && !isValuationError(error)) {
          logInternalError("Valuation inesperado", {
            message: `Erro interno ao calcular estimativa em ${new Date().toISOString()}.`,
          });
        }
        const status = Number.isInteger(error.status) ? error.status : 400;
        const message = url.pathname === "/api/valuation" && !isValuationError(error)
          ? valuationErrorMessages.calculation_error
          : error.message || publicDataError();
        return json(res, status, { error: message, code: error.publicCode || "unexpected_error" });
      }
    }
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

await Promise.all([
  ensureUsersFile(usersFile),
  ensureJsonFile(fiiSearchLogFile, []),
  ensureJsonFile(userComparisonsFile, []),
]);

server.listen(port, host, () => {
  console.log(`FII Select widget: http://${host}:${port}`);
  console.log(brapiToken ? "API: token configurado" : "API: sandbox MXRF11/HGLG11");
});
