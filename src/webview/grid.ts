import {
  createGrid,
  type GridApi,
  type GridOptions,
  type ColDef,
  type CellValueChangedEvent,
  ModuleRegistry,
  ClientSideRowModelModule,
  CsvExportModule,
  CommunityFeaturesModule,
} from 'ag-grid-community';
import type { ColumnDef, JsonlRecord, CellEdit } from '../types';
import { createSubtableCellRenderer } from './subtableRenderer';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  CsvExportModule,
  CommunityFeaturesModule,
]);

function flattenArrayToSearchText(value: unknown): string {
  if (!Array.isArray(value)) return value != null ? String(value) : '';
  return value
    .map((item) => {
      if (item != null && typeof item === 'object') {
        return Object.values(item as Record<string, unknown>)
          .map((v) => (v != null ? String(v) : ''))
          .join(' ');
      }
      return item != null ? String(item) : '';
    })
    .join(' ');
}

// --- Detail row types & state ---

interface DetailRowData {
  __isDetailRow: true;
  __detailKey: string;
  __subtableField: string;
  __subtableData: Record<string, unknown>[];
  __parentOriginalIndex: number;
}

interface FlatDetailRowData {
  __isFlatDetailRow: true;
  __flatDetailKey: string;
  __parentOriginalIndex: number;
  __subtableField: string;
  __subIndex: number;
  [key: string]: unknown;
}

let gridApi: GridApi | null = null;
let allRowData: JsonlRecord[] = [];
let rowIndexMap = new Map<JsonlRecord, number>();

/** All column field ids in order (set at init). Used for visibility and getVisibleColumnFields. */
let allColumnFields: string[] = [];
/** Field ids that are currently hidden. Empty = all visible. */
let hiddenFieldIds = new Set<string>();

let expandedDetails = new Map<string, { parentOriginalIndex: number; field: string; data: Record<string, unknown>[] }>();
let expandedFlats = new Map<string, { parentOriginalIndex: number; field: string; data: Record<string, unknown>[] }>();
let detailGridApis = new Map<string, GridApi>();
let subtableFields: string[] = [];

// Callback for switching from inline detail to modal/docked
let onDetailModeSwitch: ((targetMode: string, rowIndex: number, field: string, data: Record<string, unknown>[]) => void) | null = null;

export function setDetailSwitchHandler(
  handler: (targetMode: string, rowIndex: number, field: string, data: Record<string, unknown>[]) => void
): void {
  onDetailModeSwitch = handler;
}

export function getGridApi(): GridApi | null {
  return gridApi;
}

// --- Detail row renderer (full-width) ---

class DetailRenderer {
  private eGui!: HTMLElement;
  private subGridApi: GridApi | null = null;
  private detailKey: string = '';

  init(params: { data: DetailRowData }) {
    const data = params.data;
    this.detailKey = data.__detailKey;

    this.eGui = document.createElement('div');
    this.eGui.className = 'subtable-inline-detail';

    // Header
    const header = document.createElement('div');
    header.className = 'subtable-inline-header';

    const title = document.createElement('strong');
    title.textContent = data.__subtableField;
    title.style.fontSize = '12px';

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '4px';
    controls.style.alignItems = 'center';

    // Auto-size button
    const autoSizeBtn = document.createElement('button');
    autoSizeBtn.className = 'subtable-expand-btn';
    autoSizeBtn.textContent = '\u2194'; // ↔
    autoSizeBtn.title = '\u5217\u5E45\u3092\u81EA\u52D5\u8ABF\u6574'; // 列幅を自動調整
    autoSizeBtn.addEventListener('click', () => {
      this.subGridApi?.autoSizeAllColumns();
    });

    // Switch to flat mode button
    const switchBtn = document.createElement('button');
    switchBtn.className = 'subtable-expand-btn';
    switchBtn.textContent = '\u2B06'; // ⬆
    switchBtn.title = '\u30D5\u30E9\u30C3\u30C8\u30E2\u30FC\u30C9\u306B\u5207\u66FF'; // フラットモードに切替
    switchBtn.addEventListener('click', () => {
      if (onDetailModeSwitch) {
        onDetailModeSwitch('flat', data.__parentOriginalIndex, data.__subtableField, data.__subtableData);
      }
    });

    // Collapse button
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'subtable-expand-btn';
    collapseBtn.textContent = '\u25BC'; // ▼
    collapseBtn.title = '\u6298\u308A\u305F\u305F\u3080'; // 折りたたむ
    collapseBtn.addEventListener('click', () => {
      toggleInlineDetail(data.__parentOriginalIndex, data.__subtableField, data.__subtableData);
    });

    controls.appendChild(autoSizeBtn);
    controls.appendChild(switchBtn);
    controls.appendChild(collapseBtn);

    header.appendChild(title);
    header.appendChild(controls);
    this.eGui.appendChild(header);

    // Sub-grid
    const gridDiv = document.createElement('div');
    gridDiv.className = 'subtable-inline-grid';

    const container = document.getElementById('grid-container');
    if (container?.classList.contains('ag-theme-alpine-dark')) {
      gridDiv.classList.add('ag-theme-alpine-dark');
    } else {
      gridDiv.classList.add('ag-theme-alpine');
    }
    this.eGui.appendChild(gridDiv);

    // Derive columns
    const allKeys = new Set<string>();
    for (const row of data.__subtableData) {
      for (const k of Object.keys(row)) {
        allKeys.add(k);
      }
    }

    const colDefs: ColDef[] = [...allKeys].map((k) => ({
      field: k,
      headerName: k,
      resizable: true,
      sortable: true,
      minWidth: 60,
    }));

    const gridOptions: GridOptions = {
      columnDefs: colDefs,
      rowData: [...data.__subtableData],
      domLayout: 'normal',
      headerHeight: 28,
      rowHeight: 24,
      defaultColDef: {
        flex: 1,
        minWidth: 60,
      },
      autoSizeStrategy: {
        type: 'fitCellContents',
      },
    };

    this.subGridApi = createGrid(gridDiv, gridOptions);
    detailGridApis.set(this.detailKey, this.subGridApi);
  }

