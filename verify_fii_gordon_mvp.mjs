import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const file = "/Users/imac/Documents/Codex/2026-05-29/files-mentioned-by-the-user-fii/outputs/fii-select-mvp/FII_Select_MVP_Valuation_Gordon.xlsx";
const previewDir = "/Users/imac/Documents/Codex/2026-05-29/files-mentioned-by-the-user-fii/outputs/fii-select-mvp/previews";
const blob = await FileBlob.load(file);
const wb = await SpreadsheetFile.importXlsx(blob);

for (const [range, label] of [
  ["Visao Geral!A1:H20", "dashboard"],
  ["Base Manual!A1:P8", "base"],
  ["Cartao Instagram!A1:F15", "cartao"],
  ["Premissas!A1:F12", "premissas"],
  ["Checks!A1:F10", "checks"],
  ["Fontes!A1:E11", "fontes"],
]) {
  const report = await wb.inspect({ kind: "table", range, include: "values,formulas", tableMaxRows: 24, tableMaxCols: 16 });
  console.log(`--- ${label} ---`);
  console.log(report.ndjson);
}

const errors = await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula errors",
});
console.log("--- formula errors ---");
console.log(errors.ndjson);

await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range, name] of [
  ["Visao Geral", "A1:H20", "01-visao-geral.png"],
  ["Base Manual", "A1:P10", "02-base-manual.png"],
  ["Cartao Instagram", "A1:F15", "03-cartao-instagram.png"],
  ["Premissas", "A1:F12", "04-premissas.png"],
  ["Checks", "A1:F10", "05-checks.png"],
  ["Fontes", "A1:E11", "06-fontes.png"],
]) {
  const preview = await wb.render({ sheetName, range, scale: 1 });
  await fs.writeFile(`${previewDir}/${name}`, Buffer.from(await preview.arrayBuffer()));
}
console.log(`PREVIEWS ${previewDir}`);
