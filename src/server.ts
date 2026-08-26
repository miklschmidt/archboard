import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import logger from "./runtime/engine/logger.js";
import { snapshots, selectionState } from "./runtime/engine/types.js";
import type {
	ServerElement,
	ExcalidrawFile,
	WebSocketMessage,
	InitialElementsMessage,
	Snapshot,
} from "./runtime/engine/types.js";
import { mintId } from "./shared/ids/ids.js";
import { buildSelectionReport } from "./runtime/engine/describe.js";
import {
	buildPanesReport,
	MAX_PANES,
	panesInOrder,
	paneWords,
	resolvePaneSpec,
	soloPane,
} from "./runtime/engine/panes.js";
import type { PaneRegistration } from "./runtime/engine/panes.js";
import { BoardRequiredError } from "./runtime/engine/board-target.js";
import { RenderGeometryError } from "./runtime/engine/geometry.js";
import { z } from "zod";
import WebSocket from "ws";
import { isMainModule } from "./runtime/engine/entry.js";
import { kept } from "./runtime/engine/hot.js";
import { askForReload, reloadIsAskable } from "./runtime/engine/reload-token.js";
import { writePidFile, removePidFile } from "./runtime/engine/pidfile.js";
import fs from "fs";
import {
	boardSummaries,
	boards,
	copyElements,
	getOrCreateBoard,
	recordBaseline,
	resolveBoard,
	SCRATCH_KEY,
} from "./runtime/engine/board-store.js";
import type { BoardState } from "./runtime/engine/board-store.js";
import {
	holdOn,
	isHeld,
	// board-lock.ts also exports `releaseHold`, for the mutex. The lock owns that
	// name — its check and ADR 0016 both use it — so ADR 0006's hold takes the
	// verb its own plan uses for the three outcomes: each one clears the hold.
	releaseHold as clearHold,
	reportHold,
	writesBoardNote,
} from "./runtime/engine/board-hold.js";
import type { HoldReport } from "./runtime/engine/board-hold.js";
import {
	BoardWriteConflictError,
	boardFilesMessage,
	emptyContent,
	ingestScene,
	readBoardContent,
	readBoardFile,
} from "./runtime/engine/board-io.js";
import type { BoardContent, LoadedBoard } from "./runtime/engine/board-io.js";
import {
	BoardHeldError,
	boardLockState,
	claimBoard,
	claimWriterId,
	holdBoard,
	onBoardLockChanged,
	onBoardSweep,
	releaseClaim,
	releaseHold,
	sleep,
	takeClaimRevocation,
	watchBoardLocks,
} from "./runtime/engine/board-lock.js";
import type { LockHolder } from "./runtime/engine/board-lock.js";
import { checkDoing, recentDoing, recordDoing } from "./runtime/engine/board-doing.js";
import type { DoingEntry } from "./runtime/engine/board-doing.js";
import {
	CURRENT_VARIANT,
	boardKey,
	classifyBoardSave,
	listBoards,
	makeIdentity,
	normalizeBoardKey,
	SCRATCH_BOARD,
	panesFollowSave,
	parseBoardKey,
	requireVaultRoot,
	validateLevel,
	validateVariant,
	vaultPathFor,
} from "./runtime/engine/board.js";
import type { BoardIdentity } from "./runtime/engine/board.js";
import {
	checkBoardVersion,
	rememberVersion,
	rememberVersionAt,
	statedVersion,
	versionOfNoteAt,
} from "./runtime/engine/board-version.js";
import {
	noteWrittenElsewhere,
	onNoteWrittenElsewhere,
	refreshNoteWatch,
} from "./runtime/engine/note-watch.js";
import type { NoteWrittenElsewhere } from "./runtime/engine/note-watch.js";
import { ARCHBOARD_VAULT, noVaultMessage } from "./runtime/engine/config.js";
import { restampVariant } from "./runtime/engine/promote.js";
import { boardsForRepo } from "./runtime/engine/repo-boards.js";
import { compareBoards } from "./runtime/engine/compare.js";
import type { CompareSideInput } from "./runtime/engine/compare.js";
import { changeFeed } from "./runtime/engine/change-feed.js";
import type { ChangeEvent } from "./runtime/engine/change-feed.js";
import { PANE_LAYOUT_TIMEOUT_MS, PANE_SETTLE_CAP_MS, REPORT_PROGRESS_MS } from "./shared/timing/timing.js";
import { narrateChange } from "./runtime/engine/changes.js";
import { injectTest, injectionStatus, startInjection } from "./runtime/engine/injection.js";
import { readLibrary, writeLibrary } from "./runtime/engine/library.js";
import type { LibraryItem } from "./runtime/engine/library.js";
import { overlapsRegion } from "./runtime/engine/geometry.js";
import {
	agentWriteAnswer,
	humanWriteAnswer,
	BoardMutationError,
	elementMutation,
	writeBoard,
} from "./runtime/engine/board-write.js";
import type { BoardWriteRequest, BoardWriteTarget } from "./runtime/engine/board-write.js";
import {
	presentElement,
	presentElements,
	stripBindingPresentationLinks,
} from "./runtime/engine/presentation.js";
import { frontendState, sourceState } from "./runtime/engine/staleness.js";

// Load environment variables
dotenv.config({ quiet: true });

const moduleFile = fileURLToPath(import.meta.url);
const moduleDir = path.dirname(moduleFile);

const app = express();

// The port and the sockets on it are made once per process and reused across a
// hot reload; the routes and handlers on them are replaced every time this file
// is re-evaluated (ADR 0014).
//
// That split is the whole trick. A tab's WebSocket belongs to `wss`, which
// belongs to `server`, so rebuilding either would disconnect every browser
// pane — and a pane that reconnects has to be told what it holds all over
// again. Binding again would fail on EADDRINUSE against ourselves, which the
// loopback guard would read as a second canvas and exit over.
//
// So `server` is created with a dispatcher that looks up the current express
// app rather than receiving one, and each reload points `wiring.app` at the
// app it just built.
interface Wiring {
	app: express.Express;
	server: ReturnType<typeof createServer>;
	wss: WebSocketServer;
	/** Set once the port is bound, so a reload does not try to bind it again. */
	listening: boolean;
	/** Set once the signal and exit handlers are on `process`. */
	signalsBound: boolean;
}

const wiring = kept<Wiring>("http", () => {
	const state = { listening: false, signalsBound: false } as Wiring;
	state.server = createServer((req, res) => state.app(req, res));
	state.wss = new WebSocketServer({ server: state.server });
	return state;
});
wiring.app = app;
const server = wiring.server;
const wss = wiring.wss;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// A board that has stopped saving says so in every answer about it.
//
// One line rather than a line in each of thirty routes, because the point of a
// held board is that nobody working on it can fail to notice (TASK-079). An
// agent that never sees the refusal — a different process, a different turn —
// still gets the hold, the three outcomes and how much is riding on them
// attached to the next thing it reads or draws. Refusals carry it too: a 409
// is exactly when it is worth saying.
//
// It is put on the response rather than fetched by the caller so that adding a
// route cannot forget it.
app.use((req: Request, res: Response, next: NextFunction) => {
	const asked =
		typeof req.query.board === "string"
			? req.query.board
			: req.body && typeof req.body === "object" && typeof req.body.board === "string"
				? req.body.board
				: "";
	if (!asked.trim()) return next();
	const key = normalizeBoardKey(asked);
	const send = res.json.bind(res);
	res.json = (body: unknown) => {
		const hold = holdOn(key);
		return send(
			hold && body && typeof body === "object" && !Array.isArray(body)
				? { ...(body as Record<string, unknown>), held: reportHold(key, hold) }
				: body,
		);
	};
	next();
});

// Serve the frontend bundle, and only that.
//
// This used to mount `../dist` as well, which meant whatever a build tool had
// left in that directory was reachable over http by path. Under ADR 0014 vite
// writes nothing but `dist/frontend`, so today that mount adds nothing. But a
// checkout from before ADR 0014 still has a compiled server, CLI and every core
// module sitting in `dist/`, and the broad mount served all of it. What is
// reachable is now this line's decision rather than a build tool's.
// `scripts/check-local-bind.mjs` plants a file in `dist/` and checks it 404s.
app.use(express.static(path.join(moduleDir, "../dist/frontend")));
// Serve Excalidraw fonts so the font subsetting worker can fetch them for export
app.use(
	"/assets/fonts",
	express.static(path.join(moduleDir, "../node_modules/@excalidraw/excalidraw/dist/prod/fonts")),
);

// WebSocket connections.
//
// WHAT THIS PROCESS IS STILL ALLOWED TO HOLD, and why, because ADR 0015 says
// the note is the board and the canvas holds no copy of one. Three kinds of
// thing survive that, and the test is which question each answers.
//
// Session and display state answers "what is on this screen, now": the sockets
// below, `clientIds`, `panes`, `paneBoards`, `selectionState`, the four
// `pending*` maps and `wiring`. None of it can live in a note, all of it dies
// with the tab, and a reading of ADR 0015 that forbade it would be
// unimplementable — which is why the ADR names it.
//
// A record of what a board used to be answers "how did it stand then": the
// change feed's baseline and checkpoints (`src/runtime/engine/change-feed.ts`) and
// `snapshots` (`src/types.ts`). Each carries its own reasoning; the short form
// is that the vault has never held a board's past and so statelessness does not
// move them anywhere.
//
// Where each board's note is answers "which boards does this canvas have open"
// (`src/runtime/engine/board-store.ts`). That is a fact about this process, like which
// pane has focus, and the note has nowhere to put it.
//
// Nothing else. Anything that answers "what is on this board" is the note.
//
// Everything from here to `paneBoards` is kept across a hot reload, because it
// describes what is on screen right now: the sockets themselves, which pane is
// which, and what each one holds. A reload that rebuilt these would leave the
// tabs connected to a server that had forgotten them.
const clients = kept("ws-clients", () => new Set<WebSocket>());
// Browser client id per socket, taken from the ?clientId= connect param. The
// same id is sent with every selection post, which is what lets a disconnect
// retire that client's selection.
const clientIds = kept("ws-client-ids", () => new Map<WebSocket, string>());

// What is on screen right now, one entry per pane, keyed by the same client id.
// A pane is in here only while its socket is open: closing a tab or unsplitting
// takes the registration with it, so `panes` can never report a pane that is no
// longer in front of anybody. Empty is the normal headless state.
const panes = kept("panes", () => new Map<string, PaneRegistration>());

// Which board each pane has been pointed at, keyed by client id.
//
// This is the *authority*: what the server has decided a pane holds. The
// registration above carries what the pane says it is rendering, which is the
// same thing a beat later, and reporting the pane's own answer is what keeps
// `panes` a description of the displayed scenes rather than a restatement of
// this map.
//
// Entries outlive the socket on purpose. A dropped connection reconnects with
// the same client id, and a pane that came back showing a different board than
// it had a second ago would undo a user's scene arrangement.
const paneBoards = kept("pane-boards", () => new Map<string, string>());

/** What each pane holds, in reading order. */
function boardsOnScreen(): Array<{ paneId: string; place: string; board: string }> {
	return panesInOrder(Array.from(panes.values())).map((entry) => ({
		paneId: entry.pane.paneId,
		place: entry.place,
		board: paneBoards.get(entry.pane.clientId) ?? entry.pane.board,
	}));
}

/** The live sockets belonging to one pane. */
function socketsFor(clientId: string): WebSocket[] {
	const found: WebSocket[] = [];
	clientIds.forEach((id, socket) => {
		if (id === clientId && socket.readyState === WebSocket.OPEN) found.push(socket);
	});
	return found;
}

// Broadcast to all connected clients.
//
// The board key is not optional: a client showing board A has to be able to
// drop a message about board B rather than merge it into what it is rendering.
// With two panes on two boards that filter stops being a formality — it is the
// only thing keeping an edit on one board out of the other one's scene.
function broadcast(message: WebSocketMessage, board: string): void {
	const data = JSON.stringify({ ...message, board });
	clients.forEach((client) => {
		try {
			if (client.readyState === WebSocket.OPEN) {
				client.send(data);
			}
		} catch {
			logger.warn("Failed to send to client, removing");
			clients.delete(client);
		}
	});
}

// Send to one pane, named by client id.
//
// A board switch is the message this exists for: it replaces the receiving
// pane's whole scene, so sending it to every socket is how one pane's `board
// open` used to drag the other pane along with it.
function sendToPane(clientId: string, message: WebSocketMessage, board: string): boolean {
	return deliverToPane(clientId, JSON.stringify({ ...message, board }));
}

// Send one pane something that is about the pane itself rather than about a
// board: open another one, close this one. Layout is not board news — the
// receiving pane keeps whatever board it is holding — so stamping a board key
// on it would be inventing one. Kept separate from sendToPane so that omitting
// the board stays a deliberate act rather than a missing argument.
function sendLayoutToPane(clientId: string, message: WebSocketMessage): boolean {
	return deliverToPane(clientId, JSON.stringify(message));
}

function deliverToPane(clientId: string, data: string): boolean {
	let delivered = false;
	for (const socket of socketsFor(clientId)) {
		try {
			socket.send(data);
			delivered = true;
		} catch {
			logger.warn("Failed to send to a pane, removing");
			clients.delete(socket);
		}
	}
	return delivered;
}

/**
 * A board's writer changed, so every pane holding it is told (ADR 0016).
 *
 * The lock is a broadcast and not only a guard. `holder` lets panes explain a
 * claim and decide whether a content edit is takeover. A connected pane keeps
 * local content responsive; the authoritative vault-backed mutex still orders
 * when that content may persist.
 *
 * The board key is stamped on by `broadcast`, so a pane showing the other board
 * drops it the same way it drops any other board's news.
 */
function lockMessage(board: string, holder: LockHolder | null): WebSocketMessage {
	return { type: "board_lock", board, held: holder !== null, holder };
}

// hot-safe: replaces the sink rather than adding one, and the sink is what the
// current module graph's `broadcast` closes over — a reload has to repoint it.
onBoardLockChanged((board, holder) => {
	broadcast(lockMessage(board, holder), board);
});

/**
 * An agent has just changed this board, and said what it was doing (TASK-095).
 *
 * Board-scoped like the lock, and beside it on purpose: the lock says who has
 * the board, the claim's reason says what the claim is for, and this is the
 * current step. One account at two scales, not two accounts of the same thing.
 *
 * The whole list rides with each line, so a pane that has just opened, or has
 * just received this board, is not blank until the next write. It costs a
 * few hundred bytes and it is what makes two panes on one board tell the same
 * story.
 */
function announceDoing(board: string, entry: DoingEntry): void {
	const recent = recordDoing(board, entry);
	broadcast({ type: "board_doing", doing: entry, recent } as WebSocketMessage, board);
}

/**
 * A write that did not say what it was doing.
 *
 * The refusal teaches, because being made to write the sentence is the point:
 * a person watching boxes move in the pane has no other way to know
 * what is being attempted, and an intent no diff can recover is one only the
 * writer can state (CLAUDE.md's principle, ADR 0016's claim from the other
 * end).
 */
function refuseUndescribedWrite(res: Response, board: string, path: string, problem: string): void {
	res.status(400).json({
		success: false,
		code: "DOING_REQUIRED",
		error:
			`This write to "${board}" says nothing about what it is doing (${problem}). Say it in one short ` +
			'line, in the present tense — "adding the payment queue", "rerouting orders through it" — and it ' +
			"goes up on the canvas as the write lands, so the person at the board can see what you are up to. " +
			`On the command line that is \`--doing "..."\`, and on the API it is \`?doing=\` (${path}). ` +
			`A claim's \`reason\` is the overall reason and does not stand in for this: ` +
			"this is the step. Nothing was written.",
		board,
	});
}

/**
 * Somebody outside archboard wrote this board's note, and the panes holding it
 * are showing a board the vault no longer has (TASK-062).
 *
 * A separate message from `board_lock` because it is a separate fact. A lock
 * says another archboard writer has the board right now and the pane must stop
 * accepting edits. This says nothing is stopping anybody: the pane keeps
 * drawing, and what it is drawing on is a copy. Telling one story with the
 * other's message would mean a board going read-only because Obsidian saved.
 */
function noteMessage(board: string, written: NoteWrittenElsewhere | null): WebSocketMessage {
	return { type: "board_note", board, writtenElsewhere: written };
}

// hot-safe: replaces the sink rather than adding one, for the reason above.
onNoteWrittenElsewhere((board, written) => {
	broadcast(noteMessage(board, written), board);
});

