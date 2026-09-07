import logger, { closeLogger, forceCloseLogger } from "@/runtime/engine/logger";
import { heldBoardKeys } from "@/runtime/engine/board-hold";
import { ARCHBOARD_VAULT, noVaultMessage } from "@/runtime/engine/config";
import { removePidFile } from "@/runtime/engine/pidfile";
import { CANVAS_HTTP_STOP_GRACE_MS } from "@/shared/timing/timing";
import {
	canvasStartupTerminalRecord,
	writeCanvasStartupProtocolRecord,
} from "@/shared/canvas-startup-terminal";
import {
	CanvasApplicationBusyError,
	CanvasApplicationHeldError,
	createCanvasApplicationLifetime,
} from "@/server/canvas/lib/application-lifetime";
import { server } from "@/server/canvas/lib/canvas-app";
import { prepareCodexWorkbench, stopCodexWorkbench } from "@/server/canvas/lib/canvas-codex-host";
import { boardRenderer, checkoutWork, mutationAdmission } from "@/server/canvas/lib/canvas-owners";
import {
	adoptScratchBoard,
	closeBrowserOwners,
	closeHttpServer,
	forgetEngineState,
	listen,
	stopListening,
	type HttpOwnership,
} from "@/server/canvas/lib/canvas-resources";
import {
	findExistingLoopbackListener,
	formatHostForUrl,
	HOST,
	isLoopbackGuardedHost,
	logHttpServerError,
	PORT,
} from "@/server/canvas/lib/listener-address";
import { messageOf } from "@/server/canvas/lib/request-board";
import { canvasStartupFailureMessage } from "@/server/canvas/lib/startup-error";
import {
	closeWebSocketServer,
	startWebSocketServer,
} from "@/server/canvas/lib/websocket-connection";

type CanvasLifetime = ReturnType<typeof createCanvasApplicationLifetime>;

let canvasLifetime: CanvasLifetime | null = null;

/**
 * Which phase the canvas lifetime is in, for the health report.
 * @returns The phase, or "idle" before the lifetime exists.
 */
function canvasPhase(): ReturnType<CanvasLifetime["phase"]> | "idle" {
	return canvasLifetime?.phase() ?? "idle";
}

/**
 * Whether a stop failure is one the canvas recovers from by staying up.
 * @param error The failure.
 * @returns True for a held or busy refusal.
 */
function isRecoverableCanvasStopError(error: unknown): boolean {
	return error instanceof CanvasApplicationHeldError || error instanceof CanvasApplicationBusyError;
}

/**
 * Report a stop that was refused or failed: a recoverable refusal is logged,
 * anything else reaches stderr and fails the process.
 * @param error The failure.
 */
function reportCanvasStopError(error: unknown): void {
	const message = `Canvas shutdown refused or failed: ${messageOf(error)}`;
	if (isRecoverableCanvasStopError(error)) {
		logger.error(message);
	} else {
		process.stderr.write(message + "\n");
		process.exitCode = 1;
	}
}

/**
 * Refuse to start without a vault (ADR 0015). Every board is a note, so a
 * canvas without a vault has nowhere to put anything, and the failure it used
 * to produce came later and cost more: the canvas opened, somebody drew on it,
 * and the drawing turned out to have been nowhere all along.
 *
 * Straight to stderr as well as the log, because a first run is exactly the
 * run whose LOG_LEVEL nobody has set, and the whole value of this is that the
 * person who started it reads it.
 * @returns The refusal, or null when a vault is configured.
 */
function vaultRefusal(): string | null {
	if (ARCHBOARD_VAULT) {
		return null;
	}
	process.stderr.write(noVaultMessage() + "\n");
	logger.error("Refusing to start canvas server: no vault (ARCHBOARD_VAULT is unset).");
	return noVaultMessage();
}

/**
 * Refuse to start beside a canvas already listening on the other loopback
 * address, which would split state between an IPv4 and an IPv6 server.
 * @returns The refusal, or null when the port is free on both.
 */
async function loopbackRefusal(): Promise<string | null> {
	if (!isLoopbackGuardedHost()) {
		return null;
	}
	const existingHost = await findExistingLoopbackListener(PORT);
	if (!existingHost) {
		return null;
	}
	const message =
		`Refusing to start canvas server on ${formatHostForUrl(HOST)}:${PORT}: ` +
		`${formatHostForUrl(existingHost)}:${PORT} is already listening. ` +
		"This prevents duplicate IPv4/IPv6 canvas servers from splitting state.";
	logger.error(message);
	return message;
}

/** Reports the startup protocol's terminal record exactly once. */
interface StartupTerminal {
	report: (message?: string | null) => void;
}

