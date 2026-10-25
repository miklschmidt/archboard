import { expect, test } from "bun:test";

import { createIdentityAuthorities, type TurnId } from "@archboard/codex-app-server/identity";
import {
	coordinatorTurnsShownIn,
	MAX_DELEGATIONS,
	noteCoordinatorTurnStart,
	recordDelegations,
	recordGivenWork,
	type CoordinatorTurnHome,
} from "#server/services/sessions/delegations.ts";

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

const PAYMENTS = "/work/payments";
const SHOP = "/work/shop";
const DOCS = "/work/docs";

test("a coordinator turn shows where it gave work, else where the tab was when it started, and an unknown turn everywhere", () => {
	const { decoder } = createIdentityAuthorities().identity;
	const homes = new Map<TurnId, CoordinatorTurnHome>();
	const [gave, spoke, idle, unknown] = ["gave", "spoke", "idle", "unknown"].map((raw) =>
		decoder.adoptTurnId(raw),
	) as [TurnId, TurnId, TurnId, TurnId];
	const started = (turn: string, shown: string | null) =>
		noteCoordinatorTurnStart(
			homes,
			{ notification: { method: "turn/started", params: { turn: { id: turn } } } } as never,
			decoder,
			() => shown,
		);
	const work = (
		checkout: string,
		operation: string,
		queueOperation: string | null,
		turn: TurnId,
		outcome = "delivered",
	) =>
		recordGivenWork(
			homes,
			checkout,
		)({
			operation,
			queueOperation,
			outcome,
			correlation: { coordinatorTurnId: turn },
		} as never);

	started("gave", SHOP);
	work(PAYMENTS, "delegate_to_workhorse", null, gave);
	work(DOCS, "manage_workhorse_queue", "add", gave);
	started("spoke", SHOP);
	// Deleting what waits gives nobody work, and neither does a delegation that never reached its
	// workhorse.
	work(PAYMENTS, "manage_workhorse_queue", "delete", spoke);
	work(DOCS, "delegate_to_workhorse", null, spoke, "pending");
	work(DOCS, "delegate_to_workhorse", null, spoke, "not_delivered");
	started("idle", null);

	const shownIn = (checkout: string) =>
		[gave, spoke, idle, unknown].filter(coordinatorTurnsShownIn(homes, checkout));
	expect(shownIn(PAYMENTS)).toEqual([gave, idle, unknown]);
	expect(shownIn(DOCS)).toEqual([gave, idle, unknown]);
	expect(shownIn(SHOP)).toEqual([spoke, idle, unknown]);
});

test("a session remembers where its newest coordinator turns show only", () => {
	const { decoder } = createIdentityAuthorities().identity;
	const homes = new Map<TurnId, CoordinatorTurnHome>();
	const record = recordGivenWork(homes, PAYMENTS);
	const turnIds = Array.from({ length: MAX_DELEGATIONS + 5 }, (_, index) =>
		decoder.adoptTurnId(`voice-turn-${index}`),
	);
	for (const coordinatorTurnId of turnIds) {
		record({
			operation: "steer_workhorse",
			queueOperation: null,
			outcome: "delivered",
			correlation: { coordinatorTurnId },
		} as never);
	}

	expect([...homes.keys()]).toEqual(turnIds.slice(5));
});
