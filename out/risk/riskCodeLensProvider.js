"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskCodeLensProvider = void 0;
exports.registerRiskCodeLensNoop = registerRiskCodeLensNoop;
const vscode = __importStar(require("vscode"));
const customEditor_1 = require("../view/customEditor");
const RISK_NOOP_COMMAND = 'xdebugProfileViewer.riskCodeLensNoop';
const OPEN_PROFILE_COMMAND = 'xdebugProfileViewer.openProfileFromCodeLens';
class RiskCodeLensProvider {
    riskService;
    didChangeEmitter = new vscode.EventEmitter();
    disposables = [];
    onDidChangeCodeLenses = this.didChangeEmitter.event;
    constructor(riskService) {
        this.riskService = riskService;
    }
    invalidate() {
        this.didChangeEmitter.fire();
    }
    async provideCodeLenses(document, _token) {
        if (!isCodeLensEnabled()) {
            return [];
        }
        let functions = [];
        try {
            functions = await this.getDocumentFunctions(document);
        }
        catch {
            functions = extractPhpFunctionsByRegex(document);
        }
        const lenses = [];
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
    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.didChangeEmitter.dispose();
    }
    async getDocumentFunctions(document) {
        const symbolFunctions = await this.getFunctionsFromSymbols(document);
        if (symbolFunctions.length > 0) {
            return dedupeFunctions(symbolFunctions);
        }
        return extractPhpFunctionsByRegex(document);
    }
    async getFunctionsFromSymbols(document) {
        let symbols;
        try {
            symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
        }
        catch {
            return [];
        }
        if (!symbols || symbols.length === 0) {
            return [];
        }
        const out = [];
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
exports.RiskCodeLensProvider = RiskCodeLensProvider;
function registerRiskCodeLensNoop(context) {
    context.subscriptions.push(vscode.commands.registerCommand(RISK_NOOP_COMMAND, () => undefined));
    context.subscriptions.push(vscode.commands.registerCommand(OPEN_PROFILE_COMMAND, async (profileUri) => {
        await vscode.commands.executeCommand('vscode.openWith', profileUri, customEditor_1.XDEBUG_PROFILE_VIEW_TYPE);
    }));
}
function isCodeLensEnabled() {
    return vscode.workspace.getConfiguration('xdebugProfileViewer').get('codeLens.enabled', true);
}
function dedupeFunctions(functions) {
    const seen = new Set();
    const out = [];
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
function extractPhpFunctionsByRegex(document) {
    const out = [];
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
//# sourceMappingURL=riskCodeLensProvider.js.map