const form = document.querySelector(".stack-form");

function registrationFromPath(pathname) {
  if (pathname.includes("cadastro-teste")) {
    return { intent: "trial", plan: "teste_7_dias" };
  }
  if (pathname.includes("cadastro-assinatura")) {
    return { intent: "founder", plan: "fundador" };
  }
  return { intent: "general", plan: "fundador" };
}

async function submitRegistration(event) {
  event.preventDefault();
  const button = form.querySelector("button[type='submit']");
  const data = new FormData(form);
  const registration = registrationFromPath(window.location.pathname);
  button.disabled = true;

  try {
    const response = await fetch("/api/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        email: data.get("email"),
        phone: data.get("phone"),
        ...registration,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível concluir o cadastro.");
    window.location.href = `/cadastro-confirmado?intent=${registration.intent}`;
  } catch (error) {
    let message = form.querySelector(".form-message");
    if (!message) {
      message = document.createElement("p");
      message.className = "form-message";
      form.appendChild(message);
    }
    message.textContent = error.message;
    button.disabled = false;
  }
}

if (form) form.addEventListener("submit", submitRegistration);
