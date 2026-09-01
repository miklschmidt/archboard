import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
	CodexProcess,
	CodexProcessChild,
	CodexProcessSnapshot,
} from "../../../src/runtime/codex-process/index.js";
import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "../../../src/shared/codex-workbench-identity/index.js";
import type { CodexWorkbenchGateway } from "../../../src/server/codex-workbench/index.js";

import {
	assertCodexWorkbenchRetainedState,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchOwnerOptions,
	type CodexWorkbenchRetainedState,
} from "../../../src/server/canvas/codex-workbench-owner.js";

const RETAINED_KEYS = ["control", "failure", "generation", "owner", "process", "state"];
const CONTROL_KEYS = ["current", "runtime", "wrappers"];
const OWNER_SLOT_KEYS = ["gateway", "reload", "shutdown", "snapshot", "start"];
const RUNTIME_KEYS = [
	"accountReady",
	"exitBridge",
	"identityLedger",
	"operation",
	"process",
	"released",
	"sessionInitialized",
	"transport",
];

function installFakeOwner(
	retained: CodexWorkbenchRetainedState,
	options: Omit<CodexWorkbenchOwnerOptions, "createKernel">,
) {
	return installCodexWorkbenchOwner(retained, {
		...options,
		createKernel: () => {
			const source = fakeGeneration([], 0);
			return {
				kernel: { identityLedger: source.identityLedger, transport: source.transport },
				identity: source.components.identity,
			};
		},
		createGeneration: async (input) => {
			const source = await options.createGeneration(input);
			if (input.kernel === null || input.initialIdentity === null)
				throw new Error("missing fake kernel");
			Object.assign(source, {
				identityLedger: input.kernel.identityLedger,
				transport: input.kernel.transport,
			});
			Object.assign(source.components, {
				identity: input.initialIdentity,
				transport: input.kernel.transport,
			});
			return source;
		},
	});
}

function fakeProcess(events: string[]): CodexProcess {
	const child = { pid: 14314 } as CodexProcessChild;
	const listeners = new Set<(child: CodexProcessChild) => void>();
	let running = false;
	const snapshot = (): CodexProcessSnapshot =>
		({
			state: running ? "running" : "stopped",
			pid: running ? child.pid : null,
			ready: running,
		}) as CodexProcessSnapshot;
	return {
		start: async () => {
			events.push("process:start");
			running = true;
			for (const listener of listeners) listener(child);
			return snapshot();
		},
		stop: async () => {
			events.push("process:stop");
			running = false;
			return snapshot();
		},
		snapshot,
		currentChild: () => (running ? child : null),
		onChild: (listener) => {
			listeners.add(listener);
			if (running) listener(child);
			return () => listeners.delete(listener);
		},
		subscribe: () => () => undefined,
	};
}

function fakeGeneration(events: string[], generation: number): CodexWorkbenchGeneration {
	const identityLedger = createIdentityLedger();
	const identity = createIdentityAuthorities(identityLedger);
	const transport = {
		replaceIdentity: () => undefined,
		request: async () => ({}) as never,
		sendNotification: async () => undefined,
		registerDynamicDispatcher: () => undefined,
		ownsPendingReverseRequest: () => false,
		respond: async () => undefined,
		onServerRequest: () => () => undefined,
		onServerNotification: () => () => undefined,
		onIssue: () => () => undefined,
		onStderr: () => () => undefined,
		onExit: () => () => undefined,
		inspect: () => ({ state: "open" }) as never,
		inspectLateResponses: () => [],
		inspectIssues: () => [],
		inspectStderr: () => ({}) as never,
		shutdown: async () => undefined,
	};
	const gateway = { marker: generation, dispose: async () => undefined };
	let stopped = false;
	return {
		components: { identity, transport, gateway } as never,
		identityLedger,
		transport: transport as never,
		gateway: gateway as unknown as CodexWorkbenchGateway,
		activate: async () => void events.push(`generation:${generation}:activate`),
		deactivate: () => void events.push(`generation:${generation}:deactivate`),
		retireChild: async () => undefined,
		stop: async (reason) => {
			if (stopped) return;
			stopped = true;
			events.push(`generation:${generation}:stop:${reason}`);
		},
		finishStop: () => void events.push(`generation:${generation}:finish-stop`),
	};
}

