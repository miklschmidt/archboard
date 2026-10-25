import { instance } from "@viz-js/viz";
import initCore from "#shared/protocol/generated/core/archboard_renderer_wasm.js";
import type { RendererHost } from "#shared/rules/render/host.ts";
import { loadLayoutEngine } from "#shared/rules/engine/layout-engine.ts";
import { engineAborted } from "#shared/rules/engine/engine-pool.ts";

type Solve = RendererHost["solve"];
interface Request {
	readonly id: number;
	readonly graph: Parameters<Solve>[0];
	readonly layoutOptions: Parameters<Solve>[1];
}

// The core loads first, outside the engine's load (ADR 0057). Its glue
// fetches its WebAssembly beside it, as the build serves it.
const ready = initCore().then(() => loadLayoutEngine(instance));
let initFailure = false;
void ready.catch(() => {
	initFailure = true;
});
let queue: Promise<void> = Promise.resolve();

self.addEventListener("message", (event: MessageEvent<Request>) => {
	const request = event.data;
	queue = queue.then(async () => {
		try {
			const solve = await ready;
			const data = solve(request.graph, request.layoutOptions);
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
