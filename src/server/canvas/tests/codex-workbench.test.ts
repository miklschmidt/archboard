import { describe, expect, test } from "bun:test";

import type {
	CodexProcess,
	CodexProcessChild,
	CodexProcessSnapshot,
} from "../../../runtime/codex-process/index.js";
import type { TransportServerRequest } from "../../../runtime/codex-transport/server-requests.js";
import type { CodexWorkbenchGateway } from "../../codex-workbench/index.js";
import {
	CodexWorkbenchCompositionError,
	createCodexWorkbenchRequestRouter,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CODEX_WORKBENCH_OWNER,
	type CodexWorkbenchGeneration,
} from "../index.js";

const HUMAN_METHODS = [
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
	"item/tool/requestUserInput",
	"mcpServer/elicitation/request",
	"item/permissions/requestApproval",
	"applyPatchApproval",
	"execCommandApproval",
] as const;

function request(method: string, owner: string): TransportServerRequest {
	return { method, owner } as unknown as TransportServerRequest;
}

describe("production Codex request router", () => {
	test("routes all seven ordinary families and keeps both dynamic owners separate", async () => {
		const routed: string[] = [];
		const router = createCodexWorkbenchRequestRouter({
			approvals: {
				receive: (value) => {
					routed.push(`approval:${value.method}`);
					return {} as never;
				},
			},
			dynamicTools: {
				dispatch: async (value) => {
					routed.push(`general:${value.method}`);
					return {} as never;
				},
			},
			coordinatorTools: {
				onServerRequest: (value) => routed.push(`coordinator:${value.method}`),
			},
			session: {
				respondCurrentTime: async (value) => {
					routed.push(`session:${value.method}`);
				},
				respondUnsupportedTokenRefresh: async (value) => {
					routed.push(`session:${value.method}`);
				},
				respondUnsupportedAttestation: async (value) => {
					routed.push(`session:${value.method}`);
				},
			},
		});

		for (const method of HUMAN_METHODS) router.route(request(method, "codex-approvals"));
		router.route(request("item/tool/call", "codex-dynamic-tools"));
		router.route(request("item/tool/call", "codex-coordinator-tools"));
		await Promise.resolve();

		expect(routed).toEqual([
			...HUMAN_METHODS.map((method) => `approval:${method}`),
			"general:item/tool/call",
			"coordinator:item/tool/call",
		]);
	});

	test("routes the three auxiliary requests to their reviewed session responses", async () => {
		const routed: string[] = [];
		const router = createCodexWorkbenchRequestRouter({
			approvals: { receive: () => ({}) as never },
			dynamicTools: { dispatch: async () => ({}) as never },
			coordinatorTools: { onServerRequest: () => undefined },
			session: {
				respondCurrentTime: async (value) => void routed.push(value.method),
				respondUnsupportedTokenRefresh: async (value) => void routed.push(value.method),
				respondUnsupportedAttestation: async (value) => void routed.push(value.method),
			},
		});

		router.route(request("currentTime/read", "codex-session"));
		router.route(request("account/chatgptAuthTokens/refresh", "codex-session"));
		router.route(request("attestation/generate", "codex-session"));
		await Promise.resolve();

		expect(routed).toEqual([
			"currentTime/read",
			"account/chatgptAuthTokens/refresh",
			"attestation/generate",
		]);
	});
});

function fakeProcess(events: string[]): CodexProcess {
	const child = { pid: 14314 } as CodexProcessChild;
	const listeners = new Set<(child: CodexProcessChild) => void>();
	let running = false;
	const snapshot = (): CodexProcessSnapshot =>
		({
			state: running ? "running" : "stopped",
			pid: running ? child.pid : null,
			executablePath: "/repo/node_modules/@openai/codex/bin/codex.js",
			argv: [],
			cwd: "/repo",
			ready: running,
			accountReady: false,
			restartAttempt: 0,
			nextRestartAtMs: null,
			restartDelayMs: null,
			stderr: { text: "", totalBytes: 0, retainedBytes: 0, truncated: false },
			lastExit: null,
			failure: null,
		}) as unknown as CodexProcessSnapshot;
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

function fakeGeneration(events: string[], number: number): CodexWorkbenchGeneration {
	return {
		transport: {} as never,
		gateway: { marker: number } as unknown as CodexWorkbenchGateway,
		router: { route: () => undefined },
		stop: async (reason) => void events.push(`generation:${number}:stop:${reason}`),
		finishStop: () => void events.push(`generation:${number}:finish-stop`),
	};
}

describe("production Codex owner installation", () => {
	test("retains one process while replacing generation closures on reload", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		let processCreates = 0;
		const options = {
			createProcess: () => {
				processCreates++;
				return fakeProcess(events);
			},
			createGeneration: async ({ generation }: { readonly generation: number }) => {
				events.push(`generation:${generation}:create`);
				return fakeGeneration(events, generation);
			},
		};
		const first = installCodexWorkbenchOwner(retained, options);
		expect((await first.start()).ready).toBeTrue();
		const second = installCodexWorkbenchOwner(retained, options);
		expect((await second.start()).generation).toBe(2);
		expect(processCreates).toBe(1);
		expect(events).toEqual([
			"process:start",
			"generation:1:create",
			"generation:1:stop:reload",
			"generation:1:finish-stop",
			"process:start",
			"generation:2:create",
		]);
		expect((second.gateway() as unknown as { marker: number }).marker).toBe(2);
		expect((await second.shutdown()).state).toBe("idle");
		expect(events.slice(-3)).toEqual([
			"generation:2:stop:shutdown",
			"process:stop",
			"generation:2:finish-stop",
		]);
	});

	test("refuses a different retained owner without replacing it", () => {
		const retained = emptyCodexWorkbenchRetainedState();
		retained.owner = "another-owner" as typeof CODEX_WORKBENCH_OWNER;
		expect(() =>
			installCodexWorkbenchOwner(retained, {
				createProcess: () => fakeProcess([]),
				createGeneration: async () => fakeGeneration([], 1),
			}),
		).toThrow(CodexWorkbenchCompositionError);
	});

	test("stops the owned child when generation startup fails", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createGeneration: () => Promise.reject(new Error("session initialization failed")),
		});

		try {
			await owner.start();
			expect.unreachable("startup should fail");
		} catch (error) {
			expect(error).toBeInstanceOf(CodexWorkbenchCompositionError);
		}
		expect(owner.snapshot().state).toBe("failed");
		expect(events).toEqual(["process:start", "process:stop"]);
	});
});
