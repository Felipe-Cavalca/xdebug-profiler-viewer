import * as path from 'node:path';
import * as vscode from 'vscode';
import { BreakageRiskResult, RiskEngine } from './riskEngine';
import { ProfilerIndex } from './profilerIndex';

export interface FunctionDescriptor {
	name: string;
	line: number;
}

export interface FunctionRiskDisplay {
	status: 'known' | 'unknown';
	title: string;
	subtitle?: string;
	tooltip: string;
	profileUri?: vscode.Uri;
}

export class RiskService {
	private readonly riskEngine = new RiskEngine();

	constructor(private readonly profilerIndex: ProfilerIndex) {}

	public getBreakageRiskDisplay(
		document: vscode.TextDocument,
		fn: FunctionDescriptor
	): FunctionRiskDisplay {
		const match = this.profilerIndex.getLatestProfileForFunction(fn.name, document.uri, fn.line + 1);
		if (!match) {
			return {
				status: 'unknown',
				title: 'Risco de quebra: N/A • sem dados',
				tooltip: 'Função não encontrada em nenhum profiler indexado.'
			};
		}

		const result = this.riskEngine.computeBreakageRisk(match.profile, match.functionData);
		return formatDisplay(result, match.profileUri, match.profileMtime);
	}
}

function formatDisplay(result: BreakageRiskResult, profileUri: vscode.Uri, profileMtime: number): FunctionRiskDisplay {
	if (result.status !== 'known' || result.percent === undefined) {
		return {
			status: 'unknown',
			title: '$(question) Risco de quebra: sem dados',
			tooltip: result.details ?? 'Sem dados suficientes para calcular.'
		};
	}

	const metrics = result.metrics;
	const calls = metrics ? Math.max(metrics.callsObserved, metrics.callsEffective) : 0;
	const callsLabel = calls === 1 ? '1 chamada' : `${calls} chamadas`;
	const title = `$(shield) | ${getRiskLabel(result.percent)}: ${Math.round(result.percent)}%`;
	const parts: string[] = [`$(pulse) ${callsLabel}`];
	if (metrics?.timeAvgPerCall !== undefined) {
		parts.push(`$(clock) ${formatMetric(metrics.timeAvgPerCall, metrics.timeEvent)}/ch`);
	}
	if (metrics?.cpuAvgPerCall !== undefined && metrics?.timeAvgPerCall === undefined) {
		parts.push(`$(dashboard) ${formatMetric(metrics.cpuAvgPerCall, metrics.cpuEvent)}/ch`);
	}
	if (metrics?.memAvgPerCall !== undefined) {
		parts.push(`$(database) ${formatMetric(metrics.memAvgPerCall, metrics.memEvent)}/ch`);
	}
	const subtitle = parts.join(' | ');
	const lines: string[] = [
		`Risco de quebra: ${result.percent.toFixed(1)}%`,
		`Nivel: ${getRiskLabel(result.percent)}`,
		`Chamadas: observadas=${metrics?.callsObserved ?? 0}, efetivas=${metrics?.callsEffective ?? 0}`,
		`Acoplamento: fan-in=${metrics?.fanIn ?? 0}, fan-out=${metrics?.fanOut ?? 0}, inbound=${formatInt(metrics?.inboundCost ?? 0)}`
	];

	if (metrics?.cpuAvgPerCall !== undefined) {
		lines.push(`CPU media por chamada: ${formatMetric(metrics.cpuAvgPerCall, metrics.cpuEvent)} (${metrics.cpuEvent})`);
	}
	if (metrics?.memAvgPerCall !== undefined) {
		lines.push(`Memoria media por chamada: ${formatMetric(metrics.memAvgPerCall, metrics.memEvent)} (${metrics.memEvent})`);
	}
	if (metrics?.timeAvgPerCall !== undefined) {
		lines.push(`Tempo medio por chamada: ${formatMetric(metrics.timeAvgPerCall, metrics.timeEvent)} (${metrics.timeEvent})`);
	}

	lines.push(`Profiler usado: ${path.basename(profileUri.fsPath)}`);
	lines.push(`Ultima aparicao da funcao: ${new Date(profileMtime).toLocaleString('pt-BR')}`);

	return {
		status: 'known',
		title,
		subtitle,
		tooltip: lines.join('\n'),
		profileUri
	};
}

function formatMetric(value: number, eventName: string | undefined): string {
	if (!eventName) {
		return formatInt(value);
	}
	if (/mem|byte/i.test(eventName)) {
		return formatBytes(value);
	}
	if (/time|ns|us|ms|sec|wall|duration/i.test(eventName)) {
		return formatTime(value, eventName);
	}
	return formatInt(value);
}

function formatTime(value: number, eventName: string): string {
	const scaleNs = getTimeScaleNs(eventName);
	if (!scaleNs) {
		return `${formatInt(value)} ticks`;
	}
	const totalNs = value * scaleNs;
	const abs = Math.abs(totalNs);
	if (abs >= 1e9) {
		return `${(totalNs / 1e9).toFixed(2)} s`;
	}
	if (abs >= 1e6) {
		return `${(totalNs / 1e6).toFixed(2)} ms`;
	}
	if (abs >= 1e3) {
		return `${(totalNs / 1e3).toFixed(2)} us`;
	}
	return `${totalNs.toFixed(0)} ns`;
}

function getTimeScaleNs(eventName: string): number | undefined {
	const text = String(eventName || '').toLowerCase();
	const inline = text.match(/(\d+(?:[.,]\d+)?)\s*(ns|us|ms|s|nsec|usec|msec|sec)\b/i);
	if (inline) {
		const amount = Number(inline[1].replace(',', '.'));
		return amount * unitToNs(inline[2].toLowerCase());
	}
	if (/\bns\b/i.test(text)) {
		return 1;
	}
	if (/\bus\b/i.test(text)) {
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

function formatBytes(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1024 * 1024 * 1024) {
		return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}
	if (abs >= 1024 * 1024) {
		return `${(value / (1024 * 1024)).toFixed(2)} MB`;
	}
	if (abs >= 1024) {
		return `${(value / 1024).toFixed(2)} KB`;
	}
	return `${formatInt(value)} B`;
}

function formatInt(value: number): string {
	return new Intl.NumberFormat('pt-BR').format(Math.round(value));
}

function getRiskLabel(percent: number): string {
	if (percent >= 75) {
		return 'Risco muito alto';
	}
	if (percent >= 50) {
		return 'Risco alto';
	}
	if (percent >= 25) {
		return 'Risco moderado';
	}
	return 'Risco baixo';
}
