// The checks `archboard check` runs (ADR 0057). The code check and its language
// servers wait until they finish or their caller cancels them, so only their
// cleanup has a deadline (TASK-436.02). The embeds check fetches the vault of a
// repository that this machine has no checkout of, over the network.

import { durations } from "#shared/constants/durations.ts";

/** `CHECK_MS.vaultFetch`, named once so that the stale age can be a number of fetches. */
const VAULT_FETCH_MS = 60_000;

/** The code check's language servers and the embeds check's fetches. */
const CHECK_MS = durations({
	/**
	 * From shutdown to process exit, then kill the server and its process group.
	 * No further answer is needed during cleanup. TypeScript 7.0.2 took 19 to 27 ms
	 * on 2026-10-06; 2 seconds lets normal shutdown finish before escalation.
	 */
	languageServerStop: 2000,
	/**
	 * Outer bound for one network Git command of the embeds check: asking a remote
	 * where its default branch is, or fetching that commit's vault shallow and
	 * sparse. It pulls against two things. A CI run must end when a remote never
	 * answers: Git is told never to prompt for credentials, so a wait this long is
	 * a stalled connection, not a person typing. And the `.archboard/vault`
	 * directory of one commit, a few megabytes at most, must still arrive over a
	 * slow link. A command past it counts as a failed fetch, and the check reads
	 * the cache.
	 */
	vaultFetch: VAULT_FETCH_MS,
	/**
	 * Age past which a fetch's `.incoming-` directory in the cache was left by a
	 * check that was killed, and is removed. It pulls against the longest fetch
	 * still running: two network commands of `vaultFetch` and three local ones of
	 * `GIT_MS.command`, each shorter than a network one. A directory is never
	 * younger than its last change, so one this old is no running fetch's.
	 */
	fetchIncomingStale: 3 * VAULT_FETCH_MS,
});

export { CHECK_MS };
