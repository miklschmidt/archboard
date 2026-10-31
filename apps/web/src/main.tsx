// The browser entry: start drawing pictures in this page and mount the root, or
// the renderer of a recorded talk when the address asks for one.
// The stylesheet is linked from index.html.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { replayAskedOf } from "@archboard/walkthrough/talk";
import { Application } from "#ui/components/application/Application.tsx";
import { createBoardRoutingHost } from "#ui/components/board-routing/BoardRoutingHost.tsx";

const root = document.getElementById("root");
if (!root) {
	throw new Error("The page has no #root element to mount into.");
}

// Pictures are drawn here, with the renderer core and a pool of engine
// workers, from the boards this tab reads (TASK-247). The renderer is its own
// chunk, fetched and started while the application boots, so the shell and a
// kept picture never wait for it.
const renderer = import("@archboard/renderer/browser").then((module) => {
	module.startBrowserRenderer();
	return module;
});
// A page opened to render a recorded talk shows that talk and nothing else
// (TASK-381). Otherwise the application is the one route, so the URL says
// which readings the panes show and Back retraces deliberate navigation.
if (replayAskedOf(window.location.search)) {
	void import("#ui/clients/walkthrough-replay/start-replay.ts").then((module) =>
		module.startWalkthroughReplay(root, renderer),
	);
} else {
	const Root = createBoardRoutingHost(Application);
	createRoot(root).render(
		<StrictMode>
			<Root />
		</StrictMode>,
	);
}
