"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEV_SAMPLE_CACHEGRIND = void 0;
exports.parseCachegrind = parseCachegrind;
exports.validateProfile = validateProfile;
exports.validateDevSampleProfile = validateDevSampleProfile;
const UNKNOWN_NAME = '[unknown]';
const ENTRYPOINT_RE = /(?:^|[:\\])(?:main|\{main\})(?:$|[:\\])/i;
// Inline sample for manual/dev invariant checks.
exports.DEV_SAMPLE_CACHEGRIND = `events: Time Memory
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
function parseCachegrind(content) {
    const events = ['cost'];
    let eventScaleNs = {};
    let primaryEvent = 'cost';
    let summary;
    let summaryByEvent = {};
    let summaryWasProvided = false;
    const metadata = {};
    const fileSymbols = new Map();
    const fnSymbols = new Map();
    const functions = new Map();
    let currentFile;
    let currentFunction;
    let currentCalleeFile;
    let currentEdge;
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
        }
        else {
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
    const functionList = Array.from(functions.values()).map((fn) => ({
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
    const profile = {
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
function validateProfile(profile, options = {}) {
    const errors = [];
    const requireEventSelfMatch = Boolean(options.requireEventSelfMatch);
    const activeEvents = profile.events.length > 0 ? profile.events : ['cost'];
    if (requireEventSelfMatch) {
        for (const eventName of activeEvents) {
            const expected = profile.functions.reduce((sum, fn) => sum + Number(fn.eventCosts[eventName]?.self ?? 0), 0);
            const actual = Number(profile.summaryByEvent[eventName] ?? 0);
            if (Math.abs(expected - actual) > 0.000001) {
                errors.push(`summaryByEvent mismatch for "${eventName}": summary=${actual}, computedSelf=${expected}`);
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
function validateDevSampleProfile() {
    const profile = parseCachegrind(exports.DEV_SAMPLE_CACHEGRIND);
    validateProfile(profile, { requireEventSelfMatch: true });
}
function buildReverseEdges(functions) {
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
function getOrCreateFunction(functions, name, file) {
    const safeName = name || UNKNOWN_NAME;
    const key = buildFunctionKey(safeName, file);
    const existing = functions.get(key);
    if (existing) {
        if (!existing.file && file) {
            existing.file = file;
        }
        return existing;
    }
    const fn = {
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
function getOrCreateEdge(source, target) {
    const key = `${source.id}->${target.id}`;
    const existing = source.callees.get(key);
    if (existing) {
        return existing;
    }
    const edge = {
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
function resolveSymbol(input, symbols) {
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
function parseDataLine(line) {
    const parts = line.split(/\s+/);
    if (parts.length < 2) {
        return undefined;
    }
    const values = [];
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
function getPrimaryCost(values) {
    return values[0] ?? 0;
}
function parseSingleNumber(raw) {
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
function buildFunctionKey(name, file) {
    return `${name}\u0000${file ?? ''}`;
}
function applyEventCostsToMap(costMap, values, events, isSelf) {
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
function cloneEventCostMap(map) {
    const clone = new Map();
    for (const [eventName, eventCost] of map.entries()) {
        clone.set(eventName, { inclusive: eventCost.inclusive, self: eventCost.self });
    }
    return clone;
}
function mergeEventCostMaps(target, source) {
    for (const [eventName, eventCost] of source.entries()) {
        const current = target.get(eventName) ?? { inclusive: 0, self: 0 };
        current.inclusive += eventCost.inclusive;
        current.self += eventCost.self;
        target.set(eventName, current);
    }
}
function mapToObject(map) {
    const out = {};
    for (const [key, value] of map.entries()) {
        out[key] = value;
    }
    return out;
}
function parseManyNumbers(raw) {
    const out = [];
    for (const token of raw.trim().split(/\s+/)) {
        const value = parseSingleNumber(token);
        if (value !== undefined) {
            out.push(value);
        }
    }
    return out;
}
function toEventTotals(values, events) {
    const out = {};
    const activeEvents = events.length > 0 ? events : ['cost'];
    for (let i = 0; i < activeEvents.length; i += 1) {
        out[activeEvents[i]] = values[i] ?? 0;
    }
    return out;
}
function applyEffectiveCalls(functions) {
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
function computeSelfTotals(functions, events) {
    const totals = toEventTotals([], events);
    for (const fn of functions.values()) {
        for (const eventName of Object.keys(totals)) {
            totals[eventName] += Number(fn.eventCosts.get(eventName)?.self ?? 0);
        }
    }
    return totals;
}
function isDevMode() {
    return process.env.NODE_ENV !== 'production';
}
function extractTimeScaleNs(eventName) {
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
function unitToNs(unit) {
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
//# sourceMappingURL=parser.js.map