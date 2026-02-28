import * as vscode from 'vscode';
import { XDEBUG_PROFILE_VIEW_TYPE } from '../view/customEditor';
import { FunctionDescriptor, RiskService } from './riskService';

const RISK_NOOP_COMMAND = 'xdebugProfileViewer.riskCodeLensNoop';
const OPEN_PROFILE_COMMAND = 'xdebugProfileViewer.openProfileFromCodeLens';

export class RiskCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
	private readonly didChangeEmitter = new vscode.EventEmitter<void>();
	private readonly disposables: vscode.Disposable[] = [];

	public readonly onDidChangeCodeLenses: vscode.Event<void> = this.didChangeEmitter.event;

	constructor(private readonly riskService: RiskService) {}

	public invalidate(): void {
		this.didChangeEmitter.fire();
	}

	public async provideCodeLenses(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): Promise<vscode.CodeLens[]> {
		if (!isCodeLensEnabled()) {
			return [];
		}

		let functions: FunctionDescriptor[] = [];
		try {
			functions = await this.getDocumentFunctions(document);
		} catch {
			functions = extractPhpFunctionsByRegex(document);
		}
		const lenses: vscode.CodeLens[] = [];
		for (const fn of functions) {
			const risk = this.riskService.getBreakageRiskDisplay(document, fn);
			const title = risk.title;
			const tooltip = risk.tooltip;
			const command = risk.profileUri ? OPEN_PROFILE_COMMAND : RISK_NOOP_COMMAND;
			const args = risk.profileUri ? [risk.profileUri] : undefined;
			const lineStart = new vscode.Position(fn.line, 0);
			const range = new vscode.Range(lineStart, lineStart);
			lenses.push(new vscode.CodeLens(range, { title, tooltip, command, arguments: args }));
			if (risk.subtitle) {
				lenses.push(new vscode.CodeLens(range, { title: risk.subtitle, tooltip, command, arguments: args }));
			}
		}
		return lenses;
	}

	public dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables.length = 0;
		this.didChangeEmitter.dispose();
	}

	private async getDocumentFunctions(document: vscode.TextDocument): Promise<FunctionDescriptor[]> {
		const symbolFunctions = await this.getFunctionsFromSymbols(document);
		if (symbolFunctions.length > 0) {
			return dedupeFunctions(symbolFunctions);
		}
		return extractPhpFunctionsByRegex(document);
	}

	private async getFunctionsFromSymbols(document: vscode.TextDocument): Promise<FunctionDescriptor[]> {
		let symbols: vscode.DocumentSymbol[] | undefined;
		try {
			symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
				'vscode.executeDocumentSymbolProvider',
				document.uri
			);
		} catch {
			return [];
		}
		if (!symbols || symbols.length === 0) {
			return [];
		}
		const out: FunctionDescriptor[] = [];
		const stack = [...symbols];
		while (stack.length > 0) {
			const symbol = stack.pop();
			if (!symbol) {
				continue;
			}
			if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
				out.push({
					name: symbol.name,
					line: symbol.selectionRange.start.line
				});
			}
			for (const child of symbol.children) {
				stack.push(child);
			}
		}
		return out;
	}
}

export function registerRiskCodeLensNoop(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.commands.registerCommand(RISK_NOOP_COMMAND, () => undefined));
	context.subscriptions.push(
		vscode.commands.registerCommand(OPEN_PROFILE_COMMAND, async (profileUri: vscode.Uri) => {
			await vscode.commands.executeCommand('vscode.openWith', profileUri, XDEBUG_PROFILE_VIEW_TYPE);
		})
	);
}

function isCodeLensEnabled(): boolean {
	return vscode.workspace.getConfiguration('xdebugProfileViewer').get<boolean>('codeLens.enabled', true);
}

function dedupeFunctions(functions: FunctionDescriptor[]): FunctionDescriptor[] {
	const seen = new Set<string>();
	const out: FunctionDescriptor[] = [];
	for (const fn of functions) {
		const key = `${fn.line}\u0000${fn.name.toLowerCase()}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		out.push(fn);
	}
	out.sort((a, b) => a.line - b.line);
	return out;
}

function extractPhpFunctionsByRegex(document: vscode.TextDocument): FunctionDescriptor[] {
	const out: FunctionDescriptor[] = [];
	const regex = /^\s*(?:(?:public|protected|private|static|abstract|final)\s+)*function\s+&?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
	for (let line = 0; line < document.lineCount; line += 1) {
		const text = document.lineAt(line).text;
		const match = text.match(regex);
		if (!match) {
			continue;
		}
		out.push({ name: match[1], line });
	}
	return out;
}
