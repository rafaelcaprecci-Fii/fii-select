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
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date),
    `às ${new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)}`,
  ];
}

function updateAdminCurrentDate() {
  const dateElement = document.querySelector("[data-admin-current-date]");
  if (!dateElement) return;

  dateElement.textContent = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
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

function isTrialUser(user) {
  return (
    user?.intent === "trial" ||
    ["pending_trial", "trial_active", "trial_finished"].includes(user?.status) ||
    planText(user?.plan) === "Teste"
  );
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

function formatDetailDateTime(value, fallback) {
  if (!value) return fallback;
  const [date, time] = formatDateTime(value);
  if (date === "-") return fallback;
  return time ? `${date} ${time}` : date;
}

function detailStatus(user, trial) {
  const status = String(user?.status || "").toLowerCase();
  if (trial) {
    if (status === "trial_active") return { text: "TESTE GRÁTIS ATIVO", className: "status-active" };
    if (status === "trial_finished") return { text: "TESTE ENCERRADO", className: "status-archived" };
    if (status === "pending_trial") return { text: "TESTE PENDENTE", className: "status-pending" };
  }

  if (["active", "approved"].includes(status)) return { text: "ATIVO", className: "status-active" };
  if (status === "inactive") return { text: "INATIVO", className: "status-inactive" };
  if (status === "archived") return { text: "ARQUIVADO", className: "status-archived" };
  if (["pending", "pending_founder", "payment_pending", "awaiting_payment"].includes(status)) {
    return { text: "PENDENTE", className: "status-pending" };
  }
  return { text: statusText(status).toUpperCase(), className: "status-pending" };
}

function setDetailField(panel, field, value) {
  panel.querySelectorAll(`[data-detail-field="${field}"]`).forEach((element) => {
    element.textContent = value;
  });
}

function renderUserDetails(user) {
  const trial = isTrialUser(user);
  const panel = document.querySelector(trial ? "#detalhes-teste" : "#detalhes-fundador");
  if (!panel) return;

  setDetailField(panel, "name", user.name || "Investidor");
  setDetailField(panel, "email", user.email || "Não informado");
  setDetailField(panel, "phone", user.phone || "Não informado");
  setDetailField(panel, "broker", user.broker || "Não informada");
  setDetailField(panel, "personType", user.personType || "Não informado");
  setDetailField(
    panel,
    "internalNotes",
    user.internalNotes || "Nenhuma observação interna registrada.",
  );

  const status = detailStatus(user, trial);
  const statusElement = panel.querySelector('[data-detail-field="status"]');
  if (statusElement) {
    statusElement.textContent = status.text;
    statusElement.className = `status-badge ${status.className}`;
  }

  if (trial) {
    setDetailField(panel, "trialStartAt", formatDetailDateTime(user.trialStartAt, "Não informado"));
    setDetailField(panel, "trialEndAt", formatDetailDateTime(user.trialEndAt, "Não informado"));
    setDetailField(panel, "trialUsed", user.trialUsed ? "Sim" : "Não");
  } else {
    setDetailField(panel, "createdAt", formatDetailDateTime(user.createdAt, "Não informada"));
    setDetailField(panel, "updatedAt", formatDetailDateTime(user.updatedAt, "Não informada"));
    setDetailField(panel, "lastBillingAt", formatDetailDateTime(user.lastBillingAt, "Não localizada"));
    setDetailField(panel, "paymentEmail", user.paymentEmail || user.email || "Não informado");
  }

  const history = panel.querySelector("[data-detail-history]");
  if (history) {
    const entries = Array.isArray(user.history) ? user.history.filter(Boolean) : [];
    history.replaceChildren();
    if (!entries.length) {
      const item = document.createElement("li");
      item.textContent = "Nenhum histórico registrado até o momento.";
      history.appendChild(item);
    } else {
      entries.forEach((entry) => {
        const item = document.createElement("li");
        item.textContent = String(entry);
        history.appendChild(item);
      });
    }
  }
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
            <a
              class="detail-link"
              href="${isTrialUser(user) ? "#detalhes-teste" : "#detalhes-fundador"}"
              data-user-detail="${escapeHtml(user.id)}"
            >Ver Detalhe</a>
          </td>
          <td><a class="menu-dots" href="#acoes-cliente" data-user-actions="${escapeHtml(user.id)}" aria-label="Abrir ações">•••</a></td>
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
  showAdminMessage("Status salvo.");
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
  const detailTrigger = event.target.closest("[data-user-detail]");
  if (detailTrigger) {
    const user = users.find((item) => item.id === detailTrigger.dataset.userDetail);
    if (user) renderUserDetails(user);
    return;
  }

  const trigger = event.target.closest("[data-user-actions]");
  if (!trigger) return;
  selectedUserId = trigger.dataset.userActions;
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
  showAdminMessage("Cadastro salvo.");
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

updateAdminCurrentDate();
loadUsers().catch((error) => showAdminMessage(error.message, true));