// hot-safe: replaces the sweep's passenger rather than adding a second one.
// Registered here rather than by the module itself so that the one place the
// lock watcher is wired is the one place anything rides on it.
onBoardSweep((board) => {
	refreshNoteWatch(board);
});

/**
 * Watch the lock files of the boards on screen, while there is a screen.
 *
 * The broadcast above reaches the panes of this canvas. A second canvas over
 * the same vault cannot be told anything, because the lock is a file, so its
 * panes would learn about a claim at the write rather than before the touch —
 * for a claim that runs minutes, that is minutes of a pane letting somebody
 * draw into a board an agent has (ADR 0016). Reading the files is how a pane
 * hears news nobody sent it.
 *
 * Only while a tab is connected: a pane exists while something renders it, and
 * with nothing rendering there is nobody to be wrong. Called on every
 * connection and every close, so the cost is paid by a canvas somebody is
 * looking at and by no other.
 */
// hot-safe: replaces the watcher's getter rather than adding a second one, and
// the getter closes over this module graph's `paneBoards` — a reload has to
// repoint it, as the sink above does.
function syncLockWatch(): void {
	watchBoardLocks(clients.size > 0 ? () => [...paneBoards.values()] : null);
}
syncLockWatch();

/**
 * Tell one pane where a board stands, now.
 *
 * A broadcast only reaches a pane that was connected when it went out, and a
 * pane arrives — a new tab, a reconnection, a board switch — into a board that
 * may already be held. Without this it would believe a held board is free until
 * the next thing happens to it, which is the fail-open the ADR forbids.
 */
function tellPaneAboutLock(clientId: string, board: string): void {
	sendToPane(clientId, lockMessage(board, boardLockState(board)), board);
	// And whether the note is the one this board came from. Same reasoning, same
	// moment: a tab that opens onto a board Obsidian rewrote an hour ago would
	// otherwise hear nothing until the next sweep found a change, and the change
	// it is waiting for already happened.
	sendToPane(clientId, noteMessage(board, noteWrittenElsewhere(board)), board);
	// And the last few things an agent said it was doing here (TASK-095). A pane
	// that has just received a board an agent is part way through would
	// otherwise show the banner saying somebody has it and nothing at all about
	// what has happened so far.
	const said = recentDoing(board);
	if (said.length > 0) {
		sendToPane(clientId, { type: "board_doing", recent: said } as WebSocketMessage, board);
	}
}

// Broadcast something that is not about a board.
//
// Only the library qualifies today: it is one palette behind every board, so a
// client applies it without asking which board the message came from. Kept
// separate from broadcast() so that omitting the board key stays a deliberate
// act rather than a missing argument.
function broadcastBoardless(message: WebSocketMessage): void {
	const data = JSON.stringify(message);
	clients.forEach((client) => {
		try {
			if (client.readyState === WebSocket.OPEN) client.send(data);
		} catch {
			logger.warn("Failed to send to client, removing");
			clients.delete(client);
		}
	});
}

/**
 * A board's elements, read out of its note.
 *
 * The one answer to "what is on this board", for everything that is not a
 * request working against content it already read: the change feed at the end
 * of a settle delay, a pane receiving a board, the report of what each pane
 * holds. Each is a fresh read, which is what makes them agree with the note
 * rather than with a copy of it that stopped being right at some point nobody
 * noticed (ADR 0015).
 */
function boardElements(board: BoardState): ServerElement[] {
	return Array.from(readBoardContent(board).elements.values());
}

/** How many elements a board has, for a summary that does not need them all. */
function boardElementCount(board: BoardState): number {
	try {
		return readBoardContent(board).elements.size;
	} catch (error) {
		// A malformed persisted scratch note is still an open board address. Keep
		// board listings and health usable while its pane carries the actual error.
		if (error instanceof RenderGeometryError) return 0;
		throw error;
	}
}

/**
 * A board is saving again, and every pane holding it should say so.
 *
 * One of the three outcomes has been chosen and carried out by the time this
 * runs; which one, and what it cost, is the caller's to have decided (ADR
 * 0006). All this does is take the mark down.
 */
function releaseBoardHold(
	key: string,
	outcome: "reload" | "overwrite" | "elsewhere",
): HoldReport | null {
	const hold = clearHold(key);
	if (!hold) return null;
	const report = reportHold(key, hold);
	logger.info(`Board "${key}" is saving again (${outcome}), after ${hold.writes} held change(s).`);
	broadcast({ type: "board_released", hold: report, outcome } as WebSocketMessage, key);
	return report;
}

/** The hold on a board, as a caller is told about it — or nothing to say. */
function holdResponse(key: string): Record<string, unknown> {
	const hold = holdOn(key);
	return hold ? { held: reportHold(key, hold) } : {};
}

/**
 * The boards this canvas has open, each saying whether it is still saving.
 *
 * `board list` is where an agent arriving mid-session finds out, without having
 * to write to a board to discover that writing to it goes nowhere.
 */
function openBoards(): Array<Record<string, unknown>> {
	return boardSummaries(boardElementCount).map((summary) => ({
		...summary,
		...holdResponse(summary.key),
	}));
}

// Which board a request is about, and what is on it. `?board=` or a `board`
// field in the body — and one of them has to be there. A request that names no
// board is refused (ADR 0009); `what` is the name of the operation, so the
// refusal can say what it was that needed a board.
//
// The note is read here, once, and the request works against what it read. That
// read is what makes the vault the truth (ADR 0015): there is no map to consult
// instead, so the answer cannot be a copy that stopped agreeing with the note.
function boardFromRequest(
	req: Request,
	what?: string,
): { key: string; board: BoardState; content: BoardContent } {
	const { key, board } = boardTargetFromRequest(req, what);
	return { key, board, content: readBoardContent(board) };
}

/** Resolve a write's board without reading its note ahead of the write entry. */
function boardTargetFromRequest(req: Request, what?: string): BoardWriteTarget {
	return resolveBoard(boardOfRequest(req), what);
}

// Which board a request says it is about, before anything decides whether that
// board exists. The mutex asks this and nothing else: it needs the address to
// find the lock, and a request naming no board or a board nobody has open is
// the handler's refusal to word, not the lock's.
function boardOfRequest(req: Request): string | undefined {
	const fromQuery = typeof req.query.board === "string" ? req.query.board : undefined;
	const fromBody =
		req.body && typeof req.body === "object" && typeof req.body.board === "string"
			? (req.body.board as string)
			: undefined;
	return fromQuery ?? fromBody;
}

// A board that was not named, or was named and is not open, is a client error
// rather than a server fault.
function boardErrorStatus(error: unknown): number {
	if (error instanceof BoardRequiredError) return error.status;
	if (error instanceof BoardMutationError) return error.status;
	if (error instanceof RenderGeometryError) return 400;
	// A refused write is not a fault, it is the other outcome the write always
	// had (ADR 0006). Every route that writes can now produce it, because every
	// write goes to the note (ADR 0015), so it is answered here once rather than
	// in each of them.
	if (error instanceof BoardWriteConflictError) return 409;
	// Somebody else is writing this board and did not finish inside the wait
	// (ADR 0016). The same 409 as a conflict, because it is the same shape of
	// answer: the write did not happen and here is what stood in its way.
	if (error instanceof BoardHeldError) return 409;
	return /is not open|Invalid board name|Invalid variant|Invalid level|No vault configured|outside the vault|No pane called|matches \d+ panes|No pane is open|needs a pane/.test(
		(error as Error).message,
	)
		? 400
		: 500;
}

/** The note state an agent receives with a write-boundary refusal. */
function refusalDocument(board: string): { document: ServerElement[]; version: number | null } {
	const state = boards.get(board);
	if (!state) throw new Error(`Board "${board}" is not open`);
	const content = readBoardContent(state);
	return {
		document: presentElements(content.elements.values()),
		version: content.version ?? null,
	};
}

// The refusal, as a body. Carries the open boards as data so a caller can act
// on it without parsing the sentence.
function boardErrorBody(error: unknown): Record<string, unknown> {
	const base = { success: false, error: (error as Error).message };
	if (error instanceof BoardRequiredError) {
		return { ...base, code: error.code, open: error.open };
	}
	// The three outcomes as data, so a surface offers them rather than rewording
	// them. Which one the human picks is never archboard's to choose.
	if (error instanceof BoardWriteConflictError) {
		return { ...base, conflict: error.conflict };
	}
	// Who has the board and since when, as data as well as a sentence, so a voice
	// session has something to say and a client has something to act on.
	if (error instanceof BoardHeldError) {
		return {
			...base,
			code: error.code,
			board: error.board,
			holder: error.holder,
			waitedMs: error.waitedMs,
			...refusalDocument(error.board),
		};
	}
	return base;
}

function answerBoardError(res: Response, error: unknown, what?: string): void {
	if (what) logger.error(what, error);
	res.status(boardErrorStatus(error)).json(boardErrorBody(error));
}

/** Send one board-write answer and retain the version it already produced. */
function answerBoardWrite<T>(res: Response, request: BoardWriteRequest<T>): void {
	const afterPersist = request.afterPersist;
	res.json(
		writeBoard(
			{
				...request,
				afterPersist: (context) => {
					if (context.written) res.locals.writtenBoardVersion = context.written.version;
					afterPersist?.(context);
				},
			},
			broadcast,
		),
	);
}

/**
 * What a pane opening for the first time should show.
 *
 * A split is "another look at what I am working on", so a new pane starts on
 * whatever is already in front of the human and is then pointed somewhere else
 * deliberately. With nothing on screen there is nothing to copy, and the
 * server's active board — the last one opened — is the only answer available.
 */
function boardForNewPane(clientId: string): string {
	const remembered = paneBoards.get(clientId);
	if (remembered && boards.has(remembered)) return remembered;
	const existing = Array.from(panes.values());
	const reference =
		existing.find((pane) => pane.primary) ?? existing.find((pane) => pane.focused) ?? existing[0];
	const key = reference ? (paneBoards.get(reference.clientId) ?? reference.board) : null;
	return key && boards.has(key) ? key : SCRATCH_KEY;
}

// WebSocket connection handling.
//
// The listener is replaced rather than added, because `wss` outlives a hot
// reload and a second registration would answer every connection twice.
wss.removeAllListeners("connection");
wss.on("connection", (ws: WebSocket, req) => {
	clients.add(ws);
	// There is a screen again, so the lock files of what is on it are worth
	// reading (ADR 0016).
	syncLockWatch();
	const clientId = new URL(req.url ?? "/", "http://localhost").searchParams.get("clientId");
	if (clientId) clientIds.set(ws, clientId);
	logger.info(`New WebSocket connection established${clientId ? ` (client ${clientId})` : ""}`);

	// Which board this pane gets, and it is a board *for this pane* — not "the"
	// board, which no longer exists as a single thing. A pane that has been here
	// before (a dropped socket, not a new tab) resumes what it was holding,
	// because a reconnect must not undo a user's scene arrangement.
	const startingKey = clientId ? boardForNewPane(clientId) : SCRATCH_KEY;
	if (clientId) paneBoards.set(clientId, startingKey);
	const board = boards.get(startingKey)!;
	// Read out of the note, like everything else that sends a pane a whole board.
	// Scratch is registered before the listener binds. If its legacy note is
	// malformed, start with no scene rather than sending any of those elements
	// to Excalidraw, then put the refusal on screen. The note stays untouched.
	let content: BoardContent;
	let renderError: RenderGeometryError | null = null;
	try {
		content = readBoardContent(board);
	} catch (error) {
		if (!(error instanceof RenderGeometryError)) throw error;
		content = emptyContent();
		renderError = error;
	}
	const initialMessage: InitialElementsMessage & {
		files?: Record<string, ExcalidrawFile>;
		identity: BoardIdentity;
	} = {
		type: "initial_elements",
		board: startingKey,
		identity: board.identity,
		elements: presentElements(content.elements.values()),
		...boardFilesMessage(content),
	};
	ws.send(JSON.stringify(initialMessage));
	if (renderError) {
		ws.send(
			JSON.stringify({
				type: "board_error",
				board: startingKey,
				error:
					`Could not open "${startingKey}" from ${board.file}. ${renderError.message} ` +
					`The note was left unchanged. Correct it, then run \`board open ${startingKey} --reload\`.`,
			} satisfies WebSocketMessage),
		);
	}
	// And where its lock stands. A broadcast only reaches panes that were already
	// connected, so a tab that has just arrived — or come back from a dropped
	// socket — is told outright rather than left assuming the board is free.
	if (clientId) tellPaneAboutLock(clientId, startingKey);

	ws.on("close", () => {
		clients.delete(ws);
		const closingId = clientIds.get(ws);
		clientIds.delete(ws);
		// A closed or reloaded tab must not leave a selection standing: whatever it
		// had picked is no longer on anyone's screen.
		if (closingId) {
			selectionState.byClient.delete(closingId);
			// A hold this pane had goes with it. The lease would have lapsed on its
			// own within LOCK_LEASE_MS, which is what makes a killed tab survivable;
			// this is only so a tab closed politely does not leave an agent waiting
			// three seconds for a user who has left (ADR 0016).
			const held = paneBoards.get(closingId);
			if (held) releaseHold(held, closingId);
			// The pane itself is gone for the same reason — a closed tab, or a pane
			// taken out of the shell. Reporting it would be reporting a ghost.
			panes.delete(closingId);
			// And if somebody asked for that pane to go, this is the proof it did.
			notePaneClosed(closingId);
		}
		if (closingId && selectionState.current?.clientId === closingId) {
			selectionState.current = null;
			broadcastSelection();
			logger.info(`Selection cleared: owning client ${closingId} disconnected`);
		}
		// The last tab going costs the lock watch: nothing is rendering, so no
		// pane can be wrong about who holds a board.
		syncLockWatch();
		logger.info("WebSocket connection closed");
	});

	ws.on("error", (error) => {
		logger.error("WebSocket error:", error);
		clients.delete(ws);
	});
});

// ─── One writer at a time ─────────────────────────────────────
//
// Every request that could change a board takes the board's mutex before the
// handler runs and gives it back when the response goes out (ADR 0016,
// `src/runtime/engine/board-lock.ts`). One place, so no route assembles the steps itself
// and no route can forget to.
//
// **Deny by default.** Anything that is not a GET and names a board is a write
// unless it is listed below with the reason it is not. A route added later and
// not thought about therefore locks a board it did not need to, which costs a
// few milliseconds; the other way round costs a lost update, and would be
// invisible.
//
// Nothing between the lock and the handler awaits, so the read-modify-write
// cycle inside the handler is still one synchronous run (`board-io.ts`). What
// changes is what keeps two of them apart: express ran them one at a time, and
// now the mutex does, which is the same guarantee extended to a second process.
const NOT_A_BOARD_WRITE: Array<[RegExp, string]> = [
	[/^\/api\/boards\/hold/, "is the lock"],
	[/^\/api\/boards\/claim/, "is the lock, held for longer"],
	// Waits for a browser to convert, and the elements arrive afterwards as that
	// pane\'s own change report, which is locked. Holding the board across that
	// wait would be holding it against the very report that ends the wait.
	[/^\/api\/elements\/from-mermaid$/, "waits on the pane whose report is the write"],
	[/^\/api\/panes/, "layout, not board content, and open/close wait on the browser"],
	[/^\/api\/viewport/, "a camera move, and it waits on the browser"],
	[/^\/api\/export/, "a picture of a board, which only reads it"],
	[/^\/api\/selection/, "a selection is not board content"],
	[/^\/api\/library/, "one palette behind every board, and not board content"],
	[/^\/api\/snapshots/, "reads a board into a snapshot and writes no note"],
	[/^\/api\/boards\/open$/, "reads a note and points a pane at it"],
	[/^\/api\/boards\/new$/, "creates no note"],
	[/^\/api\/injection/, "not about a board"],
	[/^\/api\/reload$/, "not about a board"],
];

/**
 * Who this request writes as.
 *
 * A pane sends its client id, and that id is what makes the lock reentrant: the
 * hold taken for a user edit covers the change report that edit produces 400 ms
 * later. An agent sends none, so it gets a fresh identity per request and takes
 * and releases the board around that one write — which is the per-write mutex.
 *
 * Unless this canvas holds a claim on the board, in which case an agent's write
 * *is* the claim's, and that is the whole of how a claim survives across
 * requests (ADR 0016, TASK-080). Nothing is threaded through the caller: a CLI
 * agent is a fresh process every command and has nowhere to keep an id, so the
 * canvas keeps it, against the board every call already names. The write joins
 * the claim's hold rather than taking one, so twenty writes leave no gap.
 */
