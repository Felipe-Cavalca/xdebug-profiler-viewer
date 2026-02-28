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
exports.SourceResolver = void 0;
exports.normalizeSlashes = normalizeSlashes;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
class SourceResolver {
    async resolveSourceUri(filePath, from) {
        const candidates = new Set();
        const mappings = this.getPathMappings();
        for (const mapped of this.applyPathMappings(filePath, mappings)) {
            candidates.add(mapped);
        }
        if (path.isAbsolute(filePath)) {
            candidates.add(path.normalize(filePath));
        }
        else {
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
    getPathMappings() {
        const cfg = vscode.workspace.getConfiguration('xdebugProfileViewer');
        const mappings = cfg.get('pathMappings', {});
        return mappings ?? {};
    }
    applyPathMappings(filePath, mappings) {
        const out = [];
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
    async findFirstExistingFile(candidates) {
        for (const candidate of candidates) {
            const uri = vscode.Uri.file(candidate);
            try {
                await vscode.workspace.fs.stat(uri);
                return uri;
            }
            catch {
                // Keep searching other candidates.
            }
        }
        return undefined;
    }
    async findBySuffix(filePath) {
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
}
exports.SourceResolver = SourceResolver;
function normalizeSlashes(value) {
    return value.replace(/\\/g, '/');
}
function trimTrailingSlash(value) {
    return value.replace(/[\\/]+$/, '');
}
//# sourceMappingURL=sourceResolver.js.map