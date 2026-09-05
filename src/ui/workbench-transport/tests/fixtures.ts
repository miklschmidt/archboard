// The wire fixtures the transport owners send through the fake socket: plain
// wire records that cross the socket as JSON and are parsed like anything the
// gateway sends, plus the branded identities a typed draft needs.

import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import { BROWSER_IDLE_SPOKEN_APPROVAL } from "@/shared/codex-browser-model";
import type { BrowserCommandDraft } from "@/ui/workbench-transport";

/** A wire record. */
type WireRecord = Record<string, unknown>;

/** A snapshot fixture with the fields tests reach into typed as records. */
interface SnapshotFixture extends WireRecord {
	readiness: WireRecord;
	threadLink: WireRecord;
	timeline: WireRecord | null;
	queue: WireRecord;
	approvals: readonly unknown[];
	dynamicApprovals: readonly unknown[];
	voice: WireRecord;
	lease: WireRecord | null;
}

const authorities = createIdentityAuthorities();
const { decoder, issuer } = authorities.identity;

/** Branded identities matching the fixture strings. */
const fixtureIds = {
	threadA: decoder.adoptThreadId("thread-a"),
	threadB: decoder.adoptThreadId("thread-b"),
	requestA: decoder.adoptJsonRpcRequestId("request-a"),
	requestZ: decoder.adoptJsonRpcRequestId("request-z"),
	approvalA: decoder.adoptApprovalId("approval-a"),
	submissionA: decoder.adoptQueuedSubmissionId("submission-a"),
	submissionGone: decoder.adoptQueuedSubmissionId("submission-gone"),
	voiceHandle: issuer.mintBrowserCommandId(),
};

/** The same identities as the gateway spells them on the wire. */
const wire = {
	threadA: String(fixtureIds.threadA),
	threadB: String(fixtureIds.threadB),
	threadResult: String(decoder.adoptThreadId("thread-result")),
	requestA: String(fixtureIds.requestA),
	requestB: String(decoder.adoptJsonRpcRequestId("request-b")),
	requestZ: String(fixtureIds.requestZ),
	approvalA: String(fixtureIds.approvalA),
	submissionA: String(fixtureIds.submissionA),
	submissionB: String(decoder.adoptQueuedSubmissionId("submission-b")),
	submissionGone: String(fixtureIds.submissionGone),
};

/**
 * A command lease record.
 * @param expiresAtMs When it expires.
 * @param commandId Its command id.
 * @param state Its state.
 * @returns The lease record.
 */
function lease(
	expiresAtMs = Date.now() + 60_000,
	commandId = "command-a",
	state: "active" | "released" = "active",
): WireRecord {
	return {
		kind: "command_lease",
		commandId,
		paneId: "pane-a",
		childId: "child-a",
		epoch: "epoch-a",
		state,
		expiresAtMs,
	};
}

const REASONED_READINESS: ReadonlySet<string> = new Set([
	"stopped",
	"storage_mismatch",
	"reconnecting",
	"incompatible_contract",
]);

/**
 * A readiness record.
 * @param state The readiness state.
 * @returns The readiness record.
 */
function readiness(state: string): WireRecord {
	if (state === "backoff") {
		return { kind: "readiness", state, retryAtMs: 900, reason: "retry" };
	}
	if (REASONED_READINESS.has(state)) {
		return { kind: "readiness", state, reason: "state reason" };
	}
	if (state === "login_pending") {
		return { kind: "readiness", state, loginId: "login-a" };
	}
	return { kind: "readiness", state };
}

/** How an approval fixture may differ from the default pending one. */
interface ApprovalOptions {
	readonly requestId?: string;
	readonly approvalId?: string | null;
	readonly threadId?: string;
	readonly childId?: string;
	readonly epoch?: string;
	readonly expiresAtMs?: number;
	readonly lifecycle?: WireRecord;
}

const PENDING_LIFECYCLE: WireRecord = {
	state: "pending",
	decision: null,
	outcome: null,
	reason: null,
};

const APPROVAL_DEFAULTS = {
	requestId: wire.requestA,
	approvalId: wire.approvalA as string | null,
	threadId: wire.threadA,
	expiresAtMs: 4_000_000_000_000,
	lifecycle: PENDING_LIFECYCLE,
};

/**
 * The approval fixture's binding.
 * @param options The differences from the default.
 * @returns The binding record.
 */
function approvalBinding(options: ApprovalOptions): WireRecord {
	return {
		child: options.childId ?? "child-a",
		epoch: options.epoch ?? "epoch-a",
		link: "pane:pane-a",
		target: "the workhorse shell",
		effect: "run a command",
	};
}

/**
 * One pending command-execution approval bound to the default child epoch.
 * @param options The differences from the default.
 * @returns The approval record.
 */
function approval(options: ApprovalOptions = {}): WireRecord {
	const filled = { ...APPROVAL_DEFAULTS, ...options };
	const lifecycle = filled.lifecycle;
	return {
		kind: "approval",
		approvalKind: "command_execution",
		requestId: filled.requestId,
		threadId: filled.threadId,
		turnId: "turn-a",
		itemId: "item-a",
		approvalId: filled.approvalId,
		expiresAtMs: filled.expiresAtMs,
		lifecycle,
		binding: approvalBinding(options),
		spoken: { eligible: lifecycle["state"] === "pending", reason: "eligible" },
		reason: null,
		command: "ls",
		availableDecisions: [],
	};
}

