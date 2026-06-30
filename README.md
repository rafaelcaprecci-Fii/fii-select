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

## Checkpoint — BRAPI, manutenção e leitura cruzada por tipo de fundo

**Data:** 2026-06-27

**Status:** Validado e preservado.

### Resumo

Desde o último checkpoint, foram validados ajustes técnicos e decisões de produto relacionados ao endpoint interno de manutenção BRAPI, diagnóstico de dados estruturados e futura evolução da seção “Leitura cruzada — Renda + Patrimônio”.

### 1. Endpoint interno de manutenção BRAPI

Foi criado e validado o endpoint interno protegido:

`GET /admin/api/maintenance/brapi-fii-diagnostic?ticker=JSRE11`

Características validadas:

- protegido pelo mesmo Basic Auth do Admin
- retorna `401` sem credenciais
- aceita `?ticker=`
- aceita `?Ticker=`
- usa JSRE11 como ticker padrão
- permite consultar qualquer ticker válido
- não expõe `BRAPI_TOKEN`
- não expõe `BREVO_API_KEY`
- não expõe `ADMIN_PASSWORD`
- não envia dados de usuários para a BRAPI
- não envia e-mail, status, plano ou dados administrativos para a BRAPI
- envia apenas o ticker necessário, ou `cdi` na consulta macroeconômica
- retorna diagnóstico sanitizado
- erros externos são sanitizados

Endpoints consultados pelo diagnóstico:

- indicators
- properties
- portfolio
- reports
- dividends
- quote
- cdi

Validações realizadas:

- sem autenticação: `401`
- ticker inválido: `400`
- token ausente: `503`
- `?Ticker=` aceito
- sintaxe e diff válidos
- nenhuma credencial exposta
- nenhum fluxo alterado
- ferramenta, frontend, Admin visual, login, cadastro, e-mails, Brevo, PagBank e cálculo não foram alterados

### 2. Testes reais realizados

Foram testados dados reais via endpoint interno de manutenção para:

- JSRE11
- HGLG11
- XPML11
- KNCR11

Conclusão:

A BRAPI entrega dados estruturados úteis para enriquecer a leitura de fundamentos antes da leitura de ágio/deságio, especialmente para fundos de tijolo e parcialmente para fundos de papel.

### 3. Decisão de nomenclatura

Em textos visíveis ao usuário, evitar mencionar “BRAPI”.

Usar:

- “dados de uma API de mercado confiável”
- “dados de mercado estruturados”
- “base estruturada”

### 4. Decisão sobre CDI

CDI fica para próxima etapa.

Nesta etapa:

- não trabalhar relação do fundo com CDI
- não exibir comparação com CDI na ferramenta
- não alterar cálculo por causa do CDI

Mesmo que o endpoint consulte CDI, ele não deve entrar agora na leitura cruzada da interface.

### 5. Leitura cruzada — Renda + Patrimônio

A seção “Leitura cruzada — Renda + Patrimônio” deve apresentar fundamentos do fundo antes da leitura de:

- valor justo
- ágio/deságio
- leitura de preço

Ordem conceitual aprovada:

1. Fundamentos do fundo
2. Leitura patrimonial
3. Leitura de renda
4. Leitura de preço
5. Valor justo / ágio ou deságio

### 6. Campos comuns para todos os fundos

Todos os tipos de fundos devem tentar exibir:

- tipo e segmento
- patrimônio líquido
- ativos totais
- passivos totais
- VP por cota
- P/VP
- taxa de alavancagem, quando calculável
- histórico de rendimentos
- data de referência
- aviso quando um dado não estiver disponível

### 7. Taxa de alavancagem

A taxa de alavancagem deve ser incluída em todos os tipos de fundos, quando houver dados suficientes.

Fórmulas:

- Alavancagem sobre patrimônio = `totalLiabilities / equity`
- Passivos sobre ativos = `totalLiabilities / totalAssets`

Regras:

