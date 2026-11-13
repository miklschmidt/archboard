import { describe, expect, test } from "bun:test";

import { createTextUserInput } from "#runtime/host/turn-input/rules/text-input.ts";
import type { SessionThread, SessionTurn } from "@archboard/codex-app-server/session";
import type { IdentityAuthority } from "@archboard/codex-app-server/identity";
import { useFixtureGroup } from "#tests/runtime/workhorses/workhorse-operations/operations/fixture-group.ts";
import { turn } from "#tests/runtime/workhorses/workhorse-operations/operations/support.ts";

const fixture = useFixtureGroup();

/** A running turn as thread/turns/list returns it in its summary view. */
function runningTurn(identity: IdentityAuthority, rawId: string): SessionTurn {
	const item = (raw: string) => identity.decoder.adoptItemId(`${rawId}-${raw}`);
	return {
		...turn(identity, rawId, "inProgress"),
		itemsView: "summary",
		items: [
			{
				type: "userMessage",
				id: item("request"),
				clientId: null,
				content: [createTextUserInput("Rename the queue owner")],
			},
			{ type: "agentMessage", id: item("plan"), text: "Reading the queue module." },
			{ type: "agentMessage", id: item("next"), text: "Spawning a reviewer." },
		] as unknown as SessionTurn["items"],
	};
}

/** A sub-agent as thread/list returns it. */
function subAgent(identity: IdentityAuthority, rawId: string): SessionThread {
	return {
		id: identity.decoder.adoptThreadId(rawId),
		status: { type: "active", activeFlags: [] },
	} as unknown as SessionThread;
}

describe("workhorse inspection", () => {
	test("reports the turn thread/turns/list names, though the thread summary carries no turns", async () => {
		// The October 7 incident: inspection read the summary's empty turns and reported an
		// active workhorse with no turn, and the coordinator claimed a stop it never sent.
		const h = fixture();
		try {
			h.setStatus("active", [
				turn(h.identity, "earlier", "completed"),
				runningTurn(h.identity, "workhorse-turn"),
			]);
			h.session.subAgents = [subAgent(h.identity, "child-thread")];
			const call = h.setCall("inspect_workhorse");
			const inspected = await h.operations.inspect({ call });

			expect(inspected).toMatchObject({
				status: "active",
				activeTurnId: h.identity.decoder.adoptTurnId("workhorse-turn"),
				request: "Rename the queue owner",
				recentProgress: ["Reading the queue module.", "Spawning a reviewer."],
				subAgents: [
					{ threadId: h.identity.decoder.adoptThreadId("child-thread"), status: "active" },
				],
				queuedSubmissionIds: [],
				unavailable: [],
			});
			expect(inspected.activeTurnId).not.toBe(call.turnId);
		} finally {
			h.cleanup();
		}
	});

	test("names each read that failed as unavailable instead of reporting nothing", async () => {
		const h = fixture();
		try {
			h.setStatus("active");
			h.session.turnsError = new Error("the turn page failed");
			h.session.subAgentsError = new Error("the thread list failed");
			h.queue.list = async () => {
				throw new Error("the queue read failed");
			};
			const inspected = await h.operations.inspect({ call: h.setCall("inspect_workhorse") });

			expect(inspected).toMatchObject({
				activeTurnId: null,
				subAgents: [],
				queuedSubmissionIds: [],
				unavailable: ["queue", "subAgents", "turns"],
			});
		} finally {
			h.cleanup();
		}
	});
});
