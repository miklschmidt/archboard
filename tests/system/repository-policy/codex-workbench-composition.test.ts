import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
	CodexProcess,
	CodexProcessChild,
	CodexProcessSnapshot,
} from "../../../src/runtime/codex-process/index.js";
import type { CodexWorkbenchGateway } from "../../../src/server/codex-workbench/index.js";
import {
	assertCodexWorkbenchRetainedState,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CodexWorkbenchGeneration,
} from "../../../src/server/canvas/codex-workbench-owner.js";
import type { CodexWorkbenchGenerationHooks } from "../../../src/server/canvas/codex-workbench-generation.js";

const RETAINED_KEYS = ["control", "failure", "generation", "owner", "process", "state"] as const;

const OWNER_SLOT_KEYS = ["gateway", "reload", "shutdown", "snapshot", "start"] as const;

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
	return {
		transport: {} as never,
		gateway: {} as CodexWorkbenchGateway,
		router: { route: () => undefined },
		replaceHooks: async () => void (reloads.count += 1),
		stop: async () => undefined,
		finishStop: () => undefined,
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
			control: { current: null },
		});
		expect(Object.keys(retained.control).toSorted()).toEqual(["current", "wrappers"]);
		expect(Object.keys(retained.control.wrappers).toSorted()).toEqual([...OWNER_SLOT_KEYS]);
	});

	test("keeps the exact retained allowlist across install and source-hook reload", async () => {
		const retained = Object.seal(emptyCodexWorkbenchRetainedState());
		const reloads = { count: 0 };
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: policyProcess,
			createGeneration: async () => policyGeneration(reloads),
		});

		await owner.start();
		expect(Object.keys(retained).toSorted()).toEqual([...RETAINED_KEYS]);
		expect(Object.values(retained)).not.toContain(owner.gateway());
		const generationGateway = owner.gateway();
		const stableWrappers = retained.control.wrappers;
		const firstSlots = retained.control.current;

		await owner.reload({} as CodexWorkbenchGenerationHooks);
		expect(reloads.count).toBe(1);
		expect(Object.keys(retained).toSorted()).toEqual([...RETAINED_KEYS]);
		expect(Object.values(retained)).not.toContain(owner.gateway());
		expect(retained.control.wrappers).toBe(stableWrappers);
		expect(retained.control.current).not.toBe(firstSlots);
		expect(Object.keys(retained.control.current ?? {}).toSorted()).toEqual([...OWNER_SLOT_KEYS]);
		if (firstSlots === null) throw new Error("The first generation did not publish owner slots.");
		(firstSlots as unknown as { snapshot: () => never }).snapshot = () => {
			throw new Error("poisoned retired snapshot slot executed");
		};
		(firstSlots as unknown as { gateway: () => never }).gateway = () => {
			throw new Error("poisoned retired gateway slot executed");
		};
		expect(retained.control.wrappers.snapshot().generation).toBe(2);
		expect(retained.control.wrappers.gateway()).toBe(generationGateway);
		await owner.shutdown();
		expect(retained.control.current).toBeNull();
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
	});
});
