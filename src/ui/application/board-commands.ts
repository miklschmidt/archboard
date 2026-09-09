// What a board dialog's request, a save, a clear and the conflict outcomes
// do on the wire, over an injected api so the mapping is checkable with a
// fake. Every command is one server call per thing the person asked for
// (TASK-068); a conflict comes back as an outcome, never as a retry.

import {
	BoardConflictError,
	clearBoard,
	newBoard,
	openBoard,
	saveBoard,
	type OpenBoardRequest,
	type SaveRequest,
} from "@/ui/canvas/api";
import type { BoardDialogRequest, ConflictOutcome } from "@/ui/board-dialogs";
import type {
	BoardHold,
	BoardIdentity,
	BoardInfo,
	BoardSaveResult,
	BoardWriteConflict,
} from "@/ui/types";
import { type DialogError } from "@/ui/dialog-parts";

/** The server calls the commands make. */
interface BoardCommandApi {
	readonly open: (request: OpenBoardRequest) => Promise<BoardInfo>;
	readonly create: (address: Partial<BoardIdentity> & { board: string }) => Promise<BoardInfo>;
	readonly save: (request: SaveRequest) => Promise<BoardSaveResult>;
	readonly clear: (
		board: string,
		clientId: string,
		expectVersion: number | null,
	) => Promise<{ count: number }>;
}

/** The pane a command acts for. */
interface BoardCommandContext {
	/** Which pane this is in the shell, as the address bar and the chrome name it. */
	readonly paneId: string;
	/** The pane's identity to the server: what makes the write a person's (TASK-095). */
	readonly clientId: string;
	/** The note version the pane last saw, which a person's write states (ADR 0022). */
	readonly expectVersion: number | null;
	/** The board the pane holds, or null before it has one. */
	readonly boardKey: string | null;
	/** The board's identity, for a reload. */
	readonly board: BoardIdentity | null;
	/** The pane to address, required once more than one is open. */
	readonly pane: string | undefined;
}

/** How a command ended. */
/** What a command did: words for the person, and the boards it wrote. */
interface CommandDone {
	readonly kind: "done";
	readonly message: string | null;
	/**
	 * The boards this command wrote, so what the shell caches about them can be
	 * read again. A command that only changed which board a pane shows names
	 * none: nothing about those boards moved.
	 */
	readonly boards: readonly string[];
}

/** How a command ended. */
type BoardCommandOutcome =
	| CommandDone
	| {
			readonly kind: "conflict";
			readonly conflict: BoardWriteConflict;
			readonly hold: BoardHold | null;
	  }
	| {
			readonly kind: "failed";
			readonly error: DialogError;
			/** What it had already written when it failed; nothing is rolled back. */
			readonly boards: readonly string[];
	  };

const SERVER_API: BoardCommandApi = {
	open: openBoard,
	create: newBoard,
	save: saveBoard,
	clear: clearBoard,
};

/**
 * The open request for an identity, with the optional fields left out when absent.
 * @param identity The board.
 * @param pane The pane to address, if any.
 * @param reload Whether to take the note and discard the canvas (ADR 0006).
 * @returns The request.
 */
function openRequest(
	identity: BoardIdentity,
	pane: string | undefined,
	reload = false,
): OpenBoardRequest {
	const request: OpenBoardRequest = { board: identity.board, variant: identity.variant };
	if (identity.level !== undefined) {
		request.level = identity.level;
	}
	if (pane !== undefined) {
		request.pane = pane;
	}
	if (reload) {
		request.reload = true;
	}
	return request;
}

/**
 * The identity a dialog request names.
 * @param request The request.
 * @returns The identity, defaulting the variant to `current`.
 */
function identityOf(request: BoardDialogRequest): BoardIdentity {
	const identity: BoardIdentity = { board: request.board, variant: request.variant ?? "current" };
	if (request.level !== undefined) {
		identity.level = request.level;
	}
	return identity;
}

/**
 * Plain words for what was thrown.
 * @param error What was thrown.
 * @returns The message.
 */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * A failed command as a dialog error, with whatever it had already written.
 * @param title What was attempted.
 * @param error What was thrown.
 * @param boards The boards it wrote before it failed.
 * @returns The outcome.
 */