function holderFromRequest(req: Request, board: string): { id: string; kind: "human" | "agent" } {
	const raw = (req.body ?? {}) as Record<string, unknown>;
	// A pane's id may arrive in the query as well as the body, because two of the
	// shell's own writes have no body to put it in: Clear is a DELETE, and both
	// it and Save are a person pressing a button. A write with a pane behind it
	// is that person's, and a person is not made to narrate their own act
	// (TASK-095).
	const body =
		typeof raw.clientId === "string" || typeof req.query.clientId !== "string"
			? raw
			: { ...raw, clientId: req.query.clientId };
	const kind = body.origin === "agent" || typeof body.clientId !== "string" ? "agent" : "human";
	if (kind === "agent") {
		const claimed = claimWriterId(board);
		if (claimed) return { id: claimed, kind };
	}
	const id =
		typeof body.clientId === "string" && body.clientId
			? body.clientId
			: `agent-${Math.random().toString(36).slice(2, 10)}`;
	return { id, kind };
}

/**
 * The board was claimed and a person took it back, and this is the agent
 * finding out.
 *
 * The one place it is said, because the agent has to hear it whatever it does
 * next: writing, or claiming again. Told once — `takeClaimRevocation` clears as
 * it reads — so an agent that has understood can carry on, and the board is not
 * left wedged against the agent that used to hold it.
 *
 * Nothing is rolled back. Every write made under the claim is in the note,
 * because that is what it means for the note to be the board, so the answer
 * says what state the board was left in rather than pretending it can be
 * undone.
 */
function refuseRevokedClaim(res: Response, board: string): boolean {
	const lost = takeClaimRevocation(board);
	if (!lost) return false;
	const who = lost.by?.kind === "human" ? "The person at the canvas" : "Somebody";
	res.status(409).json({
		success: false,
		code: "CLAIM_REVOKED",
		error:
			`${who} took "${board}" back, so your claim${lost.claim.holder.reason ? ` (${lost.claim.holder.reason})` : ""}` +
			" has ended. Everything you had already written is in the note and nothing was undone, so the board is " +
			"part way through whatever you were doing — say what state you left it in rather than carrying on. " +
			"Writing again is an ordinary write, and takes the board only for as long as that write.",
		board,
		claim: lost.claim,
		revokedBy: lost.by,
		...refusalDocument(board),
	});
	return true;
}

app.use((req: Request, res: Response, next: NextFunction) => {
	if (req.method === "GET" || req.method === "HEAD") return next();
	if (!req.path.startsWith("/api/")) return next();
	// A route that is not a board write writes no note, so there is no version
	// for a precondition to be about either. `from-mermaid` is the one to keep in
	// mind: its elements arrive afterwards as the converting pane's own change
	// report, and that report is a board write and is checked like any other.
	if (NOT_A_BOARD_WRITE.some(([pattern]) => pattern.test(req.path))) return next();

	let key: string;
	try {
		key = resolveBoard(boardOfRequest(req), "A write").key;
	} catch {
		// No board named, or one that is not open. The handler refuses better than
		// this can — it knows what the operation was called (ADR 0009).
		return next();
	}

	// An agent whose claim was taken back hears about it here, before anything is
	// written, because "you no longer have this board" is the answer to the write
	// rather than a note attached to a write that went through.
	const writer = holderFromRequest(req, key);
	res.locals.boardWriterKind = writer.kind;
	if (writer.kind === "agent" && refuseRevokedClaim(res, key)) return;

	// Which version this write says it is against (TASK-091). One that is not a
	// number is refused before the board is taken: it is a malformed request
	// rather than a conflict, and nothing should wait on a lock to be told so.
	// What the canvas remembers telling this writer is read later, under the
	// lock, because that half can move while a write waits for the board.
	const stated = statedVersion(req.query.expectVersion, writer.kind);
	if (!stated.ok) {
		res
			.status(400)
			.json({ success: false, code: "BAD_EXPECTED_VERSION", error: stated.problem, board: key });
		return;
	}

	// And what the board turned out to be is what this writer has now been told,
	// which is what its next write will be checked against. On `finish` and only
	// on success, beside the `doing` announcement and for the same reason. The
	// three write-boundary refusals carry their own current document and version.
	res.on("finish", () => {
		if (res.statusCode >= 400) return;
		if (writer.kind !== "agent" || claimWriterId(key) !== writer.id) return;
		if ("writtenBoardVersion" in res.locals) {
			rememberVersion(writer.id, res.locals.writtenBoardVersion as number | null);
		} else {
			rememberVersionAt(writer.id, boards.get(key)?.file);
		}
	});

	// And an agent says what it is doing, on this write, before it takes the
	// board. Same boundary as the lock and for the same reason: this is the one
	// place that knows a request is a board write, so a route added later cannot
	// be the one that got away with saying nothing.
	let said: string | null = null;
	if (writer.kind === "agent") {
		const check = checkDoing(req.query.doing);
		if (!check.ok) return refuseUndescribedWrite(res, key, req.path, check.problem);
		said = check.doing;
	}

	// Said as the write lands, not before it: a refusal narrates nothing, and a
	// pane that showed intended writes as completed writes would be inaccurate.
	if (said !== null) {
		const doing = said;
		res.on("finish", () => {
			if (res.statusCode >= 400) return;
			announceDoing(key, {
				doing,
				at: new Date().toISOString(),
				by: writer.id,
				kind: writer.kind,
				claimed: claimWriterId(key) === writer.id,
			});
		});
	}

	void holdBoard({ board: key, holder: writer })
		.then((hold) => {
			// Under the lock, so no other archboard writer can land between the
			// version being read and the note being written; before `next()`, so a
			// refusal writes nothing (TASK-091). The board is given straight back:
			// the handlers that would do that on `finish` are registered below this,
			// and a request that never reaches the handler never took the board for
			// any longer than this line.
			const rememberedBy =
				writer.kind === "agent" && claimWriterId(key) === writer.id ? writer.id : undefined;
			const conflict = checkBoardVersion({
				board: key,
				file: boards.get(key)?.file,
				writesNote: writesBoardNote(key),
				...(stated.expected !== undefined ? { stated: stated.expected } : {}),
				...(rememberedBy ? { rememberedBy } : {}),
			});
			if (conflict) {
				res.status(409).json({
					success: false,
					code: "BOARD_VERSION_CONFLICT",
					error: conflict.message,
					versionConflict: conflict,
					...refusalDocument(key),
				});
				if (hold.created) releaseHold(key, hold.holder.id);
				return;
			}
			if (hold.created) {
				let given = false;
				const give = (): void => {
					if (given) return;
					given = true;
					releaseHold(key, hold.holder.id);
				};
				// Both, because a client that hangs up mid-write never finishes the
				// response, and a board held by a request nobody is listening to is a
				// board held until the lease lapses.
				res.on("finish", give);
				res.on("close", give);
			}
			next();
		})
		.catch((error) => {
			answerBoardError(res, error);
		});
});

/**
 * A person has started changing this board, and wants it.
 *
 * The message the pane sends on the leading edge of a content edit. The first
 * progress report is due after REPORT_PROGRESS_MS even during a continuous
 * gesture, and renewal every LOCK_RENEW_MS keeps the lease alive while content
 * remains pending.
 *
 * It waits, but only for as long as the pane was going to sit on the change
 * anyway. An agent's per-write hold is about twenty milliseconds, and a user
 * edit that starts during one is not somebody who has lost the board — telling
 * them so and discarding their edit would make the pane reject a user edit,
 * which is the thing ADR 0016 forbids in as many words. So the
 * wait is the progress deadline: a person is going to be 400 ms from having their
 * change written whatever this answers, and anything still holding the board at
 * the end of that is a real holder rather than a write in flight.
 *
 * Not the agent's five seconds, for the other half of the same reason. A person
 * cannot be made to wait that long to find out whether their edit was accepted.
 */
app.post("/api/boards/hold", (req: Request, res: Response) => {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Holding a board");
		const body = (req.body ?? {}) as { clientId?: unknown; reason?: unknown };
		if (typeof body.clientId !== "string" || !body.clientId) {
			return res.status(400).json({
				success: false,
				error:
					"A hold needs a clientId: the lock is reentrant by holder, and an unnamed holder cannot be renewed or released.",
			});
		}
		const holder = {
			id: body.clientId,
			kind: "human" as const,
			...(typeof body.reason === "string" && body.reason ? { reason: body.reason } : {}),
		};
		// And it takes a claimed board back. The lock excludes writers from each
		// other; it does not lock somebody out of their own board, and an agent
		// that has claimed a board for ten minutes must not be able to make the
		// pane reject that user's edits (ADR 0016). Only a
		// claim: an unclaimed agent hold is one write and is waited out above.
		void holdBoard({ board: key, holder, waitMs: REPORT_PROGRESS_MS, revokeClaim: true })
			.then((hold) =>
				res.json({ success: true, board: key, holder: hold.holder, created: hold.created }),
			)
			.catch((error) => answerBoardError(res, error));
	} catch (error) {
		answerBoardError(res, error);
	}
});

/**
 * They have stopped, the change has been written, and the board can go.
 *
 * A person's hold covers one edit and not a session (ADR 0016): holding it for as
 * long as a board is on screen would block every agent for as long as anybody
 * has the board open. The pane sends this once its report has landed and
 * nothing new has arrived since.
 *
 * Idempotent, and it releases nothing that is not this holder's. A pane that
 * dies without sending it costs one lease.
 */
app.post("/api/boards/hold/release", (req: Request, res: Response) => {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Releasing a board");
		const body = (req.body ?? {}) as { clientId?: unknown };
		if (typeof body.clientId !== "string" || !body.clientId) {
			return res
				.status(400)
				.json({ success: false, error: "A release needs the clientId that took the hold." });
		}
		res.json({ success: true, board: key, released: releaseHold(key, body.clientId) });
	} catch (error) {
		answerBoardError(res, error);
	}
});

/**
 * An agent is about to redraw this board and wants it until it says otherwise.
 *
 * The per-write lock fits most of what an agent does. It does not fit twenty
 * writes that only make sense together: taking and releasing the board twenty
 * times leaves nineteen gaps for somebody else to write into, and the board is
 * never in one consistent state while it is being built (ADR 0016).
 *
 * Claiming again extends: the same claim, a later deadline, and a reason that
 * can be brought up to date with what the agent is now doing. A write does not
 * extend it, because the expiry exists to bound a working agent and would bound
 * nothing if the work moved it.
 *
 * It waits for a person mid-edit like any other writer, and it is refused if
 * they are still there. A claim is not a way past the human at the canvas.
 */
app.post("/api/boards/claim", (req: Request, res: Response) => {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Claiming a board");
		const body = (req.body ?? {}) as { reason?: unknown; forMs?: unknown };
		if (typeof body.reason !== "string" || !body.reason.trim()) {
			return res.status(400).json({
				success: false,
				error:
					"A claim needs a reason: it is what the pane shows the person whose board you have taken. " +
					"Without it the pane has stopped accepting edits for no reason they can see.",
			});
		}
		// An agent that lost the board hears that before it is given another one,
		// or it would claim its way straight back onto a board somebody just took.
		if (refuseRevokedClaim(res, key)) return;

		const forMs =
			typeof body.forMs === "number" && Number.isFinite(body.forMs) ? body.forMs : undefined;
		void claimBoard({
			board: key,
			reason: body.reason.trim(),
			...(forMs !== undefined ? { forMs } : {}),
		})
			.then(({ claim, created }) => {
				// Taking the board is the first thing the canvas tells this agent about
				// it, so it is where the record of what the agent has seen starts
				// (TASK-091). Without the seed the first write under a claim would be
				// the one write nothing checked, and the rest of the claimed work may
				// depend on it.
				const file = boards.get(key)?.file;
				const version = created
					? rememberVersionAt(claim.holder.id, file)
					: file
						? versionOfNoteAt(file)
						: null;
				res.json({ success: true, board: key, claim, created, version });
			})
			.catch((error) => answerBoardError(res, error));
	} catch (error) {
		answerBoardError(res, error);
	}
});

/**
 * The agent is done, and the board goes back to being taken one write at a
 * time.
 *
 * Idempotent: releasing a claim that has expired, or that somebody took back,
 * answers `released: false` rather than failing. An agent tidying up after
 * losing the board is doing the right thing a moment late.
 */
app.post("/api/boards/claim/release", (req: Request, res: Response) => {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Releasing a claim");
		const claim = releaseClaim(key);
		res.json({ success: true, board: key, released: claim !== null, claim });
	} catch (error) {
		answerBoardError(res, error);
	}
});

// API Routes

// Get all elements
app.get("/api/elements", (req: Request, res: Response) => {
	try {
		const { key, content } = boardFromRequest(req, "Listing elements");
		const elementsArray = presentElements(content.elements.values());
		res.json({
			success: true,
			board: key,
			elements: elementsArray,
			count: elementsArray.length,
		});
	} catch (error) {
		answerBoardError(res, error, "Error fetching elements:");
	}
});

// Create new element
app.post("/api/elements", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Creating an element");
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ stored: ServerElement }>(() => ({
				input: { upserts: [req.body], origin: "agent" },
				value: (applied) => ({ stored: applied.named[0] as ServerElement }),
			})),
			afterPersist: ({ value }) => {
				logger.info("Creating element via API", { type: value.stored.type, board: source.key });
			},
			answer: ({ content, value, delta, written }) => ({
				success: true,
				board: source.key,
				element: presentElement(value.stored),
				// `element` is what the caller asked for; `elements` is what the board
				// became, label and z-order included (TASK-075).
				...agentWriteAnswer(
					source.board,
					content,
					[...delta.created, ...delta.updated],
					wantsDocument(req),
					written,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error creating element:");
	}
});

// Update element
app.put("/api/elements/:id", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Updating an element");
		const { id } = req.params;
		const body = req.body && typeof req.body === "object" ? req.body : {};

		if (typeof id !== "string" || !id) {
			return res.status(400).json({
				success: false,
				error: "Element ID is required",
			});
		}

		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ touched: ServerElement[] }>((content) => {
				if (!content.elements.has(id)) {
					throw new BoardMutationError(404, `Element with ID ${id} not found`);
				}
				return {
					input: { upserts: [{ ...body, id }], origin: "agent" },
					value: (applied) => {
						const touched = new Map(
							[...applied.created, ...applied.updated].map((element) => [element.id, element]),
						);
						touched.set(id, applied.named[0] as ServerElement);
						return { touched: Array.from(touched.values()) };
					},
				};
			}),
			answer: ({ content, value, written }) => ({
				success: true,
				board: source.key,
				element: presentElement(content.elements.get(id) as ServerElement),
				...agentWriteAnswer(source.board, content, value.touched, wantsDocument(req), written),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error updating element:");
	}
});

// Clear all elements (must be before /:id route)
app.delete("/api/elements/clear", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Clearing a board");
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: (content) => {
				const deleted = Array.from(content.elements.keys());
				content.elements.clear();
				return {
					value: { count: deleted.length },
					delta: { deleted },
				};
			},
			afterPersist: ({ value }) => {
				// Nothing is on this board, so nothing on it can be selected in any
				// pane showing it. A pane on another board keeps its pick.
				for (const [clientId] of selectionState.byClient) {
					if (paneBoards.get(clientId) === source.key) selectionState.byClient.delete(clientId);
				}
				const owner = selectionState.current?.clientId;
				if (owner && paneBoards.get(owner) === source.key) {
					selectionState.current = null;
					broadcastSelection();
				}
				logger.info(`Canvas cleared: ${value.count} elements removed from board "${source.key}"`);
			},
			answer: ({ value }) => ({
				success: true,
				board: source.key,
				message: `Cleared ${value.count} elements`,
				count: value.count,
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error clearing canvas:");
	}
});

// Delete element
app.delete("/api/elements/:id", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Deleting an element");
		const { id } = req.params;

		if (typeof id !== "string" || !id) {
			return res.status(400).json({
				success: false,
				error: "Element ID is required",
			});
		}

		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ deleted: string[] }>((content) => {
				if (!content.elements.has(id)) {
					throw new BoardMutationError(404, `Element with ID ${id} not found`);
				}
				return {
					input: { deletes: [id], origin: "agent" },
					value: (applied) => ({ deleted: applied.deleted }),
				};
			}),
			answer: ({ content, value, delta, written }) => ({
				success: true,
				board: source.key,
				message: `Element ${id} deleted successfully`,
				...(value.deleted.length > 1 ? { alsoDeleted: value.deleted.slice(1) } : {}),
				...agentWriteAnswer(source.board, content, delta.updated, wantsDocument(req), written),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error deleting element:");
	}
});

