/** In order to pass in args to pass along to the startup/completion script, they may have to be quoted, when given as
 * parameters to this script, but those quotes will have to be stripped when passing these along to a subsequent script as raw strings.
 * @param {string[]} args - The the array-argument passed to the script.
 * @returns {string[]} The the array-argument unescaped (or deserialized if a single argument starting with '[' was supplied]). */
export function unEscapeArrayArgs(args: string[]): string[] {
  // For convenience, also support args as a single stringified array
  if (args.length == 1 && args[0].startsWith('[')) return JSON.parse(args[0]);
  // Otherwise, args wrapped in quotes should have those quotes removed.
  const escapeChars = ['"', "'", '`'];
  return args.map((arg: string) =>
    escapeChars.some((c) => arg.startsWith(c) && arg.endsWith(c)) ? arg.slice(1, -1) : arg,
  );
}
