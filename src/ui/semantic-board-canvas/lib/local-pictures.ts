// Pictures drawn in this page (TASK-247).
//
// A picture is drawn from the board document and the vault policy this tab has
// read, both through the same cache the rest of the pane reads them through, so
// a picture and the panel beside it are always of the same version. The board
// is a read-only cache of the server's (ADR 0023): nothing here edits it, and a
// kept picture is shown only when it was drawn from the version the server
// says the board is at now.
//
// Two things the server route never did:
//
//   Kept pictures. A picture is kept in the browser's storage, stamped with the
//   board version, the policy fingerprint and the renderer build
//   (`picture-cache.ts`), so opening a board this browser has drawn before shows
//   it without laying it out again. When the server lists its boards, pictures
//   of boards that moved or went away are forgotten.
//
//   Drawing ahead. When the server announces that a board changed, its variants
//   are drawn again in the background, one at a time, in the themes and views
//   this tab has been reading, rather than when somebody next opens them.

import type { QueryClient } from "@tanstack/react-query";

import {
	parseSemanticBoard,
	wasDrawn,
	type SemanticBoard,
	type SemanticRenderReply,
} from "@/shared/semantic-board/index";
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
import type {
	BoardRenderChoices,
	BoardRenderOutcome,
} from "@/transformers/semantic-renderer/board";
import {
	SemanticBoardError,
	type SemanticRender,
	type SemanticRenderRequest,
	type SemanticTheme,
} from "@/ui/semantic-board-canvas/api/semantic-boards";
import { sameBoardName } from "@/ui/semantic-board-canvas/lib/address";
import { onSemanticBoardChange } from "@/ui/semantic-board-canvas/lib/board-changes";
import {
	forgetStalePictures,
	readCachedPicture,
	writeCachedPicture,
	type PictureStamp,
	type PictureStorage,
} from "@/ui/semantic-board-canvas/lib/picture-cache";
import type { PictureSource } from "@/ui/semantic-board-canvas/lib/picture-source";
import {
	semanticBoardDocumentQuery,
	semanticBoardKeys,
	semanticRenderQuery,
	vaultCheckQuery,
} from "@/ui/semantic-board-canvas/lib/queries";

/** Draws one board in this page. */
type DrawBoard = (
	board: SemanticBoard,
	choices: Omit<BoardRenderChoices, "fonts">,
	policy: SemanticPolicy,
) => Promise<BoardRenderOutcome>;

/** What drawing in this page needs. */
interface LocalPictureSetup {
	/** The renderer, as this page runs it. */
	readonly draw: DrawBoard;
	/** Which build of the renderer that is; a kept picture of another build is not shown. */
	readonly renderer: string;
	/** Where pictures are kept, or nothing when this browser keeps none. */
	readonly storage: PictureStorage | undefined;
}

/**
 * The board a request is about, as this tab read it.
 * @param client The tab's cache.
 * @param board The board name.
 * @returns The board.
 * @throws {SemanticBoardError} When what the server sent is not a coherent board.
 */
async function boardFor(client: QueryClient, board: string): Promise<SemanticBoard> {
	const parsed = parseSemanticBoard(await client.fetchQuery(semanticBoardDocumentQuery(board)));
	if (!parsed.ok) throw new SemanticBoardError("BOARD_UNREADABLE", parsed.problem);
	return parsed.board;
}

/**
 * Draw one request in this page, or show the picture kept from last time.
 * @param setup The renderer, its build and the storage.
 * @param request What is asked for.
 * @param client The tab's cache.
 * @param drawing The pictures being laid out now, by request and stamp.
 * @returns The drawing, or the news that there is nothing to draw.
 * @throws {SemanticBoardError} When the board has no such variant or view, or cannot be read.
 */
async function drawHere(
	setup: LocalPictureSetup,
	request: SemanticRenderRequest,
	client: QueryClient,
	drawing: Map<string, Promise<SemanticRenderReply>>,
): Promise<SemanticRender> {
	const [board, vault] = await Promise.all([
		boardFor(client, request.board),
		client.fetchQuery(vaultCheckQuery()),
	]);
	const stamp = {
		version: board.version,
		fingerprint: vault.fingerprint,
		renderer: setup.renderer,
	};
	const kept =
		setup.storage === undefined ? undefined : readCachedPicture(setup.storage, request, stamp);
	// The same picture asked for again while it is still being laid out — a
	// pane reading its board again as the first read lands — waits for that
	// drawing rather than laying the board out a second time.
	const key = JSON.stringify([request.board, request.variant, request.view, request.theme, stamp]);
	const reply =
		kept ??
		(await (drawing.get(key) ??
			startDrawing(setup, { board, request, stamp, policy: vault.policy }, drawing, key)));
	return wasDrawn(reply) ? { ...reply, kind: "drawn" } : { ...reply, kind: "empty" };
}

/**
 * Lay a picture out once, keep it when it is done, and let anyone asking for
 * the same picture meanwhile wait for it.
 * @param setup The renderer and the storage.
 * @param what The board, request, stamp and policy to draw with.
 * @param what.board The board.
 * @param what.request What is asked for.
 * @param what.stamp What the picture is kept under.
 * @param what.policy The vault policy.
 * @param drawing The pictures being laid out now.
 * @param key This picture's key among them.
 * @returns The drawing in progress.
 */
