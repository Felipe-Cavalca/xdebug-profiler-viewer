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
			searchPlaceholder: 'Filtrar função por texto ou /regex/',
			function: 'Função',
			criticality: 'Criticidade',
			cpuSelf: 'CPU Self',
			memSelf: 'Mem Self',
			selfCost: 'Custo Próprio (Primário)',
			inclusiveCost: 'Custo Inclusivo (Primário)',
			calls: 'Chamadas',
			cpuAvg: 'CPU Média',
			memAvg: 'Mem Média',
			timeTotal: 'Tempo Total',
			timeAvg: 'Tempo Médio',
			avgSelf: 'Média Própria',
			avgInclusive: 'Média Inclusiva',
			pctSelf: '% Próprio',
			cpuShare: 'Participação CPU',
			memShare: 'Participação Mem',
			shareDelta: 'Delta',
			hotPathScore: 'Potencial de Ganho',
			churnRisk: 'Risco de Mudança',
			cpuPerKb: 'CPU por KB',
			kbPerCpu: 'KB por CPU',
			tipCriticality: 'Prioridade geral da função dentro do profile.\n\nComo interpretar: quanto maior, mais cedo ela deve entrar na investigação.',
			tipCpuSelf: 'Custo de CPU executado pela própria função, sem incluir filhos.\n\nComo interpretar: valor alto indica trabalho pesado no corpo da função.',
			tipMemSelf: 'Custo de memória executado pela própria função, sem incluir filhos.\n\nComo interpretar: valor alto indica alocação relevante local.',
			tipCalls: 'Quantidade de chamadas observadas no arquivo.\n\nComo interpretar: muitas chamadas podem gerar gargalo por frequência, mesmo com custo unitário baixo.',
			tipCpuAvg: 'Custo médio de CPU por chamada efetiva.\n\nFórmula: CPU Self / Chamadas Efetivas.',
			tipMemAvg: 'Custo médio de memória por chamada efetiva.\n\nFórmula: Mem Self / Chamadas Efetivas.',
			tipTimeTotal: 'Tempo total da função no evento de tempo (inclusive).\n\nComo interpretar: soma custo local e custo delegado para funções filhas.',
			tipTimeAvg: 'Tempo médio por chamada efetiva.\n\nFórmula: Tempo Total / Chamadas Efetivas.',
			tipPctSelf: 'Participação do custo próprio da função no total primário.\n\nComo interpretar: mostra o peso dessa função no arquivo atual.',
			tipCpuShare: 'Participação da função no total de CPU self.\n\nComo interpretar: valor alto costuma indicar maior potencial de ganho em CPU.',
			tipMemShare: 'Participação da função no total de memória self.\n\nComo interpretar: valor alto costuma indicar bom alvo para reduzir alocação.',
			tipShareDelta: 'Diferença entre participação de CPU e de memória.\n\nComo interpretar: positivo tende a CPU-bound; negativo tende a memory-bound.',
			tipHotPathScore: 'Estimativa de retorno da otimização (0-100).\n\nComo interpretar: pontuações altas normalmente viram prioridade.',
			tipChurnRisk: 'Risco de impacto ao alterar a função (0-100).\n\nComo interpretar: pontuações altas pedem testes e rollout mais cuidadosos.',
			tipCpuPerKb: 'Razão entre CPU e memória própria.\n\nComo interpretar: valor alto indica carga mais computacional por KB.',
			tipKbPerCpu: 'Razão entre memória própria e CPU.\n\nComo interpretar: valor alto indica maior pressão de memória para a carga de CPU.',
			tipCallersSection: 'Quem chama a função selecionada.\n\nComo interpretar: poucos chamadores com alto peso apontam a principal origem do custo de entrada.',
			tipCalleesSection: 'Para onde a função delega trabalho.\n\nComo interpretar: um callee dominante concentra boa parte do custo delegado.',
			selectFunction: 'Selecione uma função',
			openSource: 'Abrir código',
			hideDetails: 'Ocultar detalhes',
			showDetails: 'Mostrar detalhes',
			source: 'Origem',
			unknown: 'desconhecido',
			metrics: 'Métricas',
			groupCpu: 'CPU',
			groupMemory: 'Memória',
			groupTime: 'Tempo',
			groupOther: 'Outras',
			structure: 'Estrutura',
			callers: 'Chamadores',
			callees: 'Chamadas Filhas',
			fanIn: 'Fan-in',
			fanOut: 'Fan-out',
			amplification: 'Amplificação',
			delegation: 'Delegação',
			depthMin: 'Profundidade',
			topCallee: 'Top Callee',
			callsObserved: 'Chamadas Observadas',
			callsEffective: 'Chamadas Efetivas',
			unreachable: 'não conectado',
			primary: 'Primário',
			functions: 'Funções',
			totalCalls: 'Total de Chamadas',
			primarySelfTotal: 'Total Próprio Primário',
			events: 'Eventos',
			cpu: 'CPU',
			memory: 'Memória',
			noFunctionSelected: 'Nenhuma função selecionada',
			noData: 'Sem dados',
			none: 'Nenhum',
			criticalityCritical: 'Crítica',
			criticalityHigh: 'Alta',
			criticalityMedium: 'Média',
			criticalityLow: 'Baixa',
			helpFunctions: 'Total de funções/métodos únicos.\n\nNúmeros altos indicam profile amplo e mais caminhos para investigar.',
			helpTotalCalls: 'Soma de chamadas observadas no grafo.\n\nVolume alto pode indicar pressão por frequência.',
			helpPrimaryTotal: 'Total de custo próprio no evento primário.\n\nEsta é a base usada nos percentuais globais.',
			helpEvents: 'Quantos eventos existem no arquivo.\n\nExemplo: Time + Memory = 2 eventos.',
			helpCpu: 'Evento tratado como CPU por nome.\n\nExemplo: time, cycles ou instructions.',
			helpMemory: 'Evento tratado como memória por nome.\n\nExemplo: mem, bytes, heap.',
			helpCpuSelf: 'CPU da própria função.\n\nAlto valor indica código local pesado.',
			helpMemSelf: 'Memória da própria função.\n\Alto valor indica alocação local alta.',
			helpSelfCost: 'Custo próprio no evento primário atual.\n\nComo interpretar: usado em shares e médias por chamada.',
			helpInclusiveCost: 'Custo próprio + custo transitivo de filhos.\n\nComo interpretar: se muito maior que o próprio, há forte delegação.',
			helpCalls: 'Quantidade de invocações da função.\n\nComo interpretar: muitas chamadas baratas ainda podem virar hotspot de frequência.',
			helpCpuAvg: 'Média de CPU por chamada efetiva.\n\nComo interpretar: ajuda a identificar custo unitário alto.',
			helpMemAvg: 'Média de memória por chamada efetiva.\n\nComo interpretar: ajuda a identificar alocação cara por invocação.',
			helpTimeTotal: 'Tempo total da função no evento de tempo (inclusive).\n\nComo interpretar: representa o custo completo do fluxo.',
			helpTimeAvg: 'Tempo médio por chamada efetiva.\n\nComo interpretar: útil para comparar custo unitário.',
			helpAvgSelf: 'Custo próprio médio por chamada efetiva.\n\nComo interpretar: compara trabalho local entre funções.',
			helpAvgInclusive: 'Custo inclusivo médio por chamada efetiva.\n\nComo interpretar: compara custo total por chamada.',
			helpPctSelf: 'Participação do custo próprio no total primário.\n\nComo interpretar: percentual alto indica maior impacto no arquivo atual.',
			helpCriticality: 'Prioridade combinada para triagem.\n\nComo interpretar: valores maiores entram primeiro na análise.',
			helpCpuShare: 'Participação da função no CPU self total.\n\nComo interpretar: valor alto pode trazer retorno perceptível em CPU.',
			helpMemShare: 'Participação da função na memória self total.\n\nComo interpretar: valor alto costuma ser bom alvo de memória.',
			helpFanIn: 'Quantas funções dependem desta.\n\nComo interpretar: fan-in alto aumenta risco de impacto.',
			helpFanOut: 'Quantas funções esta chama.\n\nComo interpretar: fan-out alto sugere orquestração.',
			helpAmplification: 'Quanto custo total passa aqui versus custo local.\n\nComo interpretar: 6x indica forte propagação via filhos.',
			helpDelegation: 'Parte do inclusivo que foi delegada.\n\nComo interpretar: percentual alto indica função mais coordenadora.',
			helpDepthMin: 'Distância mínima de entrypoints no grafo.\n\nComo interpretar: depth 0 tende a ser entrada.',
			helpTopCallee: 'Filho que mais concentra custo delegado.\n\nComo interpretar: aponta o principal candidato a investigar a jusante.',
			helpCallsObserved: 'Resumo: chamadas vindas diretamente do cachegrind.\n\nExemplo: valor bruto de calls=.',
			helpCallsEffective: 'Resumo: chamadas usadas nas médias (com fallback).\n\nComo interpretar: sem calls e com self>0, usa 1 para evitar divisão por zero.',
			helpShareDelta: 'Resumo: diferença entre CPU Share e Mem Share.\n\nComo interpretar: positivo = viés de CPU; negativo = viés de memória.',
			helpHotPathScore: 'Resumo: potencial de ganho ao otimizar (0-100).\n\nExemplo: 78% costuma ser prioridade alta.',
			helpChurnRisk: 'Resumo: risco de mudança e efeitos colaterais (0-100).\n\nComo interpretar: pontuações altas pedem rollout cuidadoso.',
			helpCpuPerKb: 'Resumo: CPU por KB de memória self.\n\nComo interpretar: alto valor sugere carga computacional.',
			helpKbPerCpu: 'Resumo: KB de memória self por CPU.\n\nComo interpretar: alto valor sugere pressão de memória.'
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
