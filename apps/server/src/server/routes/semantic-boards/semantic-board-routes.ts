// The Archboard server's semantic-board surface.
//
// A semantic write states its own boundary: `writeSemanticBoard` takes the
// board-global lease, honours the claim, makes the expected-version check,
// advances the version once and writes the aggregate atomically (ADR 0023).
// One owner, one set of guarantees.
//
// The render route draws under the Bun host, for anything that has no renderer
// of its own. What it answers is assembled by `renderBoard` in the renderer
// core, the same function a browser drawing from the board it read runs
// (TASK-247), so the two cannot answer the same request differently.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { errorMessage } from "@archboard/diagnostics/errno";
import { acceptedBoardNames, listedBoard } from "@archboard/board/board-listing";
import {
	LayoutEngineSchema,
	type LayoutEngineName,
	StandaloneThemeSchema,
	type StandaloneTheme,
	LegendLayoutSchema,
	type LegendLayout,
} from "@archboard/board/render-reply";
import type { SemanticBoard } from "@archboard/board/document";
import { listSemanticBoards, readSemanticBoard } from "@archboard/board/store-read";
import { checkSemanticVault, readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import { vaultIdentity } from "@archboard/code-binding/resolution";
import { GitCommandError } from "@archboard/process/git";
import { gitCheckoutOfVault } from "@archboard/workspace/checkouts";
import { renderBoard } from "@archboard/renderer/bun";
import { asyncEndpoint } from "#server/middleware/mutation-work/mutation-work.ts";
import {
	correctionPreviewRoute,
	correctionRoute,
	correctionSuggestRoute,
} from "#server/routes/semantic-boards/semantic-board-correction.ts";
import { discardRoute } from "#server/routes/semantic-boards/semantic-board-discard.ts";
import { movePreviewRoute, moveRoute } from "#server/routes/semantic-boards/semantic-board-move.ts";
import { renameRoute } from "#server/routes/semantic-boards/semantic-board-rename.ts";
import { trackEmbedRoute } from "#server/routes/semantic-boards/semantic-board-track.ts";
import {
	adoptRoute,
	shelveRoute,
	branchRoute,
	createRoute,
	editRoute,
	resolveRoute,
} from "#server/routes/semantic-boards/semantic-board-writes.ts";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import type { BoardListingSchema } from "@archboard/board/board-listing";

type BoardListing = z.infer<typeof BoardListingSchema>;

/**
 * The theme a render stands alone in. Absent asks for the page's picture, which
 * paints with the page's colour tokens and so takes whichever theme the page
 * showing it is in; a theme asks for a document that carries that theme's
 * values, for a file or a bitmap, or with `auto` both, for a file that follows
 * its reader's colour scheme.
 */
const RenderThemeSchema = StandaloneThemeSchema.optional();

/**
 * Where the drawn faces come from.
 *
 * A pane is inside a page the server serves, so it links them and the browser
 * caches them once. A file somebody keeps has no server behind it, so it
 * carries them. The default is the pane's, because that is the render the
 * viewer asks for on every change.
 */
const RenderComparisonSchema = z.enum(["on", "off"]).default("on");

/**
 * Whether a render carries a title above the picture (TASK-467). `title`
 * states its words; `titled=on` asks for the names of what is drawn.
 */
const RenderTitledSchema = z.enum(["on", "off"]).default("off");

/**
 * The legend a render carries (TASK-468): `legend` lays it out beside the
 * picture, and `legendOnly=on` draws it without the picture.
 */
const RenderLegendSchema = LegendLayoutSchema.optional();
const RenderLegendOnlySchema = z.enum(["on", "off"]).default("off");

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
 * Every semantic board in the vault the request names.
 * @param req The request.
 * @param res Its response.
 */
function listRoute(req: Request, res: Response): void {
	try {
		const vault = vaultOfRequest(req);
		const configured = readSemanticBoardConfiguration(vault);
		const read = listSemanticBoards(vault).map(
			(location) => [location, readSemanticBoard(vault, location.name)] as const,
		);
		// A drill-down written before a rename names the board as it was then;
		// the listing names it as it is now, so the navigator places the board
		// under the name it goes by (ADR 0036).
		const accepted = acceptedBoardNames(read.map(([, one]) => one));
		// A drill-down that names the vault's own repository is a link within it,
		// so the navigator places its board as it places any other (ADR 0049).
		const vaultRepo = vaultIdentity(vault);
		const listing: BoardListing = {
			success: true,
			levels: configured.configuration.levels,
			boards: read.map(([location, one]) => listedBoard(location, one, accepted, vaultRepo)),
			...(vaultRepo === undefined ? {} : { repository: vaultRepo }),
		};
		res.json(listing);
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
		const read = readSemanticBoard(vaultOfRequest(req), asked);
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
	readonly theme?: StandaloneTheme | undefined;
	readonly variant?: string;
	readonly view?: string;
	readonly against?: string;
	readonly comparison: boolean;
	readonly layout?: LayoutEngineName;
	readonly title?: string | true;
	readonly legend?: LegendLayout;
	readonly legendOnly?: boolean;
}

/** The selectors a render request may state, all of them optional. */
const RENDER_SELECTORS = [
	"variant",
	"view",
	"against",
	"theme",
	"comparison",
	"layout",
	"title",
	"titled",
	"legend",
	"legendOnly",
] as const;

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
		return {
			ok: false,
			why: `"theme" says "${stated["theme"]}"; a render is ${StandaloneThemeSchema.options.join(", ")}`,
		};
	}
	const comparison = statedComparison(stated);
	if (!comparison.ok) return comparison;
	const layout = statedLayout(stated["layout"]);
	if (!layout.ok) return layout;
	const framing = statedFraming(stated);
	if (!framing.ok) return framing;
	return {
		ok: true,
		how: {
			theme: theme.data,
			comparison: comparison.on,
			...namedIn(stated),
			...layout.choice,
			...framing.choice,
		},
	};
}

