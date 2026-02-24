/** A single record (one line of JSONL) */
export type JsonlRecord = Record<string, unknown>;

/** Parse result */
export interface ParseResult {
  records: JsonlRecord[];
  errors: ParseError[];
}

/** Parse error for a specific line */
export interface ParseError {
  line: number;
  raw: string;
  message: string;
}

/** Column type */
export type ColumnType = 'string' | 'number' | 'boolean' | 'date' | 'subtable' | 'object' | 'unknown';

/** Column definition for AG Grid */
export interface ColumnDef {
  field: string;
  headerName: string;
  type: ColumnType;
  isSubtable: boolean;
  width?: number;
}

/** Cell edit operation */
export interface CellEdit {
  rowIndex: number;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Messages from Extension Host to Webview */
export type ExtToWebviewMessage =
  | { type: 'init'; columns: ColumnDef[]; totalRows: number }
  | { type: 'data-chunk'; startIndex: number; rows: JsonlRecord[] }
  | { type: 'apply-edit'; edit: CellEdit }
  | { type: 'theme-changed'; theme: string };

/** Messages from Webview to Extension Host */
export type WebviewToExtMessage =
  | { type: 'ready' }
  | { type: 'cell-edit'; edit: CellEdit }
  | { type: 'request-chunk'; startIndex: number; count: number };
