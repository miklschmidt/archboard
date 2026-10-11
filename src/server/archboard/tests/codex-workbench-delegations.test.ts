import { expect, test } from "bun:test";

import {
	createIdentityAuthorities,
	type TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import { MAX_DELEGATIONS, recordDelegations } from "../codex-workbench-adapters.js";

test("a delegate's workhorse turn is recorded against the coordinator turn that asked, and a steer's is not", () => {
	const { decoder } = createIdentityAuthorities().identity;
	const delegations = new Map<TurnId, TurnId>();
	const record = recordDelegations(delegations);
	const coordinatorTurnId = decoder.adoptTurnId("voice-turn");
	const turnId = decoder.adoptTurnId("work-turn");

	// A queued delegate has no workhorse turn yet; a steer's turn is somebody else's.
	record({ operation: "delegate_to_workhorse", correlation: { turnId: null, coordinatorTurnId } });
	record({ operation: "steer_workhorse", correlation: { turnId, coordinatorTurnId } });
	record({ operation: "manage_workhorse_queue", correlation: { turnId, coordinatorTurnId } });
	expect(delegations.size).toBe(0);

	record({ operation: "delegate_to_workhorse", correlation: { turnId, coordinatorTurnId } });
	expect([...delegations]).toEqual([[turnId, coordinatorTurnId]]);
});

test("a session remembers its newest delegations only", () => {
	const { decoder } = createIdentityAuthorities().identity;
	const delegations = new Map<TurnId, TurnId>();
	const record = recordDelegations(delegations);
	const coordinatorTurnId = decoder.adoptTurnId("voice-turn");
	const turnIds = Array.from({ length: MAX_DELEGATIONS + 5 }, (_, index) =>
		decoder.adoptTurnId(`work-turn-${index}`),
	);
	for (const turnId of turnIds) {
		record({ operation: "delegate_to_workhorse", correlation: { turnId, coordinatorTurnId } });
	}

	expect(delegations.size).toBe(MAX_DELEGATIONS);
	expect([...delegations.keys()]).toEqual(turnIds.slice(5));
});
