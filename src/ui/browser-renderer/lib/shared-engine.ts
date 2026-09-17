// One compiled layout engine, shared by every engine worker in the page.
//
// The engine is a 5.5 MB WebAssembly binary. Left to itself each worker fetches
// and compiles it, so a pool that grows to five workers compiles it five times.
// Instead the page compiles it once, and each worker is handed the compiled
// module as its first message (`{ cmd: "init", module }`, which the engine's
// worker entry answers by instantiating from it) and instantiates in
// milliseconds. Messages sent before the module is ready wait, in order, so the
// pool never has to know. A page that cannot compile it leaves each worker to
// compile its own, as before.

import type { EngineWorker } from "@/ui/browser-renderer/lib/engine-pool";

/**
 * Compile the engine once.
 * @param binaryUrl Where the page serves the engine binary.
 * @returns The compiled module, or nothing when this browser could not compile it.
 */
function compileEngine(binaryUrl: string): Promise<WebAssembly.Module | undefined> {
	return WebAssembly.compileStreaming(fetch(binaryUrl)).catch(() => undefined);
}

/**
 * Start a worker that runs the shared engine.
 * @param start Starts one bare engine worker.
 * @param engine The engine, compiling or compiled.
 * @returns The worker, which holds messages until its engine is handed over.
 */
function workerOnSharedEngine(
	start: () => EngineWorker,
	engine: Promise<WebAssembly.Module | undefined>,
): EngineWorker {
	const worker = start();
	const handedOver = engine.then((module) => {
		if (module !== undefined) {
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin; the rule is about window.postMessage
			worker.postMessage({ cmd: "init", module });
		}
		return undefined;
	});
	return {
		/**
		 * Send once the engine has been handed over, in the order sent.
		 * @param message The message.
		 */
		postMessage: (message) => {
			void handedOver.then(() => {
				// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin; the rule is about window.postMessage
				worker.postMessage(message);
				return undefined;
			});
		},
		/**
		 * Listen to the worker itself.
		 * @param type Which event.
		 * @param listener The listener.
		 */
		addEventListener: (type, listener) => {
			worker.addEventListener(type, listener);
		},
	};
}

export { compileEngine, workerOnSharedEngine };
