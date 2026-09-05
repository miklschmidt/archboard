import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
	type BrowserSnapshot,
} from "../../../shared/codex-browser-model/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createWorkbenchComposerController } from "../../workbench-composer/index.js";
import { createThreadLinkController } from "../../workbench-thread-link/index.js";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import {
	captureWorkbenchFrameRequestSource,
	type WorkbenchFrameRequest,
	type WorkbenchFramePane,
	type WorkbenchFramePaneIdentity,
	type WorkbenchFrameView,
} from "../index.js";

const authorities = createIdentityAuthorities();
const identity = authorities.identity;
const model = createCodexBrowserModel(authorities);
const childId = model.ChildIdSchema.parse(identity.validator.childId);
const epoch = model.ChildEpochSchema.parse(identity.validator.epoch);
const commandId = model.BrowserCommandIdSchema.parse(identity.issuer.mintBrowserCommandId());
const coordinatorThreadId = model.ThreadIdSchema.parse(
	identity.decoder.adoptThreadId("coordinator-frame"),
);
const coordinatorTurnId = model.TurnIdSchema.parse(
	identity.decoder.adoptTurnId("coordinator-turn-frame"),
);
const itemId = model.ItemIdSchema.parse(identity.decoder.adoptItemId("frame-item"));
const approvalId = model.ApprovalIdSchema.parse(identity.decoder.adoptApprovalId("frame-approval"));
const requestId = model.JsonRpcRequestIdSchema.parse(identity.issuer.mintJsonRpcRequestId());
const loginId = model.LoginIdSchema.parse(identity.decoder.adoptLoginId("frame-login"));
const realtimeSessionId = model.RealtimeSessionIdSchema.parse(
	identity.issuer.mintRealtimeSessionId(),
);

export const TEST_NOW = 1_800_000_000_000;
export const LONG_EMPTY_REQUEST = {
	state: "empty",
	detail: `No request needs a response. ${"Retained request history remains inspectable. ".repeat(80)}`,
} as const;
export const FRAME_ROOT_THEME_CLASSES =
	"h-full flex flex-col bg-background text-foreground border-border duration-control ease-control forced-color-adjust-auto forced-colors:border-current";

export const WORKBENCH_PROJECTION_CASES = [
	{
		view: { state: "loading", detail: "Loading the Codex workbench." } as const,
		role: "status",
		text: "Loading the Codex workbench.",
	},
	{
		view: { state: "empty", detail: "No pane is available for the workbench." } as const,
		role: "status",
		text: "No pane is available for the workbench.",
	},
	{
		view: {
			state: "error",
			detail: "The workbench projection failed.",
			recovery: "Reconnect Codex and reload the pane.",
		} as const,
		role: "alert",
		text: "The workbench projection failed.",
	},
] as const;

export const REQUEST_PROJECTION_CASES = [
	{ state: "loading", detail: "Loading requests from the command lease." } as const,
	{ state: "empty", detail: "No application-wide request is active." } as const,
	{
		state: "error",
		detail: "The request source disconnected.",
		recovery: "Reconnect the originating pane before responding.",
	} as const,
] as const;

export interface RecordedCommand {
	readonly draft: BrowserCommandDraft;
	readonly target: BrowserWorkbenchCommandTarget | undefined;
}

export interface TestTransport {
	readonly paneId: string;
	readonly transport: BrowserWorkbenchTransport;
	readonly commands: RecordedCommand[];
	readonly target: BrowserWorkbenchCommandTarget | null;
	readonly threadId: NonNullable<BrowserSnapshot["threadLink"]["threadId"]>;
	readonly setState: (state: BrowserWorkbenchState) => void;
}

function capabilities(connected: boolean) {
	return {
		connected,
		readiness: connected ? ("thread_capable" as const) : null,
		canReadAccount: connected,
		canClaimLease: connected,
		canRenewLease: connected,
		canReleaseLease: connected,
		canCommand: connected,
		canThreadCommands: connected,
		canRealtime: connected,
		supportsCommand: () => connected,
	};
}

