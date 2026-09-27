// A worker that loads libavoid as a host of its own would, under the program
// path and the languages it is told, and answers a digest of the memory
// libavoid holds as loaded.

import { createHash } from "node:crypto";

declare const self: Worker;

/** What the worker is told to be. */
interface Host {
	readonly program: string;
	readonly languages: readonly string[];
}

self.addEventListener("message", async (event: MessageEvent<Host>): Promise<void> => {
	process.argv[1] = event.data.program;
	Object.defineProperty(globalThis, "navigator", {
		value: { languages: event.data.languages },
		configurable: true,
	});
	const memories: WebAssembly.Memory[] = [];
	const { instantiate } = WebAssembly;
	WebAssembly.instantiate = (async (...args: Parameters<typeof instantiate>) => {
		const answered = await instantiate(...args);
		const exports = "instance" in answered ? answered.instance.exports : answered.exports;
		for (const value of Object.values(exports)) {
			if (value instanceof WebAssembly.Memory) memories.push(value);
		}
		return answered;
	}) as typeof instantiate;
	const { AvoidLib } = await import("libavoid-js");
	await AvoidLib.load();
	const words = new Uint32Array(memories[0]!.buffer);
	let end = words.length;
	while (end > 0 && words[end - 1] === 0) end -= 1;
	const digest = createHash("sha256")
		.update(new Uint8Array(memories[0]!.buffer, 0, end * 4))
		.digest("hex");
	// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin; the rule is about window.postMessage
	self.postMessage(digest);
});
