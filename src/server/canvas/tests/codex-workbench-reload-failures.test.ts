import { describe, expect, test } from "bun:test";

import {
	CodexWorkbenchCompositionError,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CodexWorkbenchGenerationFactory,
} from "../codex-workbench-owner.js";
import { fakeGeneration, fakeProcess } from "./support/codex-workbench-owner-fake.js";

function rejected(operation: Promise<unknown>): Promise<unknown> {
	return operation.then(
		() => null,
		(error: unknown) => error,
	);
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
			createGeneration: async () => original,
		});
		await owner.start();
		await rejected(
			owner.reload(async ({ generation }) => {
				const candidate = fakeGeneration([], generation, {
					activate: async () => {
						throw new Error("candidate activation failed");
					},
				});
				candidateIdentity = candidate.components.identity.identity;
				original.transport.replaceIdentity(candidate.components.identity.identity);
				return candidate;
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
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createGeneration: originalFactory,
		});
		await owner.start();
		const originalGateway = owner.gateway();
		const failure = await rejected(
			owner.reload(async ({ generation }) =>
				fakeGeneration(events, generation, {
					activate: async () => {
						throw new Error("candidate activation failed");
					},
				}),
			),
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
		const owner = installCodexWorkbenchOwner(retained, {
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
		const replacement = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess([]),
			createGeneration: async () => fakeGeneration([], 3),
		});
		await replacement.shutdown();
	});

	test("a rollback failure aggregates both causes and never publishes a mixed graph", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		let activations = 0;
		const owner = installCodexWorkbenchOwner(retained, {
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
			owner.reload(async ({ generation }) =>
				fakeGeneration([], generation, {
					activate: async () => {
						throw new Error("candidate activation failed");
					},
				}),
			),
		);
		expect(failure).toBeInstanceOf(CodexWorkbenchCompositionError);
		expect(retained.control).toMatchObject({ current: null, runtime: null });
		expect(retained.owner).toBeNull();
	});
});
