# NDJSON Excel Viewer

A VS Code extension that lets you view and edit NDJSON / JSONL files in a spreadsheet-like grid powered by [AG Grid](https://www.ag-grid.com/).

## Features

- **Spreadsheet UI** -- Open `.ndjson` or `.jsonl` files and browse them as a sortable, filterable, resizable grid.
- **Inline editing** -- Click a cell to edit values. Changes are saved back to the original file with full Undo / Redo support.
- **Subtable expansion** -- Nested arrays of objects (sub-tables) can be viewed in four modes:
  | Mode | Description |
  |------|-------------|
  | **Modal** | Pop-up overlay with its own grid |
  | **Docked** | Bottom panel attached to the main view |
  | **Inline** | Embedded grid row inserted below the parent row |
  | **Flat** | Sub-records expanded directly into the main grid as regular rows |
- **Bulk expand** -- _Inline All_ / _Flat All_ buttons in the toolbar to expand every subtable at once.
- **Search** -- Quick-filter search with match navigation (Enter / Shift+Enter).
- **Theme aware** -- Follows your VS Code light / dark theme automatically.
- **Chunked loading** -- Large files are loaded in 500-row chunks with virtual scrolling, so the UI stays responsive.

## Supported file types

| Extension | MIME |
|-----------|------|
| `.ndjson` | `application/x-ndjson` |
| `.jsonl`  | `application/jsonl` |

## Getting started

1. Install the extension from the VS Code Marketplace.
2. Open any `.ndjson` or `.jsonl` file -- the grid editor opens automatically.
3. Click the `>` button in a subtable cell to expand it. Use the mode-cycle buttons to switch between Modal, Docked, Inline, and Flat views.
4. Edit cells directly. Press `Ctrl+S` / `Cmd+S` to save.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+F` / `Cmd+F` | Focus search input |
| `Enter` | Next search match |
| `Shift+Enter` | Previous search match |
| `Escape` | Clear search / close modal |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |

## Requirements

- VS Code 1.85.0 or later

## License

[MIT](LICENSE)
