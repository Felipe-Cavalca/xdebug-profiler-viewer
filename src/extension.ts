import * as vscode from 'vscode';
import { XdebugProfileReadonlyEditorProvider } from './view/customEditor';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(XdebugProfileReadonlyEditorProvider.register(context));
}

export function deactivate() {}
