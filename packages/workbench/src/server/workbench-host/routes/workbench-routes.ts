// Every route the workbench answers, mounted together: the panes, what they read, the model they
// show, the conversation a tab shows, the explanations and the voice start trace. The server lends what it owns: the
// mutation lease, the status it gives a refused read, how it reads the vault a request names, and
// where it listens.

import type { ArchitectureModelRead } from "@archboard/model-contract";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";

import { mountExplanationRoutes } from "#server/explanations/routes/explanation-routes.ts";
import { mountPaneRoutes } from "#server/panes/routes/pane-routes.ts";
import { agentActivity } from "#server/panes/services/agent-activity.ts";
import { voiceStartAttempts } from "#server/panes/services/voice-agent.ts";

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
	/** Refuses a request that names no usable vault, and remembers the vault it names. */
	readonly requireVault: RequestHandler;
	/** The vault a request named, once `requireVault` has run on it. */
	readonly vaultOfRequest: (req: Request) => string;
	/** The vault a request names, or null when it names none the server can read. */
	readonly statedVault: (req: Request) => string | null;
	/** Where the server listens: the port its Codex state is kept under, and its URL. */
	readonly address: { readonly port: number; readonly httpUrl: string };
}

/**
 * Show off-screen work: a write under `/api/architecture` names a vault that no pane or registry
 * may name, and the agent activity follows it.
 * @param vaultOfRequest How the server reads the vault the requirement before this remembered.
 * @returns The middleware.
 */
function observeWrite(vaultOfRequest: WorkbenchHooks["vaultOfRequest"]): RequestHandler {
	return (req: Request, _res: Response, next: NextFunction) => {
		if (req.method !== "GET") agentActivity.addressed(vaultOfRequest(req));
		next();
	};
}

/**
 * Mount the workbench's routes. Its first middleware holds every later route under
 * `/api/architecture` to a vault and observes each write there, so the server mounts this before
 * its model and history routes, which it then observes too.
 * @param app The application to mount on.
 * @param hooks What the server lends the routes.
 */
function mountWorkbenchRoutes(app: Express, hooks: WorkbenchHooks): void {
	app.use("/api/architecture", hooks.requireVault, observeWrite(hooks.vaultOfRequest));
	mountPaneRoutes(app, hooks);
	mountExplanationRoutes(app, hooks);
	// What happened in the last voice starts, for a person or an agent that diagnoses a failed one.
	app.get("/api/voice/start-trace", (_req: Request, res: Response) => {
		res.json({ success: true, attempts: voiceStartAttempts() });
	});
}

export { mountWorkbenchRoutes };
export type { WorkbenchHooks };
