import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import type { RendererHost } from "#shared/rules/render/host.ts";
import { loadLayoutEngine } from "#shared/rules/engine/layout-engine.ts";
import { engineAborted } from "#shared/rules/engine/engine-pool.ts";

type Solve = RendererHost["solve"];
type Request =
	| { readonly cmd: "init"; readonly wasmUrl: string }
	| {
			readonly id: number;
			readonly graph: Parameters<Solve>[0];
			readonly layoutOptions: Parameters<Solve>[1];
	  };

let ready: ReturnType<typeof loadLayoutEngine> | undefined;
let queue: Promise<void> = Promise.resolve();
let initFailure = false;

self.addEventListener("message", (event: MessageEvent<Request>) => {
	const request = event.data;
	if ("cmd" in request) {
		ready = loadLayoutEngine(async () => {
			const [viz] = await Promise.all([instance(), AvoidLib.load(request.wasmUrl)]);
			return [viz, AvoidLib.getInstance()];
		});
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
			const fatal = initFailure || engineAborted(error);
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker has no target origin
			self.postMessage({ id: request.id, error: String(error), fatal });
		}
		return undefined;
	});
});