// Query elements with filters
app.get("/api/elements/search", (req: Request, res: Response) => {
	try {
		const { content } = boardFromRequest(req, "Querying elements");
		const { type, x_min, x_max, y_min, y_max, board: _boardParam, ...filters } = req.query;
		let results = Array.from(content.elements.values());

		// Filter by type if specified
		if (type && typeof type === "string") {
			results = results.filter((element) => element.type === type);
		}

		// Filter by bounding box if specified. An element is in the region when
		// any part of it is, measured from its path where it has one — asking
		// where an arrow starts is not asking where it goes (TASK-044).
		if (x_min !== undefined || x_max !== undefined || y_min !== undefined || y_max !== undefined) {
			const region = {
				xMin: x_min !== undefined ? Number(x_min) : -Infinity,
				xMax: x_max !== undefined ? Number(x_max) : Infinity,
				yMin: y_min !== undefined ? Number(y_min) : -Infinity,
				yMax: y_max !== undefined ? Number(y_max) : Infinity,
			};
			results = results.filter((el) => overlapsRegion(el, region));
		}

		// Apply additional exact-match filters
		if (Object.keys(filters).length > 0) {
			results = results.filter((element) => {
				return Object.entries(filters).every(([key, value]) => {
					return (element as unknown as Record<string, unknown>)[key] === value;
				});
			});
		}

		res.json({
			success: true,
			elements: presentElements(results),
			count: results.length,
		});
	} catch (error) {
		answerBoardError(res, error, "Error querying elements:");
	}
});

// Get element by ID
app.get("/api/elements/:id", (req: Request, res: Response) => {
	try {
		const { content } = boardFromRequest(req, "Getting an element");
		const elements = content.elements;
		const { id } = req.params;

		if (typeof id !== "string" || !id) {
			return res.status(400).json({
				success: false,
				error: "Element ID is required",
			});
		}

		const element = elements.get(id);

		if (!element) {
			return res.status(404).json({
				success: false,
				error: `Element with ID ${id} not found`,
			});
		}

		res.json({
			success: true,
			element: presentElement(element),
		});
	} catch (error) {
		answerBoardError(res, error, "Error fetching element:");
	}
});

// Batch create elements
app.post("/api/elements/batch", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Creating elements");
		const { elements: elementsToCreate } = req.body;

		if (!Array.isArray(elementsToCreate)) {
			return res.status(400).json({
				success: false,
				error: "Expected an array of elements",
			});
		}

		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ count: number }>(() => ({
				input: { upserts: elementsToCreate, origin: "agent" },
				value: (applied) => ({ count: applied.created.length }),
			})),
			answer: ({ content, value, delta, written }) => ({
				success: true,
				board: source.key,
				count: value.count,
				// `elements` here has always been what the write produced; the
				// fingerprint and the opt-in document are what TASK-075 adds.
				...agentWriteAnswer(
					source.board,
					content,
					[...delta.created, ...delta.updated],
					wantsDocument(req),
					written,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error batch creating elements:");
	}
});

// Convert Mermaid diagram to Excalidraw elements
app.post("/api/elements/from-mermaid", (req: Request, res: Response) => {
	try {
		const { mermaidDiagram, config } = req.body;

		if (!mermaidDiagram || typeof mermaidDiagram !== "string") {
			return res.status(400).json({
				success: false,
				error: "Mermaid diagram definition is required",
			});
		}

		logger.info("Received Mermaid conversion request", {
			diagramLength: mermaidDiagram.length,
			hasConfig: !!config,
		});

		// Conversion happens in the browser, and the elements land on whatever
		// board the converting pane is holding. So the pane is decided by the board
		// the caller already named (ADR 0009), not by which pane happens to be
		// first: a proposal drawn on the right must not need the current
		// architecture taken off the left to make room for it (TASK-046).
		const { key: wanted } = boardFromRequest(req, "Mermaid conversion");

		// This route is exempt from the lock, not from saying what it is doing.
		// Only an agent ever calls it — a pane converts nothing on its own — so
		// there is nobody here to exempt. Asked before the pane, because a caller
		// that has said nothing has not got as far as needing one.
		const said = checkDoing(req.query.doing);
		if (!said.ok) return refuseUndescribedWrite(res, wanted, req.path, said.problem);

		if (panes.size === 0) {
			return res.status(503).json({
				success: false,
				code: "BROWSER_REQUIRED",
				error:
					"No browser is open, and mermaid conversion happens in the browser. Open the canvas first.",
			});
		}
		const pane = paneShowing(wanted);
		if (!pane) {
			// The board exists, it is just not on screen, and conversion needs a
			// canvas to run in. Two ways to give it one, and which is available
			// depends on whether there is still room on the display.
			const room =
				panes.size < MAX_PANES
					? `Put it beside ${panes.size === 1 ? "that one" : "those"} with \`archboard pane open --board ${wanted}\`, `
					: `Put it on screen with \`board open ${wanted} --pane <left|right>\`, `;
			return res.status(409).json({
				success: false,
				error:
					`Mermaid converts in the pane holding the board, and no pane is holding "${wanted}". ` +
					`Nothing was converted. Panes on screen: ${panesShowingList()}. ` +
					`${room}then convert again.`,
			});
		}

		sendToPane(
			pane.clientId,
			{
				type: "mermaid_convert",
				mermaidDiagram,
				config: config || {},
				timestamp: new Date().toISOString(),
			},
			wanted,
		);
		changeFeed.expectAgentEcho(wanted);
		// Said here rather than by the middleware, because this route is outside
		// it: the write arrives afterwards as the converting pane's own change
		// report, which is a person's shape and carries nothing. The agent still
		// asked for it, so the agent still says what it is doing (TASK-095).
		const writer = holderFromRequest(req, wanted);
		announceDoing(wanted, {
			doing: said.doing,
			at: new Date().toISOString(),
			by: writer.id,
			kind: writer.kind,
			claimed: claimWriterId(wanted) === writer.id,
		});

		// Return the diagram for frontend processing, and name the pane it went
		// to, the way `board open` names the pane a board landed in.
		const place =
			panesInOrder(Array.from(panes.values())).find(
				(entry) => entry.pane.clientId === pane.clientId,
			)?.place ?? "the only pane";
		res.json({
			success: true,
			board: wanted,
			...paneResponse(pane),
			mermaidDiagram,
			config: config || {},
			message: `Mermaid diagram sent to ${paneWords(place)}, which is holding "${wanted}", for conversion.`,
		});
	} catch (error) {
		answerBoardError(res, error, "Error processing Mermaid diagram:");
	}
});

// ─── Change reports from the browser ──────────────────────────
//
// The browser reports what changed; the server decides what the board is.
//
// This replaces POST /api/elements/sync, which cleared the board's element map
// and refilled it from whatever a tab happened to be holding. That made every
// tab the authority on the entire board on every keystroke, so a tab that was
// stale, still loading, or showing a board mid-switch could truncate work it
// had never seen. Nothing here can do that: the server removes only ids a
// client names explicitly, and a client can only name ids it received in the
// first place.
//
// Upserts are merged, not substituted, so server-side fields the browser does
// not model — createdAt, the monotonic version, anything a later feature
// stamps on an element — survive a human dragging the shape.
//
// It is also the one route an agent writes a whole intent through. Aligning
// twenty boxes is one thing somebody asked for, and it costs one write here
// rather than twenty (ADR 0015, TASK-068). Who is writing decides two things
// and nothing else — see `origin`.
const ElementChangesSchema = z.object({
	upserts: z.array(z.record(z.string(), z.any())).default([]),
	deletes: z.array(z.string()).default([]),
	/**
	 * Who is writing. Absent means the browser, which was this route's only
	 * writer when it was written: its elements are stamped `frontend_sync` and
	 * the feed is told a human moved them.
	 *
	 * An agent says so and gets neither. Stamping its own drawing `frontend_sync`
	 * would make it indistinguishable from a user edit, and calling it human
	 * to the feed would make it eligible to be narrated back into the agent's own
	 * thread (ADR 0005).
	 */
	origin: z.enum(["human", "agent"]).default("human"),
	clientId: z.string().optional(),
	timestamp: z.string().optional(),
	/**
	 * "This is the whole board, as it stands on my screen."
	 *
	 * The one thing a pane is otherwise never allowed to say (TASK-016): a pane
	 * sends a delta against what it has been sent, so that a stale or half-loaded
	 * tab cannot name — and so cannot delete — an element it has never seen.
	 *
	 * It is allowed on a board that has stopped saving, and nowhere else. The
	 * note there belongs to another editor, so the board archboard would
	 * otherwise hold is their scene plus the last pending user edit, which
	 * is not what anybody is looking at and not what the three outcomes should
	 * act on. The pane sends its full scene once, and from then on overwrite
	 * means what CLAUDE.md's table says it means. Nothing is written to the vault
	 * by it — a held board writes to nothing — so the worst a wrong one can do is
	 * change what a human sees they are about to choose between.
	 */
	fullReport: z.boolean().default(false),
});

/** Did this caller ask for the whole board? Off unless said, on every surface. */
function wantsDocument(req: Request): boolean {
	const asked =
		req.query.document ??
		(req.body && typeof req.body === "object" ? req.body.document : undefined);
	return asked === true || asked === "1" || asked === "true";
}

app.post("/api/elements/changes", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "A change report");
		const { upserts, deletes, origin, clientId, timestamp, fullReport } =
			ElementChangesSchema.parse(req.body ?? {});
		const writerKind = res.locals.boardWriterKind as "human" | "agent";
		answerBoardWrite(res, {
			source,
			origin,
			clientId,
			mutation: elementMutation<null>((_content) => {
				// A pane may send its whole screen only while this board is held. The
				// check and the clear both happen inside the isolated mutation, before
				// any note can be written.
				if (fullReport && writerKind === "agent") {
					throw new BoardMutationError(
						400,
						"A full report is a pane sending its whole scene. An agent must send a delta.",
					);
				}
				if (fullReport && !isHeld(source.key)) {
					throw new BoardMutationError(
						400,
						`"${source.key}" is saving normally, so a full report would be a whole-scene write. ` +
							"Report a delta against what this pane has been sent.",
					);
				}
				return {
					input: { upserts, deletes, origin, timestamp },
					wholeScene: fullReport,
					value: () => null,
				};
			}),
			afterPersist: ({ content, delta }) => {
				logger.info(
					`Change report from ${clientId ?? (writerKind === "agent" ? "an agent" : "an unidentified client")} ` +
						`on "${source.key}": ` +
						`+${delta.created.length} ~${delta.updated.length} -${delta.deleted.length} ` +
						`(${content.elements.size} on the board)`,
				);
			},
			answer: (context) => {
				const { content, delta, written, appliedAt } = context;
				return {
					success: true,
					board: source.key,
					created: delta.created.length,
					updated: delta.updated.length,
					deleted: delta.deleted.length,
					count: content.elements.size,
					appliedAt,
					// An agent keeps the established pessimistic answer. A pane gets a
					// compact post-persistence acknowledgement, except for the explicit
					// held-board full-report recovery path (TASK-074/075/118).
					...(writerKind === "agent"
						? agentWriteAnswer(
								source.board,
								content,
								[...delta.created, ...delta.updated],
								wantsDocument(req),
								written,
							)
						: humanWriteAnswer(context, fullReport)),
				};
			},
		});
	} catch (error) {
		answerBoardError(res, error, "Error applying a change report:");
	}
});

// ─── Change feed ──────────────────────────────────────────────
//
// Semantic changes, not element deltas: what the board *became*, said in the
// same vocabulary `compare` uses. See core/change-feed.ts for why an event
// exists at all — briefly, a drag is one event, at rest, or none at all.
//
// Two shapes, because there are two consumers:
//   ?since=N            the events after cursor N, for something watching live
//   ?since=N&coalesce=1 one diff from cursor N to now, for a per-turn hook that
//                       wants the net difference rather than a replay to merge
//
// `detail` (the whole compare result) is off unless asked: it is complete and
// therefore large, and the narration in `text` is what most callers use.
app.get("/api/changes", (req: Request, res: Response) => {
	try {
		const since = Number(req.query.since ?? 0);
		if (!Number.isFinite(since) || since < 0) {
			return res
				.status(400)
				.json({ success: false, error: "since must be a cursor from a previous response" });
		}
		const { key: board } = boardFromRequest(req, "changes");
		const wantDetail = req.query.detail === "1" || req.query.detail === "true";
		const coalesce = req.query.coalesce === "1" || req.query.coalesce === "true";
		// A caller reading the feed wants the board as it is, not as it was 1.2s
		// ago, so pending settle work is completed before answering.
		if (req.query.settle !== "0") changeFeed.settle(board);

		// A cursor ahead of the feed's own is not "nothing has happened": it came
		// from a previous canvas process, since the board lives in memory and the
		// count restarts with it. Saying "nothing changed" to that would be the
		// most damaging wrong answer available.
		if (since > changeFeed.cursor) {
			return res.json({
				success: true,
				board,
				feedId: changeFeed.status().feedId,
				cursor: changeFeed.cursor,
				events: [],
				...(coalesce ? { coalesced: null } : {}),
				truncated: true,
				message:
					`Cursor ${since} is ahead of this feed (now at ${changeFeed.cursor}), so it was issued by a previous ` +
					"canvas process — the board is held in memory and the count restarts with the server. Treat this as " +
					"a fresh start: take the cursor in this response, and read the board with `describe`. Watch `feedId` " +
					"to notice the next restart.",
			});
		}

		const strip = (event: ChangeEvent) =>
			wantDetail ? event : { ...event, change: { ...event.change, detail: undefined } };

		if (coalesce) {
			const net = changeFeed.coalesce(since, board);
			if (!net) {
				return res.json({
					success: true,
					board,
					cursor: changeFeed.cursor,
					coalesced: null,
					truncated: true,
					message:
						`Cursor ${since} is older than the change feed's memory of board "${board}", so the net diff ` +
						"since then cannot be computed. Take the cursor in this response as a fresh start, and read " +
						"the board itself with `describe` if you need to know where things stand.",
				});
			}
			return res.json({
				success: true,
				board,
				feedId: changeFeed.status().feedId,
				cursor: net.cursor,
				since: net.since,
				events: net.events.map(strip),
				coalesced: {
					significance: net.change.significance,
					headline: net.change.headline,
					text: narrateChange(net.change),
					counts: net.change.counts,
					nodes: net.change.nodes,
					edges: net.change.edges,
					layout: net.change.layout,
					warnings: net.change.warnings,
					...(wantDetail ? { detail: net.change.detail } : {}),
				},
			});
		}

		res.json({
			success: true,
			board,
			feedId: changeFeed.status().feedId,
			cursor: changeFeed.cursor,
			events: changeFeed.since(since, board).map(strip),
			feed: changeFeed.status(),
			injection: injectionStatus(),
		});
	} catch (error) {
		logger.error("Error reading the change feed:", error);
		res.status(400).json({ success: false, error: (error as Error).message });
	}
});

// ─── Injection (push to a live Codex thread) ──────────────────
//
// Read-only status, plus a probe. Arming is NOT a request the canvas can
// serve: it happens at startup, from ARCHBOARD_INJECT and the bound address,
// because an HTTP endpoint that could switch it on would be exactly the hole
// ADR 0005 is about.
app.get("/api/injection", (_req: Request, res: Response) => {
	res.json({ success: true, ...injectionStatus() });
});

app.post("/api/injection/test", async (req: Request, res: Response) => {
	try {
		const note = typeof req.body?.note === "string" ? req.body.note : undefined;
		const loud = req.body?.loud === true ? true : req.body?.loud === false ? false : undefined;
		const result = await injectTest(note, loud);
		res.json({ success: true, ...result });
	} catch (error) {
		res
			.status(409)
			.json({ success: false, error: (error as Error).message, status: injectionStatus() });
	}
});

// ─── Selection ────────────────────────────────────────────────
//
// Selection is what a human has picked on the board, and it changes on every
// click — far more often than the scene itself. So it gets its own channel
// rather than riding the debounced element sync: the browser posts ids only
// (tens of bytes), and reading it back never re-transmits the scene.
//
// One selection per pane, keyed by client id, plus a last-writer-wins `current`
// for the callers that ask for "the selection" without naming a pane. When a
// client disconnects its selection is dropped with it.

const SelectionSchema = z.object({
	elementIds: z.array(z.string()),
	clientId: z.string().min(1),
});

