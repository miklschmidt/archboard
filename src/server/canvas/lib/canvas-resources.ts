import { logger } from "@/runtime/engine/logger";
import {
	forgetLockAnnouncements,
	onBoardLockChanged,
	onBoardSweep,
	watchBoardLocks,
} from "@/runtime/engine/board-lock";
import { forgetDoing } from "@/runtime/engine/board-doing";
import { removePidFile, writePidFile } from "@/runtime/engine/pidfile";
import { server } from "@/server/canvas/lib/canvas-app";
import { forgetSemanticPaneContexts } from "@/server/canvas/lib/semantic-pane-context";
import { forgetSemanticBoardFiles } from "@/server/canvas/lib/semantic-disk-watch";
import { codexWiring } from "@/server/canvas/lib/canvas-codex-host";
import {
	formatHostForUrl,
	HOST,
	logHttpServerError,
	PORT,
} from "@/server/canvas/lib/listener-address";
import {
	acceptedSockets,
	clientIds,
	codexSocketInstances,
	forgetDisplay,
	rejectPendingLayouts,
} from "@/server/canvas/lib/pane-registry";
import { messageOf } from "@/server/canvas/lib/request-board";

/**
 * Forget every engine-level announcement, watch and record this process holds.
 */
function forgetEngineState(): void {
	watchBoardLocks(null);
	onBoardLockChanged(null);
	forgetSemanticBoardFiles();
	onBoardSweep(null);
	forgetLockAnnouncements();
	forgetDoing();
	forgetSemanticPaneContexts();
}

/** Collects distinct cleanup failures, flattening aggregates, so one report names them all. */
class CleanupFailures {
	readonly failures: unknown[] = [];
	private readonly retained = new Set<unknown>();

	/**
	 * Retain one failure, or each failure inside an aggregate.
	 * @param error The failure.
	 */
	retain(error: unknown): void {
		if (error instanceof AggregateError) {
			for (const nested of error.errors) {
				this.retain(nested);
			}
			return;
		}
		if (this.retained.has(error)) {
			return;
		}
		this.retained.add(error);
		this.failures.push(error);
	}

	/**
	 * Throw one aggregate naming every retained failure, if there were any.
	 */
	throwIfAny(): void {
		if (this.failures.length === 0) {
			return;
		}
		const detail = this.failures.map((error) => messageOf(error)).join("; ");
		throw new AggregateError(this.failures, `Browser cleanup failed: ${detail}`);
	}
}

/**
 * Close every Codex browser connection the workbench still holds.
 * @param failures Where to retain what fails.
 */
async function closeCodexBrowsers(failures: CleanupFailures): Promise<void> {
	const closeBrowser = codexWiring.codex.closeBrowser;
	if (closeBrowser === null) {
		return;
	}
	const settled = await Promise.allSettled(
		Array.from(codexSocketInstances, ([socket, instance]) => {
			const browserId = clientIds.get(socket);
			return browserId ? closeBrowser(instance, browserId) : Promise.resolve();
		}),
	);
	for (const result of settled) {
		if (result.status === "rejected") {
			failures.retain(result.reason);
		}
	}
}

/**
 * Tear down every browser-facing owner: sockets, Codex browsers, pending
 * layout requests and the presentation owner, then forget the display.
 */
export async function closeBrowserOwners(): Promise<void> {
	const failures = new CleanupFailures();
	for (const socket of acceptedSockets) {
		socket.terminate();
	}
	await closeCodexBrowsers(failures);
	try {
		await codexWiring.codex.drainBrowsers?.();
	} catch (error) {
		failures.retain(error);
	}
	rejectPendingLayouts();
	forgetDisplay();
	failures.throwIfAny();
}

/** The HTTP listener's own phase, distinct from the lifetime's. */
type HttpPhase = "idle" | "starting" | "running" | "failed" | "stopping";

/** What the HTTP resource owns while the canvas runs. */
interface HttpOwnership {
	phase: HttpPhase;
	startPromise: Promise<void> | null;
	errorListener: ((error: NodeJS.ErrnoException) => void) | null;
	ownsPidFile: boolean;
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
	const cancellation = new Error("Canvas HTTP startup was canceled.");
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
					: new Error("Canvas HTTP server closed before startup completed."),
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
		 * runtime error stops the canvas.
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
			server.listen({ port: PORT, host: HOST, signal: listenController.signal }, () => {
				if (settled || signal.aborted) {
					return;
				}
				http.phase = "running";
				logger.info(`POC server running on http://${formatHostForUrl(HOST)}:${PORT}`);
				writePidFile(PORT, process.pid);
				http.ownsPidFile = true;
				settleStart();
			});
		} catch (error) {
			settleStart(error instanceof Error ? error : new Error(String(error)));
		}
	});
}

/**
 * Stop listening: close the server, wait out a start still in flight, detach
 * the error listener and remove the pidfile this process wrote.
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
	if (http.ownsPidFile) {
		removePidFile(PORT);
		http.ownsPidFile = false;
	}
	await closeHttpServer(http);
}

export { closeHttpServer, forgetEngineState, listen, stopListening };
export type { HttpOwnership };
