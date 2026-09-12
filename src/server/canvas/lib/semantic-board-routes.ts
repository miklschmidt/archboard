// The canvas's semantic-board surface.
//
// These routes are deliberately outside the Excalidraw write boundary in
// `write-boundary.ts`. That boundary resolves a `.excalidraw.md` note before it
// takes a lease, and asking it to do that for a board that has no note would
// create one — which is exactly the thing ADR 0023 promises not to do to an
// existing vault. Instead a semantic write states its own boundary:
// `writeSemanticBoard` takes the same board-global lease, honours the same
// claim, makes the same expected-version check, advances the version once and
// writes the aggregate atomically. One owner, one set of guarantees, a
// different file.
//
// Rendering happens here rather than in the browser because the renderer
// measures text out of real font files, which a browser tab cannot do. The
// pane receives an SVG and an atlas and owns the camera and the selection.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { errorMessage } from "@/shared/thrown-error/index";
import {
	findView,
	resolveVariant,
	scopedContent,
	type DiagramGrammar,
	type OfferedView,
	type SemanticBoard,
	type SemanticVariant,
	type ToldStanding,
	type SemanticView,
	type VariantContent,
} from "@/shared/semantic-board/index";
import { listSemanticBoards, readSemanticBoard } from "@/runtime/semantic-board-store/index";
import { renderSemanticView, SemanticRenderError } from "@/runtime/semantic-renderer/index";
import { asyncEndpoint } from "@/server/canvas/lib/mutation-work";
import { drawingOf } from "@/server/canvas/lib/semantic-board-changes";
import {
	adoptRoute,
	branchRoute,
	createRoute,
	editRoute,
	resolveRoute,
} from "@/server/canvas/lib/semantic-board-writes";

/** The themes a render can be asked for. */
const RenderThemeSchema = z.enum(["light", "dark"]).default("light");

/**
 * Where the drawn faces come from.
 *
 * A pane is inside a page the canvas serves, so it links them and the browser
 * caches them once. A file somebody keeps has no canvas behind it, so it
 * carries them. The default is the pane's, because that is the render the
 * viewer asks for on every change.
 */
const RenderFontsSchema = z.enum(["linked", "embedded"]).default("linked");

/**
 * The board name a request is about.
 * @param req The request.
 * @returns The name, or undefined when the request named none.
 */
function askedBoard(req: Request): string | undefined {
	const asked = req.query["board"];
	return typeof asked === "string" && asked.trim() !== "" ? asked : undefined;
}

/**
 * Answer a request that named no board.
 * @param res The response.
 */
function refuseUnnamedBoard(res: Response): void {
	res.status(400).json({
		success: false,
		error: "Name the board: /api/semantic-boards/...?board=<name>",
	});
}

/**
 * Every semantic board in the vault.
 * @param _req The request.
 * @param res Its response.
 */
function listRoute(_req: Request, res: Response): void {
	try {
		res.json({
			success: true,
			boards: listSemanticBoards().map((board) => ({ name: board.name, key: board.key })),
		});
	} catch (error) {
		res.status(500).json({ success: false, error: errorMessage(error) });
	}
}

/**
 * One board's whole aggregate, as it is on disk.
 * @param req The request.
 * @param res Its response.
 */
function readRoute(req: Request, res: Response): void {
	const asked = askedBoard(req);
	if (asked === undefined) {
		refuseUnnamedBoard(res);
		return;
	}
	try {
		const read = readSemanticBoard(asked);
		if (!read.ok) {
			res.status(read.code === "BOARD_MISSING" ? 404 : 422).json({
				success: false,
				code: read.code,
				error: read.problem,
			});
			return;
		}
		res.json({ success: true, board: read.board });
	} catch (error) {
		res.status(400).json({ success: false, error: errorMessage(error) });
	}
}

/**
 * One variant of one board, drawn.
 * @param req The request.
 * @param res Its response.
 */
