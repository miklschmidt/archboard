import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import type { BrowserGatewayMessage } from "#shared/protocol/gateway-envelope.ts";
import type {
	BrowserOwnerProjection,
	CodexTimelineProjectionInput,
} from "#server/protocol/projection/projection-contract.ts";
import { createGatewayHarness } from "#tests/server/support/gateway/support.ts";

type Authorities = ReturnType<typeof createIdentityAuthorities>;

function timelineOf(
	authorities: Authorities,
	threadId: CodexTimelineProjectionInput["threadId"],
	turnIds: readonly string[],
): CodexTimelineProjectionInput {
	const decoder = authorities.identity.decoder;
	return {
		kind: "codex_timeline",
		threadId,
		turns: turnIds.map((id) => ({
			turn: {
				id: decoder.adoptTurnId(id),
				status: "completed",
				startedAt: null,
				completedAt: null,
				durationMs: null,
			},
			items: [],
			presentation: { summary: "A turn.", outputs: { included: true, truncated: false } },
			error: null,
			plan: null,
		})),
		cursor: null,
		usage: null,
	};
}

test("the coordinator's turns ride the snapshot, and only the recorded workhorse turn names its delegator", () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const coordinatorThread = decoder.adoptThreadId("coordinator-thread");
	const voiceTurn = decoder.adoptTurnId("voice-turn");
	let owned: Pick<BrowserOwnerProjection, "coordinatorTimeline"> = { coordinatorTimeline: null };
	const value = createGatewayHarness(authorities, undefined, undefined, {
		project: (owner) => ({
			...owner,
			timeline: timelineOf(authorities, value.threadId, ["delegated-turn", "typed-turn"]),
			coordinator: { ...owner.coordinator, state: "ready", threadId: coordinatorThread },
			delegations: new Map([[decoder.adoptTurnId("delegated-turn"), voiceTurn]]),
			...owned,
		}),
	});
	const connection = value.open();
	const messages: BrowserGatewayMessage[] = [];
	connection.subscribe((message) => void messages.push(message));
	const first = connection.snapshot().snapshot;

	const [delegated, typed] = first.timeline?.turns ?? [];
	expect(delegated?.delegatedBy).toBe(voiceTurn);
	expect(typed?.delegatedBy ?? null).toBeNull();
	expect(first.coordinatorTimeline).toBeNull();

	owned = { coordinatorTimeline: timelineOf(authorities, coordinatorThread, ["voice-turn"]) };
	value.emitProjectionChange();

	const delta = messages[0];
	if (delta?.kind !== "delta") {
		throw new Error("the coordinator's turns did not arrive as a delta");
	}
	expect(Object.keys(delta.delta)).toEqual(["coordinatorTimeline"]);
	expect(connection.snapshot().snapshot.coordinatorTimeline).toMatchObject({
		threadId: coordinatorThread,
		turns: [{ turnId: voiceTurn }],
	});
});
