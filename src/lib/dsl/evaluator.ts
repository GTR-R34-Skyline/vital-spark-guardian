// Rule evaluator — walks AST against a vitals reading
import { Expr, RuleAST } from "./parser";

export interface VitalsContext {
  heart_rate: number;
  hr: number;
  spo2: number;
  temperature: number;
  temp: number;
  [key: string]: number;
}

export function buildContext(v: { hr: number; spo2: number; temp: number }): VitalsContext {
  return {
    heart_rate: v.hr,
    hr: v.hr,
    spo2: v.spo2,
    temperature: v.temp,
    temp: v.temp,
  };
}

export function evalExpr(expr: Expr, ctx: VitalsContext): boolean {
  if (expr.type === "comparison") {
    const lhs = ctx[expr.field.toLowerCase()];
    if (lhs === undefined) return false;
    switch (expr.op) {
      case ">":
        return lhs > expr.value;
      case "<":
        return lhs < expr.value;
      case ">=":
        return lhs >= expr.value;
      case "<=":
        return lhs <= expr.value;
      case "==":
        return lhs === expr.value;
      case "!=":
        return lhs !== expr.value;
    }
  }
  if (expr.op === "AND") return evalExpr(expr.left, ctx) && evalExpr(expr.right, ctx);
  return evalExpr(expr.left, ctx) || evalExpr(expr.right, ctx);
}

export function evaluateRule(ast: RuleAST, vitals: { hr: number; spo2: number; temp: number }) {
  const ctx = buildContext(vitals);
  const triggered = evalExpr(ast.condition, ctx);
  return { triggered, level: triggered ? ast.level : null };
}
