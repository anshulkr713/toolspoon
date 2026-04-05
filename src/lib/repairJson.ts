export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export class LooseJsonParseError extends Error {
  position: number;
  line: number;

  constructor(message: string, position: number, line: number) {
    super(message);
    this.name = 'LooseJsonParseError';
    this.position = position;
    this.line = line;
  }
}

const BARE_TOKEN_BREAKS = new Set([
  ',',
  ';',
  ':',
  '{',
  '}',
  '[',
  ']',
]);

function normalizeSource(source: string) {
  return source
    .replace(/^\uFEFF/, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, ' ');
}

class LooseJsonParser {
  private source: string;
  private index = 0;

  constructor(input: string) {
    this.source = normalizeSource(input);
  }

  parse(): JsonValue {
    const value = this.parseValue();
    this.skipTrivia();

    while (this.peek() === ';') {
      this.index += 1;
      this.skipTrivia();
    }

    if (!this.isAtEnd()) {
      this.throwError(`Unexpected token "${this.peek()}"`);
    }

    return value;
  }

  private parseValue(): JsonValue {
    this.skipTrivia();

    if (this.isAtEnd()) {
      this.throwError('Unexpected end of input');
    }

    const char = this.peek();

    if (char === '{') return this.parseObject();
    if (char === '[') return this.parseArray();
    if (char === '"' || char === "'" || char === '`') return this.parseString();

    if ((char === '+' || char === '-' || this.isDigit(char)) && this.looksLikeNumber()) {
      return this.parseNumber();
    }

    return this.parseIdentifierValue();
  }

  private parseObject(): { [key: string]: JsonValue } {
    const result: { [key: string]: JsonValue } = {};

    this.expect('{');
    this.skipTrivia();

    while (!this.isAtEnd()) {
      if (this.peek() === '}') {
        this.index += 1;
        return result;
      }

      const key = this.parseObjectKey();

      this.skipTrivia();
      this.consumeKeySeparator();
      this.skipTrivia();

      result[key] = this.parseValue();

      this.skipTrivia();

      if (this.peek() === '}') {
        this.index += 1;
        return result;
      }

      if (this.peek() === ',' || this.peek() === ';') {
        this.index += 1;
        this.skipTrivia();
        continue;
      }

      if (this.isObjectKeyStart(this.peek())) {
        continue;
      }

      this.throwError('Expected "," or "}" after object property');
    }

    this.throwError('Unterminated object literal');
  }

  private parseArray(): JsonValue[] {
    const result: JsonValue[] = [];

    this.expect('[');
    this.skipTrivia();

    while (!this.isAtEnd()) {
      if (this.peek() === ']') {
        this.index += 1;
        return result;
      }

      if (this.peek() === ',' || this.peek() === ';') {
        result.push(null);
        this.index += 1;
        this.skipTrivia();
        continue;
      }

      result.push(this.parseValue());
      this.skipTrivia();

      if (this.peek() === ']') {
        this.index += 1;
        return result;
      }

      if (this.peek() === ',' || this.peek() === ';') {
        this.index += 1;
        this.skipTrivia();
        continue;
      }

      if (this.isValueStart(this.peek())) {
        continue;
      }

      this.throwError('Expected "," or "]" after array item');
    }

    this.throwError('Unterminated array literal');
  }

  private parseObjectKey() {
    const char = this.peek();

    if (char === '"' || char === "'" || char === '`') {
      return this.parseString();
    }

    const token = this.readBareToken();

    if (!token) {
      this.throwError('Expected an object key');
    }

    return token;
  }

  private consumeKeySeparator() {
    const char = this.peek();

    if (char === ':') {
      this.index += 1;
      return;
    }

    if (char === '=') {
      this.index += 1;
      if (this.peek() === '>') {
        this.index += 1;
      }
      return;
    }

    this.throwError('Expected ":" after object key');
  }

  private parseString() {
    const quote = this.peek();
    let value = '';

    this.index += 1;

    while (!this.isAtEnd()) {
      const char = this.peek();
      this.index += 1;

      if (char === quote) {
        return value;
      }

      if (char === '\\') {
        value += this.readEscapeSequence();
        continue;
      }

      value += char;
    }

    this.throwError('Unterminated string literal');
  }

