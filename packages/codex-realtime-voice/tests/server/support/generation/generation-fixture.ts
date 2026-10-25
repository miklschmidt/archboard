import {
	CODEX_SESSION_CONTROL,
	type ControlledCodexSession,
	createCodexSession,
} from "@archboard/codex-app-server/session";
import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "@archboard/codex-app-server/identity";
import { createCodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";
import { type CodexWorkbenchComponentFactories } from "#server/protocol/generation/contract.ts";
import {
	type CodexWorkbenchComponents,
	type CodexWorkbenchGenerationHooks,
} from "#server/services/generation/lifecycle.ts";
import {
	type CodexWorkbenchSessionComponents,
	type CodexWorkbenchTabSession,
	type CodexWorkbenchTabSessionScope,
} from "#server/protocol/generation/session-contract.ts";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";

import {
	createSessionComponentsFixture,
	createWorkhorseComponentsFixture,
} from "#tests/server/support/generation/session-fixture.ts";

export { CODEX_WORKBENCH_COMPONENT_ORDER } from "#tests/server/support/generation/generation-values.ts";

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
	/** The owners of the one tab session the fixture opens, as a connecting pane would. */
	readonly sessionComponents: CodexWorkbenchSessionComponents;
	/** That session, open from the start. */
	readonly tabSession: CodexWorkbenchTabSession;
	/** A thread that session claimed, as Codex spells it. */
	readonly claimedThread: string;
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
	const identityLedger = createIdentityLedger("codex");
	const identity = createIdentityAuthorities(identityLedger);
	const exitListeners = new Set<ExitListener>();
	const requestListeners: RequestListener[] = [];
	const notificationListeners: NotificationListener[] = [];
	let transportState: "open" | "closed" = "open";
	const epoch = {
		rootDirectory: "/fixture/epoch",
		manifestPath: "/fixture/epoch/manifest.json",
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
		workingDirectory: "/fixture/coordinator",
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
		classifyAndBind: async () => unavailable("threadLink.classifyAndBind"),
		snapshot: () => unavailable("threadLink.snapshot"),
		read: () => unavailable("threadLink.read"),
		compareAndSwap: () => unavailable("threadLink.compareAndSwap"),
		clear: () => unavailable("threadLink.clear"),
	} satisfies CodexWorkbenchComponents["threadLink"];
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
		dispose: () => void events.push("dynamic:dispose"),
	} satisfies CodexWorkbenchComponents["dynamicTools"];
	const sessionComponents = createSessionComponentsFixture(events);
	const claims: { coordinator: CodexWorkbenchTabSessionScope["claimThread"] | null } = {
		coordinator: null,
	};
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
		endSession: () => undefined,
		dispose: async () => void events.push("gateway:dispose"),
	} satisfies CodexWorkbenchComponents["gateway"];
	const sessions = createCodexWorkbenchSessions({
		resolveCheckout: (named) => named,
		identity: identity.identity,
		transport,
		session,
		threadLink,
		endApprovals: async () => undefined,
		shownConversationOf: () => null,
		build: (scope) => {
			events.push("create:tabSession");
			claims.coordinator = scope.claimThread;
			return {
				components: sessionComponents,
				actions: {
					realtime: {
						start: async () => unavailable("realtime.start"),
						appendText: async () => unavailable("realtime.appendText"),
						stop: async () => unavailable("realtime.stop"),
					},
				},
			};
		},
		buildWorkhorse: () => {
			events.push("create:workhorse");
			return {
				components: createWorkhorseComponentsFixture(events),
				actions: {
					threadLinks: { create: async () => unavailable("threadLinks.create") },
					ensureStarted: async () => unavailable("workhorse.ensureStarted"),
				},
			};
		},
	});
	const tabSession = sessions.open(parseTabSessionId("tab-one")!);
	// One workhorse, in the checkout a connecting pane would show, so its owners settle and stop too.
	tabSession.workhorse("/work/payments");
	const claimedThread = "fixture-claimed-thread";
	claims.coordinator?.(identity.identity.decoder.adoptThreadId(claimedThread));
	const components: CodexWorkbenchComponents = {
		identity,
		epoch,
		transport,
		session,
		threadLink,
		approvals,
		dynamicTools,
		sessions,
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
		approvals: factory("approvals", () => currentApprovals),
		dynamicTools: factory("dynamicTools", () => components.dynamicTools),
		sessions: factory("sessions", () => components.sessions),
		gateway: factory("gateway", () => currentGateway),
	} satisfies CodexWorkbenchComponentFactories;
	const hooks: CodexWorkbenchGenerationHooks = {
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
		sessionComponents,
		tabSession,
		claimedThread,
		factories,
		hooks,
		calls,
		requestListeners,
		notificationListeners,
		replaceApprovals: (value) => void (currentApprovals = value),
		replaceGateway: (value) => void (currentGateway = value),
	};
}