function renderRoute(req: Request, res: Response): void {
	const asked = askedBoard(req);
	if (asked === undefined) {
		refuseUnnamedBoard(res);
		return;
	}
	try {
		answerRender(req, res, asked);
	} catch (error) {
		res.status(400).json({ success: false, error: errorMessage(error) });
	}
}

/**
 * The variant a render request named: the one it asked for, or the board's
 * current designation when it asked for none.
 * @param board The board.
 * @param wanted What the request named, straight off the query string.
 * @returns The variant, or undefined when nothing answers to that name.
 */
function askedVariant(board: SemanticBoard, wanted: unknown): SemanticVariant | undefined {
	return resolveVariant(board, typeof wanted === "string" ? wanted : undefined);
}

/** What a render request selects, once every stated selector has been read. */
interface RenderChoices {
	readonly theme: "light" | "dark";
	readonly fonts: "linked" | "embedded";
	readonly variant?: string;
	readonly view?: string;
}

/** The selectors a render request may state, all of them optional. */
const RENDER_SELECTORS = ["variant", "view", "theme", "fonts"] as const;

/**
 * One stated selector, or why it cannot be acted on.
 *
 * Absent and empty are deliberately not the same thing. Leaving a selector out
 * asks for the default — the current variant, the whole of it — and that is the
 * request the viewer makes constantly. Stating one and saying nothing in it is a
 * request that went wrong on the way here: an address that lost its value, a
 * repeated parameter that arrived as a list. Treating that as "the whole
 * variant" would draw something the caller did not ask for and report success.
 * @param raw What arrived on the query string.
 * @param name The selector's name, for the refusal to quote.
 * @returns The stated value, its absence, or the refusal.
 */
function selector(
	raw: unknown,
	name: string,
): { readonly ok: true; readonly value?: string } | { readonly ok: false; readonly why: string } {
	if (raw === undefined) {
		return { ok: true };
	}
	if (typeof raw !== "string") {
		return { ok: false, why: `"${name}" was stated more than once; state it once or leave it out` };
	}
	if (raw.trim() === "") {
		return {
			ok: false,
			why: `"${name}" was stated but names nothing; leave it out to ask for all`,
		};
	}
	return { ok: true, value: raw };
}

/**
 * Everything a render request selects, or the first selector that went wrong.
 * @param req The request.
 * @returns The choices, or why the request cannot be acted on.
 */
function statedRender(
	req: Request,
):
	| { readonly ok: true; readonly how: RenderChoices }
	| { readonly ok: false; readonly why: string } {
	const stated: Record<string, string> = {};
	for (const name of RENDER_SELECTORS) {
		const one = selector(req.query[name], name);
		if (!one.ok) {
			return one;
		}
		if (one.value !== undefined) {
			stated[name] = one.value;
		}
	}
	return chosen(stated);
}

/**
 * The drawing choices a request states, with each stated one held to the
 * vocabulary it has to come from.
 * @param stated The selectors that were stated, by name.
 * @returns The choices, or why one of them is not a choice.
 */
function chosen(
	stated: Readonly<Record<string, string>>,
):
	| { readonly ok: true; readonly how: RenderChoices }
	| { readonly ok: false; readonly why: string } {
	const theme = RenderThemeSchema.safeParse(stated["theme"]);
	if (!theme.success) {
		return { ok: false, why: `"theme" says "${stated["theme"]}"; a render is light or dark` };
	}
	const fonts = RenderFontsSchema.safeParse(stated["fonts"]);
	if (!fonts.success) {
		return { ok: false, why: `"fonts" says "${stated["fonts"]}"; they are linked or embedded` };
	}
	return {
		ok: true,
		how: {
			theme: theme.data,
			fonts: fonts.data,
			...(stated["variant"] === undefined ? {} : { variant: stated["variant"] }),
			...(stated["view"] === undefined ? {} : { view: stated["view"] }),
		},
	};
}

/**
 * Draw the variant a render request named.
 * @param req The request.
 * @param res Its response.
 * @param asked The board name.
 */
