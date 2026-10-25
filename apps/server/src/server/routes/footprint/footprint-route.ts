// The footprint's route, `GET /api/semantic-boards/footprint?board=&base=&head=&variant=&against=`
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
import { readFootprint } from "@archboard/code-intel/history-lens";
import { readSemanticBoard } from "@archboard/board/store-read";
import { queryString, requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { checkoutWork } from "#server/wiring/owners/server-owners.ts";
import { FootprintReplySchema, type FootprintAnswer } from "@archboard/code-intel/history";
import type { SemanticBoard } from "@archboard/board/document";
import {
	type FootprintVariants,
	isRefusal,
	type Refusal,
	variantsOf,
} from "#server/rules/footprint/footprint-variants.ts";
import { errorMessage } from "@archboard/diagnostics/errno";

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
	readonly read: typeof readFootprint;
}

/** What a request asks for. */
interface Asked {
	readonly board: string;
	readonly base: string;
	readonly head: string | undefined;
	readonly variant: string | undefined;
	readonly against: string | undefined;
}

/** A request the route can read: the board, its variants, and the ref. */
interface Readable extends FootprintVariants {
	readonly vault: string;
	readonly board: SemanticBoard;
	readonly base: string;
	readonly head: string | undefined;
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
 * @returns The board, the base, the head and the proposal, or undefined when it names no board or no base.
 */
function askedOf(request: Request): Asked | undefined {
	const board = parameter(request, "board");
	const base = parameter(request, "base");
	return board === undefined || base === undefined
		? undefined
		: {
				board,
				base,
				head: parameter(request, "head"),
				variant: parameter(request, "variant"),
				against: parameter(request, "against"),
			};
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
	const variants = variantsOf(read.board, wanted);
	return isRefusal(variants)
		? variants
		: { vault, board: read.board, base: wanted.base, head: wanted.head, ...variants };
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
 * Why a head the caller named is turned away: no checkout that holds a part of
 * the board resolves it, so no part was read and none may look unchanged. A
 * head only some checkouts have is read where it resolves, as a base is.
 * @param answer The footprint, read.
 * @returns The refusal, or undefined when the head resolved somewhere or none was named.
 */
function headRefusal(answer: FootprintAnswer): Refusal | undefined {
	const { head, repositories } = answer;
	const resolved = repositories.some(
		(one) => one.status === "read" || one.reason !== "head-unresolved",
	);
	if (head === undefined || repositories.length === 0 || resolved) return undefined;
	return {
		status: 422,
		code: "HEAD_UNRESOLVED",
		error: `--head "${head}" does not resolve in any checkout that holds a part of "${answer.board}". Name a branch, tag or commit that the checkout has; nothing is fetched.`,
	};
}

/**
 * Send a footprint, or refuse a head that no checkout has.
 * @param response The response.
 * @param answer The footprint, read.
 */
function send(response: Response, answer: FootprintAnswer): void {
	const refusal = headRefusal(answer);
	if (refusal === undefined) {
		response.json(FootprintReplySchema.parse({ success: true, ...answer }));
	} else refuse(response, refusal);
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
				"Name the board and the base: /api/semantic-boards/footprint?board=<name>&base=<ref>[&head=<ref>][&variant=<proposal>][&against=<variant>]",
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
		if (!callerGone(request, response)) send(response, answer);
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
