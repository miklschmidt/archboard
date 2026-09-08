import path from "path";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
	createCodeOpenerPreguard,
	createCodeOpenerRouter,
	isCodeOpenerBodyRoute,
} from "@/server/code-opener";
import { mountBoardRoutes } from "@/server/canvas/lib/board-routes";
import { mountBridgeRoutes } from "@/server/canvas/lib/bridge-routes";
import { mountBrowserPresentation } from "@/server/canvas/lib/browser-presentation-mount";
import { app } from "@/server/canvas/lib/canvas-app";
import { checkoutWork } from "@/server/canvas/lib/canvas-owners";
import { startServer } from "@/server/canvas/lib/canvas-startup";
import { mountChangeFeedRoute } from "@/server/canvas/lib/change-feed-route";
import { mountChangeReportRoute } from "@/server/canvas/lib/change-report-route";
import { mountCheckoutSnapshot } from "@/server/canvas/lib/checkout-middleware";
import { mountCompareRoute } from "@/server/canvas/lib/compare-route";
import { mountElementRoutes } from "@/server/canvas/lib/element-routes";
import { mountFileRoutes } from "@/server/canvas/lib/file-routes";
import { createLibraryRouter } from "@/server/canvas/lib/library-routes";
import { mountLockRoutes } from "@/server/canvas/lib/lock-routes";
import { mountMermaidRoute } from "@/server/canvas/lib/mermaid-conversion";
import { moduleDir } from "@/server/canvas/lib/module-paths";
import { mountMutationAdmission, trackMutationWork } from "@/server/canvas/lib/mutation-work";
import { mountPaneRoutes, mountSelectionRoutes } from "@/server/canvas/lib/pane-routes";
import { broadcastBoardless } from "@/server/canvas/lib/pane-registry";
import { mountRenderRoutes } from "@/server/canvas/lib/render-routes";
import { mountServiceRoutes } from "@/server/canvas/lib/service-routes";
import { mountSnapshotRoutes } from "@/server/canvas/lib/snapshot-routes";
import { mountHeldBoardReport, mountWriteBoundary } from "@/server/canvas/lib/write-boundary";

// The canvas application, assembled in the order Express will run it. Each
// mount owns one concern; this file decides only their order, which is the
// contract: admission before parsing, the checkout snapshot before any board
// lock, the write boundary (ADR 0016) before every board write.

dotenv.config({ quiet: true });

app.use(cors());

mountMutationAdmission(app);

app.use(createCodeOpenerPreguard());

const globalJson = express.json({ limit: "10mb" });
app.use((req: Request, res: Response, next: NextFunction) => {
	if (isCodeOpenerBodyRoute(req.method, req.path)) {
		return next();
	}
	globalJson(req, res, next);
});

mountCheckoutSnapshot(app);
mountHeldBoardReport(app);

// Serve the frontend bundle, and only that.
//
// This used to mount `../dist` as well, which meant whatever a build tool had
// left in that directory was reachable over http by path. Under ADR 0014 vite
// writes nothing but `dist/frontend`, so today that mount adds nothing. But a
// checkout from before ADR 0014 still has a compiled server, CLI and every core
// module sitting in `dist/`, and the broad mount served all of it. What is
// reachable is now this line's decision rather than a build tool's.
// `tests/system/process-contracts/local-bind.test.ts` plants a file in `dist/`
// and checks it 404s.
app.use(express.static(path.join(moduleDir, "../dist/frontend")));
app.get("/assets/excalidraw.css", (_req, res) => {
	res.sendFile("index.css", {
		root: path.join(moduleDir, "../node_modules/@excalidraw/excalidraw/dist/prod"),
	});
});
// Serve Excalidraw fonts so the font subsetting worker can fetch them for export
app.use(
	"/assets/fonts",
	express.static(path.join(moduleDir, "../node_modules/@excalidraw/excalidraw/dist/prod/fonts")),
);

mountWriteBoundary(app);

app.use(
	createCodeOpenerRouter({
		/**
		 * Run checkout work tracked against the response.
		 * @param req The request.
		 * @param res Its response.
		 * @param name What the work is.
		 * @param work The work.
		 * @returns The work's result.
		 */
		runCheckout: (req, res, name, work) => checkoutWork.trackRequest(req, res, name, work),
		/**
		 * Run mutation work under the request's lease.
		 * @param req The request.
		 * @param name What the work is.
		 * @param work The work.
		 * @returns The work's result.
		 */
		runMutation: (req, name, work) => trackMutationWork(req, name, work),
	}),
);

mountLockRoutes(app);
mountElementRoutes(app);
mountBridgeRoutes(app);
mountMermaidRoute(app);
mountChangeReportRoute(app);
mountChangeFeedRoute(app);
mountSelectionRoutes(app);
mountPaneRoutes(app);
mountFileRoutes(app);
mountRenderRoutes(app);
mountBrowserPresentation(app);
mountSnapshotRoutes(app);
mountBoardRoutes(app);
mountCompareRoute(app);

// The stencil palette, which is not a board and never becomes one. The browser
// reads the library when it mounts and writes back whatever Excalidraw says
// the library now is; the result is broadcast so the other tabs stop being the
// stale one, including the tab that sent it, which recognises its own write by
// content rather than by a client id.
app.use(
	createLibraryRouter({
		/**
		 * Tell every tab the library changed.
		 * @param notification The new library.
		 */
		notifyLibraryChanged(notification) {
			broadcastBoardless({
				...notification,
				items: notification.items.map((item) => ({ ...item, elements: [...item.elements] })),
			});
		},
	}),
);

mountServiceRoutes(app);

export { app, startServer };
