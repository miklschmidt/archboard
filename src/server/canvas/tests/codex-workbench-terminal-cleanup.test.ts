import { describe, expect, test } from "bun:test";

import {
	CodexWorkbenchCompositionError,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
} from "../codex-workbench-owner.js";
import { fakeGeneration, fakeProcess } from "./support/codex-workbench-owner-fake.js";

function errorMessages(value: unknown): string[] {
	if (!(value instanceof Error)) return [];
	return [
		value.message,
		...(value instanceof AggregateError ? value.errors.flatMap(errorMessages) : []),
		...errorMessages(value.cause),
	];
}

describe("production Codex owner terminal cleanup", () => {
	for (const stage of ["graph", "process", "realtime", "queue", "listener", "final"] as const) {
		test(`terminal ${stage} failure revokes retained authority and permits reinstall`, async () => {
			const events: string[] = [];
			const retained = emptyCodexWorkbenchRetainedState();
			const owner = installCodexWorkbenchOwner(retained, {
				createProcess: () => {
					const process = fakeProcess(events);
					return stage === "process"
						? {
								...process,
								stop: async () => {
									await process.stop();
									throw new Error("process cleanup failed");
								},
							}
						: process;
				},
				createGeneration: async () => {
					const generation = fakeGeneration(events, 1);
					generation.state.transportUnsubscribers.push(() => void events.push("listener:after"));
					if (stage === "graph")
						(
							generation.state.ownerHooks as unknown as {
								stopBrowser: () => Promise<void>;
							}
						).stopBrowser = async () => {
							events.push("graph:failed");
							throw new Error("graph cleanup failed");
						};
					if (stage === "realtime")
						(
							generation.state.ownerHooks as unknown as {
								stopRealtime: () => Promise<void>;
							}
						).stopRealtime = async () => {
							events.push("realtime:failed");
							throw new Error("realtime cleanup failed");
						};
					if (stage === "queue")
						(
							generation.state.ownerHooks as unknown as {
								stopQueue: () => void;
							}
						).stopQueue = () => {
							events.push("queue:failed");
							throw new Error("queue cleanup failed");
						};
					if (stage === "listener")
						generation.state.transportUnsubscribers.push(() => {
							events.push("listener:failed");
							throw new Error("listener cleanup failed");
						});
					if (stage === "final") {
						(generation.state.components.approvals as unknown as { dispose: () => void }).dispose =
							() => {
								events.push("final:failed");
								throw new Error("final cleanup failed");
							};
						(generation.state.components.epoch as unknown as { close: () => void }).close = () =>
							void events.push("final:after");
					}
					return generation;
				},
			});
			await owner.start();
			const failure = await owner.shutdown().then(
				() => null,
				(error: unknown) => error,
			);
			expect(failure).toBeInstanceOf(CodexWorkbenchCompositionError);
			expect(retained).toMatchObject({ owner: null, process: null, state: "failed" });
			expect(retained.failure).toContain(`${stage} cleanup failed`);
			expect(retained.control.current).toBeNull();
			expect(retained.control.runtime).toBeNull();
			expect(events).toContain("process:stop");
			expect(events).toContain("listener:after");
			if (stage === "graph") expect(events).toContain("graph:failed");
			if (stage === "realtime") expect(events).toContain("realtime:failed");
			if (stage === "queue") expect(events).toContain("queue:failed");
			if (stage === "listener") expect(events).toContain("listener:failed");
			if (stage === "final") expect(events.slice(-2)).toEqual(["final:failed", "final:after"]);
			expect((await owner.shutdown()).state).toBe("failed");
			const replacement = installCodexWorkbenchOwner(retained, {
				createProcess: () => fakeProcess([]),
				createGeneration: async () => fakeGeneration([], 2),
			});
			await replacement.shutdown();
		});
	}

	test("aggregates simultaneous failures and still runs the last cleanup", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const process = fakeProcess(events);
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => ({
				...process,
				stop: async () => {
					await process.stop();
					throw new Error("process cleanup failed");
				},
			}),
			createGeneration: async () => {
				const generation = fakeGeneration(events, 1);
				const hooks = generation.state.ownerHooks as unknown as {
					stopBrowser: () => Promise<void>;
					stopRealtime: () => Promise<void>;
					stopQueue: () => void;
				};
				hooks.stopBrowser = async () => {
					throw new Error("graph cleanup failed");
				};
				hooks.stopRealtime = async () => {
					throw new Error("realtime cleanup failed");
				};
				hooks.stopQueue = () => {
					throw new Error("queue cleanup failed");
				};
				generation.state.transportUnsubscribers.push(
					() => void events.push("listener:after"),
					() => {
						throw new Error("listener cleanup failed");
					},
				);
				(generation.state.components.approvals as unknown as { dispose: () => void }).dispose =
					() => {
						throw new Error("final cleanup failed");
					};
				(generation.state.components.epoch as unknown as { close: () => void }).close = () =>
					void events.push("final:after");
				return generation;
			},
		});
		await owner.start();
		const failure = await owner.shutdown().then(
			() => null,
			(error: unknown) => error,
		);
		const messages = errorMessages(failure);
		for (const stage of ["graph", "realtime", "queue", "process", "listener", "final"])
			expect(messages).toContain(`${stage} cleanup failed`);
		expect(events).toContain("listener:after");
		expect(events).toContain("final:after");
		expect(retained.control).toMatchObject({ current: null, runtime: null });
		expect(retained.owner).toBeNull();
	});
});
