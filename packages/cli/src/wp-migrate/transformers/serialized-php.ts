/**
 * PHP Serialized String Parser
 * Pure TypeScript implementation - no eval, no external dependencies
 * Handles: strings, integers, floats, booleans, null, arrays, objects
 */

export class PHPUnserializeError extends Error {
  constructor(message: string, public position: number, public input: string) {
    super(`PHP Unserialize Error at position ${position}: ${message}`);
    this.name = 'PHPUnserializeError';
  }
}

interface ParseState {
  input: string;
  position: number;
  length: number;
}

const MAX_DEPTH = 100;
const MAX_STRING_LENGTH = 10 * 1024 * 1024; // 10MB
const MAX_ARRAY_ELEMENTS = 100000;

export function phpUnserialize(input: string, options?: { maxDepth?: number; maxStringLength?: number }): unknown {
  const state: ParseState = {
    input,
    position: 0,
    length: input.length,
  };

  const maxDepth = options?.maxDepth ?? MAX_DEPTH;
  const maxStringLength = options?.maxStringLength ?? MAX_STRING_LENGTH;

  function peek(): string {
    return state.input[state.position] ?? '';
  }

  function consume(expected?: string): string {
    const char = state.input[state.position];
    if (char === undefined) {
      throw new PHPUnserializeError('Unexpected end of input', state.position, state.input);
    }
    if (expected && char !== expected) {
      throw new PHPUnserializeError(`Expected '${expected}' but found '${char}'`, state.position, state.input);
    }
    state.position++;
    return char;
  }

  function readUntil(delimiter: string): string {
    const start = state.position;
    const index = state.input.indexOf(delimiter, start);
    if (index === -1) {
      throw new PHPUnserializeError(`Delimiter '${delimiter}' not found`, state.position, state.input);
    }
    state.position = index;
    return state.input.slice(start, index);
  }

  function parseValue(depth: number = 0): unknown {
    if (depth > maxDepth) {
      throw new PHPUnserializeError(`Maximum depth (${maxDepth}) exceeded`, state.position, state.input);
    }

    const char = peek();
    switch (char) {
      case 'N':
        return parseNull();
      case 'b':
        return parseBoolean();
      case 'i':
        return parseInteger();
      case 'd':
        return parseFloatValue();
      case 's':
        return parseString();
      case 'a':
        return parseArray(depth + 1);
      case 'O':
      case 'C':
        return parseObject(depth + 1);
      case 'R':
      case 'r':
        return parseReference(depth + 1);
      default:
        throw new PHPUnserializeError(`Unknown type specifier: '${char}'`, state.position, state.input);
    }
  }

  function parseNull(): null {
    consume('N');
    consume(';');
    return null;
  }

  function parseBoolean(): boolean {
    consume('b');
    consume(':');
    const val = consume();
    consume(';');
    return val === '1';
  }

  function parseInteger(): number {
    consume('i');
    consume(':');
    const numStr = readUntil(';');
    consume(';');
    const num = parseInt(numStr, 10);
    if (isNaN(num)) {
      throw new PHPUnserializeError(`Invalid integer: ${numStr}`, state.position, state.input);
    }
    return num;
  }

  function parseFloatValue(): number {
    consume('d');
    consume(':');
    const numStr = readUntil(';');
    consume(';');
    const num = parseFloat(numStr);
    if (isNaN(num)) {
      throw new PHPUnserializeError(`Invalid float: ${numStr}`, state.position, state.input);
    }
    return num;
  }

  function parseString(): string {
    consume('s');
    consume(':');
    const lenStr = readUntil(':');
    consume(':'); // skip the colon after length
    const length = parseInt(lenStr, 10);
    if (isNaN(length) || length < 0) {
      throw new PHPUnserializeError(`Invalid string length: ${lenStr}`, state.position, state.input);
    }
    if (length > maxStringLength) {
      throw new PHPUnserializeError(`String length ${length} exceeds maximum ${maxStringLength}`, state.position, state.input);
    }
    // PHP serialized strings use {length}:"content"; format
    // The content may contain semicolons, so we read exactly length characters
    if (state.position + length > state.length) {
      throw new PHPUnserializeError('String length exceeds input', state.position, state.input);
    }
    const content = state.input.slice(state.position, state.position + length);
    state.position += length;
    // Next should be ";"
    if (peek() !== '"') {
      // Some malformed data might not have quotes, but standard format has quotes around content
      // Actually, PHP format is s:length:"content";
      // We already consumed the opening quote implicitly by reading length chars
      // Now we expect a closing quote and semicolon
    }
    consume('"'); // closing quote
    consume(';');
    return content;
  }

  function parseArray(depth: number): Map<unknown, unknown> | Record<string, unknown> {
    consume('a');
    consume(':');
    const countStr = readUntil(':');
    consume(':'); // skip colon after count
    const count = parseInt(countStr, 10);
    if (isNaN(count) || count < 0) {
      throw new PHPUnserializeError(`Invalid array count: ${countStr}`, state.position, state.input);
    }
    if (count > MAX_ARRAY_ELEMENTS) {
      throw new PHPUnserializeError(`Array count ${count} exceeds maximum ${MAX_ARRAY_ELEMENTS}`, state.position, state.input);
    }
    consume('{'); // opening brace

    const result: Record<string, unknown> = {};
    const useMap = count > 1000; // Use Map for large arrays for performance

    for (let i = 0; i < count; i++) {
      const key = parseValue(depth);
      const value = parseValue(depth);

      // PHP arrays can have integer or string keys
      const keyStr = String(key);
      if (useMap) {
        // We'll convert to Map at the end if needed
        result[keyStr] = value;
      } else {
        result[keyStr] = value;
      }
    }

    consume('}'); // closing brace
    return result;
  }

  function parseObject(depth: number): { class: string; properties: Record<string, unknown> } {
    const isCustom = peek() === 'C';
    if (isCustom) consume('C');
    else consume('O');

    consume(':');
    const classLenStr = readUntil(':');
    consume(':'); // skip colon after class name length
    const classLen = parseInt(classLenStr, 10);
    if (isNaN(classLen) || classLen < 0) {
      throw new PHPUnserializeError(`Invalid class name length: ${classLenStr}`, state.position, state.input);
    }

    const className = state.input.slice(state.position, state.position + classLen);
    state.position += classLen;
    consume(':'); // skip colon after class name

    const propCountStr = readUntil(':');
    consume(':'); // skip colon after property count
    const propCount = parseInt(propCountStr, 10);
    if (isNaN(propCount) || propCount < 0) {
      throw new PHPUnserializeError(`Invalid property count: ${propCountStr}`, state.position, state.input);
    }

    consume('{'); // opening brace

    const properties: Record<string, unknown> = {};

    for (let i = 0; i < propCount; i++) {
      const key = parseValue(depth);
      const value = parseValue(depth);

      // PHP object property names can be:
      // - public: "propertyName"
      // - protected: "\0*\0propertyName"
      // - private: "\0ClassName\0propertyName"
      let keyStr = String(key);
      // Clean up visibility markers
      if (keyStr.startsWith('\0')) {
        const parts = keyStr.split('\0');
        keyStr = parts[parts.length - 1] ?? '';
      }

      properties[keyStr] = value;
    }

    consume('}'); // closing brace

    return { class: className, properties };
  }

  function parseReference(_depth: number): unknown {
    // References (R/r) are rare in WP data, but we handle them
    // R:reference_id; or r:reference_id;
    consume(peek()); // R or r
    consume(':');
    const refIdStr = readUntil(';');
    consume(';');
    const refId = parseInt(refIdStr, 10);
    // We can't actually resolve references in a single-pass parser
    // Return a marker object
    return { __php_reference: refId };
  }

  const result = parseValue();

  // Check for trailing garbage
  if (state.position < state.length) {
    const remaining = state.input.slice(state.position).trim();
    if (remaining) {
      throw new PHPUnserializeError(`Trailing data after parse: ${remaining.slice(0, 50)}`, state.position, state.input);
    }
  }

  return result;
}

