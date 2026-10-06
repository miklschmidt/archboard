// How long the code check waits for Git (ADR 0046). The check runs only on a
// request, so this pulls against a request that waits, never against a timer.

/**
 * Outer bound for the one `git ls-files` with which the code check lists the
 * files of a checkout. It listed the 3,272 files of this repository in 5 ms on
 * 2026-10-06, so it bounds a Git that hangs, such as one on a stalled network
 * file system, and never a listing that is slow. Nothing else bounds the pass:
 * `archboard check --code` waits for the answer with no timeout of its own.
 * It matches HISTORY_LENS_GIT_TIMEOUT_MS, which bounds the Git of behind that
 * runs beside it in the same request. The request that started the pass, or a
 * stop, ends the listing sooner.
 */
const CODE_CHECK_GIT_TIMEOUT_MS = 60_000;

export { CODE_CHECK_GIT_TIMEOUT_MS };
