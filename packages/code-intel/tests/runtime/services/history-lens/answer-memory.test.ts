// The server's memory of an answer (ADR 0045): an answer is kept while its key
// holds, a request that arrives while it is made waits for that work, and the
// work stops only when every request that waits for it has gone.

import { expect, test } from "bun:test";
import { createAnswerMemory } from "#runtime/services/history-lens/answer-memory.ts";

/**
 * A piece of work a test finishes, or watches being stopped. A stopped piece
 * settles only when the test says so, as a Git command ends a moment after it
 * is killed.
 */
function pending() {
	let finish!: (answer: string) => void;
	let fail!: (reason: unknown) => void;
	let stopped: unknown;
	let started = 0;
	return {
		make: (signal: AbortSignal): Promise<string> => {
			started += 1;
			signal.addEventListener("abort", () => {
				stopped = signal.reason;
			});
			return new Promise<string>((resolve, reject) => {
				finish = resolve;
				fail = reject;
			});
		},
		finish: (answer: string) => finish(answer),
		settleStopped: () => fail(stopped),
		started: () => started,
		stopped: () => stopped,
	};
}

/**
 * Whether a promise has settled once every pending callback has run.
 * @param promise The promise.
 * @returns True when it has settled.
 */
async function settled(promise: Promise<unknown>): Promise<boolean> {
	const turn = new Promise<boolean>((resolve) => setImmediate(() => resolve(false)));
	const done = promise.then(
		() => true,
		() => true,
	);
	return await Promise.race([done, turn]);
}

/** Makes an answer that is a new object each time, which is how a test tells two makings apart. */
const makeObject = () => Promise.resolve({});

test("a key that holds is answered from memory, and another key is made again", async () => {
	const memory = createAnswerMemory<object>(4);
	const first = await memory.answer("a", makeObject);
	expect(await memory.answer("a", makeObject)).toBe(first);
	expect(await memory.answer("b", makeObject)).not.toBe(first);
});

test("the memory keeps only its limit, and forgets the answer it used least recently", async () => {
	const memory = createAnswerMemory<object>(2);
	const a = await memory.answer("a", makeObject);
	await memory.answer("b", makeObject);
	await memory.answer("a", makeObject);
	await memory.answer("c", makeObject);
	expect(await memory.answer("a", makeObject)).toBe(a);
	expect(await memory.answer("b", makeObject)).not.toBe(a);
});

test("a request that arrives while the answer is made waits for it and starts no second walk", async () => {
	const memory = createAnswerMemory<string>(4);
	const work = pending();
	const first = memory.answer("k", work.make);
	const second = memory.answer("k", work.make);
	work.finish("done");
	expect(await Promise.all([first, second])).toEqual(["done", "done"]);
	expect(work.started()).toBe(1);
});

test("a caller that hangs up leaves the work to the caller that still waits", async () => {
	const memory = createAnswerMemory<string>(4);
	const work = pending();
	const hangUp = new AbortController();
	const gone = memory.answer("k", work.make, hangUp.signal);
	const staying = memory.answer("k", work.make);
	hangUp.abort(new Error("hung up"));
	await expect(gone).rejects.toThrow("hung up");
	expect(work.stopped()).toBeUndefined();
	work.finish("done");
	expect(await staying).toBe("done");
});

test("the work stops when the last caller that waits for it has gone, and that caller waits for it to settle", async () => {
	const memory = createAnswerMemory<string>(4);
	const work = pending();
	const first = new AbortController();
	const second = new AbortController();
	const one = memory.answer("k", work.make, first.signal);
	const two = memory.answer("k", work.make, second.signal);
	first.abort(new Error("first"));
	await expect(one).rejects.toThrow("first");
	expect(work.stopped()).toBeUndefined();
	second.abort(new Error("second"));
	expect(await settled(two)).toBe(false);
	expect(work.stopped()).toBeInstanceOf(Error);
	work.settleStopped();
	await expect(two).rejects.toThrow("second");
});

test("a request after the work was stopped starts new work, and a failure is not kept", async () => {
	const memory = createAnswerMemory<string>(4);
	const stopped = pending();
	const hangUp = new AbortController();
	const gone = memory.answer("k", stopped.make, hangUp.signal);
	hangUp.abort(new Error("hung up"));
	stopped.settleStopped();
	await expect(gone).rejects.toThrow("hung up");
	const fresh = pending();
	const again = memory.answer("k", fresh.make);
	fresh.finish("again");
	expect(await again).toBe("again");
	await expect(
		memory.answer("failing", () => Promise.reject(new Error("git failed"))),
	).rejects.toThrow("git failed");
	expect(await memory.answer("failing", () => Promise.resolve("recovered"))).toBe("recovered");
});
