import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeFundClassification,
  scoreComparableFund,
  selectComparableFunds,
} from "../lib/fund-comparables.mjs";

const catalog = [
  { ticker: "HGLG11", segmentType: "tijolo", segmentoAtuacao: "Logística" },
  { ticker: "XPLG11", segmentType: "tijolo", segmentoAtuacao: "Logística" },
  { ticker: "BTLG11", segmentType: "tijolo", segmentoAtuacao: "Logística" },
  { ticker: "BRCO11", segmentType: "tijolo", segmentoAtuacao: "Logística" },
  { ticker: "XPML11", segmentType: "tijolo", segmentoAtuacao: "Shoppings" },
  { ticker: "VISC11", segmentType: "tijolo", segmentoAtuacao: "Shopping" },
  { ticker: "HGBS11", segmentType: "tijolo", segmentoAtuacao: "Shoppings" },
  { ticker: "JSRE11", segmentType: "tijolo", segmentoAtuacao: "Lajes Corporativas" },
  { ticker: "HGRE11", segmentType: "tijolo", segmentoAtuacao: "Lajes Corporativas" },
  { ticker: "RCRB11", segmentType: "tijolo", segmentoAtuacao: "Escritórios" },
  { ticker: "KNCR11", segmentType: "papel", segmentoAtuacao: "Títulos e Valores Mobiliários" },
  { ticker: "KNSC11", segmentType: "papel", segmentoAtuacao: "Recebíveis Imobiliários" },
  { ticker: "RBRR11", segmentType: "papel", segmentoAtuacao: "Títulos e Valores Mobiliários" },
];

function suggestionsFor(ticker) {
  const origin = catalog.find((fund) => fund.ticker === ticker);
  return selectComparableFunds(origin, catalog).matches;
}

test("classificação preserva o padrão Tipo - Segmento", () => {
  assert.deepEqual(normalizeFundClassification(catalog[0]), {
    type: "tijolo",
    segment: "logística",
    label: "Tijolo - Logística",
  });
});

test("segmento específico do catálogo prevalece sobre Multicategoria", () => {
  const brcrCatalog = [
    {
      ticker: "BRCR11",
      segmentType: "tijolo",
      segmentoAtuacao: "Lajes Corporativas",
    },
  ];
  const classification = normalizeFundClassification(
    {
      ticker: "BRCR11",
      segmentType: "tijolo",
      segmentoAtuacao: "Multicategoria",
    },
    brcrCatalog,
  );

  assert.deepEqual(classification, {
    type: "tijolo",
    segment: "laje corporativa",
    label: "Tijolo - Laje corporativa",
  });
});

test("classificação resolvida é reutilizada sem alternar o segmento", () => {
  const classification = {
    type: "tijolo",
    segment: "laje corporativa",
    label: "Tijolo - Laje corporativa",
  };

  assert.deepEqual(
    normalizeFundClassification({
      ticker: "BRCR11",
      classification,
      segmentoAtuacao: "Multicategoria",
    }),
    classification,
  );
});

test("HGLG11 recebe somente comparáveis de tijolo e logística", () => {
  const matches = suggestionsFor("HGLG11");
  assert.deepEqual(matches.map((fund) => fund.ticker), ["BRCO11", "BTLG11", "XPLG11"]);
  assert.ok(matches.every((fund) => fund.segmentoAtuacao === "Logística"));
});

test("XPML11 recebe somente comparáveis de tijolo e shopping", () => {
  const matches = suggestionsFor("XPML11");
  assert.deepEqual(matches.map((fund) => fund.ticker), ["HGBS11", "VISC11"]);
  assert.ok(matches.every((fund) => fund.segmentType === "tijolo"));
});

test("KNCR11 recebe somente comparáveis de papel", () => {
  const matches = suggestionsFor("KNCR11");
  assert.deepEqual(matches.map((fund) => fund.ticker), ["KNSC11", "RBRR11"]);
  assert.ok(matches.every((fund) => fund.segmentType === "papel"));
});

test("JSRE11 recebe somente lajes corporativas compatíveis", () => {
  const matches = suggestionsFor("JSRE11");
  assert.deepEqual(matches.map((fund) => fund.ticker), ["HGRE11", "RCRB11"]);
  assert.ok(matches.every((fund) => fund.segmentType === "tijolo"));
});

test("tipo diferente recebe penalidade forte e gestora não participa do score", () => {
  const origin = {
    ...catalog[0],
    managerName: "Gestora A",
    equity: 1_000,
    priceToNav: 0.95,
  };
  const sameType = {
    ...catalog[1],
    managerName: "Gestora B",
    equity: 1_100,
    priceToNav: 0.96,
  };
  const differentType = {
    ...catalog[10],
    managerName: "Gestora A",
    equity: 1_000,
    priceToNav: 0.95,
  };

  assert.ok(scoreComparableFund(origin, sameType) > 1_500);
  assert.equal(scoreComparableFund(origin, differentType), -10_000);
});
