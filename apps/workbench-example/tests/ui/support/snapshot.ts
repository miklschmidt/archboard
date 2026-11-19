import { browserIdentities } from "#tests/ui/support/browser-identities.ts";
import { type BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";
import { createCodexBrowserModel } from "@archboard/codex-realtime-voice/contract";

/** The spoken-approval state of a snapshot with no spoken approval in flight. */
const IDLE_SPOKEN_APPROVAL: BrowserSnapshot["spokenApproval"] = Object.freeze({
	kind: "spoken_approval",
	state: "idle",
	approval: null,
	gate: null,
	capturedUserFinal: null,
	settlement: null,
	reason: null,
});

const ids = browserIdentities();
const model = createCodexBrowserModel();
const thread = ids.thread("example-workhorse");
const turn = ids.turn("example-turn");

/**
 * Build a schema-checked page fixture with an optional running turn.
 * @param running Whether repository work runs.
 * @returns The current workhorse projection.
 */
function exampleSnapshot(running = false): BrowserSnapshot {
	return model.BrowserSnapshotSchema.parse({
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: ids.child,
			epoch: ids.epoch,
			threadId: thread,
			sourcePresentation: "standard",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		timeline: running
			? {
					kind: "timeline",
					threadId: thread,
					nextCursor: null,
					usage: null,
					turns: [
						{
							turnId: turn,
							status: "inProgress",
							items: [],
							summary: "Working",
							outputsIncluded: true,
							outputsTruncated: false,
							startedAtMs: null,
							completedAtMs: null,
							durationMs: null,
							error: null,
							plan: null,
						},
					],
				}
			: null,
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		contextDelivery: null,
		coordinator: {
			kind: "coordinator",
			state: "unbound",
			threadId: null,
			activeTurnId: null,
			configuredModel: null,
			configuredEffort: null,
			model: null,
			effort: null,
			serviceTier: null,
			reason: null,
		},
		voice: {
			kind: "voice",
			state: "ready",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: null,
		},
		spokenApproval: IDLE_SPOKEN_APPROVAL,
		lease: null,
		operation: null,
	});
}

/**
 * Build an exact pending command request for the page approval contract.
 * @returns The parsed request.
 */
function commandApproval(): BrowserSnapshot["approvals"][number] {
	return model.BrowserApprovalSchema.parse({
		kind: "approval",
		approvalKind: "command_execution",
		requestId: ids.nextJsonRpcRequest(),
		threadId: thread,
		turnId: turn,
		itemId: null,
		approvalId: null,
		expiresAtMs: Date.now() + 60_000,
		lifecycle: { state: "pending", decision: null, outcome: null, reason: null },
		binding: {
			child: ids.child,
			epoch: ids.epoch,
			link: null,
			target: String(thread),
			effect: "Run a checkout command",
		},
		spoken: { eligible: false, reason: "not_binary" },
		reason: null,
		command: "git status",
		availableDecisions: ["accept", "decline"],
	});
}

/**
 * Parse the terminal request the page receives after its decision settles.
 * @param approval The original pending request.
 * @returns The settled request from the same authority.
 */
function settledApproval(
	approval: BrowserSnapshot["approvals"][number],
): BrowserSnapshot["approvals"][number] {
	return model.BrowserApprovalSchema.parse({
		...approval,
		lifecycle: { state: "settled", decision: "approved", outcome: "delivered", reason: "resolved" },
	});
}

export { exampleSnapshot, commandApproval, settledApproval };
