// The locality route, `GET /api/semantic-boards/locality` (ADR 0045).
//
// `archboard semantic locality` asks it, and the pane inspector asks it when a
// user selects a part (TASK-369.07), never on a timer. It reads Git, which
// takes a moment, so it runs only on a request and never inside
// `/api/vault/check`, which every open canvas polls every 5 seconds. It runs as
// checkout work, the admission the code opener uses: a caller that hangs up
// stops its wait, and a stop cancels the work and waits for it to settle. A
// reading changes nothing, so the route is a GET.
//
// The query names the board, and optionally a draft (`variant`) and the start
// of the period (`since`). The route holds the query to a board and a date;
// the reading takes the board and the variant by name and says itself which
// variant it reads (`@archboard/code-intel/history-lens`). The route maps a
// refusal to its status: a missing board is 404, and every other refusal of
// the reading is 422.

import type { Express, Request, Response } from "express";
import { createLocalityReading } from "@archboard/code-intel/history-lens";
import { checkoutWork } from "#server/wiring/owners/server-owners.ts";
import { PeriodStartSchema } from "@archboard/code-intel/history";
import { errorMessage } from "@archboard/diagnostics/errno";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";

/** What the route needs, which the Archboard server supplies and a test can replace. */
interface LocalityRouteDependencies {
	/** Run the reading as checkout work for one request. */
	runCheckout<T>(
		request: Request,
		response: Response,
		name: string,
		work: (signal: AbortSignal) => Promise<T>,
	): Promise<T>;
	/** Read the hotspots of the variant of a board that a request names. */
	readonly read: LocalityReading["read"];
}

/** The reading of locality, with the memory of its answers. */
type LocalityReading = ReturnType<typeof createLocalityReading>;

/** The server's one reading of hotspots, so its memory serves every request. */
const localityReading = createLocalityReading();

/** A request the route turns away, with the code the CLI maps to its exit status. */
interface Refusal {
	readonly ok: false;
	readonly status: number;
	readonly code: string;
	readonly error: string;
}

/** What a request asks for, or why it cannot be answered. */
type Asked =
	| {
			readonly ok: true;
			readonly vault: string;
			readonly board: string;
			readonly variant: string | undefined;
			readonly since: Date | undefined;
	  }
	| Refusal;

/** What the query states, once each parameter has been read. */
interface Query {
	readonly board: string;
	readonly variant: string | undefined;
	readonly since: string | undefined;
}

/**
 * One query parameter. It may be left out, but not stated empty or twice,
 * which means an address that lost its value on the way here.
 * @param raw What arrived on the query string.
 * @param name The parameter's name, for the refusal to quote.
 * @returns The value, its absence, or the refusal.
 */
function stated(
	raw: unknown,
	name: string,
): { readonly ok: true; readonly value: string | undefined } | Refusal {
	if (raw === undefined) return { ok: true, value: undefined };
	if (typeof raw === "string" && raw.trim() !== "") return { ok: true, value: raw };
	return {
		ok: false,
		status: 400,
		code: "BAD_REQUEST",
		error: `"${name}" was stated empty or more than once; state it once with a value, or leave it out.`,
	};
}

/**
 * Hold the parameters to what the route needs: a board, and a start that is a date.
 * @param board The board's name, if stated.
 * @param variant The variant, if stated.
 * @param since The start of the period, if stated.
 * @returns The query, or the refusal.
 */
function validated(
	board: string | undefined,
	variant: string | undefined,
	since: string | undefined,
): { readonly ok: true; readonly query: Query } | Refusal {
	if (board === undefined) {
		return {
			ok: false,
			status: 400,
			code: "BAD_REQUEST",
			error: "Name the board: /api/semantic-boards/locality?board=<name>",
		};
	}
	if (since !== undefined && !PeriodStartSchema.safeParse(since).success) {
		return {
			ok: false,
			status: 400,
			code: "BAD_REQUEST",
			error: `"since" says "${since}"; give a date such as 2026-01-31, or a date and time with its offset.`,
		};
	}
	return { ok: true, query: { board, variant, since } };
}

/**
 * The query of a request.
 * @param request The request.
 * @returns The parameters, or the refusal.
 */
function statedQuery(request: Request): { readonly ok: true; readonly query: Query } | Refusal {
	const board = stated(request.query["board"], "board");
	if (!board.ok) return board;
	const variant = stated(request.query["variant"], "variant");
	if (!variant.ok) return variant;
	const since = stated(request.query["since"], "since");
	if (!since.ok) return since;
	return validated(board.value, variant.value, since.value);
}

/**
 * Read what a request asks for.
 * @param request The request.
 * @returns The board, its variant and the start of the period, by name, or the refusal.
 */
function askedLocality(request: Request): Asked {
	const query = statedQuery(request);
	if (!query.ok) return query;
	const { board, variant, since } = query.query;
	return {
		ok: true,
		vault: vaultOfRequest(request),
		board,
		variant,
		since: since === undefined ? undefined : new Date(since),
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
 * Send the answer of a reading, or its refusal: a missing board is 404, and
 * every other refusal of the reading 422.
 * @param response The response.
 * @param reading The answer, or why the reading reads nothing.
 */
function send(response: Response, reading: Awaited<ReturnType<LocalityReading["read"]>>): void {
	if (reading.ok) response.json({ success: true, ...reading.answer });
	else {
		const status = reading.code === "BOARD_MISSING" ? 404 : 422;
		response.status(status).json({ success: false, code: reading.code, error: reading.problem });
	}
}

/**
 * Answer one request with a reading run as checkout work.
 * @param dependencies How the reading runs.
 * @param request The request.
 * @param response Its response.
 */
async function answerLocality(
	dependencies: LocalityRouteDependencies,
	request: Request,
	response: Response,
): Promise<void> {
	try {
		const asked = askedLocality(request);
		if (!asked.ok) {
			response.status(asked.status).json({ success: false, code: asked.code, error: asked.error });
			return;
		}
		const { vault, board, variant, since } = asked;
		const reading = await dependencies.runCheckout(
			request,
			response,
			"GET /api/semantic-boards/locality",
			(signal) => dependencies.read({ vault, board, variant, since, signal }),
		);
		if (!callerGone(request, response)) send(response, reading);
	} catch (error) {
		if (!callerGone(request, response)) {
			response.status(500).json({ success: false, error: errorMessage(error) });
		}
	}
}

/**
 * Mount `GET /api/semantic-boards/locality`.
 * @param app The application.
 * @param overrides Dependencies a test replaces.
 */
function mountLocalityRoute(
	app: Express,
	overrides: Partial<LocalityRouteDependencies> = {},
): void {
	const dependencies: LocalityRouteDependencies = {
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
		/**
		 * Read through the server's one reading, so its memory serves every request.
		 * @param asked The board, its variant and the start of the period, by name.
		 * @returns The answer, or why it reads nothing.
		 */
		read: (asked) => localityReading.read(asked),
		...overrides,
	};
	app.get("/api/semantic-boards/locality", requireVault, (request, response) => {
		void answerLocality(dependencies, request, response);
	});
}

export { type LocalityRouteDependencies, mountLocalityRoute };
