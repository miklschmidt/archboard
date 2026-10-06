// How long the code check waits for Git and for language servers (ADR 0046).
// The check runs only on a request, so these pull against a request that
// waits, never against a timer.

/**
 * Outer bound for the one `git ls-files` with which the code check lists the
 * files of a checkout, and for the one with which a language server's row
 * looks for a checkout's Python environment or .NET solution
 * (`listed-files.ts`). It listed the 3,272 files of this repository in 5 ms on
 * 2026-10-06, so it bounds a Git that hangs, such as one on a stalled network
 * file system, and never a listing that is slow. Nothing else bounds the pass:
 * `archboard check --code` waits for the answer with no timeout of its own.
 * It matches HISTORY_LENS_GIT_TIMEOUT_MS, which bounds the Git of behind that
 * runs beside it in the same request. The request that started the pass, or a
 * stop, ends the code check's own listing sooner; a row's look then finishes
 * unawaited, and starts no server.
 */
const CODE_CHECK_GIT_TIMEOUT_MS = 60_000;

/**
 * How long one pass of the code check waits for a language server it started
 * (TASK-367.13). Each one bounds a server that hangs, never one that is slow,
 * and a server that runs past one is stopped and said once as failed, so a
 * pass waits for a hung server at most once. The request that started the
 * pass, or a stop, ends every wait sooner and stops the server at once.
 *
 * - `startMs`: from the spawn to the answer of `initialize`. The `tsc --lsp`
 *   of TypeScript 7.0.2 answered it in 3 to 4 ms on 2026-10-06, before it
 *   reads any project.
 * - `requestMs`: one definition request. The first one also loads the
 *   project: 240 to 300 ms for this repository's 8,733 files on 2026-10-06,
 *   and 200 more requests together took 20 to 25 ms. A project many times
 *   larger stays well inside it.
 * - `stopMs`: from `shutdown` to the end of the process, after which the
 *   server is killed. `tsc --lsp` took 19 to 27 ms.
 */
const LANGUAGE_SERVER_TIMEOUTS = { startMs: 10_000, requestMs: 30_000, stopMs: 2000 } as const;

export { CODE_CHECK_GIT_TIMEOUT_MS, LANGUAGE_SERVER_TIMEOUTS };
