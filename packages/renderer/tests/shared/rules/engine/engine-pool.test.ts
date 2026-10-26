import { expect, test } from "bun:test";

import {
	createEnginePool,
	engineAborted,
	workerCeiling,
} from "#shared/rules/engine/engine-pool.ts";

/** A message a fake engine worker was sent. */
interface Sent {
	readonly id: number;
	readonly graph: string;
}

/** A worker that holds every solve until the test answers it. */
class HeldWorker extends EventTarget {
	readonly sent: Sent[] = [];
	/** The Graphviz answers the pool handed this worker, one message each. */
	readonly remembered: (readonly string[])[] = [];
	terminated = false;
	references = 0;

	/** Keep the process alive while this worker holds work. */
	ref(): void {
		this.references += 1;
	}

	/** Let the process finish when this worker has no work. */
	unref(): void {
		this.references -= 1;
	}

	/** Stop, as the pool stops a worker it replaces. */
	terminate(): void {
		this.terminated = true;
	}

	/**
	 * Hold a solve, or keep the Graphviz answers it was handed.
	 * @param message The solve or the answers.
	 */
	postMessage(message: Sent & { readonly graphviz?: readonly string[] }): void {
		if (message.graphviz === undefined) this.sent.push(message);
		else this.remembered.push(message.graphviz);
	}

