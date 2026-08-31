import { expect, test } from "bun:test";

import {
	composeCodexWorkbenchGeneration,
	type CodexWorkbenchComponentFactories,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGenerationHooks,
} from "../index.js";

test("the production generation creates every owner once before readiness and shuts down in order", async () => {
	const events: string[] = [];
	const unsubscribers: Array<() => void> = [];
	const disposable = (name: string) => ({ dispose: () => void events.push(`${name}:dispose`) });
	const parts = {
		identity: {},
		epoch: { close: () => void events.push("epoch:close") },
		transport: {
			registerDynamicDispatcher: (registration: { readonly namespace: string }) =>
				void events.push(`dynamic:install:${registration.namespace}`),
			onServerRequest: () => {
				events.push("router:install");
				const unsubscribe = () => void events.push("router:remove");
				unsubscribers.push(unsubscribe);
				return unsubscribe;
			},
			onServerNotification: () => {
				events.push("notifications:install");
				const unsubscribe = () => void events.push("notifications:remove");
				unsubscribers.push(unsubscribe);
				return unsubscribe;
			},
			onExit: () => {
				events.push("child-exit:install");
				const unsubscribe = () => void events.push("child-exit:remove");
				unsubscribers.push(unsubscribe);
				return unsubscribe;
			},
			shutdown: async () => void events.push("transport:shutdown"),
		},
		session: {
			respondCurrentTime: async () => undefined,
			respondUnsupportedTokenRefresh: async () => undefined,
			respondUnsupportedAttestation: async () => undefined,
		},
		threadLink: {},
		workhorse: {},
		realtime: { ...disposable("realtime"), onNotification: () => undefined },
		approvals: {
			...disposable("approvals"),
			receive: () => ({}),
			childExit: async () => [],
		},
		dynamicTools: { ...disposable("dynamic"), dispatch: async () => ({}) },
		semanticDelivery: disposable("semantic"),
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
			onServerRequest: () => undefined,
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
	const hooks: CodexWorkbenchGenerationHooks = {
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
		cancelDynamicApprovalsAndWaits: async () => void events.push("dynamic:cancel"),
		settleOrdinaryRequests: async () => void events.push("ordinary:settle"),
	};

	const generation = await composeCodexWorkbenchGeneration({ factories, hooks });
	expect(Object.fromEntries(calls)).toEqual(Object.fromEntries(order.map((name) => [name, 1])));
	expect(events.indexOf("identity:install")).toBeLessThan(events.indexOf("create:transport"));
	expect(events.filter((event) => event.startsWith("dynamic:install:"))).toHaveLength(3);
	expect(events.indexOf("dynamic:install:archboard_app")).toBeLessThan(
		events.indexOf("create:session"),
	);
	expect(events.indexOf("router:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("approval-projection:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("browser:install")).toBeLessThan(events.indexOf("ready"));

	await generation.stop("shutdown");
	generation.finishStop();
	expect(events.indexOf("gateway:dispose")).toBeLessThan(events.indexOf("realtime:stop"));
	expect(events.indexOf("realtime:stop")).toBeLessThan(events.indexOf("queue:stop"));
	expect(events.indexOf("queue:stop")).toBeLessThan(events.indexOf("dynamic:cancel"));
	expect(events.indexOf("dynamic:cancel")).toBeLessThan(events.indexOf("ordinary:settle"));
	expect(events.indexOf("transport:shutdown")).toBeLessThan(events.indexOf("router:remove"));
	expect(events.indexOf("router:remove")).toBeLessThan(events.indexOf("epoch:close"));
});
