import * as vscode from 'vscode';
import { normalizeSlashes, SourceResolver } from '../source/sourceResolver';
import { TraceCallEvent, parseTrace } from './parser';

const DEFAULT_TRACE_GLOBS = ['**/trace*.xt', '**/xdebug-trace*.xt', '**/*.trace', '**/*.xt'];
const TRACE_INDEX_SCAN_LIMIT = 10000;
const DEFAULT_INDEX_DEBOUNCE_MS = 350;
const DEFAULT_INDEX_RETRY_MS = 900;
const DEFAULT_MAX_INDEX_RETRIES = 3;
const TOP_SLOW_EVENTS_LIMIT = 10;

export interface TraceLineSlowEvent {
	functionName: string;
	durationUs: number;
	depth: number;
	memoryDeltaBytes?: number;
	argsPreview?: string;
}

export interface TraceLineFunctionStats {
	functionName: string;
	totalDurationUs: number;
	count: number;
	avgDurationUs: number;
	totalMemoryDeltaBytes?: number;
	avgMemoryDeltaBytes?: number;
}

export interface TraceLineStats {
	key: string;
	normalizedSourcePath: string;
	line: number;
	traceUri: vscode.Uri;
	traceMtime: number;
	totalDurationUs: number;
	totalMemoryDeltaBytes?: number;
	count: number;
	avgDurationUs: number;
	minDurationUs: number;
	maxDurationUs: number;
	functionStats: TraceLineFunctionStats[];
	topSlowEvents: TraceLineSlowEvent[];
}

export interface TraceDocumentStats {
	traceUri: vscode.Uri;
	traceMtime: number;
	traceKey: string;
	hits: number;
	lines: Map<number, TraceLineStats>;
}

interface MutableLineStats {
	normalizedSourcePath: string;
	line: number;
	totalDurationUs: number;
	totalMemoryDeltaBytes?: number;
	count: number;
	minDurationUs: number;
	maxDurationUs: number;
	functionStatsByName: Map<string, { totalDurationUs: number; count: number; totalMemoryDeltaBytes?: number }>;
	topSlowEvents: TraceLineSlowEvent[];
}

interface TraceProfileState {
	traceUri: vscode.Uri;
	mtime: number;
	lineStatsBySourcePath: Map<string, Map<number, TraceLineStats>>;
	hitsBySourcePath: Map<string, number>;
}

interface IndexOptions {
	debounceMs: number;
	retryMs: number;
	maxRetries: number;
}

export class TraceIndex implements vscode.Disposable {
	private readonly sourceResolver: SourceResolver;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly watcherDisposables: vscode.Disposable[] = [];
	private readonly profileByKey = new Map<string, TraceProfileState>();
	private readonly sourceResolutionCache = new Map<string, string | undefined>();
	private readonly didChangeEmitter = new vscode.EventEmitter<void>();
	private readonly pendingUpserts = new Map<string, NodeJS.Timeout>();
	private readonly retryCountByUri = new Map<string, number>();
	private isInitialized = false;
	private refreshSequence = 0;

	public readonly onDidChange = this.didChangeEmitter.event;