describe("production Codex workbench composition policy", () => {
	test("publishes narrow entrypoints and keeps lifecycle implementation private", () => {
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
		expect(existsSync(path.join(root, "codex-workbench-lifecycle.ts"))).toBeFalse();
		expect(existsSync(path.join(root, "lib/codex-workbench-lifecycle.ts"))).toBeTrue();
	});

	test("only the private lifecycle owner imports the private request router", async () => {
		const root = path.resolve(import.meta.dir, "../../../src/server/canvas");
		const importers: string[] = [];
		for await (const file of new Bun.Glob("**/*.ts").scan({ cwd: root })) {
			if (file === "lib/codex-workbench-routing.ts") continue;
			const source = readFileSync(path.join(root, file), "utf8");
			if (source.includes("codex-workbench-routing.js")) importers.push(file);
		}
		expect(importers.toSorted()).toEqual(["lib/codex-workbench-lifecycle.ts"]);
		expect(readFileSync(path.join(root, "codex-workbench-generation.ts"), "utf8")).not.toContain(
			"createCodexWorkbenchRequestRouter",
		);
	});

	test("retains only scalar coordination, stable kernel handles, and replaceable slots", async () => {
		const retained = Object.seal(emptyCodexWorkbenchRetainedState());
		const created: CodexWorkbenchGeneration[] = [];
		const owner = installFakeOwner(retained, {
			createProcess: () => fakeProcess([]),
			createGeneration: async ({ generation }) => {
				const source = fakeGeneration([], generation);
				created.push(source);
				return source;
			},
		});
		await owner.start();
		const runtime = retained.control.runtime;
		if (runtime?.identityLedger == null || runtime.transport == null)
			throw new Error("missing retained runtime kernel");
		const stableLedger = runtime.identityLedger;
		const stableTransport = runtime.transport;
		expect(Object.keys(retained).toSorted()).toEqual(RETAINED_KEYS);
		expect(Object.keys(retained.control).toSorted()).toEqual(CONTROL_KEYS);
		expect(Object.keys(retained.control.wrappers).toSorted()).toEqual(OWNER_SLOT_KEYS);
		expect(Object.keys(retained.control.current ?? {}).toSorted()).toEqual(OWNER_SLOT_KEYS);
		expect(Object.keys(runtime).toSorted()).toEqual(RUNTIME_KEYS);
		expect(Object.keys(runtime.exitBridge).toSorted()).toEqual(["event", "handler"]);
		expect("listener" in runtime.exitBridge).toBeFalse();
		expect("unsubscribe" in runtime.exitBridge).toBeFalse();
		for (const forbidden of [
			"generation",
			"components",
			"owners",
			"session",
			"coordinator",
			"realtime",
			"gateway",
			"router",
			"callbacks",
			"approvals",
			"decoder",
		])
			expect(forbidden in runtime, forbidden).toBeFalse();
		assertCodexWorkbenchRetainedState(retained);

		const first = created[0]!;
		const firstSlots = retained.control.current;
		const firstExitHandler = runtime.exitBridge.handler;
		await owner.reload(async ({ generation, kernel }) => {
			expect(kernel?.identityLedger).toBe(stableLedger);
			expect(kernel?.transport).toBe(stableTransport);
			const source = fakeGeneration([], generation);
			if (kernel !== null)
				Object.assign(source, {
					identityLedger: kernel.identityLedger,
					transport: kernel.transport,
				});
			created.push(source);
			return source;
		});
		expect(created).toHaveLength(2);
		expect(retained.control.current).not.toBe(firstSlots);
		expect(runtime.exitBridge.handler).not.toBe(firstExitHandler);
		expect(retained.control.runtime).toBe(runtime);
		expect(runtime.identityLedger).toBe(created[1]!.identityLedger);
		expect(runtime.transport).toBe(created[1]!.transport);
		for (const key of ["activate", "deactivate", "stop", "finishStop"] as const)
			Object.assign(first, {
				[key]: () => {
					throw new Error(`retired ${key} executed`);
				},
			});
		expect(retained.control.wrappers.snapshot()).toMatchObject({ ready: true, generation: 2 });
		expect(retained.control.wrappers.gateway()).toBe(created[1]!.gateway);
		await owner.shutdown();
	});

	test("rejects hostile descendants at every retained structural boundary", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const owner = installFakeOwner(retained, {
			createProcess: () => fakeProcess([]),
			createGeneration: async ({ generation }) => fakeGeneration([], generation),
		});
		await owner.start();
		const runtime = retained.control.runtime;
		if (runtime?.identityLedger == null || runtime.transport == null)
			throw new Error("missing retained kernel");

		Object.assign(runtime, { session: {} });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("retained allowlist");
		Reflect.deleteProperty(runtime, "session");

		Object.assign(runtime.identityLedger.issued, { decoder: {} });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("issuance ledger");
		Reflect.deleteProperty(runtime.identityLedger.issued, "decoder");

		runtime.identityLedger.issued.set("thread", new Set([{} as never]));
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("hidden descendant");
		runtime.identityLedger.issued.delete("thread");

		Object.assign(runtime.transport, { coordinator: {} });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("retained allowlist");
		Reflect.deleteProperty(runtime.transport, "coordinator");

		Object.assign(runtime.exitBridge, { generationCallback: () => undefined });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("retained allowlist");
		Reflect.deleteProperty(runtime.exitBridge, "generationCallback");
		Object.assign(runtime.exitBridge.handler ?? {}, { authority: {} });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("retained allowlist");
		Reflect.deleteProperty(runtime.exitBridge.handler ?? {}, "authority");

		runtime.exitBridge.event = { child: {} } as never;
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("retained allowlist");
		runtime.exitBridge.event = null;

		Object.assign(retained.control.current ?? {}, { approval: {} });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("retained allowlist");
		Reflect.deleteProperty(retained.control.current ?? {}, "approval");

		Object.setPrototypeOf(runtime.identityLedger, { authority: {} });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow(
			"retained prototype attachment",
		);
		Object.setPrototypeOf(runtime.identityLedger, Object.prototype);
		await owner.shutdown();
	});
});
