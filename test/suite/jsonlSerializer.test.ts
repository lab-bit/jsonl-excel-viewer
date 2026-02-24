import { describe, it, expect } from 'vitest';
import { serializeJsonl } from '../../src/jsonlSerializer';
import { parseJsonl } from '../../src/jsonlParser';

describe('serializeJsonl', () => {
  it('should serialize records to JSONL', () => {
    const records = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];
    const result = serializeJsonl(records);
    expect(result).toBe('{"id":1,"name":"Alice"}\n{"id":2,"name":"Bob"}\n');
  });

  it('should handle empty array', () => {
    const result = serializeJsonl([]);
    expect(result).toBe('\n');
  });

  it('should round-trip with parser', () => {
    const original = [
      { id: 1, name: 'Alice', age: 30 },
      { id: 2, name: 'Bob', age: 25, nested: { x: 1 } },
      { id: 3, items: [1, 2, 3] },
    ];
    const serialized = serializeJsonl(original);
    const parsed = parseJsonl(serialized);
    expect(parsed.records).toEqual(original);
    expect(parsed.errors).toHaveLength(0);
  });

  it('should handle special characters', () => {
    const records = [
      { name: '日本語テスト', value: 'tabs\there' },
      { name: 'quotes "inside"', emoji: '🎉' },
    ];
    const serialized = serializeJsonl(records);
    const parsed = parseJsonl(serialized);
    expect(parsed.records).toEqual(records);
  });
});
