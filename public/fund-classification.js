function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizedType(value) {
  const type = normalizeText(value);
  if (type.includes("tijolo")) return "tijolo";
  if (type.includes("papel") || type.includes("recebive")) return "papel";
  if (type === "fof" || type.includes("fundo de fundos")) return "fof";
  if (type.includes("fiagro") || type.includes("fi-agro")) return "fiagro";
  if (type.includes("hibrid")) return "híbrido";
  return type;
}

function normalizedSegment(value) {
  const segment = normalizeText(value);
  if (segment.includes("logistica")) return "logística";
  if (segment.includes("shopping")) return "shopping";
  if (segment.includes("laje") || segment.includes("escritorio")) {
    return "laje corporativa";
  }
  if (segment.includes("renda urbana")) return "renda urbana";
  if (
    segment.includes("titulo") ||
    segment.includes("valor mobiliario") ||
    segment.includes("recebive") ||
    segment.includes("multicategoria")
  ) {
    return "multicategoria";
  }
  return segment;
}

function displayName(value) {
  if (!value) return "";
  if (value === "fof") return "FOF";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isSpecificSegment(segment) {
  return Boolean(segment && segment !== "multicategoria");
}

export function normalizeFundClassification(fund = {}, fallbackCatalog = []) {
  const resolved = fund.classification || fund;
  const fallback = Array.isArray(fallbackCatalog)
    ? fallbackCatalog.find((item) => item.ticker === fund.ticker) || {}
    : fallbackCatalog || {};
  const type =
    normalizedType(resolved.type || resolved.segmentType || resolved.fundType) ||
    normalizedType(fallback.segmentType || fallback.fundType || fallback.type);
  const primarySegment = normalizedSegment(
    resolved.segment || resolved.segmentoAtuacao,
  );
  const fallbackSegment = normalizedSegment(
    fallback.segmentoAtuacao || fallback.segment,
  );
  const segment = isSpecificSegment(primarySegment)
    ? primarySegment
    : isSpecificSegment(fallbackSegment)
      ? fallbackSegment
      : primarySegment || fallbackSegment || (type ? "multicategoria" : "");

  return {
    type,
    segment,
    label: [displayName(type), displayName(segment)].filter(Boolean).join(" - "),
  };
}
