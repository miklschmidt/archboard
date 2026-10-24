import { expect, test } from "bun:test";

import {
	createEnginePool,
	engineAborted,
	workerCeiling,
} from "#shared/rules/engine/engine-pool.ts";

/** A message a fake engine worker was sent. */
interface Sent {
	readonly id: number;
	readonly graph: { readonly id: string };
}

/** A worker that holds every solve until the test answers it. */
class HeldWorker extends EventTarget {
	readonly sent: Sent[] = [];
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

	/**
	 * Tell what one held solve found before it answers.
	 * @param index Which held solve.
	 * @param told What the engine tells, as root options.
	 */
	tell(index: number, told: Record<string, string>): void {
		const message = this.sent[index]!;
		this.dispatchEvent(new MessageEvent("message", { data: { id: message.id, told } }));
	}

	/** Say that its engine is loaded. */
	ready(): void {
		this.dispatchEvent(new MessageEvent("message", { data: { ready: true } }));
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
 * @returns Their ids.
 */
function sentTo(worker: HeldWorker): string[] {
	return worker.sent.map(({ graph }) => graph.id);
}

test("a cancellable solve lets its caller reject queued speculation before the next solve starts", async () => {
	const { solve, workers } = heldPool(1);
	const first = solve({ id: "first" }, {}, new AbortController().signal);
	const controller = new AbortController();
	const obsolete = solve({ id: "obsolete" }, {}, controller.signal);
	const refused = obsolete.catch((error: unknown) => error);
	const needed = solve({ id: "needed" }, {});
	const started = Promise.withResolvers<void>();
	const worker = workers[0]!;
	const send = worker.postMessage.bind(worker);
	/**
	 * Observe dispatch resuming without a wall clock wait.
	 * @param message The solve sent to the worker.
	 */
	worker.postMessage = (message) => {
		send(message);
		if (message.graph.id === "needed") started.resolve();
	};
	// Layout decoding and candidate selection both follow the worker's answer.
	const selected = first.then((answer) => answer).then(() => controller.abort());
	workers[0]!.answer(0, { data: { id: "first!" } });
	await selected;
	expect(sentTo(workers[0]!)).not.toContain("obsolete");
	expect(await refused).toBe(controller.signal.reason);
	await started.promise;
	expect(sentTo(workers[0]!)).toEqual(["first", "needed"]);
	workers[0]!.answer(1, { data: { id: "needed!" } });
	expect(await needed).toEqual({ id: "needed!" });
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
				if (message.graph.id === "needed") started.resolve();
			};
			workers.push(worker);
			return worker;
		}, 1);
		const first = solve({ id: "first" }, {}, new AbortController().signal);
		workers[0]!.answer(0, { error: "WASM failed to load", fatal: true });
		expect(sentTo(workers[1]!)).toEqual(["first"]);
		const controller = new AbortController();
		const obsolete = solve({ id: "obsolete" }, {}, controller.signal);
		const refused = obsolete.catch((error: unknown) => error);
		const needed = solve({ id: "needed" }, {});
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
		workers[2]!.answer(0, { data: { id: "needed!" } });
		expect(await needed).toEqual({ id: "needed!" });
	},
);

test("an uncancelled handoff resumes FIFO work, including a solve enqueued by its caller", async () => {
	const { solve, workers } = heldPool(1);
	const signal = new AbortController().signal;
	const first = solve({ id: "first" }, {}, signal);
	const second = solve({ id: "second" }, {}, signal);
	const third = solve({ id: "third" }, {});
	const started = Promise.withResolvers<void>();
	const worker = workers[0]!;
	const send = worker.postMessage.bind(worker);
	/**
	 * Observe when queued work resumes after the caller's selection.
	 * @param message The solve sent to the worker.
	 */
	worker.postMessage = (message) => {
		send(message);
		if (message.graph.id === "second") started.resolve();
	};
	let appended: ReturnType<typeof solve> | undefined;
	const selected = first.then((answer) => {
		appended = solve({ id: "appended" }, {});
		return answer;
	});
	worker.answer(0, { data: { id: "first!" } });
	await selected;
	expect(sentTo(worker)).toEqual(["first"]);
	expect(worker.references).toBe(0);
	await started.promise;
	expect(sentTo(worker)).toEqual(["first", "second"]);
	expect(worker.references).toBe(1);
	worker.answer(1, { data: { id: "second!" } });
	expect(sentTo(worker)).toEqual(["first", "second", "third"]);
	worker.answer(2, { data: { id: "third!" } });
	expect(sentTo(worker)).toEqual(["first", "second", "third", "appended"]);
	worker.answer(3, { data: { id: "appended!" } });
	expect(await Promise.all([second, third, appended])).toEqual([
		{ id: "second!" },
		{ id: "third!" },
		{ id: "appended!" },
	]);
	expect(worker.references).toBe(0);
});

