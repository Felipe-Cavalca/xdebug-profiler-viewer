# Metrics Model

This document defines the metric rules used by the extension (parser + UI).  
Formulas below describe the current behavior in code.

## 1. Core Concepts

- `self`: exclusive cost of a function (does not include callees).
- `inclusive`: total cost of a function section (includes delegated/callee cost).
- `events`: counters present in the profile (for example time, memory).
- `primaryEvent`: first event in `events`.

## 2. Profile-Level Totals

- `totalSelf` (canonical total):
  - `totalSelf = summaryByEvent[primaryEvent]` (or computed self total if summary is absent)
  - This is the denominator for primary `%` metrics.
- `sumInclusive`:
  - sum of per-function `inclusive`.
  - Not a canonical profile total because inclusive values overlap across call chains.

## 3. Why Inclusive Can Be Greater Than Total Self

Yes, this can happen and is expected.

- `totalSelf` counts each execution cost once (exclusive).
- `inclusive` propagates costs through caller chains.
- Aggregated `inclusive` (or one function's inclusive in recursive/overlapping paths) can be larger than `totalSelf`.

So:
- compare `%Self` against `totalSelf`.
- use `inclusive` for delegation/flow analysis, not as a unique global total.

## 4. Calls Model

- `callsObserved`: parsed from `calls=` records.
- `callsEffective`:
  - if `callsObserved > 0`: `callsEffective = callsObserved`
  - else if function has `self > 0` or looks like entrypoint (`main` / `{main}`): `callsEffective = 1`
  - else: `callsEffective = 0`

`callsEffective` is used for averages to avoid division by zero and missing-call artifacts.

## 5. Event Extraction Rules

For function `f` and event `e`:

- `eventSelf(f,e) = f.eventCosts[e].self` (fallback to `f.self` for primary fallback paths)
- `eventInclusive(f,e) = f.eventCosts[e].inclusive` (fallback to `f.inclusive`)

For edge `a -> b`:

- `edgeInclusive(a,b,e) = edge.eventCosts[e].inclusive` (fallback to edge `inclusive`)

## 6. Table Metrics (Left Panel)

Per function:

- `CPU Self`: `eventSelf(f, cpuEvent)` if CPU event exists.
- `Mem Self`: `eventSelf(f, memEvent)` if memory event exists.
- `Calls`: `callsObserved`.
- `CPU Avg`: `CPU Self / callsEffective` (if `callsEffective > 0`, else `0`).
- `Mem Avg`: `Mem Self / callsEffective` (if `callsEffective > 0`, else `0`).
- `% Self`: `primarySelf(f) / totalSelf * 100`.
  - `primarySelf(f)` uses primary event self, fallback to `f.self`.
- `Criticality`:
  - if both CPU and memory totals exist: average of both shares
  - if only one exists: that share
  - else: primary self share
  - Formula:
    - `cpuShare = CPU Self / totalCpuSelf * 100`
    - `memShare = Mem Self / totalMemSelf * 100`
    - `criticality = mean(available shares)`

Default sort: `criticality desc`.

## 7. Right Panel Metrics (Selected Function)

### Base

- `Calls Observed`: `callsObserved`
- `Calls Effective`: `callsEffective`
- `Self (Primary)`: `primarySelf(f)`
- `Inclusive (Primary)`: `eventInclusive(f, primaryEvent)`
- `Criticality`: same model as table

### CPU/Memory + Averages

- `CPU Self`, `Mem Self` (event self values)
- `CPU Avg = CPU Self / callsEffective`
- `Mem Avg = Mem Self / callsEffective`
- `Avg Self = primarySelf / callsEffective`
- `Avg Inclusive = inclusivePrimary / callsEffective`

### Shares

- `CPU Share = CPU Self / totalCpuSelf * 100`
- `Mem Share = Mem Self / totalMemSelf * 100`
- `% Self = primarySelf / totalSelf * 100`

### Flow Structure

- `fanIn = callers.length`
- `fanOut = callees.length`
- `delegated = max(inclusivePrimary - primarySelf, 0)`
- `delegationRatio = delegated / max(inclusivePrimary, 1)`
- `delegationPct = delegationRatio * 100`
- `amplification = inclusivePrimary / max(primarySelf, 1)`
- `topCallee`: callee edge with max inclusive(primaryEvent)
- `topCalleeShare = topCalleeCost / max(delegated, 1) * 100`

### Hot Path Score

Used as optimization opportunity indicator:

- `gainBasePct = cpuShare` if CPU event exists, else `%Self`
- `hotspotFactor = log1p(callsEffective) / log1p(maxCallsEffective)` (0..1)
- `executionFactor = 1 - delegationRatio`
- `gainBase = clamp(gainBasePct,0,100)/100`
- `hotPathScore = 100 * (0.65*gainBase + 0.25*executionFactor + 0.10*hotspotFactor)`
- clamped to `[0,100]`

Interpretation:
- Higher means larger expected gain by improving this function directly.

### Churn Risk

Used as refactor blast-radius indicator:

- `fanInNorm = fanIn / maxFanIn`
- `degreeNorm = (fanIn + fanOut) / maxDegree`
- `inboundCost = sum(inclusive cost of caller->this edges)`
- `inboundNorm = inboundCost / maxInboundCost` (fallback `degreeNorm` if maxInboundCost is 0)
- `churnRisk = 100 * (0.45*fanInNorm + 0.25*degreeNorm + 0.30*inboundNorm)`
- clamped to `[0,100]`

Interpretation:
- Higher means higher change impact risk.

## 8. Efficiency Metrics

Only when both CPU and memory events exist:

- `memKb = memSelf / 1024`
- `CPU per KB = cpuSelf / memKb` (undefined if `memKb == 0`)
- `KB per CPU = memKb / cpuSelf` (undefined if `cpuSelf == 0`)

## 9. Graph/Depth Rules

- `maxFanIn`, `maxFanOut`, `maxDegree` are precomputed profile maxima.
- Depth is computed from entrypoints/zero-indegree roots via BFS on call graph.

## 10. Invariants / Sanity Checks

Parser validations in dev mode:

- `callsEffective >= 1` when `self > 0`
- no negative edge inclusive by event
- optional check: summary-by-event equals recomputed event self totals

Recommended interpretation rules:

- Use `totalSelf` as canonical denominator.
- Treat `inclusive` as flow/delegation signal (can overlap).
- Prefer `callsEffective` for averages.
