import { logger } from "@/runtime/engine/logger";
import { selectionState, snapshots } from "@/runtime/engine/types";
import { boards, getOrCreateBoard, recordBaseline } from "@/runtime/engine/board-store";
import { createBoard, readBoardContent, readBoardFile } from "@/runtime/engine/board-io";
import type { LoadedBoard } from "@/runtime/engine/board-io";
import { BoardResolutionError } from "@/runtime/engine/board-target";
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
import { changeFeed } from "@/runtime/engine/change-feed";
import { removePidFile, writePidFile } from "@/runtime/engine/pidfile";
import { isUnrenderableNote } from "@/server/canvas/lib/board-announcements";
import { browserPresentation } from "@/server/canvas/lib/browser-presentation-mount";
import { server } from "@/server/canvas/lib/canvas-app";
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
function logScratchAdoption(
	board: ReturnType<typeof getOrCreateBoard>["board"],
	file: string,
): void {
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

export {
	adoptScratchBoard,
	closeBrowserOwners,
	closeHttpServer,
	forgetEngineState,
	listen,
	stopListening,
};
export type { HttpOwnership };
