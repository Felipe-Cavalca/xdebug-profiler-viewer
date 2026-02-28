# Xdebug Profile Viewer

Xdebug Profile Viewer is a VS Code extension that opens Cachegrind/Xdebug profiler files in a visual custom editor.

## Features

- Automatically opens profiler files in a custom readonly editor:
  - `cachegrind.out.*`
  - `*.out`
  - `*.cachegrind`
  - `*.cg`
- Hotspots table with sortable columns.
- Function-level self metrics (CPU/memory), averages per call, and criticality.
- Caller/callee lists for the selected function.
- `Open source` action (file + line) when source location is available.
- CodeLens in PHP editors with `Risco de quebra: X%` per function, based on the latest profiler where that function appears.
- UI localization:
  - Portuguese when VS Code language starts with `pt`
  - English otherwise

## Requirements

- VS Code `^1.109.0`

## Run in Development

1. Install dependencies:
   - `npm install`
2. Compile:
   - `npm run compile`
3. Start Extension Development Host:
   - Press `F5` in VS Code
4. Open a Cachegrind profile file.

## Extension Settings

This extension contributes:

- `xdebugProfileViewer.pathMappings`
  - Type: `object`
  - Default: `{}`
  - Description: map source path prefixes from profiler output to local workspace paths.
- `xdebugProfileViewer.codeLens.enabled`
  - Type: `boolean`
  - Default: `true`
  - Description: enable/disable function risk CodeLens in PHP editors.
- `xdebugProfileViewer.codeLens.profilerIndexDebounceMs`
  - Type: `number`
  - Default: `350`
  - Description: debounce (ms) for indexing profiler file create/change events.
- `xdebugProfileViewer.codeLens.profilerIndexRetryMs`
  - Type: `number`
  - Default: `900`
  - Description: retry delay (ms) when a new profiler file is still incomplete while being written.
- `xdebugProfileViewer.codeLens.profilerIndexMaxRetries`
  - Type: `number`
  - Default: `3`
  - Description: max retry attempts for indexing a profiler file.

Example:

```json
{
  "xdebugProfileViewer.pathMappings": {
    "/container/app": "/local/workspace/app"
  }
}
```

## Source Resolution Strategy

When `Open source` is triggered, the extension tries:

1. `pathMappings` (longest matching prefix first)
2. direct absolute/relative path resolution
3. workspace suffix fallback search

This makes container/remote-generated profiles usable on local workspaces.

## Notes

- Cachegrind data is aggregated by function, so per-call min/max values are not available unless present in the source data.
- CPU/memory columns appear based on events detected in the profiler file.
