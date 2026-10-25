// The browser entry: start drawing pictures in this page and mount the root, or
// the renderer of a recorded talk when the address asks for one.
// The stylesheet is linked from index.html.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { rendererBuild } from "virtual:archboard-renderer";

import { replayAskedOf } from "@archboard/walkthrough/talk";
import { Application } from "#ui/components/application/Application.tsx";
import { createBoardRoutingHost } from "#ui/components/board-routing/BoardRoutingHost.tsx";
import { browserPictureStorage } from "#ui/clients/semantic-board-canvas/reads/picture-cache.ts";
import { createLocalPictureSource } from "#ui/clients/semantic-board-canvas/reads/local-pictures.ts";
import { takePicturesFrom } from "#ui/clients/semantic-board-canvas/reads/picture-source.ts";
import { learnServedVault } from "@archboard/server-requests";
import { startWalkthroughReplay } from "#ui/clients/walkthrough-replay/start-replay.ts";

const root = document.getElementById("root");
if (!root) {
	throw new Error("The page has no #root element to mount into.");
}

// Pictures are drawn here, with this browser's canvas and a pool of engine
// workers, from the boards this tab reads (TASK-247). The renderer is its own
// chunk, fetched and started while the application boots, so the shell and a
// kept picture never wait for it.
const renderer = import("@archboard/renderer/browser").then((module) => {
	module.startBrowserRenderer();
	return module;
});
takePicturesFrom(
	createLocalPictureSource({
		/**
		 * Draw one variant of a board in this page, once the renderer has arrived.
		 * @param board The board, as the page read it.
		 * @param choices The variant and view.
		 * @param policy The vault's presentation policy, as the page read it.
		 * @returns The same answer the render route would give for this board.
		 */
		draw: async (board, choices, policy) => (await renderer).drawBoardHere(board, choices, policy),
		renderer: rendererBuild,
		storage: browserPictureStorage(),
	}),
);

// A page opened to render a recorded talk shows that talk and nothing else
// (TASK-381). Otherwise the application is the one route, so the URL says
// which boards the panes show and Back retraces the boards a person moved
// between.
if (replayAskedOf(window.location.search)) {
	startWalkthroughReplay(root);
} else {
	// Every call names its vault (ADR 0049), so the page learns the one the server
	// serves before any pane makes a call.
	void (async () => {
		try {
			await learnServedVault();
		} catch (error) {
			root.textContent = error instanceof Error ? error.message : String(error);
			return;
		}
		const Root = createBoardRoutingHost(Application);
		createRoot(root).render(
			<StrictMode>
				<Root />
			</StrictMode>,
		);
	})();
}
