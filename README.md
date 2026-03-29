# Xdebug Profile Viewer

Turn Xdebug/Cachegrind profile files into actionable insights inside VS Code.

**Xdebug Profile Viewer** opens your profiler in a visual interface, highlights hotspots, shows per-function change risk, and helps you find bottlenecks fast.

## Features

- Automatically opens profiler files in a visual readonly editor:
  - `cachegrind.out.*`
  - `*.out`
  - `*.cachegrind`
  - `*.cg`
- Hotspots table with multi-metric sorting.
- Per-function metrics: CPU, memory, average per call, self percentage, and criticality.
- Detailed panel with call structure:
  - callers (who calls it)
  - callees (what it calls)
  - fan-in, fan-out, risk, and optimization potential
- `Open source` action to jump to file and line.
- CodeLens in PHP files with `Breakage risk: X%` per function.
- Line timings in PHP via Xdebug TRACE (inlay hints per call-site line).
- Localized UI:
  - Portuguese when VS Code language starts with `pt`
  - English otherwise

## Why use it

- Find real bottlenecks without leaving the editor.
- Prioritize what to optimize based on impact.
- Reduce refactor risk with coupling visibility.
- Move from profile to source code in one click.

## How it helps in practice

1. You generate an Xdebug profile.
2. You open the file in VS Code.
3. The Viewer shows hotspots automatically.
4. You filter functions, compare metrics, and choose what to optimize first.
5. You use `Open source` to jump directly to the relevant code.
6. In PHP files, CodeLens shows per-function risk based on indexed profiles.

## Main settings

- `xdebugProfileViewer.pathMappings`
  - Maps profile paths (for example, container paths) to local workspace paths.
- `xdebugProfileViewer.codeLens.enabled`
  - Enables/disables risk CodeLens in PHP files.
- `xdebugProfileViewer.codeLens.profilerIndexDebounceMs`
  - Controls debounce for new profile indexing.
- `xdebugProfileViewer.codeLens.profilerIndexRetryMs`
  - Defines retry delay when a profile file is still incomplete.
- `xdebugProfileViewer.codeLens.profilerIndexMaxRetries`
  - Defines the maximum number of indexing retries.
- `xdebugProfileViewer.lineTimings.enabled`
  - Enables/disables line timing inlay hints.
- `xdebugProfileViewer.lineTimings.minDurationMs`
  - Shows hints only for lines above this total duration.
- `xdebugProfileViewer.lineTimings.showLoopsAsAggregate`
  - Shows looped lines as `total/count/avg`.
- `xdebugProfileViewer.lineTimings.maxHintsPerFile`
  - Limits the number of hints per file.
- `xdebugProfileViewer.lineTimings.traceGlobs`
  - Glob patterns used to find TRACE files in the workspace.
- `xdebugProfileViewer.lineTimings.lineRemapRadius`
  - How many lines around the original trace line to search when remapping hints after edits.

`pathMappings` example:

```json
{
  "xdebugProfileViewer.pathMappings": {
    "/container/app": "/local/workspace/app"
  }
}
```

## Source resolution

When you use `Open source`, the extension tries:

1. `pathMappings` (longest matching prefix first)
2. direct absolute/relative path resolution
3. workspace suffix fallback search

This makes profiles generated in local, remote, or container environments usable in your workspace.

## Line Timings (Trace)

`Line Timings` uses Xdebug TRACE files to annotate PHP call-site lines directly in the editor:

- Single execution line: `⏱ 3.4ms`
- Loop/repeated line: `⏱ total 183.2ms • 120x • avg 1.53ms`

Meaning of `x`:

- `x` is the number of traced function calls attributed to that line in the selected trace.
- It is not the number of function declarations.

Interaction:

- Hover on the hint shows a compact summary:
  - total line time
  - total memory delta
  - call count attributed to the line
  - trace timestamp
- Click on the hint opens a dedicated details view (Webview), with:
  - line totals (`time`, `memory`, `count`)
  - functions executed from that line (X, Y, Z with total/count/avg)
  - top individual slow calls

### Generating trace files (Xdebug)

Example `php.ini` settings:

```ini
xdebug.mode=trace
xdebug.start_with_request=yes
xdebug.trace_output_name=trace.%c
xdebug.output_dir=/tmp/xdebug
; Recommended for this extension:
xdebug.trace_format=1
```

Notes:

- TRACE is more detailed (and heavier) than profiler/cachegrind. Use it mainly in development.
- For best parsing reliability, prefer Xdebug tabular trace format (`trace_format=1`).
- `pathMappings` is applied to TRACE paths as well, so container paths (for example `/container/app/...`) can resolve to local workspace files.

## Requirements

- VS Code `^1.109.0`

## Notes

- Cachegrind data is aggregated by function. Per-call min/max values depend on the source profile data.
- CPU/memory columns appear based on events detected in the profile file.
