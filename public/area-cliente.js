const statusContent = {
  pending: {
    title: "Acompanhamento do cadastro",
    sectionTitle: "Status do cadastro",
    label: "Em análise",
    text: "Seu cadastro foi recebido e está em análise. A ferramenta ainda não está liberada.",
  },
  pending_trial: {
    title: "Teste grátis",
    sectionTitle: "Teste grátis",
    label: "Teste aguardando liberação",
    text: "Seu teste grátis aguarda liberação. O período de 7 dias ainda não começou e a ferramenta permanece bloqueada.",
  },
  pending_founder: {
    title: "Programa Fundadores",
    sectionTitle: "Plano Fundador",
    label: "Pagamento/liberação pendente",
    text: "Realize o pagamento pelo PagBank. O acesso à ferramenta será liberado após a confirmação manual do pagamento.",
  },
  active: {
    title: "Bem-vindo ao FII Select",
    sectionTitle: "Plano Fundador",
    label: "Plano ativo",
    text: "Seu acesso ao Plano Fundador está liberado.",
  },
  trial_active: {
    title: "Bem-vindo ao FII Select",
    sectionTitle: "Teste grátis",
    label: "Teste grátis ativo",
    text: "Seu teste de 7 dias está ativo e a ferramenta está liberada.",
  },
  trial_finished: {
    title: "Minha conta - Teste encerrado",
    sectionTitle: "Teste grátis",
    label: "Teste encerrado",
    text: "Seu teste grátis terminou. Conheça o Plano Fundador para continuar usando a ferramenta.",
  },
  inactive: {
    title: "Minha conta",
    sectionTitle: "Status da conta",
    label: "Conta inativa",
    text: "Sua conta está inativa e a ferramenta permanece bloqueada.",
  },
  archived: {
    title: "Minha conta",
    sectionTitle: "Status da conta",
    label: "Conta arquivada",
    text: "Sua conta foi arquivada. Solicite a reativação para voltar a acessar.",
  },
  rejected: {
    title: "Minha conta",
    sectionTitle: "Status do cadastro",
    label: "Cadastro não aprovado",
    text: "Seu cadastro não foi aprovado neste momento.",
  },
  awaiting_payment: {
    title: "Minha conta - Programa Fundadores",
    sectionTitle: "Pagamento",
    label: "Pagamento pendente",
    text: "O pagamento ainda não foi confirmado. A ferramenta permanece bloqueada.",
  },
  unpaid: {
    title: "Minha conta - Programa Fundadores",
    sectionTitle: "Pagamento",
    label: "Pagamento pendente",
    text: "O pagamento ainda não foi identificado. A ferramenta permanece bloqueada.",
  },
};

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function formatDate(value) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

async function loadCustomerArea() {
  const response = await fetch("/api/users/me");
  const result = await response.json();
  if (response.status === 401) return window.location.replace("/login.html");
  if (!response.ok) throw new Error(result.error || "Não foi possível carregar sua área.");

  const { user, canAccessTool, paymentUrl, areaPath } = result;
  if (areaPath && window.location.pathname !== areaPath) {
    return window.location.replace(areaPath);
  }
  const effectiveStatus =
    !canAccessTool && ["awaiting_payment", "unpaid"].includes(user.paymentStatus)
      ? user.paymentStatus
      : user.status;
  const content = statusContent[effectiveStatus] || statusContent.pending;

  setText("[data-area-title]", content.title);
  setText("[data-status-section-title]", content.sectionTitle);
  setText("[data-user-initial]", (user.name || "I").trim().charAt(0).toUpperCase());
  setText("[data-user-name]", user.name || "Investidor");
  setText("[data-user-email]", user.email || "–");
  setText("[data-user-phone]", user.phone || "–");
  setText("[data-user-plan]", String(user.plan || "").includes("teste") ? "Teste grátis" : "Plano Fundador");
  setText("[data-status-plan]", String(user.plan || "").includes("teste") ? "Teste grátis" : "Programa Fundadores");
  setText("[data-user-status]", content.label);
  setText("[data-status-copy]", content.text);
  const statusBadge = document.querySelector("[data-user-status]");
  statusBadge.classList.remove("ok", "danger-badge", "pending-badge");
  statusBadge.classList.add(
    canAccessTool
      ? "ok"
      : ["rejected", "inactive", "archived", "trial_finished"].includes(user.status)
        ? "danger-badge"
        : "pending-badge",
  );
  const areaHome = document.querySelector("[data-area-home]");
  if (areaHome) areaHome.href = areaPath || "/area-cliente/acompanhamento";

  const trialPeriod = document.querySelector("[data-trial-period]");
  trialPeriod.hidden = user.status !== "trial_active";
  setText("[data-trial-start]", formatDate(user.trialStartAt));
  setText("[data-trial-end]", formatDate(user.trialEndAt));

  document.querySelectorAll("[data-tool-action], [data-tool-nav]").forEach((element) => {
    element.hidden = !canAccessTool;
  });

  const paymentAction = document.querySelector("[data-payment-action]");
  paymentAction.hidden = !(user.status === "pending_founder" && paymentUrl);
  if (paymentUrl) paymentAction.href = paymentUrl;
  document.querySelector("[data-plan-price-row]").hidden = !["pending_founder", "active"].includes(user.status);

  document.body.classList.toggle(
    "account-test-page",
    ["pending_trial", "trial_active", "trial_finished"].includes(user.status),
  );

  const reactivationAction = document.querySelector("[data-reactivation-action]");
  reactivationAction.hidden = !["inactive", "archived"].includes(user.status);
}

loadCustomerArea().catch((error) => {
  setText("[data-status-copy]", error.message);
});
