import express from "express";
import type { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import { createBrowserOriginGuard } from "@archboard/code-opener/browser-origin";
import {
	createCodeOpenerPreguard,
	createCodeOpenerRouter,
	isCodeOpenerBodyRoute,
} from "@archboard/code-opener/opener";
import { DIAGRAM_FONTS_DIRECTORY } from "@archboard/renderer/assets";
import { diagramIconPaths } from "@archboard/renderer/bun";
import { app } from "#server/wiring/http/server-app.ts";
import { FRONTEND_DIRECTORY } from "#server/store/frontend/frontend-directory.ts";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { checkoutWork } from "#server/wiring/owners/server-owners.ts";
import { mountCodeCheckRoute } from "#server/routes/code-check/code-check-route.ts";
import { mountFootprintRoute } from "#server/routes/footprint/footprint-route.ts";
import { startServer } from "#server/lifecycle/startup/server-startup.ts";
import {
	mountMutationAdmission,
	trackMutationWork,
} from "#server/middleware/mutation-work/mutation-work.ts";
import { mountPaneRoutes } from "#server/routes/panes/pane-routes.ts";
import { mountRepositoryRoutes } from "#server/routes/repositories/repository-routes.ts";
import { mountArchitectureConfigurationRoutes } from "#server/routes/architecture/configuration-routes.ts";
import { mountLocalityRoute } from "#server/routes/locality/locality-route.ts";
import { mountVoiceStartTraceRoute } from "@archboard/codex-realtime-voice/server";

import { mountSemanticPaneContextRoutes } from "@archboard/workbench/panes";
import { mountServiceRoutes } from "#server/routes/service/service-routes.ts";
import { mountLegacyMigrationRoutes } from "#server/routes/architecture/migration-routes.ts";
import { mountArchitectureModelRoutes } from "#server/routes/architecture/model-routes.ts";

// The Archboard server application, assembled in the order Express will run it. Each
// mount owns one concern; this file decides only their order, which is the
// contract: admission before parsing, and the checkout snapshot before any
// route that can open a file in somebody's editor.

dotenv.config({ quiet: true });

app.use(createBrowserOriginGuard());

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
app.use(express.static(FRONTEND_DIRECTORY));

// The faces the renderer measures and draws in. A rendered diagram registers
// them itself, by these URLs, so the glyphs a browser draws come from the same
// files the server measured — a picture whose text was measured in one face and
// drawn in another has boxes that do not fit their words.
app.use(
	"/assets/diagram-fonts",
	express.static(DIAGRAM_FONTS_DIRECTORY, {
		immutable: true,
		maxAge: "1y",
	}),
);

// The icons a picture drawn in the browser names, one at a time (TASK-247). A
// policy may name any of the icon set's three thousand, so the page asks for
// the few it draws rather than carrying them all.
app.get("/assets/diagram-icons/:name", (req, res) => {
	const name = /^(Ri[A-Za-z0-9]+)\.json$/u.exec(req.params.name)?.[1];
	const paths = name === undefined ? undefined : diagramIconPaths(name);
	if (paths === undefined) {
		res.status(404).json({ success: false, error: `No icon called "${req.params.name}"` });
		return;
	}
	// Revalidated, not kept: the paths change when the icon package does.
	res.set("Cache-Control", "no-cache").json({ paths });
});

// Every route that reads or writes a board names the vault it means (ADR 0049).
// The routes of this server mount that requirement themselves; this one belongs to
// the code opener, whose router does not know the server.
app.post("/api/code-targets/open", requireVault);

app.use(
	createCodeOpenerRouter(vaultOfRequest, {
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


mountPaneRoutes(app);
mountRepositoryRoutes(app);
mountArchitectureConfigurationRoutes(app);
mountArchitectureModelRoutes(app);
mountLegacyMigrationRoutes(app);
mountLocalityRoute(app);
mountCodeCheckRoute(app);
mountFootprintRoute(app);
mountSemanticPaneContextRoutes(app);
mountVoiceStartTraceRoute(app);

// A vault can be open in more than one server, and the lease says who may write
// rather than who has been told. Watching the boards on screen is what keeps a
// pane from reading a board another writer replaced under it.


mountServiceRoutes(app);

export { app, startServer };
