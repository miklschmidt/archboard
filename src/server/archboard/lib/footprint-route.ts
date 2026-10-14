// The footprint's route, `GET /api/semantic-boards/footprint?board=&base=&variant=`
// (ADR 0045).
//
// `archboard semantic footprint` asks it. It is about one board, so it sits
// beside the board routes, as the locality route does, and not under
// `/api/vault/`. It reads Git in every checkout that holds a part of the board,
// so it runs only on a request, as checkout work, the admission the code opener
// and the code check use: a caller that hangs up cancels it, and a stop cancels
// it and waits for it to settle, so a stop never refuses because of it. A
// reading changes nothing, so the route is a GET. It never runs inside
// `/api/vault/check`, which every open canvas polls.
//
// The answer is not kept in memory (ADR 0045). A footprint is asked once for
// one branch, and a ref such as `origin/main` can move while every HEAD stays,
// so a kept answer would also need the commit the ref resolves to in each
// checkout: most of the work of a walk between a merge base and HEAD.

import type { Express, Request, Response } from "express";
import { readFootprint, type FootprintRequest } from "@/runtime/history-lens/index";
import { readSemanticBoard } from "@/runtime/semantic-board-store/index";
import { queryString } from "@/server/archboard/lib/request-board";
import { checkoutWork } from "@/server/archboard/lib/server-owners";
import { FootprintReplySchema, type FootprintAnswer } from "@/shared/footprint/index";
import {
	addressedVariant,
	currentVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import { errorMessage } from "@/shared/thrown-error/index";
import { requireVault, vaultOfRequest } from "@/server/archboard/lib/request-vault";

/** What the route needs, which the Archboard server supplies and a test can replace. */
interface FootprintRouteDependencies {
	/** Run the reading as checkout work for one request. */
	runCheckout<T>(
		request: Request,
		response: Response,
		name: string,
		work: (signal: AbortSignal) => Promise<T>,
	): Promise<T>;
	/** Read the footprint. */
	readonly read: (request: FootprintRequest) => Promise<FootprintAnswer>;
}

/** A request the route turns away, with the code the CLI maps to its exit status. */
interface Refusal {
	readonly status: number;
	readonly code: string;
	readonly error: string;
}

/** The variants one footprint reads. */
interface FootprintVariants {
	readonly current: SemanticVariant;
	readonly proposal?: SemanticVariant;
}

/**
 * Which variants a request reads: the current variant, and the proposal it
 * names. The lens never reads a historical or a shelved variant (ADR 0045).
 * @param board The board.
 * @param asked The proposal as the caller named it, if it did.
 * @returns The variants, or why the request reads none.
 */
function variantsOf(board: SemanticBoard, asked: string | undefined): FootprintVariants | Refusal {
	const current = currentVariant(board);
	if (current === undefined) {
		return {
			status: 422,
			code: "NO_CURRENT_VARIANT",
			error: `"${board.name}" has no current variant: nothing it describes is built, so there is no code for a footprint to be read against.`,
		};
	}
	if (asked === undefined) return { current };
	const found = addressedVariant(board, asked);
	if (!found.ok) {
		return { status: 422, code: "UNKNOWN_VARIANT", error: `"${board.name}": ${found.problem}` };
	}
	const proposal = found.variant;
	if (proposal.id === current.id) {
		return {
			status: 422,
			code: "NOTHING_TO_COMPARE",
			error: `"${proposal.name}" is the current variant of "${board.name}". Name a draft to set the footprint against, or leave --variant out.`,
		};
	}
	if (proposal.lifecycle !== "draft") {
		return {
			status: 422,
			code: "NOT_A_DRAFT",
			error: `"${proposal.name}" is ${proposal.lifecycle}, and the footprint reads only a draft against the current variant.`,
		};
	}
	return { current, proposal };
}

/**
 * Whether a value is a refusal and not a pair of variants.
 * @param value What a step of the request answered.
 * @returns True for a refusal.
 */
function isRefusal(value: object): value is Refusal {
	return "code" in value;
}

/** What a request asks for. */
interface Asked {
	readonly board: string;
	readonly base: string;
	readonly variant: string | undefined;
}

/** A request the route can read: the board, its variants, and the ref. */
interface Readable extends FootprintVariants {
	readonly vault: string;
	readonly board: SemanticBoard;
	readonly base: string;
}

/**
 * One query parameter, trimmed.
 * @param request The request.
 * @param key The parameter.
 * @returns Its text, or undefined when it is absent or blank.
 */
function parameter(request: Request, key: string): string | undefined {
	const text = queryString(request, key)?.trim();
	return text === "" ? undefined : text;
}

/**
 * What a request asks for.
 * @param request The request.
 * @returns The board, the base and the proposal, or undefined when it names no board or no base.
 */
function askedOf(request: Request): Asked | undefined {
	const board = parameter(request, "board");
	const base = parameter(request, "base");
	return board === undefined || base === undefined
		? undefined
		: { board, base, variant: parameter(request, "variant") };
}

/**
 * Read the board a request names and the variants it asks for.
 * @param vault The vault the request named.
 * @param wanted What the request asks for.
 * @returns What to read, or why the request is turned away.
 */
function readableOf(vault: string, wanted: Asked): Readable | Refusal {
	const read = readSemanticBoard(vault, wanted.board);
	if (!read.ok) {
		return {
			status: read.code === "BOARD_MISSING" ? 404 : 422,
			code: read.code,
			error: read.problem,
		};
	}
	const variants = variantsOf(read.board, wanted.variant);
	return isRefusal(variants)
		? variants
		: { vault, board: read.board, base: wanted.base, ...variants };
}

/**
 * Whether the caller has gone, so nothing is left to answer.
 * @param request The request.
 * @param response Its response.
 * @returns True when the response can no longer be written.
 */
function callerGone(request: Request, response: Response): boolean {
	return request.destroyed || response.destroyed || response.headersSent;
}

/**
 * Turn a request away.
 * @param response Its response.
 * @param refusal Why.
 */
function refuse(response: Response, refusal: Refusal): void {
	const { status, ...body } = refusal;
	response.status(status).json({ success: false, ...body });
}

/**
 * Answer one request with a footprint read as checkout work.
 * @param dependencies How the reading runs.
 * @param request The request.
 * @param response Its response.
 */
async function answerFootprint(
	dependencies: FootprintRouteDependencies,
	request: Request,
	response: Response,
): Promise<void> {
	const wanted = askedOf(request);
	if (wanted === undefined) {
		refuse(response, {
			status: 400,
			code: "BAD_REQUEST",
			error:
				"Name the board and the base: /api/semantic-boards/footprint?board=<name>&base=<ref>[&variant=<proposal>]",
		});
		return;
	}
	try {
		const readable = readableOf(vaultOfRequest(request), wanted);
		if (isRefusal(readable)) {
			refuse(response, readable);
			return;
		}
		const answer = await dependencies.runCheckout(
			request,
			response,
			"GET /api/semantic-boards/footprint",
			(signal) => dependencies.read({ ...readable, signal }),
		);
		if (!callerGone(request, response)) {
			response.json(FootprintReplySchema.parse({ success: true, ...answer }));
		}
	} catch (error) {
		if (!callerGone(request, response)) {
			response.status(500).json({ success: false, error: errorMessage(error) });
		}
	}
}

/**
 * Mount `GET /api/semantic-boards/footprint`.
 * @param app The application.
 * @param overrides Dependencies a test replaces.
 */
function mountFootprintRoute(
	app: Express,
	overrides: Partial<FootprintRouteDependencies> = {},
): void {
	const dependencies: FootprintRouteDependencies = {
		/**
		 * Run the reading as the server's checkout work for this request.
		 * @param request The request.
		 * @param response Its response.
		 * @param name What the work is.
		 * @param work The reading.
		 * @returns Its answer.
		 */
		runCheckout: (request, response, name, work) =>
			checkoutWork.trackRequest(request, response, name, work),
		read: readFootprint,
		...overrides,
	};
	app.get("/api/semantic-boards/footprint", requireVault, (request, response) => {
		void answerFootprint(dependencies, request, response);
	});
}

export { type FootprintRouteDependencies, mountFootprintRoute };
