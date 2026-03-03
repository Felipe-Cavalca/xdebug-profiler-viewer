import * as path from 'node:path';
import * as vscode from 'vscode';
import { TraceIndex, TraceLineStats } from '../trace/traceIndex';

export const SHOW_LINE_TIMING_DETAILS_COMMAND = 'xdebugProfileViewer.showLineTimingDetails';

export class LineTimingsInlayHintsProvider implements vscode.InlayHintsProvider, vscode.Disposable {
	private readonly didChangeEmitter = new vscode.EventEmitter<void>();
	public readonly onDidChangeInlayHints: vscode.Event<void> = this.didChangeEmitter.event;

	constructor(private readonly traceIndex: TraceIndex) {}

	public invalidate(): void {
		this.didChangeEmitter.fire();
	}

	public provideInlayHints(
		document: vscode.TextDocument,
		range: vscode.Range,
		_token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.InlayHint[]> {
		if (!isLineTimingsEnabled()) {
			return [];
		}

		const latestByLine = this.traceIndex.getLatestLineStatsByDocument(document.uri);
		if (latestByLine.size === 0) {
			return [];
		}

		const minDurationUs = Math.max(0, getMinDurationMs()) * 1000;
		const showLoopsAsAggregate = getShowLoopsAsAggregate();
		const maxHints = Math.max(1, getMaxHintsPerFile());
		const candidates: TraceLineStats[] = [];
		for (const stat of latestByLine.values()) {
			if (stat.line < 1 || stat.line > document.lineCount) {
				continue;
			}
			if (stat.totalDurationUs <= 0 || stat.totalDurationUs < minDurationUs) {
				continue;
			}
			const zeroBased = stat.line - 1;
			if (zeroBased < range.start.line || zeroBased > range.end.line) {
				continue;
			}
			candidates.push(stat);
		}
		if (candidates.length === 0) {
			return [];
		}

		const selected = candidates.length <= maxHints
			? candidates
			: candidates
				.slice()
				.sort((a, b) => b.totalDurationUs - a.totalDurationUs)
				.slice(0, maxHints);
		selected.sort((a, b) => a.line - b.line);

		return selected.map((stat) => {
			const lineText = document.lineAt(stat.line - 1);
			const position = lineText.range.end;
			const label = buildHintLabel(stat, showLoopsAsAggregate);
			const labelPart = new vscode.InlayHintLabelPart(label);
			labelPart.command = {
				title: 'Show line timing details',
				command: SHOW_LINE_TIMING_DETAILS_COMMAND,
				arguments: [document.uri, stat.line]
			};
			const hint = new vscode.InlayHint(position, [labelPart]);
			hint.paddingLeft = true;
			hint.tooltip = new vscode.MarkdownString(buildHintTooltip(stat));
			return hint;
		});
	}

	public dispose(): void {
		this.didChangeEmitter.dispose();
	}
}

export async function showLineTimingDetailsCommand(
	traceIndex: TraceIndex,
	documentUri: vscode.Uri,
	line: number
): Promise<void> {
	const stat = traceIndex.getLineStats(documentUri, line);
	if (!stat) {
		void vscode.window.showInformationMessage('Sem detalhes de tempo para esta linha nos traces indexados.');
		return;
	}
	const panel = vscode.window.createWebviewPanel(
		'xdebugProfileViewer.lineTimingDetails',
		`Line Timings: ${path.basename(documentUri.fsPath)}:${line}`,
		vscode.ViewColumn.Beside,
		{ enableFindWidget: true }
	);
	panel.webview.html = buildLineTimingDetailsHtml(stat, documentUri, line);
}

function buildHintLabel(stat: TraceLineStats, showLoopsAsAggregate: boolean): string {
	if (showLoopsAsAggregate && stat.count > 1) {
		return `⏱ total ${formatDurationUs(stat.totalDurationUs)} • ${stat.count}x • avg ${formatDurationUs(stat.avgDurationUs)}`;
	}
	return `⏱ ${formatDurationUs(stat.totalDurationUs)}`;
}

function buildHintTooltip(stat: TraceLineStats): string {
	return [
		`Trace: \`${path.basename(stat.traceUri.fsPath)}\``,
		`Tempo total da linha: **${formatDurationUs(stat.totalDurationUs)}**`,
		`Memoria (delta total): **${formatMemoryDelta(stat.totalMemoryDeltaBytes)}**`,
		`Chamadas atribuidas a linha: **${stat.count}**`,
		`Timestamp do trace: ${new Date(stat.traceMtime).toLocaleString()}`
	].join('  \n');
}

function buildLineTimingDetailsHtml(stat: TraceLineStats, documentUri: vscode.Uri, line: number): string {
	const traceFile = escapeHtml(path.basename(stat.traceUri.fsPath));
	const tracePath = escapeHtml(stat.traceUri.fsPath);
	const fileLabel = escapeHtml(path.basename(documentUri.fsPath));
	const fnRows = stat.functionStats
		.map((fn, index) => {
			const name = escapeHtml(fn.functionName);
			return `<tr>
<td>${index + 1}</td>
<td>${name}</td>
<td>${formatDurationUs(fn.totalDurationUs)}</td>
<td>${fn.count}x</td>
<td>${formatDurationUs(fn.avgDurationUs)}</td>
<td>${formatMemoryDelta(fn.totalMemoryDeltaBytes)}</td>
</tr>`;
		})
		.join('\n');

	const eventRows = stat.topSlowEvents
		.map((event, index) => {
			const fn = escapeHtml(event.functionName);
			const args = event.argsPreview ? escapeHtml(event.argsPreview) : '-';
			return `<tr>
<td>${index + 1}</td>
<td>${fn}</td>
<td>${formatDurationUs(event.durationUs)}</td>
<td>${event.depth}</td>
<td>${formatMemoryDelta(event.memoryDeltaBytes)}</td>
<td>${args}</td>
</tr>`;
		})
		.join('\n');

	return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Line Timing Details</title>
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
h1,h2 { margin: 0 0 8px; font-weight: 600; }
.meta { margin: 0 0 16px; color: var(--vscode-descriptionForeground); }
.cards { display: grid; grid-template-columns: repeat(3, minmax(140px, 1fr)); gap: 8px; margin-bottom: 16px; }
.card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px; background: color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-editor-foreground) 10%); }
.k { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
.v { font-size: 16px; font-weight: 600; }
table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
th, td { border-bottom: 1px solid var(--vscode-panel-border); text-align: left; padding: 6px 8px; font-size: 12px; vertical-align: top; }
th { color: var(--vscode-descriptionForeground); font-weight: 600; }
code { font-family: var(--vscode-editor-font-family); }
</style>
</head>
<body>
<h1>Line Timings</h1>
<div class="meta"><strong>${fileLabel}:${line}</strong> • Trace: <code>${traceFile}</code><br /><code>${tracePath}</code></div>
<div class="cards">
<div class="card"><div class="k">Tempo total</div><div class="v">${formatDurationUs(stat.totalDurationUs)}</div></div>
<div class="card"><div class="k">Chamadas</div><div class="v">${stat.count}x</div></div>
<div class="card"><div class="k">Memoria (delta total)</div><div class="v">${formatMemoryDelta(stat.totalMemoryDeltaBytes)}</div></div>
</div>

<h2>Funcoes executadas nesta linha</h2>
<table>
<thead><tr><th>#</th><th>Funcao</th><th>Tempo total</th><th>Count</th><th>Media</th><th>Memoria</th></tr></thead>
<tbody>
${fnRows || '<tr><td colspan="6">Sem dados.</td></tr>'}
</tbody>
</table>

<h2>Top chamadas individuais</h2>
<table>
<thead><tr><th>#</th><th>Funcao</th><th>Tempo</th><th>Depth</th><th>Memoria</th><th>Args</th></tr></thead>
<tbody>
${eventRows || '<tr><td colspan="6">Sem dados.</td></tr>'}
</tbody>
</table>
</body>
</html>`;
}

function formatDurationUs(durationUs: number): string {
	const ms = durationUs / 1000;
	if (ms >= 1000) {
		return `${(ms / 1000).toFixed(2)}s`;
	}
	if (ms >= 10) {
		return `${ms.toFixed(1)}ms`;
	}
	if (ms >= 1) {
		return `${ms.toFixed(2)}ms`;
	}
	return `${durationUs.toFixed(0)}us`;
}

function formatMemoryDelta(memoryBytes: number | undefined): string {
	if (memoryBytes === undefined || !Number.isFinite(memoryBytes)) {
		return 'n/d';
	}
	const sign = memoryBytes > 0 ? '+' : '';
	const abs = Math.abs(memoryBytes);
	if (abs >= 1024 * 1024) {
		return `${sign}${(memoryBytes / (1024 * 1024)).toFixed(2)} MB`;
	}
	if (abs >= 1024) {
		return `${sign}${(memoryBytes / 1024).toFixed(2)} KB`;
	}
	return `${sign}${Math.round(memoryBytes)} B`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function isLineTimingsEnabled(): boolean {
	return vscode.workspace.getConfiguration('xdebugProfileViewer').get<boolean>('lineTimings.enabled', true);
}

function getMinDurationMs(): number {
	return vscode.workspace.getConfiguration('xdebugProfileViewer').get<number>('lineTimings.minDurationMs', 0);
}

function getShowLoopsAsAggregate(): boolean {
	return vscode.workspace.getConfiguration('xdebugProfileViewer').get<boolean>('lineTimings.showLoopsAsAggregate', true);
}

function getMaxHintsPerFile(): number {
	return vscode.workspace.getConfiguration('xdebugProfileViewer').get<number>('lineTimings.maxHintsPerFile', 200);
}
