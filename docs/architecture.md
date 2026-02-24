# JSONL Excel Viewer - アーキテクチャドキュメント

## 技術選定と理由

| 項目 | 選定 | 理由 |
|------|------|------|
| 言語 | TypeScript | VSCode拡張の標準 |
| エディタAPI | CustomEditorProvider | 編集・保存対応（Undo/Redo含む） |
| テーブルライブラリ | AG Grid Community Edition | MITライセンス、仮想スクロール標準装備、セル編集機能あり |
| ビルド | esbuild | 高速、VSCode公式推奨 |
| Webview | Vanilla TS（フレームワークなし） | 依存最小化 |

## プロジェクト構造

```
jsonl-excel-viewer/
├── .vscode/
│   ├── launch.json
│   └── tasks.json
├── docs/
│   ├── architecture.md
│   └── todo/
├── src/
│   ├── extension.ts
│   ├── jsonlEditorProvider.ts
│   ├── jsonlDocument.ts
│   ├── jsonlParser.ts
│   ├── jsonlSerializer.ts
│   ├── columnAnalyzer.ts
│   ├── types.ts
│   └── webview/
│       ├── main.ts
│       ├── grid.ts
│       ├── search.ts
│       ├── subtableRenderer.ts
│       └── theme.ts
├── media/
│   └── styles.css
├── scripts/
│   └── esbuild.mjs
├── data/
├── test/
│   ├── suite/
│   │   ├── jsonlParser.test.ts
│   │   ├── jsonlSerializer.test.ts
│   │   └── columnAnalyzer.test.ts
│   └── fixtures/
├── package.json
├── tsconfig.json
├── tsconfig.webview.json
├── .vscodeignore
└── .gitignore
```

## データフロー図

```
[.jsonl / .ndjson ファイル]
      │
      ▼ 読み込み
[Extension Host]
  jsonlParser.ts      ── vscode.workspace.fs.readFile → JSON.parse
  jsonlDocument.ts    ── レコード配列保持、変更追跡、Undo/Redo
  columnAnalyzer.ts   ── カラム定義生成
      │
      │ postMessage (500行チャンク)
      ▼
[Webview]
  AG Grid             ── 仮想スクロール表示 + セル編集
      │
      │ cell-edit イベント
      ▼
[Extension Host]
  jsonlDocument.ts    ── Editスタック記録、dirty通知
      │
      │ Ctrl+S
      ▼
  jsonlSerializer.ts  ── JSONL文字列化 → ファイル保存
```

## メッセージングプロトコル

Extension Host と Webview 間の通信:

### Extension → Webview

- `init`: 初期データ送信（カラム定義 + 最初のチャンク）
- `data-chunk`: 追加データチャンク
- `apply-edit`: Undo/Redoによる変更適用
- `theme-changed`: テーマ変更通知

### Webview → Extension

- `ready`: Webview準備完了
- `cell-edit`: セル値変更通知 { rowIndex, field, oldValue, newValue }
- `request-chunk`: 追加データリクエスト

## 編集・保存・Undo/Redoの設計

- JsonlDocument が変更履歴スタック（edits[]）を管理
- セル編集時にEditオブジェクトを作成しスタックに追加
- VSCodeのworkspace.applyEdit / Undo/Redo APIと連携
- 保存時はjsonlSerializer.tsで全レコードをJSONL文字列に変換

## 公開情報

| 項目 | 値 |
|------|-----|
| VS Code Marketplace | publisher: `lab-bit` / extension: `jsonl-excel-viewer` |
| GitHub | https://github.com/lab-bit/jsonl-excel-viewer |
| 初回公開 | 2025-02-17 (v0.1.0) |
| 公開方法 | `npx vsce package` → https://marketplace.visualstudio.com/manage からvsixを手動アップロード |
| PAT (vsce login) | 未解決（スコープエラーで使えず）。手動アップロードで回避中 |

### バージョンアップ手順

1. `package.json` の `version` を更新
2. `CHANGELOG.md` に変更内容を追記
3. `npm run compile && npx vsce package`
4. https://marketplace.visualstudio.com/manage → 該当拡張 → **Update** → 新しいvsixをアップロード
