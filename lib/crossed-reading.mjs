import { brickFundAdapter, paperFundAdapter } from "./brapi-fund-adapters.mjs";

const MANAGER_REPORT_CAUTION = "Recomendamos avaliar o relatório gerencial do fundo.";
const LEVERAGE_CAUTION =
  "Taxa de alavancagem não disponível na base estruturada. Recomendamos avaliar o relatório gerencial do fundo.";
const FOF_CAUTION =
  "Este fundo possui característica de FOF. A análise da carteira exige avaliação dos fundos investidos, concentração, estratégia da gestão e mudanças recentes de alocação. Recomendamos avaliar o relatório gerencial do fundo.";
const FIAGRO_CAUTION =
  "Este fundo possui característica de Fiagro. A análise exige atenção a recebíveis agrícolas, garantias, devedores, indexadores, riscos do agronegócio e estrutura da carteira. Recomendamos avaliar o relatório gerencial do fundo.";
const UNAVAILABLE_DATA_NOTE = "Dado não disponível na base estruturada.";
const HYBRID_COMPOSITION_CAUTION =
  "A composição híbrida não pôde ser confirmada integralmente na base estruturada. Recomendamos avaliar o relatório gerencial do fundo.";

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

function hasReliableHoldingMetric(holding) {
  return ["share", "percentage", "value", "amount"].some((field) => {
    const value = holding[field];
    return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
  });
}

function fofFundAdapter(data, cautions) {
  const holdings = data.portfolio?.fundHoldings || [];
  const holdingsWithMetrics = holdings.filter(hasReliableHoldingMetric);
  const rankedHoldings = rankItems(
    holdingsWithMetrics,
    ["share", "percentage", "value", "amount"],
  );
  const notes = [FOF_CAUTION];
  if (!holdings.length) notes.push(UNAVAILABLE_DATA_NOTE);
  if (holdings.length && !holdingsWithMetrics.length) {
    notes.push("Dados de concentração por posição não disponíveis na base estruturada.");
  }
  cautions.push(FOF_CAUTION);
  return {
    fundHoldings: holdings,
    fundHoldingsCount: holdings.length || null,
    topHoldings: rankedHoldings.slice(0, 5),
    hasConcentrationData: holdingsWithMetrics.length > 0,
    hasFundHoldings: holdings.length > 0,
    notes,

    // Campo mantido por compatibilidade com a leitura atual.
    mainPositions: rankedHoldings.slice(0, 5),
    portfolioComposition: data.portfolio?.allocations || [],
  };
}

function fiagroFundAdapter(cautions) {
  cautions.push(FIAGRO_CAUTION);
  return {
    supportedInMvp: false,
    requiresDedicatedEndpoint: true,
    notes: [FIAGRO_CAUTION],
  };
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
  const compositionBlocks = Object.keys(blocks);
  const hasAmbiguousComposition = compositionBlocks.length < 2;
  const notes = [];

  if (!compositionBlocks.length) {
    notes.push(UNAVAILABLE_DATA_NOTE);
    cautions.push(MANAGER_REPORT_CAUTION);
  }
  if (hasAmbiguousComposition) {
    notes.push(HYBRID_COMPOSITION_CAUTION);
    cautions.push(HYBRID_COMPOSITION_CAUTION);
  }

  return {
    ...blocks,
    hybrid: {
      hasBrickBlock: Boolean(blocks.brick),
      hasPaperBlock: Boolean(blocks.paper),
      hasFofBlock: Boolean(blocks.fof),
      compositionBlocks,
      hasAmbiguousComposition,
      notes,
    },
  };
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
  if (type === "papel") {
    const paper = paperFundAdapter(data, cautions);
    typeSpecific = { ...paper, paper };
  }
  if (type === "fof") {
    const fof = fofFundAdapter(data, cautions);
    typeSpecific = { ...fof, fof };
  }
  if (type === "fiagro") {
    const fiagro = fiagroFundAdapter(cautions);
    typeSpecific = { ...fiagro, fiagro };
  }
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
    hasCreditAssets: Boolean(typeSpecific.paper?.hasCreditAssets),
    hasCri: typeSpecific.paper?.criTotal != null || typeSpecific.paper?.criCount != null,
    hasLci: typeSpecific.paper?.lciTotal != null || typeSpecific.paper?.lciCount != null,
    hasGovernmentBonds: typeSpecific.paper?.governmentBondsTotal != null,
    hasFiiHoldings: fundHoldings.length > 0 || typeSpecific.paper?.fiiHoldingsTotal != null,
    hasCreditDelinquency: Boolean(typeSpecific.paper?.hasCreditDelinquency),
    hasFundHoldings: fundHoldings.length > 0,
    hasFundHoldingsConcentration: Boolean(
      typeSpecific.fof?.hasConcentrationData,
    ),
    hasHybridComposition: Boolean(
      typeSpecific.hybrid?.compositionBlocks?.length,
    ),
    hasFiagroSpecificData: false,
    requiresDedicatedFiagroEndpoint: Boolean(
      typeSpecific.fiagro?.requiresDedicatedEndpoint,
    ),
    hasAmbiguousComposition: Boolean(
      typeSpecific.hybrid?.hasAmbiguousComposition,
    ),
    hasDividends: dividends.length > 0,
    canCalculateLeverage: leverage.canCalculateLeverage,
    needsManagerReport: false,
    requiresManagerReport: false,
  };

  const normalizedCautions = unique(cautions);
  dataQuality.needsManagerReport = normalizedCautions.length > 0;
  dataQuality.requiresManagerReport = dataQuality.needsManagerReport;

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
