import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCrossedReading } from "../lib/crossed-reading.mjs";

function baseData({
  ticker,
  segmentType,
  segmentoAtuacao,
  properties = [],
  financialAssets = [],
  fundHoldings = [],
  allocations = [],
}) {
  return {
    market: {
      price: 100,
      dividendYield12m: 0.1,
      asOfDate: "2026-03-31",
    },
    patrimonial: {
      navPerShare: 110,
      priceToNav: 0.91,
      equity: 1_000,
      totalAssets: 1_250,
    },
    cadastral: {
      symbol: ticker,
      name: `Fundo ${ticker}`,
      segmentType,
      segmentoAtuacao,
    },
    propertiesAndVacancy: {
      count: properties.length,
      totalArea: properties.reduce((sum, property) => sum + (property.area || 0), 0),
      vacancyRate: properties.length ? 0.08 : undefined,
      properties,
    },
    portfolio: {
      summary: {},
      allocations,
      properties,
      financialAssets,
      fundHoldings,
    },
    report: {
      referenceDate: "2026-03-01",
      equity: 1_000,
      totalAssets: 1_250,
      totalLiabilities: 250,
      navPerShare: 110,
      cri: 500,
      lci: 100,
      governmentBonds: 50,
    },
    dividends: [{ symbol: ticker, label: "RENDIMENTO", rate: 1 }],
    cdi: { latest: { value: 99 } },
  };
}

function brickProperties(count) {
  return Array.from({ length: count }, (_, index) => ({
    name: `Imóvel ${index + 1}`,
    area: (index + 1) * 100,
    vacancyRate: 0.05,
    delinquencyRate: 0,
    revenueShare: (index + 1) / 100,
  }));
}

test("JSRE11 é normalizado como tijolo e limita os principais imóveis", () => {
  const normalized = normalizeCrossedReading({
    ticker: "JSRE11",
    data: baseData({
      ticker: "JSRE11",
      segmentType: "tijolo",
      segmentoAtuacao: "Lajes Corporativas",
      properties: brickProperties(12),
      allocations: [{ assetClass: "real_estate", count: 12 }],
    }),
  });

  assert.equal(normalized.type, "tijolo");
  assert.equal("paper" in normalized.typeSpecific, false);
  assert.equal(normalized.typeSpecific.mainProperties.length, 5);
  assert.equal(normalized.typeSpecific.mainProperties[0].name, "Imóvel 12");
  assert.equal(normalized.typeSpecific.brick.topProperties.length, 5);
  assert.equal(normalized.typeSpecific.brick.topProperties[0].name, "Imóvel 12");
  assert.equal(normalized.typeSpecific.brick.vacancyStatus, "available");
  assert.equal(normalized.common.leverage, 0.25);
  assert.equal(normalized.common.liabilitiesToAssets, 0.2);
  assert.equal("cdi" in normalized.common, false);
});

test("HGLG11 é normalizado como tijolo com área declarada e vacância", () => {
  const normalized = normalizeCrossedReading({
    ticker: "HGLG11",
    data: baseData({
      ticker: "HGLG11",
      segmentType: "tijolo",
      segmentoAtuacao: "Logística",
      properties: brickProperties(3),
    }),
  });

  assert.equal(normalized.type, "tijolo");
  assert.equal("paper" in normalized.typeSpecific, false);
  assert.equal(normalized.typeSpecific.propertyCount, 3);
  assert.equal(normalized.typeSpecific.declaredArea, 600);
  assert.equal(normalized.typeSpecific.brick.declaredArea, 600);
  assert.equal(normalized.dataQuality.hasVacancyByProperty, true);
  assert.equal(normalized.dataQuality.hasDeclaredArea, true);
  assert.match(normalized.cautions.join(" "), /área declarada/);
});

test("XPML11 é normalizado como tijolo do segmento de shopping", () => {
  const data = baseData({
    ticker: "XPML11",
    segmentType: "tijolo",
    segmentoAtuacao: "Shoppings",
    properties: brickProperties(4),
  });
  data.propertiesAndVacancy.vacancyRate = 0.7;
  const normalized = normalizeCrossedReading({ ticker: "XPML11", data });

  assert.equal(normalized.type, "tijolo");
  assert.equal("paper" in normalized.typeSpecific, false);
  assert.equal(normalized.common.segment, "Shoppings");
  assert.equal(normalized.typeSpecific.vacancyConsistent, false);
  assert.equal(normalized.typeSpecific.brick.vacancyStatus, "requires_validation");
  assert.ok(normalized.cautions.includes("Recomendamos avaliar o relatório gerencial do fundo."));
});

