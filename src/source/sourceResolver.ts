import * as path from 'node:path';
import * as vscode from 'vscode';

export class SourceResolver {
	public async resolveSourceUri(filePath: string, from: vscode.Uri): Promise<vscode.Uri | undefined> {
		const candidates = new Set<string>();
		const mappings = this.getPathMappings();

		for (const mapped of this.applyPathMappings(filePath, mappings)) {
			candidates.add(mapped);
		}

		if (path.isAbsolute(filePath)) {
			candidates.add(path.normalize(filePath));
		} else {
			candidates.add(path.resolve(path.dirname(from.fsPath), filePath));
			for (const folder of vscode.workspace.workspaceFolders ?? []) {
				candidates.add(path.resolve(folder.uri.fsPath, filePath));
			}
		}

		const direct = await this.findFirstExistingFile(candidates);
		if (direct) {
			return direct;
		}

		return this.findBySuffix(filePath);
	}

	private getPathMappings(): Record<string, string> {
		const cfg = vscode.workspace.getConfiguration('xdebugProfileViewer');
		const mappings = cfg.get<Record<string, string>>('pathMappings', {});
		return mappings ?? {};
	}

	private applyPathMappings(filePath: string, mappings: Record<string, string>): string[] {
		const out: string[] = [];
		const sourceNorm = normalizeSlashes(filePath);
		const entries = Object.entries(mappings).sort((a, b) => b[0].length - a[0].length);
		for (const [fromPrefixRaw, toPrefixRaw] of entries) {
			const fromPrefix = trimTrailingSlash(normalizeSlashes(fromPrefixRaw));
			const toPrefix = trimTrailingSlash(toPrefixRaw);
			if (!fromPrefix || !toPrefix) {
				continue;
			}
			if (!sourceNorm.startsWith(fromPrefix)) {
				continue;
			}
			const rest = sourceNorm.slice(fromPrefix.length).replace(/^\/+/, '');
			out.push(path.normalize(path.join(toPrefix, rest)));
		}
		return out;
	}

	private async findFirstExistingFile(candidates: Iterable<string>): Promise<vscode.Uri | undefined> {
		for (const candidate of candidates) {
			const uri = vscode.Uri.file(candidate);
			try {
				await vscode.workspace.fs.stat(uri);
				return uri;
			} catch {
				// Keep searching other candidates.
			}
		}
		return undefined;
	}

	private async findBySuffix(filePath: string): Promise<vscode.Uri | undefined> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (folders.length === 0) {
			return undefined;
		}

		const parts = normalizeSlashes(filePath).split('/').filter(Boolean);
		if (parts.length === 0) {
			return undefined;
		}

		const maxParts = Math.min(parts.length, 6);
		for (let partCount = maxParts; partCount >= 1; partCount -= 1) {
			const suffix = parts.slice(parts.length - partCount).join('/');
			for (const folder of folders) {
				const pattern = new vscode.RelativePattern(folder, `**/${suffix}`);
				const matches = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 2);
				if (matches.length > 0) {
					return matches[0];
				}
			}
		}

		return undefined;
	}
}

export function normalizeSlashes(value: string): string {
	return value.replace(/\\/g, '/');
}

function trimTrailingSlash(value: string): string {
	return value.replace(/[\\/]+$/, '');
}
