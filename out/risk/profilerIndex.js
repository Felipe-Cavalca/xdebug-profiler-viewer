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
exports.ProfilerIndex = void 0;
const vscode = __importStar(require("vscode"));
const parser_1 = require("../cachegrind/parser");
const sourceResolver_1 = require("../source/sourceResolver");
const PROFILER_GLOBS = ['**/cachegrind.out.*', '**/*.cachegrind', '**/*.cg', '**/*.out'];
const FUNCTION_INDEX_SCAN_LIMIT = 10000;
const DEFAULT_INDEX_DEBOUNCE_MS = 350;
const DEFAULT_INDEX_RETRY_MS = 900;
const DEFAULT_MAX_INDEX_RETRIES = 3;
class ProfilerIndex {
    sourceResolver;
    disposables = [];
    profileByKey = new Map();
    occurrencesByName = new Map();
    sourceResolutionCache = new Map();
    didChangeEmitter = new vscode.EventEmitter();
    pendingUpserts = new Map();
    retryCountByUri = new Map();
    isInitialized = false;
    refreshSequence = 0;
    onDidChange = this.didChangeEmitter.event;
    constructor(sourceResolver) {
        this.sourceResolver = sourceResolver ?? new sourceResolver_1.SourceResolver();
    }
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        this.isInitialized = true;
        await this.rebuildAll();
        for (const glob of PROFILER_GLOBS) {
            const watcher = vscode.workspace.createFileSystemWatcher(glob);
            watcher.onDidCreate((uri) => this.scheduleUpsert(uri, this.getIndexOptions().debounceMs), this, this.disposables);
            watcher.onDidChange((uri) => this.scheduleUpsert(uri, this.getIndexOptions().debounceMs), this, this.disposables);
            watcher.onDidDelete((uri) => this.deleteProfile(uri), this, this.disposables);
            this.disposables.push(watcher);
        }
    }
    async rebuildAll() {
        const sequence = ++this.refreshSequence;
        this.profileByKey.clear();
        this.occurrencesByName.clear();
        this.sourceResolutionCache.clear();
        const uriMap = new Map();
        const results = await Promise.all(PROFILER_GLOBS.map((glob) => vscode.workspace.findFiles(glob, '**/node_modules/**', FUNCTION_INDEX_SCAN_LIMIT)));
        for (const batch of results) {
            for (const uri of batch) {
                uriMap.set(uri.toString(), uri);
            }
        }
        for (const uri of uriMap.values()) {
            if (sequence !== this.refreshSequence) {
                return;
            }
            await this.upsertProfile(uri, false);
        }
        if (sequence === this.refreshSequence) {
            this.didChangeEmitter.fire();
        }
    }
    getLatestProfileForFunction(name, documentUri, line) {
        const occurrences = this.occurrencesByName.get(normalizeName(name));
        if (!occurrences || occurrences.length === 0) {
            return undefined;
        }
        const targetPath = normalizeFsPath(documentUri.fsPath);
        const candidates = occurrences.filter((entry) => entry.resolvedFilePath === targetPath);
        let best = pickBestOccurrence(candidates, line);
        if (!best) {
            best = pickBestOccurrence(occurrences.filter((entry) => !entry.resolvedFilePath), line);
        }
        if (!best) {
            return undefined;
        }
        const profileState = this.profileByKey.get(best.profileKey);
        if (!profileState) {
            return undefined;
        }
        const functionData = profileState.profile.functions.find((fn) => fn.id === best.functionId);
        if (!functionData) {
            return undefined;
        }
        return {
            functionData,
            profile: profileState.profile,
            profileUri: profileState.profileUri,
            profileMtime: profileState.mtime
        };
    }
    dispose() {
        for (const timer of this.pendingUpserts.values()) {
            clearTimeout(timer);
        }
        this.pendingUpserts.clear();
        this.retryCountByUri.clear();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.didChangeEmitter.dispose();
    }
    async upsertProfile(uri, fireEvent = true) {
        const key = uri.toString();
        this.removeProfileByKey(key);
        try {
            const [fileStat, bytes] = await Promise.all([vscode.workspace.fs.stat(uri), vscode.workspace.fs.readFile(uri)]);
            const text = new TextDecoder('utf-8').decode(bytes);
            const profile = (0, parser_1.parseCachegrind)(text);
            const occurrences = await this.buildOccurrencesForProfile(uri, fileStat.mtime, profile);
            const state = {
                profileUri: uri,
                mtime: fileStat.mtime,
                profile,
                occurrences
            };
            this.profileByKey.set(key, state);
            this.addOccurrences(occurrences);
            this.retryCountByUri.delete(key);
            if (fireEvent) {
                this.didChangeEmitter.fire();
            }
        }
        catch {
            const options = this.getIndexOptions();
            const retryCount = this.retryCountByUri.get(key) ?? 0;
            if (retryCount < options.maxRetries) {
                this.retryCountByUri.set(key, retryCount + 1);
                this.scheduleUpsert(uri, options.retryMs);
            }
            if (fireEvent) {
                this.didChangeEmitter.fire();
            }
        }
    }
    deleteProfile(uri) {
        const key = uri.toString();
        const pending = this.pendingUpserts.get(key);
        if (pending) {
            clearTimeout(pending);
            this.pendingUpserts.delete(key);
        }
        this.retryCountByUri.delete(key);
        this.removeProfileByKey(uri.toString());
        this.didChangeEmitter.fire();
    }
    scheduleUpsert(uri, delayMs) {
        const key = uri.toString();
        const existing = this.pendingUpserts.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        const timer = setTimeout(() => {
            this.pendingUpserts.delete(key);
            void this.upsertProfile(uri);
        }, delayMs);
        this.pendingUpserts.set(key, timer);
    }
    getIndexOptions() {
        const cfg = vscode.workspace.getConfiguration('xdebugProfileViewer');
        const debounceMsRaw = cfg.get('codeLens.profilerIndexDebounceMs', DEFAULT_INDEX_DEBOUNCE_MS);
        const retryMsRaw = cfg.get('codeLens.profilerIndexRetryMs', DEFAULT_INDEX_RETRY_MS);
        const maxRetriesRaw = cfg.get('codeLens.profilerIndexMaxRetries', DEFAULT_MAX_INDEX_RETRIES);
        return {
            debounceMs: clampInt(debounceMsRaw, 0, 5000, DEFAULT_INDEX_DEBOUNCE_MS),
            retryMs: clampInt(retryMsRaw, 100, 10000, DEFAULT_INDEX_RETRY_MS),
            maxRetries: clampInt(maxRetriesRaw, 0, 10, DEFAULT_MAX_INDEX_RETRIES)
        };
    }
    async buildOccurrencesForProfile(profileUri, mtime, profile) {
        const occurrences = [];
        for (const fn of profile.functions) {
            const normalizedName = normalizeName(extractComparableFunctionName(fn.name));
            if (!normalizedName) {
                continue;
            }
            const resolvedFilePath = await this.resolveFunctionFilePath(fn.file, profileUri);
            occurrences.push({
                profileKey: profileUri.toString(),
                profileUri,
                mtime,
                name: normalizedName,
                resolvedFilePath,
                rawFilePath: fn.file ? (0, sourceResolver_1.normalizeSlashes)(fn.file).toLowerCase() : undefined,
                line: fn.line,
                functionId: fn.id
            });
        }
        return occurrences;
    }
    async resolveFunctionFilePath(filePath, profileUri) {
        if (!filePath) {
            return undefined;
        }
        const cacheKey = `${profileUri.toString()}\u0000${filePath}`;
        if (this.sourceResolutionCache.has(cacheKey)) {
            return this.sourceResolutionCache.get(cacheKey);
        }
        const resolved = await this.sourceResolver.resolveSourceUri(filePath, profileUri);
        const normalized = resolved ? normalizeFsPath(resolved.fsPath) : undefined;
        this.sourceResolutionCache.set(cacheKey, normalized);
        return normalized;
    }
    addOccurrences(occurrences) {
        for (const occurrence of occurrences) {
            const current = this.occurrencesByName.get(occurrence.name);
            if (current) {
                current.push(occurrence);
            }
            else {
                this.occurrencesByName.set(occurrence.name, [occurrence]);
            }
        }
    }
    removeProfileByKey(profileKey) {
        const state = this.profileByKey.get(profileKey);
        if (!state) {
            return;
        }
        for (const occurrence of state.occurrences) {
            const bucket = this.occurrencesByName.get(occurrence.name);
            if (!bucket) {
                continue;
            }
            const remaining = bucket.filter((entry) => entry.profileKey !== profileKey);
            if (remaining.length === 0) {
                this.occurrencesByName.delete(occurrence.name);
                continue;
            }
            this.occurrencesByName.set(occurrence.name, remaining);
        }
        this.profileByKey.delete(profileKey);
    }
}
exports.ProfilerIndex = ProfilerIndex;
function pickBestOccurrence(occurrences, line) {
    if (occurrences.length === 0) {
        return undefined;
    }
    let best;
    for (const candidate of occurrences) {
        if (!best) {
            best = candidate;
            continue;
        }
        if (candidate.mtime > best.mtime) {
            best = candidate;
            continue;
        }
        if (candidate.mtime < best.mtime) {
            continue;
        }
        if (line !== undefined) {
            const currentDistance = lineDistance(candidate.line, line);
            const bestDistance = lineDistance(best.line, line);
            if (currentDistance < bestDistance) {
                best = candidate;
            }
        }
    }
    return best;
}
function lineDistance(candidateLine, line) {
    if (!candidateLine || candidateLine <= 0) {
        return Number.MAX_SAFE_INTEGER;
    }
    return Math.abs(candidateLine - line);
}
function extractComparableFunctionName(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
        return '';
    }
    const chunks = trimmed.split(/::|->|\\/);
    return chunks[chunks.length - 1] ?? trimmed;
}
function normalizeName(name) {
    return String(name || '').trim().toLowerCase();
}
function normalizeFsPath(value) {
    return (0, sourceResolver_1.normalizeSlashes)(value).toLowerCase();
}
function clampInt(value, min, max, fallback) {
    if (!Number.isFinite(value)) {
        return fallback;
    }
    const rounded = Math.round(value);
    return Math.max(min, Math.min(max, rounded));
}
//# sourceMappingURL=profilerIndex.js.map