import { afterEach, expect, test } from "bun:test";

import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	CODEX_APPROVAL_EXPIRY_MS,
	createCodexBrowserModel,
	type BrowserDynamicApproval,
} from "@/shared/codex-browser-model";
import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import {
	createBrowserWorkbenchTransport,
	type BrowserCommandDraft,
} from "@/ui/workbench-transport";
import {
	FakeSocket,
	clockAt,
	createTransportTracker,
	errorCode,
	rejection,
	type FakeSocketRequest,
	type WireRecord,
} from "@/ui/workbench-transport/tests/fake-socket";

const authorities = createIdentityAuthorities();
const model = createCodexBrowserModel(authorities);
const childId = authorities.identity.validator.childId;
const epoch = authorities.identity.validator.epoch;
const threadId = authorities.identity.decoder.adoptThreadId("thread-a");
const turnId = authorities.identity.decoder.adoptTurnId("turn-a");
const callId = authorities.identity.decoder.adoptDynamicToolCallId("call-a");
const operationId = authorities.operation.issuer.mintOperationId();
const identity = model.DynamicApprovalIdentitySchema.parse({
	child: childId,
	epoch,
	threadId,
	turnId,
	callId,
	namespace: "archboard_app",
	tool: "send_message_to_thread",
	manifestHash: "manifest-a",
	operationId,
});
const effect = model.DynamicApprovalEffectSchema.parse({
	tool: "send_message_to_thread",
	arguments: { threadId, prompt: "send the reviewed message" },
	callerAuthority: "caller-authority",
	targetAuthority: "target-authority",
	contextAuthority: "context-authority",
	effectiveBoundary: null,
	mutationOperationId: operationId,
	initialTurnOperationId: null,
	visualSummary: "Send the reviewed message to the target thread",
});
const effectHash = model.effectHashForRequest({ identity, effect });
const browserEffect = model.BrowserDynamicApprovalEffectSchema.parse({
	tool: effect.tool,
	arguments: effect.arguments,
	target: threadId,
	effectiveBoundary: null,
	mutationOperationId: effect.mutationOperationId,
	initialTurnOperationId: null,
	visualSummary: effect.visualSummary,
});
const createdAtMs = 200_000;
const binding = {
	commandId: authorities.identity.issuer.mintBrowserCommandId(),
	paneId: "pane-a",
	capturedLink: { threadId, childId, epoch },
};
const pending: BrowserDynamicApproval = model.BrowserDynamicApprovalSchema.parse({
	kind: "dynamic_approval",
	state: "pending",
	identity,
	effect: browserEffect,
	effectHash,
	createdAtMs,
	expiresAtMs: createdAtMs + CODEX_APPROVAL_EXPIRY_MS,
	decision: null,
	delivery: null,
	toolResult: null,
	binding,
	resumable: false,
});
const other = createIdentityAuthorities();

/** How the snapshot fixture may differ from the default. */
interface SnapshotOptions {
	readonly lease?: WireRecord | null;
	readonly dynamicApprovals?: readonly unknown[];
}

/**
 * A thread-capable snapshot bound to the real authority's child epoch.
 * @param options The differences from the default.
 * @returns The snapshot record.
 */
function snapshot(options: SnapshotOptions = {}): WireRecord {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId,
			epoch,
			threadId,
			sourcePresentation: "standard",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		threadCandidates: {
			kind: "thread_candidates",
			state: "unknown",
			records: [],
			truncated: false,
			reason: null,
		},
		timeline: { kind: "timeline", threadId, turns: [], nextCursor: null },
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: options.dynamicApprovals ?? [],
		semantic: null,
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
			state: "unavailable",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: null,
		},
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease: options.lease ?? null,
		operation: null,
	};
}

/**
 * A lease bound to the pending approval's command and pane.
 * @param expiresAtMs When it expires.
 * @returns The lease record.
 */
function lease(expiresAtMs: number): WireRecord {
	return {
		kind: "command_lease",
		commandId: binding.commandId,
		paneId: binding.paneId,
		childId,
		epoch,
		state: "active",
		expiresAtMs,
	};
}

type DynamicDraft = Extract<BrowserCommandDraft, { readonly command: "dynamicApprovalRespond" }>;

/**
 * The approve response for the pending approval.
 * @returns The draft.
 */
