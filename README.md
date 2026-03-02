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

## Requirements

- VS Code `^1.109.0`

## Notes

- Cachegrind data is aggregated by function. Per-call min/max values depend on the source profile data.
- CPU/memory columns appear based on events detected in the profile file.
