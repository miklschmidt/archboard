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
import { diagramIconPaths } from "@/runtime/semantic-renderer/index";
import { app } from "@/server/archboard/lib/server-app";
import { checkoutWork } from "@/server/archboard/lib/server-owners";
import { mountCodeCheckRoute } from "@/server/archboard/lib/code-check-route";
import { mountFootprintRoute } from "@/server/archboard/lib/footprint-route";
import { startServer } from "@/server/archboard/lib/server-startup";
import { moduleDir } from "@/server/archboard/lib/module-paths";
import { mountMutationAdmission, trackMutationWork } from "@/server/archboard/lib/mutation-work";
import { mountPaneRoutes } from "@/server/archboard/lib/pane-routes";
import { mountSemanticLockRoutes } from "@/server/archboard/lib/semantic-lock-routes";
import { mountSemanticBoardRoutes } from "@/server/archboard/lib/semantic-board-routes";
import { mountLocalityRoute } from "@/server/archboard/lib/locality-route";
import { mountVoiceStartTraceRoute } from "@/server/archboard/lib/voice-start-trace";
import { mountSemanticPaneContextRoutes } from "@/server/archboard/lib/semantic-pane-context";
import { watchSemanticBoardFiles } from "@/server/archboard/lib/semantic-disk-watch";
import { mountServiceRoutes } from "@/server/archboard/lib/service-routes";

// The Archboard server application, assembled in the order Express will run it. Each
// mount owns one concern; this file decides only their order, which is the
// contract: admission before parsing, and the checkout snapshot before any
// route that can open a file in somebody's editor.

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

// Serve the frontend bundle, and only that.
//
// What is reachable over http is this line's decision rather than a build
// tool's: under ADR 0014 vite writes nothing but `dist/frontend`, and a
// checkout from before it still has a compiled server and CLI sitting in
// `dist/`. `tests/system/process-contracts/local-bind.test.ts` plants a file in
// `dist/` and checks it 404s.
app.use(express.static(path.join(moduleDir, "../dist/frontend")));

// The faces the renderer measures and draws in. A rendered diagram registers
// them itself, by these URLs, so the glyphs a browser draws come from the same
// files the server measured — a picture whose text was measured in one face and
// drawn in another has boxes that do not fit their words.
app.use(
	"/assets/diagram-fonts",
	express.static(path.join(moduleDir, "ui/shell/assets/fonts"), {
		immutable: true,
		maxAge: "1y",
	}),
);

// The icons a picture drawn in the browser names, one at a time (TASK-247). A
// policy may name any of the icon set's three thousand, so the page asks for
// the few it draws rather than carrying them all.
app.get("/assets/diagram-icons/:name", (req, res) => {
	const name = /^(Ri[A-Za-z0-9]+(?:Line|Fill))\.json$/u.exec(req.params.name)?.[1];
	const paths = name === undefined ? undefined : diagramIconPaths(name);
	if (paths === undefined) {
		res.status(404).json({ success: false, error: `No icon called "${req.params.name}"` });
		return;
	}
	// Revalidated, not kept: the paths change when the icon package does.
	res.set("Cache-Control", "no-cache").json({ paths });
});

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

mountSemanticLockRoutes(app);
mountPaneRoutes(app);
mountSemanticBoardRoutes(app);
mountLocalityRoute(app);
mountCodeCheckRoute(app);
mountFootprintRoute(app);
mountSemanticPaneContextRoutes(app);
mountVoiceStartTraceRoute(app);

// A vault can be open in more than one server, and the lease says who may write
// rather than who has been told. Watching the boards on screen is what keeps a
// pane from reading a board another writer replaced under it.
watchSemanticBoardFiles();

mountServiceRoutes(app);

export { app, startServer };
