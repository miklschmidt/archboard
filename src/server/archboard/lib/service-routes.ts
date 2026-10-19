import path from "path";
import type { Express, NextFunction, Request, Response } from "express";
import { logger } from "@archboard/diagnostics/logger";
import { frontendState, sourceState } from "@archboard/server-lifecycle/server-host";
import { mutationAdmission } from "@/server/archboard/lib/server-owners";
import { serverPhase } from "@/server/archboard/lib/server-startup";
import { moduleDir } from "@/server/archboard/lib/module-paths";
import { clients } from "@/server/archboard/lib/pane-registry";
import { openingVault } from "@archboard/workspace/repository-listing";

/**
 * Serve the frontend's page.
 * @param _req The request.
 * @param res Its response.
 */
function frontendRoute(_req: Request, res: Response): void {
	const htmlFile = path.join(moduleDir, "../dist/frontend/index.html");
	res.sendFile(htmlFile, (err) => {
		if (err) {
			logger.error("Error serving frontend:", err);
			res.status(404).send('Frontend not found. Please run "bun run build" first.');
		}
	});
}

/**
 * The health check: identity for `stop`, what the process holds, and whether
 * it is running the source on disk.
 * @param _req The request.
 * @param res Its response.
 */
function healthRoute(_req: Request, res: Response): void {
	res.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		websocket_clients: clients.size,
		// Identity for `stop`: it must only ever signal a process that both
		// identifies as this service AND self-reports its pid — never a pid
		// from a stale pidfile or an unrelated app squatting on the port.
		service: "archboard-server",
		pid: process.pid,
		application: {
			phase: serverPhase(),
			acceptingWrites: mutationAdmission.accepting(),
			activeWrites: mutationAdmission.active(),
			activeMutations: mutationAdmission.activeMutations().map((entry) => ({
				name: entry.name,
				kind: entry.kind,
				activeMs: Math.max(0, Date.now() - entry.startedAt),
			})),
		},
		// Whether this process is running the source that is on disk now, and
		// which build the frontend has been rebuilt to. A long-lived process has no
		// symptom of its own for either, so it has to be asked (TASK-056).
		source: sourceState(),
		frontendBuild: frontendState(null).current,
	});
}

/**
 * The sync status: memory and client count.
 * @param _req The request.
 * @param res Its response.
 */
function syncStatusRoute(_req: Request, res: Response): void {
	res.json({
		success: true,
		timestamp: new Date().toISOString(),
		memoryUsage: {
			heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
			heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
		},
		websocketClients: clients.size,
	});
}

/**
 * The vault a page opens in when its address names no repository, or null when no repository
 * with a vault is known. The browser names the vault it opens in on every call, as every other
 * caller does (ADR 0049), and this is the one route it calls without one, because it is how it
 * learns one.
 * @param _req The request.
 * @param res Its response.
 */
function servedVaultRoute(_req: Request, res: Response): void {
	res.json({ success: true, vault: openingVault() });
}

/**
 * Answer an error no route handled.
 * @param err The error.
 * @param _req The request.
 * @param res Its response.
 * @param _next Unused; Express needs the arity to treat this as error middleware.
 */
function unhandledErrorRoute(err: Error, _req: Request, res: Response, _next: NextFunction): void {
	logger.error("Unhandled error:", err);
	if (res.headersSent || res.destroyed) {
		return;
	}
	res.status(500).json({ success: false, error: "Internal server error" });
}

/**
 * Mount the frontend page, the health, sync status and served-vault routes, and the
 * error handler that must come last.
 * @param app The application to mount on.
 */
function mountServiceRoutes(app: Express): void {
	app.get("/", frontendRoute);
	app.get("/health", healthRoute);
	app.get("/api/sync/status", syncStatusRoute);
	app.get("/api/served-vault", servedVaultRoute);
	app.use(unhandledErrorRoute);
}

export { mountServiceRoutes };
