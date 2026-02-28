import * as vscode from 'vscode';
import { ProfilerIndex } from './risk/profilerIndex';
import { registerRiskCodeLensNoop, RiskCodeLensProvider } from './risk/riskCodeLensProvider';
import { RiskService } from './risk/riskService';
import { SourceResolver } from './source/sourceResolver';
import { XdebugProfileReadonlyEditorProvider } from './view/customEditor';

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(XdebugProfileReadonlyEditorProvider.register(context));

	const sourceResolver = new SourceResolver();
	const profilerIndex = new ProfilerIndex(sourceResolver);
	await profilerIndex.initialize();
	const riskService = new RiskService(profilerIndex);
	const riskCodeLensProvider = new RiskCodeLensProvider(riskService);

	context.subscriptions.push(profilerIndex, riskCodeLensProvider);
	registerRiskCodeLensNoop(context);

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
		profilerIndex.onDidChange(() => {
			riskCodeLensProvider.invalidate();
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
		}),
		vscode.window.onDidChangeActiveTextEditor(() => {
			riskCodeLensProvider.invalidate();
		}),
		vscode.workspace.onDidSaveTextDocument(() => {
			riskCodeLensProvider.invalidate();
		})
	);
}

export function deactivate() {}
