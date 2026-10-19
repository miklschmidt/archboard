import { expect, test } from "bun:test";

import { decodeServerNotification } from "@archboard/codex-app-server/protocol";
import type {
	CodexSession,
	SessionThreadTurnPageResult,
} from "@archboard/codex-app-server/session";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { createServerTimelineOwner } from "#server/projections/timeline/timeline.ts";
import { flush, turnFixture } from "#tests/server/support/timeline/timeline-fixture.ts";

function turnCompleted(
	authorities: ReturnType<typeof createIdentityAuthorities>,
	threadId: string,
): TransportServerNotification {
	return {
		correlation: {
			child: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			requestId: null,
		},
		notification: decodeServerNotification({
			method: "turn/completed",
			params: {
				threadId,
				turn: {
					id: "notified-turn",
					items: [],
					itemsView: "full",
					status: "completed",
					error: null,
					startedAt: 1,
					completedAt: 2,
					durationMs: 1,
				},
			},
		}),
	};
}

test("a target's timeline is read from its own thread, re-read on that thread's news, and re-keyed with the target", async () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const first = decoder.adoptThreadId("coordinator-first");
	const second = decoder.adoptThreadId("coordinator-second");
	const reads: string[] = [];
	const session = {
		threadTurnsListPage: async (
			params: Parameters<CodexSession["threadTurnsListPage"]>[0],
		): Promise<SessionThreadTurnPageResult> => {
			reads.push(params.threadId);
			return {
				data: [turnFixture(authorities, `turn-of-${params.threadId}`, [])],
				nextCursor: null,
				backwardsCursor: null,
			};
		},
		timelineListPage: async () => ({
			data: [],
			nextCursor: null,
			activeRealtimeSessionAtPageStart: null,
		}),
	};
	let changes = 0;
	const owner = createServerTimelineOwner({
		session,
		identity: decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => {
			changes += 1;
		},
	});
	const { childId, epoch } = authorities.identity.validator;
	const target = (threadId: typeof first, key: string) => ({ key, threadId, childId, epoch });
	const connection = {};
	const read = (threadId: typeof first, key: string) =>
		owner.readTarget("pane", target(threadId, key), true, connection);

	expect(read(first, "first")).toBeNull();
	await flush();
	expect(read(first, "first")?.threadId).toBe(first);
	expect(reads).toEqual([first]);

	// Another thread's news, such as the workhorse's, leaves it alone; its own re-reads it.
	owner.onNotification(turnCompleted(authorities, "workhorse-thread"));
	await flush();
	expect(reads).toEqual([first]);
	owner.onNotification(turnCompleted(authorities, decoder.serializeCodexIdentity(first)));
	await flush();
	expect(reads).toEqual([first, first]);
	expect(changes).toBe(2);

	// A new coordinator thread is a new binding: nothing of the first is shown for it.
	expect(read(second, "second")).toBeNull();
	await flush();
	expect(read(second, "second")?.threadId).toBe(second);
	owner.onNotification(turnCompleted(authorities, decoder.serializeCodexIdentity(first)));
	await flush();
	expect(reads).toEqual([first, first, second]);
	owner.onNotification(turnCompleted(authorities, decoder.serializeCodexIdentity(second)));
	await flush();
	expect(reads).toEqual([first, first, second, second]);
	owner.dispose();
});

test("a target read shows only the turns its reader keeps, and every turn to a reader that keeps all", async () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const thread = decoder.adoptThreadId("coordinator");
	const owner = createServerTimelineOwner({
		session: {
			threadTurnsListPage: async (): Promise<SessionThreadTurnPageResult> => ({
				data: [turnFixture(authorities, "turn-one", []), turnFixture(authorities, "turn-two", [])],
				nextCursor: null,
				backwardsCursor: null,
			}),
			timelineListPage: async () => ({
				data: [],
				nextCursor: null,
				activeRealtimeSessionAtPageStart: null,
			}),
		},
		identity: decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => undefined,
	});
	const { childId, epoch } = authorities.identity.validator;
	const target = { key: "coordinator", threadId: thread, childId, epoch };
	const connection = {};
	type Turn = Parameters<typeof decoder.serializeCodexIdentity>[0];
	const turnsShown = (keepTurn?: (turnId: Turn) => boolean) =>
		owner
			.readTarget("pane", target, true, connection, keepTurn)
			?.turns.map(({ turn }) => decoder.serializeCodexIdentity(turn.id));
	turnsShown();
	await flush();

	expect(turnsShown()?.toSorted()).toEqual(["turn-one", "turn-two"]);
	// One conversation shows only the coordinator turns that belong to it (ADR 0050).
	expect(turnsShown((turnId) => decoder.serializeCodexIdentity(turnId) === "turn-two")).toEqual([
		"turn-two",
	]);
	owner.dispose();
});
