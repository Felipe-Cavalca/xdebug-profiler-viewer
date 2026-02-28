"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskEngine = void 0;
class RiskEngine {
    graphCacheByProfile = new WeakMap();
    computeBreakageRisk(profile, fn) {
        const graphCache = this.getGraphCache(profile);
        const fanIn = fn.callers.length;
        const fanOut = fn.callees.length;
        const inboundCost = Number(graphCache.inboundCostById.get(fn.id) ?? 0);
        const churnRisk = computeChurnRisk(fanIn, fanOut, profile.maxFanIn, profile.maxDegree, inboundCost, graphCache.maxInboundCost);
        const callsObserved = Number(fn.callsObserved || 0);
        const callsEffective = Number(fn.callsEffective || callsObserved || 0);
        const cpuEvent = pickCpuEvent(profile.events);
        const memEvent = pickMemoryEvent(profile.events);
        const timeEvent = pickTimeEvent(profile.events, profile.primaryEvent);
        const cpuAvgPerCall = callsEffective > 0 && cpuEvent
            ? getEventSelf(fn, cpuEvent) / callsEffective
            : undefined;
        const memAvgPerCall = callsEffective > 0 && memEvent
            ? getEventSelf(fn, memEvent) / callsEffective
            : undefined;
        const timeAvgPerCall = callsEffective > 0 && timeEvent
            ? getEventInclusive(fn, timeEvent) / callsEffective
            : undefined;
        return {
            status: 'known',
            percent: churnRisk,
            details: `fanIn=${fanIn}, fanOut=${fanOut}, inbound=${Math.round(inboundCost)}`,
            metrics: {
                fanIn,
                fanOut,
                inboundCost,
                callsObserved,
                callsEffective,
                cpuAvgPerCall,
                memAvgPerCall,
                timeAvgPerCall,
                cpuEvent,
                memEvent,
                timeEvent
            }
        };
    }
    getGraphCache(profile) {
        const existing = this.graphCacheByProfile.get(profile);
        if (existing) {
            return existing;
        }
        const inboundCostById = new Map();
        let maxInboundCost = 0;
        for (const fn of profile.functions) {
            let inbound = 0;
            for (const callerEdge of fn.callers) {
                inbound += getEdgeInclusive(callerEdge, profile.primaryEvent);
            }
            inboundCostById.set(fn.id, inbound);
            maxInboundCost = Math.max(maxInboundCost, inbound);
        }
        const cache = { maxInboundCost, inboundCostById };
        this.graphCacheByProfile.set(profile, cache);
        return cache;
    }
}
exports.RiskEngine = RiskEngine;
function getEdgeInclusive(edge, eventName) {
    const eventCost = edge.eventCosts[eventName];
    if (eventCost && Number.isFinite(Number(eventCost.inclusive))) {
        return Number(eventCost.inclusive);
    }
    return Number(edge.inclusive || 0);
}
function getEventSelf(fn, eventName) {
    const eventCost = fn.eventCosts[eventName];
    if (eventCost && Number.isFinite(Number(eventCost.self))) {
        return Number(eventCost.self);
    }
    return Number(fn.self || 0);
}
function getEventInclusive(fn, eventName) {
    const eventCost = fn.eventCosts[eventName];
    if (eventCost && Number.isFinite(Number(eventCost.inclusive))) {
        return Number(eventCost.inclusive);
    }
    return Number(fn.inclusive || 0);
}
function computeChurnRisk(fanIn, fanOut, maxFanIn, maxDegree, inboundCost, maxInboundCost) {
    const fanInNorm = maxFanIn > 0 ? fanIn / maxFanIn : 0;
    const degreeNorm = maxDegree > 0 ? (fanIn + fanOut) / maxDegree : 0;
    const inboundNorm = maxInboundCost > 0 ? inboundCost / maxInboundCost : degreeNorm;
    const score = 100 * ((0.45 * fanInNorm) + (0.25 * degreeNorm) + (0.3 * inboundNorm));
    return clampPct(score);
}
function clampPct(value) {
    return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}
function pickCpuEvent(events) {
    return events.find((eventName) => /cpu|time|wall|duration|ns|us|ms|sec/i.test(eventName) && !/mem|byte/i.test(eventName));
}
function pickMemoryEvent(events) {
    return events.find((eventName) => /mem|byte/i.test(eventName));
}
function pickTimeEvent(events, primaryEvent) {
    if (/time|ns|us|ms|sec|wall|duration/i.test(primaryEvent) && !/mem|byte/i.test(primaryEvent)) {
        return primaryEvent;
    }
    return pickCpuEvent(events);
}
//# sourceMappingURL=riskEngine.js.map