test("an obsolete queued solve never occupies a worker", async () => {
	const { solve, workers } = heldPool(1);
	const first = solve({ id: "first" }, {});
	const controller = new AbortController();
	const obsolete = solve({ id: "obsolete" }, {}, controller.signal);
	const refused = obsolete.catch((error: unknown) => error);
	const needed = solve({ id: "needed" }, {});
	controller.abort();
	expect(await refused).toHaveProperty("name", "AbortError");
	workers[0]!.answer(0, { data: { id: "first!" } });
	expect(sentTo(workers[0]!)).toEqual(["first", "needed"]);
	workers[0]!.answer(1, { data: { id: "needed!" } });
	expect(await Promise.all([first, needed])).toEqual([{ id: "first!" }, { id: "needed!" }]);
});

test("cancellation refuses unstarted work but leaves an active engine intact", async () => {
	const { solve, workers } = heldPool(1);
	const stopped = AbortSignal.abort();
	expect(
		await solve({ id: "unstarted" }, {}, stopped).catch((error: unknown) => error),
	).toHaveProperty("name", "AbortError");
	expect(workers).toHaveLength(0);
	const controller = new AbortController();
	const active = solve({ id: "active" }, {}, controller.signal);
	controller.abort();
	workers[0]!.answer(0, { data: { id: "active!" } });
	expect(await active).toEqual({ id: "active!" });
	expect(workers[0]!.terminated).toBe(false);
});

test.each(["worker error", "engine abort"] as const)(
	"an obsolete active solve is not retried after a %s",
	async (failure) => {
		const { solve, workers } = heldPool(1);
		const controller = new AbortController();
		const obsolete = solve({ id: "obsolete" }, {}, controller.signal);
		const refused = obsolete.catch((error: unknown) => error);
		const needed = solve({ id: "needed" }, {});
		controller.abort();
		if (failure === "worker error") workers[0]!.dispatchEvent(new Event("error"));
		else workers[0]!.answer(0, { error: "program has already aborted!", fatal: true });

		expect(await refused).toBe(controller.signal.reason);
		expect(workers[0]!.terminated).toBe(true);
		expect(workers).toHaveLength(2);
		expect(sentTo(workers[1]!)).toEqual(["needed"]);
		workers[1]!.answer(0, { data: { id: "needed!" } });
		expect(await needed).toEqual({ id: "needed!" });
		expect(sentTo(workers[1]!)).toEqual(["needed"]);
	},
);

test("a retried solve can be cancelled while it waits behind needed work", async () => {
	const { solve, workers } = heldPool(1);
	const controller = new AbortController();
	const obsolete = solve({ id: "obsolete" }, {}, controller.signal);
	const refused = obsolete.catch((error: unknown) => error);
	const first = solve({ id: "first" }, {});
	workers[0]!.dispatchEvent(new Event("error"));
	// The retry is queued again, behind work that was already waiting.
	expect(sentTo(workers[1]!)).toEqual(["first"]);
	const next = solve({ id: "next" }, {});
	controller.abort();
	expect(await refused).toBe(controller.signal.reason);
	expect(workers[1]!.terminated).toBe(false);
	workers[1]!.answer(0, { data: { id: "first!" } });
	expect(sentTo(workers[1]!)).toEqual(["first", "next"]);
	workers[1]!.answer(1, { data: { id: "next!" } });
	expect(await Promise.all([first, next])).toEqual([{ id: "first!" }, { id: "next!" }]);
});

test("a retry that has started answers normally after cancellation", async () => {
	const { solve, workers } = heldPool(1);
	const controller = new AbortController();
	const active = solve({ id: "active" }, {}, controller.signal);
	workers[0]!.dispatchEvent(new Event("error"));
	expect(sentTo(workers[1]!)).toEqual(["active"]);
	controller.abort();
	workers[1]!.answer(0, { data: { id: "active!" } });
	expect(await active).toEqual({ id: "active!" });
	expect(workers[1]!.terminated).toBe(false);
});

