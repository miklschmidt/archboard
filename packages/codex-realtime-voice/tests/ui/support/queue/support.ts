// Fixtures for the queue owners: branded identities minted through the real
// authority, snapshots and transport states. The transport double is in
// `fake-transport.ts`.

import { BROWSER_IDLE_SPOKEN_APPROVAL } from "#shared/schemas/browser/spoken-approval.ts";
import type { BrowserQueue, BrowserSnapshot, BrowserThreadLink } from "#shared/schemas/browser/snapshot.ts";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import type { WorkbenchQueueEntry } from "#ui/state/queue/contracts.ts";
import type {
	WorkbenchCommandIntent,
	WorkbenchCommandName,
	WorkbenchCommandResult,
	WorkbenchCommandTarget,
	WorkbenchTransportCapabilities,
	WorkbenchTransportState,
} from "#ui/state/queue/transport-port.ts";

type ExecutableLink = Extract<BrowserThreadLink, { readonly state: "executable" }>;
type QueueStatus = BrowserQueue["status"];
type Timeline = NonNullable<BrowserSnapshot["timeline"]>;
type Approval = BrowserSnapshot["approvals"][number];
type SubmissionId = WorkbenchQueueEntry["submissionId"];

const authorities = createIdentityAuthorities();
const { decoder, issuer, validator } = authorities.identity;

const THREAD_ID = decoder.adoptThreadId("workhorse-a");
const CHILD_ID = validator.childId;
const EPOCH = validator.epoch;
/** Another epoch, so a test can present a queue for a child that was replaced. */
const OTHER_EPOCH = issuer.mintChildEpoch();
const COORDINATOR_THREAD_ID = decoder.adoptThreadId("coordinator-a");
const TURN_ID = decoder.adoptTurnId("turn-a");
const COMMAND_ID = issuer.mintBrowserCommandId();
const PANE_ID = "pane-a";

/** The fixture name behind each adopted submission id, so assertions read names. */
const SUBMISSION_NAMES = new Map<SubmissionId, string>();

/**
 * A branded submission id; the same name always adopts the same id.
 * @param value The fixture name.
 * @returns The id.
 */
function submission(value: string): SubmissionId {
	const id = decoder.adoptQueuedSubmissionId(value);
	SUBMISSION_NAMES.set(id, value);
	return id;
}

/**
 * The fixture name of an adopted submission id.
 * @param id The id.
 * @returns The name it was adopted from, or the id itself.
 */
function nameOf(id: SubmissionId): string {
	return SUBMISSION_NAMES.get(id) ?? String(id);
}

/**
 * A fresh coordinator operation id.
 * @returns The id.
 */
function operation(): NonNullable<WorkbenchQueueEntry["operationId"]> {
	return authorities.operation.issuer.mintOperationId();
}

/** How one entry is seeded. */
interface EntrySeed {
	readonly id: string;
	readonly prompt?: string;
	readonly status?: WorkbenchQueueEntry["status"];
	/** False for a submission this coordinator did not queue. */
	readonly owned?: boolean;
}

/**
 * One queue entry.
 * @param seed The seed.
 * @returns The entry, coordinator-owned unless the seed says otherwise.
 */
function entry(seed: EntrySeed): WorkbenchQueueEntry {
	return {
		submissionId: submission(seed.id),
		prompt: seed.prompt ?? `Prompt for ${seed.id}`,
		status: seed.status ?? "queued",
		operationId: seed.owned === false ? null : operation(),
	};
}

/**
 * One published queue.
 * @param status The queue status.
 * @param seeds The entries.
 * @returns The queue.
 */
function queue(status: QueueStatus, seeds: readonly EntrySeed[] = []): BrowserQueue {
	return { kind: "queue", status, entries: seeds.map(entry) };
}

/**
 * An executable thread link to the workhorse.
 * @param overrides Fields that differ.
 * @returns The link.
 */
function executableLink(overrides: Partial<ExecutableLink> = {}): BrowserThreadLink {
	return {
		kind: "thread_link",
		state: "executable",
		childId: CHILD_ID,
		epoch: EPOCH,
		threadId: THREAD_ID,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
		...overrides,
	};
}

/**
 * An inspect-only link to the workhorse.
 * @param reason The server's reason.
 * @returns The link.
 */
function inspectOnlyLink(reason: string): BrowserThreadLink {
	return {
		kind: "thread_link",
		state: "inspect_only",
		childId: null,
		epoch: null,
		threadId: THREAD_ID,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: false,
		reason,
	};
}

/**
 * A timeline with one workhorse turn.
 * @param status The turn status.
 * @returns The timeline.
 */
function timeline(status: Timeline["turns"][number]["status"] = "inProgress"): Timeline {
	return {
		kind: "timeline",
		threadId: THREAD_ID,
		turns: [
			{
				turnId: TURN_ID,
				status,
				items: [],
				summary: "The linked workhorse turn",
				outputsIncluded: true,
				outputsTruncated: false,
				startedAtMs: null,
				completedAtMs: null,
				durationMs: null,
				error: null,
				plan: null,
			},
		],
		nextCursor: null,
		usage: null,
	};
}

/**
 * One pending command approval on the workhorse.
 * @returns The approval.
 */
