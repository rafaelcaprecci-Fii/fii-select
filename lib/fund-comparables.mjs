import { normalizeFundClassification } from "../public/fund-classification.js";

function finiteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function proximityScore(originValue, candidateValue, weight) {
  const origin = finiteNumber(originValue);
  const candidate = finiteNumber(candidateValue);
  if (origin == null || candidate == null) return 0;
  const scale = Math.max(Math.abs(origin), Math.abs(candidate), 0.0001);
  return Math.max(0, weight * (1 - Math.abs(origin - candidate) / scale));
}

export { normalizeFundClassification };

export function scoreComparableFund(origin, candidate) {
  const originClassification = normalizeFundClassification(origin);
  const candidateClassification = normalizeFundClassification(candidate);

  if (!originClassification.type || originClassification.type !== candidateClassification.type) {
    return -10_000;
  }

  let score = 1_000;
  if (
    originClassification.segment &&
    originClassification.segment === candidateClassification.segment
  ) {
    score += 500;
  }

  score += proximityScore(
    origin.equity ?? origin.patrimonioLiquido,
    candidate.equity ?? candidate.patrimonioLiquido,
    80,
  );
  score += proximityScore(
    origin.priceToNav ?? origin.pvp,
    candidate.priceToNav ?? candidate.pvp,
    50,
  );
  score += proximityScore(
    origin.dividendYield12m ?? origin.dividendYield,
    candidate.dividendYield12m ?? candidate.dividendYield,
    40,
  );
  score += proximityScore(
    origin.liquidity ?? origin.liquidez,
    candidate.liquidity ?? candidate.liquidez,
    20,
  );
  return score;
}

export function selectComparableFunds(origin, catalog, limit = 5) {
  const originClassification = normalizeFundClassification(origin);
  if (!originClassification.type) {
    return { precision: "indisponivel", matches: [] };
  }

  const sameType = catalog.filter((candidate) => {
    if (candidate.ticker === origin.ticker) return false;
    return normalizeFundClassification(candidate).type === originClassification.type;
  });
  const sameSegment = originClassification.segment
    ? sameType.filter(
      (candidate) =>
        normalizeFundClassification(candidate).segment === originClassification.segment,
    )
    : [];
  const candidates = sameSegment.length ? sameSegment : sameType;
  const precision = sameSegment.length ? "segmento" : sameType.length ? "tipo" : "indisponivel";
  const matches = candidates
    .map((candidate) => ({
      ...candidate,
      comparisonScore: scoreComparableFund(origin, candidate),
    }))
    .sort(
      (left, right) =>
        right.comparisonScore - left.comparisonScore ||
        String(left.ticker).localeCompare(String(right.ticker)),
    )
    .slice(0, limit);

  return { precision, matches };
}
