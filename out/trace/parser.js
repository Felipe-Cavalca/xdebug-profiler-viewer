"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEV_SAMPLE_TRACE = void 0;
exports.parseTrace = parseTrace;
exports.validateDevSampleTrace = validateDevSampleTrace;
const MAX_ARGS_PREVIEW_LENGTH = 96;
const SENSITIVE_ARG_RE = /(password|passwd|pwd|token|secret|api[_-]?key)\s*([=:]|=>)\s*('[^']*'|"[^"]*"|[^,\s)\]]+)/gi;
// Inline sample for manual/dev invariant checks.
exports.DEV_SAMPLE_TRACE = `Version: 3.0.0
File format: 4
TRACE START [2026-03-01 10:00:00]
0\t1\t0\t0.000001\t425736\tApp\\run\t1\t/container/app/index.php\t12
1\t2\t0\t0.000005\t425800\tWorker\\doWork\t1\t/container/app/src/App.php\t48
1\t2\t1\t0.000205\t425824
0\t1\t1\t0.000260\t425840
TRACE END   [2026-03-01 10:00:00]`;
function parseTrace(content) {
    const events = [];
    const pendingByDepth = new Map();
    const humanStack = [];
    let parsedLines = 0;
    let ignoredLines = 0;
    let tabularMatches = 0;
    let humanMatches = 0;
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || isTraceMetadataLine(line)) {
            continue;
        }
        const tabular = parseTabularLine(line);
        if (tabular) {
            tabularMatches += 1;
            parsedLines += 1;
            if (tabular.eventType === 'enter') {
                if (!tabular.functionName) {
                    continue;
                }
                pendingByDepth.set(tabular.depth, {
                    functionName: tabular.functionName,
                    filePath: tabular.filePath,
                    line: tabular.line,
                    depth: tabular.depth,
                    enterTimestampUs: tabular.timestampUs,
                    enterMemoryBytes: tabular.memoryBytes,
                    argsPreview: tabular.argsPreview
                });
                continue;
            }
            const pending = pendingByDepth.get(tabular.depth);
            if (!pending) {
                continue;
            }
            pendingByDepth.delete(tabular.depth);
            const durationUs = tabular.timestampUs - pending.enterTimestampUs;
            if (durationUs <= 0 || !Number.isFinite(durationUs)) {
                continue;
            }
            events.push({
                functionName: pending.functionName,
                filePath: pending.filePath,
                line: pending.line,
                depth: pending.depth,
                enterTimestampUs: pending.enterTimestampUs,
                exitTimestampUs: tabular.timestampUs,
                durationUs,
                memoryDeltaBytes: computeMemoryDelta(pending.enterMemoryBytes, tabular.memoryBytes),
                argsPreview: pending.argsPreview
            });
            continue;
        }
        const human = parseHumanLine(line);
        if (!human) {
            ignoredLines += 1;
            continue;
        }
        humanMatches += 1;
        parsedLines += 1;
        if (human.type === 'enter') {
            if (!human.functionName) {
                continue;
            }
            humanStack.push({
                functionName: human.functionName,
                filePath: human.filePath,
                line: human.line,
                depth: humanStack.length,
                enterTimestampUs: human.timestampUs,
                argsPreview: human.argsPreview
            });
            continue;
        }
        const pending = humanStack.pop();
        if (!pending) {
            continue;
        }
        const durationUs = human.timestampUs - pending.enterTimestampUs;
        if (durationUs <= 0 || !Number.isFinite(durationUs)) {
            continue;
        }
        events.push({
            functionName: pending.functionName,
            filePath: pending.filePath,
            line: pending.line,
            depth: pending.depth,
            enterTimestampUs: pending.enterTimestampUs,
            exitTimestampUs: human.timestampUs,
            durationUs,
            argsPreview: pending.argsPreview
        });
    }
    let format = 'unknown';
    if (tabularMatches > 0) {
        format = 'xdebug-tabular';
    }
    else if (humanMatches > 0) {
        format = 'xdebug-human';
    }
    return {
        events,
        parsedLines,
        ignoredLines,
        format
    };
}
function validateDevSampleTrace() {
    const result = parseTrace(exports.DEV_SAMPLE_TRACE);
    if (result.events.length < 2) {
        throw new Error(`Invalid dev trace sample: expected at least 2 events, got ${result.events.length}`);
    }
    const first = result.events[0];
    if (!first.filePath || !first.line || first.durationUs <= 0) {
        throw new Error('Invalid dev trace sample: first event must have file, line and positive duration.');
    }
}
function parseTabularLine(line) {
    if (!line.includes('\t')) {
        return undefined;
    }
    const cols = line.split('\t').map((part) => part.trim());
    if (cols.length < 5) {
        return undefined;
    }
    const depth = parseInteger(cols[0]);
    const eventTypeRaw = parseInteger(cols[2]);
    const timestamp = parseDecimal(cols[3]);
    const memoryBytes = parseInteger(cols[4]);
    if (depth === undefined || eventTypeRaw === undefined || timestamp === undefined) {
        return undefined;
    }
    const eventType = eventTypeRaw === 0 ? 'enter' : 'exit';
    const functionRaw = cols[5];
    // Xdebug trace format 4 commonly emits:
    // [0]=level [1]=funcNr [2]=entry/exit [3]=time [4]=memory [5]=func [6]=userDefined
    // [7]=includeFilename [8]=callsiteFile [9]=callsiteLine [10]=numArgs ...
    const callsiteFile = cols[8] || cols[7] || undefined;
    const lineNumber = parseInteger(cols[9]) ?? parseInteger(cols[8]);
    const parsedFunction = functionRaw ? parseFunctionWithArgs(functionRaw) : undefined;
    const argsPreview = parseTabularArgsPreview(cols);
    return {
        depth,
        eventType,
        timestampUs: secondsToMicros(timestamp),
        memoryBytes,
        functionName: parsedFunction?.functionName,
        argsPreview: parsedFunction?.argsPreview ?? argsPreview,
        filePath: callsiteFile,
        line: lineNumber
    };
}
function computeMemoryDelta(enter, exit) {
    if (enter === undefined || exit === undefined) {
        return undefined;
    }
    const delta = exit - enter;
    return Number.isFinite(delta) ? delta : undefined;
}
function parseHumanLine(line) {
    const enterMatch = line.match(/^\s*(\d+(?:\.\d+)?)\s+\d+\s+(?:\d+\s+)?->\s*([^\s(][^(]*)\((.*)\)\s+(.+):(\d+)\s*$/);
    if (enterMatch) {
        const timestamp = parseDecimal(enterMatch[1]);
        if (timestamp === undefined) {
            return undefined;
        }
        return {
            type: 'enter',
            timestampUs: secondsToMicros(timestamp),
            functionName: normalizeFunctionName(enterMatch[2]),
            argsPreview: sanitizeArgsPreview(enterMatch[3]),
            filePath: enterMatch[4],
            line: parseInteger(enterMatch[5])
        };
    }
    const exitMatch = line.match(/^\s*(\d+(?:\.\d+)?)\s+\d+\s+(?:\d+\s+)?(?:<-|=>|>=>)\b/);
    if (!exitMatch) {
        return undefined;
    }
    const timestamp = parseDecimal(exitMatch[1]);
    if (timestamp === undefined) {
        return undefined;
    }
    return {
        type: 'exit',
        timestampUs: secondsToMicros(timestamp)
    };
}
function parseFunctionWithArgs(raw) {
    const text = raw.trim();
    const match = text.match(/^(.+?)\((.*)\)$/);
    if (!match) {
        return {
            functionName: normalizeFunctionName(text)
        };
    }
    return {
        functionName: normalizeFunctionName(match[1]),
        argsPreview: sanitizeArgsPreview(match[2])
    };
}
function parseTabularArgsPreview(cols) {
    const count = parseInteger(cols[10]);
    if (count === undefined || count <= 0) {
        return undefined;
    }
    const args = cols.slice(11, 11 + count).filter(Boolean);
    if (args.length === 0) {
        return undefined;
    }
    return sanitizeArgsPreview(args.join(', '));
}
function normalizeFunctionName(raw) {
    return raw.trim() || '[unknown]';
}
function sanitizeArgsPreview(raw) {
    if (!raw) {
        return undefined;
    }
    const compact = raw.replace(/\s+/g, ' ').trim();
    if (!compact) {
        return undefined;
    }
    const masked = compact.replace(SENSITIVE_ARG_RE, (_, key, sep) => `${key}${sep}***`);
    if (masked.length <= MAX_ARGS_PREVIEW_LENGTH) {
        return masked;
    }
    return `${masked.slice(0, MAX_ARGS_PREVIEW_LENGTH - 3)}...`;
}
function parseInteger(raw) {
    if (!raw || !/^-?\d+$/.test(raw)) {
        return undefined;
    }
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : undefined;
}
function parseDecimal(raw) {
    if (!raw || !/^-?\d+(?:\.\d+)?$/.test(raw)) {
        return undefined;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
}
function secondsToMicros(seconds) {
    return seconds * 1_000_000;
}
function isTraceMetadataLine(line) {
    return (line.startsWith('TRACE START') ||
        line.startsWith('TRACE END') ||
        line.startsWith('Version:') ||
        line.startsWith('File format:'));
}
//# sourceMappingURL=parser.js.map