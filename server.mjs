import http from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
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
const clientSessionSecret = process.env.CLIENT_SESSION_SECRET || adminPassword || randomUUID();
const clientSessionCookie = "fii_select_session";
const clientSessionMaxAge = 60 * 60 * 24 * 30;
const protectedAdminRoutes = new Set(["/admin", "/admin/login", "/admin/usuarios", "/admin/testar-email"]);
const protectedAdminApiPrefix = "/admin/api/";
const platformContactUrl =
  "https://wa.me/5511971780101?text=Ol%C3%A1.%20Quero%20reativar%20meu%20acesso%20ao%20FII%20Select.";
const defaultPagBankPaymentUrl = "https://pag.ae/81R2Xoquo";
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
const cache = new Map();
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
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function safeCompare(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
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

function brevoTemplateParams(user, origin) {
  const baseUrl = nonEmptyString(
    process.env.BASE_URL,
    nonEmptyString(origin, "https://fiiselect.com.br"),
  ).replace(/\/+$/, "");
  const name = nonEmptyString(user.name, "Investidor");
  const email = nonEmptyString(user.email);
  return {
    NOME: name,
    EMAIL: email,
    LINK_LOGIN: nonEmptyString(user.linkLogin, `${baseUrl}/login.html`),
    LINK_ACESSO: nonEmptyString(user.linkAcesso, `${baseUrl}${clientAreaPath(user)}`),
    LINK_PLANOS: nonEmptyString(user.linkPlanos, `${baseUrl}/assinar`),
    LINK_REATIVACAO: nonEmptyString(user.linkReativacao, platformContactUrl),
    DATA_INICIO_TESTE: formatBrazilDate(user.trialStartAt || user.trialStartedAt),
    DATA_FIM_TESTE: formatBrazilDate(user.trialEndAt || user.trialEndsAt),
  };
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

function sessionSignature(value) {
  return createHmac("sha256", clientSessionSecret).update(value).digest("base64url");
}

function createClientSession(userId) {
  if (!clientSessionSecret) throw new Error("Sessão do cliente indisponível.");
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sessionSignature(payload)}`;
}

function readClientSession(req) {
  if (!clientSessionSecret) return "";
  const token = parseCookies(req)[clientSessionCookie] || "";
  const parts = token.split(".");
  if (parts.length !== 3) return "";
  const [userId, issuedAt, signature] = parts;
  const payload = `${userId}.${issuedAt}`;
  if (!safeCompare(signature, sessionSignature(payload))) return "";
  if (!Number.isFinite(Number(issuedAt)) || Date.now() - Number(issuedAt) > clientSessionMaxAge * 1000) {
    return "";
  }
  return userId;
}

function setClientSession(res, req, userId) {
  const secure = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  res.setHeader(
    "Set-Cookie",
    `${clientSessionCookie}=${encodeURIComponent(createClientSession(userId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clientSessionMaxAge}${secure ? "; Secure" : ""}`,
  );
}

function clearClientSession(res) {
  res.setHeader(
    "Set-Cookie",
    `${clientSessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

async function sessionUser(req, origin) {
  const userId = readClientSession(req);
  if (!userId) return null;
  return withUsers(async (users) => {
    await expireFinishedTrials(users, origin);
    return users.find((user) => user.id === userId) || null;
  });
}

function canAccessTool(user) {
  const blockedPayment = ["awaiting_payment", "unpaid"].includes(user?.paymentStatus);
  return Boolean(
    user &&
      !blockedPayment &&
      ["active", "trial_active"].includes(normalizeStatus(user.status)),
  );
}

function clientAreaPath(user) {
  const status = normalizeStatus(user?.status);
  if (["pending_trial", "trial_active", "trial_finished"].includes(status)) {
    return "/area-cliente/teste";
  }
  if (["pending_founder", "active"].includes(status)) {
    return "/area-cliente/fundador";
  }
  return "/area-cliente/acompanhamento";
}

function brevoTemplatePayload({ user, event, origin, emailFrom }) {
  const templateEnv = templateEnvByEvent[event];
  if (!templateEnv) throw new Error(`Evento Brevo desconhecido: ${event}.`);

  const templateId = Number(requireEnv(templateEnv));
  const params = brevoTemplateParams(user, origin);
  if (["cadastroRecebidoTeste", "cadastroRecebidoFundador"].includes(event)) {
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
    throw new Error(`Brevo API respondeu ${response.status}: ${message.slice(0, 180)}`);
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
    throw new Error(`Brevo API respondeu ${response.status}: ${message.slice(0, 180)}`);
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
  };
}

function validateRegistrationInput(input) {
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const phone = String(input.phone || "").replace(/\D/g, "");
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validPhone = phone.length >= 10 && phone.length <= 13 && !/^(\d)\1+$/.test(phone);

  if (!name) throw new Error("Informe seu nome.");
  if (!email) throw new Error("Informe seu e-mail.");
  if (!emailPattern.test(email)) throw new Error("Informe um e-mail válido.");
  if (!phone) throw new Error("Informe seu WhatsApp.");
  if (!validPhone) throw new Error("Informe um WhatsApp válido.");

  return { ...input, name, email, phone };
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
    plan,
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
  if (["rejected", "refused", "recusado", "rejeitado"].includes(nextStatus)) {
    return ["cadastroNaoAprovado"];
  }
  if (["trial_active", "teste_ativo", "teste"].includes(nextStatus)) {
    return ["acessoLiberadoTeste"];
  }
  if (["trial_finished", "trial_ended", "teste_finalizado", "teste_encerrado"].includes(nextStatus)) {
    return ["testeFinalizado"];
  }
  if (["archived", "arquivado"].includes(nextStatus)) return ["contaArquivada"];
  if (["inactive", "inativo", "inativado"].includes(nextStatus)) return ["contaInativada"];
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
    pendente: "pending",
    pending_trial: "pending_trial",
    pending_founder: "pending_founder",
  };
  return map[value] || value || "pending";
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
    user.lastEmailError = error.message || "Falha ao enviar e-mail.";
    user.history = user.history || [];
    user.history.unshift(`${formatBrazilDateTime(new Date())} - Falha no e-mail ${eventLabel[event]}: ${user.lastEmailError}`);
    return { ok: false, event, error: user.lastEmailError };
  }
}

async function expireFinishedTrials(users, origin) {
  const now = Date.now();
  const emailResults = [];
  for (const user of users) {
    if (
      user.status === "trial_active" &&
      (user.trialEndAt || user.trialEndsAt) &&
      new Date(user.trialEndAt || user.trialEndsAt).getTime() <= now
    ) {
      user.status = "trial_finished";
      user.updatedAt = new Date().toISOString();
      user.history = user.history || [];
      user.history.unshift(`${formatBrazilDateTime(user.updatedAt)} - Teste grátis encerrado automaticamente`);
      emailResults.push(await sendAndRecord(user, "testeFinalizado", origin));
    }
  }
  return emailResults;
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
    const emailResult = await sendAndRecord(user, registrationTemplateEvent(user), origin);
    users.unshift(user);
    return { user: publicUser(user), email: emailResult };
  });
}

async function changeUserStatus(id, status, origin) {
  return withUsers(async (users) => {
    const user = users.find((item) => item.id === id);
    if (!user) throw new Error("Usuario nao encontrado.");

    const nextStatus = normalizeStatus(status);
    user.status = nextStatus;
    user.updatedAt = new Date().toISOString();
    user.history = user.history || [];
    user.history.unshift(`${formatBrazilDateTime(user.updatedAt)} - Status alterado para ${statusLabel(nextStatus)}`);

    const events = statusTemplateEvents(nextStatus);
    if (nextStatus === "active") {
      user.plan = "fundador";
      user.paymentStatus = "confirmed";
    }
    if (nextStatus === "trial_active") {
      user.plan = "teste_7_dias";
      user.paymentStatus = "";
      applyTrialDates(user);
      user.updatedAt = new Date().toISOString();
      user.history.unshift(
        `${formatBrazilDateTime(user.updatedAt)} - Teste gratuito iniciado ate ${formatBrazilDate(user.trialEndAt)}`,
      );
    }

    const emailResults = [];
    for (const event of events) emailResults.push(await sendAndRecord(user, event, origin));
    const emailErrors = emailResults.filter((result) => !result.ok).map((result) => result.error);
    if (emailErrors.length) user.lastEmailError = emailErrors.join(" | ");
    return { user: publicUser(user), emailResults };
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
    const event = currentTemplateEvent(user);
    const email = await sendAndRecord(user, event, origin);
    return { user: publicUser(user), email };
  });
}

async function findUserForLogin(email, origin) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Informe o e-mail.");
  return withUsers(async (users) => {
    await expireFinishedTrials(users, origin);
    const user = users.find((item) => String(item.email || "").trim().toLowerCase() === normalizedEmail);
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      intent: user.intent || "general",
      status: normalizeStatus(user.status),
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
      defaultPagBankPaymentUrl;
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
    "/area-cliente": "area-cliente.html",
    "/area-cliente/fundador": "area-cliente.html",
    "/area-cliente/teste": "area-cliente.html",
    "/area-cliente/acompanhamento": "area-cliente.html",
    "/ferramenta": "ferramenta.html",
    "/admin/login": "admin-login.html",
    "/admin": "admin.html",
    "/admin/usuarios": "admin.html",
  };
  if (protectedAdminRoutes.has(pathname) && !requireAdminAuth(req, res)) return;
  if (
    [
      "/area-cliente",
      "/area-cliente.html",
      "/area-cliente/fundador",
      "/area-cliente/teste",
      "/area-cliente/acompanhamento",
      "/ferramenta",
      "/ferramenta.html",
    ].includes(pathname)
  ) {
    const user = await sessionUser(req, originFrom(req));
    if (!user) return redirect(res, "/login.html");
    if (["/ferramenta", "/ferramenta.html"].includes(pathname) && !canAccessTool(user)) {
      return redirect(res, clientAreaPath(user));
    }
  }

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
  const origin = originFrom(req);
  try {
    if (url.pathname === "/admin/testar-email") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "Metodo nao permitido." });
      if (!requireAdminAuth(req, res)) return;
      try {
        await sendBrevoApiTestEmail();
        return json(res, 200, { ok: true });
      } catch (error) {
        return json(res, 500, { ok: false, error: error.message || "Falha ao enviar e-mail." });
      }
    }
    if (url.pathname.startsWith(protectedAdminApiPrefix)) {
      if (!requireAdminAuth(req, res)) return;

      if (url.pathname === "/admin/api/users" && req.method === "GET") {
        const result = await withUsers(async (users) => {
          const emailResults = await expireFinishedTrials(users, origin);
          return {
            users: users.map(publicUser),
            emailResults,
          };
        });
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

      const statusMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/status$/);
      if (statusMatch && req.method === "PATCH") {
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
        const result = await prepareFounderPayment(decodeURIComponent(paymentMatch[1]));
        return json(res, 200, { ok: true, ...result });
      }

      return json(res, 404, { ok: false, error: "Rota administrativa nao encontrada." });
    }
    if (url.pathname === "/api/users/register" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await registerUser(body, origin);
        return json(res, 201, { ok: true, ...result });
      } catch (error) {
        return json(res, 400, { ok: false, error: error.message || "Cadastro inválido." });
      }
    }
    if (url.pathname === "/api/users/login-status" && req.method === "POST") {
      const body = await readJsonBody(req);
      const user = await findUserForLogin(body.email, origin);
      if (user) setClientSession(res, req, user.id);
      return json(res, 200, {
        ok: true,
        user,
        redirectTo: user ? clientAreaPath(user) : "",
      });
    }
    if (url.pathname === "/api/users/me" && req.method === "GET") {
      const user = await sessionUser(req, origin);
      if (!user) return json(res, 401, { ok: false, error: "Sessão não encontrada." });
      const paymentUrl =
        process.env.PAGBANK_PAYMENT_URL ||
        process.env.FOUNDER_PAYMENT_URL ||
        process.env.PAYMENT_LINK_URL ||
        defaultPagBankPaymentUrl;
      return json(res, 200, {
        ok: true,
        user: publicUser(user),
        canAccessTool: canAccessTool(user),
        areaPath: clientAreaPath(user),
        paymentUrl: user.status === "pending_founder" ? paymentUrl : "",
      });
    }
    if (url.pathname === "/api/users/logout" && req.method === "POST") {
      clearClientSession(res);
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        provider: "brapi.dev",
        mode: brapiToken ? "token configurado" : "sandbox",
      });
    }
    if (["/api/valuation", "/api/suggestions", "/api/comparison"].includes(url.pathname)) {
      const user = await sessionUser(req, origin);
      if (!user) return json(res, 401, { error: "Faça login para acessar a ferramenta." });
      if (!canAccessTool(user)) {
        return json(res, 403, { error: "A ferramenta ainda não está liberada para este cadastro." });
      }
      if (url.pathname === "/api/valuation") return json(res, 200, await valuation(url));
      if (url.pathname === "/api/suggestions") return json(res, 200, suggestions(url));
      return json(res, 200, await comparison(url));
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
