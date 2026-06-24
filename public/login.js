const loginForm = document.querySelector("[data-login-form]");
const loginCard = document.querySelector(".auth-card");

const views = {
  not_found: {
    title: "Cadastro não encontrado",
    text: "Não encontramos um cadastro com este e-mail. Faça seu cadastro primeiro para solicitar acesso ao FII Select.",
    label: "Fazer cadastro",
    href: "/cadastro",
  },
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

    window.location.href = result.redirectTo || "/area-cliente/acompanhamento";
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
