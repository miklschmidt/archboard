import { describe, expect, test } from "bun:test";

import type {
	CodexProcess,
	CodexProcessChild,
	CodexProcessSnapshot,
} from "../../../runtime/codex-process/index.js";
import type { TransportServerRequest } from "../../../runtime/codex-transport/server-requests.js";
import type { CodexWorkbenchGateway } from "../../codex-workbench/index.js";
import {
	createCodexWorkbenchRequestRouter,
	type CodexWorkbenchGenerationHooks,
} from "../codex-workbench-generation.js";
import {
	CodexWorkbenchCompositionError,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CODEX_WORKBENCH_OWNER,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchGenerationInput,
} from "../codex-workbench-owner.js";

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
		replaceHooks: async () => void events.push(`generation:${number}:replace-hooks`),
		stop: async (reason) => void events.push(`generation:${number}:stop:${reason}`),
		finishStop: () => void events.push(`generation:${number}:finish-stop`),
	};
}

describe("production Codex owner installation", () => {
	test("releases registration when process-owner construction fails", () => {
		const retained = emptyCodexWorkbenchRetainedState();
		expect(() =>
			installCodexWorkbenchOwner(retained, {
				createProcess: () => {
					throw new Error("process construction failed");
				},
				createGeneration: async () => fakeGeneration([], 1),
			}),
		).toThrow("could not be created");
		expect(retained).toMatchObject({ owner: null, process: null, state: "failed" });
		expect(() =>
			installCodexWorkbenchOwner(retained, {
				createProcess: () => fakeProcess([]),
				createGeneration: async () => fakeGeneration([], 1),
			}),
		).not.toThrow();
	});

	test("retains one process and generation while replacing only source hooks", async () => {
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
		await first.reload({} as CodexWorkbenchGenerationHooks);
		expect(processCreates).toBe(1);
		expect(events).toEqual(["process:start", "generation:1:create", "generation:1:replace-hooks"]);
		expect((first.gateway() as unknown as { marker: number }).marker).toBe(1);
		expect(first.snapshot().generation).toBe(2);
		expect((await first.shutdown()).state).toBe("idle");
		expect(events.slice(-3)).toEqual([
			"generation:1:stop:shutdown",
			"process:stop",
			"generation:1:finish-stop",
		]);
	});

	test("refuses every second active registration, including the same owner", () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const options = {
			createProcess: () => fakeProcess([]),
			createGeneration: async () => fakeGeneration([], 1),
		};
		installCodexWorkbenchOwner(retained, options);
		expect(() => installCodexWorkbenchOwner(retained, options)).toThrow(
			CodexWorkbenchCompositionError,
		);
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

	test("retires readiness synchronously on child exit and permits registration after cleanup", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		let input: CodexWorkbenchGenerationInput | null = null;
		const options = {
			createProcess: () => fakeProcess(events),
			createGeneration: async (value: CodexWorkbenchGenerationInput) => {
				input = value;
				return fakeGeneration(events, value.generation);
			},
		};
		const owner = installCodexWorkbenchOwner(retained, options);
		await owner.start();
		const captured = input as CodexWorkbenchGenerationInput | null;
		if (captured === null) throw new Error("generation input was not captured");
		captured.onChildExitStart();
		expect(owner.snapshot()).toMatchObject({ state: "stopping", ready: false });
		await captured.onChildExitFinished();
		expect(owner.snapshot()).toMatchObject({ state: "idle", ready: false });
		expect(() => installCodexWorkbenchOwner(retained, options)).not.toThrow();
	});

	test("terminal shutdown is idempotent and permits one later registration", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const options = {
			createProcess: () => fakeProcess(events),
			createGeneration: async () => fakeGeneration(events, 1),
		};
		const owner = installCodexWorkbenchOwner(retained, options);
		await owner.start();
		await Promise.all([owner.shutdown(), owner.shutdown()]);
		expect(events.filter((event) => event === "process:stop")).toHaveLength(1);
		expect(() => installCodexWorkbenchOwner(retained, options)).not.toThrow();
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

	test("does not wait forever when process start fails before publishing a child", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const process = fakeProcess([]);
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => ({
				...process,
				start: () => Promise.reject(new Error("spawn failed")),
			}),
			createGeneration: async () => fakeGeneration([], 1),
		});

		try {
			await owner.start();
			expect.unreachable("startup should fail");
		} catch (error) {
			expect(error).toBeInstanceOf(CodexWorkbenchCompositionError);
			expect((error as Error).message).toContain("did not become ready");
		}
		expect(retained.owner).toBeNull();
	});
});