- calcular apenas quando os valores forem numéricos, positivos e de períodos compatíveis
- `totalLiabilities` pode vir de reports
- `equity` e `totalAssets` podem vir de indicators ou reports
- conferir data de referência antes da divisão
- não inventar alavancagem se os dados não estiverem disponíveis

Texto de cautela:

> Taxa de alavancagem não disponível na base estruturada. Recomendamos avaliar o relatório gerencial do fundo.

### 8. Fundos de tijolo

A leitura cruzada de fundos de tijolo deve priorizar:

- imóveis
- quantidade de imóveis
- área declarada
- vacância consolidada
- vacância por imóvel
- inadimplência por imóvel
- participação da receita por imóvel
- composição patrimonial
- taxa de alavancagem
- patrimônio líquido
- VP por cota
- P/VP
- histórico de rendimentos

#### Regra sobre área/ABL

ABL significa Área Bruta Locável.

Só chamar o campo da BRAPI de ABL se estiver claro que o campo `area` representa Área Bruta Locável.

Se a semântica não estiver confirmada, usar “área declarada”.

Não inferir ABL automaticamente.

#### Regra sobre imóveis

Quando o fundo tiver mais de 10 imóveis, citar apenas os 5 imóveis mais importantes.

Critério preferencial:

- maior participação da receita por imóvel

Não listar todos os imóveis na interface.

#### Regra sobre vacância

Campos como vacância precisam passar por validação de consistência antes de virar texto final.

Se a vacância vier inconsistente, muito alta, zerada de forma suspeita ou sem semântica confiável:

- não transformar em conclusão direta
- não usar como alerta definitivo
- mostrar nota de cautela
- usar o texto: “Recomendamos avaliar o relatório gerencial do fundo.”

Não separar vacância física e vacância financeira se a API não entregar campos distintos.

### 9. Fundos de papel

Para fundos de papel, não exibir:

- leitura de imóveis
- área declarada
- vacância consolidada
- vacância por imóvel
- inadimplência por imóvel
- participação da receita por imóvel

Para fundos de papel, exibir:

- taxa de alavancagem
- taxa de inadimplência de dívidas/créditos, se disponível
- composição patrimonial
- quantidade de CRIs
- quantidade de LCIs
- títulos públicos
- cotas de FIIs, se houver
- patrimônio líquido
- ativos totais
- passivos totais
- VP por cota
- P/VP
- histórico de rendimentos

Se a taxa de inadimplência de dívidas/créditos não estiver disponível, não inventar dado.

Usar o texto:

> Taxa de inadimplência de dívidas/créditos não disponível na base estruturada. Recomendamos avaliar o relatório gerencial do fundo.

Decisão técnica:

Não criar endpoint separado para fundos de papel agora.

Pendência criada:

Criar lógica/adaptador interno para fundos de papel, usando o endpoint atual.

Nome sugerido:

`paperFundAdapter`

Objetivo: normalizar a leitura de fundos de papel com:

- common
- type
- typeSpecific
- dataQuality
- cautions

### 10. FOFs

FOFs devem ser tratados com cautela no MVP.

A base estruturada pode ajudar, mas FOF é complexo porque depende:

- dos fundos investidos
- da concentração da carteira
- da estratégia da gestão
- do giro da carteira
- do desconto/prêmio dos fundos investidos
- dos segmentos internos da carteira

Regra aprovada:

Para FOFs, mostrar apenas dados comuns disponíveis e recomendar relatório gerencial.

Texto:

> Este fundo possui característica de FOF. A análise da carteira exige avaliação dos fundos investidos, concentração, estratégia da gestão e mudanças recentes de alocação. Recomendamos avaliar o relatório gerencial do fundo.

### 11. Fiagros

Fiagros devem ser tratados com cautela no MVP.

Motivo: Fiagro é uma classe mais recente e pode envolver:

- recebíveis agrícolas
- CRAs
- garantias
- devedores
- imóveis rurais
- arrendamentos
- riscos específicos do agronegócio

