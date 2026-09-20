// Every call the browser makes to the canvas server's semantic-board routes.
//
// Plain `fetch` on purpose: the browser never imports the board store or the
// vault (ADR 0023). The reads are the whole of what a viewer is allowed to
// know — which boards exist, what one board says, the vault policy, and what
// one variant looks like when the page draws no pictures of its own — and every
// one of them is answered by the server. There is no write call, because the
// viewer never writes a board.
//
// A refusal is carried as an error with the server's own code on it, so the
// stage can say which of the several things went wrong rather than showing one
// shrug for all of them.

import { z } from "zod";
import { VaultCheckSchema, type VaultCheck } from "@/shared/semantic-policy/index";
import {
	SemanticRenderReplySchema,
	RenderedVariantSchema,
	SemanticBoardLevelSchema,
	type DiagramAtlas,
	type DiagramBox,
	type DiagramTheme,
	type DrawnBoard,
	type NothingDrawn,
	type OfferedView,
	type RenderedVariant,
} from "@/shared/semantic-board/index";

// The render contract itself is not described here. It is one external protocol
// with three consumers — the canvas that serves it, the command that writes a
// picture beside a file, and this viewer — so it has one owner in
// `@/shared/semantic-board`, and every consumer infers its types from that.
// Two copies of a protocol are two protocols the first time somebody adds a
// field to one of them.

/** The themes a render can be asked for; the shell owns which one is on. */
type SemanticTheme = DiagramTheme;

/** One subject's box, in the rendered SVG's own viewBox units. */
type SemanticBox = DiagramBox;

/** Where every subject ended up, keyed by the semantic id an agent can name. */
type SemanticAtlas = DiagramAtlas;

/** Which variant was drawn, and where it stands. */
type SemanticVariantRef = RenderedVariant;

/** What a drawn state is waiting on, when it is waiting on anything. */
type SemanticWaiting = NonNullable<DrawnBoard["waiting"]>;

/** One view the board offers, as a switcher needs to know it. */
type SemanticOfferedView = OfferedView;

/** One board the vault holds. */
const BoardEntrySchema = z.object({
	name: z.string(),
	key: z.string(),
	/** The board's version, absent for a board that could not be read. */
	version: z.int().optional(),
	level: SemanticBoardLevelSchema.optional(),
	variants: z.array(RenderedVariantSchema.extend({ parentId: z.string().nullable() })),
	error: z.string().optional(),
});
type SemanticBoardEntry = z.infer<typeof BoardEntrySchema>;

/** The listing route's answer. */
const BoardListSchema = z.object({ success: z.literal(true), boards: z.array(BoardEntrySchema) });

/** A variant with something on it, drawn, as the viewer carries it. */
type SemanticDrawing = DrawnBoard & { readonly kind: "drawn" };

/** A board that is there and has nothing on it yet, as the viewer carries it. */
type SemanticNothingDrawn = NothingDrawn & { readonly kind: "empty" };

/**
 * What a render request answers with. The `kind` is the viewer's own, added
 * once here so that nothing downstream has to ask which half of the union it
 * is holding by looking for a field.
 */
type SemanticRender = SemanticDrawing | SemanticNothingDrawn;

/** What a render request names. */
interface SemanticRenderRequest {
	readonly board: string;
	/** A variant id or name; the board's current variant when absent. */
	readonly variant?: string | undefined;
	/**
	 * A view id or name; the whole variant when absent.
	 *
	 * Which view a pane is reading is the browser's, never the board's: it rides
	 * in the request and in the address, and no answer to it writes anything.
	 */
	readonly view?: string | undefined;
	readonly theme: SemanticTheme;
	/** Whether to show proposal comparison treatment; defaults to true. */
	readonly comparison?: boolean | undefined;
}

/**
 * Why a semantic read failed. The first three are the server's own codes; the
 * last two are the browser's, for a request that never arrived and a reply
 * that was not the contract.
 */
type SemanticFailureCode =
	| "BOARD_MISSING"
	| "UNKNOWN_VARIANT"
	| "UNKNOWN_VIEW"
	| "BOARD_UNREADABLE"
	| "UNREACHABLE"
	| "REPLY_INVALID";

/** A refused or unreachable semantic read, with the code to say which. */
class SemanticBoardError extends Error {
	readonly code: SemanticFailureCode;

	/**
	 * Wrap a refusal.
	 * @param code Which kind of failure this is.
	 * @param message What to tell the person.
	 */
	constructor(code: SemanticFailureCode, message: string) {
		super(message);
		this.name = "SemanticBoardError";
		this.code = code;
	}
}

const LIST_URL = "/api/semantic-boards";
const RENDER_URL = "/api/semantic-boards/render";
const BOARD_URL = "/api/semantic-boards/board";

/** A decoded body, as far as the browser can see before checking its shape. */
type JsonRecord = Readonly<Record<string, unknown>>;

/**
 * Whether a decoded value is a plain object.
 * @param value Any decoded JSON value.
 * @returns True for an object that is neither an array nor null.
 */
function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One of the server's failure codes, when the body carries one.
 * @param body The decoded body.
 * @returns The code, or null when the body names none this module knows.
 */
function codeOf(body: unknown): SemanticFailureCode | null {
	const named = z
		.object({
			code: z.enum(["BOARD_MISSING", "UNKNOWN_VARIANT", "UNKNOWN_VIEW", "BOARD_UNREADABLE"]),
		})
		.safeParse(body);
	return named.success ? named.data.code : null;
}

