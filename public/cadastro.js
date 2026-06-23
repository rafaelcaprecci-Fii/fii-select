const form = document.querySelector(".stack-form");

function showFormMessage(message) {
  let element = form.querySelector(".form-message");
  if (!element) {
    element = document.createElement("p");
    element.className = "form-message";
    element.setAttribute("role", "alert");
    element.setAttribute("aria-live", "polite");
    form.appendChild(element);
  }
  element.textContent = message;
}

function validateRegistration(data) {
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim().toLowerCase();
  const phone = String(data.get("phone") || "").replace(/\D/g, "");
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validPhone = phone.length >= 10 && phone.length <= 13 && !/^(\d)\1+$/.test(phone);

  if (!name) throw new Error("Informe seu nome.");
  if (!email) throw new Error("Informe seu e-mail.");
  if (!emailPattern.test(email)) throw new Error("Informe um e-mail válido.");
  if (!phone) throw new Error("Informe seu WhatsApp.");
  if (!validPhone) throw new Error("Informe um WhatsApp válido.");

  return { name, email, phone };
}

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

  try {
    const fields = validateRegistration(data);
    showFormMessage("");
    button.disabled = true;
    const response = await fetch("/api/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...fields,
        ...registration,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível concluir o cadastro.");
    window.location.href = `/cadastro-confirmado?intent=${registration.intent}`;
  } catch (error) {
    showFormMessage(error.message);
    button.disabled = false;
  }
}

if (form) {
  form.noValidate = true;
  form.addEventListener("submit", submitRegistration);
  form.addEventListener("input", () => showFormMessage(""));
}