Regra aprovada:

Para Fiagros, mostrar apenas dados comuns disponíveis e recomendar relatório gerencial.

Texto:

> Este fundo possui característica de Fiagro. A análise exige atenção a recebíveis agrícolas, garantias, devedores, indexadores, riscos do agronegócio e estrutura da carteira. Recomendamos avaliar o relatório gerencial do fundo.

### 12. Fundos híbridos

Para fundos híbridos, a leitura deve ser condicional conforme a composição efetivamente retornada.

Se houver imóveis:

- usar parte da leitura de tijolo

Se houver CRIs/LCIs/títulos:

- usar parte da leitura de papel

Se houver FIIs investidos:

- usar parte da leitura de FOF

Não forçar uma leitura única.

### 13. Arquitetura recomendada

Manter um único endpoint com saída normalizada:

- common
- type
- typeSpecific
- dataQuality
- cautions

Internamente, usar adaptadores por categoria:

- `brickFundAdapter`
- `paperFundAdapter`
- `hybridFundAdapter`
- `fofFundAdapter`, com cautela
- `fiagroFundAdapter`, com cautela ou etapa futura

Somente Fiagro pode exigir consulta a família diferente de endpoints futuramente, mas isso não justifica rota pública separada neste momento.

### 14. Arquivos futuros prováveis

Em implementação futura, poderão ser alterados:

- `server.mjs`
- possível `lib/crossed-reading.mjs`
- possível `lib/brapi-fund-adapters.mjs`
- testes do normalizador
- `public/ferramenta.html` e `public/app.js` somente após aprovação da interface

### 15. Pendências criadas

Pendências atuais relacionadas:

- normalizar leitura cruzada por tipo de fundo
- criar adapter para fundos de tijolo
- criar adapter para fundos de papel
- criar validação de consistência para vacância
- incluir taxa de alavancagem em todos os fundos
- só depois mexer na interface da ferramenta

### 16. Preservação obrigatória

Continuam validados e não devem ser alterados:

- Fluxo Plano Fundador
- Fluxo Teste Grátis
- E-mails Brevo completos
- Links corretos dos e-mails
- PagBank ativo
- Conta inativa/arquivada funcionando
- Sincronização com Admin
- Detalhes do cliente no Admin
- `BRAPI_TOKEN` conectado
- Ferramenta retornando dados reais de FIIs
- Endpoint interno de manutenção BRAPI criado e validado
- Login
- Cadastro
- Admin
- Acesso à ferramenta
- Brevo
- BRAPI
- Links e redirecionamentos principais
- Padrão de fonte Roboto Slab global
- CSP liberando Google Fonts
- `/area-cliente.html` não deve ser usado
- Correção do português já aplicada
- Fluxo completo de acesso do usuário validado
- Integração geral entre front-end e back-end validada
- Estrutura atual da ferramenta funcionando corretamente

## Checkpoint: Redesign visual da ferramenta — protótipo criado

O protótipo visual da nova ferramenta foi criado em
`prototypes/ferramenta-redesign.html`.

- O protótipo serve apenas como referência visual.
- O protótipo não está conectado à aplicação.
- O protótipo não deve ser usado em produção.
- A ferramenta real continua em `public/ferramenta.html` e `public/app.js`.
- O redesign ainda não foi aplicado à ferramenta real.
- A ferramenta atual continua intacta e funcional.
- O redesign deverá ser aplicado em etapas, sem substituir o HTML inteiro.

### Estado validado

- Fluxo Plano Fundador funcionando
- Fluxo Teste Grátis funcionando
- E-mails Brevo completos e com links corretos
- PagBank ativo
- Conta inativa e arquivada funcionando
- Sincronização e detalhes do cliente no Admin funcionando
- `BRAPI_TOKEN` conectado
- Ferramenta retornando dados reais de FIIs
- Endpoint interno de manutenção BRAPI criado e validado
- Leitura cruzada exibida corretamente
- Segmentação visual no padrão “Tipo - Segmento”
- Gestora não utilizada como segmentação principal
- Mensagem institucional e educacional no rodapé da leitura cruzada