function failed(
	title: string,
	error: unknown,
	boards: readonly string[] = [],
): BoardCommandOutcome {
	return { kind: "failed", error: { title, message: messageOf(error) }, boards };
}

/** Say that a board has been written. */
type Wrote = (board: string) => void;

/**
 * Run a command, turning a conflict and a failure into outcomes.
 *
 * A command is not one write: creating a board writes a note and then points a
 * pane at it, and the pane can be gone by then. What the command wrote is
 * collected as it goes rather than returned at the end, so a step that fails
 * afterwards cannot take the earlier write with it: the board exists, and what
 * the shell holds about it has to be read again either way. Nothing is rolled
 * back and nothing is retried; the person is told what happened.
 * @param title What is attempted, for the error.
 * @param command The command, told what it has written as it writes.
 * @returns The outcome.
 */
async function attempt(
	title: string,
	command: (wrote: Wrote) => Promise<string | null>,
): Promise<BoardCommandOutcome> {
	const boards: string[] = [];
	/**
	 * Remember a board this command has written.
	 * @param board The board key.
	 */
	const wrote: Wrote = (board: string): void => {
		boards.push(board);
	};
	try {
		return { kind: "done", message: await command(wrote), boards };
	} catch (error) {
		if (error instanceof BoardConflictError) {
			// A refused write is a write that did not happen.
			return { kind: "conflict", conflict: error.conflict, hold: error.held ?? null };
		}
		return failed(title, error, boards);
	}
}

/**
 * Words for what a save did (ADR 0012).
 * @param result The save result.
 * @returns One line.
 */
function savedMessage(result: BoardSaveResult): string {
	switch (result.saveKind) {
		case "named":
			return `Saved as ${result.board}.`;
		case "branch":
			return `Saved a branch: ${result.board}.`;
		default:
			return `Saved ${result.board}.`;
	}
}

/**
 * Save the pane's board under another name, variant or level.
 * @param api The server.
 * @param request The dialog's save-as request.
 * @param context The pane.
 * @returns The outcome.
 */
function saveAs(
	api: BoardCommandApi,
	request: BoardDialogRequest,
	context: BoardCommandContext,
): Promise<BoardCommandOutcome> {
	const { boardKey } = context;
	if (boardKey === null) {
		return Promise.resolve(failed("Save as", new Error("This pane holds no board to save.")));
	}
	return attempt("Save as", async (wrote) => {
		const save: SaveRequest = {
			board: boardKey,
			clientId: context.clientId,
			expectVersion: context.expectVersion,
			name: request.board,
		};
		if (request.variant !== undefined) {
			save.variant = request.variant;
		}
		if (request.level !== undefined) {
			save.level = request.level;
		}
		const result = await api.save(save);
		// Both boards moved: the note that was written, and the one it was written
		// from, whose own state a branch or a rename leaves behind.
		wrote(result.board);
		wrote(boardKey);
		return savedMessage(result);
	});
}

/**
 * Point the pane at a board that has just been created, saying plainly if it
 * cannot be: the note exists either way, and a person told only that the
 * command failed would try to create it again.
 * @param api The server.
 * @param created The board that was created.
 * @param context The pane.
 */
async function openCreated(
	api: BoardCommandApi,
	created: BoardInfo,
	context: BoardCommandContext,
): Promise<void> {
	try {
		await api.open(openRequest(created.identity, context.pane));
	} catch (error) {
		throw new Error(`Created ${created.board}, but it could not be opened: ${messageOf(error)}`, {
			cause: error,
		});
	}
}

/**
 * Run what a board dialog asked for: open, create, or save as.
 * @param api The server.
 * @param request The dialog's request.
 * @param context The pane the request is for.
 * @returns The outcome.
 */
function runBoardDialogRequest(
	api: BoardCommandApi,
	request: BoardDialogRequest,
	context: BoardCommandContext,
): Promise<BoardCommandOutcome> {
	const identity = identityOf(request);
	switch (request.mode) {
		case "open":
			return attempt("Open board", async () => {
				await api.open(openRequest(identity, context.pane));
				return null;
			});
		case "create":
			return attempt("Create board", async (wrote) => {
				const created = await api.create(identity);
				// The note exists from here on, whatever the pane does next.
				wrote(created.board);
				await openCreated(api, created, context);
				return `Created ${created.board}.`;
			});
		default:
			return saveAs(api, request, context);
	}
}