/**
 * A queue record.
 * @param status The queue status.
 * @param submissionIds The queued submissions.
 * @returns The queue record.
 */
function queue(status = "empty", submissionIds: readonly string[] = []): WireRecord {
	return {
		kind: "queue",
		status,
		entries: submissionIds.map((submissionId) => ({
			submissionId,
			prompt: "queued work",
			status: "queued",
			operationId: null,
		})),
	};
}

/** How a snapshot fixture may differ from the default. */
interface SnapshotOptions {
	readonly state?: string;
	readonly threadId?: string;
	readonly lease?: WireRecord | null;
	readonly linkState?: "executable" | "inspect_only" | "unbound";
	readonly approvals?: readonly unknown[];
	readonly dynamicApprovals?: readonly unknown[];
	readonly queue?: WireRecord;
	readonly voiceState?: string;
	readonly threadCandidates?: WireRecord;
}

const UNBOUND_LINK: WireRecord = {
	kind: "thread_link",
	state: "unbound",
	childId: null,
	epoch: null,
	threadId: null,
	sourcePresentation: null,
	status: "notLoaded",
	loaded: false,
	canAcceptDirectInput: false,
	reason: null,
};

const UNKNOWN_CANDIDATES: WireRecord = {
	kind: "thread_candidates",
	state: "unknown",
	records: [],
	truncated: false,
	reason: null,
};

const UNBOUND_COORDINATOR: WireRecord = {
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
};

/**
 * A thread link record.
 * @param linkState The link state.
 * @param threadId The thread it names.
 * @returns The link record.
 */
function threadLinkFor(linkState: string, threadId: string): WireRecord {
	if (linkState === "unbound") {
		return { ...UNBOUND_LINK };
	}
	const executable = linkState === "executable";
	return {
		kind: "thread_link",
		state: linkState,
		childId: executable ? "child-a" : null,
		epoch: executable ? "epoch-a" : null,
		threadId,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: executable,
		reason: null,
	};
}

/**
 * A voice record.
 * @param state The voice state.
 * @returns The voice record.
 */
function voiceFor(state: string): WireRecord {
	return {
		kind: "voice",
		state,
		realtimeSessionId: null,
		transcript: [],
		delivery: null,
		reason: null,
	};
}

const SNAPSHOT_DEFAULTS = {
	state: "thread_capable",
	threadId: wire.threadA,
	lease: null as WireRecord | null,
	linkState: "executable" as "executable" | "inspect_only" | "unbound",
	approvals: [] as readonly unknown[],
	dynamicApprovals: [] as readonly unknown[],
	voiceState: "unavailable",
	threadCandidates: UNKNOWN_CANDIDATES,
	queue: queue(),
};

/**
 * A full snapshot record.
 * @param options The differences from the default.
 * @returns The snapshot fixture.
 */
function snapshot(options: SnapshotOptions = {}): SnapshotFixture {
	const filled = { ...SNAPSHOT_DEFAULTS, ...options };
	const { threadId, linkState } = filled;
	return {
		kind: "snapshot",
		version: 1,
		readiness: readiness(filled.state),
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: threadLinkFor(linkState, threadId),
		threadCandidates: filled.threadCandidates,
		timeline:
			linkState === "unbound" ? null : { kind: "timeline", threadId, turns: [], nextCursor: null },
		queue: filled.queue,
		settings: [],
		approvals: filled.approvals,
		dynamicApprovals: filled.dynamicApprovals,
		semantic: null,
		coordinator: { ...UNBOUND_COORDINATOR },
		voice: voiceFor(filled.voiceState),
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease: filled.lease,
		operation: null,
	};
}

/**
 * A snapshot message.
 * @param sequence The sequence.
 * @param value The snapshot.
 * @returns The message.
 */
function snapshotMessage(sequence: number, value: WireRecord): WireRecord {
	return { kind: "snapshot", sequence, snapshot: value };
}

/**
 * A delta message.
 * @param sequence The sequence.
 * @param delta The delta fields.
 * @returns The message.
 */
function deltaMessage(sequence: number, delta: WireRecord): WireRecord {
	return { kind: "delta", sequence, delta };
}

/**
 * A delivered command result.
 * @param value The snapshot it carries.
 * @param commandId The command it answers.
 * @returns The result record.
 */
function commandResult(value: WireRecord, commandId: string | null = "command-a"): WireRecord {
	return {
		kind: "command_result",
		commandId,
		outcome: "delivered",
		code: null,
		message: null,
		snapshot: value,
	};
}

/**
 * A delivered account read result.
 * @param value The snapshot it carries.
 * @returns The result record.
 */
function accountResult(value: WireRecord): WireRecord {
	return {
		kind: "account_read",
		outcome: "delivered",
		code: null,
		message: null,
		snapshot: value,
	};
}

/**
 * A start draft against the default thread.
 * @param threadId The thread.
 * @returns The draft.
 */
function startDraft(threadId = fixtureIds.threadA): BrowserCommandDraft {
	return { command: "start", threadId, prompt: "begin" };
}

export {
	accountResult,
	approval,
	commandResult,
	deltaMessage,
	fixtureIds,
	wire,
	lease,
	queue,
	readiness,
	snapshot,
	snapshotMessage,
	startDraft,
	type SnapshotFixture,
	type WireRecord,
};