  getGui() {
    return this.eGui;
  }

  destroy() {
    if (this.subGridApi) {
      detailGridApis.delete(this.detailKey);
      this.subGridApi.destroy();
      this.subGridApi = null;
    }
  }
}

// --- Inline detail management ---

function refreshDisplayData(): void {
  if (!gridApi) return;
  const display: unknown[] = [];
  for (let i = 0; i < allRowData.length; i++) {
    // Annotate __originalIndex for rowIndex bug fix
    (allRowData[i] as Record<string, unknown>).__originalIndex = i;
    display.push(allRowData[i]);

    // Insert inline detail rows
    for (const [, detail] of expandedDetails) {
      if (detail.parentOriginalIndex === i) {
        display.push({
          __isDetailRow: true,
          __detailKey: `${i}:${detail.field}`,
          __subtableField: detail.field,
          __subtableData: detail.data,
          __parentOriginalIndex: i,
        } as DetailRowData);
      }
    }

    // Insert flat detail rows
    for (const [, flat] of expandedFlats) {
      if (flat.parentOriginalIndex === i) {
        for (let si = 0; si < flat.data.length; si++) {
          const subRecord = flat.data[si];
          // Build summary text for the subtable column: "key1: val1, key2: val2"
          const summary = Object.entries(subRecord)
            .map(([k, v]) => `${k}: ${v != null ? String(v) : ''}`)
            .join(', ');
          const flatRow: FlatDetailRowData = {
            __isFlatDetailRow: true,
            __flatDetailKey: `${i}:${flat.field}:${si}`,
            __parentOriginalIndex: i,
            __subtableField: flat.field,
            __subIndex: si,
            // Spread sub-record values into the main grid columns
            ...subRecord,
            // Override the subtable field column with summary text
            [flat.field]: summary,
          };
          display.push(flatRow);
        }
      }
    }
  }
  gridApi.setGridOption('rowData', display);
}

export function toggleInlineDetail(
  parentOriginalIndex: number,
  field: string,
  data: Record<string, unknown>[]
): void {
  const key = `${parentOriginalIndex}:${field}`;
  if (expandedDetails.has(key)) {
    expandedDetails.delete(key);
    const api = detailGridApis.get(key);
    if (api) {
      api.destroy();
      detailGridApis.delete(key);
    }
  } else {
    // Mutual exclusion: close flat expansion for the same cell
    if (expandedFlats.has(key)) {
      expandedFlats.delete(key);
    }
    expandedDetails.set(key, { parentOriginalIndex, field, data });
  }
  refreshDisplayData();
}

export function toggleFlatDetail(
  parentOriginalIndex: number,
  field: string,
  data: Record<string, unknown>[]
): void {
  const key = `${parentOriginalIndex}:${field}`;
  if (expandedFlats.has(key)) {
    expandedFlats.delete(key);
  } else {
    // Mutual exclusion: close inline detail for the same cell
    if (expandedDetails.has(key)) {
      expandedDetails.delete(key);
      const api = detailGridApis.get(key);
      if (api) {
        api.destroy();
        detailGridApis.delete(key);
      }
    }
    expandedFlats.set(key, { parentOriginalIndex, field, data });
  }
  refreshDisplayData();
}

export function getSubtableData(
  parentOriginalIndex: number,
  field: string
): Record<string, unknown>[] | null {
  // Try to get data from original row
  const row = allRowData[parentOriginalIndex];
  if (!row) return null;
  const value = (row as Record<string, unknown>)[field];
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  return null;
}

