import { expect, test } from "bun:test";

import { createProcessGroupCleanup } from "#runtime/processes/group-cleanup.ts";

test("TERM cleanup waits for proof when the process group briefly cannot be observed", async () => {
	const identity = { leaderPid: 41, pgid: 41, leaderStartTime: "leader" };
	const signals: NodeJS.Signals[] = [];
	let lookedAfterTerm = false;
	const cleanup = createProcessGroupCleanup(
		{
			capture: () => identity,
			inspect: () => {
				if (signals.length === 0) return "owned";
				if (lookedAfterTerm) return "quiescent";
				lookedAfterTerm = true;
				return "unproven";
			},
			members: () => [],
			signal: (_identity, signal) => {
				signals.push(signal);
			},
		},
		{ failure: (message) => new Error(message), safeCauseMessage: String },
	);
	await expect(
		cleanup.cleanup({ identity, signal: new AbortController().signal }),
	).resolves.toBeUndefined();
	expect(signals).toEqual(["SIGTERM"]);
});
