import type { Express, Request, Response } from "express";
import { z } from "zod";
import logger from "@/runtime/engine/logger";
import { selectionState } from "@/runtime/engine/types";
import { boards, copyElements, recordBaseline } from "@/runtime/engine/board-store";
import type { BoardState } from "@/runtime/engine/board-store";
import {
	boardFilesMessage,
	createBoard,
	materializeResolvedBoard,
	readBoardContent,
	renderContent,
	resolveBoard,
	resolveInstalledBoard,
} from "@/runtime/engine/board-io";
import type { BoardContent } from "@/runtime/engine/board-io";
import { BoardLockCancelledError, withBoardLock } from "@/runtime/engine/board-lock";
import {
	boardKey,
	hashBoardBytes,
	listBoards,
	parseBoardKey,
	requireVaultRoot,
} from "@/runtime/engine/board";
import { boardsForRepo } from "@/runtime/engine/repo-boards";
import { changeFeed } from "@/runtime/engine/change-feed";
import { presentElements, stripBindingPresentationLinks } from "@/runtime/engine/presentation";
import { EMPTY_CHECKOUT_SNAPSHOT, type CheckoutSnapshot } from "@/runtime/code-target";
import type { PaneRegistration } from "@/runtime/engine/panes";
import {
	boardElements,
	releaseBoardHold,
	tellPaneAboutLock,
} from "@/server/canvas/lib/board-announcements";
import { answerBoardError, checkoutSnapshotFor } from "@/server/canvas/lib/board-response";
import { callerGone, trackMutationWork } from "@/server/canvas/lib/mutation-work";
import {
	boardForPane,
	boardsOnScreen,
	broadcastSelection,
	paneBoards,
	paneFromRequest,
	paneResponse,
	panes,
	sendToPane,
} from "@/server/canvas/lib/pane-registry";
import {
	BoardAddressSchema,
	boardFromRequest,
	boardOfRequest,
	bodyOf,
	identityFromAddress,
	identityResponse,
	preparedBoardOpens,
} from "@/server/canvas/lib/request-board";
import { saveBoardRoute } from "@/server/canvas/lib/board-save-route";
import { holderFromRequest } from "@/server/canvas/lib/write-boundary";

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
 * @param pane The pane, or null when nothing is on screen.
 * @param key The board key.
 * @param known The board content, when the caller has just read it.
 * @param checkoutSnapshot The snapshot the presentation overlays.
 * @returns The board.
 */
