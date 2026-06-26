import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const outputDir = join(root, "outputs");
const dataDir = join(root, "data");
const usersFile = join(dataDir, "users.json");
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
  "/admin/login",
  "/admin-login.html",
  "/admin-negativa.html",
  "/admin/usuarios",
  "/admin/testar-email",
]);
const protectedAdminApiPrefix = "/admin/api/";
const stabilizationBaseUrl = "https://fii-select-fii-select-stabilization.up.railway.app";
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
const clientSessions = new Map();
const rateLimits = new Map();
let usersQueue = Promise.resolve();
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
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
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

function brevoTemplateParams(user) {
  const name = nonEmptyString(user.name, "Investidor");
  const email = nonEmptyString(user.email);
  return {
    NOME: name,
    EMAIL: email,
    LINK_LOGIN: `${stabilizationBaseUrl}/login.html`,
    LINK_ACESSO: "",
    LINK_PLANOS: nonEmptyString(user.linkPlanos, `${stabilizationBaseUrl}/assinar.html`),
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
    params.LINK_ACESSO = `${stabilizationBaseUrl}/status-teste-ativo.html`;
    delete params.LINK_LOGIN;
  } else if (event === "acessoLiberadoFundador") {
    params.LINK_ACESSO = `${stabilizationBaseUrl}/status-aprovado.html`;
    delete params.LINK_LOGIN;
  } else if (event === "contaInativada") {
    params.LINK_ACESSO = `${stabilizationBaseUrl}/conta-inativa.html`;
    delete params.LINK_LOGIN;
  } else if (event === "contaArquivada") {
    params.LINK_ACESSO = `${stabilizationBaseUrl}/conta-arquivada.html`;
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
  try {
    const data = await readFile(usersFile, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeUsers(users) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(usersFile, JSON.stringify(users, null, 2));
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
    phone: user.phone,
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
  return Boolean(user && ["active", "trial_active"].includes(normalizeStatus(user.status)));
}

function clientFlowPath(user) {
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

async function registerUser(input, origin) {
  const validatedInput = validateRegistrationInput(input);
  return withUsers(async (users) => {
    const duplicate = users.some(
      (item) => String(item.email || "").trim().toLowerCase() === validatedInput.email,
    );
    if (duplicate) {
      throw new Error(
        "Este e-mail já possui cadastro. Tente entrar ou aguarde a análise do seu acesso.",
      );
    }

    const user = createUser(validatedInput);
    users.unshift(user);
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
    user.status = nextStatus;
    user.updatedAt = new Date().toISOString();
    user.history = user.history || [];
    user.history.unshift(`${formatBrazilDateTime(user.updatedAt)} - Status alterado para ${statusLabel(nextStatus)}`);

    if (options.operationalAction) {
      recordOperationalEvent(user, options.operationalAction, previousStatus, nextStatus, user.updatedAt);
    }

    if (nextStatus === "active") {
      user.plan = "fundador";
    }
    if (nextStatus === "trial_active") {
      user.plan = "teste_7_dias";
      applyTrialDates(user);
      user.updatedAt = new Date().toISOString();
      user.history.unshift(
        `${formatBrazilDateTime(user.updatedAt)} - Teste gratuito iniciado ate ${formatBrazilDate(user.trialEndAt)}`,
      );
    }

    const emailResults = [];
    for (const event of statusTemplateEvents(nextStatus)) {
      emailResults.push(await sendAndRecord(user, event, origin));
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
  if (!normalizedEmail) throw new Error("Informe o e-mail.");

  return withUsers(async (users) => {
    const user = users.find(
      (item) => String(item.email || "").trim().toLowerCase() === normalizedEmail,
    );
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      intent: user.intent || "general",
      status: normalizeStatus(user.status),
      paymentStatus: user.paymentStatus || "",
    };
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

async function upstream(url) {
  const headers = brapiToken ? { Authorization: `Bearer ${brapiToken}` } : {};
  const response = await fetch(url, { headers });
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

      const statusMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/status$/);
      if (statusMatch && req.method === "PATCH") {
        if (!checkRateLimit(req, res, "admin-status", 60, 10 * 60 * 1000)) return;
        const body = await readJsonBody(req);
        const result = await changeUserStatus(decodeURIComponent(statusMatch[1]), body.status, origin);
        return json(res, 200, { ok: true, ...result });
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
    if (url.pathname === "/api/users/login-status" && req.method === "POST") {
      if (!checkRateLimit(req, res, "client-login", 30, 10 * 60 * 1000)) return;
      const body = await readJsonBody(req);
      const user = await findUserForLogin(body.email);
      if (user) createClientSession(res, req, user.id);
      return json(res, 200, {
        ok: true,
        authenticated: Boolean(user),
        user,
        redirectTo: user ? clientFlowPath(user) : "",
      });
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
    if (["/api/valuation", "/api/suggestions", "/api/comparison"].includes(url.pathname)) {
      const user = await sessionUser(req);
      if (!user) return json(res, 401, { error: "Faça login para acessar a ferramenta." });
      if (!canAccessTool(user)) {
        return json(res, 403, { error: "A ferramenta ainda não está liberada para este cadastro." });
      }
      try {
        if (url.pathname === "/api/valuation") return json(res, 200, await valuation(url));
        if (url.pathname === "/api/suggestions") return json(res, 200, suggestions(url));
        return json(res, 200, await comparison(url));
      } catch (error) {
        if (error.internalMessage) logInternalError(`BRAPI ${url.pathname}`, { message: error.internalMessage });
        return json(res, 400, { error: error.message || publicDataError() });
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

server.listen(port, host, () => {
  console.log(`FII Select widget: http://${host}:${port}`);
  console.log(brapiToken ? "API: token configurado" : "API: sandbox MXRF11/HGLG11");
});
