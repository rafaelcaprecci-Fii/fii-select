const primaryPageByStatus = {
  pending_founder: "/assinar.html",
  payment_pending: "/status-pendente.html",
  awaiting_payment: "/status-pendente.html",
  unpaid: "/status-pendente.html",
  active: "/status-aprovado.html",
  pending_trial: "/status-teste-pendente.html",
  trial_active: "/status-teste-ativo.html",
  trial_finished: "/teste-encerrado.html",
  inactive: "/conta-inativa.html",
  canceled: "/conta-cancelada.html",
  archived: "/conta-arquivada.html",
  rejected: "/login.html",
  pending: "/login.html",
};

const allowedPagesByStatus = {
  pending_founder: ["/assinar.html"],
  payment_pending: ["/status-pendente.html"],
  awaiting_payment: ["/status-pendente.html"],
  unpaid: ["/status-pendente.html"],
  active: [
    "/status-aprovado.html",
    "/conta.html",
    "/conta-confirmacao-arquivamento.html",
    "/conta-confirmacao-cancelamento.html",
  ],
  pending_trial: ["/status-teste-pendente.html"],
  trial_active: ["/status-teste-ativo.html", "/conta-teste.html"],
  trial_finished: ["/teste-encerrado.html"],
  inactive: ["/conta-inativa.html"],
  canceled: ["/conta-cancelada.html"],
  archived: ["/conta-arquivada.html"],
};

function normalizedPath() {
  const path = window.location.pathname;
  return path.endsWith(".html") ? path : `${path}.html`;
}

function formatDate(value) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function setInitial(name) {
  document.querySelectorAll(".user-initial").forEach((element) => {
    element.textContent = (name || "I").trim().charAt(0).toUpperCase();
  });
}

function setLabeledValue(label, value) {
  document.querySelectorAll(".info-card p, .archive-bg-card div").forEach((row) => {
    const strong = row.querySelector("strong");
    const span = row.querySelector("span");
    if (strong?.textContent.trim() === label && span) span.textContent = value || "Não informado";
  });
}

function injectAccountData(user) {
  const statusLabels = {
    active: "Ativa",
    trial_active: "Teste grátis ativo",
    inactive: "Inativa",
    canceled: "Cancelada",
    archived: "Arquivada",
  };
  setInitial(user.name);
  setLabeledValue("Nome", user.name || "Investidor");
  setLabeledValue("E-mail", user.email);
  setLabeledValue("WhatsApp", user.phone);
  setLabeledValue("Corretora", "Não informado");
  setLabeledValue("Tipo de pessoa", "Não informado");
  setLabeledValue("Plano", String(user.plan || "").includes("teste") ? "Teste gratuito" : "Programa Fundadores");
  setLabeledValue("Situação", statusLabels[user.status] || "Em análise");
  setLabeledValue("Situação atual", statusLabels[user.status] || "Em análise");
  setLabeledValue("Última cobrança", "Não informada");
  setLabeledValue("Próxima cobrança", "Não informada");
  setLabeledValue("E-mail usado no pagamento", user.email);
  setLabeledValue("E-mail usado no teste", user.email);
  setLabeledValue("Teste iniciado em", formatDate(user.trialStartAt));
  setLabeledValue("Teste expira em", formatDate(user.trialEndAt));
}

function configurePage(user, paymentUrl) {
  injectAccountData(user);

  if (window.location.pathname.includes("status-aprovado")) {
    const copy = document.querySelector(".status-copy");
    if (copy) copy.textContent = `Obrigado(a), ${user.name || "Investidor"}, por escolher o Programa Fundadores.`;
  }

  if (window.location.pathname.includes("status-teste-ativo")) {
    const highlight = document.querySelector(".highlight-line");
    if (highlight) highlight.textContent = `Seu teste termina em ${formatDate(user.trialEndAt)}.`;
  }

  if (window.location.pathname.includes("assinar")) {
    const paymentButton = document.querySelector(".price-box .cta");
    if (paymentButton) {
      paymentButton.href = paymentUrl || "https://pag.ae/81R2Xoquo";
      paymentButton.addEventListener("click", async (event) => {
        event.preventDefault();
        const paymentWindow = window.open("about:blank", "_blank");
        if (paymentWindow) paymentWindow.opener = null;
        const response = await fetch("/api/users/payment-start", { method: "POST" });
        const result = await response.json();
        if (!response.ok) {
          paymentWindow?.close();
          throw new Error(result.error || "Não foi possível iniciar o pagamento.");
        }
        if (paymentWindow) paymentWindow.location = result.paymentUrl;
        window.location.href = "/status-pendente.html";
      });
    }
  }
}

function connectAccountConfirmation() {
  const statusByPage = {
    "/conta-confirmacao-arquivamento.html": "archived",
    "/conta-confirmacao-cancelamento.html": "canceled",
  };
  const status = statusByPage[normalizedPath()];
  if (!status) return;

  const confirm = document.querySelector(".archive-actions .cta-gold");
  confirm?.addEventListener("click", async (event) => {
    event.preventDefault();
    const response = await fetch("/api/users/account-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível atualizar a conta.");
    window.location.href = primaryPageByStatus[status];
  });
}

async function loadClientPage() {
  const response = await fetch("/api/users/me");
  const result = await response.json();
  if (response.status === 401) return window.location.replace("/login.html");
  if (!response.ok) throw new Error(result.error || "Não foi possível carregar seus dados.");

  const effectiveStatus =
    ["payment_pending", "awaiting_payment", "unpaid"].includes(result.user.paymentStatus)
      ? result.user.paymentStatus
      : result.user.status;
  const allowedPages = allowedPagesByStatus[effectiveStatus] || [];
  const currentPath = normalizedPath();
  const destination = primaryPageByStatus[effectiveStatus] || "/login.html";

  if (!allowedPages.includes(currentPath)) return window.location.replace(destination);
  configurePage(result.user, result.paymentUrl);
  connectAccountConfirmation();
}

loadClientPage().catch(() => {
  window.location.replace("/login.html");
});
