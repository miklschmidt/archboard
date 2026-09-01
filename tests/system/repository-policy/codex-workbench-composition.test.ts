import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
	CodexProcess,
	CodexProcessChild,
	CodexProcessSnapshot,
} from "../../../src/runtime/codex-process/index.js";
import { CODEX_SESSION_CONTROL } from "../../../src/runtime/codex-session/index.js";
import type { CodexWorkbenchGateway } from "../../../src/server/codex-workbench/index.js";
import {
	assertCodexWorkbenchRetainedState,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchGenerationSlots,
} from "../../../src/server/canvas/codex-workbench-owner.js";
import type { CodexWorkbenchGenerationHooks } from "../../../src/server/canvas/codex-workbench-generation.js";

const RETAINED_KEYS = ["control", "failure", "generation", "owner", "process", "state"] as const;

const OWNER_SLOT_KEYS = ["gateway", "reload", "shutdown", "snapshot", "start"] as const;
const RUNTIME_KEYS = [
	"child",
	"childRetiring",
	"generation",
	"process",
	"released",
	"shutdownPromise",
	"startPromise",
] as const;
const GENERATION_KEYS = [
	"components",
	"current",
	"owners",
	"pendingChildSettlements",
	"registrations",
	"stopComplete",
	"stopFinished",
	"stopPromise",
	"stopped",
] as const;
const GENERATION_SLOT_KEYS = [
	"finishStop",
	"hooks",
	"onChildExitFinished",
	"onChildExitStart",
	"onExit",
	"onNotification",
	"replaceHooks",
	"route",
	"stop",
] as const;
const GENERATION_REGISTRATION_KEYS = [
	"approvalProjection",
	"browserGateway",
	"lifecycleSignals",
	"transportExit",
	"transportNotification",
	"transportRequest",
] as const;

const noop = () => undefined;

function poisonOriginalGeneration(): never {
	throw new Error("poisoned original source-generation method executed");
}

function policyHooks(): CodexWorkbenchGenerationHooks {
	return {
		threadContext: { contextForEvent: () => ({}) as never },
		installIdentityDecoders: noop,
		installLifecycleSignals: () => noop,
		installApprovalProjection: () => noop,
		installBrowserGateway: () => noop,
		initializeSession: async () => undefined,
		stopBrowser: async () => undefined,
		stopRealtime: async () => undefined,
		stopQueue: noop,
		cancelDynamicApprovalsAndWaits: async () => undefined,
		settleOrdinaryRequests: async () => undefined,
	};
}

function policyProcess(): CodexProcess {
	const child = { pid: 14314 } as CodexProcessChild;
	const listeners = new Set<(value: CodexProcessChild) => void>();
	let running = false;
	const snapshot = () =>
		({
			state: running ? "running" : "stopped",
			pid: running ? child.pid : null,
		}) as CodexProcessSnapshot;
	return {
		start: async () => {
			running = true;
			for (const listener of listeners) listener(child);
			return snapshot();
		},
		stop: async () => {
			running = false;
			return snapshot();
		},
		snapshot,
		currentChild: () => (running ? child : null),
		onChild: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		subscribe: () => () => undefined,
	};
}

function policyGeneration(reloads: { count: number }): CodexWorkbenchGeneration {
	const disposable = { dispose: noop };
	const transport = {
		onServerRequest: () => noop,
		onServerNotification: () => noop,
		onExit: () => noop,
		shutdown: async () => undefined,
	};
	const session = {
		respondCurrentTime: async () => undefined,
		respondUnsupportedTokenRefresh: async () => undefined,
		respondUnsupportedAttestation: async () => undefined,
		[CODEX_SESSION_CONTROL]: { onNotification: noop, dispose: noop },
	};
	const approvals = { ...disposable, receive: noop };
	const dynamicTools = { ...disposable, dispatch: async () => undefined };
	const coordinatorTools = { ...disposable, onServerRequest: noop, onChildExit: noop };
	const gateway = { dispose: async () => undefined } as CodexWorkbenchGateway;
	const hooks = policyHooks();
	const components = {
		identity: {},
		epoch: { close: noop },
		transport,
		session,
		threadLink: {},
		workhorse: {},
		semanticPublisher: disposable,
		realtime: { ...disposable, onNotification: noop },
		approvals,
		dynamicTools,
		semanticDelivery: {
			...disposable,
			replaceHooks: () => void (reloads.count += 1),
		},
		coordinator: { onNotification: noop },
		queue: {},
		operations: { onNotification: noop },
		spokenApproval: { ...disposable, onNotification: noop },
		coordinatorTools,
		callbacks: disposable,
		gateway,
	} as unknown as CodexWorkbenchGeneration["state"]["components"];
	const slots: CodexWorkbenchGenerationSlots = {
		hooks,
		onChildExitStart: () => undefined,
		onChildExitFinished: async () => undefined,
		route: noop,
		onNotification: noop,
		onExit: noop,
		replaceHooks: async () => void (reloads.count += 1),
		stop: async () => undefined,
		finishStop: noop,
	};
	const state: CodexWorkbenchGeneration["state"] = {
		components,
		owners: { approvals, dynamicTools, coordinatorTools, session } as never,
		current: slots,
		registrations: {
			transportRequest: null,
			transportNotification: null,
			transportExit: null,
			lifecycleSignals: null,
			browserGateway: null,
			approvalProjection: null,
		},
		pendingChildSettlements: new Set(),
		stopped: false,
		stopPromise: null,
		stopComplete: false,
		stopFinished: false,
	};
	return {
		state,
		transport: transport as never,
		gateway,
		router: { route: slots.route },
		onNotification: slots.onNotification,
		onExit: slots.onExit,
		replaceHooks: slots.replaceHooks,
		stop: slots.stop,
		finishStop: slots.finishStop,
	};
}

