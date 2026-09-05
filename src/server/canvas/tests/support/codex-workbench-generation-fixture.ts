import {
	CODEX_SESSION_CONTROL,
	createCodexSession,
	type ControlledCodexSession,
} from "../../../../runtime/codex-session/index.js";
import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "../../../../shared/codex-workbench-identity/index.js";
import type {
	CodexWorkbenchComponentFactories,
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationHooks,
} from "../../codex-workbench-generation.js";
import { generationContextFixture } from "./codex-workbench-generation-values.js";

export { CODEX_WORKBENCH_COMPONENT_ORDER } from "./codex-workbench-generation-values.js";

function unavailable(owner: string): never {
	throw new Error(`The generation fixture does not implement ${owner}.`);
}

type ExitListener = Parameters<CodexWorkbenchComponents["transport"]["onExit"]>[0];
export type RequestListener = Parameters<
	CodexWorkbenchComponents["transport"]["onServerRequest"]
>[0];
export type NotificationListener = Parameters<
	CodexWorkbenchComponents["transport"]["onServerNotification"]
>[0];

export interface CodexWorkbenchGenerationFixture {
	readonly identityLedger: ReturnType<typeof createIdentityLedger>;
	readonly components: CodexWorkbenchComponents;
	readonly factories: CodexWorkbenchComponentFactories;
	readonly hooks: CodexWorkbenchGenerationHooks;
	readonly calls: ReadonlyMap<string, number>;
	readonly requestListeners: RequestListener[];
	readonly notificationListeners: NotificationListener[];
	readonly replaceApprovals: (value: CodexWorkbenchComponents["approvals"]) => void;
	readonly replaceGateway: (value: CodexWorkbenchComponents["gateway"]) => void;
}