	constructor(sourceResolver?: SourceResolver) {
		this.sourceResolver = sourceResolver ?? new SourceResolver();
	}

	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}
		this.isInitialized = true;

		await this.rebuildAll();
		this.rebuildWatchers();
	}

	public async rebuildAll(): Promise<void> {
		const sequence = ++this.refreshSequence;
		this.profileByKey.clear();
		this.sourceResolutionCache.clear();

		const uriMap = new Map<string, vscode.Uri>();
		const globs = this.getTraceGlobs();
		const results = await Promise.all(
			globs.map((glob) => vscode.workspace.findFiles(glob, '**/node_modules/**', TRACE_INDEX_SCAN_LIMIT))
		);
		for (const batch of results) {
			for (const uri of batch) {
				uriMap.set(uri.toString(), uri);
			}
		}

		for (const uri of uriMap.values()) {
			if (sequence !== this.refreshSequence) {
				return;
			}
			await this.upsertTrace(uri, false);
		}

		if (sequence === this.refreshSequence) {
			this.didChangeEmitter.fire();
		}
	}

	public async reconfigure(): Promise<void> {
		this.rebuildWatchers();
		await this.rebuildAll();
	}

	public getLineStatsForDocument(documentUri: vscode.Uri): TraceDocumentStats | undefined {
		const targetPath = normalizeFsPath(documentUri.fsPath);
		let best: TraceDocumentStats | undefined;

		for (const state of this.profileByKey.values()) {
			const lines = state.lineStatsBySourcePath.get(targetPath);
			if (!lines || lines.size === 0) {
				continue;
			}

			const hits = state.hitsBySourcePath.get(targetPath) ?? 0;
			const candidate: TraceDocumentStats = {
				traceUri: state.traceUri,
				traceMtime: state.mtime,
				traceKey: buildTraceIdentity(state.traceUri, state.mtime),
				hits,
				lines
			};
			if (!best || candidate.traceMtime > best.traceMtime) {
				best = candidate;
				continue;
			}
			if (candidate.traceMtime === best.traceMtime && candidate.hits > best.hits) {
				best = candidate;
			}
		}

		if (best) {
			return best;
		}

		let fallback: TraceDocumentStats | undefined;
		for (const state of this.profileByKey.values()) {
			const lines = state.lineStatsBySourcePath.get(targetPath);
			if (!lines || lines.size === 0) {
				continue;
			}
			const hits = state.hitsBySourcePath.get(targetPath) ?? 0;
			if (!fallback || hits > fallback.hits) {
				fallback = {
					traceUri: state.traceUri,
					traceMtime: state.mtime,
					traceKey: buildTraceIdentity(state.traceUri, state.mtime),
					hits,
					lines
				};
			}
		}
		return fallback;
	}

	public getLatestLineStatsByDocument(documentUri: vscode.Uri): Map<number, TraceLineStats> {
		const targetPath = normalizeFsPath(documentUri.fsPath);
		const bestByLine = new Map<number, TraceLineStats>();
		for (const state of this.profileByKey.values()) {
			const lines = state.lineStatsBySourcePath.get(targetPath);
			if (!lines || lines.size === 0) {
				continue;
			}
			for (const candidate of lines.values()) {
				const current = bestByLine.get(candidate.line);
				if (!current || candidate.traceMtime > current.traceMtime) {
					bestByLine.set(candidate.line, candidate);
					continue;
				}
				if (candidate.traceMtime === current.traceMtime && candidate.count > current.count) {
					bestByLine.set(candidate.line, candidate);
				}
			}
		}
		return bestByLine;
	}

	public getLineStats(documentUri: vscode.Uri, line: number): TraceLineStats | undefined {
		return this.getLatestLineStatsByDocument(documentUri).get(line);
	}

	public dispose(): void {
		for (const timer of this.pendingUpserts.values()) {
			clearTimeout(timer);
		}
		this.pendingUpserts.clear();
		this.retryCountByUri.clear();
		for (const disposable of this.watcherDisposables) {
			disposable.dispose();
		}
		this.watcherDisposables.length = 0;
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables.length = 0;
		this.didChangeEmitter.dispose();
	}

	private rebuildWatchers(): void {
		for (const watcher of this.watcherDisposables) {
			watcher.dispose();
		}
		this.watcherDisposables.length = 0;

		const options = this.getIndexOptions();
		for (const glob of this.getTraceGlobs()) {
			const watcher = vscode.workspace.createFileSystemWatcher(glob);
			watcher.onDidCreate((uri) => this.scheduleUpsert(uri, options.debounceMs), this);
			watcher.onDidChange((uri) => this.scheduleUpsert(uri, options.debounceMs), this);
			watcher.onDidDelete((uri) => this.deleteTrace(uri), this);
			this.watcherDisposables.push(watcher);
		}
	}

	private async upsertTrace(uri: vscode.Uri, fireEvent = true): Promise<void> {
		const key = uri.toString();
		this.profileByKey.delete(key);

		try {
			const [fileStat, bytes] = await Promise.all([vscode.workspace.fs.stat(uri), vscode.workspace.fs.readFile(uri)]);
			const text = new TextDecoder('utf-8').decode(bytes);
			const parsed = parseTrace(text);
			const state = await this.buildProfileState(uri, fileStat.mtime, parsed.events);
			this.profileByKey.set(key, state);
			this.retryCountByUri.delete(key);
			if (fireEvent) {
				this.didChangeEmitter.fire();
			}
		} catch {
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

	private deleteTrace(uri: vscode.Uri): void {
		const key = uri.toString();
		const pending = this.pendingUpserts.get(key);
		if (pending) {
			clearTimeout(pending);
			this.pendingUpserts.delete(key);
		}
		this.retryCountByUri.delete(key);
		this.profileByKey.delete(key);
		this.didChangeEmitter.fire();
	}

	private scheduleUpsert(uri: vscode.Uri, delayMs: number): void {
		const key = uri.toString();
		const existing = this.pendingUpserts.get(key);
		if (existing) {
			clearTimeout(existing);
		}
		const timer = setTimeout(() => {
			this.pendingUpserts.delete(key);
			void this.upsertTrace(uri);
		}, delayMs);
		this.pendingUpserts.set(key, timer);
	}

	private getTraceGlobs(): string[] {
		const cfg = vscode.workspace.getConfiguration('xdebugProfileViewer');
		const configured = cfg.get<string[]>('lineTimings.traceGlobs', DEFAULT_TRACE_GLOBS);
		if (!Array.isArray(configured) || configured.length === 0) {
			return DEFAULT_TRACE_GLOBS;
		}
		const normalized = configured.map((glob) => String(glob || '').trim()).filter(Boolean);
		return normalized.length > 0 ? normalized : DEFAULT_TRACE_GLOBS;
	}

	private getIndexOptions(): IndexOptions {
		const cfg = vscode.workspace.getConfiguration('xdebugProfileViewer');
		const debounceMsRaw = cfg.get<number>('codeLens.profilerIndexDebounceMs', DEFAULT_INDEX_DEBOUNCE_MS);
		const retryMsRaw = cfg.get<number>('codeLens.profilerIndexRetryMs', DEFAULT_INDEX_RETRY_MS);
		const maxRetriesRaw = cfg.get<number>('codeLens.profilerIndexMaxRetries', DEFAULT_MAX_INDEX_RETRIES);
		return {
			debounceMs: clampInt(debounceMsRaw, 0, 5000, DEFAULT_INDEX_DEBOUNCE_MS),
			retryMs: clampInt(retryMsRaw, 100, 10000, DEFAULT_INDEX_RETRY_MS),
			maxRetries: clampInt(maxRetriesRaw, 0, 10, DEFAULT_MAX_INDEX_RETRIES)
		};
	}

	private async buildProfileState(traceUri: vscode.Uri, mtime: number, events: TraceCallEvent[]): Promise<TraceProfileState> {
		const mutableByPathLine = new Map<string, MutableLineStats>();
		for (const event of events) {
			if (!event.filePath || !event.line || event.line <= 0 || event.durationUs <= 0) {
				continue;
			}
			const resolvedPath = await this.resolveSourcePath(event.filePath, traceUri);
			if (!resolvedPath) {
				continue;
			}
			const key = buildLineKey(resolvedPath, event.line);
			let bucket = mutableByPathLine.get(key);
			if (!bucket) {
				bucket = {
					normalizedSourcePath: resolvedPath,
					line: event.line,
					totalDurationUs: 0,
					totalMemoryDeltaBytes: undefined,
					count: 0,
					minDurationUs: event.durationUs,
					maxDurationUs: event.durationUs,
					functionStatsByName: new Map(),
					topSlowEvents: []
				};
				mutableByPathLine.set(key, bucket);
			}
			bucket.totalDurationUs += event.durationUs;
			if (event.memoryDeltaBytes !== undefined) {
				bucket.totalMemoryDeltaBytes = (bucket.totalMemoryDeltaBytes ?? 0) + event.memoryDeltaBytes;
			}
			bucket.count += 1;
			bucket.minDurationUs = Math.min(bucket.minDurationUs, event.durationUs);
			bucket.maxDurationUs = Math.max(bucket.maxDurationUs, event.durationUs);
			insertTopSlowEvent(bucket.topSlowEvents, {
				functionName: event.functionName,
				durationUs: event.durationUs,
				depth: event.depth,
				memoryDeltaBytes: event.memoryDeltaBytes,
				argsPreview: event.argsPreview
			});
			const currentFunction = bucket.functionStatsByName.get(event.functionName) ?? {
				totalDurationUs: 0,
				count: 0,
				totalMemoryDeltaBytes: undefined
			};
			currentFunction.totalDurationUs += event.durationUs;
			currentFunction.count += 1;
			if (event.memoryDeltaBytes !== undefined) {
				currentFunction.totalMemoryDeltaBytes = (currentFunction.totalMemoryDeltaBytes ?? 0) + event.memoryDeltaBytes;
			}
			bucket.functionStatsByName.set(event.functionName, currentFunction);
		}

		const lineStatsBySourcePath = new Map<string, Map<number, TraceLineStats>>();
		const hitsBySourcePath = new Map<string, number>();
		for (const bucket of mutableByPathLine.values()) {
			const avgDurationUs = bucket.count > 0 ? bucket.totalDurationUs / bucket.count : 0;
			const stat: TraceLineStats = {
				key: buildLineKey(bucket.normalizedSourcePath, bucket.line),
				normalizedSourcePath: bucket.normalizedSourcePath,
				line: bucket.line,
				traceUri,
				traceMtime: mtime,
				totalDurationUs: bucket.totalDurationUs,
				totalMemoryDeltaBytes: bucket.totalMemoryDeltaBytes,
				count: bucket.count,
				avgDurationUs,
				minDurationUs: bucket.minDurationUs,
				maxDurationUs: bucket.maxDurationUs,
				functionStats: buildFunctionStats(bucket.functionStatsByName),
				topSlowEvents: [...bucket.topSlowEvents]
			};

			const existing = lineStatsBySourcePath.get(bucket.normalizedSourcePath);
			if (existing) {
				existing.set(bucket.line, stat);
			} else {
				lineStatsBySourcePath.set(bucket.normalizedSourcePath, new Map([[bucket.line, stat]]));
			}
			hitsBySourcePath.set(bucket.normalizedSourcePath, (hitsBySourcePath.get(bucket.normalizedSourcePath) ?? 0) + bucket.count);
		}

		return {
			traceUri,
			mtime,
			lineStatsBySourcePath,
			hitsBySourcePath
		};
	}

	private async resolveSourcePath(sourcePath: string, traceUri: vscode.Uri): Promise<string | undefined> {
		const cacheKey = `${traceUri.toString()}\u0000${sourcePath}`;
		if (this.sourceResolutionCache.has(cacheKey)) {
			return this.sourceResolutionCache.get(cacheKey);
		}
		const resolved = await this.sourceResolver.resolveSourceUri(sourcePath, traceUri);
		const normalized = resolved ? normalizeFsPath(resolved.fsPath) : undefined;
		this.sourceResolutionCache.set(cacheKey, normalized);
		return normalized;
	}
}

function buildLineKey(path: string, line: number): string {
	return `${path}:${line}`;
}

function buildTraceIdentity(uri: vscode.Uri, mtime: number): string {
	return `${uri.toString()}@${mtime}`;
}

function normalizeFsPath(value: string): string {
	return normalizeSlashes(value).toLowerCase();
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) {
		return fallback;
	}
	const rounded = Math.round(value);
	return Math.max(min, Math.min(max, rounded));
}

