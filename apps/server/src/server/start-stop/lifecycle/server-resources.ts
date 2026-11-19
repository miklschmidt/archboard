import { logger } from "@archboard/diagnostics/logger";
import { recordServerPid, releaseServerPid } from "@archboard/server-lifecycle/server-process";
import {
	listenAddress,
	logHttpServerError,
} from "#server/http/listener/services/listener-address.ts";
import { server } from "#server/http/listener/wiring/server-app.ts";

/** The HTTP listener's own phase, distinct from the lifetime's. */
type HttpPhase = "idle" | "starting" | "running" | "failed" | "stopping";

/** What the HTTP resource owns while the server runs. */
interface HttpOwnership {
	phase: HttpPhase;
	startPromise: Promise<void> | null;
	errorListener: ((error: NodeJS.ErrnoException) => void) | null;
	closePromise: Promise<void> | null;
}

/**
 * Close the HTTP server once, sharing the close between callers.
 * @param http The HTTP ownership.
 * @returns Resolves when the server has closed.
 */
function closeHttpServer(http: HttpOwnership): Promise<void> {
	if (http.closePromise !== null) {
		return http.closePromise;
	}
	if (!server.listening) {
		return Promise.resolve();
	}
	http.closePromise = new Promise((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	return http.closePromise;
}

/**
 * Start listening, resolving once the port is bound and the pidfile written,
 * and failing on a bind error, an early close or cancellation.
 * @param http The HTTP ownership.
 * @param signal Cancels the start.
 * @param onRuntimeError What to do with a server error after startup.
 * @returns Resolves when listening.
 */
function listen(
	http: HttpOwnership,
	signal: AbortSignal,
	onRuntimeError: (error: NodeJS.ErrnoException) => void,
): Promise<void> {
	const cancellation = new Error("Archboard server HTTP startup was canceled.");
	const listenController = new AbortController();
	return new Promise<void>((resolve, reject) => {
		http.phase = "starting";
		let settled = false;
		/** Abort the listen with the start signal's reason. */
		const cancelListen = (): void => {
			listenController.abort(signal.reason);
		};
		/** A close before startup completed fails the start. */
		const onClose = (): void => {
			settleStart(
				signal.aborted
					? cancellation
					: new Error("Archboard HTTP server closed before startup completed."),
			);
		};
		/**
		 * Settle the start once, detaching the startup-only listeners.
		 * @param error The failure, or undefined on success.
		 */
		const settleStart = (error?: Error): void => {
			if (settled) {
				return;
			}
			settled = true;
			signal.removeEventListener("abort", cancelListen);
			server.off("close", onClose);
			if (error) {
				http.phase = "failed";
				reject(error);
			} else {
				resolve();
			}
		};
		/**
		 * Route a server error by phase: a startup error fails the start, a
		 * runtime error stops the server.
		 * @param error The failure.
		 */
		http.errorListener = (error) => {
			if (http.phase === "starting") {
				logHttpServerError(error);
				settleStart(error);
			} else if (http.phase === "running") {
				onRuntimeError(error);
			}
		};
		server.on("error", http.errorListener);
		server.once("close", onClose);
		signal.addEventListener("abort", cancelListen, { once: true });
		if (signal.aborted) {
			cancelListen();
			settleStart(cancellation);
			return;
		}
		try {
			const { host, port } = listenAddress();
			server.listen({ port, host, signal: listenController.signal }, () => {
				if (settled || signal.aborted) {
					return;
				}
				http.phase = "running";
				logger().info(`POC server running on ${listenAddress().httpUrl}`);
				recordServerPid(port);
				settleStart();
			});
		} catch (error) {
			settleStart(error instanceof Error ? error : new Error(String(error)));
		}
	});
}

/**
 * Stop listening: close the server, wait out a start still in flight, detach
 * the error listener and release the pidfile this process recorded.
 * @param http The HTTP ownership.
 */
async function stopListening(http: HttpOwnership): Promise<void> {
	if (http.phase === "running") {
		http.phase = "stopping";
	}
	await closeHttpServer(http);
	if (http.startPromise !== null) {
		await http.startPromise.catch(() => undefined);
	}
	http.phase = "stopping";
	if (http.errorListener !== null) {
		server.off("error", http.errorListener);
		http.errorListener = null;
	}
	releaseServerPid(listenAddress().port);
	await closeHttpServer(http);
}

export { closeHttpServer, listen, stopListening };
export type { HttpOwnership };
