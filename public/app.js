const form = document.querySelector("#valuation-form");
const button = form.querySelector("button");
const error = document.querySelector("#error");
const comparisonBody = document.querySelector("#comparison-body");
const suggestionList = document.querySelector("#suggestion-list");
const compareTickers = ["MXRF11"];
const rowRiskRates = new Map([["MXRF11", 2.5]]);
let crossedReadingRequestId = 0;

const money = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const percent = (value, digits = 2) =>
  new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: digits }).format(value);

function bindRange(inputId, outputId, transform = (value) => value / 100) {
  const input = document.querySelector(inputId);
  const output = document.querySelector(outputId);
  const sync = () => (output.value = percent(transform(Number(input.value))));
  input.addEventListener("input", sync);
  sync();
}

bindRange("#risk-rate", "#risk-output");
bindRange("#growth-rate", "#growth-output");
bindRange("#shared-risk-rate", "#shared-risk-output");

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function setReading(reading) {
  const element = document.querySelector("#reading");
  element.textContent = reading.replaceAll("_", " ");
  element.className = `reading ${reading === "AGIO" ? "agio" : reading === "DESAGIO" ? "desagio" : "proximo"}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function formatFundType(value) {
  const type = normalizedText(value);
  if (type === "fof") return "FOF";
  if (type === "tijolo") return "Tijolo";
  if (type === "papel") return "Papel";
  if (type === "hibrido") return "Híbrido";
  if (type === "fiagro") return "Fiagro";
  return value ? String(value) : "";
}

function formatFundSegment(value) {
  const segment = normalizedText(value);
  if (!segment) return "";
  if (segment === "shoppings" || segment === "shopping") return "Shopping";
  if (segment === "logistica") return "Logística";
  if (segment.includes("lajes corporativas") || segment.includes("escritorio")) {
    return "Laje corporativa";
  }
  if (
    segment.includes("titulo") ||
    segment.includes("valor mobiliario") ||
    segment.includes("multicategoria")
  ) {
    return "Multicategoria";
  }
  return String(value);
}

function formatFundClassification(fund) {
  const rawType = fund.segmentType || fund.fundType || fund.type;
  const normalizedType = normalizedText(rawType);
  const type = formatFundType(rawType);
  const segment = ["papel", "fof", "hibrido"].includes(normalizedType)
    ? "Multicategoria"
    : formatFundSegment(fund.segmentoAtuacao || fund.segment);
  return [type, segment].filter(Boolean).join(" - ");
}

function optionalMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  return Number.isFinite(Number(value)) ? money(Number(value)) : "";
}

function optionalPercent(value) {
  if (value === null || value === undefined || value === "") return "";
  return Number.isFinite(Number(value)) ? percent(Number(value)) : "";
}

function crossedFact(label, value) {
  if (value === "" || value === null || value === undefined) return "";
  return `<article><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></article>`;
}

function renderCrossedReading(result, fallbackFund = {}) {
  const common = result.common || {};
  const specific = result.typeSpecific || {};
  const hasNormalizedType = result.type && result.type !== "desconhecido";
  const classification = formatFundClassification({
    fundType: hasNormalizedType ? result.type : fallbackFund.segmentType,
    segment: common.segment || fallbackFund.segmentoAtuacao,
  });
  setText("#crossed-classification", classification || "Classificação não disponível");

  const commonFacts = [
    crossedFact("Patrimônio líquido", optionalMoney(common.equity)),
    crossedFact("Ativos totais", optionalMoney(common.totalAssets)),
    crossedFact("Passivos totais", optionalMoney(common.totalLiabilities)),
    crossedFact("VP por cota", optionalMoney(common.navPerShare)),
    crossedFact(
      "P/VP",
      common.priceToNav !== null &&
      common.priceToNav !== undefined &&
      common.priceToNav !== "" &&
      Number.isFinite(Number(common.priceToNav))
        ? `${Number(common.priceToNav).toFixed(2).replace(".", ",")}x`
        : "",
    ),
    crossedFact("Alavancagem", optionalPercent(common.leverage)),
    crossedFact("Passivos / ativos", optionalPercent(common.liabilitiesToAssets)),
    crossedFact(
      "Histórico de rendimentos",
      Array.isArray(common.dividendHistory) && common.dividendHistory.length
        ? `${common.dividendHistory.length} registros`
        : "",
    ),
  ].filter(Boolean);
  document.querySelector("#crossed-reading-grid").innerHTML =
    commonFacts.join("") || "<p>Dados patrimoniais adicionais não disponíveis.</p>";

  const specificFacts = [];
  if (result.type === "tijolo") {
    specificFacts.push(
      crossedFact("Quantidade de imóveis", specific.propertyCount),
      crossedFact(
        "Área declarada dos imóveis",
        Number.isFinite(Number(specific.declaredArea))
          ? `${new Intl.NumberFormat("pt-BR").format(Number(specific.declaredArea))} m²`
          : "",
      ),
      crossedFact("Vacância consolidada", optionalPercent(specific.consolidatedVacancy)),
      crossedFact(
        "Vacância por imóvel",
        specific.vacancyByProperty?.length
          ? `${specific.vacancyByProperty.length} imóveis com dado disponível`
          : "",
      ),
      crossedFact(
        "Inadimplência por imóvel",
        specific.delinquencyByProperty?.length
          ? `${specific.delinquencyByProperty.length} imóveis com dado disponível`
          : "",
      ),
      crossedFact(
        "Participação na receita",
        specific.revenueShareByProperty?.length
          ? `${specific.revenueShareByProperty.length} imóveis com dado disponível`
          : "",
      ),
    );
    if (specific.mainProperties?.length) {
      specificFacts.push(
        crossedFact(
          "Principais imóveis",
          specific.mainProperties.map((property) => property.name).filter(Boolean).join(", "),
        ),
      );
    }
  }
  if (result.type === "papel") {
    specificFacts.push(
      crossedFact("Quantidade de CRIs", specific.criCount),
      crossedFact("Valor total em CRIs", optionalMoney(specific.totalCriValue)),
      crossedFact("Quantidade de LCIs", specific.lciCount),
      crossedFact("Valor total em LCIs", optionalMoney(specific.totalLciValue)),
      crossedFact(
        "Títulos públicos",
        Array.isArray(specific.governmentBonds)
          ? `${specific.governmentBonds.length} registros`
          : optionalMoney(specific.governmentBonds),
      ),
      crossedFact(
        "Cotas de FIIs",
        specific.fundHoldings?.length ? `${specific.fundHoldings.length} posições` : "",
      ),
      crossedFact(
        "Inadimplência de créditos",
        optionalPercent(specific.creditDelinquencyRate),
      ),
    );
  }
  document.querySelector("#crossed-type-specific").innerHTML =
    specificFacts.filter(Boolean).join("");

  const cautions = Array.isArray(result.cautions) ? result.cautions : [];
  document.querySelector("#crossed-cautions").innerHTML = cautions
    .map((caution) => `<li>${escapeHtml(caution)}</li>`)
    .join("");
}

async function loadCrossedReading(ticker, fallbackFund) {
  const requestId = ++crossedReadingRequestId;
  setText("#crossed-classification", "Carregando fundamentos...");
  document.querySelector("#crossed-reading-grid").innerHTML = "";
  document.querySelector("#crossed-type-specific").innerHTML = "";
  document.querySelector("#crossed-cautions").innerHTML = "";
  try {
    const response = await fetch(
      `/api/crossed-reading?ticker=${encodeURIComponent(ticker)}`,
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (requestId === crossedReadingRequestId) renderCrossedReading(result, fallbackFund);
  } catch {
    if (requestId !== crossedReadingRequestId) return;
    setText("#crossed-classification", "Fundamentos adicionais indisponíveis");
    document.querySelector("#crossed-reading-grid").innerHTML =
      "<p>Não foi possível carregar os dados de mercado estruturados no momento.</p>";
  }
}

function currentTicker() {
  return form.elements.ticker.value.trim().toUpperCase();
}

function addTicker(ticker) {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized || compareTickers.includes(normalized)) return;
  if (compareTickers.length >= 5) {
    document.querySelector("#comparison-note").textContent = "A tabela aceita até cinco FIIs por comparação.";
    return;
  }
  compareTickers.push(normalized);
  rowRiskRates.set(normalized, Number(document.querySelector("#shared-risk-rate").value));
  refreshComparison();
}

async function loadSuggestions(fund = { ticker: currentTicker() }) {
  try {
    const params = new URLSearchParams({
      ticker: fund.ticker,
      segmentType: fund.segmentType || "",
      segmentoAtuacao: fund.segmentoAtuacao || "",
    });
    const response = await fetch(`/api/suggestions?${params}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setText("#suggestion-origin", result.ticker);
    setText("#suggestion-note", result.note);
    suggestionList.innerHTML = result.suggestions
      .map(
        (item) => `
          <div class="suggestion-card">
            <div>
              <strong>${escapeHtml(item.ticker)}</strong>
              <small>${escapeHtml(formatFundClassification(item))}</small>
            </div>
            <button class="secondary suggestion-add" type="button" data-ticker="${escapeHtml(item.ticker)}">
              ${item.availableNow ? "Adicionar" : "Adicionar • Pro"}
            </button>
          </div>
        `,
      )
      .join("");
  } catch (cause) {
    suggestionList.innerHTML = `<p class="locked">${escapeHtml(cause.message)}</p>`;
  }
}

