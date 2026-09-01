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

const RETAINED_KEYS = [
	"failure",
	"generation",
	"owner",
	"process",
	"readCurrentSnapshot",
	"reloadCurrentGeneration",
	"shutdownCurrentGeneration",
	"startCurrentGeneration",
	"state",
] as const;

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

	test("starts with only scalar state, a process slot, and lifecycle closure slots", () => {
		expect(emptyCodexWorkbenchRetainedState()).toEqual({
			owner: null,
			generation: 0,
			state: "idle",
			failure: null,
			process: null,
			startCurrentGeneration: null,
			reloadCurrentGeneration: null,
			shutdownCurrentGeneration: null,
			readCurrentSnapshot: null,
		});
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

		await owner.reload({} as CodexWorkbenchGenerationHooks);
		expect(reloads.count).toBe(1);
		expect(Object.keys(retained).toSorted()).toEqual([...RETAINED_KEYS]);
		expect(Object.values(retained)).not.toContain(owner.gateway());
		await owner.shutdown();
	});

	test("rejects generation owners hidden in retained process and closure slots", () => {
		const forbidden = [
			["session", { initialize: () => undefined, threadRead: () => undefined }],
			["gateway", { connect: () => undefined, childExit: () => undefined }],
			["decoder", { parseThreadId: () => undefined, adoptThreadId: () => undefined }],
			["routeHandler", { route: () => undefined }],
			["callback", { onNotification: () => undefined }],
			["approvalDecision", { outcome: "approved", effectHash: "hash", decidedAtMs: 1 }],
			["effectAuthority", { issuer: {}, validator: {}, decoder: {} }],
			["uiMediaAdapter", { createOffer: () => undefined, attachRemoteMedia: () => undefined }],
		] as const;
		for (const [name, value] of forbidden) {
			const retained = emptyCodexWorkbenchRetainedState();
			// eslint-disable-next-line unicorn/consistent-function-scoping -- each mutation owner needs an isolated callable.
			const closure = () => Promise.resolve({} as never);
			Object.defineProperty(closure, name, { value, enumerable: false });
			retained.startCurrentGeneration = closure;
			expect(() => assertCodexWorkbenchRetainedState(retained), name).toThrow(
				"attached generation-defined value",
			);
		}

		const retained = emptyCodexWorkbenchRetainedState();
		retained.process = Object.assign(policyProcess(), { session: forbidden[0][1] });
		expect(() => assertCodexWorkbenchRetainedState(retained)).toThrow("retained allowlist");
	});
});
