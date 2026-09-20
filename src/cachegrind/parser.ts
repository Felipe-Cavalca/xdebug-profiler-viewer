export interface CachegrindEventCost {
	inclusive: number;
	self: number;
}

export interface CachegrindEdge {
	name: string;
	inclusive: number;
	calls: number;
	file?: string;
	line?: number;
	eventCosts: Record<string, CachegrindEventCost>;
}

export interface CachegrindFunction {
	id: string;
	name: string;
	inclusive: number;
	self: number;
	callsObserved: number;
	// Heuristic fallback used for averages when observed calls are missing.
	callsEffective: number;
	file?: string;
	line?: number;
	callers: CachegrindEdge[];
	callees: CachegrindEdge[];
	eventCosts: Record<string, CachegrindEventCost>;
	contexts?: unknown[];
}

export interface CachegrindProfile {
	events: string[];
	primaryEvent: string;
	eventScaleNs: Record<string, number>;
	summary?: number;
	summaryByEvent: Record<string, number>;
	metadata: Record<string, string>;
	// Canonical total for percentages is totalSelf (self costs do not double-count call chains).
	totalSelf: number;
	// sumInclusive is a sum of per-function inclusive values and is not a profile-wide total.
	sumInclusive: number;
	totalCalls: number;
	maxFanIn: number;
	maxFanOut: number;
	maxDegree: number;
	functions: CachegrindFunction[];
}

interface MutableEdge {
	targetId: string;
	name: string;
	inclusive: number;
	calls: number;
	file?: string;
	line?: number;
	eventCosts: Map<string, CachegrindEventCost>;
}

interface MutableFunction {
	id: string;
	name: string;
	inclusive: number;
	self: number;
	callsObserved: number;
	callsEffective: number;
	file?: string;
	line?: number;
	callers: Map<string, MutableEdge>;
	callees: Map<string, MutableEdge>;
	eventCosts: Map<string, CachegrindEventCost>;
}

interface ValidationOptions {
	requireEventSelfMatch?: boolean;
}

const UNKNOWN_NAME = '[unknown]';
const ENTRYPOINT_RE = /(?:^|[:\\])(?:main|\{main\})(?:$|[:\\])/i;

// Inline sample for manual/dev invariant checks.
export const DEV_SAMPLE_CACHEGRIND = `events: Time Memory
fl=/sample.php
fn={main}
1 100 20
cfl=/sample.php
cfn=work
calls=2 10
2 60 8
fl=/sample.php
fn=work
10 30 4`;

