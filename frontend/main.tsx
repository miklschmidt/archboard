// The browser entry: name the tab, start drawing pictures in this page, and
// mount the root. The stylesheet is linked from index.html.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { rendererBuild, themeColors } from "virtual:archboard-renderer";

import { Application } from "@/ui/application";
import { createBoardRoutingHost } from "@/ui/board-routing";
import { createLocalPictureSource, takePicturesFrom } from "@/ui/semantic-board-canvas";

// The Excalidraw library site returns to the tab that opened it by name.
window.name = "archboard";

const root = document.getElementById("root");
if (!root) {
	throw new Error("The page has no #root element to mount into.");
}

/**
 * This browser's storage for kept pictures, or nothing when it refuses one.
 * @returns The storage.
 */
function pictureStorage(): Storage | undefined {
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

// Where vite serves the routing engine's WebAssembly from, found the same way as the worker below.
const avoidWasmUrl = new URL("../node_modules/libavoid-js/dist/libavoid.wasm", import.meta.url)
	.href;

// Pictures are drawn here, with this browser's canvas and a pool of engine
// workers, from the boards this tab reads (TASK-247). The renderer is its own
// chunk, fetched and started while the application boots, so the shell and a
// kept picture never wait for it.
const renderer = import("@/ui/browser-renderer").then((module) => {
	module.startBrowserRenderer({
		themeColors,
		/**
		 * Start one engine worker and tell it where the routing engine is served.
		 * @returns The worker.
		 */
		startWorker: () => {
			const worker = new Worker(
				new URL("../src/ui/browser-renderer/lib/layout-worker.ts", import.meta.url),
				{
					type: "module",
				},
			);
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage has no target origin; this rule applies to windows.
			worker.postMessage({ cmd: "init", wasmUrl: avoidWasmUrl });
			return worker;
		},
	});
	return module;
});
takePicturesFrom(
	createLocalPictureSource({
		/**
		 * Draw one variant of a board in this page, once the renderer has arrived.
		 * @param board The board, as the page read it.
		 * @param choices The variant, view and theme.
		 * @param policy The vault's presentation policy, as the page read it.
		 * @returns The same answer the render route would give for this board.
		 */
		draw: async (board, choices, policy) => (await renderer).drawBoardHere(board, choices, policy),
		renderer: rendererBuild,
		storage: pictureStorage(),
	}),
);

// The application is the one route, so the URL says which boards the panes
// show and Back retraces the boards a person moved between.
const Root = createBoardRoutingHost(Application);

createRoot(root).render(
	<StrictMode>
		<Root />
	</StrictMode>,
);
