import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseNdjson } from '../../src/ndjsonParser';

const fixturesDir = join(__dirname, '..', 'fixtures');

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('parseNdjson', () => {
  it('should parse simple NDJSON', () => {
    const result = parseNdjson(readFixture('simple.ndjson'));
    expect(result.records).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.records[0]).toEqual({ id: 1, name: 'Alice', age: 30 });
    expect(result.records[2]).toEqual({ id: 3, name: 'Charlie', age: 35 });
  });

  it('should handle errors gracefully', () => {
    const result = parseNdjson(readFixture('with-errors.ndjson'));
    expect(result.records).toHaveLength(3);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(2);
    expect(result.errors[0].raw).toBe('not valid json');
  });

  it('should skip empty lines', () => {
    const result = parseNdjson(readFixture('with-errors.ndjson'));
    // Line 4 is empty - should be skipped, not counted as error
    expect(result.errors).toHaveLength(1);
  });

  it('should handle empty file', () => {
    const result = parseNdjson(readFixture('empty.ndjson'));
    expect(result.records).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle BOM', () => {
    const result = parseNdjson(readFixture('with-bom.ndjson'));
    expect(result.records).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.records[0]).toEqual({ id: 1, name: 'BOM test' });
  });

  it('should parse records with subtables', () => {
    const result = parseNdjson(readFixture('with-subtables.ndjson'));
    expect(result.records).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.records[0].subtable_items).toEqual([
      { item: 'A', qty: 1 },
      { item: 'B', qty: 2 },
    ]);
  });

  it('should reject non-object JSON values', () => {
    const result = parseNdjson('"just a string"\n42\n[1,2,3]');
    expect(result.records).toHaveLength(0);
    expect(result.errors).toHaveLength(3);
  });
});
