const tableBody = document.querySelector(".customer-table tbody");
const manualForm = document.querySelector(".manual-form");
const actionsModal = document.querySelector("#acoes-cliente");
let users = [];
let selectedUserId = "";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDateTime(value) {
  if (!value) return ["-", ""];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return [value, ""];
  return [
    new Intl.DateTimeFormat("pt-BR").format(date),
    `às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date)}`,
  ];
}

function statusText(status) {
  return {
    pending: "Pendente",
    approved: "Aprovado",
    active: "Ativo",
    rejected: "Recusado",
    trial_active: "Teste grátis",
    trial_ended: "Teste finalizado",
    archived: "Arquivado",
    inactive: "Inativo",
  }[status] || status || "Pendente";
}

function planText(plan) {
  return String(plan || "").includes("teste") ? "Teste" : "Fundador";
}

function showAdminMessage(message, isError = false) {
  let box = document.querySelector(".admin-email-message");
  if (!box) {
    box = document.createElement("p");
    box.className = "admin-email-message plain-note";
    actionsModal.querySelector(".actions-card").appendChild(box);
  }
  box.textContent = message;
  box.style.color = isError ? "#b42318" : "#1f6b44";
}

function renderUsers() {
  if (!tableBody) return;
  if (!users.length) {
    tableBody.innerHTML = '<tr><td colspan="7">Nenhum usuário cadastrado.</td></tr>';
    return;
  }

  tableBody.innerHTML = users
    .map((user) => {
      const [date, time] = formatDateTime(user.updatedAt || user.createdAt);
      const value = planText(user.plan) === "Teste" ? "R$0,00" : "R$49,00/mês";
      return `
        <tr>
          <td><strong>${escapeHtml(user.name || "Investidor")}</strong><small>${escapeHtml(user.email || "-")}</small></td>
          <td>${escapeHtml(user.phone || "-")}</td>
          <td><span class="plan-pill">${escapeHtml(planText(user.plan))}</span></td>
          <td><b>${value}</b><small>${escapeHtml(statusText(user.status))}</small></td>
          <td><b>${escapeHtml(date)}</b><small>${escapeHtml(time)}</small></td>
          <td><a class="detail-link" href="#detalhes-fundador">Ver Detalhes</a></td>
          <td><a class="menu-dots" href="#acoes-cliente" data-user-id="${escapeHtml(user.id)}" aria-label="Abrir ações">•••</a></td>
        </tr>
      `;
    })
    .join("");
}

async function loadUsers() {
  const response = await fetch("/admin/api/users");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Falha ao carregar usuários.");
  users = result.users || [];
  renderUsers();
}

async function updateStatus(status) {
  if (!selectedUserId) return showAdminMessage("Selecione um usuário.", true);
  const response = await fetch(`/admin/api/users/${encodeURIComponent(selectedUserId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Falha ao atualizar status.");
  await loadUsers();
  const failed = (result.emailResults || []).find((item) => !item.ok);
  showAdminMessage(
    failed ? `Status salvo. Erro no e-mail: ${failed.error}` : "Status salvo e e-mail processado.",
    Boolean(failed),
  );
}

async function resendEmail() {
  if (!selectedUserId) return showAdminMessage("Selecione um usuário.", true);
  const response = await fetch(`/admin/api/users/${encodeURIComponent(selectedUserId)}/resend-email`, {
    method: "POST",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Falha ao reenviar e-mail.");
  await loadUsers();
  showAdminMessage(
    result.email?.ok ? "E-mail reenviado." : `Erro no e-mail: ${result.email?.error || "Falha desconhecida."}`,
    !result.email?.ok,
  );
}

tableBody?.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-user-id]");
  if (!trigger) return;
  selectedUserId = trigger.dataset.userId;
});

manualForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const [name, email, phone, plan] = manualForm.querySelectorAll("input, select");
  const response = await fetch("/admin/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name.value,
      email: email.value,
      phone: phone.value,
      plan: plan.value.toLowerCase().includes("teste") ? "teste" : "fundador",
    }),
  });
  const result = await response.json();
  if (!response.ok) return showAdminMessage(result.error || "Falha ao cadastrar usuário.", true);
  await loadUsers();
  showAdminMessage(result.email?.ok ? "Cadastro salvo e e-mail enviado." : `Cadastro salvo. Erro no e-mail: ${result.email?.error}`, !result.email?.ok);
});

actionsModal?.querySelector(".status-pending")?.addEventListener("click", () => updateStatus("pending"));
actionsModal?.querySelector(".status-enable")?.addEventListener("click", () => updateStatus("active"));
actionsModal?.querySelector(".status-disable")?.addEventListener("click", () => updateStatus("inactive"));
actionsModal?.querySelector(".status-archive")?.addEventListener("click", () => updateStatus("archived"));
actionsModal?.querySelector(".status-trial")?.addEventListener("click", () => updateStatus("trial_active"));
actionsModal?.querySelector(".status-end-trial")?.addEventListener("click", () => updateStatus("trial_ended"));
actionsModal?.querySelector(".status-reject")?.addEventListener("click", () => updateStatus("rejected"));
actionsModal?.querySelector(".status-resend-email")?.addEventListener("click", resendEmail);

loadUsers().catch((error) => showAdminMessage(error.message, true));
