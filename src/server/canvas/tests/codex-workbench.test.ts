import { describe, expect, test } from "bun:test";

import {
	CodexWorkbenchCompositionError,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CODEX_WORKBENCH_OWNER,
	type CodexWorkbenchGenerationInput,
} from "../codex-workbench-owner.js";
import { composeCodexWorkbenchGeneration } from "../codex-workbench-generation.js";
import { createCodexWorkbenchGenerationFixture } from "./support/codex-workbench-generation-fixture.js";
import {
	fakeGeneration,
	fakeProcess,
	fakeRestartingProcess,
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

	test("normal shutdown finishes generation transport before stopping the process", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const fixture = createCodexWorkbenchGenerationFixture(events);
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createKernel: () => ({
				kernel: {
					identityLedger: fixture.identityLedger,
					transport: fixture.components.transport,
				},
				identity: fixture.components.identity,
			}),
			createGeneration: async (input) => {
				if (input.kernel === null)
					throw new Error("The integrated generation owner did not acquire its stable kernel.");
				return composeCodexWorkbenchGeneration({
					identityLedger: input.kernel.identityLedger,
					factories: fixture.factories,
					hooks: fixture.hooks,
					ownsTransport: false,
					activate: false,
					assertActivationCurrent: input.assertActivationCurrent,
				});
			},
		});
		await owner.start();
		await owner.shutdown();

		expect(events.filter((event) => event === "ordinary:settle:host_shutdown")).toHaveLength(1);
		expect(events.filter((event) => event === "transport:shutdown")).toHaveLength(1);
		expect(events.filter((event) => event === "process:stop")).toHaveLength(1);
		expect(events.indexOf("ordinary:settle:host_shutdown")).toBeLessThan(
			events.indexOf("transport:shutdown"),
		);
		expect(events.indexOf("transport:shutdown")).toBeLessThan(events.indexOf("process:stop"));
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

	test("refuses duplicate registration and replaces a retired child only after recovery", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const events: string[] = [];
		const process = fakeRestartingProcess(events);
		const options = {
			createProcess: () => process.process,
			createGeneration: async (value: CodexWorkbenchGenerationInput) =>
				fakeGeneration(events, value.generation),
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
		process.crash();
		expect(retained).toMatchObject({
			state: "starting",
			owner: "archboard-canvas-codex-workbench",
		});
		expect(() => owner.gateway()).toThrow("not ready");
		expect(events).not.toContain("process:stop");
		process.restart();
		for (let turn = 0; turn < 30 && !owner.snapshot().ready; turn++) await Promise.resolve();
		expect(owner.snapshot()).toMatchObject({ state: "ready", ready: true, generation: 2 });
		expect((owner.gateway() as unknown as { marker: number }).marker).toBe(2);
		expect(events.indexOf("generation:1:finish-stop")).toBeLessThan(
			events.indexOf("generation:2:activate"),
		);
		await owner.shutdown();
	});

	for (const failure of [
		{
			name: "terminal prior-group cleanup",
			code: "shutdown_failed",
			message: "the prior Codex process group could not be proved empty",
		},
		{
			name: "terminal replacement spawn",
			code: "spawn_failed",
			message: "the replacement Codex child could not spawn",
		},
	] as const) {
		test(`${failure.name} fails the active recovery before another child arrives`, async () => {
			const retained = emptyCodexWorkbenchRetainedState();
			const events: string[] = [];
			const process = fakeRestartingProcess(events);
			const owner = installFakeCodexWorkbenchOwner(retained, {
				createProcess: () => process.process,
				createGeneration: async ({ generation }) => fakeGeneration(events, generation),
			});
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
			process.crash();
			process.terminal(failure.code, failure.message);
			for (let turn = 0; turn < 20 && retained.state === "starting"; turn++)
				await Promise.resolve();

			expect(owner.snapshot()).toMatchObject({
				state: "failed",
				ready: false,
				failure: expect.stringContaining(failure.message),
			});
			expect(retained).toMatchObject({ owner: null, process: null, state: "failed" });
			expect(process.process.snapshot()).toMatchObject({ state: "stopped", pid: null });
			expect(retained.control.current).toBeNull();
			expect(() => retained.control.wrappers.snapshot()).toThrow(
				"no active retained owner dispatch",
			);
			expect(() => owner.gateway()).toThrow("no active retained owner dispatch");
			expect(events).not.toContain("process:restart");
			await owner.shutdown();
		});
	}

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