export function parseCachegrind(content: string): CachegrindProfile {
	const events: string[] = ['cost'];
	let eventScaleNs: Record<string, number> = {};
	let primaryEvent = 'cost';
	let summary: number | undefined;
	let summaryByEvent: Record<string, number> = {};
	let summaryWasProvided = false;
	const metadata: Record<string, string> = {};

	const fileSymbols = new Map<string, string>();
	const fnSymbols = new Map<string, string>();
	const functions = new Map<string, MutableFunction>();

	let currentFile: string | undefined;
	let currentFunction: MutableFunction | undefined;
	let currentCalleeFile: string | undefined;
	let currentEdge: MutableEdge | undefined;

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}

		if (line.startsWith('events:')) {
			const eventNames = line
				.slice('events:'.length)
				.trim()
				.split(/\s+/)
				.filter(Boolean);
			if (eventNames.length > 0) {
				events.splice(0, events.length, ...eventNames);
				eventScaleNs = {};
				for (const eventName of eventNames) {
					const scaleNs = extractTimeScaleNs(eventName);
					if (scaleNs !== undefined) {
						eventScaleNs[eventName] = scaleNs;
					}
				}
				primaryEvent = eventNames[0];
			}
			continue;
		}

		if (line.startsWith('summary:')) {
			const values = parseManyNumbers(line.slice('summary:'.length));
			const value = values[0];
			if (value !== undefined) {
				summary = value;
			}
			summaryByEvent = toEventTotals(values, events);
			summaryWasProvided = true;
			continue;
		}

		const headerMatch = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
		if (headerMatch) {
			const [, key, value] = headerMatch;
			metadata[key] = value;
			continue;
		}

		if (line.startsWith('fl=')) {
			currentFile = resolveSymbol(line.slice(3), fileSymbols);
			currentEdge = undefined;
			continue;
		}

		if (line.startsWith('fn=')) {
			const functionName = resolveSymbol(line.slice(3), fnSymbols);
			currentFunction = getOrCreateFunction(functions, functionName, currentFile);
			currentEdge = undefined;
			continue;
		}

		if (line.startsWith('cfl=')) {
			currentCalleeFile = resolveSymbol(line.slice(4), fileSymbols);
			continue;
		}

		if (line.startsWith('cfn=')) {
			if (!currentFunction) {
				continue;
			}

			const calleeName = resolveSymbol(line.slice(4), fnSymbols);
			const callee = getOrCreateFunction(functions, calleeName, currentCalleeFile);
			currentEdge = getOrCreateEdge(currentFunction, callee);
			continue;
		}

		if (line.startsWith('calls=')) {
			if (!currentEdge) {
				continue;
			}

			const [callsRaw, lineRaw] = line.slice('calls='.length).trim().split(/\s+/, 2);
			const callCount = parseSingleNumber(callsRaw);
			if (callCount !== undefined) {
				currentEdge.calls += callCount;
				const callee = functions.get(currentEdge.targetId);
				if (callee) {
					callee.callsObserved += callCount;
				}
			}

			const targetLine = parseSingleNumber(lineRaw);
			if (targetLine !== undefined) {
				const callee = functions.get(currentEdge.targetId);
				if (callee && callee.line === undefined) {
					callee.line = targetLine;
				}
			}
			continue;
		}

		const parsedData = parseDataLine(line);
		if (!parsedData || !currentFunction) {
			continue;
		}

		const parsedLine = parsedData.line;
		if (!currentEdge && parsedLine !== undefined && currentFunction.line === undefined) {
			currentFunction.line = parsedLine;
		}
		const primaryCost = getPrimaryCost(parsedData.values);
		if (currentEdge) {
			currentEdge.inclusive += primaryCost;
			applyEventCostsToMap(currentEdge.eventCosts, parsedData.values, events, false);
		} else {
			currentFunction.self += primaryCost;
		}
		currentFunction.inclusive += primaryCost;
		applyEventCostsToMap(currentFunction.eventCosts, parsedData.values, events, !currentEdge);
	}

	buildReverseEdges(functions);
	applyEffectiveCalls(functions);

	const computedSelfTotals = computeSelfTotals(functions, events);
	if (!summaryWasProvided) {
		summaryByEvent = { ...computedSelfTotals };
	}

	const functionList: CachegrindFunction[] = Array.from(functions.values()).map((fn) => ({
		id: fn.id,
		name: fn.name,
		inclusive: fn.inclusive,
		self: fn.self,
		callsObserved: fn.callsObserved,
		callsEffective: fn.callsEffective,
		file: fn.file,
		line: fn.line,
		callers: Array.from(fn.callers.values()).map((edge) => ({
			name: edge.name,
			inclusive: edge.inclusive,
			calls: edge.calls,
			file: edge.file,
			line: edge.line,
			eventCosts: mapToObject(edge.eventCosts)
		})),
		callees: Array.from(fn.callees.values()).map((edge) => ({
			name: edge.name,
			inclusive: edge.inclusive,
			calls: edge.calls,
			file: edge.file,
			line: edge.line,
			eventCosts: mapToObject(edge.eventCosts)
		})),
		eventCosts: mapToObject(fn.eventCosts)
	}));

	functionList.sort((a, b) => b.inclusive - a.inclusive);
	const sumInclusive = functionList.reduce((acc, fn) => acc + fn.inclusive, 0);
	const totalSelf = Number(summaryByEvent[primaryEvent] ?? computedSelfTotals[primaryEvent] ?? 0);
	const totalCalls = functionList.reduce((acc, fn) => acc + fn.callsObserved, 0);
	const maxFanIn = functionList.reduce((acc, fn) => Math.max(acc, fn.callers.length), 0);
	const maxFanOut = functionList.reduce((acc, fn) => Math.max(acc, fn.callees.length), 0);
	const maxDegree = functionList.reduce((acc, fn) => Math.max(acc, fn.callers.length + fn.callees.length), 0);

	const profile: CachegrindProfile = {
		events,
		primaryEvent,
		eventScaleNs,
		summary,
		summaryByEvent,
		metadata,
		totalSelf,
		sumInclusive,
		totalCalls,
		maxFanIn,
		maxFanOut,
		maxDegree,
		functions: functionList
	};

	if (isDevMode()) {
		validateProfile(profile, { requireEventSelfMatch: !summaryWasProvided });
	}

	return profile;
}