function startDrawing(
	setup: LocalPictureSetup,
	what: {
		board: SemanticBoard;
		request: SemanticRenderRequest;
		stamp: PictureStamp;
		policy: SemanticPolicy;
	},
	drawing: Map<string, Promise<SemanticRenderReply>>,
	key: string,
): Promise<SemanticRenderReply> {
	const pending = drawn(setup, what.board, what.request, what.policy).then((fresh) => {
		if (setup.storage !== undefined) {
			writeCachedPicture(setup.storage, what.request, what.stamp, fresh);
		}
		return fresh;
	});
	drawing.set(key, pending);
	void pending.finally(() => drawing.delete(key)).catch(() => undefined);
	return pending;
}

/**
 * Lay a request out and draw it.
 * @param setup The renderer.
 * @param board The board.
 * @param request What is asked for.
 * @param policy The vault policy.
 * @returns The render answer.
 * @throws {SemanticBoardError} When the board has no such variant or view.
 */
async function drawn(
	setup: LocalPictureSetup,
	board: SemanticBoard,
	request: SemanticRenderRequest,
	policy: SemanticPolicy,
): Promise<SemanticRenderReply> {
	const outcome = await setup.draw(
		board,
		{ variant: request.variant, view: request.view, theme: request.theme },
		policy,
	);
	if (!outcome.ok) throw new SemanticBoardError(outcome.code, outcome.error);
	return outcome.reply;
}

/**
 * What this tab has been reading of one board: the name it asks by, the views
 * and the themes.
 * @param client The tab's cache.
 * @param board The board that changed.
 * @returns How to ask for its pictures again.
 */
function readingsOf(
	client: QueryClient,
	board: string,
): { name: string; views: Set<string>; themes: Set<SemanticTheme> } {
	const reading = { name: board, views: new Set([""]), themes: new Set<SemanticTheme>() };
	for (const query of client.getQueryCache().findAll({ queryKey: semanticBoardKeys.renders })) {
		readOne(reading, board, query.queryKey);
	}
	if (reading.themes.size === 0) reading.themes.add("light");
	return reading;
}

/**
 * Add what one cached picture says about how a board is read.
 * @param reading What has been gathered so far.
 * @param reading.name The name the tab asks for the board by.
 * @param reading.views The views read.
 * @param reading.themes The themes read, of any board.
 * @param board The board that changed.
 * @param key The cached picture's key: prefix, kind, board, variant, view, theme.
 */
function readOne(
	reading: { name: string; views: Set<string>; themes: Set<SemanticTheme> },
	board: string,
	key: readonly unknown[],
): void {
	const [, , asked, , view, theme] = key;
	if (theme === "light" || theme === "dark") reading.themes.add(theme);
	if (typeof asked !== "string" || !sameBoardName(asked, board)) return;
	reading.name = asked;
	if (typeof view === "string") reading.views.add(view);
}

/**
 * Every picture of a changed board this tab is likely to show next.
 * @param client The tab's cache.
 * @param board The board that changed.
 * @returns The requests, current variant first.
 */
async function picturesToDrawAhead(
	client: QueryClient,
	board: string,
): Promise<SemanticRenderRequest[]> {
	const reading = readingsOf(client, board);
	// Marked stale without reading anything yet: a pane showing the board reads
	// its own again, and the drawing below reads the rest.
	for (const queryKey of [
		semanticBoardKeys.document(reading.name),
		semanticBoardKeys.boardRenders(reading.name),
	]) {
		// oxlint-disable-next-line no-await-in-loop -- two invalidations, the document before the pictures drawn from it
		await client.invalidateQueries({ queryKey, refetchType: "none" });
	}
	const document = await boardFor(client, reading.name);
	// The variant bar asks for the current variant by no name, and any other by id.
	const variants = [
		"",
		...document.variants.filter((one) => one.id !== document.current).map((one) => one.id),
	];
	return variants.flatMap((variant) =>
		[...reading.views].flatMap((view) =>
			[...reading.themes].map((theme) => ({
				board: reading.name,
				...(variant === "" ? {} : { variant }),
				...(view === "" ? {} : { view }),
				theme,
			})),
		),
	);
}

/**
 * Draw a changed board's pictures ahead, one at a time. A failure to draw one
 * ahead is left for the pane that asks for it to report.
 * @param client The tab's cache.
 * @param board The board that changed.
 */
async function drawAhead(client: QueryClient, board: string): Promise<void> {
	const requests = await picturesToDrawAhead(client, board);
	await requests.reduce(
		(previous, request) => previous.then(() => client.prefetchQuery(semanticRenderQuery(request))),
		Promise.resolve(),
	);
}

/**
 * A picture source that draws in this page.
 * @param setup The renderer, its build and the storage.
 * @returns The source.
 */
function createLocalPictureSource(setup: LocalPictureSetup): PictureSource {
	const warmed = new WeakSet<QueryClient>();
	const drawing = new Map<string, Promise<SemanticRenderReply>>();
	return {
		/**
		 * Draw a picture here; the first one also starts drawing changed boards ahead.
		 * @param request The board, variant, view and theme.
		 * @param client The tab's cache.
		 * @returns The drawing, or the news that there is nothing to draw.
		 */
		draw: (request, client) => {
			if (!warmed.has(client)) {
				warmed.add(client);
				onSemanticBoardChange((board) => {
					void drawAhead(client, board).catch(() => undefined);
				});
			}
			return drawHere(setup, request, client, drawing);
		},
		/**
		 * Forget kept pictures of boards that moved or went away.
		 * @param boards The boards the server lists.
		 */
		listed: (boards) => {
			if (setup.storage !== undefined) forgetStalePictures(setup.storage, boards, setup.renderer);
		},
	};
}

export { createLocalPictureSource, type DrawBoard, type LocalPictureSetup };