/**
 * The terminal reporter for one startup, which says whether cleanup was
 * proven by the lifetime once one exists.
 * @param cleanupProven How to ask whether cleanup was proven.
 * @returns The reporter.
 */
function startupTerminal(cleanupProven: () => boolean): StartupTerminal {
	let reported = false;
	return {
		/**
		 * Write the terminal record, the first time only.
		 * @param message Why startup ended, or null for an ordinary stop.
		 */
		report: (message = null) => {
			if (reported) {
				return;
			}
			reported = true;
			writeCanvasStartupProtocolRecord(
				canvasStartupTerminalRecord({
					canvasPid: process.pid,
					cleanupProven: cleanupProven(),
					message,
				}),
			);
		},
	};
}

/** The signal and error handling around one running lifetime. */
interface ProcessHandlers {
	onTerm: () => void;
	onInterrupt: () => void;
	onExit: () => void;
	onRuntimeError: (error: NodeJS.ErrnoException) => void;
}

/**
 * The process-level handlers for one lifetime: signals stop it, an HTTP
 * runtime error stops it and fails the process, exit removes the pidfile.
 * @param lifetimeOf How to reach the lifetime once it exists.
 * @param http The HTTP ownership.
 * @param terminal The startup terminal reporter.
 * @returns The handlers.
 */
function processHandlers(
	lifetimeOf: () => CanvasLifetime,
	http: HttpOwnership,
	terminal: StartupTerminal,
): ProcessHandlers {
	let runtimeServerStop: Promise<void> | null = null;
	/** Stop the canvas after an HTTP runtime error, failing the process. */
	const stopCanvasAfterHttpError = async (): Promise<void> => {
		const lifetime = lifetimeOf();
		try {
			await lifetime.stop("server-error");
			process.exitCode = 1;
		} catch (error) {
			reportCanvasStopError(error);
		} finally {
			if (lifetime.phase() === "running") {
				runtimeServerStop = null;
			}
		}
	};
	/**
	 * Stop the canvas on a signal, exiting cleanly unless a stop failed.
	 * @param signal The signal.
	 */
	const stopCanvasAfterSignal = async (signal: NodeJS.Signals): Promise<void> => {
		try {
			await lifetimeOf().stop(signal);
			process.exitCode ??= 0;
		} catch (error) {
			reportCanvasStopError(error);
		} finally {
			terminal.report();
		}
	};
	/**
	 * Begin shutting down on a signal.
	 * @param signal The signal.
	 */
	const shutdown = (signal: NodeJS.Signals): void => {
		logger.info(`Received ${signal}, shutting down canvas server`);
		void stopCanvasAfterSignal(signal);
	};
	return {
		/** Stop on SIGTERM. */
		onTerm: () => {
			shutdown("SIGTERM");
		},
		/** Stop on SIGINT. */
		onInterrupt: () => {
			shutdown("SIGINT");
		},
		/** Remove the pidfile this process wrote, as the process exits. */
		onExit: () => {
			if (http.ownsPidFile) {
				removePidFile(PORT);
			}
		},
		/**
		 * Stop the canvas after an HTTP error while it was running, once.
		 * @param error The failure.
		 */
		onRuntimeError: (error) => {
			logHttpServerError(error);
			if (runtimeServerStop !== null) {
				return;
			}
			runtimeServerStop = stopCanvasAfterHttpError();
		},
	};
}

/**
 * Build the lifetime: every resource the canvas owns, in start order, with
 * how each stops.
 * @param http The HTTP ownership.
 * @param handlers The process handlers.
 * @returns The lifetime.
 */
