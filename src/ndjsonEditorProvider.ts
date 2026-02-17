import * as vscode from 'vscode';
import { NdjsonDocument } from './ndjsonDocument';
import { analyzeColumns } from './columnAnalyzer';
import { ColumnDef, NdjsonRecord, WebviewToExtMessage } from './types';

const CHUNK_SIZE = 500;

export class NdjsonEditorProvider
  implements vscode.CustomEditorProvider<NdjsonDocument>
{
  public static readonly viewType = 'ndjsonExcelViewer.editor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<NdjsonDocument>
  >();
  public readonly onDidChangeCustomDocument =
    this._onDidChangeCustomDocument.event;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<NdjsonDocument> {
    const document = await NdjsonDocument.create(uri);

    // Forward document change events to VSCode
    document.onDidChange((e) => {
      this._onDidChangeCustomDocument.fire({
        document,
        ...e,
      });
    });

    return document;
  }

  async resolveCustomEditor(
    document: NdjsonDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this._context.extensionUri, 'media'),
      ],
    };

    webviewPanel.webview.html = this._getHtmlForWebview(
      webviewPanel.webview
    );

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(
      (message: WebviewToExtMessage) => {
        switch (message.type) {
          case 'ready':
            this._sendInitData(webviewPanel.webview, document);
            break;
          case 'cell-edit':
            document.applyEdit(message.edit);
            break;
          case 'request-chunk':
            this._sendChunk(
              webviewPanel.webview,
              document,
              message.startIndex,
              message.count
            );
            break;
        }
      }
    );

    // Resend data when content changes (undo/redo)
    document.onDidChangeContent(() => {
      this._sendInitData(webviewPanel.webview, document);
    });

    // Theme change listener
    vscode.window.onDidChangeActiveColorTheme((theme) => {
      webviewPanel.webview.postMessage({
        type: 'theme-changed',
        theme: theme.kind === vscode.ColorThemeKind.Dark
          ? 'dark'
          : theme.kind === vscode.ColorThemeKind.HighContrast
            ? 'high-contrast'
            : 'light',
      });
    });
  }

  async saveCustomDocument(
    document: NdjsonDocument,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    await document.save(cancellation);
  }

  async saveCustomDocumentAs(
    document: NdjsonDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    await document.saveAs(destination);
  }

  async revertCustomDocument(
    document: NdjsonDocument,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    await document.revert();
  }

  async backupCustomDocument(
    document: NdjsonDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation);
  }

  private _sendInitData(
    webview: vscode.Webview,
    document: NdjsonDocument
  ): void {
    const records = document.records;
    const columns = analyzeColumns(records);

    // Send init message with columns and total rows
    webview.postMessage({
      type: 'init',
      columns,
      totalRows: records.length,
    });

    // Send first chunk
    this._sendChunk(webview, document, 0, CHUNK_SIZE);
  }

  private _sendChunk(
    webview: vscode.Webview,
    document: NdjsonDocument,
    startIndex: number,
    count: number
  ): void {
    const records = document.records;
    const chunk = records.slice(startIndex, startIndex + count);
    webview.postMessage({
      type: 'data-chunk',
      startIndex,
      rows: chunk,
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview.js')
    );
    const agGridCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview.css')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'media', 'styles.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} data:;">
  <link href="${agGridCssUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
  <title>NDJSON Excel Viewer</title>
</head>
<body>
  <div id="toolbar">
    <div id="search-container">
      <input type="text" id="search-input" placeholder="Search..." />
      <span id="search-count"></span>
      <button id="search-prev" title="Previous">&#9650;</button>
      <button id="search-next" title="Next">&#9660;</button>
    </div>
    <div id="info-bar">
      <button id="inline-expand-all" title="Expand all subtables inline">Inline All</button>
      <button id="flat-expand-all" title="Expand all subtables flat">Flat All</button>
      <span id="row-count"></span>
      <span id="col-count"></span>
    </div>
  </div>
  <div id="grid-container"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
