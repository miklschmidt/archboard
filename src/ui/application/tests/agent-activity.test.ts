import { expect, test } from "bun:test";

import {
	NO_AGENT_ACTIVITY,
	agentBoardChange,
	replaceAgentActivity,
} from "@/ui/application/agent-activity";
import type { AgentActivityEntry, LockHolder } from "@/ui/types";

const CLAIM: LockHolder = {
	id: "agent-1",
	kind: "agent",
	since: "2026-09-06T10:00:00.000Z",
	until: "2026-09-06T10:10:00.000Z",
	process: "codex",
	reason: "redrawing the payment path",
	claimed: true,
};

const WORKING: AgentActivityEntry = {
	board: "Checkout",
	claim: CLAIM,
	doing: {
		doing: "moving the queue",
		at: "2026-09-06T10:01:00.000Z",
		by: "agent-1",
		kind: "agent",
	},
};

test("a snapshot replaces the whole map and an equal snapshot keeps its identity", () => {
	const first = replaceAgentActivity(NO_AGENT_ACTIVITY, [
		WORKING,
		{ ...WORKING, board: "Billing" },
	]);
	expect(Object.keys(first)).toEqual(["Checkout", "Billing"]);
	expect(replaceAgentActivity(first, [{ ...WORKING }, { ...WORKING, board: "Billing" }])).toBe(
		first,
	);
	const moved = replaceAgentActivity(first, [
		{ ...WORKING, doing: { ...WORKING.doing!, doing: "done" } },
	]);
	expect(moved).not.toBe(first);
	expect(Object.keys(moved)).toEqual(["Checkout"]);
	expect(moved["Checkout"]?.doing?.doing).toBe("done");
	expect(replaceAgentActivity(moved, [])).toEqual({});
	expect(replaceAgentActivity(NO_AGENT_ACTIVITY, [])).toBe(NO_AGENT_ACTIVITY);
});

test("the boards an agent picked up and put down are named by comparing snapshots", () => {
	const working = replaceAgentActivity(NO_AGENT_ACTIVITY, [WORKING]);
	const startedBilling = agentBoardChange(working, [WORKING, { ...WORKING, board: "Billing" }]);
	expect(startedBilling.started).toEqual(["Billing"]);
	expect(startedBilling.settled).toEqual([]);

	const finished = agentBoardChange(working, []);
	expect(finished.started).toEqual([]);
	expect(finished.settled).toEqual(["Checkout"]);

	// A board an agent is still on says nothing, however much its line changed.
	const stillWorking = agentBoardChange(working, [
		{ ...WORKING, doing: { ...WORKING.doing!, doing: "still moving the queue" } },
	]);
	expect(stillWorking).toEqual({ started: [], settled: [] });
});
