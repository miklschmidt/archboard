import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import type { RendererHost } from "@/transformers/semantic-renderer/host";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";

type Solve = RendererHost["solve"];
type Request =
	| { readonly cmd: "init"; readonly wasmUrl: string }
	| {
			readonly id: number;
			readonly graph: Parameters<Solve>[0];
			readonly layoutOptions: Parameters<Solve>[1];
	  };

let ready: Promise<ReturnType<typeof createLayoutEngine>> | undefined;
let queue: Promise<void> = Promise.resolve();
let initFailure = false;

self.addEventListener("message", (event: MessageEvent<Request>) => {
	const request = event.data;
	if ("cmd" in request) {
		ready = Promise.all([instance(), AvoidLib.load(request.wasmUrl)]).then(([viz]) =>
			createLayoutEngine(viz, AvoidLib.getInstance()),
		);
		void ready.catch(() => {
			initFailure = true;
		});
		return;
	}
	queue = queue.then(async () => {
		try {
			if (ready === undefined) throw new Error("The layout worker was not initialized");
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
