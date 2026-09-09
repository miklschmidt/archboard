// The browser entry: name the tab and mount the root. The stylesheet is
// linked from index.html.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Application } from "@/ui/application";
import { createBoardRoutingHost } from "@/ui/board-routing";

// The Excalidraw library site returns to the tab that opened it by name.
window.name = "archboard";

const root = document.getElementById("root");
if (!root) {
	throw new Error("The page has no #root element to mount into.");
}

// The application is the one route, so the URL says which boards the panes
// show and Back retraces the boards a person moved between.
const Root = createBoardRoutingHost(Application);

createRoot(root).render(
	<StrictMode>
		<Root />
	</StrictMode>,
);