// Boardless: a selection names the client that made it, and a pane that reads
// this decides what to do with it by whose it is, not by which board it is on.
// Tagging it with a board would only give panes on other boards a reason to
// drop a message that was never about their board in the first place.
function broadcastSelection(): void {
	const current = selectionState.current;
	broadcastBoardless({
		type: "selection_changed",
		elementIds: current?.elementIds ?? [],
		clientId: current?.clientId ?? null,
		at: current?.at ?? new Date().toISOString(),
	});
}

app.post("/api/selection", (req: Request, res: Response) => {
	const parsed = SelectionSchema.safeParse(req.body);
	if (!parsed.success) {
		return res
			.status(400)
			.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid selection" });
	}

	const { elementIds, clientId } = parsed.data;
	const at = new Date().toISOString();
	selectionState.current = elementIds.length === 0 ? null : { elementIds, clientId, at };
	// Per pane, an empty selection is a fact about that pane rather than the
	// absence of one: the human deselected *there* while another pane may still
	// hold something.
	if (elementIds.length === 0) selectionState.byClient.delete(clientId);
	else selectionState.byClient.set(clientId, { elementIds, clientId, at });

	logger.info(`Selection from ${clientId}: ${elementIds.length} element(s)`);
	broadcastSelection();

	res.json({
		success: true,
		count: elementIds.length,
		elementIds,
	});
});

app.get("/api/selection", (_req: Request, res: Response) => {
	// Named out of the board the selecting pane is holding, which with two panes
	// on two boards is the only place those ids exist. No resolution and no
	// ambiguity: whoever picked the elements settles which board they are on.
	const owner = selectionState.current?.clientId;
	const key = (owner ? paneBoards.get(owner) : undefined) ?? SCRATCH_KEY;
	const board = boards.get(key);
	const report = buildSelectionReport(
		selectionState.current,
		board ? presentElements(boardElements(board)) : [],
		clients.size,
	);
	res.json({ success: true, board: key, ...report });
});

// ─── Panes ────────────────────────────────────────────────────
//
// What the human is currently looking at: which pane holds which board, where
// it sits on the display, how much of the board is on screen, and what is picked
// in it. View state, never contents — see core/panes.ts for why that line is
// worth holding.
//
// Like selection, this is pushed by the browser and read back off the server,
// so reading it costs a map lookup and never a browser round-trip.

const RectSchema = z.object({
	x: z.number(),
	y: z.number(),
	width: z.number(),
	height: z.number(),
});

const PaneSchema = z.object({
	clientId: z.string().min(1),
	paneId: z.string().min(1),
	// The board this pane adopted — what it is actually rendering, which is what
	// makes the report a description of the displayed scene rather than an echo
	// of what
	// the server thinks it sent.
	board: z.string().min(1),
	primary: z.boolean(),
	focused: z.boolean(),
	elementCount: z.number().int().nonnegative(),
	rect: RectSchema,
	viewport: RectSchema.extend({ zoom: z.number().positive() }),
	// Which bundle this tab is running. Optional: a tab from before this existed,
	// and anything that is not a browser, simply says nothing and hears nothing.
	build: z.string().optional(),
});

// A pane says what it is showing, and hears back whether it is out of date.
//
// This is the pulse a browser already has. A pane posts here when it connects,
// on every change, and on every scroll, resize and zoom, so a tab that was
// opened before somebody rebuilt the frontend finds out at its next
// interaction. The alternative on offer was for the tab to discover it by
// having a command time out on it ten seconds later, which is what used to
// happen and what TASK-056 is about.
app.post("/api/panes", (req: Request, res: Response) => {
	const parsed = PaneSchema.safeParse(req.body);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const field = issue?.path.length ? issue.path.join(".") : "request";
		return res.status(400).json({
			success: false,
			error: `Invalid pane telemetry at ${field}: ${issue?.message ?? "invalid value"}`,
		});
	}
	const frontend = frontendState(parsed.data.build);
	const staleFrontend = frontend.stale ? frontend : undefined;
	const registration: PaneRegistration = { ...parsed.data, at: new Date().toISOString() };
	// A pane exists exactly as long as its socket. A report arriving without one
	// is a pane on its way out — React tears the canvas down in its own order, so
	// a last change can be reported after the close — and registering it would
	// resurrect the ghost the close just retired.
	const live = Array.from(clientIds.values()).includes(registration.clientId);
	if (!live) {
		return res.json({ success: true, registered: false, paneCount: panes.size, staleFrontend });
	}
	const isNew = !panes.has(registration.clientId);
	panes.set(registration.clientId, registration);
	// A pane that was asked for has arrived. Registration is the acknowledgement
	// — see the pane layout section below for why it is that and not a reply.
	if (isNew) notePaneOpened(registration);
	res.json({ success: true, registered: true, paneCount: panes.size, staleFrontend });
});

app.get("/api/panes", (_req: Request, res: Response) => {
	const report = buildPanesReport(Array.from(panes.values()), {
		identity: (key) => boards.get(key)?.identity ?? null,
		elements: (key) => {
			const board = boards.get(key);
			return board ? presentElements(boardElements(board)) : [];
		},
		selection: (clientId) => selectionState.byClient.get(clientId) ?? null,
		canvasUrl: `http://${formatHostForUrl(HOST)}:${PORT}`,
	});
	res.json({ success: true, ...report });
});

// ─── Pane layout ──────────────────────────────────────────────
//
// Layout lives in the shell, in the browser, and the server used to learn a
// pane existed only when its socket registered. That made splitting something
// only a user could do: an agent told to put a proposal beside the current
// architecture had no second pane and no way to ask for one, so it reused the
// pane in front of the human and overwrote what was there (TASK-033).
//
// These two routes ask the browser to change its layout and then wait for the
// registry to agree. The acknowledgement is the pane appearing in `panes` or
// its socket closing — never a promise from the shell — because a registration
// is the only evidence anywhere in this file that a pane exists.

// How long these two routes wait is in core/timing.ts, because the settle cap
// is waiting out PANE_DEBOUNCE_MS, which is a number on the other side of the
// browser boundary. PANE_LAYOUT_TIMEOUT_MS and PANE_SETTLE_CAP_MS are there
// with the reasoning that used to be here.

interface PendingPaneOpen {
	resolve: (pane: PaneRegistration) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
	/** The panes that already existed, so the new one can be told from them. */
	known: Set<string>;
}
const pendingPaneOpens = kept("pending-pane-opens", () => new Set<PendingPaneOpen>());

interface PendingPaneClose {
	clientId: string;
	resolve: () => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}
const pendingPaneCloses = kept("pending-pane-closes", () => new Set<PendingPaneClose>());

function notePaneOpened(registration: PaneRegistration): void {
	for (const pending of [...pendingPaneOpens]) {
		if (pending.known.has(registration.clientId)) continue;
		pendingPaneOpens.delete(pending);
		clearTimeout(pending.timeout);
		pending.resolve(registration);
	}
}

function notePaneClosed(clientId: string): void {
	for (const pending of [...pendingPaneCloses]) {
		if (pending.clientId !== clientId) continue;
		pendingPaneCloses.delete(pending);
		clearTimeout(pending.timeout);
		pending.resolve();
	}
}

/** No pane means no browser, which is a different thing from a bad request. */
function noBrowserBody(what: string): Record<string, unknown> {
	return {
		success: false,
		code: "BROWSER_REQUIRED",
		error:
			`${what} needs a canvas open in a browser. A pane exists only while a tab is rendering it, ` +
			`so there is nothing on screen to split or close. Open http://${formatHostForUrl(HOST)}:${PORT} and retry.`,
	};
}

/**
 * Wait until every pane has reported itself since the layout was asked for.
 *
 * The answer to a layout change names where a pane ended up, and "left" and
 * "right" are read off the rectangles the panes report. So the report has to
 * be the one taken after the shell re-laid them out, not the one from before.
 */
async function settleAfterLayout(askedAt: string): Promise<void> {
	const deadline = Date.now() + PANE_SETTLE_CAP_MS;
	while (Date.now() < deadline) {
		const all = Array.from(panes.values());
		if (all.length > 0 && all.every((pane) => pane.at > askedAt)) return;
		await sleep(50);
	}
}

// Split the canvas: one more pane, side by side with what is already there.
//
// It takes no board. What lands in the new pane is a separate act — `board
// open ... --pane <the pane this answered with>` — so that opening a board
// stays the one thing that decides which board a pane holds (ADR 0009).
app.post("/api/panes/open", async (req: Request, res: Response) => {
	const answering = primaryPane();
	if (!answering) return res.status(503).json(noBrowserBody("Opening a pane"));

	if (panes.size >= MAX_PANES) {
		const showing = panesInOrder(Array.from(panes.values()))
			.map((entry) => `${entry.place} (${paneBoards.get(entry.pane.clientId) ?? entry.pane.board})`)
			.join(", ");
		return res.status(409).json({
			success: false,
			error:
				`The canvas is already showing ${panes.size} panes: ${showing}. ` +
				"Point one of them at another board with `board open <name> --pane <spec>`, " +
				"or close one first with `pane close <spec>`.",
		});
	}

	const askedAt = new Date().toISOString();
	let pending!: PendingPaneOpen;
	const opened = new Promise<PaneRegistration>((resolve, reject) => {
		pending = {
			resolve,
			reject,
			known: new Set(panes.keys()),
			timeout: setTimeout(() => {
				pendingPaneOpens.delete(pending);
				reject(
					new Error(
						"The browser was asked for another pane and none appeared within 10 seconds. " +
							"The tab may be running an older build of the canvas — reload it and try again.",
					),
				);
			}, PANE_LAYOUT_TIMEOUT_MS),
		};
		pendingPaneOpens.add(pending);
	});

	if (!sendLayoutToPane(answering.clientId, { type: "pane_open" })) {
		pendingPaneOpens.delete(pending);
		clearTimeout(pending.timeout);
		return res.status(503).json(noBrowserBody("Opening a pane"));
	}

	try {
		const pane = await opened;
		await settleAfterLayout(askedAt);
		logger.info(`Pane opened on request: ${pane.paneId} (${panes.size} on screen)`);
		res.json({
			success: true,
			...paneResponse(panes.get(pane.clientId) ?? pane),
			paneCount: panes.size,
			onScreen: boardsOnScreen(),
		});
	} catch (error) {
		res.status(504).json({ success: false, error: (error as Error).message });
	}
});

// Close one pane, named the way every other pane is named.
//
// Always named: unlike opening a board, which can only land somewhere visible
// and wrong, closing takes a board off the screen, and guessing which one is
// the mistake that costs the human the half they were reading.
app.post("/api/panes/close", async (req: Request, res: Response) => {
	const spec = typeof req.body?.pane === "string" ? req.body.pane.trim() : "";
	const registrations = Array.from(panes.values());

	if (registrations.length === 0) return res.status(503).json(noBrowserBody("Closing a pane"));

	if (registrations.length === 1) {
		return res.status(409).json({
			success: false,
			error:
				"That is the only pane on screen, and closing it would leave the canvas showing nothing " +
				"with no way back except reloading the browser. Its board is unaffected either way — " +
				"point the pane somewhere else with `board open <name>` instead.",
		});
	}

	let target: PaneRegistration;
	let place: string;
	try {
		if (!spec) {
			throw new Error(
				"Say which pane to close. " +
					panesInOrder(registrations)
						.map((entry) => `\`pane close ${entry.place}\` drops ${entry.pane.board}`)
						.join(", ") +
					".",
			);
		}
		target = resolvePaneSpec(registrations, spec);
		place =
			panesInOrder(registrations).find((entry) => entry.pane.clientId === target.clientId)?.place ??
			spec;
	} catch (error) {
		return res.status(400).json({ success: false, error: (error as Error).message });
	}

	const askedAt = new Date().toISOString();
	let pending!: PendingPaneClose;
	const closed = new Promise<void>((resolve, reject) => {
		pending = {
			clientId: target.clientId,
			resolve,
			reject,
			timeout: setTimeout(() => {
				pendingPaneCloses.delete(pending);
				reject(
					new Error(
						`The browser was asked to close the ${place} pane and it is still there after 10 seconds. ` +
							"The tab may be running an older build of the canvas — reload it and try again.",
					),
				);
			}, PANE_LAYOUT_TIMEOUT_MS),
		};
		pendingPaneCloses.add(pending);
	});

	if (!sendLayoutToPane(target.clientId, { type: "pane_close" })) {
		pendingPaneCloses.delete(pending);
		clearTimeout(pending.timeout);
		return res.status(503).json(noBrowserBody("Closing a pane"));
	}

	try {
		await closed;
		await settleAfterLayout(askedAt);
		logger.info(`Pane closed on request: ${target.paneId} (${panes.size} left on screen)`);
		res.json({
			success: true,
			closed: { paneId: target.paneId, clientId: target.clientId, place, board: target.board },
			paneCount: panes.size,
			onScreen: boardsOnScreen(),
		});
	} catch (error) {
		res.status(504).json({ success: false, error: (error as Error).message });
	}
});

// ─── Files API (for image elements) ───────────────────────────
//
// Board-scoped, like every other route that touches board content. An image is
// board content: it is drawn by an element on one board, and the note that
// board is saved to is where it belongs. These used to be boardless, over one
// map per process keyed by file id, which is what put board B's pictures in
// board A's note (TASK-060, ADR 0009, ADR 0015).

// GET the images one board holds
app.get("/api/files", (req: Request, res: Response) => {
	try {
		const { key, content } = boardFromRequest(req, "Listing images");
		res.json({ success: true, board: key, files: boardFilesMessage(content).files ?? {} });
	} catch (error) {
		answerBoardError(res, error);
	}
});

// POST add/update images on one board (batch)
app.post("/api/files", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Adding an image");
		const body = req.body;
		const fileList: ExcalidrawFile[] = Array.isArray(body) ? body : body?.files || [];
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: (content) => {
				for (const file of fileList) {
					if (file.id && file.dataURL) {
						content.files.set(file.id, {
							id: file.id,
							dataURL: file.dataURL,
							mimeType: file.mimeType || "image/png",
							created: file.created || Date.now(),
						});
					}
				}
				// A note keeps only images an element on this board draws (TASK-060).
				const drawn = new Set(
					Array.from(content.elements.values())
						.map((element) => element.fileId)
						.filter((id): id is string => typeof id === "string"),
				);
				const orphaned = fileList
					.filter((file) => file.id && file.dataURL && !drawn.has(file.id))
					.map((file) => file.id);
				return {
					value: { orphaned },
					delta: { filesAdded: fileList },
				};
			},
			answer: ({ value }) => ({
				success: true,
				board: source.key,
				count: fileList.length - value.orphaned.length,
				...(value.orphaned.length
					? {
							orphaned: value.orphaned,
							warning:
								`No element on "${source.key}" draws ${value.orphaned.join(", ")}, so ` +
								`${value.orphaned.length === 1 ? "it was" : "they were"} not kept: a note holds the images ` +
								"its own elements reference. Create the image element first, then post its data.",
						}
					: {}),
			}),
		});
	} catch (error) {
		answerBoardError(res, error);
	}
});

// DELETE an image from one board
app.delete("/api/files/:id", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Deleting an image");
		const id = req.params.id as string;
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: (content) => {
				if (!content.files.delete(id)) {
					throw new BoardMutationError(404, `No image "${id}" on board "${source.key}".`);
				}
				return {
					value: null,
					delta: { filesDeleted: [id] },
				};
			},
			answer: () => ({ success: true, board: source.key }),
		});
	} catch (error) {
		answerBoardError(res, error);
	}
});

// Image export: request (CLI -> Express -> WebSocket -> Frontend)
interface PendingExport {
	resolve: (data: { format: string; data: string }) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
	collectionTimeout: ReturnType<typeof setTimeout> | null;
	bestResult: { format: string; data: string } | null;
}
const pendingExports = kept("pending-exports", () => new Map<string, PendingExport>());

