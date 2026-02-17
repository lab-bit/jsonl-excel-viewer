import * as vscode from 'vscode';
import { NdjsonRecord, CellEdit } from './types';
import { parseNdjson } from './ndjsonParser';
import { serializeNdjson } from './ndjsonSerializer';

export class NdjsonDocument implements vscode.CustomDocument {
  private _records: NdjsonRecord[] = [];
  private _editStack: CellEdit[] = [];
  private _savedEditIndex = 0;
  private _currentEditIndex = 0;

  private readonly _onDidChange = new vscode.EventEmitter<{
    readonly label: string;
    undo(): void;
    redo(): void;
  }>();
  public readonly onDidChange = this._onDidChange.event;

  private readonly _onDidChangeContent = new vscode.EventEmitter<void>();
  public readonly onDidChangeContent = this._onDidChangeContent.event;

  static async create(uri: vscode.Uri): Promise<NdjsonDocument> {
    const doc = new NdjsonDocument(uri);
    await doc._load();
    return doc;
  }

  private constructor(public readonly uri: vscode.Uri) {}

  private async _load(): Promise<void> {
    const data = await vscode.workspace.fs.readFile(this.uri);
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(data);
    const result = parseNdjson(text);
    this._records = result.records;

    if (result.errors.length > 0) {
      const errorLines = result.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n');
      vscode.window.showWarningMessage(
        `NDJSON parse warnings: ${result.errors.length} line(s) skipped. Check Output for details.`
      );
      const channel = vscode.window.createOutputChannel('NDJSON Excel Viewer');
      channel.appendLine(`Parse errors in ${this.uri.fsPath}:`);
      channel.appendLine(errorLines);
    }
  }

  get records(): NdjsonRecord[] {
    return this._records;
  }

  get isDirty(): boolean {
    return this._currentEditIndex !== this._savedEditIndex;
  }

  applyEdit(edit: CellEdit): void {
    // Truncate any undone edits
    this._editStack.length = this._currentEditIndex;

    // Apply the edit to records
    if (edit.rowIndex >= 0 && edit.rowIndex < this._records.length) {
      this._records[edit.rowIndex][edit.field] = edit.newValue;
    }

    this._editStack.push(edit);
    this._currentEditIndex++;

    // Fire change event with undo/redo
    this._onDidChange.fire({
      label: `Edit ${edit.field}`,
      undo: () => {
        this._currentEditIndex--;
        const e = this._editStack[this._currentEditIndex];
        if (e.rowIndex >= 0 && e.rowIndex < this._records.length) {
          this._records[e.rowIndex][e.field] = e.oldValue;
        }
        this._onDidChangeContent.fire();
      },
      redo: () => {
        const e = this._editStack[this._currentEditIndex];
        if (e.rowIndex >= 0 && e.rowIndex < this._records.length) {
          this._records[e.rowIndex][e.field] = e.newValue;
        }
        this._currentEditIndex++;
        this._onDidChangeContent.fire();
      },
    });

    this._onDidChangeContent.fire();
  }

  async save(cancellation?: vscode.CancellationToken): Promise<void> {
    const text = serializeNdjson(this._records);
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(this.uri, encoder.encode(text));
    this._savedEditIndex = this._currentEditIndex;
  }

  async saveAs(targetUri: vscode.Uri): Promise<void> {
    const text = serializeNdjson(this._records);
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(targetUri, encoder.encode(text));
    this._savedEditIndex = this._currentEditIndex;
  }

  async revert(): Promise<void> {
    await this._load();
    this._editStack = [];
    this._currentEditIndex = 0;
    this._savedEditIndex = 0;
    this._onDidChangeContent.fire();
  }

  async backup(
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    await this.saveAs(destination);
    return {
      id: destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(destination);
        } catch {
          // ignore
        }
      },
    };
  }

  dispose(): void {
    this._onDidChange.dispose();
    this._onDidChangeContent.dispose();
  }
}