### Ordem segura de aplicação

1. Registrar o protótipo no Git.
2. Extrair tokens visuais e CSS.
3. Aplicar a aparência ao HTML atual preservando os IDs.
4. Ajustar o HTML seção por seção.
5. Adaptar templates dinâmicos somente se necessário.
6. Validar busca, valuation, leitura cruzada, recorrência e comparáveis.
7. Testar em desktop e mobile.

### Contratos obrigatórios do JavaScript

Os seguintes IDs devem ser preservados:

- `valuation-form`
- `risk-rate`
- `risk-output`
- `growth-rate`
- `growth-output`
- `recurrence-note`
- `error`
- `api-mode`
- `fund-name`
- `fair-value`
- `reading`
- `current-price`
- `premium-discount`
- `price-to-nav`
- `patrimonial-reading`
- `nav-per-share`
- `selic`
- `required-return`
- `normalized-dividend`
- `dividends-used`
- `crossed-classification`
- `crossed-reading-grid`
- `crossed-type-specific`
- `crossed-cautions`
- `add-current`
- `shared-risk-rate`
- `shared-risk-output`
- `apply-shared-risk`
- `refresh-comparison`
- `comparison-body`
- `comparison-note`
- `suggestion-origin`
- `suggestion-note`
- `suggestion-list`

Também devem ser preservados:

- inputs `name="ticker"`, `name="riskRate"` e `name="growthRate"`
- classe `.row-risk`
- atributos `data-ticker` e `data-remove`
- submit normal do formulário
- botões de adicionar e remover fundos
- leitura automática da recorrência
- padrão de classificação “Tipo - Segmento”
- fonte Roboto Slab global

### Riscos do redesign

- Substituir o HTML integralmente pode quebrar busca, sliders e submit.
- Transformar o ticker em texto pode impedir consultas.
- Remover IDs pode quebrar chamadas de `querySelector`.
- Alterar o corpo da tabela pode quebrar remoção e taxas individuais.
- Sugestões estáticas podem perder o vínculo com `data-ticker`.
- Cards fictícios não devem mascarar dados ausentes como dados reais.
- O protótipo não deve substituir a lógica dinâmica existente.
- O CSS inline do protótipo não deve substituir a regra global da fonte Roboto Slab.

### Preservação

A aplicação futura do redesign não deve alterar:

- cálculo de valuation
- leitura cruzada
- FIIs parecidos
- segmentação “Tipo - Segmento”
- login
- cadastro
- Admin
- e-mails
- Brevo
- PagBank
- `BRAPI_TOKEN`
- fluxo
- endpoints existentes

## Checkpoint: ferramenta estabilizada — visual, adapters e linguagem

**Data:** 2026-06-30

Foi concluída uma rodada de evolução da ferramenta do FII Select envolvendo camada visual, normalização por tipo de fundo, comparáveis e revisão da linguagem educacional.

### 1. Redesign visual aplicado de forma segura

- A camada visual do redesign foi aplicada principalmente em `public/styles.css`.
- O HTML, o JavaScript público, o `server.mjs` e a lógica da ferramenta foram preservados durante essa aplicação.
- A responsividade foi validada em desktop, largura intermediária e mobile.
- Problemas de rolagem horizontal foram corrigidos.
- Busca, valuation, leitura cruzada, comparáveis, sliders e adição/remoção de fundos continuaram funcionando.
- O protótipo visual permanece como referência em `prototypes/ferramenta-redesign.html`.

### 2. Adapter para fundos de tijolo

- O `brickFundAdapter` foi consolidado em `lib/brapi-fund-adapters.mjs`.
- A estrutura `typeSpecific.brick` passou a incluir imóveis, área declarada, vacância validada, principais imóveis, indicadores de disponibilidade e cautelas.
- JSRE11, HGLG11 e XPML11 foram validados como fundos de tijolo.
- XPML11 mantém cautela quando a vacância exige validação.
- KNCR11 não recebe bloco de tijolo.

