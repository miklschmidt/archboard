import type { BrowserQueue, BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchState,
} from "../../workbench-transport/index.js";
import type { WorkbenchQueueEntry, WorkbenchQueueTransport } from "../contract.ts";

type ExecutableLink = Extract<BrowserSnapshot["threadLink"], { readonly state: "executable" }>;
type QueueStatus = BrowserQueue["status"];
type SubmissionId = WorkbenchQueueEntry["submissionId"];
type OperationId = NonNullable<WorkbenchQueueEntry["operationId"]>;
type CommandName = Parameters<BrowserWorkbenchCapabilities["supportsCommand"]>[0];

export const THREAD_ID = "workhorse-a" as ExecutableLink["threadId"];
export const CHILD_ID = "child-a" as ExecutableLink["childId"];
export const EPOCH = "epoch-a" as ExecutableLink["epoch"];

export function submission(value: string): SubmissionId {
	return value as SubmissionId;
}

export function operation(value: string): OperationId {
	return value as OperationId;
}

export interface EntrySeed {
	readonly id: string;
	readonly prompt?: string;
	readonly status?: WorkbenchQueueEntry["status"];
	/** A null operation is a submission this coordinator did not queue. */
	readonly operationId?: string | null;
}

export function entry(seed: EntrySeed): WorkbenchQueueEntry {
	return {
		submissionId: submission(seed.id),
		prompt: seed.prompt ?? `Prompt for ${seed.id}`,
		status: seed.status ?? "queued",
		operationId:
			seed.operationId === undefined
				? operation(`op-${seed.id}`)
				: seed.operationId === null
					? null
					: operation(seed.operationId),
	};
}

export function queue(status: QueueStatus, seeds: readonly EntrySeed[] = []): BrowserQueue {
	return { kind: "queue", status, entries: seeds.map(entry) };
}

export interface SnapshotSeed {
	readonly queue?: BrowserQueue;
	readonly threadLink?: BrowserSnapshot["threadLink"];
	readonly readiness?: BrowserSnapshot["readiness"];
	readonly timeline?: BrowserSnapshot["timeline"];
	readonly approvals?: BrowserSnapshot["approvals"];
	readonly coordinator?: Partial<BrowserSnapshot["coordinator"]>;
}