// --- Grid init ---

export function initGrid(
  container: HTMLElement,
  columns: ColumnDef[],
  onCellEdit: (edit: CellEdit) => void,
  initialHiddenFields?: string[]
): GridApi {
  subtableFields = columns.filter((c) => c.isSubtable).map((c) => c.field);
  allColumnFields = columns.map((c) => c.field);
  hiddenFieldIds = new Set(initialHiddenFields ?? []);

  const colDefs: ColDef[] = columns.map((col) => {
    const isHidden = hiddenFieldIds.has(col.field);
    const def: ColDef = {
      field: col.field,
      headerName: col.headerName,
      sortable: true,
      resizable: true,
      filter: true,
      minWidth: 60,
      width: col.width,
      hide: isHidden,
    };

    if (col.isSubtable) {
      def.editable = false;
      def.autoHeight = true;
      def.cellRenderer = (params: { value: unknown; data: Record<string, unknown>; node: { rowIndex: number | null }; colDef: { field?: string } }) =>
        createSubtableCellRenderer(params);
      def.getQuickFilterText = (params: { value: unknown; data: Record<string, unknown> }) => {
        if (params.data?.__isFlatDetailRow || params.data?.__isDetailRow) return '';
        return flattenArrayToSearchText(params.value);
      };
    } else if (col.type === 'object') {
      def.editable = false;
      def.valueFormatter = (params: { value: unknown }) =>
        params.value != null ? JSON.stringify(params.value) : '';
      def.getQuickFilterText = (params: { value: unknown; data: Record<string, unknown> }) => {
        if (params.data?.__isFlatDetailRow || params.data?.__isDetailRow) return '';
        return params.value != null ? JSON.stringify(params.value) : '';
      };
    } else {
      def.editable = (params: { data: Record<string, unknown> }) => {
        if (params.data?.__isFlatDetailRow || params.data?.__isDetailRow) return false;
        return true;
      };
      def.getQuickFilterText = (params: { value: unknown; data: Record<string, unknown> }) => {
        if (params.data?.__isFlatDetailRow || params.data?.__isDetailRow) return '';
        return params.value != null ? String(params.value) : '';
      };
      if (col.type === 'number') {
        def.filter = 'agNumberColumnFilter';
        def.valueParser = (params: { newValue: string }) => {
          const val = Number(params.newValue);
          return isNaN(val) ? params.newValue : val;
        };
      }
    }

    return def;
  });

  const gridOptions: GridOptions = {
    columnDefs: colDefs,
    rowData: [],
    defaultColDef: {
      sortable: true,
      resizable: true,
      filter: true,
      minWidth: 60,
    },
    rowSelection: { mode: 'multiRow' },
    enableCellTextSelection: true,
    suppressRowClickSelection: true,
    animateRows: false,
    autoSizeStrategy: {
      type: 'fitCellContents',
    },
    isFullWidthRow: (params) => {
      return params.rowNode.data?.__isDetailRow === true;
    },
    fullWidthCellRenderer: DetailRenderer,
    getRowHeight: (params) => {
      if (params.data?.__isDetailRow) {
        const itemCount = (params.data as DetailRowData).__subtableData?.length ?? 0;
        // Header (32) + rows (24 each) + padding (16), min 120, max 300
        return Math.min(Math.max(32 + itemCount * 24 + 16, 120), 300);
      }
      return undefined;
    },
    onCellValueChanged: (event: CellValueChangedEvent) => {
      if (event.data?.__isDetailRow || event.data?.__isFlatDetailRow) return;
      const rowIndex = rowIndexMap.get(event.data);
      if (rowIndex !== undefined && event.colDef.field) {
        const edit: CellEdit = {
          rowIndex,
          field: event.colDef.field,
          oldValue: event.oldValue,
          newValue: event.newValue,
        };
        onCellEdit(edit);
      }
    },
    getRowId: (params) => {
      if (params.data?.__isDetailRow) {
        return `detail-${(params.data as DetailRowData).__detailKey}`;
      }
      if (params.data?.__isFlatDetailRow) {
        return `flat-${(params.data as FlatDetailRowData).__flatDetailKey}`;
      }
      const idx = rowIndexMap.get(params.data);
      return idx !== undefined ? String(idx) : String(params.data.__rowIndex ?? 0);
    },
    rowClassRules: {
      'flat-detail-row': (params: { data: Record<string, unknown> }) =>
        params.data?.__isFlatDetailRow === true,
    },
  };

  gridApi = createGrid(container, gridOptions);
  return gridApi;
}

