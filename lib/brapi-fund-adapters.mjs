const AREA_CAUTION = "O campo de área foi tratado como área declarada, não como ABL.";
const VACANCY_CAUTION =
  "Vacância física e financeira não foram separadas porque a base estruturada não retornou campos distintos.";
const MANAGER_REPORT_CAUTION = "Recomendamos avaliar o relatório gerencial do fundo.";

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function sumField(items, field) {
  const values = items.map((item) => finiteNumber(item[field])).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
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