function answerRender(req: Request, res: Response, asked: string): void {
	const stated = statedRender(req);
	if (!stated.ok) {
		res.status(400).json({ success: false, code: "BAD_REQUEST", error: stated.why });
		return;
	}
	const board = readableBoard(res, asked);
	if (board === null) {
		return;
	}
	const variant = askedVariant(board, stated.how.variant);
	if (variant === undefined) {
		refuseUnknownVariant(res, stated.how.variant);
		return;
	}
	const view = askedView(stated.how.view, res, variant);
	if (view === null) {
		return;
	}
	answerDrawn(res, board, variant, {
		theme: stated.how.theme,
		fonts: stated.how.fonts,
		...(view === undefined ? {} : { view }),
	});
}

/**
 * The board a request is about, or nothing once the refusal has been answered.
 * @param res The response.
 * @param asked The board name.
 * @returns The board, or null when it could not be read.
 */
function readableBoard(res: Response, asked: string): SemanticBoard | null {
	const read = readSemanticBoard(asked);
	if (read.ok) {
		return read.board;
	}
	res.status(read.code === "BOARD_MISSING" ? 404 : 422).json({
		success: false,
		code: read.code,
		error: read.problem,
	});
	return null;
}

/**
 * Answer a request that named a variant this board has not got.
 * @param res The response.
 * @param wanted What the request named, straight off the query string.
 */
function refuseUnknownVariant(res: Response, wanted: unknown): void {
	res.status(404).json({
		success: false,
		code: "UNKNOWN_VARIANT",
		error: `this board has no variant called "${typeof wanted === "string" ? wanted : ""}"`,
	});
}

/**
 * The view a render request named, or nothing when it named none.
 * @param asked The view the request stated, or nothing when it stated none.
 * @param res Its response.
 * @param variant The variant being drawn.
 * @returns The view, undefined for the whole variant, or null once refused.
 */
function askedView(
	asked: string | undefined,
	res: Response,
	variant: SemanticVariant,
): SemanticView | undefined | null {
	if (asked === undefined) {
		return undefined;
	}
	const view = findView(variant.content, asked);
	if (view !== undefined) {
		return view;
	}
	res.status(404).json({
		success: false,
		code: "UNKNOWN_VIEW",
		error: `variant "${variant.name}" has no view called "${asked}"`,
	});
	return null;
}

/**
 * A view as a reader needs to know it: enough to ask for it again.
 * @param view The view.
 * @returns What the answer carries about it.
 */
function offered(view: SemanticView): OfferedView {
	return { id: view.id, name: view.name, grammar: view.grammar };
}

/**
 * Draw one variant, or say that there is nothing on it yet.
 *
 * An empty board is not an error: it is a board somebody has just made and has
 * not filled in. The viewer shows that as its own state, so it is answered as a
 * success that carries no picture rather than as a failure.
 * @param res The response.
 * @param board The board.
 * @param variant The variant to draw.
 * @param how What to draw and how.
 * @param how.theme Which colour scheme to draw for.
 * @param how.fonts Where the drawn faces come from.
 * @param how.view The view to draw, or nothing for the whole variant.
 */