export function validateProfile(profile: CachegrindProfile, options: ValidationOptions = {}): void {
	const errors: string[] = [];
	const requireEventSelfMatch = Boolean(options.requireEventSelfMatch);
	const activeEvents = profile.events.length > 0 ? profile.events : ['cost'];

	if (requireEventSelfMatch) {
		for (const eventName of activeEvents) {
			const expected = profile.functions.reduce((sum, fn) => sum + Number(fn.eventCosts[eventName]?.self ?? 0), 0);
			const actual = Number(profile.summaryByEvent[eventName] ?? 0);
			if (Math.abs(expected - actual) > 0.000001) {
				errors.push(
					`summaryByEvent mismatch for "${eventName}": summary=${actual}, computedSelf=${expected}`
				);
			}
		}
	}

	for (const fn of profile.functions) {
		if (fn.self > 0 && fn.callsEffective < 1) {
			errors.push(`callsEffective must be >= 1 when self > 0 for function "${fn.name}"`);
		}
		for (const edge of fn.callees) {
			for (const eventName of activeEvents) {
				const inclusive = Number(edge.eventCosts[eventName]?.inclusive ?? 0);
				if (inclusive < 0) {
					errors.push(`edge inclusive must be >= 0 for "${fn.name}" -> "${edge.name}" event "${eventName}"`);
				}
			}
		}
	}

	if (errors.length > 0) {
		throw new Error(`Invalid cachegrind profile invariants:\n- ${errors.join('\n- ')}`);
	}
}

export function validateDevSampleProfile(): void {
	const profile = parseCachegrind(DEV_SAMPLE_CACHEGRIND);
	validateProfile(profile, { requireEventSelfMatch: true });
}

function buildReverseEdges(functions: Map<string, MutableFunction>): void {
	for (const fn of functions.values()) {
		for (const edge of fn.callees.values()) {
			const callee = functions.get(edge.targetId);
			if (!callee) {
				continue;
			}

			const reverseKey = `${fn.id}->${callee.id}`;
			const existing = callee.callers.get(reverseKey);
			if (existing) {
				existing.calls += edge.calls;
				existing.inclusive += edge.inclusive;
				mergeEventCostMaps(existing.eventCosts, edge.eventCosts);
				continue;
			}

			callee.callers.set(reverseKey, {
				targetId: fn.id,
				name: fn.name,
				inclusive: edge.inclusive,
				calls: edge.calls,
				file: fn.file,
				line: fn.line,
				eventCosts: cloneEventCostMap(edge.eventCosts)
			});
		}
	}
}

function getOrCreateFunction(
	functions: Map<string, MutableFunction>,
	name: string,
	file?: string
): MutableFunction {
	const safeName = name || UNKNOWN_NAME;
	const key = buildFunctionKey(safeName, file);
	const existing = functions.get(key);
	if (existing) {
		if (!existing.file && file) {
			existing.file = file;
		}
		return existing;
	}

	const fn: MutableFunction = {
		id: key,
		name: safeName,
		inclusive: 0,
		self: 0,
		callsObserved: 0,
		callsEffective: 0,
		file,
		callers: new Map(),
		callees: new Map(),
		eventCosts: new Map()
	};
	functions.set(key, fn);
	return fn;
}

function getOrCreateEdge(source: MutableFunction, target: MutableFunction): MutableEdge {
	const key = `${source.id}->${target.id}`;
	const existing = source.callees.get(key);
	if (existing) {
		return existing;
	}

	const edge: MutableEdge = {
		targetId: target.id,
		name: target.name,
		inclusive: 0,
		calls: 0,
		file: target.file,
		line: target.line,
		eventCosts: new Map()
	};
	source.callees.set(key, edge);
	return edge;
}

function resolveSymbol(input: string, symbols: Map<string, string>): string {
	const value = input.trim();
	if (!value) {
		return UNKNOWN_NAME;
	}

	const match = value.match(/^\((\d+)\)\s*(.*)$/);
	if (!match) {
		return value;
	}

	const [, symbolId, symbolValueRaw] = match;
	const symbolValue = symbolValueRaw.trim();
	if (symbolValue) {
		symbols.set(symbolId, symbolValue);
		return symbolValue;
	}

	return symbols.get(symbolId) ?? UNKNOWN_NAME;
}

