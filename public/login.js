const loginForm = document.querySelector("[data-login-form]");
const loginCard = document.querySelector(".auth-card");

const views = {
  not_found: {
    title: "Cadastro não encontrado",
    text: "Não encontramos um cadastro com este e-mail. Faça seu cadastro primeiro para solicitar acesso ao FII Select.",
    label: "Fazer cadastro",
    href: "/cadastro",
  },
  pending: {
    title: "Cadastro realizado",
    text: "Seu cadastro foi encontrado. Este fluxo ainda não está disponível neste ambiente de estabilização.",
    label: "Voltar para o início",
    href: "/",
  },
  rejected: {
    title: "Cadastro não aprovado",
    text: "Seu cadastro não foi aprovado neste momento.",
    label: "Voltar para o início",
    href: "/",
  },
  trial_finished: {
    title: "Teste grátis encerrado",
    text: "Seu teste gratuito terminou. Assine o Plano Fundador ou aguarde nosso contato para continuar.",
    label: "Conhecer o Plano Fundador",
    href: "/assinar",
  },
  blocked: {
    title: "Acesso indisponível",
    text: "Sua conta não está ativa. Entre em contato com o FII Select para solicitar a reativação.",
    label: "Solicitar reativação",
    href: "https://wa.me/5511971780101?text=Ol%C3%A1.%20Quero%20reativar%20meu%20acesso%20ao%20FII%20Select.",
  },
};

const directRedirects = {
  pending_founder: "/assinar.html",
  awaiting_payment: "/status-pendente.html",
  payment_pending: "/status-pendente.html",
  active: "/status-aprovado.html",
  pending_trial: "/teste.html",
  trial_active: "/teste.html",
};

function renderView(view) {
  const content = views[view];
  loginCard.innerHTML = `
    <a class="brand auth-brand" href="/"><img class="brand-logo dark-logo" src="ASSETS/logo-header-fii-select.png" alt="FII Select" /></a>
    <p class="eyebrow">Acesso</p>
    <h1>${content.title}</h1>
    <p class="muted">${content.text}</p>
    <a class="cta cta-gold" href="${content.href}">${content.label}</a>
  `;
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button");
  const email = new FormData(loginForm).get("email");
  button.disabled = true;

  try {
    const response = await fetch("/api/users/login-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível consultar o cadastro.");
    if (!result.user) return renderView("not_found");
    if (!result.authenticated) throw new Error("Não foi possível iniciar sua sessão.");

    const status = ["awaiting_payment", "payment_pending"].includes(result.user.paymentStatus)
      ? result.user.paymentStatus
      : result.user.status;
    if (directRedirects[status]) {
      window.location.href = directRedirects[status];
      return;
    }
    if (status === "pending") return renderView("pending");
    if (status === "rejected") return renderView("rejected");
    if (status === "trial_finished") return renderView("trial_finished");
    return renderView("blocked");
  } catch (error) {
    let message = loginForm.querySelector(".form-message");
    if (!message) {
      message = document.createElement("p");
      message.className = "form-message";
      loginForm.appendChild(message);
    }
    message.textContent = error.message;
    button.disabled = false;
  }
});
