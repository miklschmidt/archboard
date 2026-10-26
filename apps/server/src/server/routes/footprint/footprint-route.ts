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
// The reading takes the board and its variants by name, and says itself which
// variants it reads and when it refuses (`@archboard/code-intel/history-lens`).
// The route maps a refusal to its status: a missing board is 404, and every
// other refusal of the reading is 422. The answer is not kept in memory (ADR 0045).

import type { Express, Request, Response } from "express";
import { readFootprint } from "@archboard/code-intel/history-lens";
import { queryString, requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { checkoutWork } from "#server/wiring/owners/server-owners.ts";
import { FootprintReplySchema } from "@archboard/code-intel/history";
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

/** What a request asks for, by name. */
interface Asked {
	readonly board: string;
	readonly base: string;
	readonly head: string | undefined;
	readonly variant: string | undefined;
	readonly against: string | undefined;
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
 * @param status The status.
 * @param code The code the CLI maps to its exit status.
 * @param error What happened and what to do next.
 */
function refuse(response: Response, status: number, code: string, error: string): void {
	response.status(status).json({ success: false, code, error });
}

/**
 * Send a footprint, or its refusal: a missing board is 404, and every other
 * refusal of the reading 422.
 * @param response The response.
 * @param reading The footprint, or why it reads nothing.
 */
function send(response: Response, reading: Awaited<ReturnType<typeof readFootprint>>): void {
	if (reading.ok) {
		response.json(FootprintReplySchema.parse({ success: true, ...reading.answer }));
	} else {
		refuse(response, reading.code === "BOARD_MISSING" ? 404 : 422, reading.code, reading.problem);
	}
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
		refuse(
			response,
			400,
			"BAD_REQUEST",
			"Name the board and the base: /api/semantic-boards/footprint?board=<name>&base=<ref>[&head=<ref>][&variant=<proposal>][&against=<variant>]",
		);
		return;
	}
	try {
		const vault = vaultOfRequest(request);
		const reading = await dependencies.runCheckout(
			request,
			response,
			"GET /api/semantic-boards/footprint",
			(signal) => dependencies.read({ vault, ...wanted, signal }),
		);
		if (!callerGone(request, response)) send(response, reading);
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
