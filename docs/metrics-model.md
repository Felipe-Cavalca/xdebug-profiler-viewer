# Xdebug Profile Viewer - Metrics Model

## Core totals
- `totalSelf`: canonical total for global percentages. It uses self costs and avoids call-chain double counting.
- `sumInclusive`: sum of per-function inclusive costs. It is **not** a profile-wide execution total (inclusive values overlap across caller/callee chains).

## Calls model
- `callsObserved`: raw call count parsed from Cachegrind `calls=` lines.
- `callsEffective`: heuristic count used in averages.
  - If `callsObserved > 0`: use `callsObserved`
  - Else if function is entrypoint (`main`/`{main}`) or has `self > 0`: use `1`
  - Else: use `0`

## Event model
- Function and edge costs are tracked per event in `eventCosts[eventName]`.
- UI formulas are computed for the active event (currently primary event in the viewer).

## Structure metrics
- `fanIn = callers.length`
- `fanOut = callees.length`
- `amplification = inclusive / max(self, 1)`
- `delegation = (inclusive - self) / max(inclusive, 1)`
- `topCalleeShare`:
  - `delegated = max(inclusive - self, 0)`
  - `topCalleeEdge = max edge cost(func -> callee) in active event`
  - `topCalleeShare = topCalleeEdge / max(delegated, 1)`
- `depthMin`: minimum BFS depth from entrypoints (`main` and/or nodes with no callers)

## Averages and shares
- `cpuShare = cpuSelf / max(totalCpuSelf, 1)`
- `memShare = memSelf / max(totalMemSelf, 1)`
- `avgSelf = self / max(callsEffective, 1)`
- `avgInclusive = inclusive / max(callsEffective, 1)`

## Product scores
- Gain Potential (0-100):
  - `gainBase = cpuShare` (fallback: primary self share)
  - `executionFactor = 1 - delegation`
  - `hotspotFactor = log1p(callsEffective) / log1p(maxCallsEffective)`
  - `score = 100 * (0.65*gainBase + 0.25*executionFactor + 0.10*hotspotFactor)`
- Change Risk (0-100):
  - `fanInNorm = fanIn / maxFanIn`
  - `degreeNorm = (fanIn + fanOut) / maxDegree`
  - `inboundNorm = inboundCost / maxInboundCost` (fallback to `degreeNorm` when max inbound is 0)
  - `score = 100 * (0.45*fanInNorm + 0.25*degreeNorm + 0.30*inboundNorm)`

## Cachegrind limitations
- `calls=` may be missing for some nodes, so `callsEffective` is heuristic.
- Model aggregates by function identity `(name + file)`; this can merge different callsites.
- Inclusive costs across functions overlap by design.
- Event naming is producer-dependent; CPU/memory detection is heuristic based on event names.
