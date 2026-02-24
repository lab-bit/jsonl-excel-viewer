import { JsonlRecord } from './types';

/**
 * Serialize an array of records to JSONL text.
 * Each record is a single line of JSON, with a trailing newline.
 */
export function serializeJsonl(records: JsonlRecord[]): string {
  return records.map(record => JSON.stringify(record)).join('\n') + '\n';
}

/**
 * Serialize records to Uint8Array for file writing.
 */
export function serializeJsonlToBytes(records: JsonlRecord[]): Uint8Array {
  const text = serializeJsonl(records);
  const encoder = new TextEncoder();
  return encoder.encode(text);
}
