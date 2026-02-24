import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

import type { ExtToWebviewMessage, WebviewToExtMessage, CellEdit, ColumnDef } from '../types';
import { initGrid, setRowData, resetData, updateInfoBar, getGridApi, toggleInlineDetail, toggleFlatDetail, getSubtableData, toggleInlineExpandAll, toggleFlatExpandAll, setDetailSwitchHandler, getVisibleColumnFields, setColumnVisibility, setAllColumnsVisible, setAllColumnsHidden, resetColumnVisibility, isColumnVisible } from './grid';
import { applyTheme, observeThemeChanges } from './theme';
import { SearchController } from './search';
import { setSubtableEditHandler, closeSubtablePanel, setInlineToggleHandler, setFlatToggleHandler, setFlatModeSwitchHandler, switchAndOpen } from './subtableRenderer';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToExtMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
const gridContainer = document.getElementById('grid-container')!;

let searchController: SearchController;
let totalRows = 0;
let columns: ColumnDef[] = [];
let initialized = false;
const CHUNK_SIZE = 500;

// Apply theme
applyTheme(gridContainer);
observeThemeChanges(gridContainer);

// Initialize search
searchController = new SearchController();

// Wire inline expand-all button
const inlineExpandAllBtn = document.getElementById('inline-expand-all');
if (inlineExpandAllBtn) {
  inlineExpandAllBtn.addEventListener('click', () => {
    const expanded = toggleInlineExpandAll();
    inlineExpandAllBtn.textContent = expanded ? 'Collapse All' : 'Inline All';
    inlineExpandAllBtn.title = expanded ? 'Collapse all inline expansions' : 'Expand all subtables inline';
    // Reset flat button state if it was active
    const flatBtn = document.getElementById('flat-expand-all');
    if (flatBtn) {
      flatBtn.textContent = 'Flat All';
      flatBtn.title = 'Expand all subtables flat';
    }
  });
}

// Wire flat expand-all button
const flatExpandAllBtn = document.getElementById('flat-expand-all');
if (flatExpandAllBtn) {
  flatExpandAllBtn.addEventListener('click', () => {
    const expanded = toggleFlatExpandAll();
    flatExpandAllBtn.textContent = expanded ? 'Collapse All' : 'Flat All';
    flatExpandAllBtn.title = expanded ? 'Collapse all flat expansions' : 'Expand all subtables flat';
    // Reset inline button state if it was active
    const inlineBtn = document.getElementById('inline-expand-all');
    if (inlineBtn) {
      inlineBtn.textContent = 'Inline All';
      inlineBtn.title = 'Expand all subtables inline';
    }
  });
}

// Wire inline detail toggle: subtableRenderer → grid
setInlineToggleHandler(toggleInlineDetail);

// Wire flat detail toggle: subtableRenderer → grid
setFlatToggleHandler(toggleFlatDetail);

// Wire flat mode switch: flat row → modal
setFlatModeSwitchHandler((parentIndex, field, targetMode) => {
  toggleFlatDetail(parentIndex, field, []); // close flat
  const data = getSubtableData(parentIndex, field);
  if (data) switchAndOpen(targetMode as 'modal' | 'docked', parentIndex, field, data);
});

// Wire mode switch from inline detail row back to modal/docked/flat
setDetailSwitchHandler((targetMode, rowIndex, field, data) => {
  toggleInlineDetail(rowIndex, field, data); // collapse inline
  if (targetMode === 'flat') {
    toggleFlatDetail(rowIndex, field, data); // open flat
  } else {
    switchAndOpen(targetMode as 'modal' | 'docked', rowIndex, field, data);
  }
});

// Set up subtable edit handler
setSubtableEditHandler((rowIndex, field, subIndex, subField, oldValue, newValue) => {
  vscode.postMessage({
    type: 'cell-edit',
    edit: {
      rowIndex,
      field: `${field}[${subIndex}].${subField}`,
      oldValue,
      newValue,
    },
  });
});

// --- Column picker ---

function refreshInfoBar(): void {
  updateInfoBar(totalRows, columns.length, getVisibleColumnFields().length);
}

