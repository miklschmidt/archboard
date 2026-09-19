import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import type { RendererHost } from "@/transformers/semantic-renderer/host";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";

type Solve = RendererHost["solve"];
interface Request {
	readonly id: number;
	readonly graph: Parameters<Solve>[0];
	readonly layoutOptions: Parameters<Solve>[1];
}

// An initialization promise is shared by every request in this worker. The
// engine's WASM state stays private to the worker; requests run serially.
const ready = Promise.all([instance(), AvoidLib.load()]).then(([viz]) =>
	createLayoutEngine(viz, AvoidLib.getInstance()),
);
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
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker has no target origin
			self.postMessage({ id: request.id, error: String(error), fatal: initFailure });
		}
		return undefined;
	});
});