export function setRowData(records: JsonlRecord[], startIndex: number): void {
  if (!gridApi) return;

  // Merge chunk into allRowData
  for (let i = 0; i < records.length; i++) {
    const globalIndex = startIndex + i;
    allRowData[globalIndex] = records[i];
    rowIndexMap.set(records[i], globalIndex);
  }

  refreshDisplayData();

  // Auto-size columns after first chunk to fit actual data
  if (startIndex === 0) {
    gridApi.autoSizeAllColumns();
  }
}

export function resetData(): void {
  // Clean up inline detail grids
  for (const [, api] of detailGridApis) {
    api.destroy();
  }
  detailGridApis.clear();
  expandedDetails.clear();
  expandedFlats.clear();

  allRowData = [];
  rowIndexMap = new Map();
}

export function updateInfoBar(totalRows: number, totalCols: number, visibleCols?: number): void {
  const rowCountEl = document.getElementById('row-count');
  const colCountEl = document.getElementById('col-count');
  if (rowCountEl) rowCountEl.textContent = `Rows: ${totalRows}`;
  if (colCountEl) {
    if (visibleCols !== undefined && visibleCols < totalCols) {
      colCountEl.textContent = `Cols: ${visibleCols} / ${totalCols}`;
    } else {
      colCountEl.textContent = `Cols: ${totalCols}`;
    }
  }
}

// --- Column visibility ---

export function setColumnVisibility(field: string, visible: boolean): void {
  if (!gridApi) return;
  if (visible) {
    hiddenFieldIds.delete(field);
    gridApi.setColumnsVisible([field], true);
  } else {
    hiddenFieldIds.add(field);
    gridApi.setColumnsVisible([field], false);
  }
}

export function setAllColumnsVisible(): void {
  if (!gridApi || allColumnFields.length === 0) return;
  hiddenFieldIds.clear();
  gridApi.setColumnsVisible(allColumnFields, true);
}

/** Hide all columns (user can then check only the ones they want to see). */
export function setAllColumnsHidden(): void {
  if (!gridApi || allColumnFields.length === 0) return;
  for (const f of allColumnFields) {
    hiddenFieldIds.add(f);
  }
  gridApi.setColumnsVisible(allColumnFields, false);
}

export function resetColumnVisibility(): void {
  setAllColumnsVisible();
}

export function getVisibleColumnFields(): string[] {
  return allColumnFields.filter((f) => !hiddenFieldIds.has(f));
}

export function getAllColumnFields(): string[] {
  return [...allColumnFields];
}

export function isColumnVisible(field: string): boolean {
  return !hiddenFieldIds.has(field);
}

/** Toggle all subtable columns inline-expanded for every row. Returns new state (true=expanded). */
export function toggleInlineExpandAll(): boolean {
  if (subtableFields.length === 0) return false;

  // If any inline expansion exists, collapse all
  if (expandedDetails.size > 0) {
    for (const [, api] of detailGridApis) {
      api.destroy();
    }
    detailGridApis.clear();
    expandedDetails.clear();
    refreshDisplayData();
    return false;
  }

  // Expand all subtable cells for every row
  // Also close any flat details since they conflict
  expandedFlats.clear();

  for (let i = 0; i < allRowData.length; i++) {
    const row = allRowData[i] as Record<string, unknown>;
    for (const field of subtableFields) {
      const value = row[field];
      if (Array.isArray(value) && value.length > 0) {
        const key = `${i}:${field}`;
        expandedDetails.set(key, {
          parentOriginalIndex: i,
          field,
          data: value as Record<string, unknown>[],
        });
      }
    }
  }

  refreshDisplayData();
  return true;
}

/** Toggle all subtable columns flat-expanded for every row. Returns new state (true=expanded). */
export function toggleFlatExpandAll(): boolean {
  if (subtableFields.length === 0) return false;

  // If any flat expansion exists, collapse all
  if (expandedFlats.size > 0) {
    expandedFlats.clear();
    refreshDisplayData();
    // Restore column widths
    gridApi?.autoSizeAllColumns();
    return false;
  }

  // Expand all subtable cells for every row
  // Also close any inline details since they conflict
  for (const [key] of expandedDetails) {
    const api = detailGridApis.get(key);
    if (api) api.destroy();
  }
  expandedDetails.clear();
  detailGridApis.clear();

  for (let i = 0; i < allRowData.length; i++) {
    const row = allRowData[i] as Record<string, unknown>;
    for (const field of subtableFields) {
      const value = row[field];
      if (Array.isArray(value) && value.length > 0) {
        const key = `${i}:${field}`;
        expandedFlats.set(key, {
          parentOriginalIndex: i,
          field,
          data: value as Record<string, unknown>[],
        });
      }
    }
  }

  refreshDisplayData();
  // Widen subtable columns for readability
  widenSubtableColumns();
  return true;
}

function widenSubtableColumns(): void {
  if (!gridApi) return;
  const widths = subtableFields.map((field) => ({ key: field, newWidth: 360 }));
  gridApi.setColumnWidths(widths);
}
