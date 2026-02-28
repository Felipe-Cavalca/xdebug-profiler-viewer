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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const profilerIndex_1 = require("./risk/profilerIndex");
const riskCodeLensProvider_1 = require("./risk/riskCodeLensProvider");
const riskService_1 = require("./risk/riskService");
const sourceResolver_1 = require("./source/sourceResolver");
const customEditor_1 = require("./view/customEditor");
async function activate(context) {
    context.subscriptions.push(customEditor_1.XdebugProfileReadonlyEditorProvider.register(context));
    const sourceResolver = new sourceResolver_1.SourceResolver();
    const profilerIndex = new profilerIndex_1.ProfilerIndex(sourceResolver);
    await profilerIndex.initialize();
    const riskService = new riskService_1.RiskService(profilerIndex);
    const riskCodeLensProvider = new riskCodeLensProvider_1.RiskCodeLensProvider(riskService);
    context.subscriptions.push(profilerIndex, riskCodeLensProvider);
    (0, riskCodeLensProvider_1.registerRiskCodeLensNoop)(context);
    context.subscriptions.push(vscode.languages.registerCodeLensProvider([
        { language: 'php' },
        { language: 'php8' },
        { language: 'phtml' }
    ], riskCodeLensProvider));
    context.subscriptions.push(profilerIndex.onDidChange(() => {
        riskCodeLensProvider.invalidate();
    }), vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('xdebugProfileViewer.pathMappings') ||
            event.affectsConfiguration('xdebugProfileViewer.codeLens.enabled') ||
            event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexDebounceMs') ||
            event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexRetryMs') ||
            event.affectsConfiguration('xdebugProfileViewer.codeLens.profilerIndexMaxRetries')) {
            void profilerIndex.rebuildAll();
            riskCodeLensProvider.invalidate();
        }
    }), vscode.window.onDidChangeActiveTextEditor(() => {
        riskCodeLensProvider.invalidate();
    }), vscode.workspace.onDidSaveTextDocument(() => {
        riskCodeLensProvider.invalidate();
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map