function dynamicDraft(): DynamicDraft {
	return {
		command: "dynamicApprovalRespond",
		capturedLink: { threadId, childId, epoch },
		identity,
		effectHash,
		decision: "approve",
	};
}

/**
 * A delivered result for the pending approval's command.
 * @param value The snapshot it carries.
 * @returns The result record.
 */
function commandResult(value: WireRecord): WireRecord {
	return {
		kind: "command_result",
		commandId: binding.commandId,
		outcome: "delivered",
		code: null,
		message: null,
		snapshot: value,
	};
}

const tracker = createTransportTracker();

afterEach(tracker.disposeAll);

/**
 * A transport attached over a socket answering subscribe with one snapshot.
 * @param value The snapshot.
 * @param clock The transport clock.
 * @returns The transport and socket.
 */
async function attached(
	value: WireRecord,
	clock: number,
): Promise<{
	readonly transport: ReturnType<typeof createBrowserWorkbenchTransport>;
	readonly socket: FakeSocket;
}> {
	const transport = tracker.track(createBrowserWorkbenchTransport({ now: clockAt(clock) }));
	const socket = new FakeSocket();
	/**
	 * Answer subscribe.
	 * @param request The request.
	 * @param activeSocket The socket.
	 */
	function answer(request: FakeSocketRequest, activeSocket: FakeSocket): void {
		if (request["action"] === "subscribe") {
			activeSocket.reply(request, { kind: "snapshot", sequence: 1, snapshot: value });
		}
	}
	socket.onRequest = answer;
	await transport.attach(socket);
	return { transport, socket };
}

test("valid dynamic approval responses require one live pending approval and use the shared parser", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport({ now: clockAt(200_000) }));
	const socket = new FakeSocket();
	const current = snapshot({ lease: lease(260_000), dynamicApprovals: [pending] });
	/**
	 * Answer subscribe, the command and the reconciliation snapshot.
	 * @param request The request.
	 * @param activeSocket The socket.
	 */
	function answer(request: FakeSocketRequest, activeSocket: FakeSocket): void {
		if (request["action"] === "subscribe") {
			activeSocket.reply(request, { kind: "snapshot", sequence: 1, snapshot: current });
		} else if (request["action"] === "command") {
			activeSocket.reply(request, commandResult(current));
		} else if (request["action"] === "snapshot") {
			activeSocket.reply(request, { kind: "snapshot", sequence: 2, snapshot: current });
		}
	}
	socket.onRequest = answer;
	await transport.attach(socket);
	const result = await transport.command(dynamicDraft());
	const request = socket.sent.find((candidate) => candidate["action"] === "command");
	expect(result.outcome).toBe("delivered");
	expect(request?.["command"]).toMatchObject({
		command: "dynamicApprovalRespond",
		commandId: binding.commandId,
		paneId: "pane-a",
		childId,
		epoch,
		capturedLink: { threadId, childId, epoch },
		identity,
		effectHash,
	});
});
/**
 * Every draft whose identity, effect hash or captured link names something
 * other than the pending approval. Each alternative is a real identity from
 * another authority, so the refusal is about the mismatch, not the spelling.
 * The namespace and tool are literal in the closed identity type, so a draft
 * cannot even spell a different one; the wire comparison still covers them.
 * @returns The drafts.
 */
function changedDrafts(): readonly DynamicDraft[] {
	const base = dynamicDraft();
	const otherThread = other.identity.decoder.adoptThreadId("different-thread");
	const identities: readonly DynamicDraft["identity"][] = [
		{ ...identity, child: other.identity.validator.childId },
		{ ...identity, epoch: other.identity.validator.epoch },
		{ ...identity, threadId: otherThread },
		{ ...identity, turnId: other.identity.decoder.adoptTurnId("different-turn") },
		{ ...identity, callId: other.identity.decoder.adoptDynamicToolCallId("different-call") },
		{ ...identity, manifestHash: "different-manifest" },
		{ ...identity, operationId: other.operation.issuer.mintOperationId() },
	];
	return [
		...identities.map((changed): DynamicDraft => ({ ...base, identity: changed })),
		{ ...base, effectHash: `sha256:${"1".repeat(64)}` },
		{ ...base, capturedLink: { ...base.capturedLink, threadId: otherThread } },
		{ ...base, capturedLink: { ...base.capturedLink, childId: other.identity.validator.childId } },
		{ ...base, capturedLink: { ...base.capturedLink, epoch: other.identity.validator.epoch } },
	];
}

