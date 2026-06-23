const form = document.querySelector(".stack-form");

function planFromPath(pathname) {
  if (pathname.includes("teste")) return "teste";
  return "fundador";
}

async function submitRegistration(event) {
  event.preventDefault();
  const button = form.querySelector("button[type='submit']");
  const nextUrl = form.getAttribute("action") || "login.html";
  const data = new FormData(form);
  button.disabled = true;

  try {
    await fetch("/api/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        email: data.get("email"),
        phone: data.get("phone"),
        plan: planFromPath(window.location.pathname),
      }),
    });
    window.location.href = nextUrl;
  } catch {
    window.location.href = nextUrl;
  }
}

if (form) form.addEventListener("submit", submitRegistration);
