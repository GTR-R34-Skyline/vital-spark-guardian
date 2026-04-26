// Parser for medical DSL — produces an AST
// Grammar:
//   rule       := IF expr THEN ALERT LEVEL
//   expr       := term ((AND|OR) term)*
//   term       := comparison | LPAREN expr RPAREN
//   comparison := IDENT OP NUMBER

import { tokenize, Token, LexerError } from "./lexer";

export type Comparison = {
  type: "comparison";
  field: string;
  op: ">" | "<" | ">=" | "<=" | "==" | "!=";
  value: number;
};
export type Logical = { type: "logical"; op: "AND" | "OR"; left: Expr; right: Expr };
export type Expr = Comparison | Logical;

export interface RuleAST {
  condition: Expr;
  level: "INFO" | "WARNING" | "CRITICAL";
}

export class ParseError extends Error {
  constructor(
    message: string,
    public pos: number,
  ) {
    super(message);
  }
}

export function parseRule(src: string): RuleAST {
  let tokens: Token[];
  try {
    tokens = tokenize(src);
  } catch (e) {
    if (e instanceof LexerError) throw new ParseError(e.message, e.pos);
    throw e;
  }

  let i = 0;
  const peek = () => tokens[i];
  const eat = (type: string) => {
    const t = tokens[i];
    if (t.type !== type)
      throw new ParseError(`Expected ${type} but got '${t.value || t.type}'`, t.pos);
    i++;
    return t;
  };

  const parseComparison = (): Comparison => {
    const id = eat("IDENT");
    const op = eat("OP");
    const num = eat("NUMBER");
    return {
      type: "comparison",
      field: id.value,
      op: op.value as Comparison["op"],
      value: parseFloat(num.value),
    };
  };

  const parseTerm = (): Expr => {
    if (peek().type === "LPAREN") {
      eat("LPAREN");
      const e = parseExpr();
      eat("RPAREN");
      return e;
    }
    return parseComparison();
  };

  const parseExpr = (): Expr => {
    let left: Expr = parseTerm();
    while (peek().type === "AND" || peek().type === "OR") {
      const opTok = tokens[i++];
      const right = parseTerm();
      left = { type: "logical", op: opTok.type as "AND" | "OR", left, right };
    }
    return left;
  };

  eat("IF");
  const condition = parseExpr();
  eat("THEN");
  eat("ALERT");
  const lvl = eat("LEVEL");
  if (peek().type !== "EOF") throw new ParseError(`Unexpected token '${peek().value}'`, peek().pos);

  return { condition, level: lvl.value as RuleAST["level"] };
}

export function validate(
  src: string,
): { ok: true; ast: RuleAST } | { ok: false; error: string; pos: number } {
  try {
    const ast = parseRule(src);
    return { ok: true, ast };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, pos: e.pos };
    return { ok: false, error: (e as Error).message, pos: 0 };
  }
}
