import logger, { closeLogger, forceCloseLogger } from "@/runtime/engine/logger";
import { selectionState, snapshots } from "@/runtime/engine/types";
import { boards, getOrCreateBoard, recordBaseline } from "@/runtime/engine/board-store";
import { createBoard, readBoardContent, readBoardFile } from "@/runtime/engine/board-io";
import type { LoadedBoard } from "@/runtime/engine/board-io";
import { BoardResolutionError } from "@/runtime/engine/board-target";
import { heldBoardKeys } from "@/runtime/engine/board-hold";
import {
	forgetLockAnnouncements,
	onBoardLockChanged,
	onBoardSweep,
	watchBoardLocks,
} from "@/runtime/engine/board-lock";
import { forgetDoing } from "@/runtime/engine/board-doing";
import { makeIdentity, SCRATCH_BOARD, vaultPathFor } from "@/runtime/engine/board";
import type { BoardIdentity } from "@/runtime/engine/board";
import { forgetRememberedVersions } from "@/runtime/engine/board-version";
import { forgetNoteWatch, onNoteWrittenElsewhere } from "@/runtime/engine/note-watch";
import { ARCHBOARD_VAULT, noVaultMessage } from "@/runtime/engine/config";
import { changeFeed } from "@/runtime/engine/change-feed";
import { removePidFile, writePidFile } from "@/runtime/engine/pidfile";
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
import { isUnrenderableNote } from "@/server/canvas/lib/board-announcements";
import { browserPresentation } from "@/server/canvas/lib/browser-presentation-mount";
import { server } from "@/server/canvas/lib/canvas-app";
import { codexWiring, prepareCodexWorkbench, stopCodexWorkbench } from "@/server/canvas/lib/canvas-codex-host";
import { boardRenderer, checkoutWork, mutationAdmission } from "@/server/canvas/lib/canvas-owners";
import {
	findExistingLoopbackListener,
	formatHostForUrl,
	HOST,
	isLoopbackGuardedHost,
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
import { canvasStartupFailureMessage } from "@/server/canvas/lib/startup-error";
import { closeWebSocketServer, startWebSocketServer } from "@/server/canvas/lib/websocket-connection";

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
 * Read the scratch note, creating it when the vault has none. Two canvases
 * may start against one fresh vault together: the scratch note is an
 * idempotent startup prerequisite, the exclusive creator still decides its
 * bytes, and the loser adopts those exact bytes.
 * @param identity The scratch identity.
 * @returns The loaded note, or null when this canvas created it.
 */
function createOrAdoptScratch(identity: BoardIdentity): LoadedBoard | null {
	try {
		createBoard(identity);
		return null;
	} catch (error) {
		if (!(error instanceof BoardResolutionError) || error.reason !== "conflicting") {
			throw error;
		}
		const adopted = readBoardFile(identity);
		if (!adopted) {
			throw error;
		}
		return adopted;
	}
}

/**
 * Log how the scratch board was picked up, tolerating a note that is present
 * but cannot be rendered: the canvas starts so the pane can show that error.
 * @param board The scratch board.
 * @param file Its note.
 */
function logScratchAdoption(board: ReturnType<typeof getOrCreateBoard>["board"], file: string): void {
	try {
		const count = readBoardContent(board).elements.size;
		logger.info(`Scratch board picked up where it was left: ${count} element(s) from ${file}`);
	} catch (error) {
		if (!isUnrenderableNote(error)) {
			throw error;
		}
		logger.warn(
			`Scratch note cannot be rendered and was left unchanged: ${error.message} ` +
				"The canvas will start so the pane can show this error.",
		);
	}
}

/**
 * Take the scratch board's note, if there is one.
 *
 * Scratch is where a first run draws, and it used to be the one board that
 * lived in the process and nowhere else, so quitting the canvas threw it away
 * without saying so. It has a note now like every other board (ADR 0015),
 * `<vault>/.archboard/scratch.excalidraw.md`, and this is where the canvas
 * picks it back up.
 *
 * Nothing is written here beyond a missing note's creation. A scratch note
 * that cannot be read is not worth refusing to start over: it is a scratch
 * pad, the vault holds the boards that matter, and the file is left alone
 * rather than replaced.
 */
function adoptScratchBoard(): void {
	const identity = makeIdentity({ board: SCRATCH_BOARD });
	const { board } = getOrCreateBoard(identity);
	let loaded: LoadedBoard | null;
	try {
		loaded = readBoardFile(identity);
	} catch (error) {
		logger.warn(`Scratch note ignored: ${messageOf(error)}`);
		board.file = vaultPathFor(identity);
		return;
	}
	loaded ??= createOrAdoptScratch(identity);
	if (!loaded) {
		return;
	}
	board.file = loaded.file;
	// The bytes just read are the baseline the first write is checked against.
	// Nothing is ingested: the note is the board, and every request that touches
	// scratch will read it for itself.
	recordBaseline(board, loaded.file, loaded.hash, loaded.version);
	board.loadedAt = new Date().toISOString();
	logScratchAdoption(board, loaded.file);
}

/**
 * Forget every engine-level announcement, watch and record this process holds.
 */
function forgetEngineState(): void {
	watchBoardLocks(null);
	onBoardLockChanged(null);
	onBoardSweep(null);
	forgetLockAnnouncements();
	onNoteWrittenElsewhere(null);
	forgetNoteWatch();
	changeFeed.dispose();
	forgetDoing();
	forgetRememberedVersions("");
	snapshots.clear();
	boards.clear();
	selectionState.current = null;
	selectionState.byClient.clear();
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
async function closeBrowserOwners(): Promise<void> {
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
	browserPresentation.stop();
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
		const cancelListen = (): void => listenController.abort(signal.reason);
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
		report: (message = null) => {
			if (reported) {
				return;
			}
			reported = true;
			writeCanvasStartupProtocolRecord(
				canvasStartupTerminalRecord({ canvasPid: process.pid, cleanupProven: cleanupProven(), message }),
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
		onTerm: () => shutdown("SIGTERM"),
		onInterrupt: () => shutdown("SIGINT"),
		onExit: () => {
			if (http.ownsPidFile) {
				removePidFile(PORT);
			}
		},
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
				/** Flush and close the log transports. */
				stop: () => closeLogger(),
				/** Close the log transports without waiting. */
				forceStop: () => forceCloseLogger(),
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
				start: () => adoptScratchBoard(),
				/** Forget every engine-level record. */
				stop: () => forgetEngineState(),
			},
			{
				name: "codex-workbench",
				start: prepareCodexWorkbench,
				stop: stopCodexWorkbench,
				forceStop: stopCodexWorkbench,
			},
			{
				name: "board-renderer",
				/** Start the renderer. */
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
				/** Stop listening. */
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
 * Start the canvas: refuse without a vault or beside a duplicate listener,
 * then run every resource through the lifetime.
 */
async function startServer(): Promise<void> {
	let cleanupProven = (): boolean => true;
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
