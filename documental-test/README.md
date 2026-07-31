# Teste documental do FII Select

Esta pasta prepara a fundação documental para testar a leitura assistida de relatórios e informes de FIIs.

## Objetivo

O objetivo é organizar um teste controlado com seis fundos imobiliários, cobrindo lajes corporativas, logística e shopping. A estrutura permite validar o formato dos resumos documentais antes de qualquer automação ampla.

## Onde ficam os PDFs

Os PDFs reais não devem ser salvos no GitHub.

Os relatórios gerenciais, informes mensais, regulamentos, comunicados e fatos relevantes serão armazenados posteriormente no Google Drive da 2Bold.

## O que o Railway deve salvar

O Railway deve salvar apenas resumos estruturados e metadados derivados da leitura documental, nunca os PDFs brutos.

## Make

O Make será usado futuramente para detectar novos PDFs no Google Drive, validar o padrão de nomes e disparar o processamento documental quando aprovado.

## Google Sheet

Um Google Sheet será usado como índice documental, registrando ticker, competência, tipo de documento, link no Drive, status de processamento e observações operacionais.

## Padrão de nomes

Os arquivos devem seguir o padrão:

```txt
TICKER_AAAA-MM_tipo-documento_v1.pdf
```

Exemplo:

```txt
JSRE11_2026-06_relatorio-gerencial_v1.pdf
```

## Fundos do teste

- JSRE11 - Lajes
- PVBI11 - Lajes
- HGLG11 - Logística
- BTLG11 - Logística
- VISC11 - Shopping
- XPML11 - Shopping

