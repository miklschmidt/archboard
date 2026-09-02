import { describe, expect, test } from "bun:test";

import {
	CodexWorkbenchCompositionError,
	emptyCodexWorkbenchRetainedState,
} from "../codex-workbench-owner.js";
import {
	fakeGeneration,
	fakeProcess,
	installFakeCodexWorkbenchOwner,
} from "./support/codex-workbench-owner-fake.js";

function messages(value: unknown): string[] {
	if (!(value instanceof Error)) return [];
	return [
		value.message,
		...(value instanceof AggregateError ? value.errors.flatMap(messages) : []),
		...messages(value.cause),
	];
}

describe("production Codex owner terminal cleanup", () => {
	for (const stage of ["graph", "process", "final"] as const) {
		test(`${stage} failure revokes retained authority and permits reinstall`, async () => {
			const events: string[] = [];
			const retained = emptyCodexWorkbenchRetainedState();
			const baseProcess = fakeProcess(events);
			const owner = installFakeCodexWorkbenchOwner(retained, {
				createProcess: () =>
					stage === "process"
						? {
								...baseProcess,
								stop: async () => {
									await baseProcess.stop();
									throw new Error("process cleanup failed");
								},
							}
						: baseProcess,
				createGeneration: async ({ generation }) =>
					fakeGeneration(events, generation, {
						stop:
							stage === "graph"
								? async () => {
										throw new Error("graph cleanup failed");
									}
								: undefined,
						finishStop:
							stage === "final"
								? () => {
										throw new Error("final cleanup failed");
									}
								: undefined,
					}),
			});
			await owner.start();
			const failure = await owner.shutdown().then(
				() => null,
				(error: unknown) => error,
			);
			expect(failure).toBeInstanceOf(CodexWorkbenchCompositionError);
			expect(messages(failure)).toContain(`${stage} cleanup failed`);
			expect(events).toContain("process:stop");
			expect(retained).toMatchObject({ owner: null, process: null, state: "failed" });
			expect(retained.control).toMatchObject({ current: null, runtime: null });
			const replacement = installFakeCodexWorkbenchOwner(retained, {
				createProcess: () => fakeProcess([]),
				createGeneration: async () => fakeGeneration([], 3),
			});
			await replacement.shutdown();
		});
	}

	test("aggregates simultaneous graph, process, and final failures", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const process = fakeProcess([]);
		const owner = installFakeCodexWorkbenchOwner(retained, {
			createProcess: () => ({
				...process,
				stop: async () => {
					await process.stop();
					throw new Error("process cleanup failed");
				},
			}),
			createGeneration: async ({ generation }) =>
				fakeGeneration([], generation, {
					stop: async () => {
						throw new Error("graph cleanup failed");
					},
					finishStop: () => {
						throw new Error("final cleanup failed");
					},
				}),
		});
		await owner.start();
		const failure = await owner.shutdown().then(
			() => null,
			(error: unknown) => error,
		);
		for (const message of [
			"graph cleanup failed",
			"process cleanup failed",
			"final cleanup failed",
		])
			expect(messages(failure)).toContain(message);
		expect(retained.control).toMatchObject({ current: null, runtime: null });
	});

	test("a failed process stop can perform one fresh terminal retry", async () => {
		const retained = emptyCodexWorkbenchRetainedState();
		const process = fakeProcess([]);
		let stops = 0;
		const owner = installFakeCodexWorkbenchOwner(retained, {
			createProcess: () => ({
				...process,
				stop: async () => {
					stops++;
					if (stops === 1) throw new Error("process was not terminal");
					return process.stop();
				},
			}),
			createGeneration: async ({ generation }) => fakeGeneration([], generation),
		});
		await owner.start();

		await expect(owner.shutdown()).rejects.toThrow("did not shut down cleanly");
		await owner.shutdown();
		expect(stops).toBe(2);
	});
});