function pendingApproval(): Approval {
	return {
		kind: "approval",
		approvalKind: "command_execution",
		requestId: issuer.mintJsonRpcRequestId(),
		threadId: THREAD_ID,
		turnId: null,
		itemId: null,
		approvalId: decoder.adoptApprovalId("approval-a"),
		expiresAtMs: 9_000_000,
		lifecycle: { state: "pending", decision: null, outcome: null, reason: null },
		binding: {
			child: CHILD_ID,
			epoch: EPOCH,
			link: null,
			target: "the linked workhorse",
			effect: "run one command",
		},
		spoken: { eligible: false, reason: "not_binary" },
		reason: null,
		command: "bun run check",
		availableDecisions: [],
	};
}

/** What a snapshot fixture may override. */
type SnapshotSeed = Partial<
	Pick<BrowserSnapshot, "queue" | "threadLink" | "readiness" | "timeline" | "approvals">
>;

/**
 * One published snapshot with an executable link and a running turn.
 * @param seed Fields that differ.
 * @returns The snapshot.
 */
function snapshot(seed: SnapshotSeed = {}): BrowserSnapshot {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: executableLink(),
		timeline: timeline(),
		queue: queue("empty"),
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: COORDINATOR_THREAD_ID,
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
			reason: "Voice is unavailable.",
		},
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease: null,
		operation: null,
		...seed,
	};
}

/**
 * A connected, thread-capable transport state.
 * @param value The snapshot.
 * @param sequence The stream sequence.
 * @returns The state.
 */
function connected(value: BrowserSnapshot = snapshot(), sequence = 4): WorkbenchTransportState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence,
	};
}

/**
 * A dropped socket.
 * @param reason The transport's reason.
 * @returns The state.
 */
function stopped(reason = "No Codex workbench socket is attached."): WorkbenchTransportState {
	return {
		kind: "connection",
		state: "stopped",
		connection: "stopped",
		snapshot: null,
		sequence: null,
		reason,
	};
}

/**
 * Transport capabilities.
 * @param overrides Fields that differ.
 * @param unsupported Commands the server refuses.
 * @returns The capabilities.
 */
function capabilities(
	overrides: Partial<Omit<WorkbenchTransportCapabilities, "supportsCommand">> = {},
	unsupported: readonly WorkbenchCommandName[] = [],
): WorkbenchTransportCapabilities {
	return {
		connected: true,
		readiness: "thread_capable",
		...overrides,
		/**
		 * Whether the server accepts a command.
		 * @param name The command.
		 * @returns True unless the fixture refuses it.
		 */
		supportsCommand: (name) => !unsupported.includes(name),
	};
}

/**
 * The exact lease authority.
 * @param overrides Fields that differ.
 * @returns The target.
 */
function commandTarget(overrides: Partial<WorkbenchCommandTarget> = {}): WorkbenchCommandTarget {
	return {
		commandId: COMMAND_ID,
		paneId: PANE_ID,
		childId: CHILD_ID,
		epoch: EPOCH,
		capturedThreadLink: executableLink(),
		...overrides,
	};
}

/**
 * A captured intent with authority.
 * @returns The intent.
 */
function commandIntent(): WorkbenchCommandIntent {
	const authority = commandTarget();
	return { capturedThreadLink: authority.capturedThreadLink, authority };
}

/**
 * A command result over a snapshot.
 * @param value The republished snapshot.
 * @param overrides Fields that differ from a delivered result.
 * @returns The result.
 */
function commandResult(
	value: BrowserSnapshot,
	overrides: Partial<WorkbenchCommandResult> = {},
): WorkbenchCommandResult {
	return {
		kind: "command_result",
		commandId: COMMAND_ID,
		outcome: "delivered",
		code: null,
		message: null,
		snapshot: value,
		...overrides,
	};
}

/** What a command answers. */
type CommandAnswer = () => Promise<WorkbenchCommandResult> | WorkbenchCommandResult;

/**
 * A command answer that returns one result.
 * @param value The republished snapshot.
 * @param overrides Fields that differ from a delivered result.
 * @returns The answer.
 */
function answering(
	value: BrowserSnapshot,
	overrides: Partial<WorkbenchCommandResult> = {},
): CommandAnswer {
	const result = commandResult(value, overrides);
	return () => result;
}

/**
 * A command answer that throws.
 * @param error The thrown value.
 * @returns The answer.
 */
function throwing(error: Error): CommandAnswer {
	return () => {
		throw error;
	};
}

/**
 * A command answer held until a gate opens.
 * @param gate Opens the answer.
 * @param value The republished snapshot.
 * @returns The answer.
 */
function gated(gate: Promise<void>, value: BrowserSnapshot): CommandAnswer {
	return async () => {
		await gate;
		return commandResult(value);
	};
}

export {
	CHILD_ID,
	COORDINATOR_THREAD_ID,
	EPOCH,
	OTHER_EPOCH,
	PANE_ID,
	THREAD_ID,
	TURN_ID,
	answering,
	capabilities,
	commandIntent,
	commandResult,
	commandTarget,
	connected,
	entry,
	executableLink,
	gated,
	inspectOnlyLink,
	nameOf,
	pendingApproval,
	queue,
	snapshot,
	stopped,
	submission,
	throwing,
	timeline,
	type CommandAnswer,
	type EntrySeed,
};
