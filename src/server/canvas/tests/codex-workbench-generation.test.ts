import { expect, test } from "bun:test";

import {
	CODEX_SESSION_CONTROL,
	type ControlledCodexSession,
} from "../../../runtime/codex-session/index.js";
import {
	composeCodexWorkbenchGeneration,
	type CodexWorkbenchComponentFactories,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGenerationHooks,
} from "../codex-workbench.js";

type ExitListener = Parameters<CodexWorkbenchComponents["transport"]["onExit"]>[0];

test("the production generation creates every owner once before readiness and shuts down in order", async () => {
	const events: string[] = [];
	const unsubscribers: Array<() => void> = [];
	let exitListener: ExitListener | null = null;
	let resolveChildRetirement!: () => void;
	const childRetirement = new Promise<void>((resolve) => {
		resolveChildRetirement = resolve;
	});
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
			respondCurrentTime: async () => undefined,
			respondUnsupportedTokenRefresh: async () => undefined,
			respondUnsupportedAttestation: async () => undefined,
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
			receive: () => ({}),
			childExit: async () => [],
		},
		dynamicTools: { ...disposable("dynamic"), dispatch: async () => ({}) },
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
		cancelDynamicApprovalsAndWaits: async () => void events.push("dynamic:cancel"),
		settleOrdinaryRequests: async () => void events.push("ordinary:settle"),
	};

	const generation = await composeCodexWorkbenchGeneration({
		factories,
		hooks,
		onChildExitStart: () => void events.push("child-retirement:start"),
		onChildExitFinished: () => {
			events.push("child-retirement:finish");
			resolveChildRetirement();
		},
	});
	expect(Object.fromEntries(calls)).toEqual(Object.fromEntries(order.map((name) => [name, 1])));
	expect(events.indexOf("identity:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.filter((event) => event.startsWith("dynamic:install:"))).toHaveLength(3);
	expect(events.indexOf("dynamic:install:archboard_app")).toBeLessThan(
		events.indexOf("create:session"),
	);
	expect(events.indexOf("router:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("approval-projection:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("browser:install")).toBeLessThan(events.indexOf("ready"));
	await generation.replaceHooks({
		...hooks,
		stopBrowser: async () => void events.push("reload:browser-stop"),
		stopRealtime: async () => void events.push("reload:realtime-stop"),
		stopQueue: () => void events.push("reload:queue-stop"),
		cancelDynamicApprovalsAndWaits: async () => void events.push("reload:dynamic-cancel"),
		settleOrdinaryRequests: async () => void events.push("reload:ordinary-settle"),
	});

	await generation.stop("shutdown");
	generation.finishStop();
	await childRetirement;
	expect(events.indexOf("gateway:dispose")).toBeLessThan(events.indexOf("realtime:stop"));
	expect(events.indexOf("realtime:stop")).toBeLessThan(events.indexOf("queue:stop"));
	expect(events.indexOf("queue:stop")).toBeLessThan(events.indexOf("dynamic:cancel"));
	expect(events.indexOf("dynamic:cancel")).toBeLessThan(events.indexOf("ordinary:settle"));
	expect(events.some((event) => event.startsWith("reload:") && event.endsWith("stop"))).toBeFalse();
	expect(events).not.toContain("reload:dynamic-cancel");
	expect(events).not.toContain("reload:ordinary-settle");
	expect(events.indexOf("transport:shutdown")).toBeLessThan(events.indexOf("router:remove"));
	expect(events.indexOf("router:remove")).toBeLessThan(events.indexOf("epoch:close"));
	expect(events).toContain("child-retirement:start");
	expect(events).toContain("child-retirement:finish");
	expect(events.filter((event) => event === "approval-projection:install")).toHaveLength(1);
	expect(events.filter((event) => event === "approval-projection:remove")).toHaveLength(1);

	const cleanupEvent = new Map<string, string>([
		["epoch", "epoch:close"],
		["transport", "transport:shutdown"],
		["session", "session:dispose"],
		["semanticPublisher", "publisher:dispose"],
		["realtime", "realtime:dispose"],
		["approvals", "approvals:dispose"],
		["dynamicTools", "dynamic:dispose"],
		["semanticDelivery", "semantic:dispose"],
		["spokenApproval", "spoken:dispose"],
		["coordinatorTools", "coordinator-tools:dispose"],
		["callbacks", "callbacks:dispose"],
	]);
	for (const [failedIndex, failedName] of order.entries()) {
		events.length = 0;
		const failing = Object.fromEntries(
			order.map((name, index) => [
				name,
				index === failedIndex
					? () => {
							throw new Error(`create:${name}:failed`);
						}
					: () => parts[name],
			]),
		) as unknown as CodexWorkbenchComponentFactories;
		expect(composeCodexWorkbenchGeneration({ factories: failing, hooks })).rejects.toThrow(
			`create:${failedName}:failed`,
		);
		for (const acquired of order.slice(0, failedIndex)) {
			const expected = cleanupEvent.get(acquired);
			if (expected !== undefined)
				expect(events, `${failedName} cleans ${acquired}`).toContain(expected);
		}
	}
});