/**
 * The failure a refused reply carries.
 * @param body The decoded body.
 * @param status The HTTP status, for the fallback words.
 * @returns The error to throw.
 */
function refusalFrom(body: unknown, status: number): SemanticBoardError {
	const said = isRecord(body) ? body["error"] : null;
	const message =
		typeof said === "string" && said !== ""
			? said
			: `The canvas server refused the request (${status}).`;
	return new SemanticBoardError(codeOf(body) ?? "REPLY_INVALID", message);
}

/**
 * Ask the server, and say so plainly when the request never arrived.
 *
 * A cancelled read is rethrown as it was: the cache stops such a read on
 * purpose and must see its own abort rather than a failure a person is shown.
 * @param url The endpoint, query and all.
 * @param signal Cancels the read, when the caller has a signal.
 * @returns The response.
 */
async function requestRoute(url: string, signal?: AbortSignal): Promise<Response> {
	try {
		return await fetch(url, signal === undefined ? {} : { signal });
	} catch (error) {
		if (signal?.aborted === true) {
			throw error;
		}
		throw new SemanticBoardError("UNREACHABLE", "The canvas server did not answer.");
	}
}

/**
 * Read a semantic route and hand back its decoded body, or throw the failure.
 * @param url The endpoint, query and all.
 * @param signal Cancels the read, when the caller has a signal.
 * @returns The decoded success body, before its shape has been checked.
 */
async function readRoute(url: string, signal?: AbortSignal): Promise<unknown> {
	const response = await requestRoute(url, signal);
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok || (isRecord(body) && body["success"] === false)) {
		throw refusalFrom(body, response.status);
	}
	return body;
}

/**
 * Every semantic board the vault holds.
 * @param signal Cancels the read.
 * @returns The boards, in the order the server listed them.
 */
async function fetchSemanticBoards(signal?: AbortSignal): Promise<readonly SemanticBoardEntry[]> {
	const parsed = BoardListSchema.safeParse(await readRoute(LIST_URL, signal));
	if (!parsed.success) {
		throw new SemanticBoardError("REPLY_INVALID", "The canvas server listed no boards.");
	}
	return parsed.data.boards;
}

/**
 * The query string one render request is asking with.
 * @param request The board, the variant and the theme.
 * @returns The query string, with its leading question mark.
 */
function renderQuery(request: SemanticRenderRequest): string {
	const search = new URLSearchParams({ board: request.board, theme: request.theme });
	if (request.variant !== undefined && request.variant !== "") {
		search.set("variant", request.variant);
	}
	if (request.view !== undefined && request.view !== "") {
		search.set("view", request.view);
	}
	if (request.comparison === false) {
		search.set("comparison", "off");
	}
	return `?${search.toString()}`;
}

/**
 * One variant of one board, drawn.
 *
 * The `empty` answer is a success, not a failure: a board that exists and has
 * nothing on it yet is a normal thing for an agent to have just created, and
 * the viewer says so in its own words. A reply that is neither that nor a whole
 * picture is a failure, and is reported as one.
 * @param request The board, the variant and the theme.
 * @param signal Cancels the read.
 * @returns The drawing, or the news that there is nothing to draw.
 */
async function fetchSemanticRender(
	request: SemanticRenderRequest,
	signal?: AbortSignal,
): Promise<SemanticRender> {
	const body = await readRoute(`${RENDER_URL}${renderQuery(request)}`, signal);
	const parsed = SemanticRenderReplySchema.safeParse(body);
	if (!parsed.success) {
		throw new SemanticBoardError(
			"REPLY_INVALID",
			"The canvas server sent a reply that was neither a picture nor an empty board.",
		);
	}
	return "empty" in parsed.data
		? { ...parsed.data, kind: "empty" }
		: { ...parsed.data, kind: "drawn" };
}

/**
 * One board's whole aggregate, as it is on disk. Read-only: nothing in the
 * browser writes a semantic board (ADR 0023).
 * @param board The board name.
 * @param signal Cancels the read.
 * @returns The aggregate, as the server holds it.
 */
async function fetchSemanticBoardDocument(board: string, signal?: AbortSignal): Promise<unknown> {
	const body = await readRoute(`${BOARD_URL}?board=${encodeURIComponent(board)}`, signal);
	const parsed = z.object({ board: z.unknown() }).safeParse(body);
	if (!parsed.success) {
		throw new SemanticBoardError("REPLY_INVALID", "The canvas server sent no board.");
	}
	return parsed.data.board;
}

/** The route the shared vault checker answers on. */
const VAULT_CHECK_URL = "/api/vault/check";

/**
 * The vault's policy and diagnostics, as the shared checker reports them.
 * @param signal Cancels the read.
 * @returns The checked policy and diagnostics.
 */
async function fetchVaultCheck(signal?: AbortSignal): Promise<VaultCheck> {
	const response = await requestRoute(VAULT_CHECK_URL, signal);
	if (!response.ok) {
		throw new Error("The vault check failed. Check the server connection and try again.");
	}
	return VaultCheckSchema.parse(await response.json());
}

export {
	SemanticBoardError,
	fetchSemanticBoardDocument,
	fetchSemanticBoards,
	fetchSemanticRender,
	fetchVaultCheck,
	type SemanticAtlas,
	type SemanticBoardEntry,
	type SemanticBox,
	type SemanticDrawing,
	type SemanticFailureCode,
	type SemanticNothingDrawn,
	type SemanticRender,
	type SemanticOfferedView,
	type SemanticRenderRequest,
	type SemanticTheme,
	type SemanticVariantRef,
	type SemanticWaiting,
};
