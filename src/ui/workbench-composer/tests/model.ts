import { BrowserWorkbenchTransportError } from "../../workbench-transport/index.js";
import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
} from "../../../shared/codex-browser-model/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserCommandDraft,
	BrowserCommandName,
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandIntent,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import type { WorkbenchComposerTransport } from "../index.js";

/**
 * Fixtures are built through the closed browser model with a real identity
 * authority, so a snapshot the contract would refuse fails here instead of
 * proving something about a shape the host can never publish.
 */
const authorities = createIdentityAuthorities();
const authority = authorities.identity;
export const model = createCodexBrowserModel(authorities);

export const CHILD = model.ChildIdSchema.parse(authority.validator.childId);
export const EPOCH = model.ChildEpochSchema.parse(authority.validator.epoch);
export const THREAD = model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("workhorse-a"));
export const OTHER_THREAD = model.ThreadIdSchema.parse(
	authority.decoder.adoptThreadId("workhorse-b"),
);
export const TURN = model.TurnIdSchema.parse(authority.decoder.adoptTurnId("turn-a"));
export const OTHER_TURN = model.TurnIdSchema.parse(authority.decoder.adoptTurnId("turn-b"));
export const ITEM = model.ItemIdSchema.parse(authority.decoder.adoptItemId("item-a"));
export const COMMAND_ID = model.BrowserCommandIdSchema.parse(
	authority.issuer.mintBrowserCommandId(),
);
export const PANE = "primary";

type TurnStatus = NonNullable<BrowserSnapshot["timeline"]>["turns"][number]["status"];

export function executableLink(
	threadId: BrowserSnapshot["threadLink"]["threadId"] = THREAD,
): BrowserSnapshot["threadLink"] {
	return model.BrowserThreadLinkSchema.parse({
		kind: "thread_link",
		state: "executable",
		childId: CHILD,
		epoch: EPOCH,
		threadId,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	});
}

export function inspectOnlyLink(reason: string): BrowserSnapshot["threadLink"] {
	return model.BrowserThreadLinkSchema.parse({
		kind: "thread_link",
		state: "inspect_only",
		childId: null,
		epoch: null,
		threadId: THREAD,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: false,
		reason,
	});
}

export function unboundLink(reason: string | null = null): BrowserSnapshot["threadLink"] {
	return model.BrowserThreadLinkSchema.parse({
		kind: "thread_link",
		state: "unbound",
		childId: null,
		epoch: null,
		threadId: null,
		sourcePresentation: null,
		status: "notLoaded",
		loaded: false,
		canAcceptDirectInput: false,
		reason,
	});
}

export type TurnEntry = readonly [turnId: typeof TURN, status: TurnStatus];

export function timeline(
	entries: readonly TurnEntry[] = [],
	threadId: typeof THREAD = THREAD,
): NonNullable<BrowserSnapshot["timeline"]> {
	return model.BrowserTimelineSchema.parse({
		kind: "timeline",
		threadId,
		turns: entries.map(([turnId, status]) => ({
			turnId,
			status,
			items: [{ media: "text", itemId: ITEM, text: "Working." }],
			summary: "A Codex turn",
			outputsIncluded: true,
			outputsTruncated: false,
		})),
		nextCursor: null,
	});
}

export function snapshot(overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
	return model.BrowserSnapshotSchema.parse({
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: executableLink(),
		threadCandidates: {
			kind: "thread_candidates",
			state: "unknown",
			records: [],
			truncated: false,
			reason: null,
		},
		timeline: timeline(),
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("coordinator-a")),
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
		...overrides,
	});
}

export function connected(value = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 7,
	};
}

export function reconnecting(reason: string): BrowserWorkbenchState {
	return {
		kind: "connection",
		state: "reconnecting",
		connection: "reconnecting",
		snapshot: snapshot(),
		sequence: 7,
		reason,
	};
}

export function notThreadCapable(): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "signed_out",
		connection: "connected",
		snapshot: snapshot({ account: { kind: "account", state: "signed_out" } }),
		sequence: 7,
	};
}

export function commandTarget(): BrowserWorkbenchCommandTarget {
	return {
		commandId: COMMAND_ID,
		paneId: PANE,
		childId: CHILD,
		epoch: EPOCH,
		capturedThreadLink: executableLink(),
	};
}

export function commandIntent(): BrowserWorkbenchCommandIntent {
	const captured = commandTarget();
	return { capturedThreadLink: captured.capturedThreadLink, authority: captured };
}

export function capabilities(): BrowserWorkbenchCapabilities {
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
		supportsCommand: (_name: BrowserCommandName) => true,
	};
}

export function commandResult(
	overrides: Partial<BrowserWorkbenchCommandResult> = {},
): BrowserWorkbenchCommandResult {
	return {
		kind: "command_result",
		commandId: COMMAND_ID,
		outcome: "delivered",
		code: null,
		message: null,
		turnId: TURN,
		snapshot: snapshot({ timeline: timeline([[TURN, "inProgress"]]) }),
		...overrides,
	};
}

export interface RecordedCommand {
	readonly draft: BrowserCommandDraft;
	readonly target: BrowserWorkbenchCommandIntent | BrowserWorkbenchCommandTarget | undefined;
}

export interface FakeComposerTransport extends WorkbenchComposerTransport {
	readonly sent: RecordedCommand[];
	readonly setState: (next: BrowserWorkbenchState) => void;
}

export interface FakeComposerTransportOptions {
	readonly state?: BrowserWorkbenchState;
	readonly target?: BrowserWorkbenchCommandTarget | null;
	readonly command?: (recorded: RecordedCommand) => Promise<BrowserWorkbenchCommandResult>;
}

/**
 * A transport double that records what left the browser. Only the three members
 * the composer's contract names are implemented, because the composer reaches
 * for nothing else.
 */
export function fakeComposerTransport(
	options: FakeComposerTransportOptions = {},
): FakeComposerTransport {
	const sent: RecordedCommand[] = [];
	let current = options.state ?? connected();
	const target = options.target === undefined ? commandTarget() : options.target;
	return {
		sent,
		setState: (next) => {
			current = next;
		},
		state: () => current,
		captureCommandIntent: () => {
			if (target === null)
				throw new BrowserWorkbenchTransportError(
					"not_ready",
					"The workbench is not ready to capture an action.",
				);
			return { capturedThreadLink: target.capturedThreadLink, authority: target };
		},
		executeCommand: async (draft, commandTargetValue) => {
			const recorded: RecordedCommand = { draft, target: commandTargetValue };
			sent.push(recorded);
			if (options.command !== undefined) return options.command(recorded);
			return commandResult();
		},
	};
}

function unsupportedTransportMember(): never {
	throw new Error("The composer owner does not exercise this transport member.");
}

/** The full transport the runtime provider needs, backed by the same double. */
export function runtimeTransport(fake: FakeComposerTransport): BrowserWorkbenchTransport {
	const listeners = new Set<() => void>();
	const unsupported = unsupportedTransportMember;
	return {
		attach: unsupported,
		detach: unsupported,
		close: unsupported,
		refresh: unsupported,
		setMediaReady: unsupported,
		claimLease: unsupported,
		renewLease: unsupported,
		releaseLease: unsupported,
		accountRead: unsupported,
		command: unsupported,
		captureCommandTarget: unsupported,
		executeCommand: fake.executeCommand,
		captureCommandIntent: fake.captureCommandIntent,
		capabilities,
		snapshot: () => fake.state().snapshot,
		sequence: () => fake.state().sequence,
		lease: () => null,
		state: fake.state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		dispose: async () => {
			listeners.clear();
		},
	};
}
