// The published half of timing's tables: the durations, waits and pauses that
// the code of the published packages reaches. A published build carries this
// half alone (host.ts), so each wait and pause here names only durations of
// this half, and the types hold it to that.

import {
	CODEX_APPROVAL_MS,
	CODEX_PROCESS_MS,
	CODEX_REALTIME_MS,
	CODEX_SESSION_MS,
} from "#shared/constants/codex.ts";
import { PROCESS_GROUP_MS } from "#shared/constants/process-groups.ts";
import type { NameOf, PausePolicy, WaitPolicy } from "#shared/tables/rules/shape.ts";

/** Each published group under the name its durations start with. */
const PUBLISHED_GROUPS = Object.freeze({
	codexApproval: CODEX_APPROVAL_MS,
	codexProcess: CODEX_PROCESS_MS,
	codexRealtime: CODEX_REALTIME_MS,
	codexSession: CODEX_SESSION_MS,
	processGroup: PROCESS_GROUP_MS,
});

/** A duration of the published half. */
type PublishedName = NameOf<typeof PUBLISHED_GROUPS>;

/** The published polls. */
const PUBLISHED_WAITS = Object.freeze({
	/** A killed Codex process group drains, until its caller's composed deadline. */
	"processGroup.killDrain": {
		cadence: "processGroup.poll",
		check: "beforeProbe",
		sleep: "cutOrSkip",
	},
} satisfies Record<string, WaitPolicy<PublishedName>>);

/** The published pauses. */
const PUBLISHED_PAUSES = Object.freeze({
	/** A process group is sampled again while it freezes. */
	"processGroup.poll": {},
	/** A workhorse stop reads its work tree again. */
	"codexSession.workTreeStopPoll": {},
} satisfies Partial<Record<PublishedName, PausePolicy>>);

export { PUBLISHED_GROUPS, PUBLISHED_PAUSES, PUBLISHED_WAITS };
