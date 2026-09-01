import { describe, expect, test } from "bun:test";

import {
	CodexWorkbenchCompositionError,
	emptyCodexWorkbenchRetainedState,
	type CODEX_WORKBENCH_OWNER,
	type CodexWorkbenchGenerationFactory,
	type CodexWorkbenchGenerationInput,
} from "../codex-workbench-owner.js";
import {
	fakeGeneration,
	fakeProcess,
	installFakeCodexWorkbenchOwner,
} from "./support/codex-workbench-owner-fake.js";

function rejected(operation: Promise<unknown>): Promise<unknown> {
	return operation.then(
		() => null,
		(error: unknown) => error,
	);
}

describe("production Codex owner lifecycle", () => {
	test("releases registration when process-owner construction fails", () => {
		const retained = emptyCodexWorkbenchRetainedState();
		expect(() =>
			installFakeCodexWorkbenchOwner(retained, {
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
		const owner = installFakeCodexWorkbenchOwner(retained, {
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
		const owner = installFakeCodexWorkbenchOwner(retained, {
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
		const oldOwner = installFakeCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(oldEvents),
			createGeneration: async () => {
				await generationGate;
				return fakeGeneration(oldEvents, 1);
			},
		});
		const staleStart = oldOwner.start();
		await Promise.resolve();
		await oldOwner.shutdown();
		const replacement = installFakeCodexWorkbenchOwner(retained, {
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
		const owner = installFakeCodexWorkbenchOwner(retained, {
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
		const owner = installFakeCodexWorkbenchOwner(retained, {
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

	test("a stale reload cannot publish after shutdown and reinstall during old cleanup", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const oldEvents: string[] = [];
		let oldCleanupEntered!: () => void;
		const cleanupEntered = new Promise<void>((resolve) => void (oldCleanupEntered = resolve));
		let releaseOldCleanup!: () => void;
		const cleanupGate = new Promise<void>((resolve) => void (releaseOldCleanup = resolve));
		const original = fakeGeneration(oldEvents, 1, {
			stop: async (reason) => {
				if (reason !== "reload") return;
				oldCleanupEntered();
				await cleanupGate;
			},
		});
		const owner = installFakeCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(oldEvents),
			createGeneration: async () => original,
		});
		await owner.start();
		const staleReload = owner.reload(async ({ generation, kernel }) => {
			const candidate = fakeGeneration(oldEvents, generation);
			if (kernel !== null)
				Object.assign(candidate, {
					identityLedger: kernel.identityLedger,
					transport: kernel.transport,
				});
			return candidate;
		});
		await cleanupEntered;
		const shutdown = owner.shutdown();
		releaseOldCleanup();
		await shutdown;

		const replacement = installFakeCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess([]),
			createGeneration: async () => fakeGeneration([], 9),
		});
		await replacement.start();
		const replacementRuntime = retained.control.runtime;
		const replacementSlots = retained.control.current;

		expect(await rejected(staleReload)).toBeInstanceOf(CodexWorkbenchCompositionError);
		expect(retained.control.runtime).toBe(replacementRuntime);
		expect(retained.control.current).toBe(replacementSlots);
		expect(replacement.snapshot()).toMatchObject({ state: "ready", ready: true });
		expect((replacement.gateway() as unknown as { marker: number }).marker).toBe(9);
		await replacement.shutdown();
	});

	test("refuses duplicate active registration and releases after child retirement", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const options = {
			createProcess: () => fakeProcess([]),
			createGeneration: async (value: CodexWorkbenchGenerationInput) =>
				fakeGeneration([], value.generation),
		};
		const owner = installFakeCodexWorkbenchOwner(retained, options);
		expect(() => installFakeCodexWorkbenchOwner(retained, options)).toThrow(
			CodexWorkbenchCompositionError,
		);
		await owner.start();
		const runtime = retained.control.runtime;
		if (runtime?.identityLedger == null) throw new Error("missing retained identity ledger");
		const exit = Object.freeze({
			child: runtime.identityLedger.childId,
			epoch: runtime.identityLedger.epoch,
			code: 1,
			signal: null,
		});
		runtime.exitBridge.event = exit;
		runtime.exitBridge.handler?.handle(exit);
		expect(retained).toMatchObject({ state: "stopping" });
		expect(retained.control.current).toBeNull();
		for (let turn = 0; turn < 20 && retained.owner !== null; turn++) await Promise.resolve();
		expect(retained).toMatchObject({ state: "idle", owner: null, process: null });
		expect(() => installFakeCodexWorkbenchOwner(retained, options)).not.toThrow();
	});

	test("stops the owned child when generation startup fails", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const owner = installFakeCodexWorkbenchOwner(retained, {
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
			installFakeCodexWorkbenchOwner(retained, {
				createProcess: () => fakeProcess([]),
				createGeneration: async () => fakeGeneration([], 1),
			}),
		).toThrow(CodexWorkbenchCompositionError);
	});
});
