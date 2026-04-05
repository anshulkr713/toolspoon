import type { JsonValue } from './diffJson';

export type TableCell = string | number | boolean | null;
export type TableRow = Record<string, TableCell>;

export type TableModel = {
  columns: string[];
  rows: TableRow[];
  rowCount: number;
  columnCount: number;
  sourceKind: 'array' | 'object' | 'primitive';
};

export function buildTableModel(data: JsonValue): TableModel {
  const sourceKind = Array.isArray(data)
    ? 'array'
    : data !== null && typeof data === 'object'
      ? 'object'
      : 'primitive';

  const rows = normalizeRows(data);
  const columns = collectColumns(rows);

  return {
    columns,
    rows,
    rowCount: rows.length,
    columnCount: columns.length,
    sourceKind,
  };
}

export function formatTableCell(value: TableCell | undefined): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  return String(value);
}

function normalizeRows(data: JsonValue): TableRow[] {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return [];
    }

    return data.map((value, index) => ({
      '#': index + 1,
      ...flattenValue(value),
    }));
  }

  return [flattenValue(data)];
}

function flattenValue(value: JsonValue, prefix = '', row: TableRow = {}): TableRow {
  if (isPrimitive(value)) {
    row[prefix || 'value'] = normalizePrimitive(value);
    return row;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      row[prefix || 'value'] = '[]';
      return row;
    }

    if (value.every(isPrimitive)) {
      row[prefix || 'value'] = value.map((item) => formatTableCell(normalizePrimitive(item))).join(', ');
      return row;
    }

    value.forEach((item, index) => {
      const nextPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      flattenValue(item, nextPrefix, row);
    });

    return row;
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    row[prefix || 'value'] = '{}';
    return row;
  }

  entries.forEach(([key, entryValue]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    flattenValue(entryValue, nextPrefix, row);
  });

  return row;
}

function collectColumns(rows: TableRow[]) {
  const orderedColumns: string[] = [];
  const seenColumns = new Set<string>();

  rows.forEach((row) => {
    Object.keys(row).forEach((column) => {
      if (seenColumns.has(column)) return;
      seenColumns.add(column);
      orderedColumns.push(column);
    });
  });

  return orderedColumns;
}

function isPrimitive(value: JsonValue): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function normalizePrimitive(value: string | number | boolean | null): TableCell {
  return value;
}
