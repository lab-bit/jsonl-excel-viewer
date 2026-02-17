import type { GridApi } from 'ag-grid-community';

export class SearchController {
  private _api: GridApi | null = null;
  private _searchText = '';
  private _matchCount = 0;
  private _currentMatchIndex = -1;
  private _matches: Array<{ rowIndex: number; colId: string }> = [];

  private readonly _input: HTMLInputElement;
  private readonly _countSpan: HTMLElement;
  private readonly _prevBtn: HTMLButtonElement;
  private readonly _nextBtn: HTMLButtonElement;

  constructor() {
    this._input = document.getElementById('search-input') as HTMLInputElement;
    this._countSpan = document.getElementById('search-count') as HTMLElement;
    this._prevBtn = document.getElementById('search-prev') as HTMLButtonElement;
    this._nextBtn = document.getElementById('search-next') as HTMLButtonElement;

    this._input.addEventListener('input', () => this._onSearch());
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          this.prevMatch();
        } else {
          this.nextMatch();
        }
      }
      if (e.key === 'Escape') {
        this._input.value = '';
        this._onSearch();
        this._input.blur();
      }
    });
    this._prevBtn.addEventListener('click', () => this.prevMatch());
    this._nextBtn.addEventListener('click', () => this.nextMatch());
  }

  setGridApi(api: GridApi): void {
    this._api = api;
  }

  private _onSearch(): void {
    this._searchText = this._input.value.trim().toLowerCase();

    if (!this._api || this._searchText === '') {
      this._matches = [];
      this._matchCount = 0;
      this._currentMatchIndex = -1;
      this._updateCount();
      this._api?.setGridOption('quickFilterText', '');
      return;
    }

    this._api.setGridOption('quickFilterText', this._searchText);

    // Collect matches for navigation
    this._matches = [];
    this._api.forEachNodeAfterFilterAndSort((node) => {
      if (node.data) {
        // Skip flat detail rows and inline detail rows
        if (node.data.__isFlatDetailRow || node.data.__isDetailRow) return;
        const cols = this._api!.getColumns();
        if (cols) {
          for (const col of cols) {
            const value = this._valueToSearchText(node.data[col.getColId()]);
            if (value.includes(this._searchText)) {
              this._matches.push({
                rowIndex: node.rowIndex!,
                colId: col.getColId(),
              });
            }
          }
        }
      }
    });

    this._matchCount = this._matches.length;
    this._currentMatchIndex = this._matchCount > 0 ? 0 : -1;
    this._updateCount();

    if (this._currentMatchIndex >= 0) {
      this._navigateToMatch(this._currentMatchIndex);
    }
  }

  nextMatch(): void {
    if (this._matchCount === 0) return;
    this._currentMatchIndex = (this._currentMatchIndex + 1) % this._matchCount;
    this._updateCount();
    this._navigateToMatch(this._currentMatchIndex);
  }

  prevMatch(): void {
    if (this._matchCount === 0) return;
    this._currentMatchIndex =
      (this._currentMatchIndex - 1 + this._matchCount) % this._matchCount;
    this._updateCount();
    this._navigateToMatch(this._currentMatchIndex);
  }

  private _navigateToMatch(index: number): void {
    if (!this._api || index < 0 || index >= this._matches.length) return;
    const match = this._matches[index];
    this._api.ensureIndexVisible(match.rowIndex);
    this._api.ensureColumnVisible(match.colId);
  }

  private _valueToSearchText(value: unknown): string {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (item != null && typeof item === 'object') {
            return Object.values(item as Record<string, unknown>)
              .map((v) => (v != null ? String(v) : ''))
              .join(' ');
          }
          return item != null ? String(item) : '';
        })
        .join(' ')
        .toLowerCase();
    }
    return String(value ?? '').toLowerCase();
  }

  private _updateCount(): void {
    if (this._searchText === '') {
      this._countSpan.textContent = '';
    } else if (this._matchCount === 0) {
      this._countSpan.textContent = 'No matches';
    } else {
      this._countSpan.textContent = `${this._currentMatchIndex + 1} / ${this._matchCount}`;
    }
  }
}
