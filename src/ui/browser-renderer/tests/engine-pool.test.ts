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

test("a worker failure rejects its work and the next solve starts a replacement", async () => {
	const { solve, workers } = heldPool(1);
	const first = solve({ id: "a" }, {});
	workers[0]!.dispatchEvent(new Event("error"));
	expect(
		await first.then(
			() => "solved",
			() => "failed",
		),
	).toBe("failed");
	const second = solve({ id: "b" }, {});
	expect(workers).toHaveLength(2);
	workers[1]!.answer(0, { data: { id: "b!" } });
	expect(await second).toEqual({ id: "b!" });
});

test("failed engine initialization rejects queued work and replaces the worker", async () => {
	const { solve, workers } = heldPool(1);
	const first = solve({ id: "a" }, {});
	const second = solve({ id: "b" }, {});
	workers[0]!.answer(0, { error: "WASM failed to load", fatal: true });
	expect(
		await first.then(
			() => "solved",
			() => "failed",
		),
	).toBe("failed");
	expect(
		await second.then(
			() => "solved",
			() => "failed",
		),
	).toBe("failed");
	const third = solve({ id: "c" }, {});
	workers[1]!.answer(0, { data: { id: "c!" } });
	expect(await third).toEqual({ id: "c!" });
});

test("the ceiling follows the cores the browser reports, and never falls below one", () => {
	expect(workerCeiling(8)).toBe(7);
	expect(workerCeiling(1)).toBe(1);
	expect(workerCeiling(undefined)).toBe(1);
});
