// The browser entry: name the tab, start drawing pictures in this page, and
// mount the root. The stylesheet is linked from index.html.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { rendererBuild, themeColors } from "virtual:archboard-renderer";

import { Application } from "@/ui/application";
import { createBoardRoutingHost } from "@/ui/board-routing";
import { drawBoardHere, startBrowserRenderer } from "@/ui/browser-renderer";
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
// workers, from the boards this tab reads (TASK-247).
startBrowserRenderer({
	themeColors,
	startWorker: () =>
		new Worker(new URL("@archboard/elk-rs/worker.browser", import.meta.url), { type: "module" }),
});
takePicturesFrom(
	createLocalPictureSource({
		draw: drawBoardHere,
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
