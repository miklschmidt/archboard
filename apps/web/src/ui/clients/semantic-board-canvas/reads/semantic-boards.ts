// Shared retained drawing types and live vault evidence reads.

import { z } from "zod";
import {
	RememberedFindingsSchema,
	type RememberedFindings,
} from "@archboard/code-intel/code-check";
import { VaultCheckSchema } from "@archboard/board/policy";
import { inVault } from "@archboard/server-requests";
import { BoardListingSchema } from "@archboard/board/board-listing";
import {
	type DiagramAtlas,
	type DiagramBox,
	type DrawnBoard,
	type LayoutEngineName,
	type NothingDrawn,
	type OfferedView,
} from "@archboard/board/render-reply";
import type { RenderedVariantSchema } from "@archboard/board/render-reply";

type ListedBoard = z.infer<typeof BoardListingSchema>["boards"][number];

type RenderedVariant = z.infer<typeof RenderedVariantSchema>;
type BoardListing = z.infer<typeof BoardListingSchema>;
type VaultCheck = z.infer<typeof VaultCheckSchema>;

// The render contract itself is not described here. It is one external protocol
// with three consumers — the canvas that serves it, the command that writes a
// picture beside a file, and this viewer — so it has one owner in
// `@archboard/board/render-reply`, and every consumer infers its types from that.
// Two copies of a protocol are two protocols the first time somebody adds a
// field to one of them.

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

/** One board the vault holds, as the listing reports it. */
type SemanticBoardEntry = ListedBoard;

/** What the listing says: the configured levels, coarsest first, and every board. */
type SemanticBoardListing = Pick<BoardListing, "levels" | "boards" | "repository">;

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
	/** The vault the board is in, as the server names it (ADR 0049). */
	readonly vault: string;
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
	/**
	 * A variant id to read the variant against, in place of the one it is ordinarily read
	 * against; the picture then carries no planned frame (TASK-478.01). A recording's replay
	 * asks with it.
	 */
	readonly against?: string | undefined;
	/** Whether to show proposal comparison treatment; defaults to true. */
	readonly comparison?: boolean | undefined;
	/** Which engine lays it out; the default one when absent (TASK-348). */
	readonly layout?: LayoutEngineName | undefined;
}

/**
 * How a request is compared, as a picture is kept: plain, compared with what the board
 * ordinarily reads the variant against, or compared with the variant it names.
 * @param request What is asked for.
 * @returns The part of the key that says so.
 */
function comparisonKey(request: SemanticRenderRequest): string {
	if (request.comparison === false) return "plain";
	return request.against === undefined ? "compared" : `compared-with-${request.against}`;
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
			: `The Archboard server refused the request (${status}).`;
	return new SemanticBoardError(codeOf(body) ?? "REPLY_INVALID", message);
}

/**
 * Ask the server, and say so plainly when the request never arrived.
 *
 * A cancelled read is rethrown as it was: the cache stops such a read on
 * purpose and must see its own abort rather than a failure a person is shown.
 * @param url The endpoint, query and all.
 * @param vault The vault the read is about.
 * @param signal Cancels the read, when the caller has a signal.
 * @returns The response.
 */
async function requestRoute(url: string, vault: string, signal?: AbortSignal): Promise<Response> {
	try {
		return await fetch(inVault(url, vault), signal === undefined ? {} : { signal });
	} catch (error) {
		if (signal?.aborted === true) {
			throw error;
		}
		throw new SemanticBoardError("UNREACHABLE", "The Archboard server did not answer.");
	}
}

/**
 * Read a semantic route and hand back its decoded body, or throw the failure.
 * @param url The endpoint, query and all.
 * @param vault The vault the read is about.
 * @param signal Cancels the read, when the caller has a signal.
 * @returns The decoded success body, before its shape has been checked.
 */
async function readRoute(url: string, vault: string, signal?: AbortSignal): Promise<unknown> {
	const response = await requestRoute(url, vault, signal);
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok || (isRecord(body) && body["success"] === false)) {
		throw refusalFrom(body, response.status);
	}
	return body;
}

/** The route the shared vault checker answers on. */
const VAULT_CHECK_URL = "/api/vault/check";

/**
 * The vault's policy and diagnostics, as the shared checker reports them.
 * @param vault The vault.
 * @param signal Cancels the read.
 * @returns The checked policy and diagnostics.
 */
async function fetchVaultCheck(vault: string, signal?: AbortSignal): Promise<VaultCheck> {
	const response = await requestRoute(VAULT_CHECK_URL, vault, signal);
	if (!response.ok) {
		throw new Error("The vault check failed. Check the server connection and try again.");
	}
	return VaultCheckSchema.parse(await response.json());
}

/** The route the server answers the findings of the last code pass on. */
const CODE_FINDINGS_URL = "/api/vault/code-findings";

/**
 * What the last code pass found on each board it read, as the server remembers
 * it. The route reads the server's memory and never starts a pass (ADR 0046),
 * so asking it costs a read of memory however often a pane asks.
 * @param vault The vault.
 * @param signal Cancels the read.
 * @returns The remembered readings.
 */
async function fetchCodeFindings(vault: string, signal?: AbortSignal): Promise<RememberedFindings> {
	const parsed = RememberedFindingsSchema.safeParse(
		await readRoute(CODE_FINDINGS_URL, vault, signal),
	);
	if (!parsed.success) {
		throw new SemanticBoardError(
			"REPLY_INVALID",
			"The Archboard server sent no findings of the code check.",
		);
	}
	return parsed.data;
}

export {
	SemanticBoardError,
	fetchCodeFindings,
	comparisonKey,
	fetchVaultCheck,
	type SemanticAtlas,
	type SemanticBoardEntry,
	type SemanticBoardListing,
	type SemanticBox,
	type SemanticDrawing,
	type SemanticFailureCode,
	type SemanticNothingDrawn,
	type SemanticRender,
	type SemanticOfferedView,
	type SemanticRenderRequest,
	type SemanticVariantRef,
	type SemanticWaiting,
};