export function executableLink(
	overrides: Partial<ExecutableLink> = {},
): BrowserSnapshot["threadLink"] {
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

export function timeline(
	status: NonNullable<BrowserSnapshot["timeline"]>["turns"][number]["status"] = "inProgress",
): BrowserSnapshot["timeline"] {
	return {
		kind: "timeline",
		threadId: THREAD_ID,
		turns: [
			{
				turnId: "turn-a" as NonNullable<BrowserSnapshot["timeline"]>["turns"][number]["turnId"],
				status,
				items: [],
				summary: "The linked workhorse turn",
				outputsIncluded: true,
				outputsTruncated: false,
			},
		],
		nextCursor: null,
	};
}

type Approval = BrowserSnapshot["approvals"][number];

export function pendingApproval(): Approval {
	return {
		kind: "approval",
		approvalKind: "command_execution",
		requestId: "request-a" as Approval["requestId"],
		threadId: THREAD_ID,
		turnId: null,
		itemId: null,
		approvalId: "approval-a" as Approval["approvalId"],
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

export function snapshot(seed: SnapshotSeed = {}): BrowserSnapshot {
	return {
		kind: "snapshot",
		version: 1,
		readiness: seed.readiness ?? { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: seed.threadLink ?? executableLink(),
		threadCandidates: {
			kind: "thread_candidates",
			state: "unknown",
			records: [],
			truncated: false,
			reason: null,
		},
		timeline: seed.timeline === undefined ? timeline() : seed.timeline,
		queue: seed.queue ?? queue("empty"),
		settings: [],
		approvals: seed.approvals ?? [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: "coordinator-a" as BrowserSnapshot["coordinator"]["threadId"],
			activeTurnId: null,
			configuredModel: null,
			configuredEffort: null,
			model: null,
			effort: null,
			serviceTier: null,
			reason: null,
			...seed.coordinator,
		},
		voice: {
			kind: "voice",
			state: "unavailable",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: "Voice is unavailable.",
		},
		lease: null,
		operation: null,
	};
}

export function connected(
	value: BrowserSnapshot = snapshot(),
	sequence = 4,
): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence,
	};
}

export function capabilities(
	overrides: Partial<Omit<BrowserWorkbenchCapabilities, "supportsCommand">> = {},
	unsupported: readonly CommandName[] = [],
): BrowserWorkbenchCapabilities {
	return {
		connected: true,
		readiness: "thread_capable",
		canReadAccount: true,
		canClaimLease: true,
		canRenewLease: true,
		canReleaseLease: true,
		canCommand: true,
		canThreadCommands: true,
		canRealtime: true,
		...overrides,
		supportsCommand: (name) => !unsupported.includes(name),
	};
}

export function commandTarget(
	overrides: Partial<BrowserWorkbenchCommandTarget> = {},
): BrowserWorkbenchCommandTarget {
	return {
		commandId: "command-a" as BrowserWorkbenchCommandTarget["commandId"],
		paneId: "pane-a" as BrowserWorkbenchCommandTarget["paneId"],
		childId: CHILD_ID,
		epoch: EPOCH,
		capturedThreadLink: executableLink(),
		...overrides,
	};
}

export interface RecordedCommand {
	readonly draft: BrowserCommandDraft;
	readonly target: BrowserWorkbenchCommandTarget | undefined;
}

export interface FakeQueueTransportOptions {
	readonly state?: BrowserWorkbenchState;
	readonly capabilities?: BrowserWorkbenchCapabilities;
	readonly target?: BrowserWorkbenchCommandTarget | (() => BrowserWorkbenchCommandTarget);
	readonly onCommand?: (
		draft: BrowserCommandDraft,
		target: BrowserWorkbenchCommandTarget | undefined,
	) => Promise<BrowserWorkbenchCommandResult> | BrowserWorkbenchCommandResult;
	readonly onRefresh?: () => Promise<unknown>;
	/** The authoritative state a refresh republishes, as the real transport does. */
	readonly refreshPublishes?: () => BrowserWorkbenchState;
}

/**
 * A transport stand-in for the queue module's public surface. It records what
 * the module sent and lets a test publish a new authoritative state, which is
 * the only way anything in this module is allowed to change.
 */
export class FakeQueueTransport {
	readonly commands: RecordedCommand[] = [];
	refreshes = 0;
	private current: BrowserWorkbenchState;
	private currentCapabilities: BrowserWorkbenchCapabilities;
	private readonly listeners = new Set<() => void>();
	private readonly options: FakeQueueTransportOptions;

	constructor(options: FakeQueueTransportOptions = {}) {
		this.options = options;
		this.current = options.state ?? connected();
		this.currentCapabilities = options.capabilities ?? capabilities();
	}

	publish(state: BrowserWorkbenchState, next?: BrowserWorkbenchCapabilities): void {
		this.current = state;
		if (next !== undefined) this.currentCapabilities = next;
		for (const listener of this.listeners) listener();
	}

	asTransport(): WorkbenchQueueTransport {
		return {
			state: () => this.current,
			capabilities: () => this.currentCapabilities,
			subscribe: (listener: () => void) => {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			},
			captureCommandTarget: () => {
				const target = this.options.target ?? commandTarget();
				return typeof target === "function" ? target() : target;
			},
			refresh: async () => {
				this.refreshes += 1;
				const republished = this.options.refreshPublishes?.();
				if (republished !== undefined) this.publish(republished);
				const result = await (this.options.onRefresh?.() ??
					Promise.resolve({ kind: "snapshot", sequence: 1, snapshot: this.current.snapshot }));
				return result as Awaited<ReturnType<WorkbenchQueueTransport["refresh"]>>;
			},
			command: async (draft, target) => {
				this.commands.push({ draft, target });
				if (this.options.onCommand !== undefined)
					return await this.options.onCommand(draft, target);
				return commandResult(this.current.snapshot ?? snapshot());
			},
		};
	}
}

export function commandResult(
	value: BrowserSnapshot,
	overrides: Partial<BrowserWorkbenchCommandResult> = {},
): BrowserWorkbenchCommandResult {
	return {
		kind: "command_result",
		commandId: commandTarget().commandId,
		outcome: "delivered",
		code: null,
		message: null,
		snapshot: value,
		...overrides,
	};
}
