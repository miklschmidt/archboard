// Fixtures built through the closed browser model with a real identity
// authority, so a snapshot the contract would refuse fails here instead of
// proving something about a shape the host can never publish.

import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
	type BrowserSnapshot,
} from "@/shared/codex-browser-model";
import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import {
	BrowserWorkbenchTransportError,
	type BrowserCommandDraft,
	type BrowserWorkbenchCommandIntent,
	type BrowserWorkbenchCommandResult,
	type BrowserWorkbenchCommandTarget,
	type BrowserWorkbenchState,
} from "@/ui/workbench-transport";
import type { WorkbenchComposerTransport } from "@/ui/workbench-composer";

const authorities = createIdentityAuthorities();
const authority = authorities.identity;
const model = createCodexBrowserModel(authorities);

const CHILD = model.ChildIdSchema.parse(authority.validator.childId);
const EPOCH = model.ChildEpochSchema.parse(authority.validator.epoch);
const THREAD = model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("workhorse-a"));
const OTHER_THREAD = model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("workhorse-b"));
const TURN = model.TurnIdSchema.parse(authority.decoder.adoptTurnId("turn-a"));
const OTHER_TURN = model.TurnIdSchema.parse(authority.decoder.adoptTurnId("turn-b"));
const ITEM = model.ItemIdSchema.parse(authority.decoder.adoptItemId("item-a"));
const COMMAND_ID = model.BrowserCommandIdSchema.parse(authority.issuer.mintBrowserCommandId());
const PANE = "primary";

type TurnStatus = NonNullable<BrowserSnapshot["timeline"]>["turns"][number]["status"];

/**
 * An executable link.
 * @param threadId The thread it names.
 * @returns The link.
 */