/**
 * Every published approval list in which the pending approval is not answerable.
 * @param clock The transport clock.
 * @returns The lists.
 */
function unansweredApprovals(clock: number): readonly (readonly unknown[])[] {
	return [
		[{ ...pending, binding: { ...binding, commandId: "other-command" } }],
		[{ ...pending, binding: { ...binding, paneId: "other-pane" } }],
		[
			{
				...pending,
				binding: { ...binding, capturedLink: { threadId, childId, epoch: "other-epoch" } },
			},
		],
		[
			model.BrowserDynamicApprovalSchema.parse({
				...pending,
				state: "approved",
				decision: {
					outcome: "approved",
					identity,
					effectHash,
					decidedAtMs: createdAtMs + 1,
					cause: "person_approved",
				},
				binding: null,
			}),
		],
		[{ ...pending, createdAtMs: clock - CODEX_APPROVAL_EXPIRY_MS, expiresAtMs: clock }],
		[],
	];
}

/** One refusal case: what the snapshot lists and what the draft asks. */
interface RefusalCase {
	readonly approvals: readonly unknown[];
	readonly draft: DynamicDraft;
}

/**
 * Attach over the listed approvals and expect the draft refused before any command.
 * @param refusal The case.
 */
async function expectRefusedUnsent(refusal: RefusalCase): Promise<void> {
	const { transport, socket } = await attached(
		snapshot({ lease: lease(260_000), dynamicApprovals: refusal.approvals }),
		200_000,
	);
	const error = await rejection(transport.command(refusal.draft));
	expect(error).toMatchObject({ outcome: "not_delivered" });
	expect(errorCode(error)).toBeOneOf(["dynamic_approval_not_pending", "not_ready"]);
	expect(socket.sent.some((request) => request["action"] === "command")).toBeFalse();
}

test("changing every dynamic identity, binding, state, or expiry component sends no command", async () => {
	const cases: readonly RefusalCase[] = [
		...changedDrafts().map((draft): RefusalCase => ({ approvals: [pending], draft })),
		...unansweredApprovals(200_000).map((approvals): RefusalCase => ({
			approvals,
			draft: dynamicDraft(),
		})),
	];
	await Promise.all(cases.map(expectRefusedUnsent));
});

/**
 * Attach with an expired lease at one clock and expect exact authority gone
 * while human actions stay preparable.
 * @param clock The transport clock.
 */
async function expectExpiredLease(clock: number): Promise<void> {
	const { transport, socket } = await attached(
		snapshot({ lease: lease(200_000), dynamicApprovals: [pending] }),
		clock,
	);
	const capabilities = transport.capabilities();
	expect(capabilities.supportsCommand("approvalRespond")).toBeFalse();
	expect(capabilities.supportsCommand("dynamicApprovalRespond")).toBeFalse();
	expect(capabilities.supportsCommand("accountLogout")).toBeTrue();
	expect(capabilities.supportsCommand("start")).toBeTrue();
	expect(capabilities.supportsCommand("queueAdd")).toBeTrue();
	expect(capabilities.canCommand).toBeTrue();
	expect(capabilities.canRealtime).toBeFalse();
	expect(capabilities.canRenewLease).toBeFalse();
	expect(capabilities.canReleaseLease).toBeFalse();
	const drafts: readonly BrowserCommandDraft[] = [
		{ command: "accountLogout" },
		{ command: "start", threadId, prompt: "start" },
		{ command: "queueAdd", prompt: "queue" },
		{
			command: "approvalRespond",
			requestId: authorities.identity.decoder.adoptJsonRpcRequestId("request-a"),
			approvalId: null,
			response: { approvalKind: "apply_patch", decision: "approved" },
		},
		dynamicDraft(),
	];
	const refusals = await Promise.all([
		...drafts.map((draft) => rejection(transport.command(draft))),
		rejection(transport.renewLease()),
		rejection(transport.releaseLease()),
	]);
	for (const refusal of refusals) {
		expect(refusal).toMatchObject({ code: "lease_expired" });
	}
	expect(socket.sent.map((request) => request["action"])).toEqual(["subscribe"]);
}

test("lease expiry disables exact authority while ordinary actions can acquire fresh authority", async () => {
	await Promise.all([200_000, 200_001].map(expectExpiredLease));
});
