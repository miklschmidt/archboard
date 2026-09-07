import type { Express } from "express";
import { createBrowserPresentationOwner } from "@/server/browser-presentation";
import { boardErrorStatus, checkoutSnapshotFor } from "@/server/canvas/lib/board-response";
import { noBrowserBody } from "@/server/canvas/lib/pane-routes";
import { boardForPane, clients, panes, sendToPane } from "@/server/canvas/lib/pane-registry";

/** The owner of the browser-side operations: export, viewport and the live browser routes. */
const browserPresentation = createBrowserPresentationOwner({
	/**
	 * Every pane on screen.
	 * @returns The registrations.
	 */
	panes: () => [...panes.values()],
	/**
	 * How many browsers are connected.
	 * @returns The count.
	 */
	browserCount: () => clients.size,
	boardForPane,
	sendToPane,
	checkoutSnapshotFor,
	statusForError: boardErrorStatus,
	browserRequiredBody: noBrowserBody,
});

/**
 * Mount the browser presentation routes.
 * @param app The application to mount on.
 */
function mountBrowserPresentation(app: Express): void {
	app.use(browserPresentation.router);
}

export { browserPresentation, mountBrowserPresentation };
