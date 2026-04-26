// Lexical analyzer for medical alert DSL
// Grammar example: IF heart_rate > 120 AND spo2 < 92 THEN ALERT CRITICAL

export type TokenType =
  | "IF"
  | "THEN"
  | "ALERT"
  | "AND"
  | "OR"
  | "IDENT"
  | "NUMBER"
  | "OP"
  | "LEVEL"
  | "LPAREN"
  | "RPAREN"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const KEYWORDS: Record<string, TokenType> = {
  IF: "IF",
  THEN: "THEN",
  ALERT: "ALERT",
  AND: "AND",
  OR: "OR",
};
const LEVELS = new Set(["INFO", "WARNING", "CRITICAL"]);
const OPS = [">=", "<=", "==", "!=", ">", "<"];

export class LexerError extends Error {
  constructor(
    message: string,
    public pos: number,
  ) {
    super(message);
  }
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(", pos: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")", pos: i });
      i++;
      continue;
    }

    // operators (multi-char first)
    const op2 = src.slice(i, i + 2);
    if (OPS.includes(op2)) {
      tokens.push({ type: "OP", value: op2, pos: i });
      i += 2;
      continue;
    }
    if (OPS.includes(ch)) {
      tokens.push({ type: "OP", value: ch, pos: i });
      i += 1;
      continue;
    }

    // numbers
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: "NUMBER", value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // identifiers / keywords
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      const upper = word.toUpperCase();
      if (KEYWORDS[upper]) tokens.push({ type: KEYWORDS[upper], value: upper, pos: i });
      else if (LEVELS.has(upper)) tokens.push({ type: "LEVEL", value: upper, pos: i });
      else tokens.push({ type: "IDENT", value: word, pos: i });
      i = j;
      continue;
    }

    throw new LexerError(`Unexpected character '${ch}'`, i);
  }
  tokens.push({ type: "EOF", value: "", pos: src.length });
  return tokens;
}
