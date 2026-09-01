import { describe, expect, test } from "bun:test";

import type { TransportServerRequest } from "../../../runtime/codex-transport/server-requests.js";
import { createCodexWorkbenchRequestRouter } from "../codex-workbench-generation.js";
import {
	CodexWorkbenchCompositionError,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CODEX_WORKBENCH_OWNER,
	type CodexWorkbenchGenerationFactory,
	type CodexWorkbenchGenerationInput,
} from "../codex-workbench-owner.js";
import { fakeGeneration, fakeProcess } from "./support/codex-workbench-owner-fake.js";

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

function rejected(operation: Promise<unknown>): Promise<unknown> {
	return operation.then(
		() => null,
		(error: unknown) => error,
	);
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
				respondCurrentTime: async (value) => void routed.push(`session:${value.method}`),
				respondUnsupportedTokenRefresh: async (value) =>
					void routed.push(`session:${value.method}`),
				respondUnsupportedAttestation: async (value) => void routed.push(`session:${value.method}`),
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

describe("production Codex owner lifecycle", () => {
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
	});

	test("keeps one process while rebuilding the complete volatile graph", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		let processCreates = 0;
		const createGeneration: CodexWorkbenchGenerationFactory = async ({ generation, kernel }) => {
			events.push(`generation:${generation}:create`);
			const source = fakeGeneration(events, generation);
			if (kernel !== null)
				Object.assign(source, {
					identityLedger: kernel.identityLedger,
					transport: kernel.transport,
				});
			return source;
		};
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => {
				processCreates++;
				return fakeProcess(events);
			},
			createGeneration,
		});
		await owner.start();
		const originalLedger = retained.control.runtime?.identityLedger;
		const originalTransport = retained.control.runtime?.transport;
		await owner.reload(createGeneration);
		expect(processCreates).toBe(1);
		expect(owner.snapshot()).toMatchObject({ generation: 2, ready: true });
		expect((owner.gateway() as unknown as { marker: number }).marker).toBe(2);
		expect(retained.control.runtime?.identityLedger).toBe(originalLedger);
		expect(retained.control.runtime?.transport).toBe(originalTransport);
		expect(events).toContain("generation:1:stop:reload");
		await owner.shutdown();
		expect(events).toContain("generation:2:stop:shutdown");
	});

	test("revokes every public wrapper synchronously before a deferred disposer resolves", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const events: string[] = [];
		let releaseStop!: () => void;
		const stopGate = new Promise<void>((resolve) => void (releaseStop = resolve));
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createGeneration: async ({ generation }) =>
				fakeGeneration(events, generation, {
					stop: async () => {
						events.push("owner:stop:entered");
						await stopGate;
					},
				}),
		});
		await owner.start();
		const wrappers = retained.control.wrappers;
		const shutdown = owner.shutdown();
		expect(events).toContain("owner:stop:entered");
		for (const dispatch of [
			() => wrappers.start(),
			() => wrappers.reload(async () => fakeGeneration([], 3)),
			() => wrappers.shutdown(),
			() => wrappers.snapshot(),
			() => wrappers.gateway(),
		])
			expect(dispatch).toThrow("no active retained owner dispatch");
		expect(events.filter((event) => event === "owner:stop:entered")).toHaveLength(1);
		releaseStop();
		await shutdown;
	});

	test("a stale delayed start cleans only itself and cannot overwrite a replacement owner", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const oldEvents: string[] = [];
		let releaseGeneration!: () => void;
		const generationGate = new Promise<void>((resolve) => void (releaseGeneration = resolve));
		const oldOwner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(oldEvents),
			createGeneration: async () => {
				await generationGate;
				return fakeGeneration(oldEvents, 1);
			},
		});
		const staleStart = oldOwner.start();
		await Promise.resolve();
		await oldOwner.shutdown();
		const replacement = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess([]),
			createGeneration: async () => fakeGeneration([], 9),
		});
		await replacement.start();
		const replacementRuntime = retained.control.runtime;
		releaseGeneration();
		expect(await rejected(staleStart)).toBeInstanceOf(CodexWorkbenchCompositionError);
		expect(retained.control.runtime).toBe(replacementRuntime);
		expect(retained.control.current).not.toBeNull();
		expect((replacement.gateway() as unknown as { marker: number }).marker).toBe(9);
		expect(replacement.snapshot()).toMatchObject({ ready: true, generation: 2 });
		await replacement.shutdown();
	});

	test("shutdown synchronously stops an activating startup graph", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const events: string[] = [];
		let enterActivation!: () => void;
		const activationEntered = new Promise<void>((resolve) => void (enterActivation = resolve));
		let releaseActivation!: () => void;
		const activationGate = new Promise<void>((resolve) => void (releaseActivation = resolve));
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createGeneration: async ({ generation }) =>
				fakeGeneration(events, generation, {
					activate: async () => {
						enterActivation();
						await activationGate;
					},
					stop: async () => void events.push("generation:stop:entered"),
				}),
		});
		const start = owner.start();
		await activationEntered;
		const shutdown = owner.shutdown();
		expect(events).toContain("generation:stop:entered");
		releaseActivation();
		await shutdown;
		expect(await rejected(start)).toBeInstanceOf(CodexWorkbenchCompositionError);
	});

	test("shutdown remains callable while a replacement factory is awaiting", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const events: string[] = [];
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createGeneration: async ({ generation }) =>
				fakeGeneration(events, generation, {
					stop: async () => void events.push("generation:stop:entered"),
				}),
		});
		await owner.start();
		let enterReplacement!: () => void;
		const replacementEntered = new Promise<void>((resolve) => void (enterReplacement = resolve));
		let releaseReplacement!: () => void;
		const replacementGate = new Promise<void>((resolve) => void (releaseReplacement = resolve));
		const reload = owner.reload(async ({ generation }) => {
			enterReplacement();
			await replacementGate;
			return fakeGeneration(events, generation);
		});
		await replacementEntered;
		const shutdown = owner.shutdown();
		expect(events).toContain("generation:stop:entered");
		releaseReplacement();
		await shutdown;
		expect(await rejected(reload)).toBeInstanceOf(CodexWorkbenchCompositionError);
	});

	test("refuses duplicate active registration and releases after child retirement", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		let input: CodexWorkbenchGenerationInput | null = null;
		const options = {
			createProcess: () => fakeProcess([]),
			createGeneration: async (value: CodexWorkbenchGenerationInput) => {
				input = value;
				return fakeGeneration([], value.generation);
			},
		};
		const owner = installCodexWorkbenchOwner(retained, options);
		expect(() => installCodexWorkbenchOwner(retained, options)).toThrow(
			CodexWorkbenchCompositionError,
		);
		await owner.start();
		const captured = input as CodexWorkbenchGenerationInput | null;
		if (captured === null) throw new Error("generation input was not captured");
		captured.onChildExitStart();
		expect(retained).toMatchObject({ state: "stopping" });
		expect(retained.control.current).toBeNull();
		await captured.onChildExitFinished(null);
		expect(retained).toMatchObject({ state: "idle", owner: null, process: null });
		expect(() => installCodexWorkbenchOwner(retained, options)).not.toThrow();
	});

	test("stops the owned child when generation startup fails", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createGeneration: () => Promise.reject(new Error("session initialization failed")),
		});
		expect(await rejected(owner.start())).toBeInstanceOf(CodexWorkbenchCompositionError);
		expect(events).toEqual(["process:start", "process:stop"]);
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
});
