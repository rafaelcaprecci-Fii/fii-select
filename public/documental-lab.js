const form = document.querySelector("[data-documental-form]");
const resultSection = document.querySelector("[data-documental-result]");
const message = document.querySelector("[data-documental-message]");
const summary = document.querySelector("[data-documental-summary]");
const facts = document.querySelector("[data-documental-facts]");
const assisted = document.querySelector("[data-documental-assisted]");
const documentalSources = document.querySelector("[data-documental-sources]");
const investorsVariation = document.querySelector("[data-documental-investors-variation]");
const saveHistoryButton = document.querySelector("[data-save-documental-history]");

let currentDocumentalData = null;

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

function competenceFrom(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : "";
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

function sourceCard(label, source, fallback) {
  const name = source?.name || fallback;
  const url = source?.url || "";
  return `
    <article class="documental-lab-card">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(name)}</strong>
      ${url ? `<a class="documental-lab-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir</a>` : "<span>Não cadastrado</span>"}
    </article>
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

function supportLine(item) {
  return `<span><b>${escapeHtml(item.label)}:</b> ${escapeHtml(formatValue(item.key || "", item.value))} • ${escapeHtml(sourceText(item))}</span>`;
}

function assistedItem(item) {
  const support = (item.support || []).map(supportLine).join("");
  return `<li><b>${escapeHtml(item.title || "Item")}</b>: ${escapeHtml(item.text || "Dado não identificado nos documentos analisados.")}${support ? `<br>${support}` : ""}</li>`;
}

function assistedBlock(block) {
  const flag = statusFlag(block.status);
  const support = (block.support || []).map(supportLine).join("");
  const items = (block.items || []).map(assistedItem).join("");
  return `
    <article class="documental-lab-card documental-assisted-card">
      <span class="documental-lab-status ${flag.className}">${escapeHtml(flag.label)}</span>
      <strong>${escapeHtml(block.title)}</strong>
      <span>${escapeHtml(block.text || "Dado não identificado nos documentos analisados.")}</span>
      ${support}
      ${items ? `<ul>${items}</ul>` : ""}
    </article>
  `;
}

function assistedTextByTitle(data, title) {
  const block = (data.assistedReading || []).find((item) => item.title === title);
  if (!block) return "Dado não identificado nos documentos analisados.";
  const items = (block.items || []).map((item) => `${item.title}: ${item.text}`).join("\n");
  return [block.text, items].filter(Boolean).join("\n").trim();
}

function buildHistoryPayload(data) {
  const firstDocument = (data.documents || []).find((document) => document.competence);
  const competencia = competenceFrom(firstDocument?.competence)
    || competenceFrom(data.collectedAt)
    || new Date().toISOString().slice(0, 7);
  const segment = [data.summary?.type, data.summary?.segment].filter(Boolean).join(" - ");
  return {
    ticker: data.ticker,
    competencia,
    segmento: segment,
    status: "analisado",
    fontes: data.documentalSources || {},
    resumoMes: assistedTextByTitle(data, "Resumo do mês"),
    rendimentoOrigemDy: assistedTextByTitle(data, "Rendimento e origem do DY"),
    portfolioQualidadeAtivos: assistedTextByTitle(data, "Portfólio e qualidade dos ativos"),
    contratosInquilinos: assistedTextByTitle(data, "Contratos e inquilinos"),
    obrasExpansoes: assistedTextByTitle(data, "Obras, expansões e imóveis em desenvolvimento"),
    estrategiaVsPortfolio: assistedTextByTitle(data, "Estratégia do fundo vs portfólio atual"),
    tipoGestao: "Dado não identificado nos documentos analisados.",
    estruturaCapitalAlavancagem: assistedTextByTitle(data, "Estrutura de capital e alavancagem"),
    historicoEmissoes: assistedTextByTitle(data, "Histórico de emissões de cotas"),
    pontosPositivos: assistedTextByTitle(data, "Pontos positivos"),
    pontosAtencao: assistedTextByTitle(data, "Pontos de atenção / riscos"),
    eventosNaoRecorrentes: assistedTextByTitle(data, "Eventos não recorrentes"),
    dadosNaoIdentificados: assistedTextByTitle(data, "Dados não identificados nos documentos"),
    explicacaoFinanceiraAquisicoes: "Dado não identificado nos documentos analisados.",
  };
}

async function loadDocumentalHistory(ticker) {
  return;
  const response = await fetch(`/admin/api/documental-history?ticker=${encodeURIComponent(ticker)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível consultar o histórico documental.");
  documentalHistory.innerHTML = (data.history || []).map(historyItem).join("") ||
    '<li class="documental-lab-card"><strong>Nenhum histórico registrado</strong><span>Não há resumos salvos para este ticker.</span></li>';
}

async function loadDocumentalTimeline(ticker) {
  return;
  const response = await fetch(`/admin/api/documental-timeline?ticker=${encodeURIComponent(ticker)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível consultar a linha do tempo documental.");
  documentalTimeline.innerHTML = (data.events || []).map(timelineItem).join("") ||
    '<li class="documental-lab-card"><strong>Nenhum evento registrado</strong><span>Não há eventos salvos para este ticker.</span></li>';
}

function render(data) {
  currentDocumentalData = data;
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
  assisted.innerHTML = (data.assistedReading || []).map(assistedBlock).join("") ||
    '<p class="documental-lab-message">Dado não identificado nos documentos analisados.</p>';
  const sources = data.documentalSources || {};
  documentalSources.innerHTML = [
    sourceCard("Fonte oficial", sources.official, "Não cadastrado"),
    sourceCard("Fonte regulatória", sources.regulatory, "FNET / CVM"),
    sourceCard("Atalho de consulta", sources.shortcut, "Clube FII"),
    sourceCard("Pasta Drive", sources.driveFolder, "Não cadastrado"),
  ].join("");
  const investorsCheck = (data.checks || []).find((check) => check.id === "investors-variation");
  investorsVariation.innerHTML = investorsCheck
    ? checkItem(investorsCheck)
    : '<li class="documental-lab-card"><strong>Variação no número de cotistas</strong><span>Dados insuficientes para esta checagem.</span></li>';
  resultSection.hidden = false;
}

saveHistoryButton?.addEventListener("click", async () => {
  if (!currentDocumentalData) return;
  saveHistoryButton.disabled = true;
  message.textContent = "Salvando resumo documental...";
  try {
    const response = await fetch("/admin/api/documental-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildHistoryPayload(currentDocumentalData)),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível salvar o resumo documental.");
    await loadDocumentalHistory(currentDocumentalData.ticker);
    message.textContent = "Resumo salvo no histórico documental.";
  } catch (error) {
    message.textContent = error.message || "Falha ao salvar o resumo documental.";
  } finally {
    saveHistoryButton.disabled = false;
  }
});

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
