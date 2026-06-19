import fs from "node:fs/promises";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "/Users/imac/Documents/Codex/2026-05-29/files-mentioned-by-the-user-fii/outputs/fii-select-mvp";
const outputPath = `${outputDir}/FII_Select_MVP_Valuation_Gordon.xlsx`;

const wb = Workbook.create();
const dashboard = wb.worksheets.add("Visao Geral");
const base = wb.worksheets.add("Base Manual");
const card = wb.worksheets.add("Cartao Instagram");
const assumptions = wb.worksheets.add("Premissas");
const checks = wb.worksheets.add("Checks");
const sources = wb.worksheets.add("Fontes");

const colors = {
  navy: "#102A43",
  blue: "#1D4ED8",
  teal: "#0F766E",
  paleBlue: "#EAF2FF",
  paleTeal: "#E6F6F3",
  paleYellow: "#FFF7CC",
  paleGreen: "#E7F6EC",
  paleRed: "#FDECEC",
  lightGray: "#F3F6F9",
  midGray: "#D9E2EC",
  dark: "#243B53",
  white: "#FFFFFF",
  inputBlue: "#0000FF",
  greenLink: "#008000",
};

const currency = 'R$ #,##0.00';
const percent = '0.0%;[Red](0.0%);-';

function setTitle(sheet, range, title, subtitle) {
  sheet.mergeCells(range);
  const cell = sheet.getRange(range.split(":")[0]);
  cell.values = [[title]];
  cell.format = {
    fill: colors.navy,
    font: { color: colors.white, bold: true, size: 16 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
  sheet.getRange(range).format.rowHeight = 30;
  if (subtitle) {
    const row = Number(range.match(/\d+/)[0]) + 1;
    const startCol = range.split(":")[0].replace(/\d+/g, "");
    const endCol = range.split(":")[1].replace(/\d+/g, "");
    sheet.mergeCells(`${startCol}${row}:${endCol}${row}`);
    const sub = sheet.getRange(`${startCol}${row}`);
    sub.values = [[subtitle]];
    sub.format = {
      fill: colors.paleBlue,
      font: { color: colors.dark, italic: true, size: 10 },
      horizontalAlignment: "center",
      verticalAlignment: "center",
      wrapText: true,
    };
    sheet.getRange(`${startCol}${row}:${endCol}${row}`).format.rowHeight = 27;
  }
}

function styleHeader(range) {
  range.format = {
    fill: colors.navy,
    font: { color: colors.white, bold: true, size: 10 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { style: "continuous", color: colors.midGray },
  };
}

function styleSection(range) {
  range.format = {
    fill: colors.teal,
    font: { color: colors.white, bold: true, size: 11 },
    verticalAlignment: "center",
  };
}

function body(range) {
  range.format = {
    font: { color: colors.dark, size: 10 },
    verticalAlignment: "center",
    borders: { style: "continuous", color: colors.midGray },
  };
}

for (const sheet of [dashboard, base, card, assumptions, checks, sources]) {
  sheet.showGridLines = false;
}

// Premissas
setTitle(assumptions, "A1:F1", "FII Select | Premissas do MVP", "Inputs editaveis em azul. Use a planilha como triagem educativa, nao como recomendacao individual.");
assumptions.getRange("A4:B12").values = [
  ["Premissa", "Valor"],
  ["Selic meta (% a.a.)", 0.145],
  ["Taxa de risco adicional padrao (% a.a.)", 0.025],
  ["Crescimento nominal padrao g (% a.a.)", 0.03],
  ["Ajuste de recorrencia padrao", 0.95],
  ["Limite desagio relevante", -0.05],
  ["Limite agio relevante", 0.05],
  ["Data-base da Selic", "30/04/2026"],
  ["Convencao", "Valor justo = D1 / (k - g)"],
];
styleHeader(assumptions.getRange("A4:B4"));
body(assumptions.getRange("A5:B12"));
assumptions.getRange("B5:B11").format.font = { color: colors.inputBlue };
assumptions.getRange("B5:B10").format.numberFormat = percent;
assumptions.getRange("D4:F4").values = [["Como interpretar", "", ""]];
assumptions.mergeCells("D4:F4");
styleSection(assumptions.getRange("D4:F4"));
assumptions.getRange("D5:F10").values = [
  ["1. O dividendo normalizado reduz eventos nao recorrentes.", "", ""],
  ["2. k = Selic + taxa de risco adicional especifica do fundo.", "", ""],
  ["3. g deve ser conservador e sempre menor que k.", "", ""],
  ["4. O resultado e uma faixa de triagem, nao uma promessa de retorno.", "", ""],
  ["5. Para FIIs de papel, tijolo e FoFs, use premios de risco diferentes.", "", ""],
  ["6. Antes de publicar, confira relatorio gerencial, fatos relevantes e fonte da cotacao.", "", ""],
];
for (let r = 5; r <= 10; r++) assumptions.mergeCells(`D${r}:F${r}`);
body(assumptions.getRange("D5:F10"));
assumptions.getRange("D5:F10").format.wrapText = true;
assumptions.getRange("D5:F10").format.rowHeight = 28;
assumptions.getRange("A:A").format.columnWidth = 34;
assumptions.getRange("B:B").format.columnWidth = 22;
assumptions.getRange("C:C").format.columnWidth = 3;
assumptions.getRange("D:F").format.columnWidth = 25;

// Base manual
setTitle(base, "A1:P1", "FII Select | Base Manual de Triagem", "Preencha os campos azuis. As colunas calculadas estimam agio ou desagio pela renda normalizada.");
base.getRange("A4:P4").values = [[
  "Ticker", "Segmento", "Preco atual (R$/cota)", "Dividendo medio mensal 12m (R$/cota)", "Ajuste recorrencia",
  "Dividendo normalizado mensal (R$/cota)", "Selic", "Taxa de risco adicional", "Crescimento g",
  "Retorno exigido k", "Dividendo proximos 12m D1 (R$/cota)", "Valor justo (R$/cota)", "Agio / (desagio)",
  "Retorno implicito", "Leitura", "Fonte / nota"
]];
styleHeader(base.getRange("A4:P4"));
base.getRange("A5:P24").values = Array.from({ length: 20 }, (_, idx) => {
  if (idx === 0) {
    return ["DEMO11", "Exemplo ficticio", 100, 1.05, 0.95, null, null, 0.025, 0.03, null, null, null, null, null, null, "Exemplo didatico. Substituir antes de publicar."];
  }
  return [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
});
body(base.getRange("A5:P24"));
base.getRange("F5:F24").formulas = Array.from({ length: 20 }, (_, i) => [`=IF(A${i + 5}="","",ROUND(D${i + 5}*E${i + 5},4))`]);
base.getRange("G5:G24").formulas = Array.from({ length: 20 }, (_, i) => [`=IF(A${i + 5}="","",Premissas!$B$5)`]);
base.getRange("J5:J24").formulas = Array.from({ length: 20 }, (_, i) => [`=IF(A${i + 5}="","",G${i + 5}+H${i + 5})`]);
base.getRange("K5:K24").formulas = Array.from({ length: 20 }, (_, i) => [`=IF(A${i + 5}="","",ROUND(F${i + 5}*12*(1+I${i + 5}),4))`]);
base.getRange("L5:L24").formulas = Array.from({ length: 20 }, (_, i) => [`=IF(A${i + 5}="","",IF(J${i + 5}<=I${i + 5},"REVISAR",ROUND(K${i + 5}/(J${i + 5}-I${i + 5}),2)))`]);
base.getRange("M5:M24").formulas = Array.from({ length: 20 }, (_, i) => [`=IF(OR(A${i + 5}="",NOT(ISNUMBER(L${i + 5}))),"",ROUND(C${i + 5}/L${i + 5}-1,4))`]);
base.getRange("N5:N24").formulas = Array.from({ length: 20 }, (_, i) => [`=IF(A${i + 5}="","",ROUND(K${i + 5}/C${i + 5}+I${i + 5},4))`]);
base.getRange("O5:O24").formulas = Array.from({ length: 20 }, (_, i) => [`=IF(M${i + 5}="","",IF(M${i + 5}<Premissas!$B$9,"DESAGIO",IF(M${i + 5}>Premissas!$B$10,"AGIO","PROXIMO DO JUSTO")))`]);
base.getRange("C5:D24").format.numberFormat = currency;
base.getRange("F5:F24").format.numberFormat = currency;
base.getRange("G5:J24").format.numberFormat = percent;
base.getRange("K5:L24").format.numberFormat = currency;
base.getRange("M5:N24").format.numberFormat = percent;
base.getRange("A5:E24").format.font = { color: colors.inputBlue };
base.getRange("H5:I24").format.font = { color: colors.inputBlue };
base.getRange("P5:P24").format.font = { color: colors.inputBlue };
base.getRange("F5:G24").format.font = { color: colors.greenLink };
base.getRange("J5:O24").format.font = { color: "#000000" };
base.getRange("A5:P24").conditionalFormats.addCustom('=$O5="DESAGIO"', { fill: colors.paleGreen });
base.getRange("A5:P24").conditionalFormats.addCustom('=$O5="AGIO"', { fill: colors.paleRed });
base.getRange("A5:P24").conditionalFormats.addCustom('=$O5="PROXIMO DO JUSTO"', { fill: colors.paleYellow });
base.freezePanes.freezeRows(4);
const widths = [13, 19, 14, 18, 15, 19, 11, 15, 14, 16, 20, 14, 15, 15, 18, 43];
widths.forEach((width, i) => base.getRange(`${String.fromCharCode(65 + i)}:${String.fromCharCode(65 + i)}`).format.columnWidth = width);
base.getRange("A4:P4").format.rowHeight = 42;

// Visao geral
setTitle(dashboard, "A1:H1", "FII Select | MVP para Conteudo", "Uma triagem simples, explicavel e manual para validar o interesse da audiencia antes da API e do site.");
dashboard.getRange("A4:B4").values = [["Painel rapido", "Valor"]];
styleHeader(dashboard.getRange("A4:B4"));
dashboard.getRange("A5:B9").values = [
  ["Fundos preenchidos", null],
  ["Em desagio", null],
  ["Proximo do justo", null],
  ["Em agio", null],
  ["Status do modelo", null],
];
dashboard.getRange("B5:B9").formulas = [
  ['=COUNTIF(\'Base Manual\'!A5:A24,"<>")'],
  ['=COUNTIF(\'Base Manual\'!O5:O24,"DESAGIO")'],
  ['=COUNTIF(\'Base Manual\'!O5:O24,"PROXIMO DO JUSTO")'],
  ['=COUNTIF(\'Base Manual\'!O5:O24,"AGIO")'],
  ['=Checks!B10'],
];
body(dashboard.getRange("A5:B9"));
dashboard.getRange("D4:H4").values = [["MVP recomendado: 14 dias", "", "", "", ""]];
dashboard.mergeCells("D4:H4");
styleSection(dashboard.getRange("D4:H4"));
dashboard.getRange("D5:H10").values = [
  ["1. Escolha 5 a 10 FIIs conhecidos e preencha a base manual.", "", "", "", ""],
  ["2. Publique 3 quadros: desagio, perto do justo e agio.", "", "", "", ""],
  ["3. Explique sempre as premissas e os limites do metodo.", "", "", "", ""],
  ["4. Use enquete e comentarios para medir quais comparacoes geram interesse.", "", "", "", ""],
  ["5. Registre salvamentos, compartilhamentos e pedidos de novos tickers.", "", "", "", ""],
  ["6. So depois automatize coleta de dados e expanda o site.", "", "", "", ""],
];
for (let r = 5; r <= 10; r++) dashboard.mergeCells(`D${r}:H${r}`);
body(dashboard.getRange("D5:H10"));
dashboard.getRange("D5:H10").format.wrapText = true;
dashboard.getRange("D5:H10").format.rowHeight = 25;
dashboard.getRange("A12:H12").values = [["Formula central", "", "", "", "", "", "", ""]];
dashboard.mergeCells("A12:H12");
styleSection(dashboard.getRange("A12:H12"));
dashboard.getRange("A13:H15").values = [
  ["D1", "Dividendo normalizado dos proximos 12 meses", "", "", "", "", "", ""],
  ["k", "Retorno exigido = Selic + taxa de risco adicional", "", "", "", "", "", ""],
  ["Valor justo", "D1 / (k - g)", "", "", "", "", "", ""],
];
dashboard.mergeCells("B13:H13");
dashboard.mergeCells("B14:H14");
dashboard.mergeCells("B15:H15");
body(dashboard.getRange("A13:H15"));
dashboard.getRange("A17:H17").values = [["Aviso de uso", "", "", "", "", "", "", ""]];
dashboard.mergeCells("A17:H17");
styleSection(dashboard.getRange("A17:H17"));
dashboard.getRange("A18:H20").values = [
  ["Este material e educacional. O metodo simplifica a realidade e nao substitui a leitura dos documentos do fundo.", "", "", "", "", "", "", ""],
  ["Nao trate o ranking como recomendacao de compra ou venda. Dividendos podem variar e fundos com riscos diferentes exigem premios diferentes.", "", "", "", "", "", "", ""],
  ["Antes de monetizar analises recorrentes ou publicar indicacoes, valide o enquadramento regulatorio com profissional especializado.", "", "", "", "", "", "", ""],
];
for (let r = 18; r <= 20; r++) dashboard.mergeCells(`A${r}:H${r}`);
body(dashboard.getRange("A18:H20"));
dashboard.getRange("A18:H20").format.wrapText = true;
dashboard.getRange("A18:H20").format.rowHeight = 27;
dashboard.getRange("A:A").format.columnWidth = 25;
dashboard.getRange("B:B").format.columnWidth = 18;
dashboard.getRange("C:C").format.columnWidth = 3;
dashboard.getRange("D:H").format.columnWidth = 18;

// Cartao Instagram
setTitle(card, "A1:F1", "FII Select | Rascunho de Cartao para Instagram", "Selecione um ticker existente na base e use o quadro como roteiro para montar a arte no Figma.");
card.getRange("A4:B4").values = [["Selecione o ticker", "DEMO11"]];
styleHeader(card.getRange("A4:A4"));
card.getRange("B4").format = { fill: colors.paleYellow, font: { color: colors.inputBlue, bold: true } };
card.getRange("A6:F6").values = [["Resumo para post", "", "", "", "", ""]];
card.mergeCells("A6:F6");
styleSection(card.getRange("A6:F6"));
card.getRange("A7:B15").values = [
  ["Ticker", null],
  ["Segmento", null],
  ["Preco observado (R$/cota)", null],
  ["Dividendo normalizado mensal (R$/cota)", null],
  ["Taxa de risco adicional", null],
  ["Retorno exigido", null],
  ["Valor justo estimado (R$/cota)", null],
  ["Agio / (desagio)", null],
  ["Leitura", null],
];
card.getRange("B7:B15").formulas = [
  ['=IFERROR(INDEX(\'Base Manual\'!A5:A24,MATCH($B$4,\'Base Manual\'!A5:A24,0)),"Ticker nao encontrado")'],
  ['=IFERROR(INDEX(\'Base Manual\'!B5:B24,MATCH($B$4,\'Base Manual\'!A5:A24,0)),"")'],
  ['=IFERROR(INDEX(\'Base Manual\'!C5:C24,MATCH($B$4,\'Base Manual\'!A5:A24,0)),"")'],
  ['=IFERROR(INDEX(\'Base Manual\'!F5:F24,MATCH($B$4,\'Base Manual\'!A5:A24,0)),"")'],
  ['=IFERROR(INDEX(\'Base Manual\'!H5:H24,MATCH($B$4,\'Base Manual\'!A5:A24,0)),"")'],
  ['=IFERROR(INDEX(\'Base Manual\'!J5:J24,MATCH($B$4,\'Base Manual\'!A5:A24,0)),"")'],
  ['=IFERROR(INDEX(\'Base Manual\'!L5:L24,MATCH($B$4,\'Base Manual\'!A5:A24,0)),"")'],
  ['=IFERROR(INDEX(\'Base Manual\'!M5:M24,MATCH($B$4,\'Base Manual\'!A5:A24,0)),"")'],
  ['=IFERROR(INDEX(\'Base Manual\'!O5:O24,MATCH($B$4,\'Base Manual\'!A5:A24,0)),"")'],
];
body(card.getRange("A7:B15"));
card.getRange("B9:B10").format.numberFormat = currency;
card.getRange("B11:B12").format.numberFormat = percent;
card.getRange("B13").format.numberFormat = currency;
card.getRange("B14").format.numberFormat = percent;
card.getRange("D7:F7").values = [["Legenda sugerida", "", ""]];
card.mergeCells("D7:F7");
styleSection(card.getRange("D7:F7"));
card.getRange("D8:F15").values = [
  ["Estimativa educativa baseada em renda normalizada.", "", ""],
  ["Nao basta olhar dividend yield: o premio de risco muda o valor justo.", "", ""],
  ["Metodo: D1 / (k - g).", "", ""],
  ["k = Selic + taxa de risco adicional do fundo.", "", ""],
  ["Premissas visiveis no carrossel.", "", ""],
  ["Nao e recomendacao de compra ou venda.", "", ""],
  ["Leia relatorio gerencial e fatos relevantes.", "", ""],
  ["Fonte dos dados: informe no post antes da publicacao.", "", ""],
];
for (let r = 8; r <= 15; r++) card.mergeCells(`D${r}:F${r}`);
body(card.getRange("D8:F15"));
card.getRange("D8:F15").format.wrapText = true;
card.getRange("D8:F15").format.rowHeight = 23;
card.getRange("A:A").format.columnWidth = 31;
card.getRange("B:B").format.columnWidth = 22;
card.getRange("C:C").format.columnWidth = 3;
card.getRange("D:F").format.columnWidth = 22;

// Checks
setTitle(checks, "A1:F1", "FII Select | Verificacoes", "Cada linha testa um ponto basico antes de utilizar o resultado em conteudo.");
checks.getRange("A4:F4").values = [["Teste", "Status", "Atual", "Esperado", "Diferenca", "Observacao"]];
styleHeader(checks.getRange("A4:F4"));
checks.getRange("A5:F10").values = [
  ["Ha pelo menos um ticker preenchido", null, null, "> 0", null, "Preencha a Base Manual."],
  ["DEMO11: k > g", null, null, "VERDADEIRO", null, "Gordon nao funciona quando k <= g."],
  ["DEMO11: valor justo positivo", null, null, "> 0", null, "Revise dividendos e taxas se falhar."],
  ["DEMO11: formula de valor justo confere", null, null, 0, null, "Diferenca tolerada abaixo de R$ 0,01."],
  ["DEMO11: leitura calculada", null, null, "Preenchida", null, "A leitura depende do agio/desagio."],
  ["STATUS GERAL", null, null, "OK", null, "Use apenas quando todos os testes estiverem OK."],
];
checks.getRange("C5:C9").formulas = [
  ['=COUNTIF(\'Base Manual\'!A5:A24,"<>")'],
  ['=\'Base Manual\'!J5>\'Base Manual\'!I5'],
  ['=IF(ISNUMBER(\'Base Manual\'!L5),\'Base Manual\'!L5,0)'],
  ['=IF(ISNUMBER(\'Base Manual\'!L5),\'Base Manual\'!L5-(\'Base Manual\'!K5/(\'Base Manual\'!J5-\'Base Manual\'!I5)),999)'],
  ['=\'Base Manual\'!O5'],
];
checks.getRange("B5:B9").formulas = [
  ['=IF(C5>0,"OK","REVISAR")'],
  ['=IF(C6=TRUE,"OK","REVISAR")'],
  ['=IF(C7>0,"OK","REVISAR")'],
  ['=IF(ABS(C8)<0.01,"OK","REVISAR")'],
  ['=IF(C9<>"","OK","REVISAR")'],
];
checks.getRange("B10").formulas = [['=IF(COUNTIF(B5:B9,"REVISAR")=0,"OK","REVISAR")']];
body(checks.getRange("A5:F10"));
checks.getRange("B5:B10").conditionalFormats.addCustom('=B5="OK"', { fill: colors.paleGreen });
checks.getRange("B5:B10").conditionalFormats.addCustom('=B5="REVISAR"', { fill: colors.paleRed });
checks.getRange("C7:C8").format.numberFormat = currency;
checks.getRange("A:A").format.columnWidth = 39;
checks.getRange("B:B").format.columnWidth = 14;
checks.getRange("C:E").format.columnWidth = 16;
checks.getRange("F:F").format.columnWidth = 47;

// Fontes
setTitle(sources, "A1:E1", "FII Select | Fontes e Notas", "Use fontes oficiais e registre a origem dos dados antes de publicar.");
sources.getRange("A4:E4").values = [["Item", "Valor / uso", "Data-base", "Fonte", "Nota"]];
styleHeader(sources.getRange("A4:E4"));
sources.getRange("A5:E10").values = [
  ["Selic meta", "14,50% a.a.", "30/04/2026", "https://www.bcb.gov.br/controleinflacao/historicotaxasjuros", "Meta definida pelo Copom. Atualize quando houver nova reuniao."],
  ["Definicao de FII", "Referencia institucional", "Consulta em 29/05/2026", "https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/fundos-de-investimento-imobiliario-fii.htm", "Pagina da B3 sobre FIIs."],
  ["Atividade de analista", "Cautela regulatoria", "Texto consolidado consultado em 29/05/2026", "https://conteudo.cvm.gov.br/legislacao/resolucoes/resol020.html", "A Resolucao CVM 20 disciplina a atividade de analista de valores mobiliarios."],
  ["Influenciadores e recomendacoes", "Cautela regulatoria", "Atualizado em 09/04/2025", "https://www.gov.br/cvm/pt-br/assuntos/noticias/2020/area-tecnica-da-cvm-esclarece-duvidas-sobre-atuacao-de-influenciadores-que-recomendam-investimentos-dddc1973876d4cc78c734b8ceeaaa740", "Avisos genericos nao afastam automaticamente eventual caracterizacao da atividade."],
  ["Deck original", "Posicionamento do projeto", "Arquivo fornecido pelo usuario", "FII SELECT_SLigaventutre.pdf", "Proposta: transformar dados dispersos em decisao estruturada."],
  ["Dados por fundo", "Preencher manualmente no MVP", "Atualizar antes de cada post", "Relatorio gerencial, fatos relevantes e fonte da cotacao", "Registre a fonte exata na coluna Fonte / nota da Base Manual."],
];
sources.getRange("A11:E11").values = [[
  "Informes mensais de FII",
  "Dados abertos para automacao futura",
  "Atualizacao semanal",
  "https://dados.cvm.gov.br/dataset/fii-doc-inf_mensal",
  "Base oficial para documentos estruturados. Nao substitui uma fonte de cotacao de mercado."
]];
body(sources.getRange("A5:E10"));
body(sources.getRange("A11:E11"));
sources.getRange("A5:E10").format.wrapText = true;
sources.getRange("A11:E11").format.wrapText = true;
sources.getRange("A5:E10").format.rowHeight = 35;
sources.getRange("A11:E11").format.rowHeight = 35;
sources.getRange("A:A").format.columnWidth = 29;
sources.getRange("B:B").format.columnWidth = 26;
sources.getRange("C:C").format.columnWidth = 27;
sources.getRange("D:D").format.columnWidth = 78;
sources.getRange("E:E").format.columnWidth = 63;

await fs.mkdir(outputDir, { recursive: true });
const exported = await SpreadsheetFile.exportXlsx(wb);
await exported.save(outputPath);
console.log(outputPath);
