import * as path from 'node:path';
import * as vscode from 'vscode';
import { CachegrindFunction, CachegrindProfile, parseCachegrind } from '../cachegrind/parser';
import { getUiStrings } from './i18n';
import { escapeHtmlAttr, headerWithInfo, iconFunction, iconGraph, iconOpen, iconSearch, sortableHeader } from './templateHelpers';

export const XDEBUG_PROFILE_VIEW_TYPE = 'xdebugProfileViewer.viewer';

interface XdebugProfileDocument extends vscode.CustomDocument {
	readonly uri: vscode.Uri;
}

interface OpenSourceMessage {
	type: 'openSource';
	file?: string;
	line?: number;
}

export class XdebugProfileReadonlyEditorProvider
	implements vscode.CustomReadonlyEditorProvider<XdebugProfileDocument> {
	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new XdebugProfileReadonlyEditorProvider(context);
		return vscode.window.registerCustomEditorProvider(XDEBUG_PROFILE_VIEW_TYPE, provider, {
			supportsMultipleEditorsPerDocument: true
		});
	}

	constructor(private readonly context: vscode.ExtensionContext) {}

	async openCustomDocument(uri: vscode.Uri): Promise<XdebugProfileDocument> {
		return { uri, dispose: () => undefined };
	}

	async resolveCustomEditor(
		document: XdebugProfileDocument,
		webviewPanel: vscode.WebviewPanel
	): Promise<void> {
		webviewPanel.title = `Xdebug Profile Viewer: ${path.basename(document.uri.fsPath)}`;
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri]
		};

		const profile = await this.readProfile(document.uri);
		webviewPanel.webview.html = this.getHtml(webviewPanel.webview, profile, document.uri);

		webviewPanel.webview.onDidReceiveMessage(async (message: OpenSourceMessage) => {
			if (message.type !== 'openSource' || !message.file) {
				return;
			}
			await this.openSourceLocation(message.file, message.line, document.uri);
		});
	}

	private async readProfile(uri: vscode.Uri): Promise<CachegrindProfile> {
		try {
			const bytes = await vscode.workspace.fs.readFile(uri);
			const text = new TextDecoder('utf-8').decode(bytes);
			return parseCachegrind(text);
		} catch (error) {
			const errText = error instanceof Error ? error.message : String(error);
			return {
				events: ['cost'],
				primaryEvent: 'cost',
				eventScaleNs: {},
				summaryByEvent: {},
				metadata: {},
				totalSelf: 0,
				sumInclusive: 0,
				totalCalls: 0,
				maxFanIn: 0,
				maxFanOut: 0,
				maxDegree: 0,
				functions: [
					{
						id: 'error',
						name: `Unable to parse file: ${errText}`,
						inclusive: 0,
						self: 0,
						callsObserved: 0,
						callsEffective: 0,
						callers: [],
						callees: [],
						eventCosts: {
							cost: { inclusive: 0, self: 0 }
						}
					}
				]
			};
		}
	}

	private async openSourceLocation(filePath: string, line: number | undefined, from: vscode.Uri): Promise<void> {
		const targetUri = await this.resolveSourceUri(filePath, from);
		if (!targetUri) {
			const ui = getUiStrings(vscode.env.language);
			void vscode.window.showWarningMessage(
				`${ui.source}: ${filePath} (${ui.unknown}). Configure xdebugProfileViewer.pathMappings.`
			);
			return;
		}

		const doc = await vscode.workspace.openTextDocument(targetUri);
		const editor = await vscode.window.showTextDocument(doc, { preview: false });
		if (line && line > 0) {
			const position = new vscode.Position(line - 1, 0);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
		}
	}

	private async resolveSourceUri(filePath: string, from: vscode.Uri): Promise<vscode.Uri | undefined> {
		const candidates = new Set<string>();
		const mappings = this.getPathMappings();

		for (const mapped of this.applyPathMappings(filePath, mappings)) {
			candidates.add(mapped);
		}

		if (path.isAbsolute(filePath)) {
			candidates.add(path.normalize(filePath));
		} else {
			candidates.add(path.resolve(path.dirname(from.fsPath), filePath));
			for (const folder of vscode.workspace.workspaceFolders ?? []) {
				candidates.add(path.resolve(folder.uri.fsPath, filePath));
			}
		}

		const direct = await this.findFirstExistingFile(candidates);
		if (direct) {
			return direct;
		}

		return this.findBySuffix(filePath);
	}

	private getPathMappings(): Record<string, string> {
		const cfg = vscode.workspace.getConfiguration('xdebugProfileViewer');
		const mappings = cfg.get<Record<string, string>>('pathMappings', {});
		return mappings ?? {};
	}

	private applyPathMappings(filePath: string, mappings: Record<string, string>): string[] {
		const out: string[] = [];
		const sourceNorm = normalizeSlashes(filePath);
		const entries = Object.entries(mappings).sort((a, b) => b[0].length - a[0].length);
		for (const [fromPrefixRaw, toPrefixRaw] of entries) {
			const fromPrefix = trimTrailingSlash(normalizeSlashes(fromPrefixRaw));
			const toPrefix = trimTrailingSlash(toPrefixRaw);
			if (!fromPrefix || !toPrefix) {
				continue;
			}
			if (!sourceNorm.startsWith(fromPrefix)) {
				continue;
			}
			const rest = sourceNorm.slice(fromPrefix.length).replace(/^\/+/, '');
			out.push(path.normalize(path.join(toPrefix, rest)));
		}
		return out;
	}

	private async findFirstExistingFile(candidates: Iterable<string>): Promise<vscode.Uri | undefined> {
		for (const candidate of candidates) {
			const uri = vscode.Uri.file(candidate);
			try {
				await vscode.workspace.fs.stat(uri);
				return uri;
			} catch {
				// keep searching
			}
		}
		return undefined;
	}

	private async findBySuffix(filePath: string): Promise<vscode.Uri | undefined> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (folders.length === 0) {
			return undefined;
		}

		const parts = normalizeSlashes(filePath).split('/').filter(Boolean);
		if (parts.length === 0) {
			return undefined;
		}

		const maxParts = Math.min(parts.length, 6);
		for (let partCount = maxParts; partCount >= 1; partCount -= 1) {
			const suffix = parts.slice(parts.length - partCount).join('/');
			for (const folder of folders) {
				const pattern = new vscode.RelativePattern(folder, `**/${suffix}`);
				const matches = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 2);
				if (matches.length > 0) {
					return matches[0];
				}
			}
		}

		return undefined;
	}

	private getHtml(webview: vscode.Webview, profile: CachegrindProfile, uri: vscode.Uri): string {
		const nonce = createNonce();
		const ui = getUiStrings(vscode.env.language);
		const state = JSON.stringify({
			documentName: path.basename(uri.fsPath),
			documentPath: uri.fsPath,
			ui,
			profile: {
				...profile,
				functions: profile.functions.map((fn) => normalizeFunction(fn))
			}
		}).replace(/</g, '\\u003c');

		const csp = [
			"default-src 'none'",
			`style-src ${webview.cspSource} 'nonce-${nonce}'`,
			`script-src 'nonce-${nonce}'`,
			'img-src data:'
		].join('; ');

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtmlAttr(ui.title)}</title>
	<style nonce="${nonce}">
		:root {
			--bg: var(--vscode-editor-background);
			--fg: var(--vscode-editor-foreground);
			--border: var(--vscode-panel-border);
			--muted: var(--vscode-descriptionForeground);
			--card: var(--vscode-sideBar-background);
			--card-alt: var(--vscode-editorWidget-background);
			--input-bg: var(--vscode-input-background);
			--input-fg: var(--vscode-input-foreground);
			--input-border: var(--vscode-input-border);
			--accent: var(--vscode-focusBorder);
			--button-bg: var(--vscode-button-background);
			--button-fg: var(--vscode-button-foreground);
			--button-hover: var(--vscode-button-hoverBackground);
			--row-hover: var(--vscode-list-hoverBackground);
			--row-active: var(--vscode-list-activeSelectionBackground);
			--badge-bg: var(--vscode-badge-background);
			--badge-fg: var(--vscode-badge-foreground);
			--good: var(--vscode-testing-iconPassed, #73c991);
			--warn: var(--vscode-testing-iconQueued, #cca700);
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			padding: 12px;
			background: var(--bg);
			color: var(--fg);
			font-family: var(--vscode-font-family);
			font-size: 13px;
		}
		.layout {
			display: grid;
			gap: 10px;
			--left-width: 64%;
			grid-template-columns: minmax(420px, var(--left-width)) 8px minmax(320px, calc(100% - var(--left-width)));
			height: calc(100vh - 24px);
			min-height: 0;
		}
		.layout.details-hidden {
			grid-template-columns: minmax(420px, 1fr);
		}
		.layout.details-hidden .splitter,
		.layout.details-hidden #detailsPanel {
			display: none;
		}
		.splitter {
			width: 8px;
			border-radius: 8px;
			background: color-mix(in srgb, var(--border) 45%, transparent);
			cursor: col-resize;
			position: relative;
		}
		.splitter::before {
			content: '';
			position: absolute;
			left: 50%;
			top: 50%;
			width: 2px;
			height: 28px;
			transform: translate(-50%, -50%);
			border-radius: 999px;
			background: var(--muted);
			opacity: 0.7;
		}
		.splitter:hover,
		.splitter.dragging {
			background: color-mix(in srgb, var(--accent) 45%, transparent);
		}
		.panel {
			border: 1px solid var(--border);
			border-radius: 10px;
			background: var(--card);
			overflow: visible;
			height: 100%;
			min-height: 0;
			display: flex;
			flex-direction: column;
		}
		.header {
			padding: 10px 12px;
			border-bottom: 1px solid var(--border);
			background: var(--card-alt);
		}
		.head-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			flex-wrap: wrap;
		}
		.head-actions {
			display: inline-flex;
			align-items: center;
			gap: 8px;
		}
		.title {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			font-weight: 700;
			font-size: 15px;
		}
		.meta {
			color: var(--muted);
			font-size: 12px;
			margin-top: 4px;
			word-break: break-all;
		}
		.kpi-row {
			display: grid;
			grid-template-columns: repeat(4, minmax(120px, 1fr));
			gap: 8px;
			padding: 10px 12px;
			border-bottom: 1px solid var(--border);
		}
		.kpi {
			border: 1px solid var(--border);
			border-radius: 8px;
			padding: 8px;
			background: var(--card-alt);
		}
		.kpi .label {
			font-size: 11px;
			color: var(--muted);
			margin-bottom: 3px;
		}
		.kpi .value {
			font-size: 14px;
			font-weight: 700;
		}
		.toolbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			padding: 10px 12px;
			border-bottom: 1px solid var(--border);
		}
		.search {
			flex: 1;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.input {
			width: 100%;
			padding: 8px 10px;
			border-radius: 7px;
			border: 1px solid var(--input-border);
			background: var(--input-bg);
			color: var(--input-fg);
			outline: none;
		}
		.input:focus {
			border-color: var(--accent);
		}
		.btn {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 7px 10px;
			border-radius: 7px;
			border: 1px solid transparent;
			background: var(--button-bg);
			color: var(--button-fg);
			cursor: pointer;
			font-weight: 600;
		}
		.btn:hover {
			background: var(--button-hover);
		}
		.btn[disabled] {
			opacity: 0.6;
			cursor: not-allowed;
		}
		.table-wrap {
			flex: 1;
			min-height: 0;
			overflow: auto;
			border-top: 1px solid var(--border);
			border-bottom-left-radius: 10px;
			border-bottom-right-radius: 10px;
		}
		table {
			width: 100%;
			border-collapse: collapse;
			font-variant-numeric: tabular-nums;
			table-layout: auto;
			min-width: 1320px;
		}
		th, td {
			padding: 8px 10px;
			border-bottom: 1px solid var(--border);
			vertical-align: top;
		}
		th {
			position: sticky;
			top: 0;
			background: var(--card-alt);
			text-align: left;
			font-size: 11px;
			letter-spacing: 0.3px;
			color: var(--muted);
			text-transform: uppercase;
		}
		th[data-sort] {
			cursor: pointer;
			user-select: none;
		}
		th[data-sort]:hover {
			color: var(--fg);
		}
		th .th-wrap {
			display: inline-flex;
			align-items: center;
			gap: 5px;
		}
		th .sort-ind {
			font-size: 10px;
			opacity: 0.55;
			width: 10px;
			text-align: center;
		}
		th.sort-asc .sort-ind,
		th.sort-desc .sort-ind {
			opacity: 1;
			color: var(--fg);
		}
		.info-wrap {
			display: inline-flex;
			align-items: center;
			gap: 5px;
		}
		.info-dot {
			position: relative;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 14px;
			height: 14px;
			border-radius: 999px;
			border: 1px solid var(--border);
			color: var(--muted);
			font-size: 10px;
			font-weight: 700;
			cursor: help;
			user-select: none;
			background: var(--card-alt);
		}
		.info-dot:hover {
			color: var(--fg);
			border-color: var(--accent);
		}
		.tooltip-float {
			position: fixed;
			min-width: 220px;
			max-width: min(320px, calc(100vw - 24px));
			white-space: pre-line;
			padding: 7px 8px;
			border-radius: 6px;
			border: 1px solid var(--border);
			background: var(--vscode-editorHoverWidget-background, var(--card-alt));
			color: var(--vscode-editorHoverWidget-foreground, var(--fg));
			box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
			pointer-events: none;
			opacity: 0;
			visibility: hidden;
			transition: opacity 120ms ease;
			text-transform: none;
			font-size: 11px;
			line-height: 1.35;
			z-index: 999;
		}
		.tooltip-float.show {
			opacity: 1;
			visibility: visible;
		}
		tbody tr { cursor: pointer; }
		tbody tr:hover { background: var(--row-hover); }
		tbody tr.active { background: var(--row-active); }
		th:nth-child(1), td:nth-child(1) {
			width: 1%;
			padding-left: 6px;
			padding-right: 6px;
			text-align: right;
			white-space: nowrap;
		}
		th:nth-child(2), td:nth-child(2) {
			width: auto;
			max-width: min(45vw, 512px);
		}
		th:nth-child(3), td:nth-child(3),
		th:nth-child(4), td:nth-child(4),
		th:nth-child(5), td:nth-child(5),
		th:nth-child(6), td:nth-child(6),
		th:nth-child(7), td:nth-child(7),
		th:nth-child(8), td:nth-child(8),
		th:nth-child(9), td:nth-child(9),
		th:nth-child(10), td:nth-child(10),
		th:nth-child(11), td:nth-child(11) {
			width: 1%;
			white-space: nowrap;
		}
		th:nth-child(1) .sort-ind {
			display: none;
		}
		.fn-name {
			font-weight: 600;
			line-height: 1.3;
			max-width: min(45vw, 512px);
			word-break: break-word;
			overflow-wrap: anywhere;
		}
		.fn-sub {
			color: var(--muted);
			font-size: 11px;
			margin-top: 2px;
			max-width: min(45vw, 512px);
			overflow-wrap: anywhere;
		}
		.crit-badge {
			display: inline-flex;
			align-items: center;
			font-size: 10px;
			line-height: 1.1;
			padding: 3px 6px;
			border-radius: 999px;
			border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
			background: color-mix(in srgb, var(--card-alt) 85%, transparent);
			color: var(--muted);
			white-space: nowrap;
		}
		.crit-low { color: #7fd39f; }
		.crit-medium { color: #c9d463; }
		.crit-high { color: #f0b25d; }
		.crit-critical { color: #f47d7d; }
		.severity-inline {
			display: inline-flex;
			align-items: center;
			gap: 6px;
		}
		.sev-dot {
			width: 8px;
			height: 8px;
			border-radius: 999px;
			display: inline-block;
		}
		.sev-low { background: #7fd39f; }
		.sev-medium { background: #c9d463; }
		.sev-high { background: #f0b25d; }
		.sev-critical { background: #f47d7d; }
		.badge {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 3px 8px;
			border-radius: 999px;
			background: var(--badge-bg);
			color: var(--badge-fg);
			font-size: 11px;
			font-weight: 600;
		}
		.side-content {
			padding: 10px 12px;
			display: grid;
			gap: 10px;
			flex: 1;
			min-height: 0;
			overflow: auto;
		}
		.side-block {
			border: 2px solid color-mix(in srgb, var(--border) 85%, transparent);
			border-radius: 10px;
			background: color-mix(in srgb, var(--card-alt) 25%, transparent);
			padding: 10px;
		}
		.section-title {
			font-size: 12px;
			color: var(--muted);
			text-transform: uppercase;
			letter-spacing: 0.3px;
			margin-bottom: 6px;
		}
		.metric-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 6px;
		}
		.metric-groups {
			display: grid;
			gap: 10px;
			grid-template-columns: 1fr;
		}
		.metric-group {
			display: grid;
			gap: 6px;
			align-content: start;
			border: 2px solid color-mix(in srgb, var(--border) 90%, transparent);
			border-radius: 10px;
			background: color-mix(in srgb, var(--card-alt) 30%, transparent);
			padding: 10px;
		}
		.metric-group .section-title {
			margin-bottom: 0;
			font-size: 11px;
			letter-spacing: 0.5px;
		}
		.group-head {
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.group-line {
			flex: 1;
			height: 1px;
			background: linear-gradient(
				to right,
				color-mix(in srgb, var(--accent) 50%, var(--border) 50%),
				color-mix(in srgb, var(--border) 65%, transparent)
			);
			opacity: 0.65;
		}
		.metric-group .metric-grid {
			grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		}
		.metric {
			border: 1px solid var(--border);
			border-radius: 8px;
			background: var(--card-alt);
			padding: 7px 8px;
		}
		.metric .m-label {
			color: var(--muted);
			font-size: 11px;
		}
		.metric .m-value {
			font-size: 13px;
			font-weight: 700;
			margin-top: 1px;
		}
		.list {
			display: grid;
			gap: 6px;
		}
		.list-item {
			display: grid;
			grid-template-columns: minmax(130px, 1fr) auto;
			gap: 8px;
			border: 1px solid var(--border);
			border-radius: 8px;
			background: var(--card-alt);
			padding: 7px 8px;
			font-size: 12px;
		}
		.icon {
			width: 14px;
			height: 14px;
			display: inline-block;
			vertical-align: middle;
		}
		@media (max-width: 1060px) {
			.layout {
				grid-template-columns: 1fr;
				height: auto;
			}
			.splitter {
				display: none;
			}
			.kpi-row {
				grid-template-columns: repeat(2, minmax(120px, 1fr));
			}
			.table-wrap {
				min-height: 52vh;
			}
		}
	</style>
</head>
<body>
	<div class="layout">
		<section class="panel">
			<div class="header">
				<div class="head-row">
					<div class="title">
						<span class="icon">${iconGraph()}</span>
						<span>${escapeHtmlAttr(ui.title)}</span>
					</div>
					<div class="head-actions">
						<span class="badge" id="badgeEvent">Event</span>
						<button id="toggleDetailsBtn" class="btn" type="button">${escapeHtmlAttr(ui.hideDetails)}</button>
					</div>
				</div>
				<div class="meta" id="docMeta"></div>
			</div>
			<div class="kpi-row" id="kpiRow"></div>
			<div class="toolbar">
				<div class="search">
					<span class="icon">${iconSearch()}</span>
					<input id="filterInput" class="input" type="text" placeholder="${escapeHtmlAttr(ui.searchPlaceholder)}" />
				</div>
			</div>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th data-sort="rank">${sortableHeader('#')}</th>
							<th data-sort="function">${sortableHeader(ui.function)}</th>
							<th data-sort="criticality">${sortableHeader(ui.criticality, ui.tipCriticality)}</th>
							<th data-sort="cpuSelf">${sortableHeader(ui.cpuSelf, ui.tipCpuSelf)}</th>
							<th data-sort="memSelf">${sortableHeader(ui.memSelf, ui.tipMemSelf)}</th>
							<th data-sort="timeTotal">${sortableHeader(ui.timeTotal, ui.tipTimeTotal)}</th>
							<th data-sort="calls">${sortableHeader(ui.calls, ui.tipCalls)}</th>
							<th data-sort="cpuAvg">${sortableHeader(ui.cpuAvg, ui.tipCpuAvg)}</th>
							<th data-sort="memAvg">${sortableHeader(ui.memAvg, ui.tipMemAvg)}</th>
							<th data-sort="timeAvg">${sortableHeader(ui.timeAvg, ui.tipTimeAvg)}</th>
							<th data-sort="pctSelf">${sortableHeader(ui.pctSelf, ui.tipPctSelf)}</th>
						</tr>
					</thead>
					<tbody id="hotspotsBody"></tbody>
				</table>
			</div>
		</section>
		<div id="splitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="Resize panels"></div>
		<section class="panel" id="detailsPanel">
			<div class="header">
				<div class="head-row">
					<div class="title">
						<span class="icon">${iconFunction()}</span>
						<span id="selectedTitle">${escapeHtmlAttr(ui.selectFunction)}</span>
					</div>
					<button id="openSourceBtn" class="btn" disabled>
						<span class="icon">${iconOpen()}</span>
						${escapeHtmlAttr(ui.openSource)}
					</button>
				</div>
				<div class="meta" id="selectedLocation">${escapeHtmlAttr(ui.source)}: ${escapeHtmlAttr(ui.unknown)}</div>
			</div>
			<div class="side-content">
				<div class="side-block">
					<div class="section-title">${escapeHtmlAttr(ui.metrics)}</div>
					<div class="metric-groups" id="selectedMetrics"></div>
				</div>
				<div class="side-block">
					<div class="section-title">${escapeHtmlAttr(ui.structure)}</div>
					<div class="metric-grid" id="selectedStructure"></div>
				</div>
				<div class="side-block">
					<div class="section-title"><span class="info-wrap"><span>${escapeHtmlAttr(ui.callers)}</span><span class="info-dot" data-tip="${escapeHtmlAttr(ui.tipCallersSection)}">i</span></span></div>
					<div class="list" id="callersList"></div>
				</div>
				<div class="side-block">
					<div class="section-title"><span class="info-wrap"><span>${escapeHtmlAttr(ui.callees)}</span><span class="info-dot" data-tip="${escapeHtmlAttr(ui.tipCalleesSection)}">i</span></span></div>
					<div class="list" id="calleesList"></div>
				</div>
			</div>
		</section>
	</div>
	<div id="floatingTip" class="tooltip-float" role="tooltip" aria-hidden="true"></div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const state = ${state};
		const ui = state.ui;
		const profile = state.profile;
		const primaryEvent = profile.primaryEvent || profile.events[0] || 'cost';
		const cpuEvent = detectCpuEvent(profile.events);
		const memEvent = detectMemoryEvent(profile.events);

		const byId = new Map(profile.functions.map((fn) => [fn.id, fn]));
		const rankById = new Map(
			[...profile.functions]
				.sort((a, b) => getPrimarySelf(b) - getPrimarySelf(a))
				.map((fn, idx) => [fn.id, idx + 1])
		);
		let selectedId = profile.functions[0] ? profile.functions[0].id : undefined;
		let filtered = [...profile.functions];
		let sortKey = 'criticality';
		let sortDir = 'desc';
		const totals = makeSummaryTotals(profile);
		const primarySelfTotal = profile.totalSelf || totals[primaryEvent] || 0;
		const cpuSelfTotal = cpuEvent ? Number(totals[cpuEvent] || 0) : 0;
		const memSelfTotal = memEvent ? Number(totals[memEvent] || 0) : 0;
		const metricHelp = {
			functions: ui.helpFunctions,
			totalCalls: ui.helpTotalCalls,
			primaryTotal: ui.helpPrimaryTotal,
			events: ui.helpEvents,
			cpu: ui.helpCpu,
			memory: ui.helpMemory,
			cpuSelf: ui.helpCpuSelf,
			memSelf: ui.helpMemSelf,
			selfCost: ui.helpSelfCost,
			inclusiveCost: ui.helpInclusiveCost,
			calls: ui.helpCalls,
			callsObserved: ui.helpCallsObserved,
			callsEffective: ui.helpCallsEffective,
			cpuAvg: ui.helpCpuAvg,
			memAvg: ui.helpMemAvg,
			timeTotal: ui.helpTimeTotal,
			timeAvg: ui.helpTimeAvg,
			avgSelf: ui.helpAvgSelf,
			avgInclusive: ui.helpAvgInclusive,
			pctTotal: ui.helpPctSelf,
			criticality: ui.helpCriticality,
			cpuShare: ui.helpCpuShare,
			memShare: ui.helpMemShare,
			fanIn: ui.helpFanIn,
			fanOut: ui.helpFanOut,
			amplification: ui.helpAmplification,
			delegation: ui.helpDelegation,
			depthMin: ui.helpDepthMin,
			topCallee: ui.helpTopCallee,
			shareDelta: ui.helpShareDelta,
			hotPathScore: ui.helpHotPathScore,
			churnRisk: ui.helpChurnRisk,
			cpuPerKb: ui.helpCpuPerKb,
			kbPerCpu: ui.helpKbPerCpu
		};

		const docMeta = document.getElementById('docMeta');
		const kpiRow = document.getElementById('kpiRow');
		const badgeEvent = document.getElementById('badgeEvent');
		const filterInput = document.getElementById('filterInput');
		const hotspotsBody = document.getElementById('hotspotsBody');
		const selectedTitle = document.getElementById('selectedTitle');
		const selectedLocation = document.getElementById('selectedLocation');
		const selectedMetrics = document.getElementById('selectedMetrics');
		const selectedStructure = document.getElementById('selectedStructure');
		const callersList = document.getElementById('callersList');
		const calleesList = document.getElementById('calleesList');
		const openSourceBtn = document.getElementById('openSourceBtn');
		const floatingTip = document.getElementById('floatingTip');
		const splitter = document.getElementById('splitter');
		const layout = document.querySelector('.layout');
		const toggleDetailsBtn = document.getElementById('toggleDetailsBtn');
		const sortHeaders = Array.from(document.querySelectorAll('th[data-sort]'));
		let detailsHidden = localStorage.getItem('xdebugViewerDetailsHidden') === '1';
		const primaryGraphCache = buildGraphCache(profile.functions, primaryEvent);

		docMeta.textContent = state.documentName + ' | ' + state.documentPath;
		badgeEvent.textContent = ui.primary + ': ' + primaryEvent;
		renderKpis();

		filterInput.addEventListener('input', () => {
			const query = filterInput.value.trim();
			filtered = profile.functions.filter((fn) => matchesQuery(fn.name, query));
			if (!filtered.some((fn) => fn.id === selectedId)) {
				selectedId = filtered[0] ? filtered[0].id : undefined;
			}
			renderTable();
			renderSelected();
		});

		openSourceBtn.addEventListener('click', () => {
			const fn = byId.get(selectedId);
			if (!fn || !fn.file) {
				return;
			}
			vscode.postMessage({
				type: 'openSource',
				file: fn.file,
				line: fn.line
			});
		});
		if (toggleDetailsBtn) {
			toggleDetailsBtn.addEventListener('click', () => {
				detailsHidden = !detailsHidden;
				localStorage.setItem('xdebugViewerDetailsHidden', detailsHidden ? '1' : '0');
				updateDetailsPanelVisibility();
			});
		}

		renderTable();
		renderSelected();
		setupAdaptiveTooltips();
		setupResizablePanels();
		setupSorting();
		updateDetailsPanelVisibility();

		function renderKpis() {
			const cards = [
				kpi(ui.functions, formatInt(profile.functions.length), metricHelp.functions),
				kpi(ui.totalCalls, formatInt(profile.totalCalls), metricHelp.totalCalls),
				kpi(ui.primarySelfTotal, formatMetric(primarySelfTotal, primaryEvent), metricHelp.primaryTotal),
				kpi(ui.events, profile.events.length + '', metricHelp.events)
			];
			if (cpuEvent) {
				cards.push(kpi(ui.cpu, formatMetric(totals[cpuEvent] || 0, cpuEvent), metricHelp.cpu));
			}
			if (memEvent) {
				cards.push(kpi(ui.memory, formatMetric(totals[memEvent] || 0, memEvent), metricHelp.memory));
			}
			kpiRow.innerHTML = cards.join('');
		}

		function renderTable() {
			hotspotsBody.innerHTML = '';
			const sorted = sortRows(filtered);
			for (let i = 0; i < sorted.length; i += 1) {
				const fn = sorted[i];
				const row = document.createElement('tr');
				if (fn.id === selectedId) {
					row.className = 'active';
				}
				const selfPrimary = getPrimarySelf(fn);
				const cpuSelf = cpuEvent ? getEventSelf(fn, cpuEvent) : 0;
				const memSelf = memEvent ? getEventSelf(fn, memEvent) : 0;
				const timeTotal = cpuEvent ? getEventInclusive(fn, cpuEvent) : 0;
				const callsObserved = Number(fn.callsObserved || 0);
				const callsEffective = Number(fn.callsEffective || 0);
				const cpuAvg = callsEffective > 0 ? cpuSelf / callsEffective : 0;
				const memAvg = callsEffective > 0 ? memSelf / callsEffective : 0;
				const timeAvg = callsEffective > 0 ? timeTotal / callsEffective : 0;
				const pct = ratio(selfPrimary, primarySelfTotal);
				const criticalityPct = computeCriticalityPct(fn, cpuSelf, memSelf);
				row.innerHTML =
					'<td>' + formatInt(rankById.get(fn.id) || i + 1) + '</td>' +
					'<td>' +
						'<div class="fn-name">' + escapeHtml(fn.name) + '</div>' +
						'<div class="fn-sub">' + escapeHtml(fileLine(fn.file, fn.line)) + '</div>' +
					'</td>' +
					'<td>' + formatCriticality(criticalityPct) + '</td>' +
					'<td>' + (cpuEvent ? formatMetric(cpuSelf, cpuEvent) : '-') + '</td>' +
					'<td>' + (memEvent ? formatMetric(memSelf, memEvent) : '-') + '</td>' +
					'<td>' + (cpuEvent ? formatMetric(timeTotal, cpuEvent) : '-') + '</td>' +
					'<td>' + formatInt(callsObserved) + '</td>' +
					'<td>' + (cpuEvent ? formatMetric(cpuAvg, cpuEvent) : '-') + '</td>' +
					'<td>' + (memEvent ? formatMetric(memAvg, memEvent) : '-') + '</td>' +
					'<td>' + (cpuEvent ? formatMetric(timeAvg, cpuEvent) : '-') + '</td>' +
					'<td>' + pct.toFixed(2) + '%</td>';
				row.addEventListener('click', () => {
					selectedId = fn.id;
					renderTable();
					renderSelected();
				});
				hotspotsBody.appendChild(row);
			}
		}

		function renderSelected() {
			const fn = byId.get(selectedId);
			if (!fn) {
				selectedTitle.textContent = ui.noFunctionSelected;
				selectedLocation.textContent = ui.source + ': ' + ui.unknown;
				openSourceBtn.disabled = true;
				selectedMetrics.innerHTML = '<div class="metric"><div class="m-value">' + escapeHtml(ui.noData) + '</div></div>';
				selectedStructure.innerHTML = '<div class="metric"><div class="m-value">' + escapeHtml(ui.noData) + '</div></div>';
				callersList.innerHTML = '<div class="fn-sub">' + escapeHtml(ui.none) + '</div>';
				calleesList.innerHTML = '<div class="fn-sub">' + escapeHtml(ui.none) + '</div>';
				return;
			}

			selectedTitle.textContent = fn.name;
			selectedLocation.textContent = ui.source + ': ' + fileLine(fn.file, fn.line);
			openSourceBtn.disabled = !fn.file;

			const selfPrimary = getPrimarySelf(fn);
			const inclusivePrimary = getEventInclusive(fn, primaryEvent);
			const cpuSelf = cpuEvent ? getEventSelf(fn, cpuEvent) : undefined;
			const memSelf = memEvent ? getEventSelf(fn, memEvent) : undefined;
			const callsObserved = Number(fn.callsObserved || 0);
			const callsEffective = Number(fn.callsEffective || 0);
			const cpuAvg = cpuEvent && callsEffective > 0 ? (cpuSelf || 0) / callsEffective : 0;
			const memAvg = memEvent && callsEffective > 0 ? (memSelf || 0) / callsEffective : 0;
			const avgSelf = callsEffective > 0 ? selfPrimary / callsEffective : 0;
			const avgInclusive = callsEffective > 0 ? inclusivePrimary / callsEffective : 0;
			const criticalityPct = computeCriticalityPct(fn, cpuSelf || 0, memSelf || 0);
			const cpuShare = cpuEvent && cpuSelfTotal > 0 ? ratio(cpuSelf || 0, cpuSelfTotal) : 0;
			const memShare = memEvent && memSelfTotal > 0 ? ratio(memSelf || 0, memSelfTotal) : 0;
			const selfSharePrimary = ratio(selfPrimary, primarySelfTotal);
			const fanIn = fn.callers.length;
			const fanOut = fn.callees.length;
			const amplification = inclusivePrimary / Math.max(selfPrimary, 1);
			const delegated = Math.max(inclusivePrimary - selfPrimary, 0);
			const delegationRatio = delegated / Math.max(inclusivePrimary, 1);
			const delegationPct = delegationRatio * 100;
			const maxFanIn = Number(profile.maxFanIn || 0);
			const maxFanOut = Number(profile.maxFanOut || 0);
			const maxDegree = Number(profile.maxDegree || 0);
			const inboundCost = Number(primaryGraphCache.inboundCostById.get(fn.id) || 0);
			const maxInboundCost = Number(primaryGraphCache.maxInboundCost || 0);
			const gainBase = cpuEvent ? cpuShare : selfSharePrimary;
			const hotspotFactor = computeHotspotFactor(callsEffective, primaryGraphCache.maxCallsEffective);
			const hotPathScore = computeGainPotential(gainBase, delegationRatio, hotspotFactor);
			const churnRisk = computeChurnRisk(
				fanIn,
				fanOut,
				maxFanIn,
				maxDegree,
				inboundCost,
				maxInboundCost
			);
			const topCallee = findTopCalleeByEvent(fn, primaryEvent);
			const topCalleeCost = topCallee ? getEdgeInclusive(topCallee, primaryEvent) : 0;
			const topCalleeShare = delegated > 0 ? clampPct((topCalleeCost / Math.max(delegated, 1)) * 100) : 0;
			const depthMin = primaryGraphCache.depthById.has(fn.id) ? primaryGraphCache.depthById.get(fn.id) : undefined;
			const cpuCards = [];
			const memoryCards = [];
			const timeCards = [];
			const otherCards = [];
			otherCards.push(
				metric(ui.callsObserved, formatInt(callsObserved), metricHelp.callsObserved),
				metric(ui.callsEffective, formatInt(callsEffective), metricHelp.callsEffective),
				metricRaw(ui.criticality, formatSeverityWithLabel(criticalityPct, getCriticalityLabel(criticalityPct) + ' ' + criticalityPct.toFixed(1) + '%'), metricHelp.criticality),
				metricRaw(ui.hotPathScore, formatSeverityPercent(hotPathScore), metricHelp.hotPathScore),
				metricRaw(ui.churnRisk, formatSeverityPercent(churnRisk), metricHelp.churnRisk)
			);
			if (cpuEvent) {
				cpuCards.push(
					metric(ui.cpuSelf, formatMetric(cpuSelf || 0, cpuEvent), metricHelp.cpuSelf),
					metric(ui.cpuAvg, formatMetric(cpuAvg, cpuEvent), metricHelp.cpuAvg),
					metricRaw(ui.cpuShare, formatSeverityPercent(cpuShare), metricHelp.cpuShare)
				);
			}
			if (memEvent) {
				memoryCards.push(
					metric(ui.memSelf, formatMetric(memSelf || 0, memEvent), metricHelp.memSelf),
					metric(ui.memAvg, formatMetric(memAvg, memEvent), metricHelp.memAvg),
					metricRaw(ui.memShare, formatSeverityPercent(memShare), metricHelp.memShare)
				);
			}
			timeCards.push(
				metric(ui.selfCost, formatMetric(selfPrimary, primaryEvent), metricHelp.selfCost),
				metric(ui.inclusiveCost, formatMetric(inclusivePrimary, primaryEvent), metricHelp.inclusiveCost),
				metric(ui.avgSelf, formatMetric(avgSelf, primaryEvent), metricHelp.avgSelf),
				metric(ui.avgInclusive, formatMetric(avgInclusive, primaryEvent), metricHelp.avgInclusive)
			);
			if (cpuEvent) {
				timeCards.push(
					metric(ui.timeTotal, formatMetric(inclusivePrimary, cpuEvent), metricHelp.timeTotal),
					metric(ui.timeAvg, formatMetric(avgInclusive, cpuEvent), metricHelp.timeAvg)
				);
			}
			selectedMetrics.innerHTML = [
				renderMetricGroup(ui.groupCpu, cpuCards),
				renderMetricGroup(ui.groupMemory, memoryCards),
				renderMetricGroup(ui.groupTime, timeCards),
				renderMetricGroup(ui.groupOther, otherCards)
			].join('');
			const topCalleeValue = topCallee
				? escapeHtml(topCallee.name) + '<br><span class="fn-sub">' + escapeHtml(
					formatMetric(topCalleeCost, primaryEvent) + ' | ' + topCalleeShare.toFixed(2) + '%'
				) + '</span>'
				: escapeHtml(ui.none);
			const structureCards = [
				metric(ui.fanIn, formatInt(fanIn), metricHelp.fanIn),
				metric(ui.fanOut, formatInt(fanOut), metricHelp.fanOut),
				metric(ui.amplification, formatDecimal(amplification), metricHelp.amplification),
				metric(ui.delegation, formatPercent(delegationPct), metricHelp.delegation),
				metric(ui.depthMin, depthMin === undefined ? ui.unreachable : formatInt(depthMin), metricHelp.depthMin),
				metricRaw(ui.topCallee, topCalleeValue, metricHelp.topCallee)
			];
			selectedStructure.innerHTML = structureCards.join('');

			callersList.innerHTML = renderEdges(fn.callers, inclusivePrimary);
			calleesList.innerHTML = renderEdges(fn.callees, delegated);
		}

		function renderEdges(edges, baseCost) {
			if (!edges || edges.length === 0) {
				return '<div class="fn-sub">' + escapeHtml(ui.none) + '</div>';
			}
			const sorted = [...edges].sort((a, b) => getEdgeInclusive(b, primaryEvent) - getEdgeInclusive(a, primaryEvent));
			return sorted.slice(0, 30).map((edge) =>
				(() => {
					const edgeCost = getEdgeInclusive(edge, primaryEvent);
					const edgeShare = baseCost > 0 ? clampPct((edgeCost / baseCost) * 100) : 0;
					return '<div class="list-item">' +
						'<div>' + escapeHtml(edge.name) + '</div>' +
						'<div>' + escapeHtml(
							formatMetric(edgeCost, primaryEvent) + ' | ' + formatInt(edge.calls) + ' calls | ' + edgeShare.toFixed(2) + '%'
						) + '</div>' +
					'</div>';
				})()
			).join('');
		}

		function makeSummaryTotals(profileData) {
			const map = { ...(profileData.summaryByEvent || {}) };
			if (Object.keys(map).length > 0) {
				return map;
			}
			for (const eventName of profileData.events || []) {
				map[eventName] = 0;
			}
			for (const fn of profileData.functions) {
				for (const eventName of profileData.events || []) {
					const item = fn.eventCosts && fn.eventCosts[eventName];
					map[eventName] = (map[eventName] || 0) + (item ? item.self : 0);
				}
			}
			return map;
		}

		function detectCpuEvent(events) {
			return (events || []).find((eventName) => /time|cpu|cycle|instr|ir|ticks/i.test(eventName));
		}

		function detectMemoryEvent(events) {
			return (events || []).find((eventName) => /mem|byte|alloc|rss|heap/i.test(eventName));
		}

		function getEventSelf(fn, eventName) {
			if (!eventName) {
				return 0;
			}
			const eventCost = fn.eventCosts && fn.eventCosts[eventName];
			return eventCost ? Number(eventCost.self || 0) : 0;
		}

		function getEventInclusive(fn, eventName) {
			if (!eventName) {
				return Number(fn.inclusive || 0);
			}
			const eventCost = fn.eventCosts && fn.eventCosts[eventName];
			if (eventCost && Number.isFinite(Number(eventCost.inclusive))) {
				return Number(eventCost.inclusive);
			}
			return Number(fn.inclusive || 0);
		}

		function getEdgeInclusive(edge, eventName) {
			if (!eventName) {
				return Number(edge.inclusive || 0);
			}
			const eventCost = edge.eventCosts && edge.eventCosts[eventName];
			if (eventCost && Number.isFinite(Number(eventCost.inclusive))) {
				return Number(eventCost.inclusive);
			}
			return Number(edge.inclusive || 0);
		}

		function getPrimarySelf(fn) {
			const byEvent = getEventSelf(fn, primaryEvent);
			if (byEvent > 0) {
				return byEvent;
			}
			return Number(fn.self || 0);
		}

		function computeCriticalityPct(fn, cpuSelf, memSelf) {
			const parts = [];
			if (cpuEvent && cpuSelfTotal > 0) {
				parts.push(ratio(cpuSelf, cpuSelfTotal));
			}
			if (memEvent && memSelfTotal > 0) {
				parts.push(ratio(memSelf, memSelfTotal));
			}
			if (parts.length === 0) {
				return ratio(getPrimarySelf(fn), primarySelfTotal);
			}
			return parts.reduce((sum, value) => sum + value, 0) / parts.length;
		}

		function computeGainPotential(gainBasePct, delegationRatio, hotspotFactor) {
			const gainBase = clampPct(gainBasePct) / 100;
			const executionFactor = clamp(1 - delegationRatio, 0, 1);
			const hotspot = clamp(hotspotFactor, 0, 1);
			const score = 100 * ((0.65 * gainBase) + (0.25 * executionFactor) + (0.10 * hotspot));
			return clampPct(score);
		}

		function computeChurnRisk(fanIn, fanOut, maxFanIn, maxDegree, inboundCost, maxInboundCost) {
			const fanInNorm = maxFanIn > 0 ? fanIn / maxFanIn : 0;
			const degreeNorm = maxDegree > 0 ? (fanIn + fanOut) / maxDegree : 0;
			const inboundNorm = maxInboundCost > 0 ? inboundCost / maxInboundCost : degreeNorm;
			const score = 100 * ((0.45 * fanInNorm) + (0.25 * degreeNorm) + (0.30 * inboundNorm));
			return clampPct(score);
		}

		function computeHotspotFactor(callsEffective, maxCalls) {
			if (callsEffective <= 0 || maxCalls <= 0) {
				return 0;
			}
			return Math.log1p(callsEffective) / Math.log1p(maxCalls);
		}

		function findTopCalleeByEvent(fn, eventName) {
			if (!fn.callees || fn.callees.length === 0) {
				return undefined;
			}
			let best;
			let bestCost = -1;
			for (const edge of fn.callees) {
				const cost = getEdgeInclusive(edge, eventName);
				if (cost > bestCost) {
					bestCost = cost;
					best = edge;
				}
			}
			return best;
		}

		function buildGraphCache(functions, eventName) {
			const byIdLocal = new Map(functions.map((fn) => [fn.id, fn]));
			const inboundCostById = new Map();
			const depthById = new Map();
			const adjacency = new Map();
			const indegree = new Map();
			let maxInboundCost = 0;
			let maxCallsEffective = 0;

			for (const fn of functions) {
				const fnId = fn.id;
				adjacency.set(fnId, []);
				indegree.set(fnId, fn.callers ? fn.callers.length : 0);
				maxCallsEffective = Math.max(maxCallsEffective, Number(fn.callsEffective || 0));
				let inbound = 0;
				for (const callerEdge of fn.callers || []) {
					inbound += getEdgeInclusive(callerEdge, eventName);
				}
				inboundCostById.set(fnId, inbound);
				maxInboundCost = Math.max(maxInboundCost, inbound);
			}

			for (const fn of functions) {
				const fromId = fn.id;
				for (const calleeEdge of fn.callees || []) {
					const toId = buildFunctionId(calleeEdge.name, calleeEdge.file);
					if (!byIdLocal.has(toId)) {
						continue;
					}
					adjacency.get(fromId).push(toId);
				}
			}

			const queue = [];
			for (const fn of functions) {
				if (isEntryPoint(fn) || (indegree.get(fn.id) || 0) === 0) {
					depthById.set(fn.id, 0);
					queue.push(fn.id);
				}
			}
			let cursor = 0;
			while (cursor < queue.length) {
				const currentId = queue[cursor];
				cursor += 1;
				const currentDepth = Number(depthById.get(currentId) || 0);
				const nextNodes = adjacency.get(currentId) || [];
				for (const nextId of nextNodes) {
					const candidate = currentDepth + 1;
					const prev = depthById.get(nextId);
					if (prev === undefined || candidate < prev) {
						depthById.set(nextId, candidate);
						queue.push(nextId);
					}
				}
			}

			return {
				depthById,
				inboundCostById,
				maxInboundCost,
				maxCallsEffective
			};
		}

		function isEntryPoint(fn) {
			if ((fn.callers || []).length === 0) {
				return true;
			}
			const name = String(fn.name || '').toLowerCase();
			return name === 'main' ||
				name === '{main}' ||
				name.endsWith(':main') ||
				name.endsWith('/main') ||
				name.endsWith('\\main') ||
				name.includes('{main}');
		}

		function buildFunctionId(name, file) {
			return String(name || '[unknown]') + String.fromCharCode(0) + String(file || '');
		}

		function getCriticalityLabel(score) {
			if (score >= 35) {
				return ui.criticalityCritical;
			}
			if (score >= 18) {
				return ui.criticalityHigh;
			}
			if (score >= 7) {
				return ui.criticalityMedium;
			}
			return ui.criticalityLow;
		}

		function getCriticalityClass(score) {
			if (score >= 35) {
				return 'crit-critical';
			}
			if (score >= 18) {
				return 'crit-high';
			}
			if (score >= 7) {
				return 'crit-medium';
			}
			return 'crit-low';
		}

		function formatCriticality(score) {
			const label = getCriticalityLabel(score);
			const klass = getCriticalityClass(score);
			return '<span class="crit-badge ' + klass + '" title="Combined self criticality (CPU + Memory)">' +
				escapeHtml(label + ' ' + score.toFixed(1) + '%') +
			'</span>';
		}

		function formatSeverityPercent(score) {
			if (!Number.isFinite(score)) {
				return '-';
			}
			return formatSeverityWithLabel(score, score.toFixed(2) + '%');
		}

		function formatSeverityWithLabel(score, label) {
			if (!Number.isFinite(score)) {
				return '-';
			}
			const klass = getCriticalityClass(score).replace('crit-', 'sev-');
			return '<span class="severity-inline">' +
				'<span class="sev-dot ' + klass + '"></span>' +
				'<span>' + escapeHtml(label) + '</span>' +
			'</span>';
		}

		function matchesQuery(text, query) {
			if (!query) {
				return true;
			}
			if (query.startsWith('/') && query.endsWith('/') && query.length > 2) {
				try {
					return new RegExp(query.slice(1, -1), 'i').test(text);
				} catch {
					return text.toLowerCase().includes(query.toLowerCase());
				}
			}
			return text.toLowerCase().includes(query.toLowerCase());
		}

		function ratio(value, total) {
			if (!total) {
				return 0;
			}
			return (value / total) * 100;
		}

		function clampPct(value) {
			return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
		}

		function formatMetric(value, eventName) {
			if (/mem|byte/i.test(eventName)) {
				return formatBytes(value);
			}
			if (isTimeEvent(eventName)) {
				return formatTime(value, eventName);
			}
			return formatInt(value);
		}

		function isTimeEvent(eventName) {
			return /time|ns|us|µs|μs|ms|sec|second|minute|hour/i.test(String(eventName || ''));
		}

		function formatTime(value, eventName) {
			const scaleNs = getTimeScaleNs(eventName);
			if (!scaleNs) {
				return formatInt(value) + ' ticks';
			}
			const totalNs = Number(value || 0) * scaleNs;
			const abs = Math.abs(totalNs);
			if (abs >= 1e9) {
				return (totalNs / 1e9).toFixed(2) + ' s';
			}
			if (abs >= 1e6) {
				return (totalNs / 1e6).toFixed(2) + ' ms';
			}
			if (abs >= 1e3) {
				return (totalNs / 1e3).toFixed(2) + ' us';
			}
			return totalNs.toFixed(0) + ' ns';
		}

		function getTimeScaleNs(eventName) {
			const declared = profile.eventScaleNs && profile.eventScaleNs[eventName];
			if (Number.isFinite(Number(declared)) && Number(declared) > 0) {
				return Number(declared);
			}
			const text = String(eventName || '').toLowerCase();
			const tuple = text.match(/\((\d+(?:[.,]\d+)?)\s*(ns|us|µs|μs|ms|s|nsec|usec|msec|sec)\)/i);
			if (tuple) {
				const amount = Number(tuple[1].replace(',', '.'));
				const unit = tuple[2].toLowerCase();
				return amount * unitToNs(unit);
			}
			const inline = text.match(/(\d+(?:[.,]\d+)?)\s*(ns|us|µs|μs|ms|s|nsec|usec|msec|sec)\b/i);
			if (inline) {
				const amount = Number(inline[1].replace(',', '.'));
				const unit = inline[2].toLowerCase();
				return amount * unitToNs(unit);
			}
			if (/\bns\b/i.test(text)) {
				return 1;
			}
			if (/\b(us|µs|μs)\b/i.test(text)) {
				return 1e3;
			}
			if (/\bms\b/i.test(text)) {
				return 1e6;
			}
			if (/\bs\b|sec|second/i.test(text)) {
				return 1e9;
			}
			return undefined;
		}

		function unitToNs(unit) {
			switch (unit) {
				case 'ns':
				case 'nsec':
					return 1;
				case 'us':
				case 'µs':
				case 'μs':
				case 'usec':
					return 1e3;
				case 'ms':
				case 'msec':
					return 1e6;
				case 's':
				case 'sec':
					return 1e9;
				default:
					return 1;
			}
		}

		function formatPercent(value) {
			return Number.isFinite(value) ? value.toFixed(2) + '%' : '-';
		}

		function formatSignedPercent(value) {
			if (!Number.isFinite(value)) {
				return '-';
			}
			const sign = value > 0 ? '+' : '';
			return sign + value.toFixed(2) + '%';
		}

		function formatDecimal(value) {
			if (value === undefined || value === null || !Number.isFinite(value)) {
				return '-';
			}
			if (Math.abs(value) >= 1000) {
				return formatInt(value);
			}
			return value.toFixed(4);
		}

		function formatBytes(value) {
			const v = Number(value || 0);
			const a = Math.abs(v);
			if (a >= 1024 * 1024 * 1024) {
				return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
			}
			if (a >= 1024 * 1024) {
				return (v / (1024 * 1024)).toFixed(2) + ' MB';
			}
			if (a >= 1024) {
				return (v / 1024).toFixed(2) + ' KB';
			}
			return formatInt(v) + ' B';
		}

		function formatInt(value) {
			return new Intl.NumberFormat().format(Math.round(Number(value || 0)));
		}

		function fileLine(file, line) {
			if (!file) {
				return ui.unknown;
			}
			return line ? file + ':' + line : file;
		}

		function escapeHtml(value) {
			const text = String(value || '');
			return text
				.replaceAll('&', '&amp;')
				.replaceAll('<', '&lt;')
				.replaceAll('>', '&gt;')
				.replaceAll('"', '&quot;')
				.replaceAll("'", '&#39;');
		}

		function kpi(label, value, tip) {
			return '<div class="kpi"><div class="label">' + info(label, tip) + '</div><div class="value">' + escapeHtml(value) + '</div></div>';
		}

		function metric(label, value, tip) {
			return '<div class="metric"><div class="m-label">' + info(label, tip) + '</div><div class="m-value">' + escapeHtml(value) + '</div></div>';
		}

		function metricRaw(label, valueHtml, tip) {
			return '<div class="metric"><div class="m-label">' + info(label, tip) + '</div><div class="m-value">' + valueHtml + '</div></div>';
		}

		function renderMetricGroup(title, cards) {
			if (!cards || cards.length === 0) {
				return '';
			}
			return '<div class="metric-group">' +
				'<div class="group-head">' +
					'<div class="section-title">' + escapeHtml(title) + '</div>' +
					'<div class="group-line"></div>' +
				'</div>' +
				'<div class="metric-grid">' + cards.join('') + '</div>' +
			'</div>';
		}

		function info(label, tip) {
			if (!tip) {
				return escapeHtml(label);
			}
			return '<span class="info-wrap">' +
				'<span>' + escapeHtml(label) + '</span>' +
				'<span class="info-dot" data-tip="' + escapeHtml(tip) + '">i</span>' +
			'</span>';
		}

		function setupAdaptiveTooltips() {
			let activeDot = null;
			document.addEventListener('mouseover', (event) => {
				const target = event.target instanceof Element ? event.target.closest('.info-dot') : null;
				if (!target) {
					return;
				}
				activeDot = target;
				showTooltip(target);
			});
			document.addEventListener('mousemove', (event) => {
				if (!activeDot) {
					return;
				}
				positionTooltip(activeDot, event.clientX, event.clientY);
			});
			document.addEventListener('mouseout', (event) => {
				if (!activeDot) {
					return;
				}
				const nextTarget = event.relatedTarget instanceof Element ? event.relatedTarget.closest('.info-dot') : null;
				if (nextTarget === activeDot) {
					return;
				}
				hideTooltip();
				activeDot = null;
			});
			document.addEventListener('scroll', () => {
				if (activeDot) {
					positionTooltip(activeDot);
				}
			}, true);
		}

		function showTooltip(dot) {
			if (!floatingTip) {
				return;
			}
			const tip = dot.getAttribute('data-tip');
			if (!tip) {
				return;
			}
			floatingTip.textContent = tip;
			floatingTip.classList.add('show');
			floatingTip.setAttribute('aria-hidden', 'false');
			positionTooltip(dot);
		}

		function hideTooltip() {
			if (!floatingTip) {
				return;
			}
			floatingTip.classList.remove('show');
			floatingTip.setAttribute('aria-hidden', 'true');
		}

		function positionTooltip(dot, mouseX, mouseY) {
			if (!floatingTip) {
				return;
			}
			const rect = dot.getBoundingClientRect();
			const tipRect = floatingTip.getBoundingClientRect();
			const margin = 10;

			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const spaceRight = viewportWidth - rect.right;
			const spaceLeft = rect.left;
			const spaceBottom = viewportHeight - rect.bottom;
			const spaceTop = rect.top;

			let top;
			let left;

			if (spaceBottom >= tipRect.height + margin) {
				top = rect.bottom + margin;
			} else if (spaceTop >= tipRect.height + margin) {
				top = rect.top - tipRect.height - margin;
			} else {
				const preferredY = mouseY ?? rect.bottom + margin;
				top = clamp(preferredY, margin, viewportHeight - tipRect.height - margin);
			}

			if (spaceRight >= tipRect.width + margin) {
				left = rect.left;
			} else if (spaceLeft >= tipRect.width + margin) {
				left = rect.right - tipRect.width;
			} else {
				const preferredX = mouseX ?? rect.left;
				left = clamp(preferredX, margin, viewportWidth - tipRect.width - margin);
			}

			floatingTip.style.top = top + 'px';
			floatingTip.style.left = left + 'px';
		}

		function clamp(value, min, max) {
			return Math.max(min, Math.min(max, value));
		}

		function setupSorting() {
			updateSortHeaders();
			for (const header of sortHeaders) {
				header.addEventListener('click', () => {
					const key = header.getAttribute('data-sort');
					if (!key) {
						return;
					}
					if (sortKey === key) {
						sortDir = sortDir === 'asc' ? 'desc' : 'asc';
					} else {
						sortKey = key;
						sortDir = key === 'function' ? 'asc' : 'desc';
					}
					updateSortHeaders();
					renderTable();
				});
			}
		}

		function updateSortHeaders() {
			for (const header of sortHeaders) {
				const key = header.getAttribute('data-sort');
				header.classList.remove('sort-asc', 'sort-desc');
				const ind = header.querySelector('.sort-ind');
				if (ind) {
					ind.textContent = '↕';
				}
				if (key === sortKey) {
					header.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
					if (ind) {
						ind.textContent = sortDir === 'asc' ? '↑' : '↓';
					}
				}
			}
		}

		function sortRows(rows) {
			const sorted = [...rows];
			sorted.sort((a, b) => {
				const av = getSortValue(a, sortKey);
				const bv = getSortValue(b, sortKey);
				if (typeof av === 'string' || typeof bv === 'string') {
					return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
				}
				return Number(av) - Number(bv);
			});
			if (sortDir === 'desc') {
				sorted.reverse();
			}
			return sorted;
		}

		function getSortValue(fn, key) {
			const cpuSelf = cpuEvent ? getEventSelf(fn, cpuEvent) : 0;
			const memSelf = memEvent ? getEventSelf(fn, memEvent) : 0;
			const timeTotal = cpuEvent ? getEventInclusive(fn, cpuEvent) : 0;
			const callsObserved = Number(fn.callsObserved || 0);
			const callsEffective = Number(fn.callsEffective || 0);
			switch (key) {
				case 'rank':
					return Number(rankById.get(fn.id) || 0);
				case 'function':
					return String(fn.name || '');
				case 'cpuSelf':
					return cpuSelf;
				case 'memSelf':
					return memSelf;
				case 'timeTotal':
					return timeTotal;
				case 'calls':
					return callsObserved;
				case 'cpuAvg':
					return callsEffective > 0 ? cpuSelf / callsEffective : 0;
				case 'memAvg':
					return callsEffective > 0 ? memSelf / callsEffective : 0;
				case 'timeAvg':
					return callsEffective > 0 ? timeTotal / callsEffective : 0;
				case 'pctSelf': {
					const selfPrimary = getPrimarySelf(fn);
					return ratio(selfPrimary, primarySelfTotal);
				}
				case 'criticality':
					return computeCriticalityPct(fn, cpuSelf, memSelf);
				default:
					return 0;
			}
		}

		function setupResizablePanels() {
			if (!splitter || !layout) {
				return;
			}
			const saved = Number(localStorage.getItem('xdebugViewerLeftWidthPct') || '');
			if (Number.isFinite(saved) && saved >= 35 && saved <= 80) {
				layout.style.setProperty('--left-width', saved + '%');
			}

			let dragging = false;
			const onMove = (event) => {
				if (!dragging) {
					return;
				}
				const rect = layout.getBoundingClientRect();
				const leftPct = ((event.clientX - rect.left) / rect.width) * 100;
				const clamped = clamp(leftPct, 35, 80);
				layout.style.setProperty('--left-width', clamped + '%');
				localStorage.setItem('xdebugViewerLeftWidthPct', String(Math.round(clamped * 10) / 10));
			};
			const stopDrag = () => {
				if (!dragging) {
					return;
				}
				dragging = false;
				splitter.classList.remove('dragging');
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', stopDrag);
			};

			splitter.addEventListener('pointerdown', (event) => {
				if (window.innerWidth <= 1060 || detailsHidden) {
					return;
				}
				dragging = true;
				splitter.classList.add('dragging');
				document.body.style.cursor = 'col-resize';
				document.body.style.userSelect = 'none';
				splitter.setPointerCapture(event.pointerId);
				window.addEventListener('pointermove', onMove);
				window.addEventListener('pointerup', stopDrag);
			});
			window.addEventListener('blur', stopDrag);
		}

		function updateDetailsPanelVisibility() {
			if (!layout || !toggleDetailsBtn) {
				return;
			}
			layout.classList.toggle('details-hidden', detailsHidden);
			toggleDetailsBtn.textContent = detailsHidden ? ui.showDetails : ui.hideDetails;
		}
	</script>
</body>
</html>`;
	}
}

function createNonce(): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i += 1) {
		nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return nonce;
}

function normalizeFunction(fn: CachegrindFunction): CachegrindFunction {
	return {
		...fn,
		callsObserved: Number(fn.callsObserved || 0),
		callsEffective: Number(fn.callsEffective || fn.callsObserved || 0),
		callers: (fn.callers ?? []).map((edge) => ({ ...edge, eventCosts: edge.eventCosts ?? {} })),
		callees: (fn.callees ?? []).map((edge) => ({ ...edge, eventCosts: edge.eventCosts ?? {} })),
		eventCosts: fn.eventCosts ?? {}
	};
}

function normalizeSlashes(value: string): string {
	return value.replace(/\\/g, '/');
}

function trimTrailingSlash(value: string): string {
	return value.replace(/[\\/]+$/, '');
}

