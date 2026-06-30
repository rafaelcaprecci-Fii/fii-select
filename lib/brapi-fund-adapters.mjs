const AREA_CAUTION = "O campo de área foi tratado como área declarada, não como ABL.";
const VACANCY_CAUTION =
  "Vacância física e financeira não foram separadas porque a base estruturada não retornou campos distintos.";
const MANAGER_REPORT_CAUTION = "Recomendamos avaliar o relatório gerencial do fundo.";
const CREDIT_DELINQUENCY_CAUTION =
  "Taxa de inadimplência de dívidas/créditos não disponível na base estruturada. Recomendamos avaliar o relatório gerencial do fundo.";

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  return finiteNumber(value);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function sumField(items, field) {
  const values = items.map((item) => finiteNumber(item[field])).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
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

function assetValue(asset) {
  return firstDefined(
    optionalNumber(asset.value),
    optionalNumber(asset.declaredValue),
    optionalNumber(asset.amount),
  );
}

function sumAssetValues(items) {
  const values = items.map(assetValue).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function categoryAssets(assets, patterns) {
  return assets.filter((asset) => patterns.some((pattern) => assetText(asset).includes(pattern)));
}

function reliableCount(items) {
  if (!items.length) return null;
  return items.every((item) => assetText(item)) ? items.length : null;
}

function rankProperties(properties) {
  return [...properties].sort((left, right) => {
    const leftRevenue = finiteNumber(left.revenueShare);
    const rightRevenue = finiteNumber(right.revenueShare);

    if (leftRevenue != null || rightRevenue != null) {
      return (rightRevenue ?? -Infinity) - (leftRevenue ?? -Infinity);
    }

    return (finiteNumber(right.area) ?? -Infinity) - (finiteNumber(left.area) ?? -Infinity);
  });
}

function vacancyStatus(propertiesData, properties) {
  const vacancyRate = finiteNumber(propertiesData.vacancyRate);
  const propertyVacancies = properties
    .map((property) => finiteNumber(property.vacancyRate))
    .filter((value) => value != null);
  const fullVacancyCount = propertyVacancies.filter((value) => value === 1).length;

  if (vacancyRate == null) return "unavailable";
  if (vacancyRate < 0 || vacancyRate > 1) return "inconsistent";
  if (vacancyRate > 0.5) return "requires_validation";
  if (propertyVacancies.length >= 3 && fullVacancyCount / propertyVacancies.length >= 0.5) {
    return "requires_validation";
  }
  if (propertiesData.vacancySemanticsConfirmed === false) return "requires_validation";
  return "available";
}

function normalizedProperty(property) {
  return {
    name: property.name || "",
    city: property.city || "",
    state: property.state || "",
    declaredArea: finiteNumber(property.area),
    vacancyRate: finiteNumber(property.vacancyRate),
    delinquencyRate: finiteNumber(property.delinquencyRate),
    revenueShare: finiteNumber(property.revenueShare),
  };
}

export function brickFundAdapter(data, cautions = []) {
  const propertiesData = data.propertiesAndVacancy || {};
  const vacancyProperties = propertiesData.properties || [];
  const portfolioProperties = data.portfolio?.properties || [];
  const properties = vacancyProperties.length ? vacancyProperties : portfolioProperties;
  const hasDeclaredArea =
    finiteNumber(propertiesData.totalArea) != null ||
    properties.some((property) => finiteNumber(property.area) != null);
  const hasVacancyByProperty = properties.some(
    (property) => finiteNumber(property.vacancyRate) != null,
  );
  const hasDelinquencyByProperty = properties.some(
    (property) => finiteNumber(property.delinquencyRate) != null,
  );
  const hasRevenueShare = properties.some(
    (property) => finiteNumber(property.revenueShare) != null,
  );
  const consolidatedVacancy = finiteNumber(propertiesData.vacancyRate);
  const status = vacancyStatus(propertiesData, properties);
  const rankedProperties = rankProperties(properties);
  const summarizedProperties =
    properties.length > 10 ? rankedProperties.slice(0, 5) : rankedProperties;
  const notes = [];

  if (hasDeclaredArea) {
    cautions.push(AREA_CAUTION);
    notes.push(AREA_CAUTION);
  }

  if (consolidatedVacancy != null || hasVacancyByProperty) {
    cautions.push(VACANCY_CAUTION);
    notes.push(VACANCY_CAUTION);
  }

  if (status === "requires_validation" || status === "inconsistent") {
    cautions.push(MANAGER_REPORT_CAUTION);
    notes.push(MANAGER_REPORT_CAUTION);
  }

  if (!properties.length) {
    cautions.push(MANAGER_REPORT_CAUTION);
    notes.push("Não há dados estruturados suficientes sobre os imóveis do fundo.");
  }

  return {
    propertyCount:
      finiteNumber(propertiesData.count) > 0
        ? finiteNumber(propertiesData.count)
        : properties.length || null,
    declaredArea: firstDefined(propertiesData.totalArea, sumField(properties, "area")),
    consolidatedVacancy,
    vacancyStatus: status,
    topProperties: summarizedProperties.map(normalizedProperty),
    hasRevenueShare,
    hasVacancyByProperty,
    hasDelinquencyByProperty,
    notes: [...new Set(notes)],

    // Campos mantidos por compatibilidade com a leitura cruzada atual.
    vacancyConsistent: status === "available",
    vacancyByProperty: properties
      .filter((property) => finiteNumber(property.vacancyRate) != null)
      .map((property) => ({
        name: property.name || "",
        vacancyRate: finiteNumber(property.vacancyRate),
      })),
    delinquencyByProperty: properties
      .filter((property) => finiteNumber(property.delinquencyRate) != null)
      .map((property) => ({
        name: property.name || "",
        delinquencyRate: finiteNumber(property.delinquencyRate),
      })),
    revenueShareByProperty: properties
      .filter((property) => finiteNumber(property.revenueShare) != null)
      .map((property) => ({
        name: property.name || "",
        revenueShare: finiteNumber(property.revenueShare),
      })),
    mainProperties: summarizedProperties,
    portfolioComposition: data.portfolio?.allocations || [],
    hasDeclaredArea,
  };
}

export function paperFundAdapter(data, cautions = []) {
  const portfolio = data.portfolio || {};
  const report = data.report || {};
  const financialAssets = Array.isArray(portfolio.financialAssets)
    ? portfolio.financialAssets
    : [];
  const fundHoldings = Array.isArray(portfolio.fundHoldings) ? portfolio.fundHoldings : [];
  const cris = categoryAssets(financialAssets, ["cri", "recebiveis imobiliarios"]);
  const lcis = categoryAssets(financialAssets, ["lci", "letra de credito imobiliario"]);
  const governmentBonds = categoryAssets(financialAssets, [
    "titulo publico",
    "titulos publicos",
    "government bond",
    "tesouro",
  ]);
  const categorizedAssets = new Set([...cris, ...lcis, ...governmentBonds]);
  const otherAssets = financialAssets.filter((asset) => !categorizedAssets.has(asset));
  const criTotal = firstDefined(optionalNumber(report.cri), sumAssetValues(cris));
  const lciTotal = firstDefined(optionalNumber(report.lci), sumAssetValues(lcis));
  const governmentBondsTotal = firstDefined(
    optionalNumber(report.governmentBonds),
    sumAssetValues(governmentBonds),
  );
  const fiiHoldingsTotal = firstDefined(
    optionalNumber(report.fiiHoldings),
    sumAssetValues(fundHoldings),
  );
  const otherAssetsTotal = sumAssetValues(otherAssets);
  const creditTotals = [criTotal, lciTotal].filter((value) => value != null);
  const totalCreditAssets = creditTotals.length
    ? creditTotals.reduce((sum, value) => sum + value, 0)
    : null;
  const creditDelinquencyRate = firstDefined(
    optionalNumber(report.creditDelinquencyRate),
    optionalNumber(portfolio.summary?.creditDelinquencyRate),
  );
  const creditDelinquencyByAsset = financialAssets
    .filter((asset) => finiteNumber(asset.delinquencyRate) != null)
    .map((asset) => ({
      name: asset.name || asset.ticker || asset.symbol || "",
      delinquencyRate: finiteNumber(asset.delinquencyRate),
    }));
  const hasCreditDelinquency =
    creditDelinquencyRate != null || creditDelinquencyByAsset.length > 0;
  const hasCreditAssets = cris.length > 0 || lcis.length > 0 || totalCreditAssets != null;
  const notes = [];

  if (!hasCreditDelinquency) {
    cautions.push(CREDIT_DELINQUENCY_CAUTION);
    notes.push(CREDIT_DELINQUENCY_CAUTION);
  }
  if (reliableCount(cris) == null && criTotal != null) {
    notes.push("A quantidade de CRIs não pôde ser confirmada pela base estruturada.");
  }
  if (reliableCount(lcis) == null && lciTotal != null) {
    notes.push("A quantidade de LCIs não pôde ser confirmada pela base estruturada.");
  }

  return {
    criCount: reliableCount(cris),
    criTotal,
    lciCount: reliableCount(lcis),
    lciTotal,
    governmentBondsTotal,
    fiiHoldingsTotal,
    otherAssetsTotal,
    totalCreditAssets,
    creditDelinquencyRate,
    hasCreditDelinquency,
    hasCreditAssets,
    notes: [...new Set(notes)],

    // Campos mantidos por compatibilidade com a leitura cruzada atual.
    portfolioComposition: portfolio.allocations || [],
    totalCriValue: criTotal,
    totalLciValue: lciTotal,
    governmentBonds:
      governmentBondsTotal ?? (governmentBonds.length ? governmentBonds : null),
    fundHoldings,
    creditDelinquencyByAsset,
  };
}
