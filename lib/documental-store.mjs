import { randomUUID } from "node:crypto";
import { readJsonFile, writeJsonFileAtomic } from "./json-file-store.mjs";

export const DOCUMENTAL_EVENT_CLASSIFICATIONS = new Set([
  "Positivo",
  "Atenção",
  "Preocupante",
  "Neutro",
]);

export const DOCUMENTAL_EVENT_TYPES = new Set([
  "Locação",
  "Vacância",
  "Rendimento",
  "Alavancagem",
  "Aquisição",
  "Venda de ativo",
  "Emissão de cotas",
  "Capex",
  "Inadimplência",
  "Mudança de estratégia",
  "Evento não recorrente",
  "Patrimônio",
  "Outro",
]);

const documentalHistoryFields = [
  "resumoMes",
  "rendimentoOrigemDy",
  "portfolioQualidadeAtivos",
  "contratosInquilinos",
  "obrasExpansoes",
  "estrategiaVsPortfolio",
  "tipoGestao",
  "estruturaCapitalAlavancagem",
  "historicoEmissoes",
  "pontosPositivos",
  "pontosAtencao",
  "eventosNaoRecorrentes",
  "dadosNaoIdentificados",
  "explicacaoFinanceiraAquisicoes",
];

const sourceFields = [
  "fonteOficialNome",
  "fonteOficialUrl",
  "fonteRegulatoriaNome",
  "fonteRegulatoriaUrl",
  "atalhoConsultaNome",
  "atalhoConsultaUrl",
  "driveFolderUrl",
];

export function normalizeDocumentalTicker(value) {
  const ticker = String(value || "").trim().toUpperCase();
  return /^[A-Z]{4}[0-9]{2}$/.test(ticker) ? ticker : "";
}

export function normalizeDocumentalCompetence(value) {
  const competence = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(competence) ? competence : "";
}

function text(value, maxLength = 5000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanStatus(value) {
  return text(value || "analisado", 80) || "analisado";
}

function cleanSources(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function requireTicker(value) {
  const ticker = normalizeDocumentalTicker(value);
  if (!ticker) throw new Error("Informe um ticker de FII no formato HGLG11.");
  return ticker;
}

function requireCompetence(value) {
  const competence = normalizeDocumentalCompetence(value);
  if (!competence) throw new Error("Informe a competência no formato AAAA-MM.");
  return competence;
}

function byCompetenceDesc(left, right) {
  return String(right.competencia || "").localeCompare(String(left.competencia || ""));
}

export async function readDocumentalHistory(filePath) {
  return readJsonFile(filePath, []);
}

export async function upsertDocumentalHistory(filePath, input, now = new Date()) {
  const ticker = requireTicker(input?.ticker);
  const competencia = requireCompetence(input?.competencia);
  const records = await readDocumentalHistory(filePath);
  const index = records.findIndex(
    (record) => normalizeDocumentalTicker(record?.ticker) === ticker
      && normalizeDocumentalCompetence(record?.competencia) === competencia,
  );
  const timestamp = now.toISOString();
  const previous = index >= 0 ? records[index] : {};
  const record = {
    id: previous.id || randomUUID(),
    ticker,
    competencia,
    segmento: text(input?.segmento, 160),
    status: cleanStatus(input?.status),
    createdAt: previous.createdAt || timestamp,
    updatedAt: timestamp,
    fontes: cleanSources(input?.fontes),
  };

  for (const field of documentalHistoryFields) {
    record[field] = text(input?.[field]);
  }

  if (index >= 0) records[index] = record;
  else records.push(record);

  await writeJsonFileAtomic(filePath, records);
  return { record, created: index < 0 };
}

export async function documentalHistoryForTicker(filePath, tickerValue) {
  const ticker = requireTicker(tickerValue);
  const records = await readDocumentalHistory(filePath);
  return records
    .filter((record) => normalizeDocumentalTicker(record?.ticker) === ticker)
    .sort(byCompetenceDesc);
}

export async function readDocumentalTimeline(filePath) {
  return readJsonFile(filePath, []);
}

export async function addDocumentalTimelineEvent(filePath, input, now = new Date()) {
  const ticker = requireTicker(input?.ticker);
  const competencia = requireCompetence(input?.competencia);
  const tipoEvento = text(input?.tipoEvento, 80);
  const classificacao = text(input?.classificacao, 80);
  if (!DOCUMENTAL_EVENT_TYPES.has(tipoEvento)) throw new Error("Tipo de evento documental inválido.");
  if (!DOCUMENTAL_EVENT_CLASSIFICATIONS.has(classificacao)) {
    throw new Error("Classificação documental inválida.");
  }

  const records = await readDocumentalTimeline(filePath);
  const record = {
    id: randomUUID(),
    ticker,
    competencia,
    tipoEvento,
    classificacao,
    titulo: text(input?.titulo, 240),
    descricao: text(input?.descricao, 5000),
    fonte: text(input?.fonte, 240),
    status: cleanStatus(input?.status),
    createdAt: now.toISOString(),
  };
  records.push(record);
  await writeJsonFileAtomic(filePath, records);
  return record;
}

export async function documentalTimelineForTicker(filePath, tickerValue) {
  const ticker = requireTicker(tickerValue);
  const records = await readDocumentalTimeline(filePath);
  return records
    .filter((record) => normalizeDocumentalTicker(record?.ticker) === ticker)
    .sort((left, right) => {
      const competence = String(right.competencia || "").localeCompare(String(left.competencia || ""));
      if (competence !== 0) return competence;
      return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
    });
}

export async function readDocumentalSources(filePath) {
  return readJsonFile(filePath, []);
}

export async function upsertDocumentalSources(filePath, input, now = new Date()) {
  const ticker = requireTicker(input?.ticker);
  const records = await readDocumentalSources(filePath);
  const index = records.findIndex((record) => normalizeDocumentalTicker(record?.ticker) === ticker);
  const previous = index >= 0 ? records[index] : {};
  const record = {
    ticker,
    updatedAt: now.toISOString(),
  };

  for (const field of sourceFields) {
    record[field] = text(input?.[field] ?? previous[field], 1000);
  }

  if (index >= 0) records[index] = record;
  else records.push(record);

  await writeJsonFileAtomic(filePath, records);
  return { record, created: index < 0 };
}

export async function documentalSourcesForTicker(filePath, tickerValue) {
  const ticker = requireTicker(tickerValue);
  const records = await readDocumentalSources(filePath);
  return records.find((record) => normalizeDocumentalTicker(record?.ticker) === ticker) || null;
}
