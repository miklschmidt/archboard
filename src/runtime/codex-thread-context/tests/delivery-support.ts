import type {
	CodexEpochError,
	EpochExecutionProof,
	EpochExecutionRequest,
} from "../../codex-epoch/index.ts";
import type { CodexSession } from "../../codex-session/index.ts";
import type { ArchboardContext } from "../../codex-instructions/index.ts";
import type {
	CodexThreadLinkPort,
	ExecutableThreadLink,
	InspectOnlyThreadLink,
	ThreadLinkBindingSnapshot,
	ThreadLinkCasToken,
	ThreadLinkClassification,
	ThreadLinkReasonCode,
	ThreadLinkSnapshot,
	ThreadLinkStatus,
} from "../../codex-thread-link/index.ts";
import type { SettledSemanticChangeEvent } from "../../codex-semantic-context/index.ts";
import {
	createIdentityAuthority,
	type ChildEpoch,
	type ChildId,
	type IdentityAuthority,
	type ThreadId,
} from "../../../shared/codex-workbench-identity/index.ts";
import {
	canonicalSemanticCursorToken,
	createCodexThreadContextDelivery,
	createCodexThreadContextController,
	type CodexThreadContextBinding,
	type CodexThreadContextController,
	type CodexThreadContextDelivery,
	type CodexThreadContextDeliveryOptions,
	type CodexThreadContextExecution,
	type CodexThreadContextTarget,
} from "../index.ts";

const PANE_ID = "pane-a";
const FEED_ID = "feed-1";
const OPERATION_ID = "operation-1";

type InjectRequest = Parameters<CodexSession["threadInjectItems"]>[0];
type InjectResponse = Awaited<ReturnType<CodexSession["threadInjectItems"]>>;

