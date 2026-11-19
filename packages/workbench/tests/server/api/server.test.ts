// The workbench as the server runs it, crossed where the server crosses it: the routes it mounts on
// an Express application, a pane socket it accepts on a loopback socket server, and its start and
// stop. The model store's watch and the Codex application are stand-ins, so what is seen is which
// vaults the agent activity follows and how often the application is shut down.

import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";

const watched = new Set<string>();
const store = await import("@archboard/model-store");
await mock.module("@archboard/model-store", () => ({
	...store,
	/**
	 * Record which vault the agent activity follows, for as long as it does.
	 * @param vault The vault.
	 * @returns The function that stops following it.
	 */
	watchArchitectureModel: (vault: string) => {
		watched.add(vault);
		return () => watched.delete(vault);
	},
}));

let shutdowns = 0;
const shutdownFailure = new Error("The Codex workbench did not shut down.");
const voice = await import("@archboard/codex-realtime-voice/server");
await mock.module("@archboard/codex-realtime-voice/server", () => ({
	...voice,
	/**
	 * A Codex application that starts at once and fails every shutdown.
	 * @returns The application.
	 */
	createVoiceAgent: () => ({
		start: () => Promise.resolve(),
		shutdown: () => {
			shutdowns += 1;
			return Promise.reject(shutdownFailure);
		},
	}),
}));
const production = await import("#server/workbench-host/services/production.ts");
await mock.module("#server/workbench-host/services/production.ts", () => ({
	...production,
	/**
	 * No Codex executable and no storage: the stand-in application takes no options.
	 * @returns No options.
	 */
	createServerVoiceAgentOptions: () => ({}),
}));

const {
	acceptPaneSocket,
	closeBrowserOwners,
	mountWorkbenchRoutes,
	prepareWorkbench,
	stopWorkbench,
} = await import("#server/api/server.ts");

const scratch = mkdtempSync(join(tmpdir(), "archboard-workbench-server-"));
const registry = process.env["ARCHBOARD_REPOS"];
let http: Server;
let sockets: WebSocketServer;
let base = "";

/**
 * A vault in the layout the server serves, made once.
 * @param name The directory that holds it.
 * @returns The vault.
 */
function vaultOf(name: string): string {
	const vault = join(scratch, name, ".archboard", "vault");
	mkdirSync(vault, { recursive: true });
	return vault;
}

beforeAll(async () => {
	process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
	const app = express();
	app.use(express.json());
	mountWorkbenchRoutes(app, {
		runMutation: (route) => (req: Request, res: Response, next: NextFunction) => {
			route(req, res).catch(next);
		},
		refusalStatus: () => 409,
	});
	// The server's own model and history routes, which it mounts after the workbench's.
	app.post("/api/architecture/module", (_req, res) => {
		res.json({ success: true });
	});
	app.get(["/api/architecture/model", "/api/architecture/history"], (_req, res) => {
		res.json({ success: true });
	});
	http = createServer(app);
	sockets = new WebSocketServer({ server: http });
	sockets.on("connection", (ws, req) => {
		const vault = new URL(req.url ?? "/", "http://localhost").searchParams.get("vault") ?? "";
		void acceptPaneSocket(ws, req, vault);
	});
	await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
	const bound = http.address();
	base = typeof bound === "object" && bound !== null ? `127.0.0.1:${bound.port}` : "";
});

afterAll(async () => {
	await closeBrowserOwners(sockets.clients);
	sockets.close();
	await new Promise((resolve) => http.close(resolve));
	if (registry === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = registry;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Open a pane's socket in a vault, as a browser does, and hear which model it is on.
 * @param vault The vault.
 */
async function openPane(vault: string): Promise<void> {
	const pane = new WebSocket(`ws://${base}/?vault=${encodeURIComponent(vault)}`);
	await new Promise((resolve, reject) => {
		pane.once("message", resolve);
		pane.once("error", reject);
	});
}

/**
 * Call a route in a vault.
 * @param method The method.
 * @param route The route.
 * @param vault The vault the call names.
 */
async function call(method: "GET" | "POST", route: string, vault: string): Promise<void> {
	await fetch(`http://${base}${route}?vault=${encodeURIComponent(vault)}`, {
		method,
		...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: "{}" } : {}),
	});
}

test("the model, history and explanation routes count the same writes as before", async () => {
	const held = vaultOf("held");
	await openPane(held);
	const edited = vaultOf("edited");
	const explained = vaultOf("explained");
	await call("POST", "/api/architecture/module", edited);
	await call("POST", "/api/architecture/explanations", explained);
	await call("GET", "/api/architecture/model", vaultOf("read"));
	await call("GET", "/api/architecture/history", vaultOf("history"));
	await call("GET", "/api/architecture/explanations", vaultOf("asked"));
	await call("POST", "/api/panes", vaultOf("reported"));
	// A write under /api/architecture, whichever route answers it, shows its vault's work; a read
	// and a write elsewhere do not.
	expect([...watched].toSorted()).toEqual([edited, explained, held].toSorted());
});

test("overlapping stops share one failing shutdown, and each generation stops once", async () => {
	await prepareWorkbench(new AbortController().signal);
	const stops = await Promise.allSettled([stopWorkbench(), stopWorkbench()]);
	expect(stops).toEqual([
		{ status: "rejected", reason: shutdownFailure },
		{ status: "rejected", reason: shutdownFailure },
	]);
	// A forced stop of the same generation is the same stop.
	await expect(stopWorkbench()).rejects.toBe(shutdownFailure);
	expect(shutdowns).toBe(1);
	// The activity was disposed before the shutdown, so the pane's vault is followed no more.
	expect(watched.size).toBe(0);

	await prepareWorkbench(new AbortController().signal);
	await expect(stopWorkbench()).rejects.toBe(shutdownFailure);
	expect(shutdowns).toBe(2);
});