function riskRateParams() {
  return compareTickers
    .map((ticker) => `${ticker}:${(rowRiskRates.get(ticker) ?? 2.5) / 100}`)
    .join(",");
}

async function refreshComparison() {
  if (!compareTickers.length) {
    comparisonBody.innerHTML = '<tr><td colspan="8">Adicione pelo menos um FII para comparar.</td></tr>';
    return;
  }

  const sharedRiskRate = Number(document.querySelector("#shared-risk-rate").value) / 100;
  const params = new URLSearchParams({
    tickers: compareTickers.join(","),
    riskRate: String(sharedRiskRate),
    individualRiskRates: riskRateParams(),
    growthRate: String(Number(form.elements.growthRate.value) / 100),
  });

  try {
    const response = await fetch(`/api/comparison?${params}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    comparisonBody.innerHTML = result.rows
      .map((row) => {
        if (!row.ok) {
          return `
            <tr>
              <td><strong>${escapeHtml(row.ticker)}</strong></td>
              <td><input class="row-risk" data-ticker="${escapeHtml(row.ticker)}" type="number" min="0" max="30" step="0.25" value="${escapeHtml((row.riskRate * 100).toFixed(2))}" />%</td>
              <td colspan="5"><span class="locked">${escapeHtml(row.requiresToken ? "Token Pro necessário para carregar indicadores detalhados." : row.error)}</span></td>
              <td><button class="remove" type="button" data-remove="${escapeHtml(row.ticker)}">Remover</button></td>
            </tr>
          `;
        }

        return `
          <tr>
            <td><strong>${escapeHtml(row.ticker)}</strong><br><small>${escapeHtml(formatFundClassification(row.fund))}</small></td>
            <td><input class="row-risk" data-ticker="${escapeHtml(row.ticker)}" type="number" min="0" max="30" step="0.25" value="${escapeHtml((row.assumptions.riskRate * 100).toFixed(2))}" />%</td>
            <td>${money(row.fund.currentPrice)}</td>
            <td>${escapeHtml(row.fund.priceToNav.toFixed(2).replace(".", ","))}x</td>
            <td>${money(row.valuation.fairValue)}</td>
            <td>${percent(row.valuation.premiumDiscount)}</td>
            <td><strong>${escapeHtml(row.valuation.reading)}</strong></td>
            <td><button class="remove" type="button" data-remove="${escapeHtml(row.ticker)}">Remover</button></td>
          </tr>
        `;
      })
      .join("");
    document.querySelector("#comparison-note").textContent =
      result.source === "sandbox"
        ? "Sandbox ativo: MXRF11 e HGLG11 possuem análise completa. Os demais FIIs ficam prontos para uso quando o token Pro for configurado."
        : "Tabela atualizada com dados detalhados da API.";
  } catch (cause) {
    document.querySelector("#comparison-note").textContent = cause.message;
  }
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    setText("#api-mode", data.mode === "sandbox" ? "API • SANDBOX" : "API • TOKEN ATIVO");
  } catch {
    setText("#api-mode", "API • OFFLINE");
  }
}

async function submit(event) {
  event?.preventDefault();
  error.textContent = "";
  button.disabled = true;
  button.textContent = "Atualizando...";

  const data = new FormData(form);
  const params = new URLSearchParams({
    ticker: data.get("ticker"),
    riskRate: String(Number(data.get("riskRate")) / 100),
    growthRate: String(Number(data.get("growthRate")) / 100),
  });

  try {
    const response = await fetch(`/api/valuation?${params}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);

    setText("#fund-name", `${result.ticker} • ${result.fund.name}`);
    setText("#fair-value", money(result.valuation.fairValue));
    setText("#current-price", money(result.fund.currentPrice));
    setText("#premium-discount", percent(result.valuation.premiumDiscount));
    setText("#price-to-nav", `${result.fund.priceToNav.toFixed(2).replace(".", ",")}x`);
    setText("#nav-per-share", money(result.fund.navPerShare));
    setText("#patrimonial-reading", result.fund.patrimonialReading);
    setText("#selic", percent(result.assumptions.selicRate));
    setText("#required-return", percent(result.assumptions.requiredReturn));
    setText("#normalized-dividend", `${money(result.valuation.normalizedMonthlyDividend)} / mês`);
    setText("#dividends-used", `${result.valuation.dividendsUsed} meses`);
    setText("#recurrence-note", result.valuation.recurrenceNote);
    setReading(result.valuation.reading);
    loadCrossedReading(result.ticker, result.fund);
    loadSuggestions({
      ticker: result.ticker,
      segmentType: result.fund.segmentType,
      segmentoAtuacao: result.fund.segmentoAtuacao,
    });
  } catch (cause) {
    error.textContent = cause.message || "Não foi possível atualizar a estimativa.";
  } finally {
    button.disabled = false;
    button.textContent = "Atualizar estimativa";
  }
}

form.addEventListener("submit", submit);
document.querySelector("#add-current").addEventListener("click", () => addTicker(currentTicker()));
document.querySelector("#apply-shared-risk").addEventListener("click", () => {
  const value = Number(document.querySelector("#shared-risk-rate").value);
  compareTickers.forEach((ticker) => rowRiskRates.set(ticker, value));
  refreshComparison();
});
document.querySelector("#refresh-comparison").addEventListener("click", refreshComparison);
comparisonBody.addEventListener("change", (event) => {
  if (!event.target.matches(".row-risk")) return;
  rowRiskRates.set(event.target.dataset.ticker, Number(event.target.value));
});
comparisonBody.addEventListener("click", (event) => {
  const ticker = event.target.dataset.remove;
  if (!ticker) return;
  const index = compareTickers.indexOf(ticker);
  if (index >= 0) compareTickers.splice(index, 1);
  rowRiskRates.delete(ticker);
  refreshComparison();
});
suggestionList.addEventListener("click", (event) => {
  const ticker = event.target.dataset.ticker;
  if (ticker) addTicker(ticker);
});
loadHealth();
submit();
refreshComparison();
