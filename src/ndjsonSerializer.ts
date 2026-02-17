import { NdjsonRecord } from './types';

/**
 * Serialize an array of records to NDJSON text.
 * Each record is a single line of JSON, with a trailing newline.
 */
export function serializeNdjson(records: NdjsonRecord[]): string {
  return records.map(record => JSON.stringify(record)).join('\n') + '\n';
}

/**
 * Serialize records to Uint8Array for file writing.
 */
export function serializeNdjsonToBytes(records: NdjsonRecord[]): Uint8Array {
  const text = serializeNdjson(records);
  const encoder = new TextEncoder();
  return encoder.encode(text);
}
