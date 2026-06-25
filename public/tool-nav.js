const accountLink = document.querySelector("[data-tool-account]");
const statusLink = document.querySelector("[data-tool-status]");

async function configureToolNavigation() {
  try {
    const response = await fetch("/api/users/me", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      window.location.replace("/login.html");
      return;
    }

    const data = await response.json();
    const status = String(data.user?.status || "").toLowerCase();

    if (!data.canAccessTool) {
      window.location.replace(data.areaPath || "/login.html");
      return;
    }

    if (status === "active") {
      accountLink.href = "/conta.html";
      statusLink.href = "/status-aprovado.html";
      return;
    }

    if (status === "trial_active") {
      accountLink.href = "/conta-teste.html";
      statusLink.href = "/status-teste-ativo.html";
      return;
    }

    window.location.replace("/login.html");
  } catch {
    window.location.replace("/login.html");
  }
}

configureToolNavigation();