  private readEscapeSequence() {
    if (this.isAtEnd()) {
      return '';
    }

    const escape = this.peek();
    this.index += 1;

    switch (escape) {
      case '"':
      case "'":
      case '`':
      case '\\':
      case '/':
        return escape;
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'u': {
        const hex = this.source.slice(this.index, this.index + 4);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          this.index += 4;
          return String.fromCharCode(Number.parseInt(hex, 16));
        }
        return 'u';
      }
      default:
        return escape;
    }
  }

  private parseNumber() {
    const start = this.index;

    if (this.peek() === '+' || this.peek() === '-') {
      this.index += 1;
    }

    while (this.isDigit(this.peek())) {
      this.index += 1;
    }

    if (this.peek() === '.') {
      this.index += 1;
      while (this.isDigit(this.peek())) {
        this.index += 1;
      }
    }

    if (this.peek() === 'e' || this.peek() === 'E') {
      this.index += 1;

      if (this.peek() === '+' || this.peek() === '-') {
        this.index += 1;
      }

      while (this.isDigit(this.peek())) {
        this.index += 1;
      }
    }

    const raw = this.source.slice(start, this.index);
    const value = Number(raw);

    if (!Number.isFinite(value)) {
      return null;
    }

    if (Number.isNaN(value)) {
      this.throwError(`Invalid number "${raw}"`);
    }

    return value;
  }

  private parseIdentifierValue(): JsonValue {
    const token = this.readBareToken();

    if (!token) {
      this.throwError('Expected a value');
    }

    if (token === 'true' || token === 'True') return true;
    if (token === 'false' || token === 'False') return false;

    if (
      token === 'null'
      || token === 'None'
      || token === 'undefined'
      || token === 'NaN'
      || token === 'Infinity'
      || token === '+Infinity'
      || token === '-Infinity'
    ) {
      return null;
    }

    return token;
  }

  private readBareToken() {
    const start = this.index;

    while (!this.isAtEnd()) {
      const char = this.peek();
      if (this.isWhitespace(char) || BARE_TOKEN_BREAKS.has(char)) {
        break;
      }
      this.index += 1;
    }

    return this.source.slice(start, this.index).trim();
  }

  private looksLikeNumber() {
    const char = this.peek();
    const next = this.peek(1);

    if (this.isDigit(char)) {
      return true;
    }

    if ((char === '+' || char === '-') && this.isDigit(next)) {
      return true;
    }

    return false;
  }

  private skipTrivia() {
    while (!this.isAtEnd()) {
      const char = this.peek();
      const next = this.peek(1);

      if (this.isWhitespace(char)) {
        this.index += 1;
        continue;
      }

      if (char === '/' && next === '/') {
        this.index += 2;
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.index += 1;
        }
        continue;
      }

      if (char === '/' && next === '*') {
        this.index += 2;
        while (!this.isAtEnd() && !(this.peek() === '*' && this.peek(1) === '/')) {
          this.index += 1;
        }
        if (!this.isAtEnd()) {
          this.index += 2;
        }
        continue;
      }

      break;
    }
  }

  private isValueStart(char: string) {
    return (
      char === '{'
      || char === '['
      || char === '"'
      || char === "'"
      || char === '`'
      || char === '+'
      || char === '-'
      || this.isDigit(char)
      || this.isIdentifierStart(char)
    );
  }

  private isObjectKeyStart(char: string) {
    return char === '"' || char === "'" || char === '`' || this.isIdentifierStart(char);
  }

  private isIdentifierStart(char: string) {
    return /^[A-Za-z_$]$/.test(char);
  }

  private isDigit(char: string) {
    return /^[0-9]$/.test(char);
  }

  private isWhitespace(char: string) {
    return /\s/.test(char);
  }

  private expect(char: string) {
    if (this.peek() !== char) {
      this.throwError(`Expected "${char}"`);
    }
    this.index += 1;
  }

  private peek(offset = 0) {
    return this.source[this.index + offset] ?? '';
  }

  private isAtEnd() {
    return this.index >= this.source.length;
  }

  private throwError(message: string): never {
    const line = this.source.slice(0, this.index).split('\n').length;
    throw new LooseJsonParseError(message, this.index, line);
  }
}

export function repairJson(source: string) {
  const parser = new LooseJsonParser(source);
  return parser.parse();
}
