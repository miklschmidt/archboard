import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import initCore from "#shared/protocol/generated/core/archboard_renderer_wasm.js";
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
		// The core loads first, outside the engine's load (ADR 0057). Its glue
		// fetches its WebAssembly beside it, as the build serves it.
		ready = initCore().then(() =>
			loadLayoutEngine(async () => {
				const [viz] = await Promise.all([instance(), AvoidLib.load(request.wasmUrl)]);
				return [viz, AvoidLib.getInstance()];
			}),
		);
		// The pool starts its next worker once this one says its engine is loaded.
		void ready.then(
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker has no target origin
			() => self.postMessage({ ready: true }),
			() => {
				initFailure = true;
			},
		);
		return;
	}
	queue = queue.then(async () => {
		try {
			if (ready === undefined) throw new Error("The layout worker was not initialized");
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