function parseDataLine(line: string): { line?: number; values: number[] } | undefined {
	const parts = line.split(/\s+/);
	if (parts.length < 2) {
		return undefined;
	}

	const values: number[] = [];
	for (const token of parts.slice(1)) {
		const num = parseSingleNumber(token);
		if (num === undefined) {
			continue;
		}
		values.push(num);
	}
	if (values.length === 0) {
		return undefined;
	}
	return {
		line: parseSingleNumber(parts[0]),
		values
	};
}

function getPrimaryCost(values: number[]): number {
	return values[0] ?? 0;
}

function parseSingleNumber(raw: string | undefined): number | undefined {
	if (!raw) {
		return undefined;
	}

	const normalized = raw.replace(/,/g, '');
	if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
		return undefined;
	}

	const value = Number(normalized);
	return Number.isFinite(value) ? value : undefined;
}

function buildFunctionKey(name: string, file?: string): string {
	return `${name}\u0000${file ?? ''}`;
}

function applyEventCostsToMap(
	costMap: Map<string, CachegrindEventCost>,
	values: number[],
	events: string[],
	isSelf: boolean
): void {
	const activeEvents = events.length > 0 ? events : ['cost'];
	for (let i = 0; i < activeEvents.length; i += 1) {
		const event = activeEvents[i];
		const value = values[i] ?? 0;
		const current = costMap.get(event) ?? { inclusive: 0, self: 0 };
		current.inclusive += value;
		if (isSelf) {
			current.self += value;
		}
		costMap.set(event, current);
	}
}

function cloneEventCostMap(map: Map<string, CachegrindEventCost>): Map<string, CachegrindEventCost> {
	const clone = new Map<string, CachegrindEventCost>();
	for (const [eventName, eventCost] of map.entries()) {
		clone.set(eventName, { inclusive: eventCost.inclusive, self: eventCost.self });
	}
	return clone;
}

function mergeEventCostMaps(
	target: Map<string, CachegrindEventCost>,
	source: Map<string, CachegrindEventCost>
): void {
	for (const [eventName, eventCost] of source.entries()) {
		const current = target.get(eventName) ?? { inclusive: 0, self: 0 };
		current.inclusive += eventCost.inclusive;
		current.self += eventCost.self;
		target.set(eventName, current);
	}
}

function mapToObject(map: Map<string, CachegrindEventCost>): Record<string, CachegrindEventCost> {
	const out: Record<string, CachegrindEventCost> = {};
	for (const [key, value] of map.entries()) {
		out[key] = value;
	}
	return out;
}

function parseManyNumbers(raw: string): number[] {
	const out: number[] = [];
	for (const token of raw.trim().split(/\s+/)) {
		const value = parseSingleNumber(token);
		if (value !== undefined) {
			out.push(value);
		}
	}
	return out;
}

function toEventTotals(values: number[], events: string[]): Record<string, number> {
	const out: Record<string, number> = {};
	const activeEvents = events.length > 0 ? events : ['cost'];
	for (let i = 0; i < activeEvents.length; i += 1) {
		out[activeEvents[i]] = values[i] ?? 0;
	}
	return out;
}

function applyEffectiveCalls(functions: Map<string, MutableFunction>): void {
	for (const fn of functions.values()) {
		if (fn.callsObserved > 0) {
			fn.callsEffective = fn.callsObserved;
			continue;
		}
		if (fn.self > 0 || ENTRYPOINT_RE.test(fn.name)) {
			fn.callsEffective = 1;
			continue;
		}
		fn.callsEffective = 0;
	}
}

function computeSelfTotals(functions: Map<string, MutableFunction>, events: string[]): Record<string, number> {
	const totals = toEventTotals([], events);
	for (const fn of functions.values()) {
		for (const eventName of Object.keys(totals)) {
			totals[eventName] += Number(fn.eventCosts.get(eventName)?.self ?? 0);
		}
	}
	return totals;
}

function isDevMode(): boolean {
	return process.env.NODE_ENV !== 'production';
}

function extractTimeScaleNs(eventName: string): number | undefined {
	const text = String(eventName || '').toLowerCase();
	if (!/time|ns|us|µs|μs|ms|sec|second|minute|hour/.test(text)) {
		return undefined;
	}
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

function unitToNs(unit: string): number {
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
