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
//   Kept pictures. A picture is kept in the browser's IndexedDB, stamped with
//   the board version, the policy fingerprint and the renderer build
//   (`picture-cache.ts`), so opening a board this browser has drawn before shows
//   it without laying it out again. When the server lists its boards, pictures
//   of boards that moved or went away are forgotten.
//
//   Drawing ahead. When the page loads and the server lists its boards, every
//   listed board is drawn in the background, one at a time: the variant its name
//   opens, whole. A board with a kept picture of its version comes out of
//   storage without being laid out, so this costs nothing once the pictures are
//   kept; after a new renderer build or a cleared cache it means a board is
//   ready before anybody opens it (TASK-341). And when the server announces that
//   a board changed, its variants are drawn again in the views this tab has
//   been reading. A board somebody opens is drawn by the pane itself, on another
//   of the renderer's workers, so neither waits for it.
//
// A picture is drawn once for both themes: it paints with the page's colour
// tokens (TASK-346), so a theme switch recolours what is on screen and draws
// nothing.

import type { QueryClient } from "@tanstack/react-query";

import {
	addressedVariant,
	type SemanticBoard,
	parseSemanticBoard,
} from "@archboard/board/document";
import { wasDrawn, type SemanticRenderReply } from "@archboard/board/render-reply";
import type { SemanticPolicy } from "@archboard/board/policy";
import type { BoardRenderChoices, BoardRenderOutcome } from "@archboard/renderer/picture";
import {
	SemanticBoardError,
	comparisonKey,
	type SemanticBoardEntry,
	type SemanticRender,
	type SemanticRenderRequest,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { sameBoardName } from "#ui/rules/semantic-board-canvas/board/address.ts";
import { onSemanticBoardChange } from "#ui/state/semantic-board-canvas/board-changes.ts";
import { layoutEngineNow } from "#ui/clients/semantic-board-canvas/reads/layout-engine.ts";
import {
	forgetStalePictures,
	readCachedPicture,
	writeCachedPicture,
	type PictureStamp,
	type PictureStorage,
} from "#ui/clients/semantic-board-canvas/reads/picture-cache.ts";
import type { PictureSource } from "#ui/clients/semantic-board-canvas/reads/picture-source.ts";
import {
	semanticBoardDocumentQuery,
	semanticRenderQuery,
	vaultCheckQuery,
} from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import { cachedReadings } from "#ui/clients/semantic-board-canvas/reads/board-keys.ts";
import { boardGoneStale } from "#ui/clients/semantic-board-canvas/reads/board-refresh.ts";

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
 * @param vault The vault the board is in.
 * @param board The board name.
 * @returns The board.
 * @throws {SemanticBoardError} When what the server sent is not a coherent board.
 */
async function boardFor(client: QueryClient, vault: string, board: string): Promise<SemanticBoard> {
	const parsed = parseSemanticBoard(
		await client.fetchQuery(semanticBoardDocumentQuery(vault, board)),
	);
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
		boardFor(client, request.vault, request.board),
		client.fetchQuery(vaultCheckQuery(request.vault)),
	]);
	const stamp = {
		version: board.version,
		fingerprint: vault.fingerprint,
		renderer: setup.renderer,
	};
	const kept =
		setup.storage === undefined
			? undefined
			: await readCachedPicture(setup.storage, request, stamp);
	// The same picture asked for again while it is still being laid out — a
	// pane reading its board again as the first read lands — waits for that
	// drawing rather than laying the board out a second time.
	const key = JSON.stringify([
		request.vault,
		request.board,
		request.variant,
		request.view,
		comparisonKey(request),
		request.layout,
		stamp,
	]);
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
			void writeCachedPicture(setup.storage, what.request, what.stamp, fresh);
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
		{
			variant: request.variant,
			view: request.view,
			against: request.against,
			comparison: request.comparison,
			layout: request.layout,
		},
		policy,
	);
	if (!outcome.ok) throw new SemanticBoardError(outcome.code, outcome.error);
	return outcome.reply;
}

/**
 * What this tab has been reading of one board: the name it asks its pictures by, and the views.
 * @param client The tab's cache.
 * @param vault The vault the board is in.
 * @param board The board that changed.
 * @returns How to ask for its pictures again.
 */
function readingsOf(
	client: QueryClient,
	vault: string,
	board: string,
): { name: string; views: Set<string> } {
	const reading = { name: board, views: new Set([""]) };
	for (const { kind, asked, view } of cachedReadings(client, vault)) {
		if (kind !== "picture" || !sameBoardName(asked, board)) continue;
		reading.name = asked;
		reading.views.add(view);
	}
	return reading;
}

/**
 * Every picture of a changed board this tab is likely to show next.
 * @param client The tab's cache.
 * @param vault The vault the board is in.
 * @param board The board that changed.
 * @returns The requests, current variant first.
 */
