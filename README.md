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

Checkpoint: fluxos e e-mails validados em 2026-06-25.
Checkpoint: Admin e ajustes validados em 2026-06-25.
Checkpoint: BRAPI conectada em 2026-06-25.
Checkpoint: 
Regra visual:
Não alterar o padrão da fonte do FII Select.

A fonte global do site é Roboto Slab.
Manter Roboto Slab aplicada em todas as páginas, incluindo Home, Cadastro, Login, Assinar, Status, Conta, Ferramenta e Admin.

Não substituir por system-ui, Arial, Inter, Helvetica, sans-serif ou outra fonte.

Manter o carregamento da fonte funcionando via Google Fonts:
- fonts.googleapis.com
- fonts.gstatic.com

Não alterar o CSP de fontes sem validar que Roboto Slab continua carregando corretamente. Em 2026-06-26.

## Endpoint de manutenção

Criar futuramente um endpoint interno de manutenção para diagnóstico operacional do FII Select.

Objetivo:
Permitir checagens controladas do sistema sem alterar a lógica validada do fluxo.

Escopo inicial do endpoint:
- verificar status do servidor
- verificar se variáveis essenciais estão configuradas, sem expor valores
- verificar conexão com BRAPI
- verificar disponibilidade básica da Brevo, sem disparar e-mails reais
- verificar se o arquivo de usuários está acessível pelo backend
- verificar contagem/estado operacional relevante do MVP

Regras:
- não expor tokens, chaves ou senhas
- não retornar BRAPI_TOKEN, BREVO_API_KEY, ADMIN_PASSWORD ou qualquer variável sensível
- endpoint deve ser protegido
- não deve alterar usuários
- não deve alterar status
- não deve enviar e-mails
- não deve consultar dados sensíveis sem necessidade
- não deve alterar fluxo, login, cadastro, Admin, ferramenta, Brevo ou BRAPI

Possível caminho futuro:
/admin/manutencao
ou
/admin/api/maintenance

Status:
Planejado. Não implementar sem diagnóstico e aprovação.

## Endpoint futuro — Diagnóstico imobiliário e patrimonial BRAPI

**Status:** Planejado. Não implementar sem aprovação.

### Objetivo

Criar futuramente um endpoint interno protegido para diagnosticar quais dados imobiliários e patrimoniais a BRAPI entrega para cada FII.

Esse endpoint será usado para avaliar, antes de alterar a ferramenta, quais informações podem alimentar a seção:

**LEITURA CRUZADA • RENDA + PATRIMÔNIO**

### Escopo esperado

- consultar dados de imóveis
- consultar vacância consolidada
- consultar vacância por imóvel, se disponível
- consultar área dos imóveis
- verificar se o campo de área pode ser tratado como ABL ou apenas como área declarada
- consultar participação da receita por imóvel
- consultar inadimplência, se disponível
- consultar composição patrimonial
- consultar patrimônio líquido
- consultar VP por cota
- consultar P/VP
- consultar dividendos históricos, se forem úteis para leitura contextual

### Regra sobre ABL

ABL significa Área Bruta Locável.

Só chamar o campo da BRAPI de ABL se estiver claro que o campo `area` representa Área Bruta Locável.

Se a semântica não estiver confirmada, usar o termo **“área declarada”**.

Não inferir ABL automaticamente.

### Regra sobre vacância

- usar vacância consolidada se vier da BRAPI
- usar vacância por imóvel se vier da BRAPI
- não separar vacância física e financeira se a API não entregar campos separados
- não inventar dados

### Regra sobre CDI

CDI fica para uma etapa futura.

Nesta etapa:

- não trabalhar relação do fundo com CDI
- não exibir comparação com CDI na ferramenta
- não alterar cálculo por causa do CDI

### Sugestão de rota futura

`GET /admin/api/maintenance/brapi-real-estate-diagnostic?ticker=JSRE11`

A rota deve:

- ser protegida pelo mesmo Basic Auth do Admin
- aceitar qualquer ticker válido por query string
- usar JSRE11 apenas como ticker padrão de teste
- não expor `BRAPI_TOKEN`
- não expor `BREVO_API_KEY`
- não expor `ADMIN_PASSWORD`
- não enviar dados de usuários para a BRAPI
- não enviar e-mail, status, plano ou dados administrativos para a BRAPI
- enviar apenas o ticker necessário
- retornar diagnóstico sanitizado

### Fundos sugeridos para diagnóstico futuro

- JSRE11 — laje corporativa/multicategoria
- HGLG11 — logística
- XPML11 ou VISC11 — shopping
- KNCR11 — papel
- MXRF11 — papel/híbrido

### Arquivos de uma implementação futura

Poderão ser alterados:

- `server.mjs`
- `README.md`
- eventualmente `lib/brapi-real-estate-diagnostic.mjs`, se for criado módulo isolado

Não deverão ser alterados nessa etapa:

- `public/ferramenta.html`
- `public/app.js`
- fluxo de cadastro
- login
- Admin visual
- e-mails
- Brevo
- PagBank
- cálculo de valuation
