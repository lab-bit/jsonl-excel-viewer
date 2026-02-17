import { describe, it, expect } from 'vitest';
import { analyzeColumns } from '../../src/columnAnalyzer';
import { NdjsonRecord } from '../../src/types';

describe('analyzeColumns', () => {
  it('should return empty array for empty records', () => {
    expect(analyzeColumns([])).toEqual([]);
  });

  it('should detect basic types', () => {
    const records: NdjsonRecord[] = [
      { name: 'Alice', age: 30, active: true },
    ];
    const cols = analyzeColumns(records);
    expect(cols).toHaveLength(3);

    const nameCol = cols.find(c => c.field === 'name');
    expect(nameCol?.type).toBe('string');

    const ageCol = cols.find(c => c.field === 'age');
    expect(ageCol?.type).toBe('number');

    const activeCol = cols.find(c => c.field === 'active');
    expect(activeCol?.type).toBe('boolean');
  });

  it('should detect subtables (array fields)', () => {
    const records: NdjsonRecord[] = [
      {
        id: '001',
        subtable_items: [{ item: 'A', qty: 1 }],
        subtable_tags: [{ tag: 'x' }],
      },
    ];
    const cols = analyzeColumns(records);

    const itemsCol = cols.find(c => c.field === 'subtable_items');
    expect(itemsCol?.type).toBe('subtable');
    expect(itemsCol?.isSubtable).toBe(true);

    const tagsCol = cols.find(c => c.field === 'subtable_tags');
    expect(tagsCol?.type).toBe('subtable');
    expect(tagsCol?.isSubtable).toBe(true);
  });

  it('should detect object fields', () => {
    const records: NdjsonRecord[] = [
      { id: 1, metadata: { key: 'val' } },
    ];
    const cols = analyzeColumns(records);
    const metaCol = cols.find(c => c.field === 'metadata');
    expect(metaCol?.type).toBe('object');
    expect(metaCol?.isSubtable).toBe(false);
  });

  it('should union keys from all records', () => {
    const records: NdjsonRecord[] = [
      { a: 1, b: 2 },
      { b: 3, c: 4 },
      { a: 5, d: 6 },
    ];
    const cols = analyzeColumns(records);
    const fields = cols.map(c => c.field);
    expect(fields).toContain('a');
    expect(fields).toContain('b');
    expect(fields).toContain('c');
    expect(fields).toContain('d');
    expect(cols).toHaveLength(4);
  });

  it('should handle null values', () => {
    const records: NdjsonRecord[] = [
      { name: 'Alice', age: null },
      { name: 'Bob', age: 25 },
    ];
    const cols = analyzeColumns(records);
    const ageCol = cols.find(c => c.field === 'age');
    expect(ageCol?.type).toBe('number');
  });

  it('should treat mixed types as string', () => {
    const records: NdjsonRecord[] = [
      { value: 'text' },
      { value: 42 },
    ];
    const cols = analyzeColumns(records);
    const valCol = cols.find(c => c.field === 'value');
    expect(valCol?.type).toBe('string');
  });

  it('should handle all-null columns as unknown', () => {
    const records: NdjsonRecord[] = [
      { x: null },
      { x: null },
    ];
    const cols = analyzeColumns(records);
    expect(cols[0].type).toBe('unknown');
  });

  it('should preserve field order from first record', () => {
    const records: NdjsonRecord[] = [
      { first: 1, second: 2, third: 3 },
    ];
    const cols = analyzeColumns(records);
    expect(cols[0].field).toBe('first');
    expect(cols[1].field).toBe('second');
    expect(cols[2].field).toBe('third');
  });
});
