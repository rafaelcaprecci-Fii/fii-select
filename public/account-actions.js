const accountActionButton = document.querySelector("[data-account-status]");
const accountActionMessage = document.querySelector("[data-account-action-message]");

accountActionButton?.addEventListener("click", async () => {
  const status = accountActionButton.dataset.accountStatus;
  accountActionButton.disabled = true;
  if (accountActionMessage) accountActionMessage.textContent = "";

  try {
    const response = await fetch("/api/users/account-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível atualizar sua conta.");

    window.location.href = result.redirectTo;
  } catch (error) {
    if (accountActionMessage) accountActionMessage.textContent = error.message;
    accountActionButton.disabled = false;
  }
});

document.querySelectorAll("[data-account-event]").forEach((link) => {
  link.addEventListener("click", () => {
    const event = link.dataset.accountEvent;
    if (!event) return;

    const payload = new Blob([JSON.stringify({ event })], { type: "application/json" });
    navigator.sendBeacon("/api/users/account-event", payload);
  });
});