test("KNCR11 é normalizado como papel sem dados de imóveis ou vacância", () => {
  const normalized = normalizeCrossedReading({
    ticker: "KNCR11",
    data: baseData({
      ticker: "KNCR11",
      segmentType: "papel",
      segmentoAtuacao: "Títulos e Valores Mobiliários",
      financialAssets: [
        { assetClass: "cri", name: "CRI A", value: 300 },
        { assetClass: "cri", name: "CRI B", value: 200 },
        { assetClass: "lci", name: "LCI A", value: 100 },
      ],
      fundHoldings: [{ ticker: "FIIX11", value: 50 }],
      allocations: [{ assetClass: "cri", value: 500 }],
    }),
  });

  assert.equal(normalized.type, "papel");
  assert.equal(normalized.typeSpecific.criCount, 2);
  assert.equal(normalized.typeSpecific.lciCount, 1);
  assert.equal(normalized.typeSpecific.paper.criCount, 2);
  assert.equal(normalized.typeSpecific.paper.criTotal, 500);
  assert.equal(normalized.typeSpecific.paper.lciCount, 1);
  assert.equal(normalized.typeSpecific.paper.lciTotal, 100);
  assert.equal(normalized.typeSpecific.paper.governmentBondsTotal, 50);
  assert.equal(normalized.typeSpecific.paper.fiiHoldingsTotal, 50);
  assert.equal(normalized.typeSpecific.paper.totalCreditAssets, 600);
  assert.equal(normalized.typeSpecific.paper.hasCreditAssets, true);
  assert.equal(normalized.typeSpecific.paper.hasCreditDelinquency, false);
  assert.equal("properties" in normalized.typeSpecific, false);
  assert.equal("declaredArea" in normalized.typeSpecific, false);
  assert.equal("consolidatedVacancy" in normalized.typeSpecific, false);
  assert.equal("brick" in normalized.typeSpecific, false);
  assert.equal(normalized.dataQuality.hasFinancialAssets, true);
  assert.equal(normalized.dataQuality.hasCreditAssets, true);
  assert.equal(normalized.dataQuality.hasCri, true);
  assert.equal(normalized.dataQuality.hasLci, true);
  assert.equal(normalized.dataQuality.hasGovernmentBonds, true);
  assert.equal(normalized.dataQuality.hasFiiHoldings, true);
  assert.equal(normalized.dataQuality.hasCreditDelinquency, false);
  assert.equal(normalized.dataQuality.needsManagerReport, true);
  assert.match(normalized.cautions.join(" "), /inadimplência de dívidas\/créditos/);
});

test("fundo de papel preserva totais agregados sem inventar contagens", () => {
  const data = baseData({
    ticker: "PAPR11",
    segmentType: "papel",
    segmentoAtuacao: "Recebíveis Imobiliários",
  });
  data.portfolio.financialAssets = [];
  data.report.cri = 900;
  data.report.lci = 120;
  data.report.governmentBonds = 80;
  data.report.fiiHoldings = 40;
  data.report.creditDelinquencyRate = 0.015;

  const normalized = normalizeCrossedReading({ ticker: "PAPR11", data });

  assert.equal(normalized.typeSpecific.paper.criCount, null);
  assert.equal(normalized.typeSpecific.paper.lciCount, null);
  assert.equal(normalized.typeSpecific.paper.criTotal, 900);
  assert.equal(normalized.typeSpecific.paper.lciTotal, 120);
  assert.equal(normalized.typeSpecific.paper.totalCreditAssets, 1_020);
  assert.match(normalized.typeSpecific.paper.notes.join(" "), /quantidade de CRIs/);
  assert.match(normalized.typeSpecific.paper.notes.join(" "), /quantidade de LCIs/);
  assert.equal(normalized.typeSpecific.paper.creditDelinquencyRate, 0.015);
  assert.equal(normalized.typeSpecific.paper.hasCreditDelinquency, true);
  assert.equal(normalized.dataQuality.hasCreditDelinquency, true);
  assert.equal("brick" in normalized.typeSpecific, false);
});