function pendingSnapshot(paneId: string, threadId: TestTransport["threadId"]): BrowserSnapshot {
	const turnId = model.TurnIdSchema.parse(identity.decoder.adoptTurnId(`turn-${paneId}`));
	return model.BrowserSnapshotSchema.parse({
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "completed", loginId },
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
		timeline: {
			kind: "timeline",
			threadId,
			turns: [],
			nextCursor: null,
		},
		queue: { kind: "queue", status: "outcome_unknown", entries: [] },
		settings: [
			{
				kind: "settings",
				owner: "coordinator",
				model: "gpt-5.6-luna",
				effort: "medium",
				serviceTier: "priority",
				approvalPolicy: "on-request",
				approvalsReviewer: "user",
				sandbox: { mode: "full_access", network: "unspecified" },
				activePermissionProfile: null,
			},
		],
		approvals: [
			{
				kind: "approval",
				approvalKind: "command_execution",
				requestId,
				threadId,
				turnId,
				itemId,
				approvalId,
				expiresAtMs: TEST_NOW + 60_000,
				lifecycle: { state: "pending", decision: null, outcome: null, reason: null },
				binding: {
					child: childId,
					epoch,
					link: paneId,
					target: `${paneId} workhorse`,
					effect: "Run the focused frame verification command.",
				},
				spoken: { eligible: true, reason: "eligible" },
				reason: "The command requires approval.",
				command: "bun test src/ui/workbench-frame",
				availableDecisions: ["accept", "decline"],
			},
		],
		dynamicApprovals: [],
		semantic: {
			kind: "semantic_delivery",
			threadId,
			delivery: "outcome_unknown",
			capturedAtMs: TEST_NOW,
			freshUntilMs: TEST_NOW + 30_000,
			reason: null,
		},
		coordinator: {
			kind: "coordinator",
			state: "active",
			threadId: coordinatorThreadId,
			activeTurnId: coordinatorTurnId,
			configuredModel: "gpt-5.6-luna",
			configuredEffort: "medium",
			model: "gpt-5.6-luna",
			effort: "medium",
			serviceTier: "priority",
			reason: null,
		},
		voice: {
			kind: "voice",
			state: "active",
			realtimeSessionId,
			transcript: [],
			delivery: "delivered",
			reason: null,
		},
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease: {
			kind: "command_lease",
			commandId,
			paneId,
			childId,
			epoch,
			state: "active",
			expiresAtMs: TEST_NOW + 120_000,
		},
		operation: null,
	});
}

function createTransport(
	paneId: string,
	state: BrowserWorkbenchState,
	target: BrowserWorkbenchCommandTarget | null,
): TestTransport {
	const commands: RecordedCommand[] = [];
	const listeners = new Set<() => void>();
	let currentState = state;
	const currentSnapshot = () => currentState.snapshot;
	const transport: BrowserWorkbenchTransport = {
		captureCommandIntent: () => {
			const authority = transport.captureCommandTarget();
			return { capturedThreadLink: authority.capturedThreadLink, authority };
		},
		executeCommand: (draft, intent) => transport.command(draft, intent?.authority ?? undefined),
		attach: async () => currentState,
		detach: async () => undefined,
		close: async () => undefined,
		refresh: async () => {
			throw new Error("Refresh is outside this frame fixture.");
		},
		setMediaReady: async () => {
			throw new Error("Media is outside this frame fixture.");
		},
		claimLease: async () => {
			const lease = currentSnapshot()?.lease;
			if (lease === null || lease === undefined) throw new Error("No lease.");
			return lease;
		},
		renewLease: async () => {
			const lease = currentSnapshot()?.lease;
			if (lease === null || lease === undefined) throw new Error("No lease.");
			return lease;
		},
		releaseLease: async () => null,
		accountRead: async () => {
			throw new Error("Account reads are outside this frame fixture.");
		},
		command: async (draft, captured) => {
			const snapshot = currentSnapshot();
			if (target === null || snapshot === null) {
				throw new Error("This frame fixture cannot send a command.");
			}
			commands.push({ draft, target: captured });
			return {
				kind: "command_result",
				commandId: target.commandId,
				outcome: "delivered",
				code: null,
				message: null,
				snapshot,
			};
		},
		captureCommandTarget: () => {
			if (target === null) throw new Error("This pane has no command target.");
			return target;
		},
		snapshot: currentSnapshot,
		sequence: () => currentState.sequence,
		lease: () => currentSnapshot()?.lease ?? null,
		state: () => currentState,
		capabilities: () => capabilities(currentState.kind === "readiness"),
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		dispose: async () => undefined,
	};
	const setState = (nextState: BrowserWorkbenchState): void => {
		currentState = nextState;
		for (const listener of listeners) listener();
	};
	const threadId =
		currentSnapshot()?.threadLink.threadId ??
		model.ThreadIdSchema.parse(identity.decoder.adoptThreadId(`thread-${paneId}`));
	return { paneId, transport, commands, target, threadId, setState };
}

