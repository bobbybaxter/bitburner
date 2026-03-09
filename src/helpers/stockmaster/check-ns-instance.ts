import type { NS } from '@ns';

// Returns a helpful error message if we forgot to pass the ns instance to a function
export function checkNsInstance(ns: NS | undefined, fnName = 'this function'): NS {
  if (ns === undefined || !ns.print) throw new Error(`The first argument to ${fnName} should be a 'ns' instance.`);
  return ns;
}
