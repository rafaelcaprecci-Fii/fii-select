const form = document.querySelector("[data-documental-form]");
const resultSection = document.querySelector("[data-documental-result]");
const message = document.querySelector("[data-documental-message]");
const summary = document.querySelector("[data-documental-summary]");
const facts = document.querySelector("[data-documental-facts]");
const assisted = document.querySelector("[data-documental-assisted]");
const documentalSources = document.querySelector("[data-documental-sources]");
const documentalHistory = document.querySelector("[data-documental-history]");
const documentalTimeline = document.querySelector("[data-documental-timeline]");
const documents = document.querySelector("[data-documental-documents]");
const checks = document.querySelector("[data-documental-checks]");
const saveHistoryButton = document.querySelector("[data-save-documental-history]");

let currentDocumentalData = null;

const missingDocumentalText = "Dado não identificado nos documentos analisados.";
const documentalSummaryItems = [
  { number: 1, title: "Resumo do mês", field: "resumoMes" },
  { number: 2, title: "Rendimento e origem do DY", field: "rendimentoOrigemDy" },
  { number: 3, title: "Portfólio e qualidade dos ativos", field: "portfolioQualidadeAtivos" },
  { number: 4, title: "Contratos e inquilinos", field: "contratosInquilinos" },
  { number: 5, title: "Obras, expansões e imóveis em desenvolvimento", field: "obrasExpansoes" },
  { number: 6, title: "Estratégia do fundo vs portfólio atual", field: "estrategiaVsPortfolio" },
  { number: 7, title: "Tipo de gestão", field: "tipoGestao" },
  { number: 8, title: "Estrutura de capital e alavancagem", field: "estruturaCapitalAlavancagem" },
  { number: 9, title: "Histórico de emissões de cotas", field: "historicoEmissoes" },
  { number: 10, title: "Pontos positivos", field: "pontosPositivos" },
  { number: 11, title: "Pontos de atenção / riscos", field: "pontosAtencao" },
  { number: 12, title: "Eventos não recorrentes", field: "eventosNaoRecorrentes" },
  { number: 13, title: "Dados não identificados nos documentos", field: "dadosNaoIdentificados" },
  { number: 14, title: "Explicação financeira de aquisições", field: "explicacaoFinanceiraAquisicoes" },
];

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
      ${url ? `<a class="documental-lab-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir fonte</a>` : "<span>Link não cadastrado.</span>"}
    </article>
  `;
}

function historyItem(item) {
  return `
    <li class="documental-lab-card">
      <small>Competência</small>
      <strong>${escapeHtml(formatDate(item.competencia))}</strong>
      <span>Status: ${escapeHtml(item.status || "analisado")}</span>
      <span>Atualizado em: ${escapeHtml(item.updatedAt ? new Date(item.updatedAt).toLocaleString("pt-BR") : "Não informado")}</span>
    </li>
  `;
}

function timelineItem(item) {
  const normalizedClassification = String(item.classificacao || "").toLowerCase();
  const flag = statusFlag(
    normalizedClassification === "preocupante"
      ? "concerning"
      : normalizedClassification === "positivo"
        ? "positive"
        : "attention",
  );
  return `
    <li class="documental-lab-card">
      <span class="documental-lab-status ${flag.className}">${escapeHtml(item.classificacao || "Neutro")}</span>
      <small>${escapeHtml(formatDate(item.competencia))} • ${escapeHtml(item.tipoEvento || "Outro")}</small>
      <strong>${escapeHtml(item.titulo || "Evento documental")}</strong>
      <span>${escapeHtml(item.descricao || missingDocumentalText)}</span>
      <span>Fonte: ${escapeHtml(item.fonte || "Não informada")}</span>
    </li>
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

function textFromAssistedBlock(block) {
  if (!block) return missingDocumentalText;
  const items = (block.items || []).map((item) => `${item.title || "Item"}: ${item.text || missingDocumentalText}`);
  const support = (block.support || []).map((item) => `${item.label}: ${formatValue(item.key || "", item.value)}`);
  const text = [block.text, ...items, ...support].filter(Boolean).join("\n");
  return text.trim() || missingDocumentalText;
}

