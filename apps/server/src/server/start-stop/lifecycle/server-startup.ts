import { closeLogger, forceCloseLogger, logger } from "@archboard/diagnostics/logger";
import { startTelemetrySender } from "@archboard/telemetry/sender";
import {
	listenAddress,
	logHttpServerError,
	loopbackRefusal,
	releaseServerPid,
	reportStartupEnd,
} from "@archboard/server-lifecycle/server-process";
import { errorMessage } from "@archboard/diagnostics/thrown-error";
import { durationMs } from "@archboard/timing";
import {
	ServerApplicationBusyError,
	createServerApplicationLifetime,
} from "#server/start-stop/lifecycle/application-lifetime.ts";
import { server } from "#server/http/listener/wiring/server-app.ts";
import { closeBrowserOwners, prepareWorkbench, stopWorkbench } from "@archboard/workbench/server";
import { checkoutWork, mutationAdmission } from "#server/wiring/server-owners.ts";
import {
	closeHttpServer,
	listen,
	stopListening,
	type HttpOwnership,
} from "#server/start-stop/lifecycle/server-resources.ts";
import { forgetModelMemory } from "@archboard/model-store";
import { serverStartupFailureMessage } from "#server/start-stop/lifecycle/startup-error.ts";
import {
	acceptedSockets,
	closeWebSocketServer,
	startWebSocketServer,
} from "#server/panes/connections/sockets/websocket-connection.ts";

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
	const message = `Archboard server shutdown refused or failed: ${errorMessage(error)}`;
	if (isRecoverableServerStopError(error)) {
		logger().error(message);
	} else {
		process.stderr.write(message + "\n");
		process.exitCode = 1;
	}
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
 * runtime error stops it and fails the process, exit releases the pidfile.
 * @param lifetimeOf How to reach the lifetime once it exists.
 * @returns The handlers.
 */
function processHandlers(lifetimeOf: () => ServerLifetime): ProcessHandlers {
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
			reportStartupEnd({ cleanupProven: lifetimeOf().cleanupProven(), message: null });
		}
	};
	/**
	 * Begin shutting down on a signal.
	 * @param signal The signal.
	 */
	const shutdown = (signal: NodeJS.Signals): void => {
		logger().info(`Received ${signal}, shutting down Archboard server`);
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
		/** Release the pidfile this process recorded, as the process exits. */
		onExit: () => {
			releaseServerPid(listenAddress().port);
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

/** Stops the telemetry sender that the lifetime started. */
let stopTelemetrySender = (): void => {
	// Nothing runs until the lifetime starts the sender.
};

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
			logger().error(serverStartupFailureMessage(error));
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
				logger().warn(`Archboard server lifetime forcing stop: ${resource}`);
			} else {
				logger().debug(`Archboard server lifetime ${action}: ${resource}`);
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
				/** Nothing to bring up: a model is read when somebody asks for one. */
				start: () => {
					// The vault is read on demand; this process holds nothing of it.
				},
				/** Forget every model this process read. */
				stop: () => {
					forgetModelMemory();
				},
			},
			{
				name: "workbench",
				start: prepareWorkbench,
				stop: stopWorkbench,
				forceStop: stopWorkbench,
			},
			{
				name: "telemetry-sender",
				/** Send the usage records of this installation every few minutes (ADR 0079). */
				start: () => {
					stopTelemetrySender = startTelemetrySender();
				},
				/** Stop sending. A round under way finishes on its own or is dropped with the process. */
				stop: () => {
					stopTelemetrySender();
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
				stopGraceMs: durationMs("serverLifecycle.httpStopGrace"),
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
					logger().info(`WebSocket server running on ${listenAddress().wsUrl}`);
				},
				stop: closeWebSocketServer,
			},
			{
				name: "browser-and-pending-operations",
				/**
				 * Close every browser owner, terminating every socket the server accepted.
				 * @returns Resolves once they have closed.
				 */
				stop: () => closeBrowserOwners(acceptedSockets()),
			},
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
 * Start the server: refuse beside a duplicate listener, then run every resource
 * through the lifetime. A server needs no vault, because every call names its own (ADR 0049).
 */
async function startServer(): Promise<void> {
	const refusal = await loopbackRefusal();
	if (refusal !== null) {
		// Nothing has been acquired yet, so there is nothing whose cleanup could have failed: a
		// startup that ends before the lifetime exists proves its own cleanup.
		reportStartupEnd({ cleanupProven: true, message: refusal });
		throw new Error(refusal);
	}
	const http: HttpOwnership = {
		phase: "idle",
		startPromise: null,
		errorListener: null,
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
	lifetime = buildLifetime(http, processHandlers(lifetimeOf));
	serverLifetime = lifetime;
	try {
		await lifetime.start();
	} catch (error) {
		reportStartupEnd({
			cleanupProven: lifetime.cleanupProven(),
			message: serverStartupFailureMessage(error),
		});
		throw error;
	}
}

export { serverPhase, startServer };