describe("production Codex workbench composition policy", () => {
	test("publishes narrow canvas workbench entrypoints instead of one catch-all barrel", () => {
		const root = path.resolve(import.meta.dir, "../../../src/server/canvas");
		expect(existsSync(path.join(root, "codex-workbench.ts"))).toBeFalse();
		for (const entrypoint of [
			"codex-workbench-adapters.ts",
			"codex-workbench-application.ts",
			"codex-workbench-browser.ts",
			"codex-workbench-generation.ts",
			"codex-workbench-owner.ts",
			"codex-workbench-production.ts",
		])
			expect(existsSync(path.join(root, entrypoint)), entrypoint).toBeTrue();
	});

	test("starts with scalar state, a process slot, and one plain control cell", () => {
		const retained = emptyCodexWorkbenchRetainedState();
		expect(retained).toMatchObject({
			owner: null,
			generation: 0,
			state: "idle",
			failure: null,
			process: null,
			control: { current: null, runtime: null },
		});
		expect(Object.keys(retained.control).toSorted()).toEqual(["current", "runtime", "wrappers"]);
		expect(Object.keys(retained.control.wrappers).toSorted()).toEqual([...OWNER_SLOT_KEYS]);
	});

	test("keeps the exact retained allowlist across install and source-hook reload", async () => {
		const retained = Object.seal(emptyCodexWorkbenchRetainedState());
		const reloads = { count: 0 };
		let originalGeneration: CodexWorkbenchGeneration | null = null;
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: policyProcess,
			createGeneration: async () => {
				originalGeneration = policyGeneration(reloads);
				return originalGeneration;
			},
		});
		const installationSlots = retained.control.current;
		if (installationSlots === null) throw new Error("Installation did not publish source slots.");

		await owner.start();
		expect(Object.keys(retained).toSorted()).toEqual([...RETAINED_KEYS]);
		const generationGateway = owner.gateway();
		expect(Object.values(retained)).not.toContain(generationGateway);
		const stableWrappers = retained.control.wrappers;
		const firstSlots = retained.control.current;
		if (firstSlots === null) throw new Error("Start did not publish source slots.");
		for (const key of OWNER_SLOT_KEYS) expect(firstSlots[key]).not.toBe(installationSlots[key]);
		for (const key of OWNER_SLOT_KEYS)
			(installationSlots as unknown as Record<(typeof OWNER_SLOT_KEYS)[number], () => never>)[key] =
				() => {
					throw new Error(`poisoned installation ${key} slot executed`);
				};
		const runtimeState = retained.control.runtime;
		if (runtimeState === null) throw new Error("The runtime state port was not retained.");
		expect(Object.keys(runtimeState).toSorted()).toEqual([...RUNTIME_KEYS]);
		for (const key of OWNER_SLOT_KEYS) expect(key in runtimeState).toBeFalse();
		const originalGenerationSlots = runtimeState.generation?.current;
		if (originalGenerationSlots === null || originalGenerationSlots === undefined)
			throw new Error("The generation source slots were not retained.");
		expect(Object.keys(runtimeState.generation ?? {}).toSorted()).toEqual([...GENERATION_KEYS]);
		expect(Object.keys(originalGenerationSlots).toSorted()).toEqual([...GENERATION_SLOT_KEYS]);
		expect(Object.keys(runtimeState.generation?.registrations ?? {}).toSorted()).toEqual([
			...GENERATION_REGISTRATION_KEYS,
		]);
		Object.assign(originalGenerationSlots, { hiddenOwner: {} });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("retained allowlist");
		Reflect.deleteProperty(originalGenerationSlots, "hiddenOwner");
		Object.assign(originalGenerationSlots.hooks, { hiddenOwner: {} });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("retained allowlist");
		Reflect.deleteProperty(originalGenerationSlots.hooks, "hiddenOwner");
		Object.assign(runtimeState.generation?.registrations ?? {}, { hiddenOwner: null });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("retained allowlist");
		Reflect.deleteProperty(runtimeState.generation?.registrations ?? {}, "hiddenOwner");

		const reloadHooks = policyHooks();
		await stableWrappers.reload(reloadHooks);
		expect(reloads.count).toBe(1);
		expect(Object.keys(retained).toSorted()).toEqual([...RETAINED_KEYS]);
		expect(Object.values(retained)).not.toContain(generationGateway);
		expect(retained.control.wrappers).toBe(stableWrappers);
		expect(retained.control.runtime).toBe(runtimeState);
		expect(retained.control.current).not.toBe(firstSlots);
		expect(runtimeState.generation?.current).not.toBe(originalGenerationSlots);
		expect(runtimeState.generation?.current?.hooks).toBe(reloadHooks);
		expect(Object.keys(retained.control.current ?? {}).toSorted()).toEqual([...OWNER_SLOT_KEYS]);
		const currentSlots = retained.control.current;
		if (currentSlots === null) throw new Error("Reload did not publish current source slots.");
		for (const key of OWNER_SLOT_KEYS) expect(currentSlots[key]).not.toBe(firstSlots[key]);
		for (const key of OWNER_SLOT_KEYS)
			(firstSlots as unknown as Record<(typeof OWNER_SLOT_KEYS)[number], () => never>)[key] =
				() => {
					throw new Error(`poisoned retired ${key} slot executed`);
				};
		if (originalGeneration === null) throw new Error("The original generation was not captured.");
		Object.assign(originalGenerationSlots.hooks.threadContext, {
			contextForEvent: poisonOriginalGeneration,
		});
		for (const key of [
			"installIdentityDecoders",
			"installLifecycleSignals",
			"installApprovalProjection",
			"installBrowserGateway",
			"initializeSession",
			"stopBrowser",
			"stopRealtime",
			"stopQueue",
			"cancelDynamicApprovalsAndWaits",
			"settleOrdinaryRequests",
		] as const)
			Object.assign(originalGenerationSlots.hooks, { [key]: poisonOriginalGeneration });
		Object.assign(originalGenerationSlots, {
			onChildExitStart: poisonOriginalGeneration,
			onChildExitFinished: poisonOriginalGeneration,
			route: poisonOriginalGeneration,
			onNotification: poisonOriginalGeneration,
			onExit: poisonOriginalGeneration,
			replaceHooks: poisonOriginalGeneration,
			stop: poisonOriginalGeneration,
			finishStop: poisonOriginalGeneration,
		});
		Object.assign(originalGeneration, {
			router: { route: poisonOriginalGeneration },
			onNotification: poisonOriginalGeneration,
			onExit: poisonOriginalGeneration,
			replaceHooks: poisonOriginalGeneration,
			stop: poisonOriginalGeneration,
			finishStop: poisonOriginalGeneration,
		});
		expect(retained.control.wrappers.snapshot().generation).toBe(2);
		expect(retained.control.wrappers.gateway()).toBe(generationGateway);
		await retained.control.wrappers.shutdown();
		expect(retained.control.current).toBeNull();
		expect(retained.control.runtime).toBeNull();
	});

	test("rejects nested, prototype, process-method, and extra-slot attachments", () => {
		const retained = emptyCodexWorkbenchRetainedState();
		retained.process = Object.assign(policyProcess(), { session: { initialize: () => undefined } });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("retained allowlist");

		const prototypeAttachment = emptyCodexWorkbenchRetainedState();
		Object.setPrototypeOf(prototypeAttachment.control, { decoder: {} });
		expect(() => assertCodexWorkbenchRetainedState(prototypeAttachment)).toThrow(
			"retained prototype attachment",
		);

		const processMethodAttachment = emptyCodexWorkbenchRetainedState();
		processMethodAttachment.process = policyProcess();
		Object.setPrototypeOf(
			processMethodAttachment.process.start,
			Object.create(Function.prototype, { session: { value: {} } }),
		);
		expect(() => assertCodexWorkbenchRetainedState(processMethodAttachment)).toThrow(
			"plain callable slot",
		);

		const slotAttachment = emptyCodexWorkbenchRetainedState();
		slotAttachment.control.current = Object.assign(
			{ ...slotAttachment.control.wrappers },
			{
				gatewaySession: {},
			},
		);
		expect(() => assertCodexWorkbenchRetainedState(slotAttachment)).toThrow("retained allowlist");

		const spoofedPrototype = emptyCodexWorkbenchRetainedState();
		spoofedPrototype.process = policyProcess();
		Object.setPrototypeOf(spoofedPrototype.process.start, {
			[Symbol.toStringTag]: "AsyncFunction",
		});
		expect(() => assertCodexWorkbenchRetainedState(spoofedPrototype)).toThrow(
			"plain callable slot",
		);

		const functionAttachment = emptyCodexWorkbenchRetainedState();
		functionAttachment.process = policyProcess();
		Object.assign(functionAttachment.process.stop, { session: {} });
		expect(() => assertCodexWorkbenchRetainedState(functionAttachment)).toThrow(
			"reachable attached value",
		);

		const intrinsicAttachment = emptyCodexWorkbenchRetainedState();
		intrinsicAttachment.process = policyProcess();
		const asyncPrototype = Object.getPrototypeOf(intrinsicAttachment.process.start) as Record<
			PropertyKey,
			unknown
		>;
		try {
			asyncPrototype.archboardOwner = {};
			expect(() => assertCodexWorkbenchRetainedState(intrinsicAttachment)).toThrow(
				"intrinsic callable prototype",
			);
		} finally {
			Reflect.deleteProperty(asyncPrototype, "archboardOwner");
		}
	});
});
