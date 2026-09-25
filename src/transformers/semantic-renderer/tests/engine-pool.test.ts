import { expect, test } from "bun:test";

import {
	createEnginePool,
	engineAborted,
	workerCeiling,
} from "@/transformers/semantic-renderer/engine-pool";

/** A message a fake engine worker was sent. */
interface Sent {
	readonly id: number;
	readonly graph: { readonly id: string };
}

/** A worker that holds every solve until the test answers it. */
class HeldWorker extends EventTarget {
	readonly sent: Sent[] = [];
	terminated = false;

	/** Stop, as the pool stops a worker it replaces. */
	terminate(): void {
		this.terminated = true;
	}

	/**
	 * Hold a solve.
	 * @param message The solve.
	 */
	postMessage(message: Sent): void {
		this.sent.push(message);
	}

	/**
	 * Answer one held solve.
	 * @param index Which held solve.
	 * @param reply What the engine answers.
	 * @param reply.data The solved graph.
	 * @param reply.error The engine's refusal.
	 * @param reply.fatal Whether the worker cannot accept another solve.
	 */
	answer(index: number, reply: { data?: unknown; error?: unknown; fatal?: boolean }): void {
		const message = this.sent[index]!;
		this.dispatchEvent(new MessageEvent("message", { data: { id: message.id, ...reply } }));
	}
}

/**
 * A pool over held workers, and the workers it started.
 * @param ceiling The most workers the pool may start.
 * @returns The solve and the started workers.
 */
function heldPool(ceiling: number) {
	const workers: HeldWorker[] = [];
	const solve = createEnginePool(() => {
		const worker = new HeldWorker();
		workers.push(worker);
		return worker;
	}, ceiling);
	return { solve, workers };
}

test("a pool grows one worker at a time, past workers that have started, up to its ceiling", async () => {
	const { solve, workers } = heldPool(2);
	const first = solve({ id: "a" }, {});
	const second = solve({ id: "b" }, {});
	// The first worker has not answered, so it is still starting: the second
	// solve waits behind it rather than compiling the engine again beside it.
	expect(workers).toHaveLength(1);
	workers[0]!.answer(0, { data: { id: "a!" } });
	expect(await first).toEqual({ id: "a!" });

	// It has started and is busy, so the next solve starts a second worker; the
	// ceiling keeps the one after that waiting on the least busy.
	const third = solve({ id: "c" }, {});
	workers[1]!.answer(0, { data: { id: "c!" } });
	expect(await third).toEqual({ id: "c!" });
	const fourth = solve({ id: "d" }, {});
	const fifth = solve({ id: "e" }, {});
	expect(workers).toHaveLength(2);

	workers[0]!.answer(1, { data: { id: "b!" } });
	for (const [index, message] of workers[1]!.sent.entries()) {
		if (index > 0) workers[1]!.answer(index, { data: { id: `${message.graph.id}!` } });
	}
	for (const [index, message] of workers[0]!.sent.entries()) {
		if (index > 1) workers[0]!.answer(index, { data: { id: `${message.graph.id}!` } });
	}
	expect(await Promise.all([second, fourth, fifth])).toEqual([
		{ id: "b!" },
		{ id: "d!" },
		{ id: "e!" },
	]);
});

test("an engine refusal rejects the solve with an error that keeps the engine's words", async () => {
	const { solve, workers } = heldPool(1);
	const solving = solve({ id: "a" }, {});
	workers[0]!.answer(0, { error: { message: "nodeOrder[l][0].layer" } });
	const failure = await solving.then(
		() => undefined,
		(error: unknown) => error,
	);
	expect(failure).toBeInstanceOf(Error);
	expect(String(failure)).toContain("nodeOrder[l][0].layer");
});

test("a worker that stops is replaced, and the solve it held is answered by the replacement", async () => {
	const { solve, workers } = heldPool(1);
	const first = solve({ id: "a" }, {});
	workers[0]!.dispatchEvent(new Event("error"));
	expect(workers).toHaveLength(2);
	expect(workers[0]!.terminated).toBe(true);
	workers[1]!.answer(0, { data: { id: "a!" } });
	expect(await first).toEqual({ id: "a!" });
});

test("an engine that aborted is replaced, and every solve it held is sent once more", async () => {
	const { solve, workers } = heldPool(1);
	const first = solve({ id: "a" }, {});
	const second = solve({ id: "b" }, {});
	workers[0]!.answer(0, { error: "program has already aborted!", fatal: true });
	expect(workers[0]!.terminated).toBe(true);
	expect(workers[1]!.sent.map(({ graph }) => graph.id)).toEqual(["b", "a"]);
	workers[1]!.answer(0, { data: { id: "b!" } });
	workers[1]!.answer(1, { data: { id: "a!" } });
	expect(await Promise.all([first, second])).toEqual([{ id: "a!" }, { id: "b!" }]);
});

test("a solve whose second worker fails too is refused with the engine's words", async () => {
	const { solve, workers } = heldPool(1);
	const solving = solve({ id: "a" }, {});
	workers[0]!.answer(0, { error: "WASM failed to load", fatal: true });
	workers[1]!.answer(0, { error: "WASM failed to load", fatal: true });
	const failure = await solving.then(
		() => undefined,
		(error: unknown) => error,
	);
	expect(String(failure)).toContain("WASM failed to load");
	const next = solve({ id: "b" }, {});
	workers[2]!.answer(0, { data: { id: "b!" } });
	expect(await next).toEqual({ id: "b!" });
});

test("an engine abort, never a layout refusal, marks a worker for replacement", () => {
	expect(engineAborted(new WebAssembly.RuntimeError("unreachable"))).toBe(true);
	expect(engineAborted(new Error("program has already aborted!"))).toBe(true);
	expect(engineAborted(new Error("Aborted(OOM)"))).toBe(true);
	expect(engineAborted(new Error("Layout relationship e1: Route leg 2 has 4 units"))).toBe(false);
});

test("the ceiling follows the cores the browser reports, and never falls below one", () => {
	expect(workerCeiling(8)).toBe(7);
	expect(workerCeiling(1)).toBe(1);
	expect(workerCeiling(undefined)).toBe(1);
});
