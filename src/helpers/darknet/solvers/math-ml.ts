import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

function cleanArithmeticExpression(expression: string): string {
  return expression
    .replaceAll('ҳ', '*')
    .replaceAll('÷', '/')
    .replaceAll('➕', '+')
    .replaceAll('➖', '-')
    .replace(/[^0-9+\-*/(). ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSimpleArithmeticExpression(expression: string): number {
  const tokens = cleanArithmeticExpression(expression).split('');

  let currentDepth = 0;
  const depth = tokens.map((token) => {
    if (token === '(') {
      currentDepth += 1;
    } else if (token === ')') {
      currentDepth -= 1;
      return currentDepth + 1;
    }
    return currentDepth;
  });

  const depth1Start = depth.indexOf(1);
  const firstZeroAfterDepth1Start = depth.indexOf(0, depth1Start);
  const depth1End = firstZeroAfterDepth1Start === -1 ? depth.length - 1 : firstZeroAfterDepth1Start - 1;
  if (depth1Start !== -1) {
    const subExpression = tokens.slice(depth1Start + 1, depth1End).join('');
    const result = parseSimpleArithmeticExpression(subExpression);
    tokens.splice(depth1Start, depth1End - depth1Start + 1, result.toString());
    return parseSimpleArithmeticExpression(tokens.join(''));
  }

  let remainingExpression = tokens.join('');
  const multiplicationDivisionRegex = /(-?\d*\.?\d+) *([*/]) *(-?\d*\.?\d+)/;
  let match = remainingExpression.match(multiplicationDivisionRegex);

  while (match) {
    const left = match[1];
    const operator = match[2];
    const right = match[3];
    const result = operator === '*' ? parseFloat(left) * parseFloat(right) : parseFloat(left) / parseFloat(right);
    const resultString = Math.abs(result) < 0.000001 ? result.toFixed(20) : result.toString();
    remainingExpression = remainingExpression.replace(match[0], resultString);
    match = remainingExpression.match(multiplicationDivisionRegex);
  }

  const additionSubtractionRegex = /(-?\d*\.?\d+) *([+-]) *(-?\d*\.?\d+)/;
  match = remainingExpression.match(additionSubtractionRegex);

  while (match) {
    const left = match[1];
    const operator = match[2];
    const right = match[3];
    const result = operator === '+' ? parseFloat(left) + parseFloat(right) : parseFloat(left) - parseFloat(right);
    remainingExpression = remainingExpression.replace(match[0], result.toString());
    match = remainingExpression.match(additionSubtractionRegex);
  }

  const leftover = remainingExpression.match(/(-?\d*\.?\d+)/)?.[1] ?? '';
  return parseFloat(leftover);
}

function inferMathMLPassword(details: ReturnType<NS['dnet']['getServerDetails']>): string | null {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const cleaned = cleanArithmeticExpression(details.data ?? '');
  if (!cleaned) return null;
  const evaluated = parseSimpleArithmeticExpression(cleaned);
  if (!Number.isFinite(evaluated)) return null;
  const candidate = String(evaluated);
  return candidate.length === details.passwordLength ? candidate : null;
}

export async function solveMathML(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerDetails(hostname);
  const password = inferMathMLPassword(details);
  if (!password) {
    return {
      hostname,
      modelId: 'MathML',
      guessed: false,
      success: false,
      message: 'Could not evaluate arithmetic expression from auth data',
      shouldCaptureHeartbleed: true,
    };
  }

  const result = await ns.dnet.authenticate(hostname, password);
  return {
    hostname,
    modelId: 'MathML',
    guessed: true,
    success: result.success,
    password: result.success ? password : undefined,
    message: result.message,
    shouldCaptureHeartbleed: !result.success,
  };
}
