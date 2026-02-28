export interface UiStrings {
	title: string;
	searchPlaceholder: string;
	function: string;
	criticality: string;
	cpuSelf: string;
	memSelf: string;
	selfCost: string;
	inclusiveCost: string;
	calls: string;
	cpuAvg: string;
	memAvg: string;
	timeTotal: string;
	timeAvg: string;
	avgSelf: string;
	avgInclusive: string;
	pctSelf: string;
	cpuShare: string;
	memShare: string;
	shareDelta: string;
	hotPathScore: string;
	churnRisk: string;
	cpuPerKb: string;
	kbPerCpu: string;
	tipCriticality: string;
	tipCpuSelf: string;
	tipMemSelf: string;
	tipCalls: string;
	tipCpuAvg: string;
	tipMemAvg: string;
	tipTimeTotal: string;
	tipTimeAvg: string;
	tipPctSelf: string;
	tipCpuShare: string;
	tipMemShare: string;
	tipShareDelta: string;
	tipHotPathScore: string;
	tipChurnRisk: string;
	tipCpuPerKb: string;
	tipKbPerCpu: string;
	tipCallersSection: string;
	tipCalleesSection: string;
	selectFunction: string;
	openSource: string;
	hideDetails: string;
	showDetails: string;
	source: string;
	unknown: string;
	metrics: string;
	groupCpu: string;
	groupMemory: string;
	groupTime: string;
	groupOther: string;
	structure: string;
	callers: string;
	callees: string;
	fanIn: string;
	fanOut: string;
	amplification: string;
	delegation: string;
	depthMin: string;
	topCallee: string;
	callsObserved: string;
	callsEffective: string;
	unreachable: string;
	primary: string;
	functions: string;
	totalCalls: string;
	primarySelfTotal: string;
	events: string;
	cpu: string;
	memory: string;
	noFunctionSelected: string;
	noData: string;
	none: string;
	criticalityCritical: string;
	criticalityHigh: string;
	criticalityMedium: string;
	criticalityLow: string;
	helpFunctions: string;
	helpTotalCalls: string;
	helpPrimaryTotal: string;
	helpEvents: string;
	helpCpu: string;
	helpMemory: string;
	helpCpuSelf: string;
	helpMemSelf: string;
	helpSelfCost: string;
	helpInclusiveCost: string;
	helpCalls: string;
	helpCpuAvg: string;
	helpMemAvg: string;
	helpTimeTotal: string;
	helpTimeAvg: string;
	helpAvgSelf: string;
	helpAvgInclusive: string;
	helpPctSelf: string;
	helpCriticality: string;
	helpCpuShare: string;
	helpMemShare: string;
	helpFanIn: string;
	helpFanOut: string;
	helpAmplification: string;
	helpDelegation: string;
	helpDepthMin: string;
	helpTopCallee: string;
	helpCallsObserved: string;
	helpCallsEffective: string;
	helpShareDelta: string;
	helpHotPathScore: string;
	helpChurnRisk: string;
	helpCpuPerKb: string;
	helpKbPerCpu: string;
}

