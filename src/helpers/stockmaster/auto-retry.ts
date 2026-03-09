import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';
import { log } from './log';

// If the argument is an Error instance, returns it as is, otherwise, returns a new Error instance.
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

// Helper to retry something that failed temporarily (can happen when e.g. we temporarily don't have enough RAM to run)
export async function autoRetry<T>(
  ns: NS,
  fnFunctionThatMayFail: () => T | Promise<T>,
  fnSuccessCondition: (result: T) => boolean,
  errorContext: string | (() => string) = 'Success condition not met',
  maxRetries = 5,
  initialRetryDelayMs = 50,
  backoffRate = 3,
  verbose = false,
  tprintFatalErrors = true,
): Promise<T> {
  checkNsInstance(ns, '"autoRetry"');
  let retryDelayMs = initialRetryDelayMs,
    attempts = 0;
  while (attempts++ <= maxRetries) {
    try {
      const result = (await Promise.resolve(fnFunctionThatMayFail())) as T;
      const errorMsg = typeof errorContext === 'string' ? errorContext : errorContext();
      if (!fnSuccessCondition(result)) throw asError(errorMsg);
      return result;
    } catch (caughtError: unknown) {
      const fatal = attempts >= maxRetries;
      const errMsg =
        typeof caughtError === 'string'
          ? caughtError
          : caughtError instanceof Error
            ? caughtError.message
            : JSON.stringify(caughtError);
      log(
        ns,
        `${fatal ? 'FAIL' : 'INFO'}: Attempt ${attempts} of ${maxRetries} failed` +
          (fatal ? `: ${errMsg}` : `. Trying again in ${retryDelayMs}ms...`),
        tprintFatalErrors && fatal,
        !verbose ? undefined : fatal ? 'error' : 'info',
      );
      if (fatal) throw asError(caughtError);
      await ns.sleep(retryDelayMs);
      retryDelayMs *= backoffRate;
    }
  }
  throw new Error('autoRetry: unreachable');
}
