<script lang="ts">
  import { buildTableModel, formatTableCell, type TableCell } from './tableData';
  import Papa from 'papaparse';

  let { data } = $props<{ data: any }>();

  let search = $state('');

  const tableModel = $derived(data !== undefined ? buildTableModel(data) : {
    columns: [],
    rows: [],
    rowCount: 0,
    columnCount: 0,
    sourceKind: 'primitive' as const,
  });

  const searchTerm = $derived(search.trim().toLowerCase());

  const filteredRows = $derived.by(() => {
    if (!searchTerm) {
      return tableModel.rows;
    }

    return tableModel.rows.filter((row) =>
      tableModel.columns.some((column) =>
        column.toLowerCase().includes(searchTerm)
        || formatTableCell(row[column]).toLowerCase().includes(searchTerm)
      )
    );
  });

  let page = $state(1);
  let pageSize = 100;
  const paginatedRows = $derived(filteredRows.slice(0, page * pageSize));
  const hasMoreRows = $derived(filteredRows.length > page * pageSize);

  $effect(() => {
    // Reset page when search changes
    if (searchTerm !== undefined) {
      page = 1;
    }
  });

  function getCellTone(value: TableCell | undefined) {
    if (value === undefined) return 'empty';
    if (value === null) return 'null';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }

  function exportCSV() {
    const csv = Papa.unparse({
      fields: tableModel.columns,
      data: tableModel.rows.map((row) => tableModel.columns.map((column) => row[column] ?? '')),
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'table-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportXLSX() {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(tableModel.rows, { header: tableModel.columns });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "table-export.xlsx");
  }
</script>

<div class="table-shell">
  <div class="table-toolbar">
    <div class="table-metrics">
      <span class="metric-pill">{tableModel.rowCount.toLocaleString()} rows</span>
      <span class="metric-pill">{tableModel.columnCount.toLocaleString()} columns</span>
      <span class="metric-pill metric-pill-muted">{tableModel.sourceKind}</span>
    </div>

    <label class="table-search">
      <span class="sr-only">Search table rows</span>
      <input bind:value={search} type="search" placeholder="Search columns or values" />
    </label>

    <div class="export-actions">
      <button class="export-btn" onclick={exportCSV} title="Download Table as CSV">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Download CSV
      </button>
      <button class="export-btn" onclick={exportXLSX} title="Download Table as Excel Spreadsheet">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Download XLSX
      </button>
    </div>
  </div>

  {#if tableModel.rowCount === 0 || tableModel.columnCount === 0}
    <div class="table-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="9" y1="21" x2="9" y2="9"></line>
      </svg>
      <span>This JSON does not produce tabular rows yet. Arrays of records work best here.</span>
    </div>
  {:else}
    <div class="column-strip" aria-label="Flattened table columns">
      {#each tableModel.columns.slice(0, 8) as column}
        <span class="column-pill">{column}</span>
      {/each}
      {#if tableModel.columns.length > 8}
        <span class="column-pill column-pill-muted">+{tableModel.columns.length - 8} more</span>
      {/if}
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            {#each tableModel.columns as column}
              <th scope="col">{column}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if filteredRows.length === 0}
            <tr>
              <td class="empty-search" colspan={tableModel.columnCount}>
                No rows match "{search}".
              </td>
            </tr>
          {:else}
            {#each paginatedRows as row}
              <tr>
                {#each tableModel.columns as column}
                  <td class={`tone-${getCellTone(row[column])}`}>
                    {#if row[column] === undefined}
                      <span class="cell-empty">—</span>
                    {:else}
                      <span class="cell-val" title={String(formatTableCell(row[column]))}>
                        {formatTableCell(row[column])}
                      </span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
            {#if hasMoreRows}
              <tr>
                <td colspan={tableModel.columns.length || 1} class="load-more-cell">
                  <button class="load-more-btn" onclick={() => page++}>
                    Load {Math.min(pageSize, filteredRows.length - page * pageSize)} more rows (of {filteredRows.length - page * pageSize} remaining)
                  </button>
                </td>
              </tr>
            {/if}
          {/if}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  /* ── Table theme tokens ── */
  .table-shell {
    --tbl-pill-border: rgba(63, 63, 70, 0.45);
    --tbl-pill-bg: rgba(15, 23, 42, 0.45);
    --tbl-input-border: rgba(63, 63, 70, 0.45);
    --tbl-input-bg: rgba(15, 23, 42, 0.5);
    --tbl-wrap-border: rgba(63, 63, 70, 0.45);
    --tbl-wrap-bg: rgba(9, 9, 11, 0.35);
    --tbl-thead-bg: rgba(17, 24, 39, 0.96);
    --tbl-thead-border: rgba(63, 63, 70, 0.45);
    --tbl-row-border: rgba(63, 63, 70, 0.22);
    --tbl-row-hover: rgba(99, 102, 241, 0.04);
    --tbl-empty-border: rgba(63, 63, 70, 0.45);
    --tbl-empty-bg: rgba(15, 23, 42, 0.25);
    --tbl-string: #d6d3d1;
    --tbl-number: #f59e0b;
    --tbl-boolean: #38bdf8;
    --tbl-null: #fb7185;
  }

  :global(html:not(.dark)) .table-shell {
    --tbl-pill-border: #e4e4e7;
    --tbl-pill-bg: #f4f4f5;
    --tbl-input-border: #e4e4e7;
    --tbl-input-bg: #ffffff;
    --tbl-wrap-border: #e4e4e7;
    --tbl-wrap-bg: #fafafa;
    --tbl-thead-bg: #f4f4f5;
    --tbl-thead-border: #e4e4e7;
    --tbl-row-border: #f0f0f2;
    --tbl-row-hover: rgba(99, 102, 241, 0.06);
    --tbl-empty-border: #e4e4e7;
    --tbl-empty-bg: #fafafa;
    --tbl-string: #334155;
    --tbl-number: #b45309;
    --tbl-boolean: #0369a1;
    --tbl-null: #e11d48;
  }

  .table-shell {
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: 100%;
    padding: 16px;
    color: var(--text-primary);
  }

  .table-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .table-metrics {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .metric-pill,
  .column-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid var(--tbl-pill-border);
    background: var(--tbl-pill-bg);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .metric-pill-muted,
  .column-pill-muted {
    opacity: 0.72;
  }

  .table-search {
    display: flex;
    align-items: center;
    min-width: min(320px, 100%);
  }

  .table-search input {
    width: 100%;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--tbl-input-border);
    background: var(--tbl-input-bg);
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .table-search input:focus {
    border-color: rgba(99, 102, 241, 0.45);
    box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.35);
  }

  .export-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .export-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--tbl-input-bg);
    border: 1px solid var(--tbl-input-border);
    color: var(--text-primary);
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .export-btn:hover {
    background: rgba(99, 102, 241, 0.1);
    border-color: rgba(99, 102, 241, 0.3);
    color: #818cf8;
  }

  .export-btn svg {
    opacity: 0.8;
  }

  .column-strip {
    display: flex;
    gap: 8px;
    overflow: auto;
    padding-bottom: 2px;
  }

  .table-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--tbl-wrap-border);
    border-radius: 18px;
    background: var(--tbl-wrap-bg);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 720px;
  }

  .data-table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 12px 14px;
    background: var(--tbl-thead-bg);
    border-bottom: 1px solid var(--tbl-thead-border);
    color: var(--text-primary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: left;
    white-space: nowrap;
  }

  .data-table tbody td {
    padding: 12px 14px;
    border-bottom: 1px solid var(--tbl-row-border);
    color: var(--text-secondary);
    font-size: 12px;
    vertical-align: top;
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-val {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 290px;
  }

  .data-table tbody tr:hover td {
    background: var(--tbl-row-hover);
  }

  .tone-string {
    color: var(--tbl-string);
  }

  .tone-number {
    color: var(--tbl-number);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .tone-boolean {
    color: var(--tbl-boolean);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .tone-null {
    color: var(--tbl-null);
    font-style: italic;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .cell-empty {
    color: var(--text-muted);
  }

  .empty-search {
    text-align: center;
    color: var(--text-muted);
  }

  .load-more-cell {
    text-align: center;
    padding: 16px !important;
  }

  .load-more-btn {
    background: rgba(99, 102, 241, 0.1);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.2);
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.1s;
  }

  .load-more-btn:hover {
    background: rgba(99, 102, 241, 0.2);
  }

  .table-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 240px;
    padding: 24px;
    border: 1px dashed var(--tbl-empty-border);
    border-radius: 18px;
    color: var(--text-muted);
    text-align: center;
    background: var(--tbl-empty-bg);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 768px) {
    .table-shell {
      padding: 12px;
    }

    .table-search {
      min-width: 100%;
    }
  }
</style>
