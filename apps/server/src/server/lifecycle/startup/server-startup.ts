import { closeLogger, forceCloseLogger, logger } from "@archboard/diagnostics/logger";
import { removePidFile, reportStartupEnd } from "@archboard/server-lifecycle/server-host";
import { SERVER_LIFECYCLE_MS } from "@archboard/timing";
import {
	ServerApplicationBusyError,
	createServerApplicationLifetime,
} from "#server/lifecycle/lifetime/application-lifetime.ts";
import { server } from "#server/wiring/http/server-app.ts";
import { prepareCodexWorkbench, stopCodexWorkbench } from "@archboard/workbench/server";
import { checkoutWork, mutationAdmission } from "#server/wiring/owners/server-owners.ts";
import {
	closeBrowserOwners,
	closeHttpServer,
	forgetEngineState,
	listen,
	stopListening,
	type HttpOwnership,
} from "#server/lifecycle/resources/server-resources.ts";
import {
	findExistingLoopbackListener,
	formatHostForUrl,
	HOST,
	isLoopbackGuardedHost,
	logHttpServerError,
	PORT,
	messageOf,
} from "@archboard/workbench/host";
import { agentActivity } from "#server/wiring/owners/server-owners.ts";
import { unwatchRegistry, watchRegistry } from "#server/routes/repositories/repository-routes.ts";
import { serverStartupFailureMessage } from "#server/lifecycle/startup/startup-error.ts";
import {
	closeWebSocketServer,
	startWebSocketServer,
} from "#server/sockets/panes/websocket-connection.ts";

type ServerLifetime = ReturnType<typeof createServerApplicationLifetime>;

let serverLifetime: ServerLifetime | null = null;

/**
 * Which phase the server lifetime is in, for the health report.
 * @returns The phase, or "idle" before the lifetime exists.
 */
function serverPhase(): ReturnType<ServerLifetime["phase"]> | "idle" {
	return serverLifetime?.phase() ?? "idle";
}

/**
 * Whether a stop failure is one the server recovers from by staying up.
 * @param error The failure.
 * @returns True for a busy refusal.
 */
function isRecoverableServerStopError(error: unknown): boolean {
	return error instanceof ServerApplicationBusyError;
}

/**
 * Report a stop that was refused or failed: a recoverable refusal is logged,
 * anything else reaches stderr and fails the process.
 * @param error The failure.
 */
function reportServerStopError(error: unknown): void {
	const message = `Archboard server shutdown refused or failed: ${messageOf(error)}`;
	if (isRecoverableServerStopError(error)) {
		logger.error(message);
	} else {
		process.stderr.write(message + "\n");
		process.exitCode = 1;
	}
}

/**
 * Refuse to start beside a server already listening on the other loopback
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
		`Refusing to start Archboard server on ${formatHostForUrl(HOST)}:${PORT}: ` +
		`${formatHostForUrl(existingHost)}:${PORT} is already listening. ` +
		"This prevents duplicate IPv4/IPv6 Archboard servers from splitting state.";
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
			reportStartupEnd({ cleanupProven: cleanupProven(), message });
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
	lifetimeOf: () => ServerLifetime,
	http: HttpOwnership,
	terminal: StartupTerminal,
): ProcessHandlers {
	let runtimeServerStop: Promise<void> | null = null;
	/** Stop the server after an HTTP runtime error, failing the process. */
	const stopServerAfterHttpError = async (): Promise<void> => {
		const lifetime = lifetimeOf();
		try {
			await lifetime.stop("server-error");
			process.exitCode = 1;
		} catch (error) {
			reportServerStopError(error);
		} finally {
			if (lifetime.phase() === "running") {
				runtimeServerStop = null;
			}
		}
	};
	/**
	 * Stop the server on a signal, exiting cleanly unless a stop failed.
	 * @param signal The signal.
	 */
	const stopServerAfterSignal = async (signal: NodeJS.Signals): Promise<void> => {
		try {
			await lifetimeOf().stop(signal);
			process.exitCode ??= 0;
		} catch (error) {
			reportServerStopError(error);
		} finally {
			terminal.report();
		}
	};
	/**
	 * Begin shutting down on a signal.
	 * @param signal The signal.
	 */
	const shutdown = (signal: NodeJS.Signals): void => {
		logger.info(`Received ${signal}, shutting down Archboard server`);
		void stopServerAfterSignal(signal);
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
		 * Stop the server after an HTTP error while it was running, once.
		 * @param error The failure.
		 */
		onRuntimeError: (error) => {
			logHttpServerError(error);
			if (runtimeServerStop !== null) {
				return;
			}
			runtimeServerStop = stopServerAfterHttpError();
		},
	};
}

/**
 * Build the lifetime: every resource the server owns, in start order, with
 * how each stops.
 * @param http The HTTP ownership.
 * @param handlers The process handlers.
 * @returns The lifetime.
 */
function buildLifetime(http: HttpOwnership, handlers: ProcessHandlers): ServerLifetime {
	return createServerApplicationLifetime({
		/**
		 * Log the line the CLI prints from the startup protocol, before rollback
		 * closes the log, so the reason outlives the terminal that showed it.
		 * @param error What startup threw.
		 */
		onStartupFailure: (error) => {
			logger.error(serverStartupFailureMessage(error));
		},
		/** Stop admitting work and drain what is running. */
		quiesce: async () => {
			checkoutWork.quiesce();
			await mutationAdmission.quiesce();
		},
		/** Admit work again when a stop failed before teardown began. */
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
				logger.warn(`Archboard server lifetime forcing stop: ${resource}`);
			} else {
				logger.debug(`Archboard server lifetime ${action}: ${resource}`);
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
				/** Listen for the signals that stop the server. */
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
				/** Nothing to bring up: a board is read when somebody asks for one. */
				start: () => {
					// The vault is read on demand; this process holds nothing of it.
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
				name: "agent-activity",
				/** Stop the activity tracker with its owning receiver. */
				stop: () => {
					agentActivity.dispose();
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
				stopGraceMs: SERVER_LIFECYCLE_MS.httpStopGrace,
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
			{
				name: "registry-watch",
				start: watchRegistry,
				stop: unwatchRegistry,
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
 * Start the server: refuse beside a duplicate listener, then run every resource
 * through the lifetime. A server needs no vault, because every call names its own (ADR 0049).
 */
async function startServer(): Promise<void> {
	let cleanupProven = cleanupProvenBeforeResourceAcquisition;
	const terminal = startupTerminal(() => cleanupProven());
	const refusal = await loopbackRefusal();
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
	let lifetime: ServerLifetime | null = null;
	/**
	 * The lifetime, which the handlers only ever reach once it exists.
	 * @returns The lifetime.
	 */
	const lifetimeOf = (): ServerLifetime => {
		if (lifetime === null) {
			throw new Error("The server lifetime is not built yet.");
		}
		return lifetime;
	};
	lifetime = buildLifetime(http, processHandlers(lifetimeOf, http, terminal));
	serverLifetime = lifetime;
	cleanupProven = lifetime.cleanupProven;
	try {
		await lifetime.start();
	} catch (error) {
		terminal.report(serverStartupFailureMessage(error));
		throw error;
	}
}

export { serverPhase, startServer };
