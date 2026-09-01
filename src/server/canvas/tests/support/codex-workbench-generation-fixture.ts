import {
	CODEX_SESSION_CONTROL,
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

type ExitListener = Parameters<CodexWorkbenchComponents["transport"]["onExit"]>[0];
export type RequestListener = Parameters<
	CodexWorkbenchComponents["transport"]["onServerRequest"]
>[0];
export type NotificationListener = Parameters<
	CodexWorkbenchComponents["transport"]["onServerNotification"]
>[0];

export const CODEX_WORKBENCH_COMPONENT_ORDER = [
	"identity",
	"epoch",
	"transport",
	"session",
	"threadLink",
	"workhorse",
	"semanticPublisher",
	"realtime",
	"approvals",
	"dynamicTools",
	"semanticDelivery",
	"coordinator",
	"queue",
	"operations",
	"spokenApproval",
	"coordinatorTools",
	"callbacks",
	"gateway",
] as const;

export interface CodexWorkbenchGenerationFixture {
	readonly identityLedger: ReturnType<typeof createIdentityLedger>;
	readonly components: CodexWorkbenchComponents;
	readonly factories: CodexWorkbenchComponentFactories;
	readonly hooks: CodexWorkbenchGenerationHooks;
	readonly calls: ReadonlyMap<string, number>;
	readonly requestListeners: RequestListener[];
	readonly notificationListeners: NotificationListener[];
}

export function createCodexWorkbenchGenerationFixture(
	events: string[],
): CodexWorkbenchGenerationFixture {
	const identityLedger = createIdentityLedger();
	const exitListeners = new Set<ExitListener>();
	const requestListeners: RequestListener[] = [];
	const notificationListeners: NotificationListener[] = [];
	let transportState: "open" | "closed" = "open";
	const disposable = (name: string) => ({ dispose: () => void events.push(`${name}:dispose`) });
	const components = {
		identity: createIdentityAuthorities(identityLedger),
		epoch: { close: () => void events.push("epoch:close") },
		transport: {
			replaceIdentity: () => undefined,
			request: async () => ({}) as never,
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
			inspect: () => ({ state: transportState }) as never,
			inspectLateResponses: () => [],
			inspectIssues: () => [],
			inspectStderr: () => ({}) as never,
			shutdown: async () => {
				transportState = "closed";
				events.push("transport:shutdown");
				for (const listener of exitListeners)
					listener({
						child: "child" as never,
						epoch: "epoch" as never,
						code: 0,
						signal: null,
					});
			},
		},
		session: {
			respondCurrentTime: async (value: { readonly method: string }) =>
				void events.push(`session:${value.method}`),
			respondUnsupportedTokenRefresh: async (value: { readonly method: string }) =>
				void events.push(`session:${value.method}`),
			respondUnsupportedAttestation: async (value: { readonly method: string }) =>
				void events.push(`session:${value.method}`),
			[CODEX_SESSION_CONTROL]: {
				onNotification: () => undefined,
				onServerRequest: () => undefined,
				dispose: () => void events.push("session:dispose"),
			},
		} as unknown as ControlledCodexSession,
		threadLink: {},
		workhorse: {},
		semanticPublisher: disposable("publisher"),
		realtime: { ...disposable("realtime"), onNotification: () => undefined },
		approvals: {
			...disposable("approvals"),
			receive: (value: { readonly method: string }) => {
				events.push(`approval:${value.method}`);
				return {};
			},
			childExit: async () => [],
		},
		dynamicTools: {
			...disposable("dynamic"),
			dispatch: async (value: { readonly method: string }) => {
				events.push(`dynamic:${value.method}`);
				return {};
			},
		},
		semanticDelivery: {
			...disposable("semantic"),
			replaceHooks: () => void events.push("semantic:hooks"),
			childExit: async () => void events.push("semantic:child-exit"),
		},
		coordinator: { onNotification: () => undefined },
		queue: {},
		operations: { onNotification: () => undefined },
		spokenApproval: {
			...disposable("spoken"),
			onNotification: () => undefined,
			onChildExit: () => undefined,
		},
		coordinatorTools: {
			...disposable("coordinator-tools"),
			onServerRequest: (value: { readonly method: string }) =>
				void events.push(`coordinator:${value.method}`),
			onChildExit: () => undefined,
		},
		callbacks: disposable("callbacks"),
		gateway: {
			dispose: async () => void events.push("gateway:dispose"),
			childExit: async () => undefined,
		},
	} as unknown as CodexWorkbenchComponents;
	const calls = new Map<string, number>();
	const factories = Object.fromEntries(
		CODEX_WORKBENCH_COMPONENT_ORDER.map((name) => [
			name,
			() => {
				calls.set(name, (calls.get(name) ?? 0) + 1);
				events.push(`create:${name}`);
				return components[name];
			},
		]),
	) as unknown as CodexWorkbenchComponentFactories;
	const hooks: CodexWorkbenchGenerationHooks = {
		threadContext: { contextForEvent: () => ({}) as never },
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
		stopBrowser: async (gateway) => gateway.dispose(),
		stopRealtime: async () => void events.push("realtime:stop"),
		stopQueue: () => void events.push("queue:stop"),
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
	};
}
