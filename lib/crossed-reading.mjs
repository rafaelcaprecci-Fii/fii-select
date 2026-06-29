import { brickFundAdapter } from "./brapi-fund-adapters.mjs";

const MANAGER_REPORT_CAUTION = "Recomendamos avaliar o relatório gerencial do fundo.";
const LEVERAGE_CAUTION =
  "Taxa de alavancagem não disponível na base estruturada. Recomendamos avaliar o relatório gerencial do fundo.";
const CREDIT_DELINQUENCY_CAUTION =
  "Taxa de inadimplência de dívidas/créditos não disponível na base estruturada. Recomendamos avaliar o relatório gerencial do fundo.";
const FOF_CAUTION =
  "Este fundo possui característica de FOF. A análise da carteira exige avaliação dos fundos investidos, concentração, estratégia da gestão e mudanças recentes de alocação. Recomendamos avaliar o relatório gerencial do fundo.";
const FIAGRO_CAUTION =
  "Este fundo possui característica de Fiagro. A análise exige atenção a recebíveis agrícolas, garantias, devedores, indexadores, riscos do agronegócio e estrutura da carteira. Recomendamos avaliar o relatório gerencial do fundo.";

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : null;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function referencePeriod(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function assetText(asset) {
  return normalizeText([
    asset.assetClass,
    asset.type,
    asset.category,
    asset.name,
    asset.description,
  ].join(" "));
}

function sumField(items, field) {
  const values = items.map((item) => finiteNumber(item[field])).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function classifyFund(data) {
  const cadastral = data.cadastral || {};
  const portfolio = data.portfolio || {};
  const vacancyProperties = data.propertiesAndVacancy?.properties || [];
  const portfolioProperties = data.portfolio?.properties || [];
  const properties = vacancyProperties.length ? vacancyProperties : portfolioProperties;
  const financialAssets = portfolio.financialAssets || [];
  const fundHoldings = portfolio.fundHoldings || [];
  const classification = normalizeText([
    cadastral.segmentType,
    cadastral.segmentoAtuacao,
    cadastral.mandate,
    cadastral.name,
  ].join(" "));

  if (classification.includes("fiagro") || classification.includes("fi-agro")) return "fiagro";
  if (classification.includes("fof") || classification.includes("fundo de fundos")) return "fof";
  if (classification.includes("hibrid")) return "híbrido";
  if (classification.includes("papel")) return "papel";
  if (classification.includes("tijolo")) return "tijolo";

  const hasProperties = properties.length > 0 || (portfolio.properties || []).length > 0;
  const hasFinancialAssets = financialAssets.length > 0;
  const hasFundHoldings = fundHoldings.length > 0;
  const compositionTypes = [hasProperties, hasFinancialAssets, hasFundHoldings].filter(Boolean).length;

  if (compositionTypes > 1) return "híbrido";
  if (hasFundHoldings) return "fof";
  if (hasProperties) return "tijolo";
  if (hasFinancialAssets) return "papel";
  return "desconhecido";
}

function leverageMetrics(data, cautions) {
  const report = data.report || {};
  const patrimonial = data.patrimonial || {};
  const marketPeriod = referencePeriod(data.market?.asOfDate);
  const reportPeriod = referencePeriod(report.referenceDate);
  const compatiblePeriods = !marketPeriod || !reportPeriod || marketPeriod === reportPeriod;
  const liabilitiesValue = finiteNumber(report.totalLiabilities);
  const reportEquityValue = finiteNumber(report.equity);
  const reportAssetsValue = finiteNumber(report.totalAssets);
  const liabilities = positiveNumber(liabilitiesValue);
  const reportEquity = positiveNumber(reportEquityValue);
  const reportAssets = positiveNumber(reportAssetsValue);
  const patrimonialEquity = compatiblePeriods ? positiveNumber(patrimonial.equity) : null;
  const patrimonialAssets = compatiblePeriods ? positiveNumber(patrimonial.totalAssets) : null;
  const equity = reportEquity ?? patrimonialEquity;
  const assets = reportAssets ?? patrimonialAssets;
  const leverage = liabilities != null && equity != null ? liabilities / equity : null;
  const liabilitiesToAssets = liabilities != null && assets != null ? liabilities / assets : null;

  if (leverage == null) cautions.push(LEVERAGE_CAUTION);
  if (!compatiblePeriods && (!reportEquity || !reportAssets)) {
    cautions.push(
      "Os períodos dos dados patrimoniais não são compatíveis; a taxa de alavancagem não foi calculada.",
    );
  }

  return {
    totalLiabilities: liabilitiesValue,
    equity: firstDefined(reportEquityValue, patrimonial.equity),
    totalAssets: firstDefined(reportAssetsValue, patrimonial.totalAssets),
    leverage,
    liabilitiesToAssets,
    canCalculateLeverage: leverage != null,
  };
}

function rankItems(items, valueFields) {
  return [...items].sort((left, right) => {
    const leftValue = valueFields
      .map((field) => finiteNumber(left[field]))
      .find((value) => value != null) ?? -Infinity;
    const rightValue = valueFields
      .map((field) => finiteNumber(right[field]))
      .find((value) => value != null) ?? -Infinity;
    return rightValue - leftValue;
  });
}

function paperFundAdapter(data, cautions) {
  const financialAssets = data.portfolio?.financialAssets || [];
  const report = data.report || {};
  const cris = financialAssets.filter((asset) => assetText(asset).includes("cri"));
  const lcis = financialAssets.filter((asset) => assetText(asset).includes("lci"));
  const governmentBonds = financialAssets.filter((asset) => {
    const text = assetText(asset);
    return text.includes("titulo publico") || text.includes("government");
  });
  const fundHoldings = data.portfolio?.fundHoldings || [];
  const creditDelinquencyRate = firstDefined(
    report.creditDelinquencyRate,
    data.portfolio?.summary?.creditDelinquencyRate,
  );
  const creditDelinquencyByAsset = financialAssets
    .filter((asset) => finiteNumber(asset.delinquencyRate) != null)
    .map((asset) => ({
      name: asset.name || asset.ticker || "",
      delinquencyRate: finiteNumber(asset.delinquencyRate),
    }));

  if (creditDelinquencyRate == null) cautions.push(CREDIT_DELINQUENCY_CAUTION);

  return {
    portfolioComposition: data.portfolio?.allocations || [],
    criCount: cris.length || null,
    totalCriValue: firstDefined(report.cri, sumField(cris, "value")),
    lciCount: lcis.length || null,
    totalLciValue: firstDefined(report.lci, sumField(lcis, "value")),
    governmentBonds: report.governmentBonds ?? governmentBonds,
    fundHoldings,
    creditDelinquencyRate,
    creditDelinquencyByAsset,
  };
}

function fofFundAdapter(data, cautions) {
  const holdings = data.portfolio?.fundHoldings || [];
  const rankedHoldings = rankItems(holdings, ["share", "percentage", "value", "amount"]);
  cautions.push(FOF_CAUTION);
  return {
    fundHoldings: holdings,
    fundHoldingsCount: holdings.length || null,
    mainPositions: rankedHoldings.slice(0, 5),
  };
}

function fiagroFundAdapter(cautions) {
  cautions.push(FIAGRO_CAUTION);
  return {};
}

function hybridFundAdapter(data, cautions) {
  const blocks = {};
  const hasProperties =
    (data.propertiesAndVacancy?.properties || []).length > 0 ||
    (data.portfolio?.properties || []).length > 0;
  const hasFinancialAssets = (data.portfolio?.financialAssets || []).length > 0;
  const hasFundHoldings = (data.portfolio?.fundHoldings || []).length > 0;

  if (hasProperties) blocks.brick = brickFundAdapter(data, cautions);
  if (hasFinancialAssets) blocks.paper = paperFundAdapter(data, cautions);
  if (hasFundHoldings) blocks.fof = fofFundAdapter(data, cautions);
  if (!Object.keys(blocks).length) cautions.push(MANAGER_REPORT_CAUTION);
  return blocks;
}

export function normalizeCrossedReading({ ticker, data }) {
  const cautions = [];
  const type = classifyFund(data);
  const leverage = leverageMetrics(data, cautions);
  const dividends = Array.isArray(data.dividends) ? data.dividends : [];
  const vacancyProperties = data.propertiesAndVacancy?.properties || [];
  const portfolioProperties = data.portfolio?.properties || [];
  const properties = vacancyProperties.length ? vacancyProperties : portfolioProperties;
  const financialAssets = data.portfolio?.financialAssets || [];
  const fundHoldings = data.portfolio?.fundHoldings || [];
  let typeSpecific = {};

  if (type === "tijolo") {
    const brick = brickFundAdapter(data, cautions);
    typeSpecific = { ...brick, brick };
  }
  if (type === "papel") typeSpecific = paperFundAdapter(data, cautions);
  if (type === "fof") typeSpecific = fofFundAdapter(data, cautions);
  if (type === "fiagro") typeSpecific = fiagroFundAdapter(cautions);
  if (type === "híbrido") typeSpecific = hybridFundAdapter(data, cautions);
  if (
    type === "desconhecido" &&
    !cautions.some((caution) => caution.includes(MANAGER_REPORT_CAUTION))
  ) {
    cautions.push(MANAGER_REPORT_CAUTION);
  }

  const dataQuality = {
    hasMarketData: finiteNumber(firstDefined(data.market?.price, data.market?.regularMarketPrice)) != null,
    hasPatrimonialData:
      finiteNumber(data.patrimonial?.equity) != null ||
      finiteNumber(data.patrimonial?.navPerShare) != null,
    hasProperties: properties.length > 0,
    hasVacancy: finiteNumber(data.propertiesAndVacancy?.vacancyRate) != null,
    hasVacancyByProperty: properties.some(
      (property) => finiteNumber(property.vacancyRate) != null,
    ),
    hasDelinquencyByProperty: properties.some(
      (property) => finiteNumber(property.delinquencyRate) != null,
    ),
    hasRevenueShareByProperty: properties.some(
      (property) => finiteNumber(property.revenueShare) != null,
    ),
    hasDeclaredArea:
      finiteNumber(data.propertiesAndVacancy?.totalArea) != null ||
      properties.some((property) => finiteNumber(property.area) != null),
    hasPortfolioComposition:
      (data.portfolio?.allocations || []).length > 0 ||
      (data.portfolio?.properties || []).length > 0 ||
      financialAssets.length > 0 ||
      fundHoldings.length > 0,
    hasFinancialAssets: financialAssets.length > 0,
    hasFundHoldings: fundHoldings.length > 0,
    hasDividends: dividends.length > 0,
    canCalculateLeverage: leverage.canCalculateLeverage,
    needsManagerReport: false,
  };

  const normalizedCautions = unique(cautions);
  dataQuality.needsManagerReport = normalizedCautions.length > 0;

  return {
    common: {
      ticker,
      name: data.cadastral?.name ?? null,
      fundType: type,
      segment: data.cadastral?.segmentoAtuacao ?? null,
      referenceDate: firstDefined(data.report?.referenceDate, data.market?.asOfDate),
      price: firstDefined(data.market?.price, data.market?.regularMarketPrice),
      equity: leverage.equity,
      totalAssets: leverage.totalAssets,
      totalLiabilities: leverage.totalLiabilities,
      navPerShare: firstDefined(data.patrimonial?.navPerShare, data.report?.navPerShare),
      priceToNav: data.patrimonial?.priceToNav ?? null,
      dividendYield12m: data.market?.dividendYield12m ?? null,
      dividendHistory: dividends,
      leverage: leverage.leverage,
      liabilitiesToAssets: leverage.liabilitiesToAssets,
    },
    type,
    typeSpecific,
    dataQuality,
    cautions: normalizedCautions,
  };
}