export function getUiStrings(language: string): UiStrings {
	const isPt = language.toLowerCase().startsWith('pt');
	if (isPt) {
		return {
			title: 'Visualizador de Perfil Xdebug',
			searchPlaceholder: 'Filtrar funcao por texto ou /regex/',
			function: 'Funcao',
			criticality: 'Criticidade',
			cpuSelf: 'CPU Self',
			memSelf: 'Mem Self',
			selfCost: 'Self (Primario)',
			inclusiveCost: 'Inclusive (Primario)',
			calls: 'Chamadas',
			cpuAvg: 'CPU Media',
			memAvg: 'Mem Media',
			timeTotal: 'Tempo Total',
			timeAvg: 'Tempo Medio',
			avgSelf: 'Media Self',
			avgInclusive: 'Media Inclusive',
			pctSelf: '% Self',
			cpuShare: 'CPU Share',
			memShare: 'Mem Share',
			shareDelta: 'Delta',
			hotPathScore: 'Potencial de Ganho',
			churnRisk: 'Risco de Mudanca',
			cpuPerKb: 'CPU por KB',
			kbPerCpu: 'KB por CPU',
			tipCriticality: 'Resumo: mostra prioridade geral da funcao no profile.\n\nExemplo: "Alta 30%" indica bom candidato para analise primeiro.',
			tipCpuSelf: 'Resumo: custo de CPU da propria funcao, sem filhos.\n\nExemplo: 80.000 significa trabalho pesado no corpo da funcao.',
			tipMemSelf: 'Resumo: custo de memoria da propria funcao, sem filhos.\n\nExemplo: 2 MB indica alocacao relevante na funcao.',
			tipCalls: 'Resumo: quantidade de chamadas observadas no arquivo.\n\nExemplo: 12.000 chamadas pode indicar gargalo por frequencia.',
			tipCpuAvg: 'Resumo: custo medio de CPU por chamada efetiva.\n\nExemplo: CPU Self 90.000 / 300 = 300 por chamada.',
			tipMemAvg: 'Resumo: custo medio de memoria por chamada efetiva.\n\nExemplo: Mem Self 600 KB / 200 = 3 KB por chamada.',
			tipTimeTotal: 'Resumo: tempo total da funcao no evento de tempo (inclusive).\n\nExemplo: inclui custo local e custo delegado.',
			tipTimeAvg: 'Resumo: tempo medio por chamada efetiva.\n\nFormula: Tempo Total / Calls Effective.',
			tipPctSelf: 'Resumo: fatia de self da funcao no total primario.\n\nExemplo: 7,5% significa 7,5% do custo self total do arquivo.',
			tipCpuShare: 'Resumo: fatia da funcao no total de CPU self.\n\nExemplo: 12% sugere bom potencial de ganho ao otimizar.',
			tipMemShare: 'Resumo: fatia da funcao no total de memoria self.\n\nExemplo: 18% indica bom alvo para reduzir alocacao.',
			tipShareDelta: 'Resumo: diferenca entre CPU Share e Mem Share.\n\nExemplo: +11% indica perfil mais CPU-bound.',
			tipHotPathScore: 'Resumo: potencial de ganho ao otimizar essa funcao (0-100).\n\nExemplo: 78% normalmente vale priorizar.',
			tipChurnRisk: 'Resumo: risco de impacto ao mudar essa funcao (0-100).\n\nExemplo: 85% pede testes mais fortes.',
			tipCpuPerKb: 'Resumo: quanto CPU aparece para cada KB de memoria.\n\nExemplo: 1200 CPU/KB sugere carga mais computacional.',
			tipKbPerCpu: 'Resumo: quanta memoria aparece para cada unidade de CPU.\n\nExemplo: 0,08 KB/CPU indica baixa pressao de memoria.',
			tipCallersSection: 'Resumo: quem chama a funcao selecionada.\n\nExemplo: um caller com 60% de share explica grande parte do custo de entrada.',
			tipCalleesSection: 'Resumo: para onde a funcao delega trabalho.\n\nExemplo: um callee com 70% concentra quase toda a delegacao.',
			selectFunction: 'Selecione uma funcao',
			openSource: 'Abrir codigo',
			hideDetails: 'Ocultar detalhes',
			showDetails: 'Mostrar detalhes',
			source: 'Origem',
			unknown: 'desconhecido',
			metrics: 'Metricas',
			groupCpu: 'CPU',
			groupMemory: 'Memoria',
			groupTime: 'Tempo',
			groupOther: 'Outras',
			structure: 'Estrutura',
			callers: 'Chamadores',
			callees: 'Chamadas',
			fanIn: 'Fan-in',
			fanOut: 'Fan-out',
			amplification: 'Amplificacao',
			delegation: 'Delegacao',
			depthMin: 'Profundidade',
			topCallee: 'Top Callee',
			callsObserved: 'Chamadas Observadas',
			callsEffective: 'Chamadas Efetivas',
			unreachable: 'nao conectado',
			primary: 'Primario',
			functions: 'Funcoes',
			totalCalls: 'Total de Chamadas',
			primarySelfTotal: 'Total Self Primario',
			events: 'Eventos',
			cpu: 'CPU',
			memory: 'Memoria',
			noFunctionSelected: 'Nenhuma funcao selecionada',
			noData: 'Sem dados',
			none: 'Nenhum',
			criticalityCritical: 'Critica',
			criticalityHigh: 'Alta',
			criticalityMedium: 'Media',
			criticalityLow: 'Baixa',
			helpFunctions: 'Resumo: total de funcoes/metodos unicos.\n\nExemplo: 320 funcoes indica profile amplo.',
			helpTotalCalls: 'Resumo: soma de chamadas observadas no grafo.\n\nExemplo: 1,2M chamadas sugere carga alta.',
			helpPrimaryTotal: 'Resumo: total self do evento primario.\n\nExemplo: e a base usada para percentuais.',
			helpEvents: 'Resumo: quantos eventos existem no arquivo.\n\nExemplo: Time + Memory = 2 eventos.',
			helpCpu: 'Resumo: evento tratado como CPU por nome.\n\nExemplo: time, cycles ou instructions.',
			helpMemory: 'Resumo: evento tratado como memoria por nome.\n\nExemplo: mem, bytes, heap.',
			helpCpuSelf: 'Resumo: CPU da propria funcao.\n\nExemplo: alto valor = codigo local pesado.',
			helpMemSelf: 'Resumo: memoria da propria funcao.\n\nExemplo: alto valor = alocacao local alta.',
			helpSelfCost: 'Resumo: self no evento primario atual.\n\nExemplo: usado em shares e medias.',
			helpInclusiveCost: 'Resumo: self + custo transitivo de filhos.\n\nExemplo: se muito maior que self, ha forte delegacao.',
			helpCalls: 'Resumo: quantidade de invocacoes da funcao.\n\nExemplo: muitas chamadas com custo baixo = hotspot de frequencia.',
			helpCpuAvg: 'Resumo: media de CPU por chamada efetiva.\n\nExemplo: ajuda a achar custo unitario alto.',
			helpMemAvg: 'Resumo: media de memoria por chamada efetiva.\n\nExemplo: ajuda a achar alocacao cara por invocacao.',
			helpTimeTotal: 'Resumo: tempo total da funcao no evento de tempo (inclusive).\n\nExemplo: representa custo total no fluxo.',
			helpTimeAvg: 'Resumo: tempo medio por chamada efetiva.\n\nExemplo: bom para comparar custo unitario.',
			helpAvgSelf: 'Resumo: self medio por chamada efetiva.\n\nExemplo: compara custo local entre funcoes.',
			helpAvgInclusive: 'Resumo: inclusive medio por chamada efetiva.\n\nExemplo: compara custo total por chamada.',
			helpPctSelf: 'Resumo: participacao self no total primario.\n\nExemplo: 7,5% = impacto relevante no arquivo atual.',
			helpCriticality: 'Resumo: prioridade combinada para triagem.\n\nExemplo: 30% geralmente vem antes de 3%.',
			helpCpuShare: 'Resumo: fatia da funcao no CPU self total.\n\nExemplo: 12% pode dar retorno perceptivel.',
			helpMemShare: 'Resumo: fatia da funcao na memoria self total.\n\nExemplo: 18% e bom alvo de memoria.',
			helpFanIn: 'Resumo: quantas funcoes dependem desta.\n\nExemplo: fan-in alto aumenta risco de impacto.',
			helpFanOut: 'Resumo: quantas funcoes esta chama.\n\nExemplo: fan-out alto indica orquestracao.',
			helpAmplification: 'Resumo: quanto custo total passa aqui vs custo local.\n\nExemplo: 6x significa forte propagacao via filhos.',
			helpDelegation: 'Resumo: parte do inclusive que foi delegada.\n\nExemplo: 80% indica funcao mais coordenadora.',
			helpDepthMin: 'Resumo: distancia minima de entrypoints no grafo.\n\nExemplo: depth 0 tende a ser entrada.',
			helpTopCallee: 'Resumo: filho que mais concentra custo delegado.\n\nExemplo: 65% mostra alto ponto de concentracao.',
			helpCallsObserved: 'Resumo: chamadas vindas diretamente do cachegrind.\n\nExemplo: valor bruto de calls=.',
			helpCallsEffective: 'Resumo: chamadas usadas nas medias (com fallback).\n\nExemplo: sem calls e com self>0, usa 1.',
			helpShareDelta: 'Resumo: diferenca entre CPU Share e Mem Share.\n\nExemplo: +11% indica viés de CPU.',
			helpHotPathScore: 'Resumo: potencial de ganho ao otimizar (0-100).\n\nExemplo: 78% costuma ser prioridade alta.',
			helpChurnRisk: 'Resumo: risco de mudanca e efeitos colaterais (0-100).\n\nExemplo: 85% pede rollout cuidadoso.',
			helpCpuPerKb: 'Resumo: CPU por KB de memoria self.\n\nExemplo: alto valor sugere carga computacional.',
			helpKbPerCpu: 'Resumo: KB de memoria self por CPU.\n\nExemplo: alto valor sugere pressao de memoria.'
		};
	}

	return {
		title: 'Xdebug Profile Viewer',
		searchPlaceholder: 'Filter function by text or /regex/',
		function: 'Function',
		criticality: 'Criticality',
		cpuSelf: 'CPU Self',
		memSelf: 'Mem Self',
		selfCost: 'Self (Primary)',
		inclusiveCost: 'Inclusive (Primary)',
		calls: 'Calls',
		cpuAvg: 'CPU Avg',
		memAvg: 'Mem Avg',
		timeTotal: 'Time Total',
		timeAvg: 'Time Avg',
		avgSelf: 'Avg Self',
		avgInclusive: 'Avg Inclusive',
		pctSelf: '% Self',
		cpuShare: 'CPU Share',
		memShare: 'Mem Share',
		shareDelta: 'Delta',
		hotPathScore: 'Gain Potential',
		churnRisk: 'Change Risk',
		cpuPerKb: 'CPU per KB',
		kbPerCpu: 'KB per CPU',
		tipCriticality: 'Summary: overall priority of the function in this profile.\n\nExample: "High 30%" is usually worth checking first.',
		tipCpuSelf: 'Summary: CPU cost done by this function itself.\n\nExample: 80,000 means heavy local work.',
		tipMemSelf: 'Summary: memory cost done by this function itself.\n\nExample: 2 MB means meaningful local allocation.',
		tipCalls: 'Summary: observed call count from the file.\n\nExample: 12,000 calls may indicate frequency pressure.',
		tipCpuAvg: 'Summary: average CPU per effective call.\n\nExample: 90,000 / 300 = 300 per call.',
		tipMemAvg: 'Summary: average memory per effective call.\n\nExample: 600 KB / 200 = 3 KB per call.',
		tipTimeTotal: 'Summary: total function time on the time event (inclusive).\n\nExample: includes local and delegated work.',
		tipTimeAvg: 'Summary: average time per effective call.\n\nFormula: Time Total / Calls Effective.',
		tipPctSelf: 'Summary: self share over primary total.\n\nExample: 7.5% means relevant contribution in this file.',
		tipCpuShare: 'Summary: function share over total CPU self.\n\nExample: 12% can be a good optimization target.',
		tipMemShare: 'Summary: function share over total memory self.\n\nExample: 18% can be a strong memory target.',
		tipShareDelta: 'Summary: difference between CPU and memory shares.\n\nExample: +11% means more CPU-oriented behavior.',
		tipHotPathScore: 'Summary: optimization payoff score (0-100).\n\nExample: 78% is usually high priority.',
		tipChurnRisk: 'Summary: change impact risk score (0-100).\n\nExample: 85% means stronger testing is needed.',
		tipCpuPerKb: 'Summary: CPU per KB of self memory.\n\nExample: high value suggests compute-heavy behavior.',
		tipKbPerCpu: 'Summary: self memory KB per CPU unit.\n\nExample: high value suggests memory-heavy behavior.',
		tipCallersSection: 'Summary: who calls this function.\n\nExample: one caller with 60% share explains most inbound cost.',
		tipCalleesSection: 'Summary: where this function delegates work.\n\nExample: one callee with 70% concentrates delegation.',
		selectFunction: 'Select a function',
		openSource: 'Open source',
		hideDetails: 'Hide details',
		showDetails: 'Show details',
		source: 'Source',
		unknown: 'unknown',
		metrics: 'Metrics',
		groupCpu: 'CPU',
		groupMemory: 'Memory',
		groupTime: 'Time',
		groupOther: 'Other',
		structure: 'Structure',
		callers: 'Callers',
		callees: 'Callees',
		fanIn: 'Fan-in',
		fanOut: 'Fan-out',
		amplification: 'Amplification',
		delegation: 'Delegation',
		depthMin: 'Depth',
		topCallee: 'Top Callee',
		callsObserved: 'Calls Observed',
		callsEffective: 'Calls Effective',
		unreachable: 'not connected',
		primary: 'Primary',
		functions: 'Functions',
		totalCalls: 'Total Calls',
		primarySelfTotal: 'Primary Self Total',
		events: 'Events',
		cpu: 'CPU',
		memory: 'Memory',
		noFunctionSelected: 'No function selected',
		noData: 'No data',
		none: 'None',
		criticalityCritical: 'Critical',
		criticalityHigh: 'High',
		criticalityMedium: 'Medium',
		criticalityLow: 'Low',
		helpFunctions: 'Summary: unique function/method count.\n\nExample: 320 means a broad profile.',
		helpTotalCalls: 'Summary: total observed calls in the graph.\n\nExample: 1.2M calls indicates heavy traffic.',
		helpPrimaryTotal: 'Summary: primary-event self total.\n\nExample: this is the base for global shares.',
		helpEvents: 'Summary: number of event streams.\n\nExample: Time + Memory = 2 events.',
		helpCpu: 'Summary: event treated as CPU by name.\n\nExample: time, cycles, instructions.',
		helpMemory: 'Summary: event treated as memory by name.\n\nExample: mem, bytes, heap.',
		helpCpuSelf: 'Summary: local CPU cost of the function.\n\nExample: high value means expensive body code.',
		helpMemSelf: 'Summary: local memory cost of the function.\n\nExample: high value means strong local allocation.',
		helpSelfCost: 'Summary: self cost in the active primary event.\n\nExample: used by shares and averages.',
		helpInclusiveCost: 'Summary: self + transitive child-path cost.\n\nExample: much higher than self means strong delegation.',
		helpCalls: 'Summary: number of invocations.\n\nExample: many cheap calls can still create pressure.',
		helpCpuAvg: 'Summary: average CPU per effective call.\n\nExample: useful to spot high unit cost.',
		helpMemAvg: 'Summary: average memory per effective call.\n\nExample: useful to spot costly allocations per call.',
		helpTimeTotal: 'Summary: total function time on time event (inclusive).\n\nExample: represents full flow cost.',
		helpTimeAvg: 'Summary: average function time per effective call.\n\nExample: useful to compare unit time cost.',
		helpAvgSelf: 'Summary: average self cost per effective call.\n\nExample: compare local work across functions.',
		helpAvgInclusive: 'Summary: average inclusive cost per effective call.\n\nExample: compare total chain cost per call.',
		helpPctSelf: 'Summary: self share over primary total.\n\nExample: 7.5% is usually significant in one file.',
		helpCriticality: 'Summary: combined triage priority.\n\nExample: 30% usually comes before 3%.',
		helpCpuShare: 'Summary: share over total CPU self.\n\nExample: 12% can yield visible runtime gains.',
		helpMemShare: 'Summary: share over total memory self.\n\nExample: 18% is a strong memory optimization target.',
		helpFanIn: 'Summary: how many functions depend on this one.\n\nExample: high fan-in raises change risk.',
		helpFanOut: 'Summary: how many functions this one calls.\n\nExample: high fan-out suggests coordinator behavior.',
		helpAmplification: 'Summary: total-throughput vs local-work ratio.\n\nExample: 6x means lots of downstream cost flow.',
		helpDelegation: 'Summary: part of inclusive cost delegated to children.\n\nExample: 80% means mostly coordination.',
		helpDepthMin: 'Summary: minimum distance from graph entrypoints.\n\nExample: depth 0 is usually entry-level.',
		helpTopCallee: 'Summary: child that concentrates delegated cost the most.\n\nExample: 65% means a strong concentration point.',
		helpCallsObserved: 'Summary: raw calls parsed from cachegrind.\n\nExample: direct value from `calls=` lines.',
		helpCallsEffective: 'Summary: calls used in averages with fallback.\n\nExample: if self>0 and no calls, uses 1.',
		helpShareDelta: 'Summary: CPU share minus memory share.\n\nExample: +11% means more CPU-oriented.',
		helpHotPathScore: 'Summary: optimization payoff score (0-100).\n\nExample: 78% is often high priority.',
		helpChurnRisk: 'Summary: change blast-radius risk score (0-100).\n\nExample: 85% suggests careful rollout.',
		helpCpuPerKb: 'Summary: CPU per KB of self memory.\n\nExample: high value suggests compute-heavy workload.',
		helpKbPerCpu: 'Summary: self-memory KB per CPU unit.\n\nExample: high value suggests memory-heavy workload.'
	};
}
