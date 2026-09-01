import { describe, expect, test } from "bun:test";

import type { CodexTransport } from "../../../runtime/codex-transport/index.js";
import {
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchGenerationInput,
} from "../codex-workbench-owner.js";
import { fakeGeneration, fakeProcess } from "./support/codex-workbench-owner-fake.js";

function rejected(operation: Promise<unknown>): Promise<unknown> {
	return operation.then(
		() => null,
		(error: unknown) => error,
	);
}

async function settleRetirement(retained: ReturnType<typeof emptyCodexWorkbenchRetainedState>) {
	for (let turn = 0; turn < 20 && retained.owner !== null; turn++) await Promise.resolve();
}

function stableTransport(generation: CodexWorkbenchGeneration): {
	readonly transport: CodexTransport;
	readonly emitExit: () => void;
} {
	const listeners = new Set<Parameters<CodexTransport["onExit"]>[0]>();
	let state: "open" | "closed" = "open";
	const transport = generation.transport;
	Object.assign(transport, {
		onExit: (listener: Parameters<CodexTransport["onExit"]>[0]) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		inspect: () => ({ state }) as ReturnType<CodexTransport["inspect"]>,
		shutdown: async () => void (state = "closed"),
	});
	Object.assign(generation.components, { transport });
	return {
		transport,
		emitExit: () => {
			state = "closed";
			const identity = generation.components.identity.identity.validator;
			for (const listener of listeners)
				listener({
					child: identity.childId,
					epoch: identity.epoch,
					code: 1,
					signal: null,
				});
		},
	};
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

describe("process-lifetime Codex child exit observation", () => {
	test("an exit while the replacement factory waits terminalizes the transaction", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const original = fakeGeneration(events, 1);
		const { emitExit } = stableTransport(original);
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createGeneration: async () => original,
		});
		await owner.start();
		let factoryEntered!: () => void;
		const entered = new Promise<void>((resolve) => void (factoryEntered = resolve));
		let releaseFactory!: () => void;
		const gate = new Promise<void>((resolve) => void (releaseFactory = resolve));
		const reload = owner.reload(async ({ generation, kernel }) => {
			factoryEntered();
			await gate;
			if (kernel === null) throw new Error("missing stable kernel");
			return adoptKernel(fakeGeneration(events, generation), kernel);
		});
		await entered;
		emitExit();
		const stateAtExit = retained.state;
		releaseFactory();
		expect(await rejected(reload)).toBeInstanceOf(Error);
		await settleRetirement(retained);
		expect(stateAtExit).toBe("stopping");
		expect(retained).toMatchObject({ owner: null, state: "idle" });
		expect(events.filter((event) => event === "process:stop")).toHaveLength(1);
	});

	test("an exit while candidate activation waits cleans old and candidate exactly once", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const original = fakeGeneration(events, 1);
		const { emitExit } = stableTransport(original);
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createGeneration: async () => original,
		});
		await owner.start();
		let activationEntered!: () => void;
		const entered = new Promise<void>((resolve) => void (activationEntered = resolve));
		let releaseActivation!: () => void;
		const gate = new Promise<void>((resolve) => void (releaseActivation = resolve));
		const reload = owner.reload(async ({ generation, kernel }) => {
			if (kernel === null) throw new Error("missing stable kernel");
			return adoptKernel(
				fakeGeneration(events, generation, {
					activate: async () => {
						activationEntered();
						await gate;
					},
				}),
				kernel,
			);
		});
		await entered;
		emitExit();
		const stateAtExit = retained.state;
		releaseActivation();
		expect(await rejected(reload)).toBeInstanceOf(Error);
		await settleRetirement(retained);
		expect(stateAtExit).toBe("stopping");
		expect(retained).toMatchObject({ owner: null, state: "idle" });
		expect(events.filter((event) => event === "generation:1:finish-stop")).toHaveLength(1);
		expect(events.filter((event) => event === "generation:2:finish-stop")).toHaveLength(1);
	});

	test("an exit while old cleanup waits blocks replacement publication", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		let cleanupEntered!: () => void;
		const entered = new Promise<void>((resolve) => void (cleanupEntered = resolve));
		let releaseCleanup!: () => void;
		const gate = new Promise<void>((resolve) => void (releaseCleanup = resolve));
		const original = fakeGeneration(events, 1, {
			stop: async (reason) => {
				if (reason !== "reload") return;
				cleanupEntered();
				await gate;
			},
		});
		const { emitExit } = stableTransport(original);
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createGeneration: async () => original,
		});
		await owner.start();
		const reload = owner.reload(async ({ generation, kernel }) => {
			if (kernel === null) throw new Error("missing stable kernel");
			return adoptKernel(fakeGeneration(events, generation), kernel);
		});
		await entered;
		emitExit();
		const stateAtExit = retained.state;
		releaseCleanup();
		expect(await rejected(reload)).toBeInstanceOf(Error);
		await settleRetirement(retained);
		expect(stateAtExit).toBe("stopping");
		expect(retained).toMatchObject({ owner: null, state: "idle" });
		expect(() => owner.gateway()).toThrow();
	});
});