function documentalText(data, item) {
  const directText = String(data?.[item.field] || "").trim();
  if (directText) return directText;
  const block = (data.assistedReading || []).find((entry) => entry.title === item.title);
  return textFromAssistedBlock(block);
}

function assistedBlock(data, item) {
  const text = documentalText(data, item);
  return `
    <article class="documental-lab-card documental-assisted-card">
      <small>${String(item.number).padStart(2, "0")}</small>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function assistedTextByTitle(data, title) {
  const block = (data.assistedReading || []).find((item) => item.title === title);
  return textFromAssistedBlock(block);
}

function fieldText(data, field) {
  const item = documentalSummaryItems.find((entry) => entry.field === field);
  return item ? documentalText(data, item) : missingDocumentalText;
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
    tipoGestao: fieldText(data, "tipoGestao"),
    estruturaCapitalAlavancagem: assistedTextByTitle(data, "Estrutura de capital e alavancagem"),
    historicoEmissoes: assistedTextByTitle(data, "Histórico de emissões de cotas"),
    pontosPositivos: assistedTextByTitle(data, "Pontos positivos"),
    pontosAtencao: assistedTextByTitle(data, "Pontos de atenção / riscos"),
    eventosNaoRecorrentes: assistedTextByTitle(data, "Eventos não recorrentes"),
    dadosNaoIdentificados: assistedTextByTitle(data, "Dados não identificados nos documentos"),
    explicacaoFinanceiraAquisicoes: fieldText(data, "explicacaoFinanceiraAquisicoes"),
  };
}

async function loadDocumentalHistory(ticker) {
  if (!documentalHistory) return;
  const response = await fetch(`/admin/api/documental-history?ticker=${encodeURIComponent(ticker)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível consultar o histórico documental.");
  documentalHistory.innerHTML = (data.history || []).map(historyItem).join("") ||
    '<li class="documental-lab-card"><strong>Nenhum histórico documental salvo para este ticker.</strong></li>';
}

async function loadDocumentalTimeline(ticker) {
  if (!documentalTimeline) return;
  const response = await fetch(`/admin/api/documental-timeline?ticker=${encodeURIComponent(ticker)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível consultar a linha do tempo documental.");
  documentalTimeline.innerHTML = (data.events || []).map(timelineItem).join("") ||
    '<li class="documental-lab-card"><strong>Nenhum evento registrado para este ticker.</strong></li>';
}

function render(data) {
  currentDocumentalData = data;
  const info = data.summary || {};
  summary.innerHTML = [
    summaryCard("Ticker", info.ticker || data.ticker),
    summaryCard("Segmento", [info.type, info.segment].filter(Boolean).join(" - ")),
    summaryCard("Competência", competenceFrom((data.documents || []).find((document) => document.competence)?.competence) || competenceFrom(data.collectedAt)),
    summaryCard("Status", "analisado"),
  ].join("");

  facts.innerHTML = (data.facts || []).map(factCard).join("") ||
    '<p class="documental-lab-message">Não há dados estruturados disponíveis para exibição.</p>';
  assisted.innerHTML = documentalSummaryItems.map((item) => assistedBlock(data, item)).join("");
  const sources = data.documentalSources || {};
  documentalSources.innerHTML = [
    sourceCard("Fonte oficial", sources.official, "Não informado."),
    sourceCard("Fonte regulatória", sources.regulatory, "Não informado."),
    sourceCard("Atalho de consulta", sources.shortcut, "Não informado."),
    sourceCard("Pasta Drive", sources.driveFolder, "Não informado."),
  ].join("");
  documents.innerHTML = (data.documents || []).map(documentItem).join("") ||
    '<li class="documental-lab-card"><strong>Nenhum documento informado</strong><span>Não informado.</span></li>';
  checks.innerHTML = (data.checks || []).map(checkItem).join("") ||
    '<li class="documental-lab-card"><strong>Dados insuficientes</strong><span>Dados insuficientes para esta checagem.</span></li>';
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
    await Promise.all([
      loadDocumentalHistory(data.ticker),
      loadDocumentalTimeline(data.ticker),
    ]);
    message.textContent = "Consulta concluída. Use os dados apenas para auditoria interna.";
  } catch (error) {
    resultSection.hidden = true;
    message.textContent = error.message || "Falha ao consultar o laboratório documental.";
  } finally {
    button.disabled = false;
  }
});
