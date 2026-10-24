import { type WorkbenchExecutionContext } from "#runtime/protocol/host/context.ts";
import { TEST_CONTEXT_CODEC, testContextFixture } from "#tests/runtime/support/host.ts";
import { type WorkbenchContextEvent } from "#runtime/protocol/host/context-source.ts";
import {
	type CodexEpochError,
	type EpochExecutionProof,
	type EpochExecutionRequest,
} from "#runtime/store/epoch/contract.ts";
import type { CodexSession } from "@archboard/codex-app-server/session";
import {
	type CodexThreadLinkPort,
	type ExecutableThreadLink,
	type InspectOnlyThreadLink,
	type ThreadLinkBindingSnapshot,
	type ThreadLinkCasToken,
	type ThreadLinkClassification,
	type ThreadLinkReasonCode,
	type ThreadLinkSnapshot,
	type ThreadLinkStatus,
} from "#runtime/rules/thread-link/contract.ts";
import {
	createIdentityAuthority,
	type ChildEpoch,
	type ChildId,
	type IdentityAuthority,
	type ThreadId,
} from "@archboard/codex-app-server/identity";
import { createCodexThreadContextDelivery } from "#runtime/services/thread-context/delivery.ts";
import { createCodexThreadContextController } from "#runtime/services/thread-context/controller.ts";
import {
	type CodexThreadContextBinding,
	type CodexThreadContextController,
	type CodexThreadContextDelivery,
	type CodexThreadContextDeliveryOptions,
	type CodexThreadContextExecution,
	type CodexThreadContextTarget,
} from "#runtime/services/thread-context/contract.ts";
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
	/** The agent session that made the change, or null for one nobody attributed. */
	readonly by?: string | null;
	readonly significance?: "layout" | "structural" | "cosmetic";
	readonly focused?: boolean;
	readonly claimDoing?: string | null;
	readonly doing?: string | null;
	readonly brief?: string;
	readonly stale?: boolean;
}
interface HarnessOptions {
	readonly controller?: boolean;
	/** The threads whose writes this port should treat as its own session's. */
	readonly sessionAuthors?: readonly string[];
	readonly initialLink?: ThreadLinkSnapshot;
	readonly classificationLink?: ThreadLinkSnapshot;
	readonly contextValid?: boolean;
	/** Alters one architectural field of the built context, to prove it is checked. */
	readonly forgeContext?: (context: WorkbenchExecutionContext) => WorkbenchExecutionContext;
	readonly contextCursorSequence?: number;
	readonly contextFocusPaneId?: string | null;
	readonly now?: number;
}
interface Harness {
	/** Replace the threads this port's session writes as, as a restart or New conversation does. */
	readonly becomeSession: (threads: readonly string[]) => void;
	readonly authority: IdentityAuthority;
	readonly target: CodexThreadContextTarget;
	readonly delivery: CodexThreadContextDelivery;
	readonly controller: CodexThreadContextController | null;
	readonly received: InjectRequest[];
	readonly events: (options?: EventOptions) => WorkbenchContextEvent;
	readonly emit: (event: WorkbenchContextEvent) => void;
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
	let listener: ((event: WorkbenchContextEvent) => void) | null = null;
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
	const contextForEvent = (event: WorkbenchContextEvent): WorkbenchExecutionContext => ({
		...testContextFixture,
		paneId: PANE_ID,
		child: { id: childId, epoch },
		workhorse: { threadId, turnId: event.workhorse.turnId },
		coordinator: event.coordinator,
		semantic: {
			brief: event.brief,
			capturedAtMs: event.freshness.capturedAtMs,
			freshUntilMs: event.freshness.freshUntilMs,
			truncated: event.truncated,
		},
	});

	const publisher = {
		subscribeSettledChange(next: (event: WorkbenchContextEvent) => void) {
			subscriptions++;
			listener = next;
			return () => {
				listener = null;
			};
		},
	};
	const common = {
		contextCodec: TEST_CONTEXT_CODEC,

		feedId: FEED_ID,
		now: () => now,
		publisher,
		session,
		threadLink,
		identity: authority,
		epoch: epochPort,
		currentExecution: () => execution,
	};
	// The threads this port's session writes as, mutable because the live
	// article is: a coordinator is created and restarted inside one workhorse's
	// life, and New conversation gives the port a different thread to be.
	let sessionAuthors: readonly string[] = options.sessionAuthors ?? [threadId];
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
			// The threads this port's own session writes as: its workhorse, and the
			// coordinator paired with it when a harness names one.
			sessionAuthors: () => sessionAuthors,
		});
	const events = (input: EventOptions = {}): WorkbenchContextEvent => {
		const sequence = input.sequence ?? 1;
		const feedId = input.feedId ?? FEED_ID;
		const cursor = { feedId: input.cursorFeedId ?? feedId, sequence };
		const origin = input.origin ?? "human";
		return {
			source: "settled_change",
			origin,
			feedId,
			cursor,
			child: { id: childId, epoch },
			threadLink: { state: "executable", reason: null },
			workhorse: { threadId, turnId: null },
			coordinator: { threadId: null, realtimeSessionId: null },
			freshness: { capturedAtMs: 100, freshUntilMs: 200, state: input.stale ? "stale" : "fresh" },
			truncated: false,
			staleness: { state: input.stale ? "stale" : "current" },
			brief: input.brief ?? `brief-${sequence}`,
			change: {
				feedId: input.changeFeedId ?? feedId,
				cursor,
				origin,
				significance: input.significance ?? "structural",
				by: input.by ?? null,
			},
		};
	};

	return {
		/**
		 * Replace the threads this port's session writes as, as a restart or a
		 * new conversation does.
		 * @param threads The session's threads now.
		 */
		becomeSession: (threads: readonly string[]): void => {
			sessionAuthors = threads;
		},
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
