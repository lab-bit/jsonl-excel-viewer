import * as vscode from 'vscode';
import { NdjsonEditorProvider } from './ndjsonEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      NdjsonEditorProvider.viewType,
      new NdjsonEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );
}

export function deactivate() {}