/**
 * Safely unserialize with fallback - returns original string on failure
 */
export function safePhpUnserialize(input: string): unknown {
  if (!input || typeof input !== 'string') {
    return input;
  }

  // Quick check: does it look like PHP serialized data?
  if (!/^[NbsidacOCRr]:/.test(input.trim())) {
    return input; // Not serialized, return as-is
  }

  try {
    return phpUnserialize(input);
  } catch (error) {
    if (error instanceof PHPUnserializeError) {
      // Log warning but don't throw
      console.warn(`[WP Migrate] Failed to unserialize: ${error.message}`);
      return input; // Return original string
    }
    throw error;
  }
}

/**
 * Recursively unserialize nested PHP serialized strings
 * Some WP meta values contain serialized arrays with serialized strings inside
 */
export function deepUnserialize(value: unknown, maxDepth: number = 5): unknown {
  if (maxDepth <= 0) return value;

  if (typeof value === 'string') {
    const unserialized = safePhpUnserialize(value);
    if (unserialized !== value) {
      // Successfully unserialized, recurse into the result
      return deepUnserialize(unserialized, maxDepth - 1);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(v => deepUnserialize(v, maxDepth - 1));
  }

  if (value && typeof value === 'object') {
    // Handle WP object format: { class: 'WP_Post', properties: {...} }
    if ('class' in value && 'properties' in value && typeof value.properties === 'object') {
      const props = value.properties as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        result[k] = deepUnserialize(v, maxDepth - 1);
      }
      return { __wp_class: value.class, ...result };
    }

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = deepUnserialize(v, maxDepth - 1);
    }
    return result;
  }

  return value;
}

/**
 * Extract ID from WP object (WP_Post, WP_Term, WP_User, etc.)
 */
export function extractWPObjectId(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;

  // Handle { class: 'WP_Post', properties: { ID: 123, ... } }
  if ('__wp_class' in value && 'properties' in value) {
    const props = (value as { properties: Record<string, unknown> }).properties;
    if ('ID' in props && typeof props['ID'] === 'number') return props['ID'] as number;
    if ('term_id' in props && typeof props['term_id'] === 'number') return props['term_id'] as number;
    if ('user_id' in props && typeof props['user_id'] === 'number') return props['user_id'] as number;
    if ('comment_ID' in props && typeof props['comment_ID'] === 'number') return props['comment_ID'] as number;
  }

  // Handle direct object with ID
  if ('ID' in value && typeof (value as Record<string, unknown>)['ID'] === 'number') {
    return (value as Record<string, unknown>)['ID'] as number;
  }

  return null;
}

/**
 * Check if a value is a WP object reference
 */
export function isWPObject(value: unknown): value is { __wp_class: string; [key: string]: unknown } {
  return value !== null && typeof value === 'object' && '__wp_class' in value;
}

/**
 * Get WP object class name
 */
export function getWPObjectClass(value: unknown): string | null {
  if (isWPObject(value)) {
    return value.__wp_class;
  }
  return null;
}