app.post("/api/export/image", (req: Request, res: Response) => {
	try {
		const { format, background, pane } = req.body ?? {};

		if (!format || !["png", "svg"].includes(format)) {
			return res.status(400).json({
				success: false,
				error: 'format must be "png" or "svg"',
			});
		}

		if (clients.size === 0) {
			return res.status(503).json(noBrowserBody("Taking a picture of the canvas"));
		}

		// Which pane is photographed. Resolved before anything is promised, and
		// named for the same reason the camera is: with a proposal in the second
		// pane, an agent that can only ever picture the first cannot see the thing
		// it just drew (TASK-033).
		const answering =
			typeof pane === "string" && pane.trim()
				? resolvePaneSpec(Array.from(panes.values()), pane)
				: primaryPane();
		if (!answering) {
			return res.status(503).json(noBrowserBody("Taking a picture of the canvas"));
		}

		const requestId = mintId(pendingExports);

		const exportPromise = new Promise<{ format: string; data: string }>((resolve, reject) => {
			const timeout = setTimeout(() => {
				const pending = pendingExports.get(requestId);
				pendingExports.delete(requestId);
				// If we collected any result during the window, use it
				if (pending?.bestResult) {
					resolve(pending.bestResult);
				} else {
					reject(new Error("Export timed out after 30 seconds"));
				}
			}, 30000);

			pendingExports.set(requestId, {
				resolve,
				reject,
				timeout,
				collectionTimeout: null,
				bestResult: null,
			});
		});

		// Re-send the board to the pane that will answer, so a stale tab exports
		// what the server holds rather than what it last happened to render. Sent
		// to that pane alone and carrying that pane's own board: broadcasting it
		// would replace every other pane's scene with this one's board, which is
		// exactly the yank per-pane boards exist to prevent.
		const exportKey = paneBoards.get(answering.clientId) ?? answering.board;
		const exportBoard = boards.get(exportKey);
		if (!exportBoard) {
			return res.status(409).json({
				success: false,
				error: `The pane being pictured is showing "${exportKey}", which this canvas no longer holds.`,
			});
		}
		const exportContent = readBoardContent(exportBoard);
		sendToPane(
			answering.clientId,
			{
				type: "initial_elements",
				board: exportKey,
				identity: exportBoard.identity,
				elements: presentElements(exportContent.elements.values()),
				...boardFilesMessage(exportContent),
			} as InitialElementsMessage & { files?: Record<string, ExcalidrawFile> },
			exportKey,
		);

		// Give the browser time to process the reload before requesting export
		setTimeout(() => {
			sendToPane(
				answering.clientId,
				{
					type: "export_image_request",
					requestId,
					format,
					background: background ?? true,
				},
				exportKey,
			);
		}, 800);

		exportPromise
			.then((result) => {
				res.json({
					success: true,
					format: result.format,
					data: result.data,
				});
			})
			.catch((error) => {
				res.status(500).json({
					success: false,
					error: (error as Error).message,
				});
			});
	} catch (error) {
		logger.error("Error initiating image export:", error);
		// A pane spec that names nothing is the caller's mistake, not a fault.
		res.status(boardErrorStatus(error)).json({
			success: false,
			error: (error as Error).message,
		});
	}
});

// Image export: result (Frontend -> Express -> CLI)
app.post("/api/export/image/result", (req: Request, res: Response) => {
	try {
		const { requestId, format, data, error } = req.body;

		if (!requestId) {
			return res.status(400).json({
				success: false,
				error: "requestId is required",
			});
		}

		const pending = pendingExports.get(requestId);
		if (!pending) {
			// Already resolved by another client, or expired — ignore silently
			return res.json({ success: true });
		}

		if (error) {
			// Don't reject on error — another WebSocket client may still succeed.
			logger.warn(`Export error from one client (requestId=${requestId}): ${error}`);
			return res.json({ success: true });
		}

		// Keep the largest response (most complete canvas state wins)
		if (!pending.bestResult || data.length > pending.bestResult.data.length) {
			pending.bestResult = { format, data };
		}

		// Start a short collection window on the first response, then resolve with best
		if (!pending.collectionTimeout) {
			pending.collectionTimeout = setTimeout(() => {
				const p = pendingExports.get(requestId);
				if (p?.bestResult) {
					clearTimeout(p.timeout);
					pendingExports.delete(requestId);
					p.resolve(p.bestResult);
				}
			}, 3000);
		}

		res.json({ success: true });
	} catch (error) {
		logger.error("Error processing export result:", error);
		res.status(500).json({
			success: false,
			error: (error as Error).message,
		});
	}
});

// Viewport control: request (CLI -> Express -> WebSocket -> Frontend)
interface PendingViewport {
	resolve: (data: { success: boolean; message: string }) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}
const pendingViewports = kept("pending-viewports", () => new Map<string, PendingViewport>());

const viewportRequestSchema = z
	.object({
		scrollToContent: z.boolean().optional(),
		scrollToElementIds: z.array(z.string().min(1)).min(1).optional(),
		viewportZoomFactor: z.number().positive().max(1).optional(),
		scrollToElementId: z.string().min(1).optional(),
		zoom: z.number().min(0.1).max(10).optional(),
		offsetX: z.number().optional(),
		offsetY: z.number().optional(),
		// Which pane's camera. Display, so it defaults where it cannot be wrong: one
		// pane and it is that one. With two, framing the pane nobody asked for moves
		// the browser pane the user was viewing, so naming it is how an agent
		// says which board it means to look at (TASK-033).
		pane: z.string().min(1).optional(),
	})
	.superRefine((params, ctx) => {
		const modes = [
			params.scrollToContent === true,
			params.scrollToElementIds !== undefined,
			params.scrollToElementId !== undefined,
			params.zoom !== undefined || params.offsetX !== undefined || params.offsetY !== undefined,
		].filter(Boolean).length;

		if (modes !== 1) {
			ctx.addIssue({
				code: "custom",
				message:
					"Specify exactly one viewport mode: scrollToContent, scrollToElementIds, scrollToElementId, or manual zoom/offset",
			});
		}
		if (
			params.viewportZoomFactor !== undefined &&
			params.scrollToContent !== true &&
			params.scrollToElementIds === undefined
		) {
			ctx.addIssue({
				code: "custom",
				path: ["viewportZoomFactor"],
				message: "viewportZoomFactor requires scrollToContent or scrollToElementIds",
			});
		}
	});

app.post("/api/viewport", (req: Request, res: Response) => {
	try {
		const {
			scrollToContent,
			scrollToElementIds,
			scrollToElementId,
			viewportZoomFactor,
			zoom,
			offsetX,
			offsetY,
			pane,
		} = viewportRequestSchema.parse(req.body);

		if (clients.size === 0) {
			return res.status(503).json(noBrowserBody("Moving the camera"));
		}

		// Resolved before anything is promised, so a pane spec that names nothing
		// comes back as a refusal listing the panes rather than as a timeout.
		const answering = pane ? resolvePaneSpec(Array.from(panes.values()), pane) : primaryPane();
		if (!answering) {
			return res.status(503).json(noBrowserBody("Moving the camera"));
		}

		const requestId = mintId(pendingViewports);

		const viewportPromise = new Promise<{ success: boolean; message: string }>(
			(resolve, reject) => {
				const timeout = setTimeout(() => {
					pendingViewports.delete(requestId);
					reject(new Error("Viewport request timed out after 10 seconds"));
				}, 10000);

				pendingViewports.set(requestId, { resolve, reject, timeout });
			},
		);

		// Addressed to one pane, about the board that pane holds: a
		// scroll-to-element only means anything on the board holding the element.
		sendToPane(
			answering.clientId,
			{
				type: "set_viewport",
				requestId,
				scrollToContent,
				scrollToElementIds,
				scrollToElementId,
				viewportZoomFactor,
				zoom,
				offsetX,
				offsetY,
			},
			paneBoards.get(answering.clientId) ?? answering.board,
		);

		viewportPromise
			.then((result) => {
				res.json(result);
			})
			.catch((error) => {
				res.status(500).json({
					success: false,
					error: (error as Error).message,
				});
			});
	} catch (error) {
		logger.error("Error initiating viewport change:", error);
		// A pane spec that names nothing is a client error, and boardErrorStatus
		// is where that judgement already lives.
		res.status(error instanceof z.ZodError ? 400 : boardErrorStatus(error)).json({
			success: false,
			error:
				error instanceof z.ZodError
					? error.issues.map((issue) => issue.message).join("; ")
					: (error as Error).message,
		});
	}
});

// Viewport control: result (Frontend -> Express -> CLI)
app.post("/api/viewport/result", (req: Request, res: Response) => {
	try {
		const { requestId, success, message, error } = req.body;

		if (!requestId) {
			return res.status(400).json({
				success: false,
				error: "requestId is required",
			});
		}

		const pending = pendingViewports.get(requestId);
		if (!pending) {
			return res.json({ success: true });
		}

		if (error || success === false) {
			clearTimeout(pending.timeout);
			pendingViewports.delete(requestId);
			pending.reject(new Error(error || message || "Viewport update failed"));
			return res.json({ success: true });
		}

		clearTimeout(pending.timeout);
		pendingViewports.delete(requestId);
		pending.resolve({ success: true, message: message || "Viewport updated" });

		res.json({ success: true });
	} catch (error) {
		logger.error("Error processing viewport result:", error);
		res.status(500).json({
			success: false,
			error: (error as Error).message,
		});
	}
});

// Snapshots: save
app.post("/api/snapshots", (req: Request, res: Response) => {
	try {
		const { name } = req.body;

		if (!name || typeof name !== "string") {
			return res.status(400).json({
				success: false,
				error: "Snapshot name is required",
			});
		}

		const { key: boardKeyForRequest, content } = boardFromRequest(req, "Saving a snapshot");
		// A copy, deeply. A snapshot is the thing you go back to, so it must not
		// be the same objects as the board it is protecting you from (TASK-048).
		const snapshot: Snapshot = {
			name,
			board: boardKeyForRequest,
			elements: copyElements(stripBindingPresentationLinks(content.elements.values())),
			createdAt: new Date().toISOString(),
		};

		snapshots.set(name, snapshot);
		logger.info(
			`Snapshot saved: "${name}" with ${snapshot.elements.length} elements from board "${boardKeyForRequest}"`,
		);

		res.json({
			success: true,
			name,
			board: boardKeyForRequest,
			elementCount: snapshot.elements.length,
			createdAt: snapshot.createdAt,
		});
	} catch (error) {
		answerBoardError(res, error, "Error saving snapshot:");
	}
});

// Snapshots: list
app.get("/api/snapshots", (req: Request, res: Response) => {
	try {
		const list = Array.from(snapshots.values()).map((s) => ({
			name: s.name,
			board: s.board,
			elementCount: s.elements.length,
			createdAt: s.createdAt,
		}));

		res.json({
			success: true,
			snapshots: list,
			count: list.length,
		});
	} catch (error) {
		logger.error("Error listing snapshots:", error);
		res.status(500).json({
			success: false,
			error: (error as Error).message,
		});
	}
});

// Snapshots: get by name
app.get("/api/snapshots/:name", (req: Request, res: Response) => {
	try {
		const { name } = req.params;
		if (typeof name !== "string" || !name) {
			return res.status(400).json({ success: false, error: "Snapshot name is required" });
		}
		const snapshot = snapshots.get(name);

		if (!snapshot) {
			return res.status(404).json({
				success: false,
				error: `Snapshot "${name}" not found`,
			});
		}

		res.json({
			success: true,
			snapshot: { ...snapshot, elements: presentElements(snapshot.elements) },
		});
	} catch (error) {
		logger.error("Error fetching snapshot:", error);
		res.status(500).json({
			success: false,
			error: (error as Error).message,
		});
	}
});

// ─── Boards ───────────────────────────────────────────────────
//
// A board is a named diagram persisted as one .excalidraw.md note in the vault
// (ADR 0004). A pane holds exactly one at a time, so these routes are how a
// pane's board gets swapped: open reads a note into the store and points ONE
// pane at it, save writes the store back out. Nothing here has an opinion
// about what any other pane is showing.
//
// WRITES ARE CHECKED, NOT LOCKED (ADR 0006). archboard records the sha-256 of a
// note's bytes when it reads it, and verifies that hash against the destination
// before it writes. If the two differ, the file changed underneath — Obsidian,
// a sync client, another editor — and the save is refused with nothing written,
// because an Excalidraw scene cannot be merged and overwriting would delete
// work nobody was told about. Deliberately not locking and deliberately not
// reloading: two writers can still both hold the board, and the human picks
// which copy survives.

const BoardAddressSchema = z.object({
	board: z.string().min(1),
	variant: z.string().optional(),
	level: z.string().optional(),
});

// A board address as callers write it: "payments", "payments@proposed", or a
// name plus an explicit variant. The key form is what a human says and what
// `board list` prints, so it is accepted everywhere a board is named.
function identityFromParams(params: {
	board: string;
	variant?: string;
	level?: string;
}): BoardIdentity {
	const base = params.variant
		? makeIdentity({ board: params.board, variant: params.variant })
		: parseBoardKey(params.board);
	return { ...base, ...(params.level ? { level: validateLevel(params.level) } : {}) };
}

// `content` is passed by callers that have already read the note, which is
// every route that answers about a board it just touched; the default is for
// the ones that have not.
function identityResponse(key: string, board: BoardState, content?: BoardContent) {
	const read = content ?? readBoardContent(board);
	return {
		board: key,
		identity: board.identity,
		elementCount: read.elements.size,
		// Which edit of the board this is, so a writer can state a precondition on
		// its first write rather than having to make one to find out (TASK-091).
		// Null for a note archboard has not written yet, and for one whose own
		// `version` key holds something that is not a count.
		version: read.version ?? null,
		// Scratch has a note like every other board; what it has not got is a name
		// anybody chose. See boardSummaries().
		placeholder: key === SCRATCH_KEY,
		...(board.file ? { file: board.file } : {}),
		...(board.savedAt ? { savedAt: board.savedAt } : {}),
		...(board.loadedAt ? { loadedAt: board.loadedAt } : {}),
	};
}

/**
 * Point one pane at a board.
 *
 * The message goes to that pane's socket alone. Broadcasting it — which is
 * what this did while the server held one board — is the same thing as
 * declaring that every pane shows the same board, because `board_switched`
 * replaces the receiving pane's whole scene.
 *
 * `pane` is null when nothing is on screen: the board still becomes the
 * server's active one, which is what a later pane will adopt and what an
 * unqualified caller means while there is no pane to disagree.
 */
function switchPaneTo(
	pane: PaneRegistration | null,
	key: string,
	known?: BoardContent,
): BoardState {
	const board = boards.get(key);
	if (!board) throw new Error(`Board "${key}" is not open`);
	// One read, for the two things that need the board: the feed's new baseline
	// and the scene the pane receives. Callers that have just read the note pass
	// it in rather than making this read it again.
	const content = known ?? readBoardContent(board);
	// A board arriving wholesale is not a change anybody made, so the feed takes
	// the new state as its baseline rather than reporting several hundred
	// additions and burying the first real edit under them. Only when the board
	// was not already on screen somewhere: another pane may be part way through
	// an edit on it, and resetting would swallow that.
	const alreadyShown = boardsOnScreen().some(
		(shown) => shown.board === key && shown.paneId !== pane?.paneId,
	);
	if (!alreadyShown) {
		changeFeed.reset(key, board.identity, () => boardElements(board));
	}

	if (!pane) return board;
	paneBoards.set(pane.clientId, key);

	// The selection belonged to the board that pane was showing and means
	// nothing on this one. Only that pane's: the other pane is still looking at
	// whatever it had picked.
	selectionState.byClient.delete(pane.clientId);
	if (selectionState.current?.clientId === pane.clientId) {
		selectionState.current = null;
		broadcastSelection();
	}

	sendToPane(
		pane.clientId,
		{
			type: "board_switched",
			identity: board.identity,
			elements: presentElements(content.elements.values()),
			...boardFilesMessage(content),
			timestamp: new Date().toISOString(),
		},
		key,
	);
	// Where the new board's lock stands, straight after the board itself. A pane
	// arriving on a board somebody else is writing has to know before the next
	// touch, not after the write it is about to make has been refused (ADR 0016).
	tellPaneAboutLock(pane.clientId, key);
	return board;
}

/**
 * The pane a board request is addressed to.
 *
 * A named pane is taken literally. An unnamed one is only allowed where it
 * cannot be wrong: one pane on screen means that pane, no pane on screen means
 * the board is loaded without being shown, and two panes means say which
 * (src/runtime/engine/panes.ts). The response always names where the board landed.
 */
function paneFromRequest(spec: unknown): PaneRegistration | null {
	const registrations = Array.from(panes.values());
	if (typeof spec === "string" && spec.trim()) return resolvePaneSpec(registrations, spec);
	return soloPane(registrations);
}

/**
 * The pane that answers a request addressed to "the browser" and to no board.
 *
 * Image export and viewport control name a pane or take this one, and neither
 * of them names a board: a picture is of whatever is on that half of the
 * screen. So there is nothing here to resolve a board against, and nothing
 * that could resolve to the wrong one — the caller either says which pane or
 * gets the first.
 *
 * An operation that *does* name a board must not come through here. Use
 * `paneShowing`: the board it was given already settles which pane, so taking
 * the first one instead would answer a different question than the one asked.
 */
