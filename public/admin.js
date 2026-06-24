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
    pending_trial: "Teste em análise",
    pending_founder: "Plano Fundador em análise",
    approved: "Aprovado",
    active: "Ativo",
    rejected: "Recusado",
    trial_active: "Teste grátis",
    trial_finished: "Teste finalizado",
    archived: "Arquivado",
    inactive: "Inativo",
  }[status] || status || "Pendente";
}

function planText(plan) {
  return String(plan || "").includes("teste") ? "Teste" : "Fundador";
}

function intentText(intent) {
  return {
    trial: "Origem: teste",
    founder: "Origem: Plano Fundador",
    general: "Origem: cadastro geral",
  }[intent] || "Origem: cadastro geral";
}

function updateText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function renderKpis() {
  const total = users.length;
  const active = users.filter((user) => ["active", "approved", "trial_active"].includes(user.status)).length;
  const pending = users.filter((user) => ["pending", "pending_trial", "pending_founder"].includes(user.status)).length;
  const inactive = users.filter(
    (user) => ["inactive", "archived", "rejected", "trial_finished"].includes(user.status),
  ).length;
  const trialActive = users.filter((user) => user.status === "trial_active").length;
  const payingActive = users.filter(
    (user) => ["active", "approved"].includes(user.status) && planText(user.plan) !== "Teste",
  ).length;

  updateText('[data-kpi="total"]', total);
  updateText('[data-kpi="active"]', active);
  updateText('[data-kpi="pending"]', pending);
  updateText('[data-kpi="inactive"]', inactive);
  updateText('[data-kpi="revenue"]', new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(payingActive * 49));
  updateText(".trial-card b", trialActive);
  updateText("[data-users-count]", `${total} ${total === 1 ? "usuário cadastrado" : "usuários cadastrados"}`);
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
  renderKpis();
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
          <td><span class="plan-pill">${escapeHtml(planText(user.plan))}</span><small>${escapeHtml(intentText(user.intent))}</small></td>
          <td><b>${value}</b><small>${escapeHtml(statusText(user.status))}</small></td>
          <td><b>${escapeHtml(date)}</b><small>${escapeHtml(time)}</small></td>
          <td>
            <a class="detail-link" href="#acoes-cliente" data-user-id="${escapeHtml(user.id)}">
              ${escapeHtml(user.lastEmailTemplate || user.lastEmailError ? "Ver e-mail" : "Selecionar")}
            </a>
          </td>
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

function showUnavailableMessage() {
  showAdminMessage("Função temporariamente indisponível.");
}

async function preparePayment() {
  if (!selectedUserId) return showAdminMessage("Selecione um usuário.", true);
  const response = await fetch(`/admin/api/users/${encodeURIComponent(selectedUserId)}/payment-link`, {
    method: "POST",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Falha ao preparar o contato de pagamento.");
  await loadUsers();
  if (!result.url) {
    return showAdminMessage("Pagamento registrado, mas o cliente não possui WhatsApp e não há link configurado.", true);
  }
  window.open(result.url, "_blank", "noopener,noreferrer");
  showAdminMessage("WhatsApp aberto com o link de pagamento PagBank.");
}

tableBody?.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-user-id]");
  if (!trigger) return;
  selectedUserId = trigger.dataset.userId;
  const user = users.find((item) => item.id === selectedUserId);
  const whatsapp = actionsModal?.querySelector(".status-whatsapp");
  const phone = String(user?.phone || "").replace(/\D/g, "");
  if (whatsapp) {
    whatsapp.href = phone
      ? `https://wa.me/${phone.startsWith("55") ? phone : `55${phone}`}`
      : "#";
    whatsapp.dataset.missingPhone = phone ? "" : "true";
  }
  if (user?.lastEmailError) showAdminMessage(`Último erro de e-mail: ${user.lastEmailError}`, true);
  else if (user?.lastEmailTemplate) showAdminMessage(`Último e-mail enviado: ${user.lastEmailTemplate}.`);
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
      intent: plan.value.toLowerCase().includes("teste") ? "trial" : "founder",
      plan: plan.value.toLowerCase().includes("teste") ? "teste_7_dias" : "fundador",
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
actionsModal?.querySelector(".status-end-trial")?.addEventListener("click", () => updateStatus("trial_finished"));
actionsModal?.querySelector(".status-reject")?.addEventListener("click", showUnavailableMessage);
actionsModal?.querySelector(".status-resend-email")?.addEventListener("click", showUnavailableMessage);
actionsModal?.querySelector(".status-payment")?.addEventListener("click", () => {
  preparePayment().catch((error) => showAdminMessage(error.message, true));
});
actionsModal?.querySelector(".status-whatsapp")?.addEventListener("click", (event) => {
  if (event.currentTarget.dataset.missingPhone === "true") {
    event.preventDefault();
    showAdminMessage("Este usuário não possui WhatsApp cadastrado.", true);
  }
});

loadUsers().catch((error) => showAdminMessage(error.message, true));