	/**
	 * Answer one held solve.
	 * @param index Which held solve.
	 * @param reply What the engine answers.
	 * @param reply.data The solved graph.
	 * @param reply.error The engine's refusal.
	 * @param reply.fatal Whether the worker cannot accept another solve.
	 * @param reply.graphviz The graphs the solve laid out, each followed by its answer.
	 */
	answer(
		index: number,
		reply: { data?: string; error?: unknown; fatal?: boolean; graphviz?: string[] },
	): void {
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

/**
 * The graphs a worker was sent, in order.
 * @param worker The worker.
 * @returns The graphs.
 */
function sentTo(worker: HeldWorker): string[] {
	return worker.sent.map(({ graph }) => graph);
}

test("a cancellable solve lets its caller reject queued speculation before the next solve starts", async () => {
	const { solve, workers } = heldPool(1);
	const first = solve("first", new AbortController().signal);
	const controller = new AbortController();
	const obsolete = solve("obsolete", controller.signal);
	const refused = obsolete.catch((error: unknown) => error);
	const needed = solve("needed");
	const started = Promise.withResolvers<void>();
	const worker = workers[0]!;
	const send = worker.postMessage.bind(worker);
	/**
	 * Observe dispatch resuming without a wall clock wait.
	 * @param message The solve sent to the worker.
	 */
	worker.postMessage = (message) => {
		send(message);
		if (message.graph === "needed") started.resolve();
	};
	// Layout decoding and candidate selection both follow the worker's answer.
	const selected = first.then((answer) => answer).then(() => controller.abort());
	workers[0]!.answer(0, { data: "first!" });
	await selected;
	expect(sentTo(workers[0]!)).not.toContain("obsolete");
	expect(await refused).toBe(controller.signal.reason);
	await started.promise;
	expect(sentTo(workers[0]!)).toEqual(["first", "needed"]);
	workers[0]!.answer(1, { data: "needed!" });
	expect(await needed).toEqual("needed!");
});

test.each(["fatal", "stopped"] as const)(
	"a cancellable solve's final %s worker failure lets its caller cancel queued speculation",
	async (failure) => {
		const workers: HeldWorker[] = [];
		const started = Promise.withResolvers<void>();
		const solve = createEnginePool(() => {
			const worker = new HeldWorker();
			const send = worker.postMessage.bind(worker);
			/**
			 * Observe replacement dispatch without a wall clock wait.
			 * @param message The solve sent to the worker.
			 */
			worker.postMessage = (message) => {
				send(message);
				if (message.graph === "needed") started.resolve();
			};
			workers.push(worker);
			return worker;
		}, 1);
		const first = solve("first", new AbortController().signal);
		workers[0]!.answer(0, { error: "WASM failed to load", fatal: true });
		expect(sentTo(workers[1]!)).toEqual(["first"]);
		const controller = new AbortController();
		const obsolete = solve("obsolete", controller.signal);
		const refused = obsolete.catch((error: unknown) => error);
		const needed = solve("needed");
		const selected = first.catch((error: unknown) => {
			controller.abort();
			return error;
		});
		if (failure === "fatal") workers[1]!.answer(0, { error: "WASM failed to load", fatal: true });
		else workers[1]!.dispatchEvent(new Event("error"));
		expect(await selected).toBeInstanceOf(Error);
		expect(workers.flatMap(sentTo)).not.toContain("obsolete");
		expect(await refused).toBe(controller.signal.reason);
		await started.promise;
		expect(workers.flatMap(sentTo)).toEqual(["first", "first", "needed"]);
		workers[2]!.answer(0, { data: "needed!" });
		expect(await needed).toEqual("needed!");
	},
);

test("an uncancelled handoff resumes FIFO work, including a solve enqueued by its caller", async () => {
	const { solve, workers } = heldPool(1);
	const signal = new AbortController().signal;
	const first = solve("first", signal);
	const second = solve("second", signal);
	const third = solve("third");
	const started = Promise.withResolvers<void>();
	const worker = workers[0]!;
	const send = worker.postMessage.bind(worker);
	/**
	 * Observe when queued work resumes after the caller's selection.
	 * @param message The solve sent to the worker.
	 */
	worker.postMessage = (message) => {
		send(message);
		if (message.graph === "second") started.resolve();
	};
	let appended: ReturnType<typeof solve> | undefined;
	const selected = first.then((answer) => {
		appended = solve("appended");
		return answer;
	});
	worker.answer(0, { data: "first!" });
	await selected;
	expect(sentTo(worker)).toEqual(["first"]);
	expect(worker.references).toBe(0);
	await started.promise;
	expect(sentTo(worker)).toEqual(["first", "second"]);
	expect(worker.references).toBe(1);
	worker.answer(1, { data: "second!" });
	expect(sentTo(worker)).toEqual(["first", "second", "third"]);
	worker.answer(2, { data: "third!" });
	expect(sentTo(worker)).toEqual(["first", "second", "third", "appended"]);
	worker.answer(3, { data: "appended!" });
	expect(await Promise.all([second, third, appended])).toEqual(["second!", "third!", "appended!"]);
	expect(worker.references).toBe(0);
});

test("an obsolete queued solve never occupies a worker", async () => {
	const { solve, workers } = heldPool(1);
	const first = solve("first");
	const controller = new AbortController();
	const obsolete = solve("obsolete", controller.signal);
	const refused = obsolete.catch((error: unknown) => error);
	const needed = solve("needed");
	controller.abort();
	expect(await refused).toHaveProperty("name", "AbortError");
	workers[0]!.answer(0, { data: "first!" });
	expect(sentTo(workers[0]!)).toEqual(["first", "needed"]);
	workers[0]!.answer(1, { data: "needed!" });
	expect(await Promise.all([first, needed])).toEqual(["first!", "needed!"]);
});

test("cancellation refuses unstarted work but leaves an active engine intact", async () => {
	const { solve, workers } = heldPool(1);
	const stopped = AbortSignal.abort();
	expect(await solve("unstarted", stopped).catch((error: unknown) => error)).toHaveProperty(
		"name",
		"AbortError",
	);
	expect(workers).toHaveLength(0);
	const controller = new AbortController();
	const active = solve("active", controller.signal);
	controller.abort();
	workers[0]!.answer(0, { data: "active!" });
	expect(await active).toEqual("active!");
	expect(workers[0]!.terminated).toBe(false);
});

test.each(["worker error", "engine abort"] as const)(
	"an obsolete active solve is not retried after a %s",
	async (failure) => {
		const { solve, workers } = heldPool(1);
		const controller = new AbortController();
		const obsolete = solve("obsolete", controller.signal);
		const refused = obsolete.catch((error: unknown) => error);
		const needed = solve("needed");
		controller.abort();
		if (failure === "worker error") workers[0]!.dispatchEvent(new Event("error"));
		else workers[0]!.answer(0, { error: "RuntimeError: unreachable", fatal: true });

		expect(await refused).toBe(controller.signal.reason);
		expect(workers[0]!.terminated).toBe(true);
		expect(workers).toHaveLength(2);
		expect(sentTo(workers[1]!)).toEqual(["needed"]);
		workers[1]!.answer(0, { data: "needed!" });
		expect(await needed).toEqual("needed!");
		expect(sentTo(workers[1]!)).toEqual(["needed"]);
	},
);

test("a retried solve can be cancelled while it waits behind needed work", async () => {
	const { solve, workers } = heldPool(1);
	const controller = new AbortController();
	const obsolete = solve("obsolete", controller.signal);
	const refused = obsolete.catch((error: unknown) => error);
	const first = solve("first");
	workers[0]!.dispatchEvent(new Event("error"));
	// The retry is queued again, behind work that was already waiting.
	expect(sentTo(workers[1]!)).toEqual(["first"]);
	const next = solve("next");
	controller.abort();
	expect(await refused).toBe(controller.signal.reason);
	expect(workers[1]!.terminated).toBe(false);
	workers[1]!.answer(0, { data: "first!" });
	expect(sentTo(workers[1]!)).toEqual(["first", "next"]);
	workers[1]!.answer(1, { data: "next!" });
	expect(await Promise.all([first, next])).toEqual(["first!", "next!"]);
});

test("a retry that has started answers normally after cancellation", async () => {
	const { solve, workers } = heldPool(1);
	const controller = new AbortController();
	const active = solve("active", controller.signal);
	workers[0]!.dispatchEvent(new Event("error"));
	expect(sentTo(workers[1]!)).toEqual(["active"]);
	controller.abort();
	workers[1]!.answer(0, { data: "active!" });
	expect(await active).toEqual("active!");
	expect(workers[1]!.terminated).toBe(false);
});

test("a solve waits for the first worker free, and the pool grows one worker at a time up to its ceiling", async () => {
	const { solve, workers } = heldPool(2);
	const first = solve("a");
	const second = solve("b");
	// The first worker has not answered, so it is still starting: the second
	// solve waits rather than compiling the engine again beside it.
	expect(workers).toHaveLength(1);
	expect(sentTo(workers[0]!)).toEqual(["a"]);
	workers[0]!.answer(0, { data: "a!" });
	expect(await first).toEqual("a!");
	expect(sentTo(workers[0]!)).toEqual(["a", "b"]);

	// It has started and is busy, so the next solve starts a second worker; the
	// ceiling keeps the ones after that waiting in the pool.
	const third = solve("c");
	const fourth = solve("d");
	const fifth = solve("e");
	expect(workers).toHaveLength(2);
	expect(sentTo(workers[1]!)).toEqual(["c"]);

	// A waiting solve goes to whichever worker frees up first, never behind a
	// worker still busy with a long solve.
	workers[1]!.answer(0, { data: "c!" });
	expect(sentTo(workers[1]!)).toEqual(["c", "d"]);
	expect(sentTo(workers[0]!)).toEqual(["a", "b"]);
	workers[1]!.answer(1, { data: "d!" });
	expect(sentTo(workers[1]!)).toEqual(["c", "d", "e"]);
	workers[1]!.answer(2, { data: "e!" });
	workers[0]!.answer(1, { data: "b!" });
	expect(await Promise.all([second, third, fourth, fifth])).toEqual(["b!", "c!", "d!", "e!"]);
	expect(workers).toHaveLength(2);
});

test("a solve called off while it waits is never sent, and one a worker holds still answers", async () => {
	const { solve, workers } = heldPool(1);
	const calling = new AbortController();
	const held = solve("a", calling.signal);
	const waiting = solve("b", calling.signal);
	const next = solve("c");
	const reason = new Error("not needed");
	calling.abort(reason);
	const refusal = await waiting.then(
		() => undefined,
		(error: unknown) => error,
	);
	expect(refusal).toBe(reason);
	workers[0]!.answer(0, { data: "a!" });
	expect(await held).toEqual("a!");
	expect(sentTo(workers[0]!)).toEqual(["a", "c"]);
	workers[0]!.answer(1, { data: "c!" });
	expect(await next).toEqual("c!");
});

test("an engine refusal rejects the solve with an error that keeps the engine's words", async () => {
	const { solve, workers } = heldPool(1);
	const solving = solve("a");
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
	const first = solve("a");
	workers[0]!.dispatchEvent(new Event("error"));
	expect(workers).toHaveLength(2);
	expect(workers[0]!.terminated).toBe(true);
	workers[1]!.answer(0, { data: "a!" });
	expect(await first).toEqual("a!");
});

test("an engine that aborted is replaced, and the solve it held is sent once more", async () => {
	const { solve, workers } = heldPool(1);
	const first = solve("a");
	const second = solve("b");
	workers[0]!.answer(0, { error: "RuntimeError: unreachable", fatal: true });
	expect(workers[0]!.terminated).toBe(true);
	expect(sentTo(workers[1]!)).toEqual(["b"]);
	workers[1]!.answer(0, { data: "b!" });
	expect(sentTo(workers[1]!)).toEqual(["b", "a"]);
	workers[1]!.answer(1, { data: "a!" });
	expect(await Promise.all([first, second])).toEqual(["a!", "b!"]);
});

test("a solve whose second worker fails too is refused with the engine's words", async () => {
	const { solve, workers } = heldPool(1);
	const solving = solve("a");
	workers[0]!.answer(0, { error: "WASM failed to load", fatal: true });
	workers[1]!.answer(0, { error: "WASM failed to load", fatal: true });
	const failure = await solving.then(
		() => undefined,
		(error: unknown) => error,
	);
	expect(String(failure)).toContain("WASM failed to load");
	const next = solve("b");
	workers[2]!.answer(0, { data: "b!" });
	expect(await next).toEqual("b!");
});

test("a worker constructor failure rejects its solve and leaves no work for the next worker", async () => {
	const failure = new Error("Worker could not start");
	const worker = new HeldWorker();
	let unavailable = true;
	const solve = createEnginePool(() => {
		if (unavailable) throw failure;
		return worker;
	}, 1);
	expect(await solve("failed").catch((error: unknown) => error)).toBe(failure);
	unavailable = false;
	const next = solve("next");
	expect(sentTo(worker)).toEqual(["next"]);
	worker.answer(0, { data: "next!" });
	expect(await next).toBe("next!");
});

test("a failed replacement constructor rejects all waiting solves and releases their cancellation listeners", async () => {
	const failure = new Error("Replacement could not start");
	const worker = new HeldWorker();
	const replacement = new HeldWorker();
	let starting = 0;
	const solve = createEnginePool(() => {
		starting += 1;
		if (starting === 2) throw failure;
		return starting === 1 ? worker : replacement;
	}, 1);
	const controller = new AbortController();
	let removals = 0;
	const remove = controller.signal.removeEventListener.bind(controller.signal);
	controller.signal.removeEventListener = (
		...args: Parameters<AbortSignal["removeEventListener"]>
	) => {
		if (args[0] === "abort") removals += 1;
		remove(...args);
	};
	const first = solve("first");
	const queued = solve("queued", controller.signal);
	const refused = Promise.all(
		[first, queued].map((answer) => answer.catch((error: unknown) => error)),
	);
	worker.dispatchEvent(new Event("error"));
	expect(await refused).toEqual([failure, failure]);
	expect(removals).toBe(1);
	expect(worker.terminated).toBe(true);
	const next = solve("next");
	expect(sentTo(replacement)).toEqual(["next"]);
	replacement.answer(0, { data: "next!" });
	expect(await next).toBe("next!");
});

test("a graph one worker laid out is handed once to every other worker, and to each worker started later", async () => {
	const { solve, workers } = heldPool(2);
	const first = solve("first");
	workers[0]!.answer(0, { data: "first!", graphviz: ["g1", "laid g1"] });
	await first;
	const second = solve("second");
	const third = solve("third");
	expect(workers[1]!.remembered).toEqual([["g1", "laid g1"]]);
	workers[1]!.answer(0, { data: "third!", graphviz: ["g2", "laid g2", "g1", "laid g1"] });
	await third;
	expect(workers[0]!.remembered).toEqual([["g2", "laid g2"]]);
	workers[0]!.answer(1, { data: "second!" });
	expect(await second).toBe("second!");
});

test("a solve asked for again is answered from what the pool remembers, and reaches no worker", async () => {
	const { solve, workers } = heldPool(1);
	const first = solve("graph");
	workers[0]!.answer(0, { data: "laid out" });
	await first;
	expect(await solve("graph")).toBe("laid out");
	expect(sentTo(workers[0]!)).toEqual(["graph"]);
});

test("an engine abort, never a layout refusal, marks a worker for replacement", () => {
	expect(engineAborted(new WebAssembly.RuntimeError("unreachable"))).toBe(true);
	expect(engineAborted(new Error("Layout relationship e1: Route leg 2 has 4 units"))).toBe(false);
});

test("the ceiling follows the cores the browser reports, and never falls below one", () => {
	expect(workerCeiling(8)).toBe(7);
	expect(workerCeiling(1)).toBe(1);
	expect(workerCeiling(undefined)).toBe(1);
});
