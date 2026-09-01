import { expect, test } from "bun:test";

import {
	CODEX_SESSION_CONTROL,
	type ControlledCodexSession,
} from "../../../runtime/codex-session/index.js";
import { createIdentityLedger } from "../../../shared/codex-workbench-identity/index.js";
import {
	composeCodexWorkbenchGeneration,
	type CodexWorkbenchComponentFactories,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGenerationHooks,
} from "../codex-workbench-generation.js";

type ExitListener = Parameters<CodexWorkbenchComponents["transport"]["onExit"]>[0];
type RequestListener = Parameters<CodexWorkbenchComponents["transport"]["onServerRequest"]>[0];
type NotificationListener = Parameters<
	CodexWorkbenchComponents["transport"]["onServerNotification"]
>[0];

test("the production generation creates every owner once before readiness and shuts down in order", async () => {
	const events: string[] = [];
	const unsubscribers: Array<() => void> = [];
	const requestListeners: RequestListener[] = [];
	const notificationListeners: NotificationListener[] = [];
	let exitListener: ExitListener | null = null;
	const disposable = (name: string) => ({ dispose: () => void events.push(`${name}:dispose`) });
	const parts = {
		identity: {},
		epoch: { close: () => void events.push("epoch:close") },
		transport: {
			registerDynamicDispatcher: (registration: { readonly namespace: string }) =>
				void events.push(`dynamic:install:${registration.namespace}`),
			onServerRequest: (listener: RequestListener) => {
				events.push("router:install");
				requestListeners.push(listener);
				const unsubscribe = () => void events.push("router:remove");
				unsubscribers.push(unsubscribe);
				return unsubscribe;
			},
			onServerNotification: (listener: NotificationListener) => {
				events.push("notifications:install");
				notificationListeners.push(listener);
				const unsubscribe = () => void events.push("notifications:remove");
				unsubscribers.push(unsubscribe);
				return unsubscribe;
			},
			onExit: (listener: ExitListener) => {
				events.push("child-exit:install");
				exitListener = listener;
				const unsubscribe = () => void events.push("child-exit:remove");
				unsubscribers.push(unsubscribe);
				return unsubscribe;
			},
			shutdown: async () => {
				events.push("transport:shutdown");
				exitListener?.({
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
	const order = [
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
	const calls = new Map<string, number>();
	const factories = Object.fromEntries(
		order.map((name) => [
			name,
			() => {
				calls.set(name, (calls.get(name) ?? 0) + 1);
				events.push(`create:${name}`);
				return parts[name];
			},
		]),
	) as unknown as CodexWorkbenchComponentFactories;
	const makeHooks = (): CodexWorkbenchGenerationHooks => ({
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
	});
	const hooks = makeHooks();

	const generation = await composeCodexWorkbenchGeneration({
		identityLedger: createIdentityLedger(),
		factories,
		hooks,
	});
	expect(Object.fromEntries(calls)).toEqual(Object.fromEntries(order.map((name) => [name, 1])));
	expect(events.indexOf("identity:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("router:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("approval-projection:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("browser:install")).toBeLessThan(events.indexOf("ready"));
	const route = requestListeners.at(-1);
	if (route === undefined) throw new Error("missing private production router");
	for (const method of [
		"item/commandExecution/requestApproval",
		"item/fileChange/requestApproval",
		"item/tool/requestUserInput",
		"mcpServer/elicitation/request",
		"item/permissions/requestApproval",
		"applyPatchApproval",
		"execCommandApproval",
	] as const)
		route({ method, owner: "codex-approvals" } as never);
	route({ method: "item/tool/call", owner: "codex-dynamic-tools" } as never);
	route({ method: "item/tool/call", owner: "codex-coordinator-tools" } as never);
	for (const method of [
		"currentTime/read",
		"account/chatgptAuthTokens/refresh",
		"attestation/generate",
	] as const)
		route({ method, owner: "codex-session" } as never);
	await Promise.resolve();
	expect(events.filter((event) => event.startsWith("approval:"))).toHaveLength(7);
	expect(events).toContain("dynamic:item/tool/call");
	expect(events).toContain("coordinator:item/tool/call");
	expect(events.filter((event) => event.startsWith("session:"))).toHaveLength(3);
	await generation.retireChild({
		child: "child" as never,
		epoch: "epoch" as never,
		code: 1,
		signal: null,
	});
	expect(events).toContain("semantic:child-exit");
	const stopping = generation.stop("shutdown");
	for (const listener of requestListeners) listener({} as never);
	for (const listener of notificationListeners) listener({} as never);
	await stopping;
	generation.finishStop();
	expect(events.indexOf("browser:remove")).toBeLessThan(events.indexOf("gateway:dispose"));
	expect(events.indexOf("gateway:dispose")).toBeLessThan(events.indexOf("realtime:stop"));
	expect(events.indexOf("realtime:stop")).toBeLessThan(events.indexOf("queue:stop"));
	expect(events).toContain("dynamic:cancel:host_shutdown");
	expect(events).toContain("ordinary:settle:host_shutdown");
	expect(events.filter((event) => event === "transport:shutdown")).toHaveLength(1);
	expect(events.indexOf("ordinary:settle:host_shutdown")).toBeLessThan(
		events.indexOf("transport:shutdown"),
	);
	expect(events.filter((event) => event === "approval-projection:remove")).toHaveLength(1);
	expect(events.filter((event) => event === "epoch:close")).toHaveLength(1);
});
