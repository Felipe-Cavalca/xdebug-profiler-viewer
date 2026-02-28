# Modelo de Metricas

Este documento define as regras de metricas usadas pela extensao (parser + UI).
As formulas abaixo descrevem o comportamento atual do codigo.

## 1. Conceitos Base

- `self`: custo exclusivo da funcao (nao inclui chamadas filhas).
- `inclusive`: custo total da secao da funcao (inclui custo delegado para filhas).
- `events`: contadores presentes no profile (por exemplo tempo, memoria).
- `primaryEvent`: primeiro evento em `events`.

## 2. Totais no Nivel do Profile

- `totalSelf` (total canonico):
  - `totalSelf = summaryByEvent[primaryEvent]` (ou total self calculado se `summary` nao existir)
  - Esse valor e o denominador para metricas `%` primarias.
- `sumInclusive`:
  - soma dos `inclusive` de todas as funcoes.
  - Nao e total canonico global, pois custos inclusive se sobrepoem no grafo.

## 3. Por que Inclusive pode ser maior que Total Self

Sim, isso pode acontecer e faz sentido.

- `totalSelf` conta cada custo de execucao uma vez (exclusivo).
- `inclusive` propaga custo ao longo da cadeia de chamadas.
- `inclusive` agregado (ou inclusive de uma funcao em cenarios recursivos/sobrepostos) pode passar `totalSelf`.

Portanto:
- compare `%Self` contra `totalSelf`.
- use `inclusive` para analise de fluxo/delegacao, nao como total global unico.

## 4. Modelo de Chamadas

- `callsObserved`: valor parseado de `calls=`.
- `callsEffective`:
  - se `callsObserved > 0`: `callsEffective = callsObserved`
  - senao, se funcao tem `self > 0` ou parece entrypoint (`main` / `{main}`): `callsEffective = 1`
  - senao: `callsEffective = 0`

`callsEffective` e usado nas medias para evitar divisao por zero e lacunas do dump.

## 5. Regras de Eventos

Para funcao `f` e evento `e`:

- `eventSelf(f,e) = f.eventCosts[e].self` (com fallback para `f.self`)
- `eventInclusive(f,e) = f.eventCosts[e].inclusive` (com fallback para `f.inclusive`)

Para aresta `a -> b`:

- `edgeInclusive(a,b,e) = edge.eventCosts[e].inclusive` (fallback para `edge.inclusive`)

## 6. Metricas da Tabela (Painel Esquerdo)

Por funcao:

- `CPU Self`: `eventSelf(f, cpuEvent)` se existir evento de CPU.
- `Mem Self`: `eventSelf(f, memEvent)` se existir evento de memoria.
- `Calls`: `callsObserved`.
- `CPU Avg`: `CPU Self / callsEffective` (se `callsEffective > 0`, senao `0`).
- `Mem Avg`: `Mem Self / callsEffective` (se `callsEffective > 0`, senao `0`).
- `% Self`: `primarySelf(f) / totalSelf * 100`.
  - `primarySelf(f)` usa self do evento primario, com fallback para `f.self`.
- `Criticality`:
  - se existem CPU e memoria: media dos shares
  - se existe apenas um: usa esse share
  - senao: share self primario
  - Formula:
    - `cpuShare = CPU Self / totalCpuSelf * 100`
    - `memShare = Mem Self / totalMemSelf * 100`
    - `criticality = media(dos shares disponiveis)`

Ordenacao padrao: `criticality desc`.

## 7. Metricas do Painel Direito (Funcao Selecionada)

### Base

- `Calls Observed`: `callsObserved`
- `Calls Effective`: `callsEffective`
- `Self (Primary)`: `primarySelf(f)`
- `Inclusive (Primary)`: `eventInclusive(f, primaryEvent)`
- `Criticality`: mesmo modelo da tabela

### CPU/Memoria + Medias

- `CPU Self`, `Mem Self` (self por evento)
- `CPU Avg = CPU Self / callsEffective`
- `Mem Avg = Mem Self / callsEffective`
- `Avg Self = primarySelf / callsEffective`
- `Avg Inclusive = inclusivePrimary / callsEffective`

### Shares

- `CPU Share = CPU Self / totalCpuSelf * 100`
- `Mem Share = Mem Self / totalMemSelf * 100`
- `% Self = primarySelf / totalSelf * 100`

### Estrutura do Grafo

- `fanIn = callers.length`
- `fanOut = callees.length`
- `delegated = max(inclusivePrimary - primarySelf, 0)`
- `delegationRatio = delegated / max(inclusivePrimary, 1)`
- `delegationPct = delegationRatio * 100`
- `amplification = inclusivePrimary / max(primarySelf, 1)`
- `topCallee`: callee com maior inclusive no evento primario
- `topCalleeShare = topCalleeCost / max(delegated, 1) * 100`

### Hot Path Score

Indicador de oportunidade de ganho em otimizacao:

- `gainBasePct = cpuShare` se houver evento CPU, senao `%Self`
- `hotspotFactor = log1p(callsEffective) / log1p(maxCallsEffective)` (0..1)
- `executionFactor = 1 - delegationRatio`
- `gainBase = clamp(gainBasePct,0,100)/100`
- `hotPathScore = 100 * (0.65*gainBase + 0.25*executionFactor + 0.10*hotspotFactor)`
- limitado em `[0,100]`

Interpretacao:
- quanto maior, maior potencial de ganho ao otimizar diretamente essa funcao.

### Churn Risk

Indicador de risco de impacto/refactor:

- `fanInNorm = fanIn / maxFanIn`
- `degreeNorm = (fanIn + fanOut) / maxDegree`
- `inboundCost = soma do inclusive das arestas caller->funcao`
- `inboundNorm = inboundCost / maxInboundCost` (fallback `degreeNorm` se maxInboundCost for 0)
- `churnRisk = 100 * (0.45*fanInNorm + 0.25*degreeNorm + 0.30*inboundNorm)`
- limitado em `[0,100]`

Interpretacao:
- quanto maior, maior o raio de impacto de mudanca.

## 8. Metricas de Eficiencia

Somente quando CPU e memoria existem:

- `memKb = memSelf / 1024`
- `CPU per KB = cpuSelf / memKb` (indefinido se `memKb == 0`)
- `KB per CPU = memKb / cpuSelf` (indefinido se `cpuSelf == 0`)

## 9. Regras de Profundidade/Grafo

- `maxFanIn`, `maxFanOut`, `maxDegree` sao maximos pre-calculados do profile.
- Profundidade e calculada via BFS a partir de entrypoints/nos com indegree zero.

## 10. Invariantes / Sanidade

Validacoes do parser em dev mode:

- `callsEffective >= 1` quando `self > 0`
- aresta inclusive nao negativa por evento
- checagem opcional: summary por evento igual ao total self recomputado

Regras de leitura recomendadas:

- Use `totalSelf` como denominador canonico.
- Trate `inclusive` como sinal de fluxo/delegacao (pode se sobrepor).
- Prefira `callsEffective` para medias.