export function stoppedTransport(paneId: string): TestTransport {
	return createTransport(
		paneId,
		{
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "The frame fixture keeps this pane stopped.",
		},
		null,
	);
}

export function requestTransport(paneId: string): TestTransport {
	const threadId = model.ThreadIdSchema.parse(identity.decoder.adoptThreadId(`thread-${paneId}`));
	const snapshot = pendingSnapshot(paneId, threadId);
	const target: BrowserWorkbenchCommandTarget = {
		commandId,
		paneId,
		childId,
		epoch,
		capturedThreadLink: snapshot.threadLink,
	};
	return createTransport(
		paneId,
		{
			kind: "readiness",
			state: "thread_capable",
			connection: "connected",
			snapshot,
			sequence: 1,
		},
		target,
	);
}

export function retargetRequestTransportLease(fake: TestTransport, paneId: string): void {
	const state = fake.transport.state();
	if (state.kind !== "readiness" || state.snapshot.lease === null) {
		throw new Error("Only a ready request transport has a lease to retarget.");
	}
	const snapshot = model.BrowserSnapshotSchema.parse({
		...state.snapshot,
		lease: { ...state.snapshot.lease, paneId },
	});
	fake.setState({ ...state, snapshot });
}

export function retainedSnapshotTransport(
	paneId: string,
	stateName: "reconnecting" | "backoff" | "stale_snapshot",
): TestTransport {
	const threadId = model.ThreadIdSchema.parse(identity.decoder.adoptThreadId(`thread-${paneId}`));
	const snapshot = pendingSnapshot(paneId, threadId);
	const common = {
		snapshot,
		sequence: 2,
		reason: `The frame fixture is ${stateName}.`,
	} as const;
	const state: BrowserWorkbenchState =
		stateName === "reconnecting"
			? { ...common, kind: "connection", state: stateName, connection: "reconnecting" }
			: stateName === "backoff"
				? {
						...common,
						kind: "connection",
						state: stateName,
						connection: "reconnecting",
						retryAtMs: TEST_NOW + 1_000,
					}
				: {
						...common,
						kind: "stream",
						state: stateName,
						connection: "connected",
						expectedSequence: 3,
						receivedSequence: 4,
					};
	return createTransport(paneId, state, null);
}

export function framePane(
	identityValue: WorkbenchFramePaneIdentity,
	fake: TestTransport,
): WorkbenchFramePane {
	const composerController = createWorkbenchComposerController({ transport: fake.transport });
	const threadLinkController = createThreadLinkController({
		capturePane: () => ({
			paneId: identityValue.id,
			transport: fake.transport,
			hostRecoveryIntents: [],
		}),
	});
	return {
		identity: identityValue,
		transport: fake.transport,
		timeline: { threadId: fake.threadId, turns: [] },
		composerController,
		threadLink: { controller: threadLinkController },
		boardStatus: {
			connection: "connected",
			claim: { state: "unclaimed" },
			doing: [],
			semanticContext: { state: "unavailable" },
		},
	};
}

export function claimedFramePane(
	identityValue: WorkbenchFramePaneIdentity,
	fake: TestTransport,
): WorkbenchFramePane {
	const pane = framePane(identityValue, fake);
	return {
		...pane,
		boardStatus: {
			...pane.boardStatus,
			claim: {
				state: "claimed",
				holderId: "agent-frame",
				holderKind: "agent",
				claimedAt: "2026-09-04T12:00:00.000Z",
				reason: "Refactoring frame hierarchy",
			},
			doing: [
				{
					doing: "Preserving compact hierarchy",
					at: "2026-09-04T12:01:00.000Z",
					by: "agent-frame",
					kind: "agent",
					claimed: true,
				},
			],
		},
	};
}

export function onePaneView(
	pane: WorkbenchFramePane,
): Extract<WorkbenchFrameView, { readonly state: "ready" }> {
	return { state: "ready", panes: [pane], activePaneId: pane.identity.id };
}

export function mutableRequestFrame(identityValue: WorkbenchFramePaneIdentity, now: () => number) {
	const fake = requestTransport(identityValue.id);
	const pane = framePane(identityValue, fake);
	const request: WorkbenchFrameRequest = {
		state: "present",
		source: captureWorkbenchFrameRequestSource(pane, now),
	};
	return { fake, request, view: onePaneView(pane) };
}
