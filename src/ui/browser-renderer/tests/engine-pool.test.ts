import { expect, test } from "bun:test";

import { createEnginePool, workerCeiling } from "@/ui/browser-renderer";

/** A message a fake engine worker was sent. */
interface Sent {
	readonly id: number;
	readonly graph: { readonly id: string };
}

/** A worker that holds every solve until the test answers it. */
class HeldWorker extends EventTarget {
	readonly sent: Sent[] = [];

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
	 */
	answer(index: number, reply: { data?: unknown; error?: unknown }): void {
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

test("a busy pool starts another worker up to its ceiling, and reuses one that has answered", async () => {
	const { solve, workers } = heldPool(2);
	const first = solve({ id: "a" }, {});
	const second = solve({ id: "b" }, {});
	const third = solve({ id: "c" }, {});
	expect(workers).toHaveLength(2);
	expect(workers.map((worker) => worker.sent.length).toSorted((a, b) => a - b)).toEqual([1, 2]);

	for (const worker of workers) {
		for (const [index, message] of worker.sent.entries()) {
			worker.answer(index, { data: { id: `${message.graph.id}!` } });
		}
	}
	expect(await Promise.all([first, second, third])).toEqual([
		{ id: "a!" },
		{ id: "b!" },
		{ id: "c!" },
	]);

	// Every worker has answered, so the next solve starts nothing new.
	void solve({ id: "d" }, {});
	expect(workers).toHaveLength(2);
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

test("the ceiling follows the cores the browser reports, and never falls below one", () => {
	expect(workerCeiling(8)).toBe(7);
	expect(workerCeiling(1)).toBe(1);
	expect(workerCeiling(undefined)).toBe(1);
});