function insertTopSlowEvent(bucket: TraceLineSlowEvent[], event: TraceLineSlowEvent): void {
	bucket.push(event);
	bucket.sort((a, b) => b.durationUs - a.durationUs);
	if (bucket.length > TOP_SLOW_EVENTS_LIMIT) {
		bucket.length = TOP_SLOW_EVENTS_LIMIT;
	}
}

function buildFunctionStats(
	byName: Map<string, { totalDurationUs: number; count: number; totalMemoryDeltaBytes?: number }>
): TraceLineFunctionStats[] {
	const out: TraceLineFunctionStats[] = [];
	for (const [functionName, entry] of byName.entries()) {
		const avgDurationUs = entry.count > 0 ? entry.totalDurationUs / entry.count : 0;
		const avgMemoryDeltaBytes = entry.totalMemoryDeltaBytes !== undefined && entry.count > 0
			? entry.totalMemoryDeltaBytes / entry.count
			: undefined;
		out.push({
			functionName,
			totalDurationUs: entry.totalDurationUs,
			count: entry.count,
			avgDurationUs,
			totalMemoryDeltaBytes: entry.totalMemoryDeltaBytes,
			avgMemoryDeltaBytes
		});
	}
	out.sort((a, b) => b.totalDurationUs - a.totalDurationUs);
	return out;
}
