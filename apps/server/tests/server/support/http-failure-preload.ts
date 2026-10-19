// A preload of the real server entry that injects one HTTP failure through the factory seam of
// the server's HTTP listener (`wiring/http/http-server.ts`). The test runs it with
// `bun --preload` before `apps/server/src/server.ts`, so the entry that runs is the one that ships.
//
// ARCHBOARD_TEST_HTTP_FAILURE says which failure:
// - "bind-race": another listener takes the port between the lifetime's check and its bind.
// - "runtime-error": SIGUSR2 raises an HTTP error on the running server.
// - "delayed-listen-cancel": the listen is held until startup is cancelled. The outcome file
//   says at exit whether the cancelled listen had settled (`ARCHBOARD_TEST_HTTP_OUTCOME_PATH`),
//   and the pending file says that the listen was held (`ARCHBOARD_TEST_HTTP_PENDING_PATH`).
import { mock } from "bun:test";
import { writeFileSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";

type Listen = (...args: unknown[]) => unknown;
type ListenOptions = { port?: number; host?: string; signal?: AbortSignal };

const mode = process.env["ARCHBOARD_TEST_HTTP_FAILURE"];
const pendingPath = process.env["ARCHBOARD_TEST_HTTP_PENDING_PATH"];
const outcomePath = process.env["ARCHBOARD_TEST_HTTP_OUTCOME_PATH"];
const httpFactoryModule = import.meta.resolve("#server/wiring/http/http-server.ts");
let ownedServer: Server | undefined;
let pending = false;

/**
 * Make the server's listen wait for a rival that takes the port first.
 * @param owned The server the application listens through.
 */
function raceBind(owned: Server): void {
	const realListen = owned.listen.bind(owned) as Listen;
	owned.listen = ((...args: unknown[]) => {
		const options = args[0] as ListenOptions | number;
		const port = typeof options === "object" ? options.port : options;
		const host = (typeof options === "object" ? options.host : args[1]) as string | undefined;
		const rival = createServer();
		rival.listen(port, host, () => {
			owned.once("error", () => rival.close());
			realListen(...args);
		});
		return owned;
	}) as typeof owned.listen;
}

/**
 * Hold the server's listen until startup is cancelled, and say so.
 * @param owned The server the application listens through.
 */
function holdListen(owned: Server): void {
	owned.listen = ((...args: unknown[]) => {
		const options = args[0] as ListenOptions | number;
		pending = true;
		writeFileSync(pendingPath!, "pending");
		if (typeof options === "object" && options.signal) {
			options.signal.addEventListener(
				"abort",
				() => {
					pending = false;
					owned.emit("close");
				},
				{ once: true },
			);
		}
		return owned;
	}) as typeof owned.listen;
}

mock.module(httpFactoryModule, () => ({
	createServerHttpServer: (handler: RequestListener) => {
		const owned = createServer(handler);
		ownedServer = owned;
		if (mode === "bind-race") {
			raceBind(owned);
		} else if (mode === "delayed-listen-cancel") {
			holdListen(owned);
		}
		return owned;
	},
}));

if (mode === "runtime-error") {
	process.on("SIGUSR2", () =>
		ownedServer?.emit(
			"error",
			Object.assign(new Error("injected runtime HTTP failure"), { code: "EIO" }),
		),
	);
}
if (mode === "delayed-listen-cancel") {
	process.on("exit", () => {
		writeFileSync(outcomePath!, pending ? "listen-still-pending" : "listen-cancelled");
	});
}
