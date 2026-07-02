export const FALLBACK_APP_BASE_URL =
  "https://fii-select-fii-select-stabilization.up.railway.app";

export function getAppBaseUrl(value = process.env.APP_BASE_URL) {
  const candidate = String(value || "").trim();
  if (!candidate) return FALLBACK_APP_BASE_URL;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return FALLBACK_APP_BASE_URL;
    return url.origin;
  } catch {
    return FALLBACK_APP_BASE_URL;
  }
}

export function buildAppUrl(path, value = process.env.APP_BASE_URL) {
  return new URL(path, `${getAppBaseUrl(value)}/`).toString();
}
