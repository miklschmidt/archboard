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
// The render route draws under the Bun host, for anything that has no renderer
// of its own. What it answers is assembled by `renderBoard` in the renderer
// core, the same function a browser drawing from the board it read runs
// (TASK-247), so the two cannot answer the same request differently.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { errorMessage } from "@/shared/thrown-error/index";
import type { SemanticBoard } from "@/shared/semantic-board/index";
import {
	listSemanticBoards,
	checkSemanticVault,
	readSemanticBoard,
	readSemanticBoardConfiguration,
} from "@/runtime/semantic-board-store/index";
import { renderBoard } from "@/runtime/semantic-renderer/index";
import { asyncEndpoint } from "@/server/canvas/lib/mutation-work";
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
		const configured = readSemanticBoardConfiguration();
		res.json({
			success: true,
			levels: configured.configuration.levels,
			boards: listSemanticBoards().map((location) => {
				const { name, key } = location;
				const read = readSemanticBoard(name);
				return read.ok
					? {
							name,
							key,
							level: read.board.level,
							variants: read.board.variants.map(({ id, name: variantName, lifecycle, parent }) => ({
								id,
								name: variantName,
								lifecycle,
								parentId: parent ?? null,
							})),
						}
					: { name, key, variants: [], error: read.problem };
			}),
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
		res.json({ success: true, board: read.board, warnings: read.warnings });
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
	void answerRender(req, res, asked).catch((error: unknown) => {
		res.status(400).json({ success: false, error: errorMessage(error) });
	});
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
async function answerRender(req: Request, res: Response, asked: string): Promise<void> {
	const stated = statedRender(req);
	if (!stated.ok) {
		res.status(400).json({ success: false, code: "BAD_REQUEST", error: stated.why });
		return;
	}
	const board = readableBoard(res, asked);
	if (board === null) {
		return;
	}
	const outcome = await renderBoard(
		board,
		stated.how,
		readSemanticBoardConfiguration().configuration,
	);
	if (!outcome.ok) {
		res.status(404).json({ success: false, code: outcome.code, error: outcome.error });
		return;
	}
	res.json(outcome.reply);
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
	app.get("/api/vault/check", (_req, res) => {
		res.json({ success: true, ...checkSemanticVault() });
	});
	app.get("/api/semantic-boards", listRoute);
	app.get("/api/semantic-boards/board", readRoute);
	app.get("/api/semantic-boards/render", renderRoute);
	app.post("/api/semantic-boards/create", asyncEndpoint(createRoute));
	app.post("/api/semantic-boards/edit", asyncEndpoint(editRoute));
	app.post("/api/semantic-boards/branch", asyncEndpoint(branchRoute));
	app.post("/api/semantic-boards/resolve", asyncEndpoint(resolveRoute));
	app.post("/api/semantic-boards/adopt", asyncEndpoint(adoptRoute));
}

export { mountSemanticBoardRoutes };