/**
 * Whether the comparison is drawn. A variant read against another cannot be drawn without one.
 * @param stated The selectors that were stated, by name.
 * @returns Whether it is drawn, or why the request cannot be acted on.
 */
function statedComparison(
	stated: Readonly<Record<string, string>>,
): { readonly ok: true; readonly on: boolean } | { readonly ok: false; readonly why: string } {
	const comparison = RenderComparisonSchema.safeParse(stated["comparison"]);
	if (!comparison.success) {
		return { ok: false, why: `"comparison" says "${stated["comparison"]}"; choose on or off` };
	}
	if (stated["against"] !== undefined && comparison.data === "off") {
		return {
			ok: false,
			why: '"against" reads the variant against another, so it cannot be asked with "comparison" off',
		};
	}
	return { ok: true, on: comparison.data === "on" };
}

/**
 * The variant, view and variant to read it against that a request names, when it names them.
 * @param stated The selectors that were stated, by name.
 * @returns The named ones.
 */
function namedIn(stated: Readonly<Record<string, string>>): {
	variant?: string;
	view?: string;
	against?: string;
} {
	return {
		...(stated["variant"] === undefined ? {} : { variant: stated["variant"] }),
		...(stated["view"] === undefined ? {} : { view: stated["view"] }),
		...(stated["against"] === undefined ? {} : { against: stated["against"] }),
	};
}

/** What a render request asks an export to carry beside its drawing, or why it cannot. */
type Framing =
	| { readonly ok: true; readonly choice: Pick<RenderChoices, "title" | "legend" | "legendOnly"> }
	| { readonly ok: false; readonly why: string };

/**
 * The title and the legend a render request asks for.
 * @param stated The selectors that were stated, by name.
 * @returns What it asks for, or why one of them is not a choice.
 */