function buildColumnPickerContent(): void {
  const dropdown = document.getElementById('column-picker-dropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'column-picker-list';
  for (const col of columns) {
    const label = document.createElement('label');
    label.className = 'column-picker-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isColumnVisible(col.field);
    cb.dataset.field = col.field;
    cb.addEventListener('change', () => {
      setColumnVisibility(col.field, cb.checked);
      refreshInfoBar();
    });
    label.appendChild(cb);
    const span = document.createElement('span');
    span.textContent = col.headerName || col.field;
    span.className = 'column-picker-label';
    label.appendChild(span);
    list.appendChild(label);
  }
  dropdown.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'column-picker-actions';
  const clearSelectionBtn = document.createElement('button');
  clearSelectionBtn.type = 'button';
  clearSelectionBtn.textContent = 'Clear selection';
  clearSelectionBtn.className = 'column-picker-action-btn';
  clearSelectionBtn.title = 'Uncheck all columns so you can select only the ones to show';
  clearSelectionBtn.addEventListener('click', () => {
    setAllColumnsHidden();
    refreshInfoBar();
    buildColumnPickerContent();
  });
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset';
  resetBtn.className = 'column-picker-action-btn';
  resetBtn.title = 'Show all columns again';
  resetBtn.addEventListener('click', () => {
    resetColumnVisibility();
    refreshInfoBar();
    buildColumnPickerContent();
  });
  actions.appendChild(clearSelectionBtn);
  actions.appendChild(resetBtn);
  dropdown.appendChild(actions);
}

function closeColumnPicker(): void {
  const dropdown = document.getElementById('column-picker-dropdown');
  if (dropdown) {
    dropdown.classList.remove('column-picker-open');
    dropdown.setAttribute('aria-hidden', 'true');
  }
}

function toggleColumnPicker(): void {
  const dropdown = document.getElementById('column-picker-dropdown');
  const btn = document.getElementById('column-picker-btn');
  if (!dropdown || !btn) return;
  const isOpen = dropdown.classList.contains('column-picker-open');
  if (isOpen) {
    closeColumnPicker();
    return;
  }
  if (columns.length > 0) {
    buildColumnPickerContent();
  }
  dropdown.classList.add('column-picker-open');
  dropdown.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    const onOutside = (e: MouseEvent) => {
      const wrap = document.getElementById('column-picker-wrap');
      if (wrap && !wrap.contains(e.target as Node)) {
        closeColumnPicker();
        document.removeEventListener('click', onOutside);
      }
    };
    document.addEventListener('click', onOutside);
  }, 0);
}

const columnPickerBtn = document.getElementById('column-picker-btn');
if (columnPickerBtn) {
  columnPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleColumnPicker();
  });
}

// Handle messages from Extension Host
window.addEventListener('message', (event) => {
  const message = event.data as ExtToWebviewMessage;

  switch (message.type) {
    case 'init': {
      columns = message.columns;
      totalRows = message.totalRows;

      if (!initialized) {
        resetData();
        const api = initGrid(gridContainer, columns, (edit: CellEdit) => {
          vscode.postMessage({ type: 'cell-edit', edit });
        }, []);
        searchController.setGridApi(api);
        initialized = true;
      } else {
        // Re-init on content change (undo/redo)
        resetData();
        closeSubtablePanel();
      }
      updateInfoBar(totalRows, columns.length, getVisibleColumnFields().length);
      break;
    }

    case 'data-chunk': {
      setRowData(message.rows, message.startIndex);

      // Request next chunk if more data is available
      const nextStart = message.startIndex + message.rows.length;
      if (nextStart < totalRows) {
        vscode.postMessage({
          type: 'request-chunk',
          startIndex: nextStart,
          count: CHUNK_SIZE,
        });
      }
      break;
    }

    case 'apply-edit': {
      const api = getGridApi();
      if (api) {
        const edit = message.edit;
        const rowNode = api.getRowNode(String(edit.rowIndex));
        if (rowNode) {
          rowNode.setDataValue(edit.field, edit.newValue);
        }
      }
      break;
    }

    case 'theme-changed': {
      applyTheme(gridContainer);
      break;
    }
  }
});

// Signal ready
vscode.postMessage({ type: 'ready' });