/**
 * Open a listed board in the pane.
 * @param api The server.
 * @param identity The board.
 * @param context The pane.
 * @returns The outcome.
 */
function runOpen(
	api: BoardCommandApi,
	identity: BoardIdentity,
	context: BoardCommandContext,
): Promise<BoardCommandOutcome> {
	return attempt("Open board", async () => {
		await api.open(openRequest(identity, context.pane));
		// Opening writes nothing: it changes which board a pane shows, which the
		// listing covers, and leaves every board as it was.
		return null;
	});
}

/**
 * Point a pane at a board named by its key, the way a board link and the
 * address bar name one: `payments` or `payments@proposed`. The server parses
 * the key and resolves its note, so nothing here has to know how an address is
 * spelled. The pane is always named, so a restore cannot land in the wrong one.
 * @param api The server.
 * @param boardKey The board key.
 * @param pane The pane's identity to the server.
 * @returns The outcome.
 */
function runOpenKey(
	api: BoardCommandApi,
	boardKey: string,
	pane: string,
): Promise<BoardCommandOutcome> {
	return attempt("Open board", async () => {
		await api.open({ board: boardKey, pane });
		// A restore points a pane at a board; nothing about any board moved.
		return null;
	});
}

/**
 * Save the pane's board back to its own note.
 * @param api The server.
 * @param context The pane.
 * @param force The human's "overwrite it anyway" (ADR 0006).
 * @returns The outcome.
 */
function runSave(
	api: BoardCommandApi,
	context: BoardCommandContext,
	force = false,
): Promise<BoardCommandOutcome> {
	const { boardKey } = context;
	if (boardKey === null) {
		return Promise.resolve(failed("Save", new Error("This pane holds no board to save.")));
	}
	return attempt("Save", async (wrote) => {
		const save: SaveRequest = {
			board: boardKey,
			clientId: context.clientId,
			expectVersion: context.expectVersion,
		};
		if (force) {
			save.force = true;
		}
		const result = await api.save(save);
		wrote(result.board);
		wrote(boardKey);
		return savedMessage(result);
	});
}

/**
 * Take the note and discard the canvas: ADR 0006's first outcome.
 * @param api The server.
 * @param context The pane.
 * @returns The outcome.
 */
function runReload(
	api: BoardCommandApi,
	context: BoardCommandContext,
): Promise<BoardCommandOutcome> {
	const { board } = context;
	if (board === null) {
		return Promise.resolve(failed("Reload", new Error("This pane holds no board to reload.")));
	}
	return attempt("Reload", async (wrote) => {
		await api.open(openRequest(board, context.pane, true));
		if (context.boardKey !== null) {
			wrote(context.boardKey);
		}
		return `Reloaded ${board.board} from its note.`;
	});
}

/**
 * Empty the pane's board. Confirmed by the person before this is called.
 * @param api The server.
 * @param context The pane.
 * @returns The outcome.
 */
function runClear(
	api: BoardCommandApi,
	context: BoardCommandContext,
): Promise<BoardCommandOutcome> {
	const { boardKey } = context;
	if (boardKey === null) {
		return Promise.resolve(failed("Clear", new Error("This pane holds no board to clear.")));
	}
	return attempt("Clear board", async (wrote) => {
		const { count } = await api.clear(boardKey, context.clientId, context.expectVersion);
		wrote(boardKey);
		return `Removed ${count} element(s).`;
	});
}

/**
 * Run one of the two conflict outcomes that finish on the wire. `elsewhere`
 * is answered by the host with the save-as dialog and never reaches here.
 * @param api The server.
 * @param outcome The chosen outcome.
 * @param context The pane.
 * @returns The outcome.
 */
function runConflictOutcome(
	api: BoardCommandApi,
	outcome: Exclude<ConflictOutcome, "elsewhere">,
	context: BoardCommandContext,
): Promise<BoardCommandOutcome> {
	return outcome === "reload" ? runReload(api, context) : runSave(api, context, true);
}

export {
	SERVER_API,
	openRequest,
	runBoardDialogRequest,
	runClear,
	runConflictOutcome,
	runOpen,
	runOpenKey,
	runReload,
	runSave,
	type BoardCommandApi,
	type BoardCommandContext,
	type BoardCommandOutcome,
};
