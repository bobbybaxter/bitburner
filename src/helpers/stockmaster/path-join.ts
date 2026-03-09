/** Joins all arguments as components in a path, e.g. pathJoin("foo", "bar", "/baz") = "foo/bar/baz" **/
export function pathJoin(...args: (string | undefined)[]): string {
  return args
    .filter((s) => !!s)
    .join('/')
    .replace(/\/\/+/g, '/');
}
