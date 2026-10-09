# Dashboard de Evasão — IFMG (Campus Ponte Nova)

Dashboard web para análise e visualização da **evasão e saídas** nos cursos do IFMG.
Primeira entrega: **Campus Ponte Nova**, com arquitetura já preparada para novos campi.

Reproduz o modelo do `Dashboard_Evasao_IFMG_PN_.html` e as análises do
`Relatorio_Evasao_IFMG_PN_.xlsx` a partir da planilha bruta de alunos.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Recharts 3 · lucide-react · Docker.

## Estrutura

```
etl/                 # ETL Python: modela matrículas/saídas a partir do .xlsx bruto
  processar.py       # gera dados/base_temporal.json e dados/meta.json
  validacao.py       # validação geral multi-campus + referência PN quando aplicável
  gerar_mapa.py      # gera public/geo/mapa_mg.json (malha municipal de MG em SVG)
  inspecionar.py     # lê as situações de uma planilha (etapa de mapeamento)
dados/
  brutos/*.xlsx      # entrada privada, não versionada (mesmas 99 colunas)
  incoming/*.xlsx    # staging da importação (aguardando mapeamento)
  mapeamentos.json   # mapeamento situações->saída por planilha (gerado na importação)
  geo/               # centróides dos municípios (mapa de bolhas)
  base_temporal.json # gerado pelo ETL (não versionado)
  meta.json          # gerado pelo ETL (não versionado)
src/
  app/               # layout, globals.css, /dashboard, /api/dados
  components/ui/     # card, button, badge, table, separator
  components/dashboard/  # abas, gráficos, tabelas, filtros, mapa, KPIs
  lib/dados.ts       # camada de dados (funções puras, cache por mtime)
  types/index.ts     # tipos, labels e paleta
```

## Rodar em desenvolvimento

```bash
npm install
npm run etl      # valida todos os campi e gera JSON; compara PN quando aplicável
npm run dev      # http://localhost:3060
```

## ETL (dados)

O ETL lê **todas** as planilhas de `dados/brutos/*.xlsx` (mesmo layout: aba
`Registros` com 99 colunas + aba `Filtros`), aplica o modelo temporal e grava os
JSON consumidos pelo dashboard.

```bash
python3 -m etl.processar --selftest   # equivale a `npm run etl`
```

Modelo temporal:
- **Integrados** → periodicidade anual (o 2º semestre é normalizado para o 1º).
- **Demais** → semestral.
- Cada estudante é contado em todos os períodos entre ingresso e última matrícula.
- A saída é atribuída uma única vez, ao último período do vínculo.
- Registros com ingresso posterior à última matrícula são excluídos do modelo.

O gate `etl/validacao.py` valida **todos os campi**, mesmo sem Ponte Nova:
contagens de válidos/excluídos, totais por campus/grupo/arquivo, classes de saída
e consistência dos vínculos temporais. Situações pendentes ou classes inválidas
em qualquer campus impedem a publicação. Sem mapeamento explícito, permanece
o comportamento histórico: situações desconhecidas são `nao_saida`.

A validação geral roda sempre, inclusive sem `--selftest`. Essa opção acrescenta
a comparação fixa com o relatório PN **somente quando PN está presente e nenhuma
das planilhas que o contém usa mapeamento explícito**: **1451 válidos, 2 excluídos,
Integrados 1186/132, Superiores 265/107**, além das séries por período existentes.
Um mapeamento próprio em outro campus não desativa a referência PN.

O ETL valida em memória **antes de escrever os JSON ativos**. Prepara ambos em
temporários no diretório de saída e substitui cada arquivo por rename atômico;
se a segunda troca falhar, restaura a base anterior (ou remove a primeira saída
se não havia base). Erros de leitura ou validação preservam os JSON anteriores.
Isso não é uma transação durável do par de arquivos: encerramento abrupto do
processo, falha do próprio rollback e operações concorrentes continuam exigindo
cuidado operacional. Não execute importações/reprocessamentos simultâneos.

### Adicionar outro campus

**Pela interface (assistente de 3 etapas):** na aba **Importação & base** →
**Escolher planilha (.xlsx)**:

1. **Arquivo** — o arquivo vai para staging (`dados/incoming/`).
2. **Mapeamento** — o sistema lê a coluna `Situação no Curso`, lista os valores
   distintos (com contagem) e **pré-classifica**; você ajusta quais situações
   contam como **saída**.
3. **Confirmar** — salva o mapeamento, transfere o arquivo para `dados/brutos/` e
   reprocessa o ETL. Em falha do ETL, restaura o mapeamento anterior e devolve a
   planilha ao staging para correção/reenvio. Colisão com nome já existente na base
   é rejeitada (HTTP 409), sem sobrescrever a planilha anterior: renomeie o novo
   arquivo. O campus aparece no seletor somente após sucesso.

A mesma aba lista as planilhas com botão **Mapeamento** (revisar/editar e
reprocessar) e **Excluir**, além de editar **nome de exibição** e **observação**
por campus (em `dados/config.json`). Nada entra na base antes de a etapa 2 ser
concluída.

**Pela linha de comando:** solte o `.xlsx` em `dados/brutos/` e rode `npm run etl`.

## Produção (Docker)

```bash
docker compose up -d --build
```

