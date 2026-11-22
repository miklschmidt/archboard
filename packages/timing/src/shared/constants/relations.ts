// What each duration must stay under or over, as data that one test checks
// (`tests/shared/constants/relations.test.ts`). A side is one duration or the sum of several. The
// reason for each relation is written beside the durations it names.

import type { Wait } from "#shared/constants/waits.ts";

/** One duration, or several that run one after another. */
type Side = Wait | readonly Wait[];

/** `[shorter, "<", longer]`: the left side must stay under the right, or at most it with "<=". */
type Relation = readonly [Side, "<" | "<=", Side];

/** Every relation between two durations that the code relies on. */
const RELATIONS: readonly Relation[] = [
	// A stuck request is refused while `archboard stop` still watches the server.
	["server.mutationDrain", "<", "server.stopConfirm"],
	// A stuck keep-alive is forced closed before the stop's next observation could give up.
	["server.httpStopGrace", "<", "server.stopConfirm"],
	// The pidfile goes once the listener's close finishes, which takes up to the grace.
	["server.httpStopGrace", "<", "server.stopPidfileWait"],
];

export { RELATIONS };
export type { Relation };
