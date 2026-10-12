// The KILL step of the Codex shutdown order in timing.ts (TASK-470).

/**
 * How long KILL waits for the TERMed group to freeze. A group freezes in a few
 * observation polls, but a member in a killable kernel wait never reads as stopped
 * and still dies on KILL. Pulls against the absence-proof second the composed
 * shutdown cap keeps, so a freeze that cannot finish leaves time to prove the
 * killed group gone.
 */
const CODEX_GROUP_FREEZE_MS = 500;

export { CODEX_GROUP_FREEZE_MS };
