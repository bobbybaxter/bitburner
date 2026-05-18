/**
 * Wrap tokens for Bitburner's terminal when they contain `;` or whitespace.
 * splitCommands() treats `;` as a command separator unless inside quoted segments.
 * @see https://github.com/bitburner-official/bitburner-src/blob/dev/src/Terminal/Parser.ts
 */
export function quoteTerminalToken(token: string): string {
  if (!/[;\s]/.test(token)) return token;
  if (!token.includes('"')) return `"${token}"`;
  if (!token.includes("'")) return `'${token}'`;
  return `"${token.replace(/"/g, '')}"`;
}