function primaryPane(): PaneRegistration | null {
	const registrations = Array.from(panes.values());
	return registrations.find((pane) => pane.primary) ?? registrations[0] ?? null;
}

/** What a pane is holding: the server's record of it, or the pane's own claim. */
function paneBoardKey(pane: PaneRegistration): string {
	return paneBoards.get(pane.clientId) ?? pane.board ?? SCRATCH_KEY;
}

/**
 * The pane holding a board, for work that happens in the browser but is about
 * one named board.
 *
 * Mermaid converts inside a pane and the elements land on whatever board that
 * pane holds, so the pane is not a second thing for the caller to choose: the
 * board says which one (ADR 0009). Asking for `--pane` as well would be a
 * second way to say the same thing, and so a way to say two different things.
 *
 * Two panes may hold one board. Either would convert into the same board, so
 * this picks rather than refuses, and it picks the primary one so the same
 * screen gives the same answer twice.
 */
function paneShowing(board: string): PaneRegistration | null {
	const holding = panesInOrder(Array.from(panes.values()))
		.map((entry) => entry.pane)
		.filter((pane) => paneBoardKey(pane) === board);
	return holding.find((pane) => pane.primary) ?? holding[0] ?? null;
}

/** The panes on screen and what each holds, for a refusal that has to list them. */
function panesShowingList(): string {
	return panesInOrder(Array.from(panes.values()))
		.map((entry) => `${entry.position}. ${entry.place} (${paneBoardKey(entry.pane)})`)
		.join(", ");
}

/** One pane, named the way a human would point at it: "the left pane". */
function paneRef(pane: PaneRegistration): Record<string, unknown> {
	const entry = panesInOrder(Array.from(panes.values())).find(
		(p) => p.pane.clientId === pane.clientId,
	);
	return {
		paneId: pane.paneId,
		clientId: pane.clientId,
		place: entry?.place ?? "the only pane",
		position: entry?.position ?? 1,
	};
}

/** Where a board landed, for the caller who did not say. */
function paneResponse(pane: PaneRegistration | null): Record<string, unknown> {
	return { pane: pane ? paneRef(pane) : null };
}

// What exists: every board in the vault, plus the ones open in this process.
//
// With ?repo=<identity>, the answer is narrowed to the boards that describe
// that repository: the ones with nodes bound to it, each listing which nodes
// matched (TASK-030). The identity is resolved by the caller, never here, for
// the same reason bindings are (ADR 0011) — this process's working directory is
// nobody's.
app.get("/api/boards", (req: Request, res: Response) => {
	try {
		const vault = requireVaultRoot();
		const repo = typeof req.query.repo === "string" ? req.query.repo.trim() : "";
		if (repo) {
			const open = Array.from(boards.entries()).map(([key, board]) => ({
				key,
				identity: board.identity,
				elements: boardElements(board),
				...(board.file ? { file: board.file } : {}),
			}));
			const found = boardsForRepo(repo, open, vault);
			return res.json({
				success: true,
				vault,
				repo,
				boards: found.boards,
				scanned: found.scanned,
				...(found.unreadable.length ? { unreadable: found.unreadable } : {}),
				open: openBoards(),
				onScreen: boardsOnScreen(),
			});
		}
		res.json({
			success: true,
			vault,
			boards: listBoards(vault),
			open: openBoards(),
			onScreen: boardsOnScreen(),
		});
	} catch (error) {
		answerBoardError(res, error, "Error listing boards:");
	}
});

// One board's identity and save state. Named, like everything else: there is
// no "the board the canvas is holding" to ask about any more — a pane asks
// about its own, and `panes` says what each pane holds.
app.get("/api/boards/info", (req: Request, res: Response) => {
	try {
		const { key, board, content } = boardFromRequest(req, "board info");
		res.json({ success: true, ...identityResponse(key, board, content) });
	} catch (error) {
		answerBoardError(res, error);
	}
});

// Open a board from the vault onto the canvas.
app.post("/api/boards/open", (req: Request, res: Response) => {
	try {
		const params = BoardAddressSchema.extend({
			reload: z.boolean().optional(),
			pane: z.string().optional(),
		}).parse(req.body ?? {});
		const asked = identityFromParams(params);
		const key = boardKey(asked);

		// A board this canvas already has open needs nothing read here: its note is
		// read on every request that touches it, so pointing a pane at it is all
		// this is. `--reload` still means something, and means more than it did:
		// it is ADR 0006's first outcome, the one that takes the note and gives up
		// the canvas. It re-reads the address off disk and moves the baseline to
		// whatever is there now, which is what lets writes resume after a refusal.
		if (boards.has(key) && !params.reload) {
			const pane = paneFromRequest(params.pane);
			const board = switchPaneTo(pane, key);
			return res.json({
				success: true,
				...identityResponse(key, board),
				source: "memory",
				...paneResponse(pane),
			});
		}

		// Whether there is a board at this address at all, asked before which half
		// of the screen it would go on. A board that is nowhere is a fact about the
		// address the caller typed, and putting it behind a question about panes
		// sends them off to add a --pane and meet a second, different refusal
		// (TASK-055). Reading the note changes nothing, so the pane is still
		// resolved before anything is created.
		const loaded = readBoardFile(asked);
		if (!loaded) {
			return res.status(404).json({
				success: false,
				error:
					`No board "${key}" in the vault at ${requireVaultRoot()}. ` +
					`Run \`board list\` to see what is there, or \`board new ${key}\` to start it.`,
			});
		}
		const pane = paneFromRequest(params.pane);

		const scene = JSON.parse(loaded.sceneJson);
		const { elements, files } = ingestScene(
			Array.isArray(scene) ? scene : (scene.elements ?? []),
			Array.isArray(scene) ? null : scene.files,
		);
		// The note's level wins unless the caller stated one — opening a board is
		// not usually a claim about what level it sits at. Register it only after
		// ingestion succeeds, so a malformed legacy note cannot leave an empty
		// in-memory board that a second open mistakes for success.
		const { key: openedKey, board } = getOrCreateBoard({
			...loaded.identity,
			...(asked.level ? { level: asked.level } : {}),
		});
		const content: BoardContent = {
			elements,
			files,
			note: loaded.raw,
			hash: loaded.hash,
			version: loaded.version,
		};
		board.file = loaded.file;
		// The bytes just read are what the panes are about to be shown, so they are
		// the baseline the next write is checked against.
		recordBaseline(board, loaded.file, loaded.hash, loaded.version);
		board.loadedAt = new Date().toISOString();
		// ADR 0006's first outcome: take the note, discard the canvas. It is the
		// one outcome that ends a hold by throwing the held copy away, so this is
		// the moment everything drawn since the board stopped saving is gone
		// (TASK-079). It costs what the human was told it costs.
		const ended = params.reload ? releaseBoardHold(openedKey, "reload") : null;
		switchPaneTo(pane, openedKey, content);
		// On a reload, every pane holding it — not only the one this was addressed
		// to. The others are showing the copy that was just discarded, and a pane
		// left showing it would report the discarded work straight back as a fresh
		// edit, which is the reload undone by the next user edit.
		if (params.reload) {
			for (const other of panes.values()) {
				if (other.clientId === pane?.clientId) continue;
				if ((paneBoards.get(other.clientId) ?? other.board) !== openedKey) continue;
				switchPaneTo(other, openedKey, content);
			}
		}

		logger.info(
			`Board opened: "${openedKey}" (${elements.size} elements) from ${loaded.file}` +
				(pane ? ` into pane ${pane.paneId}` : " (no pane open)") +
				(ended ? `, discarding ${ended.writes} change(s) held since it stopped saving` : ""),
		);
		res.json({
			success: true,
			...identityResponse(openedKey, board, content),
			source: "vault",
			...paneResponse(pane),
			...(loaded.declaredKey ? { declaredKey: loaded.declaredKey } : {}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error opening board:");
	}
});

// Start a new, empty board.
//
// Nothing is written. The address is claimed and the note it would have is
// resolved, and the first thing drawn on it creates the file — an empty board
// has nothing to persist, and a `board new` somebody typed wrongly should not
// leave a note behind in a vault a human reads.
app.post("/api/boards/new", (req: Request, res: Response) => {
	try {
		const params = BoardAddressSchema.extend({ pane: z.string().optional() }).parse(req.body ?? {});
		const identity = identityFromParams(params);
		const key = boardKey(identity);
		// Is the name free, before which pane it would show in. Both questions can
		// refuse and neither creates anything, so the order is only about which
		// answer the caller gets first, and one of them is about state they cannot
		// see. A taken name reported second reads as "you fixed the pane, now here
		// is a different problem", with nothing having said the board exists
		// (TASK-055). Board is authority and pane is display (ADR 0009), which is
		// the same order.
		if (boards.has(key)) {
			return res.status(409).json({
				success: false,
				error: `Board "${key}" is already open. Switch to it with \`board open ${key}\`.`,
			});
		}
		const wouldBe = vaultPathFor(identity);
		if (fs.existsSync(wouldBe)) {
			// Naming the file matters when the collision is only in casing: the
			// caller typed `CaseTest`, the vault holds `casetest.excalidraw.md`, and
			// those are one board (ADR 0010). Without the path the refusal looks
			// like it is talking about something else.
			return res.status(409).json({
				success: false,
				error:
					`Board "${key}" already exists in the vault, at ${wouldBe}. ` +
					"Open it instead, or choose another name or variant.",
			});
		}

		// Which pane it lands in, and the last thing that can refuse. Nothing has
		// been created at this point, so a refusal here really means the board was
		// not started.
		const pane = paneFromRequest(params.pane);

		const { key: newKey, board } = getOrCreateBoard(identity);
		board.file = vaultPathFor(identity);
		const content = emptyContent();
		switchPaneTo(pane, newKey, content);
		logger.info(`Board created: "${newKey}" (empty, no note yet)`);
		res.json({
			success: true,
			...identityResponse(newKey, board, content),
			created: true,
			saved: false,
			...paneResponse(pane),
		});
	} catch (error) {
		answerBoardError(res, error, "Error creating board:");
	}
});

// Write a board to the vault. With no address it saves the board the canvas is
// holding under its own identity; with one it saves as that board instead
// (which is also how the scratch board gets a name).
app.post("/api/boards/save", (req: Request, res: Response) => {
	try {
		const body = req.body ?? {};
		const source = boardTargetFromRequest(req, "Saving a board");
		const sourceBoard = source.board;
		// The human's "overwrite it anyway" — one of the three outcomes a conflict
		// offers. Never set by archboard on its own behalf.
		const force = body.force === true;

		// With a name, this is a save-as; without one, the board keeps its own
		// identity and only the fields actually passed are changed.
		//
		// Either way the level comes across unless the caller states another one.
		// A branch is the same subject at the same abstraction tier, and level is
		// board identity from a vocabulary the project grew on purpose, so
		// `--as payments@option-a` must not quietly produce a proposal at no level
		// while the board it came from sits at system (TASK-039). `--variant`
		// always did this, by keeping the source's identity; `--as` built a fresh
		// one and dropped it.
		const level = body.level ?? sourceBoard.identity.level;
		const targetIdentity: BoardIdentity = body.name
			? identityFromParams({ board: String(body.name), variant: body.variant, level })
			: {
					...sourceBoard.identity,
					...(body.variant ? { variant: validateVariant(String(body.variant)) } : {}),
					...(level ? { level: validateLevel(String(level)) } : {}),
				};

		const file = vaultPathFor(targetIdentity);
		const targetKey = boardKey(targetIdentity);
		// Saving under another address is branching, and the branch is a board of
		// its own variant, so every node on it is restamped to say so. Without
		// that, `save --as payments@option-a` leaves twelve nodes claiming
		// "current" and compare reports the whole board changed (TASK-035). A
		// plain save is deliberately left alone: a node that records a foreign
		// variant on a board nobody branched really was copied in, and that is
		// what `variantAnomaly` is for.
		const kind = classifyBoardSave(source.key, targetKey);
		// Both senses of "wrote somewhere else": naming scratch and branching a
		// board that has a home. They differ over panes, not over elements.
		const branched = kind !== "same-board";
		// Who was looking at the board that was saved. Whether they move depends
		// on what the save was: giving the scratch board a name renames the thing
		// in front of them, branching writes a second board and leaves the first
		// one alone (ADR 0012).
		const watching = Array.from(panes.values()).filter(
			(pane) => (paneBoards.get(pane.clientId) ?? pane.board) === source.key,
		);
		const { board: savedBoard } = getOrCreateBoard(targetIdentity);
		savedBoard.file = file;
		const target: BoardWriteTarget = { key: targetKey, board: savedBoard };
		const heldSource = holdOn(source.key);
		const moved = panesFollowSave(kind) || (heldSource && branched) ? watching : [];

		answerBoardWrite(res, {
			source,
			origin: "agent",
			// Save is the explicit resolution for a held board. It writes the note
			// chosen by the person instead of adding another change to the held copy.
			save: { target, force },
			mutation: (content, destinationBefore) => {
				const saved = branched
					? restampVariant(Array.from(content.elements.values()), targetIdentity.variant)
					: Array.from(content.elements.values());
				content.elements = new Map(saved.map((element) => [element.id, element]));
				const savedIds = new Set(saved.map((element) => element.id));
				return {
					value: null,
					...(kind === "same-board"
						? {}
						: {
								delta: {
									created: saved.filter((element) => !destinationBefore.elements.has(element.id)),
									updated: saved.filter((element) => destinationBefore.elements.has(element.id)),
									deleted: Array.from(destinationBefore.elements.keys()).filter(
										(id) => !savedIds.has(id),
									),
								},
							}),
				};
			},
			afterPersist: ({ content, written }) => {
				for (const pane of moved) switchPaneTo(pane, targetKey, content);
				logger.info(
					`Board saved: "${targetKey}" (${written?.elementCount ?? content.elements.size} elements) -> ${file}` +
						(kind === "same-board" ? "" : ` [${kind}]`) +
						(moved.length ? `, panes moved: ${moved.map((pane) => pane.paneId).join(", ")}` : ""),
				);
			},
			answer: ({ content, written }) => {
				if (!written) throw new Error(`Saving "${targetKey}" did not write its note.`);
				return {
					success: true,
					...identityResponse(targetKey, savedBoard, content),
					file,
					elements: written.elementCount,
					overwrote: written.overwrote,
					...(force && written.overwrote ? { forced: true } : {}),
					saveKind: kind,
					savedFrom: source.key,
					...(heldSource
						? {
								resolvedHold: {
									board: source.key,
									outcome: branched ? "elsewhere" : "overwrite",
									writes: heldSource.writes,
									since: heldSource.since,
								},
							}
						: {}),
					panes: {
						moved: moved.map(paneRef),
						kept: (moved.length === 0 && kind === "branch" ? watching : []).map(paneRef),
						onScreen: boardsOnScreen(),
					},
				};
			},
		});
	} catch (error) {
		answerBoardError(res, error, "Error saving board:");
	}
});

// ─── Compare ──────────────────────────────────────────────────
//
// A structured semantic diff between two variants, joined on node identity
// (src/runtime/engine/compare.ts). Read-only in the strictest sense: comparing two boards
// must never disturb the one on screen, so this neither opens a board, nor
// registers one in the store, nor records a baseline, nor moves the active
// pointer. Both sides are read off disk, because that is where a board is
// (ADR 0015); what `source` still distinguishes is whether the side is a board
// this canvas has open — and therefore possibly on a pane in front of somebody
// — or one that only exists in the vault. Reported per side, because they can
// differ and the human needs to know which they were told about.

function loadSideForCompare(key: string): CompareSideInput | null {
	const live = boards.get(key);
	if (live) {
		return {
			key,
			identity: live.identity,
			elements: boardElements(live).filter((el) => !el.isDeleted),
			source: "memory",
			...(live.file ? { file: live.file } : {}),
			onScreen: boardsOnScreen().some((shown) => shown.board === key),
			...(live.savedAt ? { savedAt: live.savedAt } : {}),
			...(live.loadedAt ? { loadedAt: live.loadedAt } : {}),
		};
	}
	const identity = parseBoardKey(key);
	const loaded = readBoardFile(identity);
	if (!loaded) return null;
	const scene = JSON.parse(loaded.sceneJson);
		const sceneRecord = scene && typeof scene === "object" && !Array.isArray(scene) ? scene as Record<string, unknown> : {};
		const raw: unknown[] = Array.isArray(scene) ? scene : (Array.isArray(sceneRecord.elements) ? sceneRecord.elements : []);
	return {
		key,
		identity: loaded.identity,
		elements: raw.filter((el) => el && typeof el === "object" && (el as Record<string, unknown>).isDeleted !== true) as ServerElement[],
		source: "vault",
		file: loaded.file,
		onScreen: false,
	};
}

// Every address that exists for a board name — in the vault and in this
// session — so a one-sided `compare payments` can find the other side and, when
// it cannot, say what there was to choose from.
function addressesFor(boardName: string): string[] {
	const keys = new Set<string>();
	try {
		for (const found of listBoards()) {
			if (found.identity.board === boardName) keys.add(found.key);
		}
	} catch {
		/* no vault: the open boards are still an answer */
	}
	for (const [key, state] of boards) {
		if (state.identity.board === boardName) keys.add(key);
	}
	return [...keys].toSorted();
}

app.get("/api/boards/compare", (req: Request, res: Response) => {
	try {
		const fromParam = typeof req.query.from === "string" ? req.query.from.trim() : "";
		if (!fromParam) {
			return res
				.status(400)
				.json({ success: false, error: "compare needs at least one board: ?from=payments" });
		}
		const fromIdentity = parseBoardKey(fromParam);
		let fromKey = boardKey(fromIdentity);
		let toKey =
			typeof req.query.to === "string" && req.query.to.trim()
				? boardKey(parseBoardKey(req.query.to.trim()))
				: "";

		// One address given: find the other side among that board's variants.
		// `current` is privileged, so whenever it exists it is the `from` side —
		// the diff reads "what the proposal changes about the architecture that
		// exists", never the reverse.
		if (!toKey) {
			const siblings = addressesFor(fromIdentity.board).filter((k) => k !== fromKey);
			if (siblings.length === 0) {
				return res.status(400).json({
					success: false,
					error:
						`"${fromKey}" has no other variant to compare against. A variant is a separate note ` +
						`(${fromIdentity.board}@option-a.excalidraw.md); author one with ` +
						`\`board new ${fromIdentity.board}@option-a\`, or name both sides: ` +
						"`compare <from> <to>`.",
				});
			}
			if (siblings.length > 1) {
				return res.status(400).json({
					success: false,
					error:
						`"${fromIdentity.board}" has ${siblings.length} variants — ${siblings.join(", ")} — so which ` +
						"two to compare is not obvious. Name both sides: `compare <from> <to>`.",
					variants: [fromKey, ...siblings].toSorted(),
				});
			}
			const other = siblings[0]!;
			if (fromIdentity.variant === CURRENT_VARIANT) {
				toKey = other;
			} else {
				// The given side is a proposal and the only other one is what it is a
				// proposal against, so it reads current -> proposal.
				toKey = fromKey;
				fromKey = other;
			}
		}

		if (fromKey === toKey) {
			return res.status(400).json({
				success: false,
				error: `Both sides name the same board ("${fromKey}"), so there is nothing to compare.`,
			});
		}

		const missing: string[] = [];
		const from = loadSideForCompare(fromKey);
		if (!from) missing.push(fromKey);
		const to = loadSideForCompare(toKey);
		if (!to) missing.push(toKey);
		if (missing.length > 0 || !from || !to) {
			const board = missing[0] ? parseBoardKey(missing[0]).board : fromIdentity.board;
			const available = addressesFor(board);
			return res.status(404).json({
				success: false,
				error:
					`No board ${missing.map((m) => `"${m}"`).join(" or ")} in the vault at ${requireVaultRoot()}` +
					(available.length
						? `. What exists under "${board}": ${available.join(", ")}.`
						: `, and nothing exists under "${board}" at all.`) +
					" Run `board list` to see everything.",
				missing,
			});
		}

		const result = compareBoards(from, to);
		if (from.identity.board !== to.identity.board) {
			result.warnings.unshift(
				`"${fromKey}" and "${toKey}" are different boards, not two variants of one. They still compare — ` +
					"node ids are the join key either way — but node ids are only guaranteed unique per board, so a " +
					"match here may be coincidence rather than the same architectural unit.",
			);
		}
		logger.info(
			`Compared "${fromKey}" (${from.source}) against "${toKey}" (${to.source}): ` +
				`+${result.summary.nodesAdded} -${result.summary.nodesRemoved} ~${result.summary.nodesChanged} nodes`,
		);
		res.json(result);
	} catch (error) {
		answerBoardError(res, error, "Error comparing boards:");
	}
});

// ─── The library ──────────────────────────────────────────────
//
// The stencil palette, which is not a board and never becomes one. These two
// routes are the whole of it: the browser reads the library when it mounts and
// writes back whatever Excalidraw says the library now is. Nothing here goes
// near an element store or the change feed — a stencil only becomes elements
// when a human drags it onto a canvas, and by then it has arrived through the
// ordinary change-report path like anything else they drew.

app.get("/api/library", (_req: Request, res: Response) => {
	try {
		const state = readLibrary();
		res.json({
			success: true,
			items: state.items,
			seeded: state.seeded,
			origins: state.origins,
			file: state.file,
			vaultBacked: state.vaultBacked,
		});
	} catch (error) {
		logger.error("Error reading library:", error);
		res.status(500).json({ success: false, error: (error as Error).message });
	}
});

// Replace the library. The browser sends the whole set because that is what
// Excalidraw provides it — there is no library delta to be had — and last write
// wins, which is honest for a palette two tabs are unlikely to edit at once.
// The result is broadcast so the other tabs stop being the stale one.
app.put("/api/library", (req: Request, res: Response) => {
	try {
		const body = z
			.object({
				items: z.array(
					z.looseObject({
						id: z.string(),
						status: z.enum(["published", "unpublished"]).optional(),
						elements: z.array(z.any()),
						created: z.number().optional(),
						name: z.string().optional(),
					}),
				),
			})
			.parse(req.body ?? {});

		const items: LibraryItem[] = body.items.map((item) => ({
			id: item.id,
			status: item.status ?? "published",
			elements: item.elements,
			created: item.created ?? Date.now(),
			...(item.name ? { name: item.name } : {}),
		}));

		const state = writeLibrary(items);
		// Including the tab that sent it. It recognises its own write by content
		// rather than by a client id, so there is no echo to suppress here.
		broadcastBoardless({
			type: "library_changed",
			items: state.items,
			timestamp: new Date().toISOString(),
		});
		res.json({
			success: true,
			count: state.items.length,
			file: state.file,
			vaultBacked: state.vaultBacked,
		});
	} catch (error) {
		logger.error("Error writing library:", error);
		res
			.status(error instanceof z.ZodError ? 400 : 500)
			.json({ success: false, error: (error as Error).message });
	}
});

// Serve the frontend
app.get("/", (req: Request, res: Response) => {
	const htmlFile = path.join(moduleDir, "../dist/frontend/index.html");
	res.sendFile(htmlFile, (err) => {
		if (err) {
			logger.error("Error serving frontend:", err);
			res.status(404).send('Frontend not found. Please run "bun run build" first.');
		}
	});
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
	res.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		boards_open: boards.size,
		elements_count: Array.from(boards.values()).reduce(
			(total, b) => total + boardElementCount(b),
			0,
		),
		websocket_clients: clients.size,
		// Identity for `stop`: it must only ever signal a process that both
		// identifies as this service AND self-reports its pid — never a pid
		// from a stale pidfile or an unrelated app squatting on the port.
		service: "mcp-excalidraw-canvas",
		pid: process.pid,
		// Whether this canvas can be told to reload. True only under
		// `bun run dev:canvas`; a canvas started any other way watches nothing
		// (ADR 0014).
		reloadable: reloadIsAskable(),
		// Whether this process is running the source that is on disk now, and
		// which build the frontend has been rebuilt to. A long-lived process has no
		// symptom of its own for either, so it has to be asked (TASK-056).
		source: sourceState(),
		frontendBuild: frontendState(null).current,
	});
});

// Ask the canvas to re-evaluate its source.
//
// This is the whole trigger, and it is a request rather than a file save on
// purpose: a reload re-runs every module in the graph inside a process holding
// unsaved boards and open sockets, so it happens at a moment somebody chose
// (ADR 0014). Writing the reload token is all this does; bun notices the new
// bytes and `src/dev-canvas.ts` does the rest, canary included.
app.post("/api/reload", (req: Request, res: Response) => {
	if (!reloadIsAskable()) {
		res.status(409).json({
			success: false,
			error:
				"This canvas cannot reload: it was not started with `bun run dev:canvas`. " +
				"Restart it that way, or restart the canvas to pick up your changes, " +
				"which drops every unsaved board, so save first.",
		});
		return;
	}
	try {
		const generation = askForReload();
		res.json({ success: true, generation, pid: process.pid });
	} catch (error) {
		res.status(500).json({ success: false, error: (error as Error).message });
	}
});

// Sync status endpoint
app.get("/api/sync/status", (req: Request, res: Response) => {
	res.json({
		success: true,
		boards: boardSummaries(boardElementCount).map((b) => ({
			board: b.key,
			elementCount: b.elementCount,
		})),
		timestamp: new Date().toISOString(),
		memoryUsage: {
			heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
			heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
		},
		websocketClients: clients.size,
	});
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
	logger.error("Unhandled error:", err);
	res.status(500).json({
		success: false,
		error: "Internal server error",
	});
});

// Start server
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const LOOPBACK_GUARD_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "::"]);
const LOOPBACK_ADDRESSES = ["127.0.0.1", "::1"];