function statedFraming(stated: Readonly<Record<string, string>>): Framing {
	const title = statedTitle(stated);
	if (!title.ok) return title;
	const legend = statedLegend(stated);
	if (!legend.ok) return legend;
	return { ok: true, choice: { ...title.choice, ...legend.choice } };
}

/**
 * The title a render request asks for: its words, or with `titled=on` the names of what is drawn.
 * @param stated The selectors that were stated, by name.
 * @returns The title, or why it is not one.
 */
function statedTitle(stated: Readonly<Record<string, string>>): Framing {
	const titled = RenderTitledSchema.safeParse(stated["titled"]);
	if (!titled.success) {
		return { ok: false, why: `"titled" says "${stated["titled"]}"; choose on or off` };
	}
	const title = stated["title"] ?? (titled.data === "on" ? true : undefined);
	return { ok: true, choice: title === undefined ? {} : { title } };
}

/**
 * The legend a render request asks for, if it asks for one.
 * @param stated The selectors that were stated, by name.
 * @returns The legend's layout and whether it stands alone, or why it is not one.
 */
function statedLegend(stated: Readonly<Record<string, string>>): Framing {
	const legend = RenderLegendSchema.safeParse(stated["legend"]);
	if (!legend.success) {
		return {
			ok: false,
			why: `"legend" says "${stated["legend"]}"; choose ${LegendLayoutSchema.options.join(" or ")}`,
		};
	}
	const only = RenderLegendOnlySchema.safeParse(stated["legendOnly"]);
	if (!only.success) {
		return { ok: false, why: `"legendOnly" says "${stated["legendOnly"]}"; choose on or off` };
	}
	if (legend.data === undefined) {
		return only.data === "on"
			? { ok: false, why: '"legendOnly" draws the legend alone; say how in "legend"' }
			: { ok: true, choice: {} };
	}
	return {
		ok: true,
		choice: { legend: legend.data, ...(only.data === "on" ? { legendOnly: true } : {}) },
	};
}

/**
 * The layout engine a render request names, if it names one.
 * @param stated What the request said, if anything.
 * @returns The engine, or why it is not one.
 */
