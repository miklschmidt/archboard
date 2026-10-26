import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { type BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";
import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
} from "@archboard/codex-realtime-voice/schemas";

const authorities = createIdentityAuthorities();
const model = createCodexBrowserModel(authorities);
const { decoder, issuer, validator } = authorities.identity;
const thread = decoder.adoptThreadId("example-workhorse");
const turn = decoder.adoptTurnId("example-turn");

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
			childId: validator.childId,
			epoch: validator.epoch,
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
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
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
		requestId: issuer.mintJsonRpcRequestId(),
		threadId: thread,
		turnId: turn,
		itemId: null,
		approvalId: null,
		expiresAtMs: Date.now() + 60_000,
		lifecycle: { state: "pending", decision: null, outcome: null, reason: null },
		binding: {
			child: validator.childId,
			epoch: validator.epoch,
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