O Compose de produção segue o modelo do [ifeventos](https://github.com/lucianovilasboas/ifeventos/blob/main/docker-compose.yml):

- URL: `https://evasao.lucianovilasboas.com.br`.
- Rede externa existente: `proxy`.
- Traefik: entrypoint `websecure`, certresolver `letsencrypt`, serviço interno na porta `3060`.
- Nenhuma porta é publicada diretamente no host; o Traefik existente atende HTTP/HTTPS.
- O DNS do subdomínio deve apontar para o servidor do Traefik. O redirecionamento HTTP para HTTPS deve estar configurado nele, como no modelo.

O repositório e a imagem Docker **não incluem planilhas, dados de estudantes, JSON gerados ou documentos de referência**. Um clone novo abre com base vazia; importe os dados privados separadamente. Não envie esses dados ao GitHub.

O volume `./dados:/app/dados` (gravável pelo usuário `nextjs` do container) permite que o upload reprocesse os dados sem rebuild. Em um servidor Linux, verifique as permissões do volume antes da importação. Os arquivos geográficos públicos de `dados/geo/` são versionados e devem ser preservados.

**Segurança:** atualmente as rotas de upload, edição e exclusão não exigem autenticação. Configure controle de acesso na aplicação ou no proxy antes de expor o serviço publicamente com dados reais. Este Compose não adiciona autenticação nem altera o Traefik compartilhado.

### Uso local (ZeroTier/Tailscale)

O Compose anterior foi preservado em `docker-compose.dev.yml`:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

Ele mantém as portas privadas ZeroTier/Tailscale e os parâmetros `ZT_IP`, `TS_IP` e `PORTA`. Não execute os dois Composes simultaneamente: eles usam o mesmo nome de container.

## Abas

1. **Visão geral** — KPIs, comparação entre grupos, composição das saídas e taxa por curso.
2. **Evolução** — matrículas × saídas × taxa por período (anual/semestral).
3. **Perfis de risco** — ranking descritivo por dimensão, com base mínima e risco relativo.
4. **Território** — mapa coroplético de MG por município de residência + ranking + zona.
5. **Importação & base** — assistente de importação com mapeamento de saída, listagem,
   exclusão e edição de informações dos campi.
6. **Metodologia & dados** — modelo, validação, fontes e cobertura.

Filtros de **Campus, Grupo e Curso** têm preenchimento **dinâmico em cascata** (AJAX):
as opções de cada campo são recalculadas no servidor a partir dos demais filtros ativos.

Para regerar o mapa após atualizar a malha do IBGE:

```bash
python3 -m etl.gerar_mapa /caminho/mg_municipios.geojson
```

## Branches

- `main` — versão consolidada.
- O repositório público inicia com um histórico limpo, somente com código e recursos geográficos públicos; o histórico de desenvolvimento e os dados privados permanecem no projeto local.

## Mapeamento de saída por campus

Cada campus pode ter valores diferentes em `Situação no Curso`, e **quais contam
como saída é uma decisão institucional de cada um**. Na importação, cada valor
distinto é classificado em uma de quatro classes de desfecho:

| Classe | Conta como saída? |
|---|---|
| `evasao` (Evasão) | sim |
| `cancelamento` (Cancelamento/Desligamento) | sim |
| `transferencia` (Transferência externa) | sim |
| `nao_saida` | não |

O mapeamento fica em `dados/mapeamentos.json` (por arquivo). Sem mapeamento salvo,
vale o **padrão** (Evasão, Cancelado, Cancelamento por Desligamento e Transferido
Externo como saída) — que é o que reproduz o Relatório de Ponte Nova. Situações não
mapeadas caem em “não saída” e são listadas em **Metodologia & dados**.

O gate `etl/validacao.py` aplica a referência numérica (1451/132/107) só quando o
campus de referência está presente e usa o **mapeamento padrão em todas as suas
fontes**; sem PN ou com mapeamento próprio, apenas essa comparação é ignorada.
As checagens gerais e a rejeição de pendências permanecem para toda a base.

> Como cada campus pode definir a saída de forma diferente, comparar ou somar campi
> exige cautela — o dashboard avisa quando os mapeamentos divergem.

## Testes de regressão (execução manual)

Os testes usam somente fixtures sintéticas e diretórios temporários, sem abrir
planilhas privadas. Requerem as dependências Python já utilizadas pelo ETL
(`pandas`, `openpyxl`) e, para a rota, as dependências de desenvolvimento do projeto
(incluindo `typescript`) e o runner nativo `node:test`:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/test_confirmar.cjs
```

Cobrem outro campus sem PN, PN padrão/próprio, múltiplos campi/fontes,
pendências, divergências de metadados/vínculos e preservação/rollback dos JSON.
Os testes da confirmação exercitam a rota com filesystem real sintético e mocks
da inspeção/ETL: rollback, ausência de mapeamento anterior, colisão e sucesso.
Não substituem um teste integrado da importação no Next.js.

**Esta correção foi preparada sem executar testes ou build, por decisão explícita
do responsável. Não há alegação de testes aprovados; execute-os antes de implantar.**

## Observações metodológicas

- A base é a **totalidade** das matrículas elegíveis (não é amostra).
- "Taxa de saída" agrega evasão, cancelamento, desligamento e transferência externa.
- Associações de perfil são **descritivas** e não estabelecem causalidade.
- Indicadores de C.R., frequência e progresso são marcadores exploratórios.
