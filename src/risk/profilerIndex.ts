import * as vscode from 'vscode';
import { CachegrindFunction, CachegrindProfile, parseCachegrind } from '../cachegrind/parser';
import { normalizeSlashes, SourceResolver } from '../source/sourceResolver';

const PROFILER_GLOBS = ['**/cachegrind.out.*', '**/*.cachegrind', '**/*.cg', '**/*.out'];
const FUNCTION_INDEX_SCAN_LIMIT = 10000;
const DEFAULT_INDEX_DEBOUNCE_MS = 350;
const DEFAULT_INDEX_RETRY_MS = 900;
const DEFAULT_MAX_INDEX_RETRIES = 3;

export interface IndexedFunctionMatch {
	functionData: CachegrindFunction;
	profile: CachegrindProfile;
	profileUri: vscode.Uri;
	profileMtime: number;
}

interface FunctionOccurrence {
	profileKey: string;
	profileUri: vscode.Uri;
	mtime: number;
	name: string;
	resolvedFilePath?: string;
	rawFilePath?: string;
	line?: number;
	functionId: string;
}

interface ProfileState {
	profileUri: vscode.Uri;
	mtime: number;
	profile: CachegrindProfile;
	occurrences: FunctionOccurrence[];
}

interface IndexOptions {
	debounceMs: number;
	retryMs: number;
	maxRetries: number;
}

export class ProfilerIndex implements vscode.Disposable {
	private readonly sourceResolver: SourceResolver;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly profileByKey = new Map<string, ProfileState>();
	private readonly occurrencesByName = new Map<string, FunctionOccurrence[]>();
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

		for (const glob of PROFILER_GLOBS) {
			const watcher = vscode.workspace.createFileSystemWatcher(glob);
			watcher.onDidCreate((uri) => this.scheduleUpsert(uri, this.getIndexOptions().debounceMs), this, this.disposables);
			watcher.onDidChange((uri) => this.scheduleUpsert(uri, this.getIndexOptions().debounceMs), this, this.disposables);
			watcher.onDidDelete((uri) => this.deleteProfile(uri), this, this.disposables);
			this.disposables.push(watcher);
		}
	}

	public async rebuildAll(): Promise<void> {
		const sequence = ++this.refreshSequence;
		this.profileByKey.clear();
		this.occurrencesByName.clear();
		this.sourceResolutionCache.clear();

		const uriMap = new Map<string, vscode.Uri>();
		const results = await Promise.all(
			PROFILER_GLOBS.map((glob) => vscode.workspace.findFiles(glob, '**/node_modules/**', FUNCTION_INDEX_SCAN_LIMIT))
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
			await this.upsertProfile(uri, false);
		}

		if (sequence === this.refreshSequence) {
			this.didChangeEmitter.fire();
		}
	}

	public getLatestProfileForFunction(name: string, documentUri: vscode.Uri, line?: number): IndexedFunctionMatch | undefined {
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

	public dispose(): void {
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

	private async upsertProfile(uri: vscode.Uri, fireEvent = true): Promise<void> {
		const key = uri.toString();
		this.removeProfileByKey(key);

		try {
			const [fileStat, bytes] = await Promise.all([vscode.workspace.fs.stat(uri), vscode.workspace.fs.readFile(uri)]);
			const text = new TextDecoder('utf-8').decode(bytes);
			const profile = parseCachegrind(text);
			const occurrences = await this.buildOccurrencesForProfile(uri, fileStat.mtime, profile);

			const state: ProfileState = {
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

	private deleteProfile(uri: vscode.Uri): void {
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

	private scheduleUpsert(uri: vscode.Uri, delayMs: number): void {
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

	private async buildOccurrencesForProfile(
		profileUri: vscode.Uri,
		mtime: number,
		profile: CachegrindProfile
	): Promise<FunctionOccurrence[]> {
		const occurrences: FunctionOccurrence[] = [];
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
				rawFilePath: fn.file ? normalizeSlashes(fn.file).toLowerCase() : undefined,
				line: fn.line,
				functionId: fn.id
			});
		}
		return occurrences;
	}

	private async resolveFunctionFilePath(filePath: string | undefined, profileUri: vscode.Uri): Promise<string | undefined> {
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

	private addOccurrences(occurrences: FunctionOccurrence[]): void {
		for (const occurrence of occurrences) {
			const current = this.occurrencesByName.get(occurrence.name);
			if (current) {
				current.push(occurrence);
			} else {
				this.occurrencesByName.set(occurrence.name, [occurrence]);
			}
		}
	}

	private removeProfileByKey(profileKey: string): void {
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

function pickBestOccurrence(occurrences: FunctionOccurrence[], line?: number): FunctionOccurrence | undefined {
	if (occurrences.length === 0) {
		return undefined;
	}
	let best: FunctionOccurrence | undefined;
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

function lineDistance(candidateLine: number | undefined, line: number): number {
	if (!candidateLine || candidateLine <= 0) {
		return Number.MAX_SAFE_INTEGER;
	}
	return Math.abs(candidateLine - line);
}

function extractComparableFunctionName(name: string): string {
	const trimmed = String(name || '').trim();
	if (!trimmed) {
		return '';
	}
	const chunks = trimmed.split(/::|->|\\/);
	return chunks[chunks.length - 1] ?? trimmed;
}

function normalizeName(name: string): string {
	return String(name || '').trim().toLowerCase();
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
