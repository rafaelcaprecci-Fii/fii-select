const form = document.querySelector("[data-documental-form]");
const resultSection = document.querySelector("[data-documental-result]");
const message = document.querySelector("[data-documental-message]");
const summary = document.querySelector("[data-documental-summary]");
const facts = document.querySelector("[data-documental-facts]");
const documents = document.querySelector("[data-documental-documents]");
const checks = document.querySelector("[data-documental-checks]");

const numberFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatValue(key, value) {
  if (value === null || value === undefined || value === "") return "Não informado";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (["equity", "reportEquity", "totalAssets", "reportTotalAssets", "totalLiabilities", "latestDividend", "cash", "cri", "lci", "fiiHoldings"].includes(key)) {
    return moneyFormatter.format(number);
  }
  if (["priceToNav"].includes(key)) return `${number.toFixed(2).replace(".", ",")}x`;
  if (["monthlyDividendYield", "adminFeeRate", "vacancyRate"].includes(key)) {
    return percentFormatter.format(number);
  }
  if (["sharesOutstanding", "totalInvestors", "propertyCount"].includes(key)) {
    return integerFormatter.format(Math.trunc(number));
  }
  return numberFormatter.format(number);
}

function formatDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (match) return match[3] ? `${match[3]}/${match[2]}/${match[1]}` : `${match[2]}/${match[1]}`;
  return value ? new Date(value).toLocaleDateString("pt-BR") : "Não informado";
}

function sourceText(item) {
  return [
    item.competence ? `Competência: ${formatDate(item.competence)}` : "",
    item.collectedAt ? `Coleta: ${formatDate(item.collectedAt)}` : "",
    `Fonte: ${item.source || "Dados estruturados CVM"}`,
  ].filter(Boolean).join(" • ");
}

function factCard(item) {
  return `
    <article class="documental-lab-card">
      <small>${escapeHtml(item.label)}</small>
      <strong>${escapeHtml(formatValue(item.key, item.value))}</strong>
      <span>${escapeHtml(sourceText(item))}</span>
    </article>
  `;
}

function summaryCard(label, value) {
  return `
    <article class="documental-lab-card">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value || "Não informado")}</strong>
    </article>
  `;
}

function documentItem(document) {
  const href = document.url || document.documentUrl || document.downloadUrl || "";
  const status = href ? "Documento disponível" : "URL não informada";

  return `
    <li class="documental-lab-card">
      <small>${escapeHtml(document.type || "Documento")}</small>
      <strong>${escapeHtml(document.competence ? formatDate(document.competence) : "Competência não informada")}</strong>
      <span>Fonte: ${escapeHtml(document.source || "Dados estruturados CVM")}</span>
      <span>Status: ${escapeHtml(document.status || status)}</span>
      ${href ? `<a class="documental-lab-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">Abrir documento</a>` : "<span>URL não informada</span>"}
    </li>
  `;
}

function statusFlag(status) {
  if (status === "concerning") return { label: "Preocupante", className: "is-concerning" };
  if (status === "positive" || status === "ok") return { label: "Positivo", className: "is-positive" };
  return { label: "Atenção", className: "is-attention" };
}

function checkItem(check) {
  const flag = statusFlag(check.status);
  const fields = (check.fields || [])
    .map((field) => `<span><b>${escapeHtml(field.label)}:</b> ${escapeHtml(formatValue("", field.value))} • ${escapeHtml(sourceText(field))}</span>`)
    .join("");

  return `
    <li class="documental-lab-card">
      <span class="documental-lab-status ${flag.className}">${escapeHtml(flag.label)}</span>
      <strong>${escapeHtml(check.label)}</strong>
      <span>${escapeHtml(check.message)}</span>
      ${fields}
    </li>
  `;
}

function render(data) {
  const info = data.summary || {};
  summary.innerHTML = [
    summaryCard("Ticker", info.ticker || data.ticker),
    summaryCard("Tipo / segmento", [info.type, info.segment].filter(Boolean).join(" - ")),
    summaryCard("Administrador", info.administrator),
    summaryCard("Gestor", info.manager),
    summaryCard("Fonte", data.source),
    summaryCard("Data de coleta", data.collectedAt ? new Date(data.collectedAt).toLocaleString("pt-BR") : ""),
  ].join("");

  facts.innerHTML = (data.facts || []).map(factCard).join("") ||
    '<p class="documental-lab-message">Não há dados estruturados disponíveis para exibição.</p>';
  documents.innerHTML = (data.documents || []).map(documentItem).join("") ||
    '<li class="documental-lab-card"><strong>Nenhum documento informado</strong><span>Não informado.</span></li>';
  checks.innerHTML = (data.checks || []).map(checkItem).join("") ||
    '<li class="documental-lab-card"><strong>Dados insuficientes</strong><span>Dados insuficientes para esta checagem.</span></li>';
  resultSection.hidden = false;
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  const ticker = String(new FormData(form).get("ticker") || "").trim().toUpperCase();
  button.disabled = true;
  message.textContent = "Consultando dados estruturados...";

  try {
    const response = await fetch(`/admin/api/documental-lab?ticker=${encodeURIComponent(ticker)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível consultar o laboratório documental.");
    render(data);
    message.textContent = "Consulta concluída. Use os dados apenas para auditoria interna.";
  } catch (error) {
    resultSection.hidden = true;
    message.textContent = error.message || "Falha ao consultar o laboratório documental.";
  } finally {
    button.disabled = false;
  }
});