function formatHostForUrl(host: string): string {
	return host.includes(":") ? `[${host}]` : host;
}

function canConnect(host: string, port: number): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		const socket = net.createConnection({ host, port });

		const finish = (isOpen: boolean): void => {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolve(isOpen);
		};

		socket.setTimeout(250);
		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
	});
}

async function findExistingLoopbackListener(port: number): Promise<string | null> {
	for (const host of LOOPBACK_ADDRESSES) {
		if (await canConnect(host, port)) {
			return host;
		}
	}
	return null;
}

// Replaced, not added, for the same reason as the connection listener above.
server.removeAllListeners("error");
server.on("error", (error: NodeJS.ErrnoException) => {
	if (error.code === "EADDRINUSE") {
		const address = (error as NodeJS.ErrnoException & { address?: string }).address || HOST;
		logger.error(`Canvas server port ${PORT} is already in use on ${formatHostForUrl(address)}.`);
	} else if (error.code === "EACCES") {
		logger.error(`Canvas server cannot bind ${formatHostForUrl(HOST)}:${PORT}: permission denied.`);
	} else {
		logger.error("Failed to start canvas server:", error);
	}
	process.exit(1);
});

/**
 * Take the scratch board's note, if there is one.
 *
 * Scratch is where a first run draws, and it used to be the one board that
 * lived in the process and nowhere else, so quitting the canvas threw it away
 * without saying so. It has a note now like every other board (ADR 0015),
 * `<vault>/.archboard/scratch.excalidraw.md`, and this is where the canvas
 * picks it back up.
 *
 * Nothing is written here. A vault that has never held a scratch note gets one
 * when the board is first saved, which is how `board new` behaves too.
 */
function adoptScratchBoard(): void {
	const identity = makeIdentity({ board: SCRATCH_BOARD });
	const { board } = getOrCreateBoard(identity);
	let loaded: LoadedBoard | null = null;
	try {
		loaded = readBoardFile(identity);
	} catch (error) {
		// A scratch note we cannot read is not worth refusing to start over: it is
		// a scratch pad, the vault holds the boards that matter, and the file is
		// left alone rather than replaced.
		logger.warn(`Scratch note ignored: ${(error as Error).message}`);
	}
	board.file = loaded?.file ?? vaultPathFor(identity);
	if (!loaded) return;

	// The bytes just read are the baseline the first write is checked against.
	// Nothing is ingested: the note is the board, and every request that touches
	// scratch will read it for itself.
	recordBaseline(board, loaded.file, loaded.hash, loaded.version);
	board.loadedAt = new Date().toISOString();
	try {
		const count = readBoardContent(board).elements.size;
		logger.info(
			`Scratch board picked up where it was left: ${count} element(s) from ${loaded.file}`,
		);
	} catch (error) {
		if (!(error instanceof RenderGeometryError)) throw error;
		logger.warn(
			`Scratch note cannot be rendered and was left unchanged: ${error.message} ` +
				"The canvas will start so the pane can show this error.",
		);
	}
}

async function startServer(): Promise<void> {
	// A hot reload re-runs this file, entry point and all, inside a process that
	// is already serving. Everything that had to happen once has happened: the
	// port is bound, the pidfile is written, injection is armed or refused, and
	// the tabs are connected to sockets we have just re-pointed at the new
	// handlers. Binding again would fail against ourselves, and the loopback
	// guard below would read that as a second canvas and exit — taking the boards
	// with it.
	if (wiring.listening) {
		// Straight to stderr, not through the logger: this is only ever printed
		// under `bun run dev:canvas`, where somebody is watching a terminal and
		// needs to know their edit is live. The logger's console transport carries
		// warnings and errors only, and a reload is neither.
		//
		// It says what it did and nothing about what survived. The reload canary
		// is what checks that, afterwards, and it once followed a line here
		// claiming "same boards" onto a report that the board had been emptied.
		process.stderr.write(
			`Canvas server source re-evaluated in place; the port was already bound (pid ${process.pid}).\n`,
		);
		return;
	}

	// No vault, no canvas (ADR 0015). Every board is a note, so a canvas without
	// a vault has nowhere to put anything, and the failure it used to produce
	// came later and cost more: the canvas opened, somebody drew on it, and the
	// drawing turned out to have been nowhere all along.
	//
	// Straight to stderr as well as the log, because a first run is exactly the
	// run whose LOG_LEVEL nobody has set, and the whole value of this is that
	// the person who started it reads it.
	if (!ARCHBOARD_VAULT) {
		process.stderr.write(noVaultMessage() + "\n");
		logger.error("Refusing to start canvas server: no vault (ARCHBOARD_VAULT is unset).");
		process.exit(1);
	}

	if (LOOPBACK_GUARD_HOSTS.has(HOST)) {
		const existingHost = await findExistingLoopbackListener(PORT);
		if (existingHost) {
			logger.error(
				`Refusing to start canvas server on ${formatHostForUrl(HOST)}:${PORT}: ` +
					`${formatHostForUrl(existingHost)}:${PORT} is already listening. ` +
					"This prevents duplicate IPv4/IPv6 canvas servers from splitting state.",
			);
			process.exit(1);
		}
	}

	// Before the port opens, so the first request cannot arrive at a scratch
	// board that is about to be filled in from a note.
	adoptScratchBoard();

	// Only the process that actually wrote the pidfile may remove it —
	// a concurrent-start loser exiting on EADDRINUSE must not delete the
	// winner's pidfile.
	let ownsPidFile = false;

	server.listen(PORT, HOST, () => {
		wiring.listening = true;
		const hostForUrl = formatHostForUrl(HOST);
		logger.info(`POC server running on http://${hostForUrl}:${PORT}`);
		logger.info(`WebSocket server running on ws://${hostForUrl}:${PORT}`);

		// Written only after listen succeeds so stale files can't shadow a
		// server that never came up; lets `archboard stop` find us.
		writePidFile(PORT, process.pid);
		ownsPidFile = true;

		// Injection is armed here, with the address actually bound, and only here:
		// whether the canvas may drive a coding agent depends on where it can be
		// reached from, which is not known before this point (ADR 0005).
		startInjection(HOST);
	});

	const shutdown = (signal: NodeJS.Signals): void => {
		logger.info(`Received ${signal}, shutting down canvas server`);
		if (ownsPidFile) removePidFile(PORT);
		server.close(() => process.exit(0));
		// Force-exit if open sockets keep the server from closing promptly
		setTimeout(() => process.exit(0), 2000).unref();
	};
	// Once per process. Handlers live on `process`, which no reload touches, so
	// registering them again would only stack duplicates.
	if (!wiring.signalsBound) {
		wiring.signalsBound = true;
		process.on("SIGTERM", () => shutdown("SIGTERM"));
		process.on("SIGINT", () => shutdown("SIGINT"));
		process.on("exit", () => {
			if (ownsPidFile) removePidFile(PORT);
		});
	}
}

// Start the canvas server only when this file is the process entry point
// (`bun src/server.ts`, `bun run canvas`, or spawned by the CLI
// auto-start). Importing this module must never start the server.
if (isMainModule(import.meta.url)) {
	void startServer();
}

export { startServer };
export default app;
