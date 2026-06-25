# FII Select Widget

Widget inicial para validar o formato de conteúdo do FII Select.

## Rodar localmente

```bash
node server.mjs
```

Abra `http://localhost:4173`.

Sem token, o sandbox aceita `MXRF11` e `HGLG11`. Para ampliar a cobertura:

```bash
BRAPI_TOKEN=seu_token node server.mjs
```

## O que já é automático

- Selic meta: Banco Central, série SGS `432`.
- Dados do FII e dividendos: `brapi.dev`.
- Média dos últimos 12 rendimentos.
- Cálculo de valor justo inspirado em Gordon.

## Premissas editáveis no widget

- Taxa de risco adicional.
- Crescimento esperado dos rendimentos.
- Ajuste de recorrência dos dividendos.

## Comparador

- Compare até cinco FIIs simultaneamente.
- Aplique a mesma taxa de risco a todos ou ajuste cada fundo individualmente.
- Receba cinco sugestões de FIIs parecidos a partir do ticker consultado.
- No sandbox, `MXRF11` e `HGLG11` carregam a análise completa. As demais sugestões ficam preparadas para o token Pro.

## Limite do protótipo

É uma triagem educativa, não uma recomendação de investimento. Para publicar em produção, valide o plano
da API, os direitos de exibição e o enquadramento regulatório do conteúdo.

Force Railway redeploy - 2026-06-24
Force Railway redeploy - 2026-06-24 - 2
