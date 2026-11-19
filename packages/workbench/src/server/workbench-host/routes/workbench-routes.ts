// Every route the workbench answers, mounted together: the panes, what they read, the model they
// show, the conversation a tab shows, and the explanations. The server lends what it owns: the
// mutation lease, and the status it gives a refused read.

import type { ArchitectureModelRead } from "@archboard/model-contract";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { requireVault, vaultOfRequest } from "@archboard/server-requests/server";

import { mountExplanationRoutes } from "#server/explanations/routes/explanation-routes.ts";
import { mountPaneRoutes } from "#server/panes/routes/pane-routes.ts";
import { agentActivity } from "#server/panes/services/agent-activity.ts";

/** What the server lends the workbench's routes. */
interface WorkbenchHooks {
	/**
	 * Run an async route under the request's mutation lease, its failure reaching Express.
	 * @param route The route.
	 * @returns An ordinary Express handler.
	 */
	runMutation(route: (req: Request, res: Response) => Promise<void>): RequestHandler;
	/**
	 * The status the server answers a refused model read with.
	 * @param refusal The refused read.
	 * @returns The HTTP status.
	 */
	refusalStatus(refusal: Extract<ArchitectureModelRead, { success: false }>): number;
}

/**
 * Show off-screen work: a write under `/api/architecture` names a vault that no pane or registry
 * may name, and the agent activity follows it.
 * @param req The request, whose vault the requirement before this has read.
 * @param _res Its response.
 * @param next Continues to the route.
 */
function observeWrite(req: Request, _res: Response, next: NextFunction): void {
	if (req.method !== "GET") agentActivity.addressed(vaultOfRequest(req));
	next();
}

/**
 * Mount the workbench's routes. Its first middleware holds every later route under
 * `/api/architecture` to a vault and observes each write there, so the server mounts this before
 * its model and history routes, which it then observes too.
 * @param app The application to mount on.
 * @param hooks What the server lends the routes.
 */
function mountWorkbenchRoutes(app: Express, hooks: WorkbenchHooks): void {
	app.use("/api/architecture", requireVault, observeWrite);
	mountPaneRoutes(app, hooks);
	mountExplanationRoutes(app, hooks);
}

export { mountWorkbenchRoutes };
export type { WorkbenchHooks };
