import { JsonlRecord, ColumnDef, ColumnType } from './types';

/**
 * Analyze records to generate AG Grid column definitions.
 * Scans all records to union all keys and infer types.
 */
export function analyzeColumns(records: JsonlRecord[]): ColumnDef[] {
  if (records.length === 0) return [];

  // Collect all unique keys and their value samples
  const keyInfo = new Map<string, { types: Set<string>; hasArray: boolean; hasObject: boolean }>();

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (!keyInfo.has(key)) {
        keyInfo.set(key, { types: new Set(), hasArray: false, hasObject: false });
      }
      const info = keyInfo.get(key)!;

      if (value === null || value === undefined) {
        info.types.add('null');
      } else if (Array.isArray(value)) {
        info.hasArray = true;
        info.types.add('array');
      } else if (typeof value === 'object') {
        info.hasObject = true;
        info.types.add('object');
      } else {
        info.types.add(typeof value);
      }
    }
  }

  // Build column definitions preserving insertion order
  const columns: ColumnDef[] = [];

  for (const [field, info] of keyInfo) {
    const type = inferType(field, info);
    const isSubtable = type === 'subtable';

    columns.push({
      field,
      headerName: field,
      type,
      isSubtable,
      width: estimateWidth(field, type),
    });
  }

  return columns;
}

/**
 * Infer the column type from collected value info.
 */
function inferType(
  field: string,
  info: { types: Set<string>; hasArray: boolean; hasObject: boolean }
): ColumnType {
  // Subtable detection: arrays (especially fields starting with "subtable_")
  if (info.hasArray) {
    return 'subtable';
  }

  // Object type
  if (info.hasObject) {
    return 'object';
  }

  // Remove null from consideration
  const nonNullTypes = new Set([...info.types].filter(t => t !== 'null'));

  if (nonNullTypes.size === 0) return 'unknown';
  if (nonNullTypes.size > 1) return 'string'; // Mixed types -> treat as string

  const type = [...nonNullTypes][0];

  switch (type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'string':
      return 'string';
    default:
      return 'unknown';
  }
}

/**
 * Estimate a reasonable column width based on field name and type.
 */
function estimateWidth(field: string, type: ColumnType): number {
  if (type === 'subtable') return 120;

  // Wider for longer header names
  const headerWidth = Math.max(80, field.length * 12 + 20);

  // Cap at reasonable max
  return Math.min(headerWidth, 300);
}