function executableLink(
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

/**
 * An inspect-only link.
 * @param reason The host's reason.
 * @returns The link.
 */
function inspectOnlyLink(reason: string): BrowserSnapshot["threadLink"] {
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

/**
 * An unbound link.
 * @param reason The host's reason, or null.
 * @returns The link.
 */
function unboundLink(reason: string | null = null): BrowserSnapshot["threadLink"] {
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

type TurnEntry = readonly [turnId: typeof TURN, status: TurnStatus];

/**
 * A timeline of turns.
 * @param entries The turns and their statuses.
 * @param threadId The thread.
 * @returns The timeline.
 */
function timeline(
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

/**
 * A thread-capable snapshot.
 * @param overrides The fields to replace.
 * @returns The snapshot.
 */
function snapshot(overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
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

/**
 * A connected thread-capable state.
 * @param value The snapshot.
 * @returns The state.
 */
function connected(value = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 7,
	};
}

/**
 * A reconnecting state.
 * @param reason The reason.
 * @returns The state.
 */
function reconnecting(reason: string): BrowserWorkbenchState {
	return {
		kind: "connection",
		state: "reconnecting",
		connection: "reconnecting",
		snapshot: snapshot(),
		sequence: 7,
		reason,
	};
}

/**
 * A connected state that is not thread-capable.
 * @returns The state.
 */
function notThreadCapable(): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "signed_out",
		connection: "connected",
		snapshot: snapshot({ account: { kind: "account", state: "signed_out" } }),
		sequence: 7,
	};
}

/**
 * The command target the double captures.
 * @returns The target.
 */
function commandTarget(): BrowserWorkbenchCommandTarget {
	return {
		commandId: COMMAND_ID,
		paneId: PANE,
		childId: CHILD,
		epoch: EPOCH,
		capturedThreadLink: executableLink(),
	};
}

/**
 * The intent the double captures.
 * @returns The intent.
 */
function commandIntent(): BrowserWorkbenchCommandIntent {
	const captured = commandTarget();
	return { capturedThreadLink: captured.capturedThreadLink, authority: captured };
}

/**
 * A delivered command result.
 * @param overrides The fields to replace.
 * @returns The result.
 */
function commandResult(
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

/** One recorded dispatch. */
interface RecordedCommand {
	readonly draft: BrowserCommandDraft;
	readonly target: BrowserWorkbenchCommandIntent | undefined;
}

/** How the double answers a dispatch. */
type CommandAnswer = (recorded: RecordedCommand) => Promise<BrowserWorkbenchCommandResult>;

/** The double, with what it recorded and ways to move its state and answers. */
interface FakeComposerTransport extends WorkbenchComposerTransport {
	readonly sent: RecordedCommand[];
	readonly setState: (next: BrowserWorkbenchState) => void;
	readonly setCommand: (answer: CommandAnswer) => void;
}

/** How the double answers. */
interface FakeComposerTransportOptions {
	readonly state?: BrowserWorkbenchState;
	readonly target?: BrowserWorkbenchCommandTarget | null;
}

/**
 * The default answer: delivered.
 * @returns A delivered result.
 */
function deliveredAnswer(): Promise<BrowserWorkbenchCommandResult> {
	return Promise.resolve(commandResult());
}

/**
 * An answer that resolves with one fixed result.
 * @param result The result.
 * @returns The answer.
 */
function answering(result: BrowserWorkbenchCommandResult): CommandAnswer {
	return () => Promise.resolve(result);
}

/**
 * An answer that rejects with one error.
 * @param error The error.
 * @returns The answer.
 */
function refusing(error: Error): CommandAnswer {
	return async () => {
		throw error;
	};
}

/**
 * A transport double that records what left the browser. Only the three
 * members the composer's contract names are implemented.
 * @param options How it answers.
 * @returns The double.
 */
function fakeComposerTransport(options: FakeComposerTransportOptions = {}): FakeComposerTransport {
	const sent: RecordedCommand[] = [];
	let current = options.state ?? connected();
	let answer: CommandAnswer = deliveredAnswer;
	const target = options.target === undefined ? commandTarget() : options.target;
	/**
	 * Move the state.
	 * @param next The state.
	 */
	function setState(next: BrowserWorkbenchState): void {
		current = next;
	}
	/**
	 * The state.
	 * @returns The state.
	 */
	function state(): BrowserWorkbenchState {
		return current;
	}
	/**
	 * Capture the intent, or refuse when the double has no target.
	 * @returns The intent.
	 */
	function captureCommandIntent(): BrowserWorkbenchCommandIntent {
		if (target === null) {
			throw new BrowserWorkbenchTransportError(
				"not_ready",
				"The workbench is not ready to capture an action.",
			);
		}
		return { capturedThreadLink: target.capturedThreadLink, authority: target };
	}
	/**
	 * Record a dispatch and answer it.
	 * @param draft The draft.
	 * @param intent The captured intent.
	 * @returns The result.
	 */
	async function executeCommand(
		draft: BrowserCommandDraft,
		intent?: BrowserWorkbenchCommandIntent,
	): Promise<BrowserWorkbenchCommandResult> {
		const recorded: RecordedCommand = { draft, target: intent };
		sent.push(recorded);
		return answer(recorded);
	}
	/**
	 * Replace how dispatches are answered.
	 * @param next The answer.
	 */
	function setCommand(next: CommandAnswer): void {
		answer = next;
	}
	return { sent, setState, setCommand, state, captureCommandIntent, executeCommand };
}

export {
	CHILD,
	COMMAND_ID,
	EPOCH,
	ITEM,
	OTHER_THREAD,
	OTHER_TURN,
	PANE,
	THREAD,
	TURN,
	commandIntent,
	commandResult,
	commandTarget,
	connected,
	executableLink,
	answering,
	fakeComposerTransport,
	refusing,
	inspectOnlyLink,
	model,
	notThreadCapable,
	reconnecting,
	snapshot,
	timeline,
	unboundLink,
	type CommandAnswer,
	type FakeComposerTransport,
	type RecordedCommand,
	type TurnEntry,
};