async function successfulInject(): Promise<InjectResponse> {
	return {};
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

interface EventOptions {
	readonly sequence?: number;
	readonly feedId?: string;
	readonly cursorFeedId?: string;
	readonly changeFeedId?: string;
	readonly origin?: "human" | "agent" | "mixed";
	readonly significance?: "layout" | "structural" | "cosmetic";
	readonly focused?: boolean;
	readonly claimDoing?: string | null;
	readonly doing?: string | null;
	readonly brief?: string;
	readonly stale?: boolean;
}

interface HarnessOptions {
	readonly controller?: boolean;
	readonly initialLink?: ThreadLinkSnapshot;
	readonly classificationLink?: ThreadLinkSnapshot;
	readonly contextValid?: boolean;
	readonly contextCursorSequence?: number;
	readonly contextFocusPaneId?: string | null;
	readonly now?: number;
}

interface Harness {
	readonly authority: IdentityAuthority;
	readonly target: CodexThreadContextTarget;
	readonly delivery: CodexThreadContextDelivery;
	readonly controller: CodexThreadContextController | null;
	readonly received: InjectRequest[];
	readonly events: (options?: EventOptions) => SettledSemanticChangeEvent;
	readonly emit: (event: SettledSemanticChangeEvent) => void;
	readonly setLink: (link: ThreadLinkSnapshot) => void;
	readonly setClassificationLink: (link: ThreadLinkSnapshot) => void;
	readonly setClassifyEffect: (effect: (() => void) | null) => void;
	readonly setClassificationDelay: (delay: ((call: number) => Promise<void>) | null) => void;
	readonly setExecution: (execution: CodexThreadContextExecution | null) => void;
	readonly setNow: (value: number) => void;
	readonly setEpochError: (error: CodexEpochError | null) => void;
	readonly setSessionBehavior: (
		behavior: (request: InjectRequest) => Promise<InjectResponse>,
	) => void;
	readonly holdResponse: () => void;
	readonly resolveResponse: () => void;
	readonly classifyCalls: () => number;
	readonly epochRequests: () => readonly EpochExecutionRequest[];
	readonly flush: () => Promise<void>;
	readonly subscriptionCount: () => number;
	readonly retiredEpochs: () => number;
	readonly readLink: () => ThreadLinkBindingSnapshot;
}

function proofFor(
	authority: IdentityAuthority,
	threadId: ThreadId,
	operationId: string,
): EpochExecutionProof {
	const childId = authority.validator.childId;
	const epoch = authority.validator.epoch;
	return {
		manifestRevision: 1,
		record: {
			correlation: { childId, epoch, operationId },
			operation: { id: operationId, kind: "send_message_to_thread", rpc: "turn/start" },
			status: "committed",
			outcome: "delivered",
			provenance: {
				childId,
				epoch,
				threadId,
				turnId: null,
				threadSource: "appServer",
				workspaceRoot: "/workspace",
				instructionHash: "instruction-hash",
				manifestHash: "manifest-hash",
				confirmedAtMs: 1,
			},
			reason: null,
			createdAtMs: 1,
			updatedAtMs: 1,
		},
	};
}

function executableLink(
	childId: ChildId,
	epoch: ChildEpoch,
	threadId: ThreadId,
): ExecutableThreadLink {
	return Object.freeze({
		kind: "thread_link",
		state: "executable",
		childId,
		epoch,
		threadId,
		source: "appServer",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	});
}

function inspectOnlyLink(
	threadId: ThreadId,
	reason: ThreadLinkReasonCode,
	status: ThreadLinkStatus = reason === "thread_status_system_error"
		? "systemError"
		: reason === "thread_status_not_loaded"
			? "notLoaded"
			: "idle",
): InspectOnlyThreadLink {
	return Object.freeze({
		kind: "thread_link",
		state: "inspect_only",
		childId: null,
		epoch: null,
		threadId,
		source: "appServer",
		status,
		loaded: status !== "notLoaded",
		canAcceptDirectInput: false,
		reason,
	});
}

function unboundLink(): ThreadLinkSnapshot {
	return Object.freeze({
		kind: "thread_link",
		state: "unbound",
		childId: null,
		epoch: null,
		threadId: null,
		source: null,
		status: "notLoaded",
		loaded: false,
		canAcceptDirectInput: false,
		reason: null,
	});
}

function baseContext(
	childId: ChildId,
	epoch: ChildEpoch,
	threadId: ThreadId,
	event: SettledSemanticChangeEvent,
	contextCursorSequence: number | undefined,
	contextFocusPaneId: string | null | undefined,
): ArchboardContext {
	const cursor =
		event.cursor === null
			? null
			: canonicalSemanticCursorToken({
					feedId: event.cursor.feedId,
					sequence: contextCursorSequence ?? event.cursor.sequence,
				});
	const focusPaneId =
		contextFocusPaneId === undefined
			? event.pane.focused
				? event.pane.paneId
				: null
			: contextFocusPaneId;
	return {
		schema: 1,
		paneId: PANE_ID,
		board: { note: event.board.note, version: event.version ?? 7, cursor },
		threadLink: { state: "executable", reason: null },
		child: { id: childId, epoch },
		workhorse: { threadId, turnId: event.workhorse.turnId },
		coordinator: { ...event.coordinator },
		semantic: {
			brief: event.brief,
			capturedAtMs: event.freshness.capturedAtMs,
			freshUntilMs: event.freshness.freshUntilMs,
			truncated: event.truncated,
		},
		focus: { paneId: focusPaneId, capturedAtMs: event.freshness.capturedAtMs },
		selection: {
			elementIds: [...event.selection],
			capturedAtMs: event.freshness.capturedAtMs,
		},
		claim: { ...event.claim },
		ambiguity: [...event.ambiguity],
		operation: { id: null, kind: null, rpc: null, outcome: null },
	};
}

function createHarness(options: HarnessOptions = {}): Harness {
	const authority = createIdentityAuthority();
	const childId = authority.validator.childId;
	const epoch = authority.validator.epoch;
	const threadId = authority.decoder.adoptThreadId("workhorse");
	const target: CodexThreadContextTarget = Object.freeze({
		threadId,
		childId,
		epoch,
		operationId: OPERATION_ID,
	});
	let execution: CodexThreadContextExecution | null = { childId, epoch };
	let link: ThreadLinkSnapshot = options.initialLink ?? executableLink(childId, epoch, threadId);
	let classification = options.classificationLink ?? link;
	let classifyEffect: (() => void) | null = null;
	let classificationDelay: ((call: number) => Promise<void>) | null = null;
	let revision = 1;
	let classifyCount = 0;
	let now = options.now ?? 150;
	let epochError: CodexEpochError | null = null;
	const received: InjectRequest[] = [];
	const epochRequests: EpochExecutionRequest[] = [];
	let behavior: (request: InjectRequest) => Promise<InjectResponse> = successfulInject;
	let resolveHeld: (() => void) | null = null;
	let listener: ((event: SettledSemanticChangeEvent) => void) | null = null;
	let subscriptions = 0;
	let retired = 0;

	const read = (): ThreadLinkBindingSnapshot => {
		const cas: ThreadLinkCasToken = {
			revision,
			paneId: PANE_ID,
			childId: link.state === "executable" ? link.childId : null,
			epoch: link.state === "executable" ? link.epoch : null,
			threadId: link.state === "unbound" ? null : link.threadId,
		};
		return Object.freeze({ paneId: PANE_ID, revision, link, cas });
	};
	const threadLink: Pick<CodexThreadLinkPort, "read" | "classify"> = {
		read,
		classify: async () => {
			classifyCount++;
			classifyEffect?.();
			await classificationDelay?.(classifyCount);
			const current =
				classification.state === "unbound"
					? executableLink(childId, epoch, threadId)
					: classification;
			const currentEpoch =
				current.state === "executable" ? { childId: current.childId, epoch: current.epoch } : null;
			const result: ThreadLinkClassification = {
				link: current,
				thread: null,
				observation: {
					persisted: current.state === "executable",
					persistedRows: current.state === "executable" ? 1 : 0,
					loaded: current.loaded,
					loadedOccurrences: current.loaded ? 1 : 0,
					source: current.source ?? "unknown",
					status: current.status,
					canAcceptDirectInput: current.canAcceptDirectInput,
				},
				currentEpoch,
				proof: current.state === "executable" ? proofFor(authority, threadId, OPERATION_ID) : null,
			};
			return result;
		},
	};
	const epochPort: CodexThreadContextDeliveryOptions["epoch"] = {
		assertCurrent: (request) => {
			epochRequests.push(request);
			if (epochError !== null) {
				throw epochError;
			}
			return proofFor(authority, threadId, request.operationId);
		},
	};
	const session: Pick<CodexSession, "threadInjectItems"> = {
		threadInjectItems: (request) => {
			received.push(request);
			return behavior(request);
		},
	};
	const contextForEvent = (event: SettledSemanticChangeEvent): ArchboardContext => {
		const context = baseContext(
			childId,
			epoch,
			threadId,
			event,
			options.contextCursorSequence,
			options.contextFocusPaneId,
		);
		if (options.contextValid === false) {
			return { ...context, semantic: { ...context.semantic, brief: "wrong-brief" } };
		}
		return context;
	};
	const publisher = {
		subscribeSettledChange(next: (event: SettledSemanticChangeEvent) => void) {
			subscriptions++;
			listener = next;
			return () => {
				listener = null;
			};
		},
	};
	const common = {
		feedId: FEED_ID,
		now: () => now,
		publisher,
		session,
		threadLink,
		identity: authority,
		epoch: epochPort,
		currentExecution: () => execution,
	};
	const controller = options.controller
		? createCodexThreadContextController({
				...common,
				hooks: { contextForEvent },
				retireEpoch: () => void retired++,
			})
		: null;
	const delivery =
		controller ??
		createCodexThreadContextDelivery({
			...common,
			paneId: PANE_ID,
			target,
			contextForEvent,
		});

	const events = (eventOptions: EventOptions = {}): SettledSemanticChangeEvent => {
		const sequence = eventOptions.sequence ?? 1;
		const feedId = eventOptions.feedId ?? FEED_ID;
		const cursorFeedId = eventOptions.cursorFeedId ?? feedId;
		const changeFeedId = eventOptions.changeFeedId ?? feedId;
		const origin = eventOptions.origin ?? "human";
		const significance = eventOptions.significance ?? "structural";
		const focused = eventOptions.focused ?? true;
		const claimDoing = eventOptions.claimDoing ?? null;
		const doing = eventOptions.doing ?? null;
		const cursor = Object.freeze({ feedId: cursorFeedId, sequence });
		return Object.freeze({
			kind: "settled_change" as const,
			source: "settled_change" as const,
			origin,
			feedId,
			repository: "archboard",
			child: { id: childId, epoch },
			threadLink: { state: "executable" as const, reason: null },
			workhorse: { threadId, turnId: null },
			coordinator: { threadId: null, realtimeSessionId: null },
			board: { key: "payments", note: "boards/payments.excalidraw.md" },
			pane: { paneId: PANE_ID, focused },
			version: 7,
			selection: [],
			claim: { holder: "none" as const, doing: claimDoing },
			doing,
			cursor,
			description: "A settled human architecture change.",
			freshness: {
				capturedAtMs: 100,
				freshUntilMs: 200,
				state: eventOptions.stale ? ("stale" as const) : ("fresh" as const),
			},
			truncated: false,
			ambiguity: [],
			staleness: {
				state: eventOptions.stale ? ("stale" as const) : ("current" as const),
				reasons: eventOptions.stale ? ["old cursor"] : [],
			},
			brief: eventOptions.brief ?? `brief-${sequence}`,
			bytes: 10,
			change: {
				feedId: changeFeedId,
				cursor,
				board: "payments",
				at: new Date(100).toISOString(),
				origin,
				significance,
				text: "A settled human architecture change.",
			},
		});
	};
	return {
		authority,
		target,
		delivery,
		controller,
		received,
		events,
		emit: (event) => listener?.(event),
		setLink: (next) => {
			link = next;
			revision++;
		},
		setClassificationLink: (next) => {
			classification = next;
		},
		setClassifyEffect: (effect) => {
			classifyEffect = effect;
		},
		setClassificationDelay: (delay) => {
			classificationDelay = delay;
		},
		setExecution: (next) => {
			execution = next;
		},
		setNow: (next) => {
			now = next;
		},
		setEpochError: (next) => {
			epochError = next;
		},
		setSessionBehavior: (next) => {
			behavior = next;
		},
		holdResponse: () => {
			behavior = async () =>
				new Promise<InjectResponse>((resolve) => {
					resolveHeld = () => resolve({});
				});
		},
		resolveResponse: () => {
			resolveHeld?.();
			resolveHeld = null;
		},
		classifyCalls: () => classifyCount,
		epochRequests: () => Object.freeze([...epochRequests]),
		flush: flushMicrotasks,
		subscriptionCount: () => subscriptions,
		retiredEpochs: () => retired,
		readLink: read,
	};
}

function bindingFor(harness: Harness): CodexThreadContextBinding {
	return Object.freeze({
		paneId: PANE_ID,
		target: harness.target,
		link: harness.readLink(),
	});
}

export {
	PANE_ID,
	FEED_ID,
	type EventOptions,
	type Harness,
	executableLink,
	inspectOnlyLink,
	unboundLink,
	createHarness,
	bindingFor,
};