test("a solve waits for the first worker free, and the pool grows one worker at a time up to its ceiling", async () => {
	const { solve, workers } = heldPool(2);
	const first = solve({ id: "a" }, {});
	const second = solve({ id: "b" }, {});
	// The first worker has not answered, so it is still starting: the second
	// solve waits rather than compiling the engine again beside it.
	expect(workers).toHaveLength(1);
	expect(sentTo(workers[0]!)).toEqual(["a"]);
	workers[0]!.answer(0, { data: { id: "a!" } });
	expect(await first).toEqual({ id: "a!" });
	expect(sentTo(workers[0]!)).toEqual(["a", "b"]);

	// It has started and is busy, so the next solve starts a second worker; the
	// ceiling keeps the ones after that waiting in the pool.
	const third = solve({ id: "c" }, {});
	const fourth = solve({ id: "d" }, {});
	const fifth = solve({ id: "e" }, {});
	expect(workers).toHaveLength(2);
	expect(sentTo(workers[1]!)).toEqual(["c"]);

	// A waiting solve goes to whichever worker frees up first, never behind a
	// worker still busy with a long solve.
	workers[1]!.answer(0, { data: { id: "c!" } });
	expect(sentTo(workers[1]!)).toEqual(["c", "d"]);
	expect(sentTo(workers[0]!)).toEqual(["a", "b"]);
	workers[1]!.answer(1, { data: { id: "d!" } });
	expect(sentTo(workers[1]!)).toEqual(["c", "d", "e"]);
	workers[1]!.answer(2, { data: { id: "e!" } });
	workers[0]!.answer(1, { data: { id: "b!" } });
	expect(await Promise.all([second, third, fourth, fifth])).toEqual([
		{ id: "b!" },
		{ id: "c!" },
		{ id: "d!" },
		{ id: "e!" },
	]);
	expect(workers).toHaveLength(2);
});

test("a worker whose engine is loaded lets the next solve start another worker before it answers", () => {
	const { solve, workers } = heldPool(3);
	void solve({ id: "long" }, {});
	void solve({ id: "short" }, {});
	void solve({ id: "later" }, {});
	expect(workers).toHaveLength(1);
	workers[0]!.ready();
	// The first worker still solves; the second starts, and the third waits until it is loaded too.
	expect(workers).toHaveLength(2);
	expect(sentTo(workers[1]!)).toEqual(["short"]);
	workers[1]!.ready();
	expect(workers).toHaveLength(3);
	expect(sentTo(workers[2]!)).toEqual(["later"]);
});

test("a heard solve tells its caller what it found, and called off while a worker holds it, stops that worker", async () => {
	const { solve, workers } = heldPool(1);
	const heard: Record<string, string>[] = [];
	const calling = new AbortController();
	const reason = new Error("the other way was chosen");
	const dropped = solve({ id: "dropped" }, {}, calling.signal, (told) => heard.push(told));
	const refusal = dropped.catch((error: unknown) => error);
	const next = solve({ id: "next" }, {});
	workers[0]!.tell(0, { found: "early" });
	expect(heard).toEqual([{ found: "early" }]);
	calling.abort(reason);
	expect(await refusal).toBe(reason);
	expect(workers[0]!.terminated).toBe(true);
	expect(sentTo(workers[1]!)).toEqual(["next"]);
	workers[1]!.answer(0, { data: { id: "next!" } });
	expect(await next).toEqual({ id: "next!" });
});

test("a heard solve that answers is answered, and calling it off afterwards stops nothing", async () => {
	const { solve, workers } = heldPool(1);
	const calling = new AbortController();
	const kept = solve({ id: "kept" }, {}, calling.signal, () => undefined);
	workers[0]!.answer(0, { data: { id: "kept!" } });
	expect(await kept).toEqual({ id: "kept!" });
	calling.abort();
	expect(workers[0]!.terminated).toBe(false);
});

test("a solve called off while it waits is never sent, and one a worker holds still answers", async () => {
	const { solve, workers } = heldPool(1);
	const calling = new AbortController();
	const held = solve({ id: "a" }, {}, calling.signal);
	const waiting = solve({ id: "b" }, {}, calling.signal);
	const next = solve({ id: "c" }, {});
	const reason = new Error("not needed");
	calling.abort(reason);
	const refusal = await waiting.then(
		() => undefined,
		(error: unknown) => error,
	);
	expect(refusal).toBe(reason);
	workers[0]!.answer(0, { data: { id: "a!" } });
	expect(await held).toEqual({ id: "a!" });
	expect(sentTo(workers[0]!)).toEqual(["a", "c"]);
	workers[0]!.answer(1, { data: { id: "c!" } });
	expect(await next).toEqual({ id: "c!" });
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

test("an engine that aborted is replaced, and the solve it held is sent once more", async () => {
	const { solve, workers } = heldPool(1);
	const first = solve({ id: "a" }, {});
	const second = solve({ id: "b" }, {});
	workers[0]!.answer(0, { error: "program has already aborted!", fatal: true });
	expect(workers[0]!.terminated).toBe(true);
	expect(sentTo(workers[1]!)).toEqual(["b"]);
	workers[1]!.answer(0, { data: { id: "b!" } });
	expect(sentTo(workers[1]!)).toEqual(["b", "a"]);
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