### 3. Adapter para fundos de papel

- O `paperFundAdapter` foi implementado sem alterar interface ou fluxos.
- A estrutura `typeSpecific.paper` passou a incluir CRIs, LCIs, títulos públicos, cotas de FIIs, inadimplência de crédito quando disponível e flags de qualidade.
- KNCR11 recebe apenas bloco de papel.
- JSRE11, HGLG11 e XPML11 mantêm apenas bloco de tijolo.

### 4. Padronização da classificação dos FIIs

- A classificação foi consolidada em `public/fund-classification.js`.
- Tabela, comparáveis, sugestões e leitura cruzada passaram a usar a mesma normalização.
- A gestora não participa da classificação visual.
- O padrão visual consolidado é **“Tipo - Segmento”**.
- Exemplo validado: BRCR11 → **“Tijolo - Laje corporativa”**.
- Foi eliminada a inconsistência em que um ticker poderia aparecer como “Tijolo - Multicategoria” em uma área e “Tijolo - Laje corporativa” em outra.

### 5. Comparáveis por tipo e segmento

- A lógica de FIIs comparáveis foi ajustada para priorizar fundos do mesmo tipo e segmento.
- A comparação não utiliza a gestora como critério principal.
- A ferramenta evita misturar fundos de papel com fundos de tijolo quando há dados suficientes.
- É preferível exibir menos comparáveis coerentes do que muitos comparáveis incompatíveis.

### 6. Revisão dos textos finais da ferramenta

- Foram revisados os textos de premissas, crescimento esperado dos rendimentos, recorrência dos dividendos, ágio/deságio, comparáveis, erros e avisos.
- Não foram encontrados textos visíveis com “BRAPI”.
- Não foi encontrada linguagem de recomendação de investimento.
- A mensagem institucional está presente:

> O FII Select organiza dados de mercado para fins educacionais. As informações apresentadas não representam recomendação de investimento.

### Testes e validações

- Os testes automatizados passaram ao final da rodada.
- Houve validação específica com 13 testes na etapa de classificação e textos.
- Busca, valuation, leitura cruzada, comparáveis, sliders e adição/remoção de fundos estão funcionando.
- Login, cadastro, Admin, e-mails, Brevo, PagBank e `BRAPI_TOKEN` não foram alterados nesta rodada.

### Arquivos relevantes da rodada

- `public/styles.css`
- `lib/brapi-fund-adapters.mjs`
- `lib/crossed-reading.mjs`
- `test/crossed-reading.test.mjs`
- `public/fund-classification.js`
- `public/app.js`
- `lib/fund-comparables.mjs`
- `server.mjs`
- `test/fund-comparables.test.mjs`
- `prototypes/ferramenta-redesign.html`

### Regras preservadas

- O FII Select é uma ferramenta educacional e não realiza recomendação de investimento.
- Não usar gestora como segmentação principal.
- Usar classificação visual no padrão “Tipo - Segmento”.
- Não mencionar “BRAPI” em textos visíveis ao usuário.
- Usar “dados de mercado estruturados”, “base estruturada” ou “dados de uma API de mercado confiável”.
- Não chamar área de ABL sem confirmação explícita.
- Para dados conflitantes ou incompletos, recomendar a avaliação do relatório gerencial.
- Não misturar fundos de papel e tijolo em comparáveis quando houver dados suficientes.

### Pendências após este checkpoint

- Ajustes finos de diagramação visual observados pelo usuário, sem prioridade imediata.
- Evoluir o tratamento de FOFs.
- Evoluir o tratamento de Fiagros.
- Refinar a validação de dados conflitantes por segmento.
- Criar rotina operacional de acompanhamento pós-lançamento.
- Avançar domínio, favicon, vídeo da home e go-to-market.
