export function cloneDeep<T>(item: T, map = new WeakMap<object, object>()): T {
  // Handling null, undefined, and primitive types
  if (item === null || typeof item !== 'object') {
    return item;
  }

  // Date object
  if (item instanceof Date) {
    return new Date(item.getTime()) as T;
  }

  // Array
  if (Array.isArray(item)) {
    const result: unknown[] = [];
    map.set(item, result);
    for (let i = 0; i < item.length; i++) {
      result.push(cloneDeep(item[i], map));
    }
    return result as T;
  }

  // RegExp object
  if (item instanceof RegExp) {
    const flags = item.flags;
    return new RegExp(item.source, flags) as T;
  }

  // Handling Objects
  if (item instanceof Object) {
    if (map.has(item)) {
      return map.get(item) as T;
    }
    const result: Record<string, unknown> = {};
    map.set(item, result);
    for (const key of Object.keys(item)) {
      result[key] = cloneDeep((item as Record<string, unknown>)[key], map);
    }
    return result as T;
  }

  // If it's a function or a non-constructible object, return it directly.
  return item;
}
