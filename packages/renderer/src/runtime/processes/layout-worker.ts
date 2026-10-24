import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import type { RendererHost } from "#shared/rules/render/host.ts";
import { loadLayoutEngine } from "#shared/rules/engine/layout-engine.ts";
import { engineAborted } from "#shared/rules/engine/engine-pool.ts";
import { loadCore } from "#runtime/services/core.ts";

type Solve = RendererHost["solve"];
interface Request {
	readonly id: number;
	readonly graph: Parameters<Solve>[0];
	readonly layoutOptions: Parameters<Solve>[1];
}

// An initialization promise is shared by every request in this worker. The
// engine's WASM state stays private to the worker; requests run serially, each
// from the engine's memory as loaded. The core loads first, outside the
// engine's load, and the worker refuses to start on a core built from other
// sources (ADR 0057).
const ready = loadCore().then(() =>
	loadLayoutEngine(async () => {
		const [viz] = await Promise.all([instance(), AvoidLib.load()]);
		return [viz, AvoidLib.getInstance()];
	}),
);
let initFailure = false;
// The pool starts its next worker once this one says its engine is loaded.
void ready.then(
	// oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker has no target origin
	() => self.postMessage({ ready: true }),
	() => {
		initFailure = true;
	},
);
let queue: Promise<void> = Promise.resolve();

self.addEventListener("message", (event: MessageEvent<Request>) => {
	const request = event.data;
	queue = queue.then(async () => {
		try {
			const solve = await ready;
			const data = solve(request.graph, request.layoutOptions, (told) =>
				// oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker has no target origin
				self.postMessage({ id: request.id, told }),
			);
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker has no target origin
			self.postMessage({ id: request.id, data });
		} catch (error) {
			const fatal = initFailure || engineAborted(error);
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker has no target origin
			self.postMessage({ id: request.id, error: String(error), fatal });
		}
		return undefined;
	});
});