function statedLayout(
	stated: string | undefined,
):
	| { readonly ok: true; readonly choice: { layout?: LayoutEngineName } }
	| { readonly ok: false; readonly why: string } {
	if (stated === undefined) return { ok: true, choice: {} };
	const layout = LayoutEngineSchema.safeParse(stated);
	return layout.success
		? { ok: true, choice: { layout: layout.data } }
		: {
				ok: false,
				why: `"layout" says "${stated}"; choose ${LayoutEngineSchema.options.join(" or ")}`,
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
	const vault = vaultOfRequest(req);
	const board = readableBoard(res, vault, asked);
	if (board === null) {
		return;
	}
	await sendRender(res, vault, board, stated.how);
}

/**
 * Draw a board and answer with the picture.
 * @param res The response.
 * @param vault The vault the request named.
 * @param board The board, as read.
 * @param how What the request selects.
 */
async function sendRender(
	res: Response,
	vault: string,
	board: SemanticBoard,
	how: RenderChoices,
): Promise<void> {
	const policy = readSemanticBoardConfiguration(vault).configuration;
	const recipe = standsAlone(how) ? recipeContext(vault) : undefined;
	if (recipe?.ok === false) {
		res.status(500).json({ success: false, code: recipe.code, error: recipe.error });
		return;
	}
	const outcome = await renderBoard(board, how, policy, recipe?.context);
	if (!outcome.ok) {
		res.status(404).json({ success: false, code: outcome.code, error: outcome.error });
		return;
	}
	res.json(outcome.reply);
}

/**
 * What a render's recipe needs to know of the vault: the repository that holds
 * it, or null when none does. A Git that does not answer is no such fact, and
 * a recipe that said "no repository" would send an embed to a vault that has one.
 * @param vault The vault directory.
 * @returns The context, or the refusal to answer with when Git did not answer.
 */
function recipeContext(vault: string):
	| { readonly ok: true; readonly context: { vault: { repo: string | null } } }
	| {
			readonly ok: false;
			readonly code: "VAULT_REPOSITORY_UNKNOWN";
			readonly error: string;
	  } {
	try {
		return { ok: true, context: { vault: { repo: gitCheckoutOfVault(vault)?.identity ?? null } } };
	} catch (error) {
		if (!(error instanceof GitCommandError)) throw error;
		return {
			ok: false,
			code: "VAULT_REPOSITORY_UNKNOWN",
			error: `Git did not say which repository holds the vault, so the render's recipe cannot name it: ${error.message} Try again.`,
		};
	}
}

/**
 * Whether a render is a board render: a document in a theme of its own with
 * its faces embedded, which a file keeps without a server behind it. Such a
 * render carries its render recipe (ADR 0057). A pane's picture and a picture
 * that links its faces carry none.
 * @param how What the request selects.
 * @returns True when the render stands alone.
 */
function standsAlone(how: RenderChoices): boolean {
	return how.theme !== undefined && how.fonts === "embedded";
}

/**
 * The board a request is about, or nothing once the refusal has been answered.
 * @param res The response.
 * @param vault The vault the request named.
 * @param asked The board name.
 * @returns The board, or null when it could not be read.
 */
function readableBoard(res: Response, vault: string, asked: string): SemanticBoard | null {
	const read = readSemanticBoard(vault, asked);
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
 * The two writes go through `asyncEndpoint`, which is the server's own
 * mutation admission: it gives the work a lease that the shutdown drain counts,
 * and a signal that is aborted when the caller disconnects. A write that made
 * its own signal would be work the server does not know it is doing — a caller
 * that walked away could still be queued behind a lock and still commit, and a
 * stop could decide the server was idle while it happened.
 * @param app The express application.
 */
function mountSemanticBoardRoutes(app: Express): void {
	app.get("/api/vault/check", requireVault, (req, res) => {
		res.json({ success: true, ...checkSemanticVault(vaultOfRequest(req)) });
	});
	app.get("/api/semantic-boards", requireVault, listRoute);
	app.get("/api/semantic-boards/board", requireVault, readRoute);
	app.get("/api/semantic-boards/render", requireVault, renderRoute);
	app.post("/api/semantic-boards/create", requireVault, asyncEndpoint(createRoute));
	app.post("/api/semantic-boards/edit", requireVault, asyncEndpoint(editRoute));
	app.post(
		"/api/semantic-boards/correct-preview",
		requireVault,
		asyncEndpoint(correctionPreviewRoute),
	);
	app.post("/api/semantic-boards/correct", requireVault, asyncEndpoint(correctionRoute));
	app.get("/api/semantic-boards/correct-suggest", requireVault, correctionSuggestRoute);
	app.post("/api/semantic-boards/branch", requireVault, asyncEndpoint(branchRoute));
	app.post("/api/semantic-boards/resolve", requireVault, asyncEndpoint(resolveRoute));
	app.post("/api/semantic-boards/adopt", requireVault, asyncEndpoint(adoptRoute));
	app.post("/api/semantic-boards/shelve", requireVault, asyncEndpoint(shelveRoute));
	app.post("/api/semantic-boards/rename", requireVault, asyncEndpoint(renameRoute));
	app.post("/api/semantic-boards/track-embed", requireVault, asyncEndpoint(trackEmbedRoute));
	app.post("/api/semantic-boards/discard", requireVault, asyncEndpoint(discardRoute));
	app.post("/api/semantic-boards/move", requireVault, asyncEndpoint(moveRoute));
	app.get("/api/semantic-boards/move-preview", requireVault, movePreviewRoute);
}

export { mountSemanticBoardRoutes };
