// The browser entry: name the tab, start drawing pictures in this page, and
// mount the root. The stylesheet is linked from index.html.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import avoidWasmUrl from "../node_modules/libavoid-js/dist/libavoid.wasm?url";
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

// Pictures are drawn here, with this browser's canvas and a pool of engine
// workers, from the boards this tab reads (TASK-247). The renderer is its own
// chunk, fetched and started while the application boots, so the shell and a
// kept picture never wait for it.
const renderer = import("@/ui/browser-renderer").then((module) => {
	module.startBrowserRenderer({
		themeColors,
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