async function picturesToDrawAhead(
	client: QueryClient,
	vault: string,
	board: string,
): Promise<SemanticRenderRequest[]> {
	const reading = readingsOf(client, vault, board);
	// Marked stale without reading anything yet: a pane showing the board reads
	// its own again, and the drawing below reads the rest.
	await boardGoneStale(client, vault, reading.name);
	const document = await boardFor(client, vault, reading.name);
	// The About page asks for the variant the board's name opens by no name, and any other by
	// id. A board whose name opens nothing, because it has several drafts and no current variant,
	// is asked for by id throughout.
	const opened = addressedVariant(document);
	const bare = opened.ok ? opened.variant.id : undefined;
	const variants = [
		...(bare === undefined ? [] : [""]),
		...document.variants.filter((one) => one.id !== bare).map((one) => one.id),
	];
	return variants.flatMap((variant) =>
		[...reading.views].map((view) => ({
			vault,
			board: reading.name,
			...(variant === "" ? {} : { variant }),
			...(view === "" ? {} : { view }),
			layout: layoutEngineNow(),
		})),
	);
}

/**
 * Draw a changed board's pictures ahead, one at a time. A failure to draw one
 * ahead is left for the pane that asks for it to report.
 * @param client The tab's cache.
 * @param vault The vault the board is in.
 * @param board The board that changed.
 */
async function drawAhead(client: QueryClient, vault: string, board: string): Promise<void> {
	const requests = await picturesToDrawAhead(client, vault, board);
	await requests.reduce(
		(previous, request) => previous.then(() => client.prefetchQuery(semanticRenderQuery(request))),
		Promise.resolve(),
	);
}

/**
 * Draw every listed board ahead, one at a time: the variant its name opens,
 * whole. A kept picture of the board's version comes out of storage without a
 * layout. A failure to draw one ahead is left for the pane that asks for it to
 * report.
 * @param client The tab's cache.
 * @param vault The vault the boards are in.
 * @param boards The boards the server lists.
 */
async function drawListedAhead(
	client: QueryClient,
	vault: string,
	boards: readonly SemanticBoardEntry[],
): Promise<void> {
	for (const entry of boards) {
		// Asked by its key, as a pane and an address ask for it, so the picture
		// lands where the pane that opens the board looks for it.
		const { name } = readingsOf(client, vault, entry.key);
		// oxlint-disable-next-line no-await-in-loop -- one board at a time, so drawing ahead never takes more than one of the renderer's workers
		await client.prefetchQuery(
			semanticRenderQuery({ vault, board: name, layout: layoutEngineNow() }),
		);
	}
}

/**
 * A picture source that draws in this page.
 * @param setup The renderer, its build and the storage.
 * @returns The source.
 */
function createLocalPictureSource(setup: LocalPictureSetup): PictureSource {
	const warmed = new WeakSet<QueryClient>();
	// Each cache sweeps one vault at a time, so drawing ahead never takes more
	// than one of the renderer's workers however many repositories the page
	// lists. A vault whose sweep is already waiting or under way is not queued
	// again.
	const sweeps = new WeakMap<QueryClient, { queued: Set<string>; last: Promise<void> }>();
	const drawing = new Map<string, Promise<SemanticRenderReply>>();
	return {
		/**
		 * Draw a picture here; the first one also starts drawing changed boards ahead.
		 * @param request The board, variant and view.
		 * @param client The tab's cache.
		 * @returns The drawing, or the news that there is nothing to draw.
		 */
		draw: (request, client) => {
			if (!warmed.has(client)) {
				warmed.add(client);
				onSemanticBoardChange((vault, board) => {
					void drawAhead(client, vault, board).catch(() => undefined);
				});
			}
			return drawHere(setup, request, client, drawing);
		},
		/**
		 * Forget kept pictures of boards that moved or went away, and draw the
		 * listed boards ahead after any other vault's sweep, unless this vault's
		 * is already waiting or under way.
		 * @param vault The vault the boards are in.
		 * @param boards The boards the server lists.
		 * @param client The tab's cache.
		 */
		listed: (vault, boards, client) => {
			const forgotten =
				setup.storage === undefined
					? Promise.resolve()
					: forgetStalePictures(setup.storage, vault, boards, setup.renderer);
			const sweep = sweeps.get(client) ?? { queued: new Set<string>(), last: Promise.resolve() };
			sweeps.set(client, sweep);
			if (sweep.queued.has(vault)) return;
			sweep.queued.add(vault);
			// Stale pictures go first, so the sweep never reads one it is about to forget.
			sweep.last = sweep.last
				.then(() => forgotten)
				.then(() => drawListedAhead(client, vault, boards))
				.catch(() => undefined)
				.finally(() => sweep.queued.delete(vault));
		},
	};
}

export { createLocalPictureSource, type DrawBoard, type LocalPictureSetup };
