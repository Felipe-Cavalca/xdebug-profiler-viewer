import * as vscode from 'vscode';
import {
	LineTimingsInlayHintsProvider,
	SHOW_LINE_TIMING_DETAILS_COMMAND,
	showLineTimingDetailsCommand
} from './lineTimings/lineTimingsInlayHintsProvider';
import { ProfilerIndex } from './risk/profilerIndex';
import { registerRiskCodeLensNoop, RiskCodeLensProvider } from './risk/riskCodeLensProvider';
import { RiskService } from './risk/riskService';
import { SourceResolver } from './source/sourceResolver';
import { TraceIndex } from './trace/traceIndex';
import { XdebugProfileReadonlyEditorProvider } from './view/customEditor';

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(XdebugProfileReadonlyEditorProvider.register(context));

	const sourceResolver = new SourceResolver();
	const profilerIndex = new ProfilerIndex(sourceResolver);
	const traceIndex = new TraceIndex(sourceResolver);
	await profilerIndex.initialize();
	await traceIndex.initialize();
	const riskService = new RiskService(profilerIndex);
	const riskCodeLensProvider = new RiskCodeLensProvider(riskService);
	const lineTimingsProvider = new LineTimingsInlayHintsProvider(traceIndex);

	context.subscriptions.push(profilerIndex, traceIndex, riskCodeLensProvider, lineTimingsProvider);
	registerRiskCodeLensNoop(context);
	context.subscriptions.push(
		vscode.commands.registerCommand(SHOW_LINE_TIMING_DETAILS_COMMAND, async (uri: vscode.Uri, line: number) => {
			await showLineTimingDetailsCommand(traceIndex, uri, line);
		})
	);

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			[
				{ language: 'php' },
				{ language: 'php8' },
				{ language: 'phtml' }
			],
			riskCodeLensProvider
		)
	);
	context.subscriptions.push(
		vscode.languages.registerInlayHintsProvider(
			[
				{ language: 'php' },
				{ language: 'php8' },
				{ language: 'phtml' }
			],
			lineTimingsProvider
		)
	);

	context.subscriptions.push(
		profilerIndex.onDidChange(() => {
			riskCodeLensProvider.invalidate();
		}),
		traceIndex.onDidChange(() => {
			lineTimingsProvider.invalidate();
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (
				event.affectsConfiguration('xdebugProfileViewer.pathMappings') ||
				event.affectsConfiguration('xdebugProfileViewer.codeLens.enabled') ||
				event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexDebounceMs') ||
				event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexRetryMs') ||
				event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexMaxRetries')
			) {
				void profilerIndex.rebuildAll();
				riskCodeLensProvider.invalidate();
			}
			if (
				event.affectsConfiguration('xdebugProfileViewer.pathMappings') ||
				event.affectsConfiguration('xdebugProfileViewer.lineTimings.enabled') ||
				event.affectsConfiguration('xdebugProfileViewer.lineTimings.minDurationMs') ||
				event.affectsConfiguration('xdebugProfileViewer.lineTimings.showLoopsAsAggregate') ||
				event.affectsConfiguration('xdebugProfileViewer.lineTimings.maxHintsPerFile') ||
				event.affectsConfiguration('xdebugProfileViewer.lineTimings.traceGlobs') ||
				event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexDebounceMs') ||
				event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexRetryMs') ||
				event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexMaxRetries')
			) {
				if (event.affectsConfiguration('xdebugProfileViewer.lineTimings.traceGlobs')) {
					void traceIndex.reconfigure();
				} else if (
					event.affectsConfiguration('xdebugProfileViewer.pathMappings') ||
					event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexDebounceMs') ||
					event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexRetryMs') ||
					event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexMaxRetries')
				) {
					void traceIndex.rebuildAll();
				}
				lineTimingsProvider.invalidate();
			}
		}),
		vscode.window.onDidChangeActiveTextEditor(() => {
			riskCodeLensProvider.invalidate();
			lineTimingsProvider.invalidate();
		}),
		vscode.workspace.onDidSaveTextDocument(() => {
			riskCodeLensProvider.invalidate();
			lineTimingsProvider.invalidate();
		})
	);
}

export function deactivate() {}
