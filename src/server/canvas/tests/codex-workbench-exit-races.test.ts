import { describe, expect, test } from "bun:test";

import type { CodexTransport } from "../../../runtime/codex-transport/index.js";
import {
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchGenerationInput,
	type CodexWorkbenchKernelAcquisition,
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
	readonly listenerCount: () => number;
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
		listenerCount: () => listeners.size,
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

function acquireKernel(candidate: CodexWorkbenchGeneration): CodexWorkbenchKernelAcquisition {
	return {
		kernel: { identityLedger: candidate.identityLedger, transport: candidate.transport },
		identity: candidate.components.identity,
	};
}

describe("process-lifetime Codex child exit observation", () => {
	test("a terminal transport replay before bridge subscription prevents generation construction", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const original = fakeGeneration(events, 1);
		const identity = original.components.identity.identity.validator;
		let listeners = 0;
		Object.assign(original.transport, {
			onExit: (listener: Parameters<CodexTransport["onExit"]>[0]) => {
				listeners++;
				listener({
					child: identity.childId,
					epoch: identity.epoch,
					code: 17,
					signal: "SIGTERM",
				});
				return () => undefined;
			},
			inspect: () => ({ state: "closed" }) as ReturnType<CodexTransport["inspect"]>,
		});
		let factoryCalls = 0;
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createKernel: () => acquireKernel(original),
			createGeneration: async () => {
				factoryCalls++;
				return original;
			},
		});

		expect(await rejected(owner.start())).toBeInstanceOf(Error);
		await settleRetirement(retained);
		expect(factoryCalls).toBe(0);
		expect(listeners).toBe(1);
		expect(retained).toMatchObject({ owner: null, state: "idle" });
		expect(retained.control.current).toBeNull();
		expect(events.filter((event) => event === "process:stop")).toHaveLength(1);

		const recovery = fakeGeneration(events, 2);
		stableTransport(recovery);
		const recoveredOwner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createKernel: () => acquireKernel(recovery),
			createGeneration: async () => recovery,
		});
		await recoveredOwner.start();
		expect(recoveredOwner.snapshot()).toMatchObject({ state: "ready", ready: true });
		await recoveredOwner.shutdown();
	});

	test("an exit while the initial generation factory waits cleans its returned graph once", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const original = fakeGeneration(events, 1);
		const transport = stableTransport(original);
		let factoryEntered!: () => void;
		const entered = new Promise<void>((resolve) => void (factoryEntered = resolve));
		let releaseFactory!: () => void;
		const gate = new Promise<void>((resolve) => void (releaseFactory = resolve));
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createKernel: () => acquireKernel(original),
			createGeneration: async () => {
				factoryEntered();
				await gate;
				return original;
			},
		});
		const start = owner.start();
		await entered;
		expect(transport.listenerCount()).toBe(1);
		transport.emitExit();
		releaseFactory();

		expect(await rejected(start)).toBeInstanceOf(Error);
		await settleRetirement(retained);
		expect(retained).toMatchObject({ owner: null, state: "idle" });
		expect(retained.control.current).toBeNull();
		expect(events.filter((event) => event === "generation:1:finish-stop")).toHaveLength(1);
		expect(events.filter((event) => event === "process:stop")).toHaveLength(1);
	});

	test("an exit after initial factory return but before activation publication cleans once", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		let activationEntered!: () => void;
		const entered = new Promise<void>((resolve) => void (activationEntered = resolve));
		let releaseActivation!: () => void;
		const gate = new Promise<void>((resolve) => void (releaseActivation = resolve));
		const original = fakeGeneration(events, 1, {
			activate: async () => {
				activationEntered();
				await gate;
			},
		});
		const transport = stableTransport(original);
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createKernel: () => acquireKernel(original),
			createGeneration: async () => original,
		});
		const start = owner.start();
		await entered;
		transport.emitExit();
		releaseActivation();

		expect(await rejected(start)).toBeInstanceOf(Error);
		await settleRetirement(retained);
		expect(retained).toMatchObject({ owner: null, state: "idle" });
		expect(retained.control.current).toBeNull();
		expect(events.filter((event) => event === "generation:1:finish-stop")).toHaveLength(1);
		expect(events.filter((event) => event === "process:stop")).toHaveLength(1);
	});

	test("the stable bridge reaches only the replacement source handler after reload", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const original = fakeGeneration(events, 1);
		const transport = stableTransport(original);
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createKernel: () => acquireKernel(original),
			createGeneration: async () => original,
		});
		await owner.start();
		const retiredHandler = retained.control.runtime?.exitBridge.handler;
		if (retiredHandler === null || retiredHandler === undefined)
			throw new Error("missing initial exit handler");
		await owner.reload(async ({ generation, kernel }) => {
			if (kernel === null) throw new Error("missing stable kernel");
			return adoptKernel(fakeGeneration(events, generation), kernel);
		});
		const replacementHandler = retained.control.runtime?.exitBridge.handler;
		expect(replacementHandler).not.toBe(retiredHandler);
		retiredHandler.handle = () => {
			throw new Error("retired exit handler executed");
		};

		expect(() => transport.emitExit()).not.toThrow();
		await settleRetirement(retained);
		expect(retained).toMatchObject({ owner: null, state: "idle" });
		expect(events.filter((event) => event === "process:stop")).toHaveLength(1);
	});

	test("an exit while the replacement factory waits terminalizes the transaction", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const original = fakeGeneration(events, 1);
		const { emitExit } = stableTransport(original);
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createKernel: () => acquireKernel(original),
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
			createKernel: () => acquireKernel(original),
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
			createKernel: () => acquireKernel(original),
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