function answerDrawn(
	res: Response,
	board: SemanticBoard,
	variant: SemanticVariant,
	how: { theme: "light" | "dark"; fonts: "linked" | "embedded"; view?: SemanticView },
): void {
	const reading = readingOf(variant, how.view);
	// What a change took away is half of what a reader came to see, and it lives
	// only in the predecessor, so the picture — never the board — puts it back.
	// A named view that selects everything is the whole variant under another
	// name, and says so about removals too: the two readings differ in what they
	// are called, not in what they show.
	const proposal = drawingOf(board, variant, reading.content, showsAll(how.view));
	const identity = {
		success: true,
		board: board.name,
		version: board.version,
		variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
		theme: how.theme,
		view: how.view === undefined ? null : offered(how.view),
		views: variant.content.views.map(offered),
		// Derived here, on the way out, against this variant's actual predecessor.
		// A variant with none carries null, which is not the same as carrying an
		// empty set of changes: one has nothing to have changed, the other changed
		// nothing.
		changes: proposal.changes,
		// Coherent, and out of date with the variant it came from: the viewer says
		// so rather than showing a picture that looks settled.
		waiting: toldStanding(variant),
	};
	try {
		res.json({
			...identity,
			// The picture is drawn from the proposal's content with what the change
			// took away put back, and the renderer is told how each subject stands
			// so a restored one reads as absent rather than as part of the proposal.
			...renderSemanticView({
				content: proposal.content,
				grammar: reading.grammar,
				theme: how.theme,
				fonts: how.fonts,
				...(proposal.changes === null ? {} : { standing: proposal.changes.standing }),
			}),
		});
	} catch (error) {
		if (error instanceof SemanticRenderError) {
			res.json({ ...identity, empty: error.code });
			return;
		}
		throw error;
	}
}

/**
 * Whether this picture is of the whole variant: no view at all, or a view whose
 * scope is everything.
 * @param view The view being read through, or nothing for the whole variant.
 * @returns True when nothing is being left out.
 */
function showsAll(view: SemanticView | undefined): boolean {
	return view === undefined || view.scope.kind === "all";
}

/**
 * What is drawn, and which grammar explains it.
 *
 * The view is cut out here, before anything is drawn: a view that hides a node
 * is a narrower reading of the variant, never a variant that lost one. The
 * grammar is the view's own statement rather than a guess from what the content
 * happens to hold — a variant with one flow on it is still an architecture
 * until a view says otherwise — and a request for the whole variant is asking
 * what the parts are and how they are wired.
 * @param variant The variant.
 * @param view The view to read it through, or nothing for the whole of it.
 * @returns The content to draw and the grammar to draw it in.
 */
function readingOf(
	variant: SemanticVariant,
	view: SemanticView | undefined,
): { content: VariantContent; grammar: DiagramGrammar } {
	if (view === undefined) {
		return { content: variant.content, grammar: "architecture" };
	}
	return { content: scopedContent(variant.content, view.scope), grammar: view.grammar };
}

/**
 * Mount the semantic-board routes.
 *
 * The two writes go through `asyncEndpoint`, which is the canvas's own
 * mutation admission: it gives the work a lease that the shutdown drain counts,
 * and a signal that is aborted when the caller disconnects. A write that made
 * its own signal would be work the canvas does not know it is doing — a caller
 * that walked away could still be queued behind a lock and still commit, and a
 * stop could decide the canvas was idle while it happened.
 * @param app The express application.
 */
function mountSemanticBoardRoutes(app: Express): void {
	app.get("/api/semantic-boards", listRoute);
	app.get("/api/semantic-boards/board", readRoute);
	app.get("/api/semantic-boards/render", renderRoute);
	app.post("/api/semantic-boards/create", asyncEndpoint(createRoute));
	app.post("/api/semantic-boards/edit", asyncEndpoint(editRoute));
	app.post("/api/semantic-boards/branch", asyncEndpoint(branchRoute));
	app.post("/api/semantic-boards/resolve", asyncEndpoint(resolveRoute));
	app.post("/api/semantic-boards/adopt", asyncEndpoint(adoptRoute));
}

/**
 * What a variant is waiting on, as a reader is told it.
 *
 * Everything the standing says except the state it was measured from. That base
 * is a whole second copy of the architecture, kept so a later merge has
 * something to compare against; a reader draws two sentences from this and
 * would be sent the board twice for them.
 * @param variant The variant being drawn.
 * @returns What it is waiting on, or null when it is waiting on nothing.
 */
function toldStanding(variant: SemanticVariant): ToldStanding | null {
	const standing = variant.reconciliation;
	if (standing === undefined) {
		return null;
	}
	const { base: _measuredFrom, ...told } = standing;
	return told;
}

export { mountSemanticBoardRoutes };