export function createCodexWorkbenchGenerationFixture(
	events: string[],
): CodexWorkbenchGenerationFixture {
	const identityLedger = createIdentityLedger();
	const identity = createIdentityAuthorities(identityLedger);
	const exitListeners = new Set<ExitListener>();
	const requestListeners: RequestListener[] = [];
	const notificationListeners: NotificationListener[] = [];
	let transportState: "open" | "closed" = "open";
	const epoch = {
		rootDirectory: "/fixture/epoch",
		manifestPath: "/fixture/epoch/manifest.json",
		recordsPath: "/fixture/epoch/records.jsonl",
		lockPath: "/fixture/epoch/lock",
		snapshot: () => unavailable("epoch.snapshot"),
		stageEpoch: () => unavailable("epoch.stageEpoch"),
		startEpoch: () => unavailable("epoch.startEpoch"),
		commitEpoch: () => unavailable("epoch.commitEpoch"),
		stageOperation: () => unavailable("epoch.stageOperation"),
		commitOperation: () => unavailable("epoch.commitOperation"),
		rollbackOperation: () => unavailable("epoch.rollbackOperation"),
		markOutcomeUnknown: () => unavailable("epoch.markOutcomeUnknown"),
		confirmOutcome: () => unavailable("epoch.confirmOutcome"),
		assertCurrent: () => unavailable("epoch.assertCurrent"),
		canExecute: () => false,
		close: () => void events.push("epoch:close"),
	} satisfies CodexWorkbenchComponents["epoch"];
	const transport = {
		replaceIdentity: () => undefined,
		request: async () => {
			throw new Error("The generation fixture does not issue transport requests.");
		},
		sendNotification: async () => undefined,
		registerDynamicDispatcher: (registration: { readonly namespace: string }) =>
			void events.push(`dynamic:install:${registration.namespace}`),
		ownsPendingReverseRequest: () => false,
		respond: async () => undefined,
		onServerRequest: (listener: RequestListener) => {
			events.push("router:install");
			requestListeners.push(listener);
			return () => void events.push("router:remove");
		},
		onServerNotification: (listener: NotificationListener) => {
			events.push("notifications:install");
			notificationListeners.push(listener);
			return () => void events.push("notifications:remove");
		},
		onIssue: () => () => undefined,
		onStderr: () => () => undefined,
		onExit: (listener: ExitListener) => {
			events.push("child-exit:install");
			exitListeners.add(listener);
			return () => {
				exitListeners.delete(listener);
				events.push("child-exit:remove");
			};
		},
		inspect: () => ({
			state: transportState,
			pendingRequests: 0,
			pendingReverseRequests: 0,
			pendingReverseBytes: 0,
			queuedFrames: 0,
			queuedBytes: 0,
			writeInFlight: false,
			maxQueuedFrames: 1,
			maxQueuedBytes: 1,
			responseQueuedFrames: 0,
			responseQueuedBytes: 0,
			maxResponseQueuedFrames: 1,
			maxResponseQueuedBytes: 1,
			maxPendingReverseRequests: 1,
			maxPendingReverseBytes: 1,
		}),
		inspectLateResponses: () => [],
		inspectIssues: () => [],
		inspectStderr: () => ({ text: "", retainedBytes: 0, totalBytes: 0, truncated: false }),
		shutdown: async () => {
			transportState = "closed";
			events.push("transport:shutdown");
			for (const listener of exitListeners) {
				listener({
					child: identity.identity.validator.childId,
					epoch: identity.identity.validator.epoch,
					code: 0,
					signal: null,
				});
			}
		},
	} satisfies CodexWorkbenchComponents["transport"];
	const baseSession = createCodexSession({
		transport,
		identity: identity.identity,
		storage: {
			codexHome: "/fixture/codex-home",
			sqliteHome: "/fixture/sqlite-home",
			configPath: "/fixture/codex-home/config.toml",
		},
		checkoutRoot: "/fixture/checkout",
		listenerOwnership: "composition",
	});
	const session = {
		...baseSession,
		respondCurrentTime: async (value: { readonly method: string }) =>
			void events.push(`session:${value.method}`),
		respondUnsupportedTokenRefresh: async (value: { readonly method: string }) =>
			void events.push(`session:${value.method}`),
		respondUnsupportedAttestation: async (value: { readonly method: string }) =>
			void events.push(`session:${value.method}`),
		[CODEX_SESSION_CONTROL]: {
			...baseSession[CODEX_SESSION_CONTROL],
			dispose: () => void events.push("session:dispose"),
		},
	} satisfies ControlledCodexSession;
	const threadLink = {
		classify: async () => unavailable("threadLink.classify"),
		discoverCandidates: async () => unavailable("threadLink.discoverCandidates"),
		bindCandidate: async () => unavailable("threadLink.bindCandidate"),
		classifyAndBind: async () => unavailable("threadLink.classifyAndBind"),
		snapshot: () => unavailable("threadLink.snapshot"),
		read: () => unavailable("threadLink.read"),
		compareAndSwap: () => unavailable("threadLink.compareAndSwap"),
		clear: () => unavailable("threadLink.clear"),
	} satisfies CodexWorkbenchComponents["threadLink"];
	const workhorse = {
		start: async () => unavailable("workhorse.start"),
		snapshot: () => ({
			kind: "codex_workhorse",
			state: "unbound",
			paneId: null,
			childId: null,
			epoch: null,
			threadId: null,
			operationId: null,
			outcome: null,
			start: null,
			binding: null,
			cleanup: null,
			reason: null,
		}),
	} satisfies CodexWorkbenchComponents["workhorse"];
	const semanticPublisher = {
		subscribeSettledChange: () => () => undefined,
		subscribePaneFocus: () => () => undefined,
		subscribePaneSelection: () => () => undefined,
		publishPaneFocus: () => unavailable("semanticPublisher.publishPaneFocus"),
		publishPaneSelection: () => unavailable("semanticPublisher.publishPaneSelection"),
		freshBrief: () => unavailable("semanticPublisher.freshBrief"),
		freshBriefFor: () => unavailable("semanticPublisher.freshBriefFor"),
		drainListenerFailures: () => ({ entries: [], droppedCount: 0 }),
		dispose: () => void events.push("publisher:dispose"),
	} satisfies CodexWorkbenchComponents["semanticPublisher"];
	const realtime = {
		createOffer: async () => unavailable("realtime.createOffer"),
		onSemanticEvent: () => () => undefined,
		appendText: async () => unavailable("realtime.appendText"),
		appendSpeech: async () => unavailable("realtime.appendSpeech"),
		stop: async () => unavailable("realtime.stop"),
		recover: async () => unavailable("realtime.recover"),
		onNotification: () => undefined,
		transcript: () => [],
		generation: () => null,
		dispose: () => void events.push("realtime:dispose"),
	} satisfies CodexWorkbenchComponents["realtime"];
	const approvalSnapshot = {
		kind: "approval",
		family: "command_execution",
		method: "item/commandExecution/requestApproval",
		requestId: identity.identity.decoder.adoptJsonRpcRequestId("fixture-request"),
		child: identity.identity.validator.childId,
		epoch: identity.identity.validator.epoch,
		threadId: identity.identity.decoder.adoptThreadId("fixture-thread"),
		turnId: identity.identity.decoder.adoptTurnId("fixture-turn"),
		itemId: identity.identity.decoder.adoptItemId("fixture-item"),
		approvalId: null,
		identity: {
			kind: "item",
			threadId: identity.identity.decoder.adoptThreadId("fixture-thread"),
			turnId: identity.identity.decoder.adoptTurnId("fixture-turn"),
			itemId: identity.identity.decoder.adoptItemId("fixture-item"),
			approvalId: null,
		},
		binding: {
			child: identity.identity.validator.childId,
			epoch: identity.identity.validator.epoch,
			link: null,
			target: "fixture",
			effect: "fixture",
		},
		expiresAtMs: 2,
		state: "staged",
		outcome: null,
		decision: null,
		reason: null,
	} satisfies ReturnType<CodexWorkbenchComponents["approvals"]["stage"]>;
	const approvals = {
		stage: () => approvalSnapshot,
		receive: (value: { readonly method: string }) => {
			events.push(`approval:${value.method}`);
			return approvalSnapshot;
		},
		pending: () => approvalSnapshot,
		get: () => undefined,
		inspect: () => [],
		view: () => unavailable("approvals.view"),
		inspectViews: () => [],
		acknowledge: () => undefined,
		spokenEffectPresentation: () => unavailable("approvals.spokenEffectPresentation"),
		spokenEligibility: () => ({ eligible: false, reason: "not_pending" }),
		resolve: async () => unavailable("approvals.resolve"),
		cancel: async () => unavailable("approvals.cancel"),
		expire: async () => unavailable("approvals.expire"),
		markStale: async () => unavailable("approvals.markStale"),
		childExit: async () => [],
		dispose: () => void events.push("approvals:dispose"),
	} satisfies CodexWorkbenchComponents["approvals"];
	const dynamicTools = {
		dispatch: async (value: { readonly method: string }) => {
			events.push(`dynamic:${value.method}`);
			return { contentItems: [{ type: "inputText", text: "fixture" }], success: true };
		},
		inspectMutationQuarantine: () => ({
			epochCount: 0,
			callCount: 0,
			ordinaryInFlightWireCount: 0,
			wireCount: 0,
			blockedWireCount: 0,
			fatalEpochCount: 0,
			entries: [],
		}),
		dispose: () => void events.push("dynamic:dispose"),
	} satisfies CodexWorkbenchComponents["dynamicTools"];
	const semanticDelivery = {
		snapshot: () => ({ token: { revision: 0 }, binding: null }),
		compareAndSwap: () => unavailable("semanticDelivery.compareAndSwap"),
		deliver: async () => unavailable("semanticDelivery.deliver"),
		inspect: () => [],
		get: () => undefined,
		replaceHooks: () => void events.push("semantic:hooks"),
		childExit: async () => void events.push("semantic:child-exit"),
		dispose: () => void events.push("semantic:dispose"),
	} satisfies CodexWorkbenchComponents["semanticDelivery"];
	const coordinator = {
		ensure: async () => unavailable("coordinator.ensure"),
		snapshot: () => ({
			state: "unbound",
			threadId: null,
			childId: null,
			epoch: null,
			operationId: null,
			configured: null,
			effective: null,
			approvalPolicy: null,
			approvalsReviewer: null,
			sandboxPolicy: null,
			activePermissionProfile: null,
			review: null,
			capabilities: {
				web: true,
				shell: true,
				repository: true,
				approvals: true,
				boundedBoardAction: true,
				sustainedWork: "instruction_policy",
			},
			persistence: null,
			reason: null,
		}),
		persisted: () => null,
		onNotification: () => undefined,
	} satisfies CodexWorkbenchComponents["coordinator"];
	const queue = {
		list: async () => unavailable("queue.list"),
		add: async () => unavailable("queue.add"),
		update: async () => unavailable("queue.update"),
		delete: async () => unavailable("queue.delete"),
		reorder: async () => unavailable("queue.reorder"),
		start: async () => unavailable("queue.start"),
		shutdown: async () => undefined,
	} satisfies CodexWorkbenchComponents["queue"];
	const operations = {
		inspect: async () => unavailable("operations.inspect"),
		delegate: async () => unavailable("operations.delegate"),
		manageQueue: async () => unavailable("operations.manageQueue"),
		steer: async () => unavailable("operations.steer"),
		onNotification: () => undefined,
		subscribe: () => () => undefined,
	} satisfies CodexWorkbenchComponents["operations"];
	const spokenApproval = {
		arm: () => unavailable("spokenApproval.arm"),
		snapshot: () => ({
			state: "idle",
			requestId: null,
			approvalId: null,
			child: null,
			epoch: null,
			coordinatorThreadId: null,
			realtimeSessionId: null,
			realtimeCorrelationId: null,
			effectSummary: null,
			effectFingerprint: null,
			effectPromptItemId: null,
			effectPromptSequence: null,
			finalUserItemId: null,
			finalUserSequence: null,
			finalUserText: null,
			operationId: null,
			classifierTurnId: null,
			resolverCallId: null,
			expiresAtMs: null,
			settlement: null,
			reason: null,
		}),
		onSemanticEvent: () => undefined,
		onNotification: () => undefined,
		resolve: async () => unavailable("spokenApproval.resolve"),
		onChildExit: () => undefined,
		dispose: () => void events.push("spoken:dispose"),
	} satisfies CodexWorkbenchComponents["spokenApproval"];
	const coordinatorTools = {
		dispatch: async () => unavailable("coordinatorTools.dispatch"),
		onServerRequest: (value: { readonly method: string }) =>
			void events.push(`coordinator:${value.method}`),
		cancel: () => undefined,
		onChildExit: () => undefined,
		replayState: () => ({
			liveWireCount: 0,
			retainedWireCount: 0,
			liveLogicalCount: 0,
			retainedLogicalCount: 0,
			retainedFingerprintBytes: 0,
		}),
		dispose: () => void events.push("coordinator-tools:dispose"),
	} satisfies CodexWorkbenchComponents["coordinatorTools"];
	const callbacks = {
		enqueue: async () => unavailable("callbacks.enqueue"),
		flush: async () => undefined,
		inspect: () => [],
		inspectHistory: () => ({ deliveries: [], omittedPrefixCount: 0 }),
		get: () => undefined,
		pendingCount: () => 0,
		dispose: () => void events.push("callbacks:dispose"),
	} satisfies CodexWorkbenchComponents["callbacks"];
	const gateway = {
		connect: () => unavailable("gateway.connect"),
		snapshot: () => unavailable("gateway.snapshot"),
		claimLease: () => unavailable("gateway.claimLease"),
		renewLease: () => unavailable("gateway.renewLease"),
		releaseLease: () => null,
		accountRead: async () => unavailable("gateway.accountRead"),
		command: async () => unavailable("gateway.command"),
		subscribe: () => () => undefined,
		closeConnection: async () => undefined,
		childExit: async () => undefined,
		dispose: async () => void events.push("gateway:dispose"),
	} satisfies CodexWorkbenchComponents["gateway"];
	const components: CodexWorkbenchComponents = {
		identity,
		epoch,
		transport,
		session,
		threadLink,
		workhorse,
		semanticPublisher,
		realtime,
		approvals,
		dynamicTools,
		semanticDelivery,
		coordinator,
		queue,
		operations,
		spokenApproval,
		coordinatorTools,
		callbacks,
		gateway,
	} satisfies CodexWorkbenchComponents;
	const calls = new Map<string, number>();
	let currentApprovals = components.approvals;
	let currentGateway = components.gateway;
	const factory = <Name extends keyof CodexWorkbenchComponents>(
		name: Name,
		read: () => CodexWorkbenchComponents[Name],
	) => {
		return () => {
			calls.set(name, (calls.get(name) ?? 0) + 1);
			events.push(`create:${name}`);
			return read();
		};
	};
	const factories = {
		identity: factory("identity", () => components.identity),
		epoch: factory("epoch", () => components.epoch),
		transport: factory("transport", () => components.transport),
		session: factory("session", () => components.session),
		threadLink: factory("threadLink", () => components.threadLink),
		workhorse: factory("workhorse", () => components.workhorse),
		semanticPublisher: factory("semanticPublisher", () => components.semanticPublisher),
		realtime: factory("realtime", () => components.realtime),
		approvals: factory("approvals", () => currentApprovals),
		dynamicTools: factory("dynamicTools", () => components.dynamicTools),
		semanticDelivery: factory("semanticDelivery", () => components.semanticDelivery),
		coordinator: factory("coordinator", () => components.coordinator),
		queue: factory("queue", () => components.queue),
		operations: factory("operations", () => components.operations),
		spokenApproval: factory("spokenApproval", () => components.spokenApproval),
		coordinatorTools: factory("coordinatorTools", () => components.coordinatorTools),
		callbacks: factory("callbacks", () => components.callbacks),
		gateway: factory("gateway", () => currentGateway),
	} satisfies CodexWorkbenchComponentFactories;
	const hooks: CodexWorkbenchGenerationHooks = {
		threadContext: { contextForEvent: () => generationContextFixture },
		onNotification: () => undefined,
		installIdentityDecoders: () => void events.push("identity:install"),
		installLifecycleSignals: () => {
			events.push("lifecycle:install");
			return () => void events.push("lifecycle:remove");
		},
		installApprovalProjection: () => {
			events.push("approval-projection:install");
			return () => void events.push("approval-projection:remove");
		},
		installBrowserGateway: () => {
			events.push("browser:install");
			return () => void events.push("browser:remove");
		},
		initializeSession: async () => void events.push("ready"),
		stopBrowser: async (browserGateway) => browserGateway.dispose(),
		stopRealtime: async () => void events.push("realtime:stop"),
		stopQueue: () => void events.push("queue:stop"),
		retireDynamicLifecycle: async (exitChild, exitEpoch) =>
			void events.push(`dynamic:child-exit:${String(exitChild)}:${String(exitEpoch)}`),
		cancelDynamicApprovalsAndWaits: async (_components, cause) =>
			void events.push(`dynamic:cancel:${cause}`),
		settleOrdinaryRequests: async (_approvals, cause) =>
			void events.push(`ordinary:settle:${cause}`),
	};

	return {
		identityLedger,
		components,
		factories,
		hooks,
		calls,
		requestListeners,
		notificationListeners,
		replaceApprovals: (value) => void (currentApprovals = value),
		replaceGateway: (value) => void (currentGateway = value),
	};
}
