import { describe, expect, test } from "bun:test";

import {
	CodexWorkbenchCompositionError,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CodexWorkbenchGenerationFactory,
	type CodexWorkbenchGeneration,
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

function adoptKernel(
	candidate: CodexWorkbenchGeneration,
	kernel: NonNullable<CodexWorkbenchGenerationInput["kernel"]>,
): CodexWorkbenchGeneration {
	Object.assign(candidate, {
		identityLedger: kernel.identityLedger,
		transport: kernel.transport,
	});
	Object.assign(candidate.components, { transport: kernel.transport });
	return candidate;
}

describe("production Codex generation replacement failures", () => {
	test("restores the retired generation identity before a clean rollback", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const original = fakeGeneration([], 1);
		const replacements: unknown[] = [];
		Object.assign(original.transport, {
			replaceIdentity: (identity: unknown) => void replacements.push(identity),
		});
		let candidateIdentity: unknown;
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess([]),
			createKernel: () => ({
				kernel: { identityLedger: original.identityLedger, transport: original.transport },
				identity: original.components.identity,
			}),
			createGeneration: async () => original,
		});
		await owner.start();
		await rejected(
			owner.reload(async ({ generation, kernel }) => {
				if (kernel === null) throw new Error("missing stable kernel");
				const candidate = fakeGeneration([], generation, {
					activate: async () => {
						throw new Error("candidate activation failed");
					},
				});
				candidateIdentity = candidate.components.identity.identity;
				original.transport.replaceIdentity(candidate.components.identity.identity);
				return adoptKernel(candidate, kernel);
			}),
		);
		expect(replacements).toEqual([candidateIdentity, original.components.identity.identity]);
		expect(owner.snapshot()).toMatchObject({ ready: true, generation: 2 });
		await owner.shutdown();
	});

	test("restores the complete previous generation after clean candidate activation failure", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const originalFactory: CodexWorkbenchGenerationFactory = async ({ generation }) =>
			fakeGeneration(events, generation);
		const owner = installFakeCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createGeneration: originalFactory,
		});
		await owner.start();
		const originalGateway = owner.gateway();
		const failure = await rejected(
			owner.reload(async ({ generation, kernel }) => {
				if (kernel === null) throw new Error("missing stable kernel");
				return adoptKernel(
					fakeGeneration(events, generation, {
						activate: async () => {
							throw new Error("candidate activation failed");
						},
					}),
					kernel,
				);
			}),
		);
		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toContain("candidate activation failed");
		expect(owner.snapshot()).toMatchObject({ ready: true, state: "ready" });
		expect(owner.gateway()).toBe(originalGateway);
		expect(events.filter((event) => event === "generation:1:activate")).toHaveLength(2);
		expect(events).toContain("generation:2:stop:reload");
		await owner.shutdown();
	});

	test("a removal failure terminally releases authority and permits reinstall", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const owner = installFakeCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess([]),
			createGeneration: async ({ generation }) =>
				fakeGeneration([], generation, {
					deactivate: () => {
						throw new Error("registration cleanup failed");
					},
				}),
		});
		await owner.start();
		const failure = await rejected(owner.reload(async () => fakeGeneration([], 2)));
		expect(failure).toBeInstanceOf(CodexWorkbenchCompositionError);
		expect(retained).toMatchObject({ owner: null, process: null, state: "failed" });
		expect(retained.control).toMatchObject({ current: null, runtime: null });
		const replacement = installFakeCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess([]),
			createGeneration: async () => fakeGeneration([], 3),
		});
		await replacement.shutdown();
	});

	test("a rollback failure aggregates both causes and never publishes a mixed graph", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		let activations = 0;
		const owner = installFakeCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess([]),
			createGeneration: async ({ generation }) =>
				fakeGeneration([], generation, {
					activate: async () => {
						activations++;
						if (activations > 1) throw new Error("rollback activation failed");
					},
				}),
		});
		await owner.start();
		const failure = await rejected(
			owner.reload(async ({ generation, kernel }) => {
				if (kernel === null) throw new Error("missing stable kernel");
				return adoptKernel(
					fakeGeneration([], generation, {
						activate: async () => {
							throw new Error("candidate activation failed");
						},
					}),
					kernel,
				);
			}),
		);
		expect(failure).toBeInstanceOf(CodexWorkbenchCompositionError);
		expect(retained.control).toMatchObject({ current: null, runtime: null });
		expect(retained.owner).toBeNull();
	});

	test("a stale rollback cannot publish after shutdown and reinstall during activation", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		let activations = 0;
		let rollbackEntered!: () => void;
		const entered = new Promise<void>((resolve) => void (rollbackEntered = resolve));
		let releaseRollback!: () => void;
		const rollbackGate = new Promise<void>((resolve) => void (releaseRollback = resolve));
		const original = fakeGeneration([], 1, {
			activate: async () => {
				activations++;
				if (activations === 1) return;
				rollbackEntered();
				await rollbackGate;
			},
		});
		const owner = installFakeCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess([]),
			createGeneration: async () => original,
		});
		await owner.start();
		const staleReload = owner.reload(async ({ generation, kernel }) => {
			if (kernel === null) throw new Error("missing stable kernel");
			return adoptKernel(
				fakeGeneration([], generation, {
					activate: async () => {
						throw new Error("candidate activation failed");
					},
				}),
				kernel,
			);
		});
		await entered;
		await owner.shutdown();

		const replacement = installFakeCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess([]),
			createGeneration: async () => fakeGeneration([], 9),
		});
		await replacement.start();
		const replacementRuntime = retained.control.runtime;
		const replacementSlots = retained.control.current;
		releaseRollback();

		expect(await rejected(staleReload)).toBeInstanceOf(CodexWorkbenchCompositionError);
		expect(retained.control.runtime).toBe(replacementRuntime);
		expect(retained.control.current).toBe(replacementSlots);
		expect((replacement.gateway() as unknown as { marker: number }).marker).toBe(9);
		await replacement.shutdown();
	});

	for (const failure of ["none", "activation", "candidate-cleanup"] as const)
		test(`shutdown owns old and candidate generations during ${failure} failure`, async () => {
			const retained = emptyCodexWorkbenchRetainedState();
			const events: string[] = [];
			let activationEntered!: () => void;
			const entered = new Promise<void>((resolve) => void (activationEntered = resolve));
			let releaseActivation!: () => void;
			const activationGate = new Promise<void>((resolve) => void (releaseActivation = resolve));
			const original = fakeGeneration(events, 1);
			const owner = installFakeCodexWorkbenchOwner(retained, {
				createProcess: () => fakeProcess(events),
				createGeneration: async () => original,
			});
			await owner.start();
			const reload = owner.reload(async ({ generation, kernel }) => {
				if (kernel === null) throw new Error("missing stable kernel");
				return adoptKernel(
					fakeGeneration(events, generation, {
						activate: async () => {
							activationEntered();
							await activationGate;
							if (failure === "activation") throw new Error("activation failed");
						},
						stop: async () => {
							if (failure === "candidate-cleanup") throw new Error("candidate cleanup failed");
						},
					}),
					kernel,
				);
			});
			await entered;
			const shutdown = owner.shutdown();
			releaseActivation();
			await rejected(shutdown);
			expect(await rejected(reload)).toBeInstanceOf(Error);
			expect(events.filter((event) => event.startsWith("generation:1:stop:"))).toHaveLength(1);
			expect(events.filter((event) => event === "generation:1:finish-stop")).toHaveLength(1);
		});
});
