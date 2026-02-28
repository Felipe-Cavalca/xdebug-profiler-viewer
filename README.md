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
