# NDJSON Excel Viewer - アーキテクチャドキュメント

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
ndjson-excel-viewer/
├── .vscode/
│   ├── launch.json
│   └── tasks.json
├── docs/
│   ├── architecture.md
│   └── todo/
├── src/
│   ├── extension.ts
│   ├── ndjsonEditorProvider.ts
│   ├── ndjsonDocument.ts
│   ├── ndjsonParser.ts
│   ├── ndjsonSerializer.ts
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
│   │   ├── ndjsonParser.test.ts
│   │   ├── ndjsonSerializer.test.ts
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
[.ndjsonファイル]
      │
      ▼ 読み込み
[Extension Host]
  ndjsonParser.ts     ── vscode.workspace.fs.readFile → JSON.parse
  ndjsonDocument.ts   ── レコード配列保持、変更追跡、Undo/Redo
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
  ndjsonDocument.ts   ── Editスタック記録、dirty通知
      │
      │ Ctrl+S
      ▼
  ndjsonSerializer.ts ── NDJSON文字列化 → ファイル保存
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

- NdjsonDocument が変更履歴スタック（edits[]）を管理
- セル編集時にEditオブジェクトを作成しスタックに追加
- VSCodeのworkspace.applyEdit / Undo/Redo APIと連携
- 保存時はndjsonSerializer.tsで全レコードをNDJSON文字列に変換
