const form = document.querySelector("#valuation-form");
const button = form.querySelector("button");
const error = document.querySelector("#error");
const comparisonBody = document.querySelector("#comparison-body");
const suggestionList = document.querySelector("#suggestion-list");
const compareTickers = ["MXRF11"];
const rowRiskRates = new Map([["MXRF11", 2.5]]);

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
              <small>${escapeHtml(item.label)} • ${escapeHtml(item.segmentType)}</small>
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
            <td><strong>${escapeHtml(row.ticker)}</strong><br><small>${escapeHtml(row.fund.segmentType || "")}</small></td>
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
    setText("#divergence", result.valuation.divergence);
    setReading(result.valuation.reading);
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
