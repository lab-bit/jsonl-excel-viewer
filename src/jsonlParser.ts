import { JsonlRecord, ParseResult, ParseError } from './types';

/**
 * Parse JSONL text into an array of records.
 * Handles:
 * - Empty lines (skipped)
 * - Lines with only whitespace (skipped)
 * - Invalid JSON lines (captured as errors, not thrown)
 * - BOM (stripped if present)
 */
export function parseJsonl(text: string): ParseResult {
  const records: JsonlRecord[] = [];
  const errors: ParseError[] = [];

  // Strip BOM
  const cleaned = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;

  const lines = cleaned.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;

    try {
      const parsed = JSON.parse(line);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        records.push(parsed as JsonlRecord);
      } else {
        errors.push({
          line: i + 1,
          raw: lines[i],
          message: 'Line is not a JSON object',
        });
      }
    } catch (e) {
      errors.push({
        line: i + 1,
        raw: lines[i],
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { records, errors };
}

/**
 * Parse JSONL from a Uint8Array (file content).
 */
export function parseJsonlFromBytes(bytes: Uint8Array): ParseResult {
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(bytes);
  return parseJsonl(text);
}
