export function iconGraph(): string {
	return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 12.5V2h1v9.5h11v1H2z" fill="currentColor"/><path d="M4.5 10 7 7.5l2 2L13 5.5l.7.7L9 10.9l-2-2L5.2 10.7 4.5 10z" fill="currentColor"/></svg>`;
}

export function iconSearch(): string {
	return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="4.5" stroke="currentColor"/><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-linecap="round"/></svg>`;
}

export function iconFunction(): string {
	return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 3.5h12v1H2v-1Zm0 4h7v1H2v-1Zm0 4h12v1H2v-1Z" fill="currentColor"/></svg>`;
}

export function iconOpen(): string {
	return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2h4v4h-1V3.7l-5.1 5.1-.7-.7L12.3 3H10V2Z" fill="currentColor"/><path d="M3 4h4v1H4v7h7v-3h1v4H3V4Z" fill="currentColor"/></svg>`;
}

export function headerWithInfo(label: string, tip: string): string {
	const safeLabel = escapeHtmlAttr(label);
	const safeTip = escapeHtmlAttr(tip);
	return `<span class="info-wrap"><span>${safeLabel}</span><span class="info-dot" data-tip="${safeTip}">i</span></span>`;
}

export function sortableHeader(label: string, tip?: string): string {
	const content = tip ? headerWithInfo(label, tip) : `<span>${escapeHtmlAttr(label)}</span>`;
	return `<span class="th-wrap">${content}<span class="sort-ind">↕</span></span>`;
}

export function escapeHtmlAttr(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
