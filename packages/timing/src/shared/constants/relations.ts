// What each duration must stay under or over, as data that one test checks
// (`tests/shared/constants/relations.test.ts`). A side is one duration or the sum of several. The
// reason for each relation is written beside the durations it names.

import type { Wait } from "#shared/constants/waits.ts";

/** One duration, or several that run one after another. */
type Side = Wait | readonly Wait[];

/**
 * `[shorter, "<", longer]`: the left side must stay under the right, at most it with "<=", or as
 * long as it with "=", where one length serves two uses.
 */
type Relation = readonly [Side, "<" | "<=" | "=", Side];

/** Every relation between two durations that the code relies on. */
const RELATIONS: readonly Relation[] = [
	// A stuck request is refused while `archboard stop` still watches the server.
	["server.mutationDrain", "<", "server.stopConfirm"],
	// A stuck keep-alive is forced closed before the stop's next observation could give up.
	["server.httpStopGrace", "<", "server.stopConfirm"],
	// The pidfile goes once the listener's close finishes, which takes up to the grace.
	["server.httpStopGrace", "<", "server.stopPidfileWait"],
	// One cleanup grace serves the three waits on a terminated Git group.
	["git.groupCleanup", "=", "git.groupGone"],
	["git.groupCleanup", "=", "git.groupFreeze"],
	// Failed cleanup is diagnosed before the command timeout would be.
	["git.groupCleanup", "<", "git.command"],
	// An interrupted CLI never pre-empts Git's termination and its absence proof, plus a margin.
	[["git.groupCleanup", "git.groupGone", "git.groupCleanup"], "<=", "git.cliInterruptCleanup"],
	// Two network fetches and three local commands of a running fetch end before its directory is stale.
	[
		["check.vaultFetch", "check.vaultFetch", "git.command", "git.command", "git.command"],
		"<",
		"check.fetchIncomingStale",
	],
	// Realtime stop, stdin EOF and TERM leave time inside the composed cap to freeze and prove the group gone.
	[["codex.stdinEofGrace", "codex.termGrace", "codex.groupFreeze"], "<", "codex.composedShutdown"],
	// A killed group's drain runs for the rest of the composed cap, which ends it first.
	["codex.killDrain", "=", "codex.composedShutdown"],
	// Chromium's port arrives inside its start, and a page opens within as long.
	["chromium.devToolsPort", "=", "chromium.start"],
	["chromium.openPage", "=", "chromium.start"],
	// Stopping Chromium takes two phases, inside the CLI's interrupt grace with room to remove its profile.
	[["chromium.groupExit", "chromium.groupExit"], "<", "git.cliInterruptCleanup"],
	// A job's document loads inside the job's bound, and a DevTools call fits inside a job.
	["raster.documentLoad", "=", "raster.job"],
	["chromium.call", "<=", "raster.job"],
];

export { RELATIONS };
export type { Relation };
