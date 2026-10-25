import { expect, test } from "bun:test";

import { SHELL_CLOCK_MS } from "@archboard/timing";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import type { AgentSetupSnapshot } from "#ui/state/agent-setup/setup.ts";
import type { HeldMessage } from "#ui/state/agent-setup/held.ts";
import { agentStatus } from "#ui/rules/dock/agent-status.ts";
import type { AgentView } from "#ui/state/surfaces/contracts.ts";
import type { ConversationTurn } from "#ui/state/timeline/contract.ts";

const { decoder } = createIdentityAuthorities().identity;
const threadId = decoder.adoptThreadId("thread-status");

const READY: AgentSetupSnapshot = {
	phase: { kind: "ready", linked: true },
	held: [],
	talk: "idle",
	step: null,
	failure: null,
	talkFailure: null,
};

/**
 * A turn.
 * @param id Its id.
 * @param outcome How it stands.
 * @returns The turn.
 */
function turn(id: string, outcome: ConversationTurn["outcome"]): ConversationTurn {
	return {
		id,
		owner: "workhorse",
		threadId,
		turnId: decoder.adoptTurnId(id),
		outcome,
		items: [],
		startedAtMs: 1_000,
		completedAtMs: outcome === "running" ? null : 2_000,
		durationMs: null,
		error: outcome === "failed" ? { message: "Rate limit reached.", details: null } : null,
		plan: { explanation: null, steps: [{ step: `Plan of ${id}`, status: "inProgress" }] },
		delegatedBy: null,
	};
}

/** A voice that is not on: it never makes a sound. */
const SILENT = {
	/**
	 * The level of a voice that is not on.
	 * @returns Silence.
	 */
	read: (): number => 0,
	/**
	 * Nothing to hear.
	 * @returns How to stop hearing nothing.
	 */
	subscribe: (): (() => void) => () => undefined,
};

/**
 * An agent view.
 * @param parts What differs from a ready, empty agent.
 * @param parts.setup The setup's differences.
 * @param parts.turns The workhorse's turns.
 * @param parts.coordinatorTurns The voice coordinator's turns.
 * @param parts.failure Why the conversation cannot be read.
 * @param parts.lastProgressAtMs When the running turn last changed.
 * @returns The view.
 */
function view(parts: {
	readonly setup?: Partial<AgentSetupSnapshot>;
	readonly turns?: readonly ConversationTurn[];
	readonly coordinatorTurns?: readonly ConversationTurn[];
	readonly failure?: string | null;
	readonly lastProgressAtMs?: number | null;
}): AgentView {
	return {
		setup: { ...READY, ...parts.setup },
		snapshot: null,
		conversation: {
			snapshot: null,
			turns: parts.turns ?? [],
			coordinatorTurns: parts.coordinatorTurns ?? [],
			failure: parts.failure ?? null,
		},
		voice: { stage: "idle", problem: null, busy: false, level: SILENT },
		context: { board: "payments", state: null },
		busyApprovals: [],
		approvalErrors: {},
		lastProgressAtMs: parts.lastProgressAtMs ?? null,
	};
}

/**
 * A held message.
 * @param state Where it stands.
 * @returns The message.
 */
function held(state: HeldMessage["state"]): HeldMessage {
	return { id: "h1", text: "Explain", queue: false, state, reason: "refused", turnId: null };
}

test("setup outranks the conversation: an unavailable Codex says so over a running turn", () => {
	const status = agentStatus(
		view({
			setup: { phase: { kind: "unavailable", reason: "down" } },
			turns: [turn("t1", "running")],
		}),
		5_000,
	);
	expect(status.tone).toBe("failed");
	expect(status.action).toBeNull();
});

test("the newest running turn is the one the bar follows, with its plan step and clock", () => {
	const status = agentStatus(
		view({ turns: [turn("t1", "running"), turn("t2", "running")] }),
		5_000,
	);
	expect(status).toMatchObject({
		tone: "working",
		detail: "Plan of t2",
		sinceMs: 1_000,
		action: "stop",
	});
	expect(status.progress).toEqual({ done: 0, total: 1 });
});

test("a turn that reports nothing for long enough reads as quiet", () => {
	const now = 1_000 + SHELL_CLOCK_MS.quiet + 1;
	expect(
		agentStatus(view({ turns: [turn("t1", "running")], lastProgressAtMs: 1_000 }), now).quiet,
	).toBe(true);
	expect(
		agentStatus(view({ turns: [turn("t1", "running")], lastProgressAtMs: now - 1 }), now).quiet,
	).toBe(false);
});

test("a message that did not arrive outranks the last turn's ending", () => {
	for (const state of ["failed", "unknown"] as const) {
		const status = agentStatus(
			view({ setup: { held: [held(state)] }, turns: [turn("t1", "completed")] }),
			5_000,
		);
		expect(status).toMatchObject({ tone: "failed", action: "show" });
	}
});

test("a conversation that cannot be read fails loudly instead of reading as ready", () => {
	expect(agentStatus(view({ failure: "duplicate item" }), 5_000)).toMatchObject({
		tone: "failed",
		action: "show",
	});
	expect(agentStatus(view({}), 5_000)).toMatchObject({ tone: "quiet", action: null });
});

test("a failed turn offers to show why", () => {
	expect(agentStatus(view({ turns: [turn("t1", "failed")] }), 5_000)).toMatchObject({
		tone: "failed",
		detail: "Rate limit reached.",
		endedAtMs: 2_000,
	});
});

test("the voice coordinator's turns never make the agent look busy", () => {
	const coordinator: ConversationTurn = { ...turn("c1", "running"), owner: "coordinator" };
	expect(agentStatus(view({ coordinatorTurns: [coordinator] }), 5_000)).toMatchObject({
		tone: "quiet",
		action: null,
	});
});