function switchPaneTo(
	pane: PaneRegistration | null,
	key: string,
	known?: BoardContent,
	checkoutSnapshot: CheckoutSnapshot = EMPTY_CHECKOUT_SNAPSHOT,
): BoardState {
	const board = boards.get(key);
	if (!board) {
		throw new Error(`Board "${key}" is not open`);
	}
	// One read, for the two things that need the board: the feed's new baseline
	// and the scene the pane receives. Callers that have just read the note pass
	// it in rather than making this read it again.
	const content = known ?? readBoardContent(board);
	rebaselineFeedUnlessShownElsewhere(board, key, pane);
	if (!pane) {
		return board;
	}
	paneBoards.set(pane.clientId, key);
	forgetPaneSelection(pane.clientId);
	sendToPane(
		pane.clientId,
		{
			type: "board_switched",
			identity: board.identity,
			elements: presentElements(content.elements.values(), { boardKey: key, checkoutSnapshot }),
			version: content.version ?? null,
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
 * Take the arriving board as the feed's new baseline, unless another pane is
 * already showing it.
 *
 * A board arriving wholesale is not a change anybody made, so the feed takes
 * the new state as its baseline rather than reporting several hundred
 * additions and burying the first real edit under them. Not when the board was
 * already on screen somewhere: another pane may be part way through an edit on
 * it, and resetting would swallow that.
 * @param board The board.
 * @param key Its key.
 * @param pane The pane it is arriving in, or null when nothing is on screen.
 */
function rebaselineFeedUnlessShownElsewhere(
	board: BoardState,
	key: string,
	pane: PaneRegistration | null,
): void {
	const shownElsewhere = boardsOnScreen().some(
		(shown) => shown.board === key && shown.paneId !== pane?.paneId,
	);
	if (shownElsewhere) {
		return;
	}
	changeFeed.reset(key, board.identity, () => boardElements(board));
}

/**
 * Drop a pane's selection: it belonged to the board that pane was showing and
 * means nothing on the next one. Only that pane's: another pane is still
 * looking at whatever it had picked.
 * @param clientId The pane's client id.
 */
function forgetPaneSelection(clientId: string): void {
	selectionState.byClient.delete(clientId);
	if (selectionState.current?.clientId === clientId) {
		selectionState.current = null;
		broadcastSelection();
	}
}

/**
 * List what exists in the vault. Live pane and process state belongs to
 * /api/panes and never enters this persisted-board inventory (ADR 0020).
 *
 * With ?repo=<identity>, the answer is narrowed to the boards that describe
 * that repository: the ones with nodes bound to it, each listing which nodes
 * matched (TASK-030). The identity is resolved by the caller, never here, for
 * the same reason bindings are (ADR 0011) — this process's working directory is
 * nobody's.
 * @param req The request.
 * @param res Its response.
 */
function listBoardsRoute(req: Request, res: Response): void {
	try {
		const vault = requireVaultRoot();
		const repo = typeof req.query["repo"] === "string" ? req.query["repo"].trim() : "";
		if (repo) {
			const found = boardsForRepo(repo, [], vault);
			res.json({
				success: true,
				vault,
				repo,
				boards: found.boards.map(({ source: _source, ...board }) => board),
				scanned: found.scanned,
				...(found.unreadable.length ? { unreadable: found.unreadable } : {}),
			});
			return;
		}
		res.json({ success: true, vault, boards: listBoards(vault) });
	} catch (error) {
		answerBoardError(res, error, "Error listing boards:");
	}
}

/**
 * One noninteractive board preview, resolved directly from its note.
 * @param req The request.
 * @param res Its response.
 */
function previewBoardRoute(req: Request, res: Response): void {
	let key = "";
	try {
		const asked = boardOfRequest(req);
		if (!asked) {
			res.status(400).json({ success: false, error: "Previewing a board needs ?board=<board>." });
			return;
		}
		key = boardKey(parseBoardKey(asked));
		const { board, content } = resolveBoard(key, "Previewing a board");
		res.json({
			success: true,
			board: key,
			fingerprint: hashBoardBytes(renderContent(board.identity, content).bytes),
			elements: copyElements(
				stripBindingPresentationLinks(content.elements.values(), { boardKey: key }),
			),
			files: boardFilesMessage(content).files ?? {},
		});
	} catch (error) {
		answerBoardError(res, error, key ? `Preview unavailable for board "${key}"` : undefined);
	}
}

/**
 * One board's identity and save state. Named, like everything else: there is
 * no "the board the canvas is holding" to ask about any more — a pane asks
 * about its own, and `panes` says what each pane holds.
 * @param req The request.
 * @param res Its response.
 */
function boardInfoRoute(req: Request, res: Response): void {
	try {
		const { key, board, content } = boardFromRequest(req, "board info");
		res.json({ success: true, ...identityResponse(key, board, content) });
	} catch (error) {
		answerBoardError(res, error);
	}
}

const BoardOpenSchema = BoardAddressSchema.extend({
	reload: z.boolean().optional(),
	pane: z.string().optional(),
});

/**
 * Install a board for opening: from the note the checkout middleware already
 * resolved when that was this exact key and the board is not yet registered,
 * from the store or vault otherwise.
 * @param req The request.
 * @param key The board key.
 * @param reload Whether the caller asked to discard the held copy.
 * @returns The board and its content.
 */
function installForOpen(
	req: Request,
	key: string,
	reload: boolean,
): { board: BoardState; content: BoardContent } {
	const prepared = preparedBoardOpens.get(req);
	const alreadyRegistered = boards.has(key) && !reload;
	const installOptions = reload ? { ignoreHold: true } : {};
	return prepared?.key === key && !alreadyRegistered
		? materializeResolvedBoard(prepared.resolution, installOptions)
		: resolveInstalledBoard(key, "Opening a board", installOptions);
}

/**
 * On a reload, point every other pane holding the board at the reloaded note
 * too. The others are showing the copy that was just discarded, and a pane
 * left showing it would report the discarded work straight back as a fresh
 * edit, which is the reload undone by the next user edit.
 * @param pane The pane the open was addressed to.
 * @param key The board key.
 * @param content The reloaded content.
 * @param checkoutSnapshot The snapshot the presentation overlays.
 */
function reswitchOtherPanes(
	pane: PaneRegistration | null,
	key: string,
	content: BoardContent,
	checkoutSnapshot: CheckoutSnapshot,
): void {
	for (const other of panes.values()) {
		if (other.clientId === pane?.clientId || boardForPane(other) !== key) {
			continue;
		}
		switchPaneTo(other, key, content, checkoutSnapshot);
	}
}

/**
 * Record the note just read as the baseline the next write is checked against,
 * refusing a board that turned out to have no persisted note.
 * @param board The board.
 * @param key Its key.
 * @param content The content just read.
 */
function recordOpenedBaseline(board: BoardState, key: string, content: BoardContent): void {
	if (!board.file || !content.hash) {
		throw new Error(`Board "${key}" has no persisted note.`);
	}
	recordBaseline(board, board.file, content.hash, content.version ?? null);
	board.loadedAt = new Date().toISOString();
}

/**
 * What the log says about an open: which board, how big, where it landed and
 * what a reload discarded.
 * @param key The board key.
 * @param board The board.
 * @param content Its content.
 * @param pane The pane it landed in, or null.
 * @param ended The hold a reload ended, or null.
 * @returns The log line.
 */
function openedBoardLine(
	key: string,
	board: BoardState,
	content: BoardContent,
	pane: PaneRegistration | null,
	ended: ReturnType<typeof releaseBoardHold>,
): string {
	const where = pane ? ` into pane ${pane.paneId}` : " (no pane open)";
	const discarded = ended
		? `, discarding ${ended.writes} change(s) held since it stopped saving`
		: "";
	return `Board opened: "${key}" (${content.elements.size} elements) from ${board.file}${where}${discarded}`;
}

/**
 * Show the opened board in its pane, and on a reload in every other pane
 * holding it, ending the hold a reload discards.
 *
 * ADR 0006's first outcome: take the note, discard the canvas. It is the one
 * outcome that ends a hold by throwing the held copy away, so a reload is the
 * moment everything drawn since the board stopped saving is gone (TASK-079).
 * It costs what the human was told it costs.
 * @param res The response, which carries the checkout snapshot.
 * @param pane The pane the open was addressed to, or null.
 * @param key The board key.
 * @param content The content just read.
 * @param reload Whether the caller asked to discard the held copy.
 * @returns The hold a reload ended, or null.
 */
function showOpenedBoard(
	res: Response,
	pane: PaneRegistration | null,
	key: string,
	content: BoardContent,
	reload: boolean,
): ReturnType<typeof releaseBoardHold> {
	const ended = reload ? releaseBoardHold(key, "reload") : null;
	const checkoutSnapshot = checkoutSnapshotFor(res);
	switchPaneTo(pane, key, content, checkoutSnapshot);
	if (reload) {
		reswitchOtherPanes(pane, key, content, checkoutSnapshot);
	}
	return ended;
}

/**
 * Open a board from the vault onto the canvas.
 * @param req The request.
 * @param res Its response.
 */
function openBoardRoute(req: Request, res: Response): void {
	try {
		const params = BoardOpenSchema.parse(bodyOf(req));
		const asked = identityFromAddress(params);
		const key = boardKey(asked);
		const reload = params.reload === true;
		const alreadyRegistered = boards.has(key) && !reload;
		const { board, content } = installForOpen(req, key, reload);
		board.identity = asked.level ? { ...board.identity, level: asked.level } : board.identity;
		const pane = paneFromRequest(params.pane);
		// The bytes just read are what the panes are about to be shown, so they are
		// the baseline the next write is checked against.
		recordOpenedBaseline(board, key, content);
		const ended = showOpenedBoard(res, pane, key, content, reload);
		logger.info(openedBoardLine(key, board, content, pane, ended));
		res.json({
			success: true,
			...identityResponse(key, board, content),
			source: alreadyRegistered ? "memory" : "vault",
			...paneResponse(pane),
		});
	} catch (error) {
		answerBoardError(res, error, "Error opening board:");
	}
}

const BoardNewAddressSchema = BoardAddressSchema.strict();

/**
 * Start a new, empty board by atomically publishing its canonical note.
 * @param req The request.
 * @param res Its response.
 */
function newBoardRoute(req: Request, res: Response): void {
	try {
		const identity = identityFromAddress(BoardNewAddressSchema.parse(bodyOf(req)));
		const key = boardKey(identity);
		const holder = holderFromRequest(req, key);
		void trackMutationWork(req, `${req.method} ${req.path} board-create wait`, (signal) =>
			withBoardLock({ board: key, holder, signal }, () => createBoard(identity)),
		)
			.then(({ key: createdKey, board, content }) => {
				logger.info(`Board created: "${createdKey}" as ${board.file}`);
				return res.json({
					success: true,
					...identityResponse(createdKey, board, content),
					created: true,
					saved: true,
				});
			})
			.catch((error) => {
				if (error instanceof BoardLockCancelledError && callerGone(req, res)) {
					return;
				}
				answerBoardError(res, error, "Error creating board:");
			});
	} catch (error) {
		answerBoardError(res, error, "Error creating board:");
	}
}

/**
 * Mount the board routes.
 * @param app The application to mount on.
 */
function mountBoardRoutes(app: Express): void {
	app.get("/api/boards", listBoardsRoute);
	app.get("/api/boards/preview", previewBoardRoute);
	app.get("/api/boards/info", boardInfoRoute);
	app.post("/api/boards/open", openBoardRoute);
	app.post("/api/boards/new", newBoardRoute);
	app.post("/api/boards/save", saveBoardRoute);
}

export { mountBoardRoutes };