function buildLifetime(http: HttpOwnership, handlers: ProcessHandlers): CanvasLifetime {
	return createCanvasApplicationLifetime({
		heldBoards: heldBoardKeys,
		/** Stop admitting work and drain what is running. */
		quiesce: async () => {
			checkoutWork.quiesce();
			await mutationAdmission.quiesce();
		},
		/** Admit work again after a refused stop. */
		resume: () => {
			checkoutWork.resume();
			mutationAdmission.resume();
		},
		/**
		 * Log a lifetime transition. The logger cannot report its own terminal
		 * transition after its writable stream has ended.
		 * @param transition What happened to which resource.
		 * @param transition.action What happened to the resource.
		 * @param transition.resource The resource it happened to.
		 */
		observe: ({ action, resource }) => {
			if (resource === null || resource === "logger-transports") {
				return;
			}
			if (action === "force") {
				logger.warn(`Canvas lifetime forcing stop: ${resource}`);
			} else {
				logger.debug(`Canvas lifetime ${action}: ${resource}`);
			}
		},
		resources: [
			{
				name: "logger-transports",
				/**
				 * Flush and close the log transports.
				 * @returns Resolves once the transports have finished.
				 */
				stop: () => closeLogger(),
				/** Close the log transports without waiting. */
				forceStop: () => {
					forceCloseLogger();
				},
			},
			{
				name: "process-signals",
				/** Listen for the signals that stop the canvas. */
				start: () => {
					process.on("SIGTERM", handlers.onTerm);
					process.on("SIGINT", handlers.onInterrupt);
					process.on("exit", handlers.onExit);
				},
				/** Stop listening for them. */
				stop: () => {
					process.off("SIGTERM", handlers.onTerm);
					process.off("SIGINT", handlers.onInterrupt);
					process.off("exit", handlers.onExit);
				},
			},
			{
				name: "engine-state",
				/** Pick the scratch board up. */
				start: () => {
					adoptScratchBoard();
				},
				/** Forget every engine-level record. */
				stop: () => {
					forgetEngineState();
				},
			},
			{
				name: "codex-workbench",
				start: prepareCodexWorkbench,
				stop: stopCodexWorkbench,
				forceStop: stopCodexWorkbench,
			},
			{
				name: "board-renderer",
				/**
				 * Start the renderer.
				 * @returns Resolves once the renderer is running.
				 */
				start: () => boardRenderer.start(),
				/** Stop the renderer. */
				stop: async () => {
					await boardRenderer.stop();
				},
				/** Stop the renderer without waiting. */
				forceStop: async () => {
					await boardRenderer.forceStop();
				},
			},
			{
				name: "http-server",
				/**
				 * Bind the port.
				 * @param signal Cancels the start.
				 * @returns Resolves when listening.
				 */
				start: (signal) => {
					http.startPromise = listen(http, signal, handlers.onRuntimeError);
					return http.startPromise;
				},
				/**
				 * Stop listening.
				 * @returns Resolves once the port is released.
				 */
				stop: () => stopListening(http),
				stopGraceMs: CANVAS_HTTP_STOP_GRACE_MS,
				/** Drop every connection and close. */
				forceStop: async () => {
					server.closeAllConnections();
					await closeHttpServer(http);
				},
			},
			{
				name: "websocket-server",
				/** Accept panes. */
				start: () => {
					startWebSocketServer();
					logger.info(`WebSocket server running on ws://${formatHostForUrl(HOST)}:${PORT}`);
				},
				stop: closeWebSocketServer,
			},
			{ name: "browser-and-pending-operations", stop: closeBrowserOwners },
			{
				name: "checkout-snapshot-work",
				/** Admit checkout snapshots. */
				start: () => {
					checkoutWork.resume();
				},
				stop: checkoutWork.stop,
			},
		],
	});
}

/**
 * Nothing has been acquired yet, so there is nothing whose cleanup could have
 * failed: a startup that ends before the lifetime exists proves its own cleanup.
 * @returns Always true.
 */
function cleanupProvenBeforeResourceAcquisition(): boolean {
	return true;
}

/**
 * Start the canvas: refuse without a vault or beside a duplicate listener,
 * then run every resource through the lifetime.
 */
async function startServer(): Promise<void> {
	let cleanupProven = cleanupProvenBeforeResourceAcquisition;
	const terminal = startupTerminal(() => cleanupProven());
	const refusal = vaultRefusal() ?? (await loopbackRefusal());
	if (refusal !== null) {
		terminal.report(refusal);
		throw new Error(refusal);
	}
	// Only the process that actually wrote the pidfile may remove it —
	// a concurrent-start loser exiting on EADDRINUSE must not delete the
	// winner's pidfile.
	const http: HttpOwnership = {
		phase: "idle",
		startPromise: null,
		errorListener: null,
		ownsPidFile: false,
		closePromise: null,
	};
	let lifetime: CanvasLifetime | null = null;
	/**
	 * The lifetime, which the handlers only ever reach once it exists.
	 * @returns The lifetime.
	 */
	const lifetimeOf = (): CanvasLifetime => {
		if (lifetime === null) {
			throw new Error("The canvas lifetime is not built yet.");
		}
		return lifetime;
	};
	lifetime = buildLifetime(http, processHandlers(lifetimeOf, http, terminal));
	canvasLifetime = lifetime;
	cleanupProven = lifetime.cleanupProven;
	try {
		await lifetime.start();
	} catch (error) {
		terminal.report(canvasStartupFailureMessage(error));
		throw error;
	}
}

export { canvasPhase, startServer };
