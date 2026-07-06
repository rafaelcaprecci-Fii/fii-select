const loginForm = document.querySelector("[data-login-form]");

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
    if (
      result.authenticated !== true
      || !result.user?.id
      || typeof result.redirectTo !== "string"
      || !result.redirectTo.startsWith("/")
    ) {
      throw new Error("Não foi possível validar o cadastro.");
    }

    window.location.href = result.redirectTo;
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
