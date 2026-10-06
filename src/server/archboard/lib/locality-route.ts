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
// of the period (`since`). It reads the board's current variant when it names
// no variant. A historical or shelved variant is refused, because only the
// current variant says that its architecture is built (ADR 0031).

import type { Express, Request, Response } from "express";
import { createLocalityReading } from "@/runtime/history-lens/index";
import { readSemanticBoard } from "@/runtime/semantic-board-store/index";
import { checkoutWork } from "@/server/archboard/lib/server-owners";
import { PeriodStartSchema, type LocalityAnswer } from "@/shared/locality/index";
import {
	resolveVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import { errorMessage } from "@/shared/thrown-error/index";

/** What the route needs, which the Archboard server supplies and a test can replace. */
interface LocalityRouteDependencies {
	/** Run the reading as checkout work for one request. */
	runCheckout<T>(
		request: Request,
		response: Response,
		name: string,
		work: (signal: AbortSignal) => Promise<T>,
	): Promise<T>;
	/** Read the hotspots of one variant of one board. */
	readonly read: (
		board: SemanticBoard,
		variant: SemanticVariant,
		since: Date | undefined,
		signal: AbortSignal,
	) => Promise<LocalityAnswer>;
}

/** The server's one reading of hotspots, so its memory serves every request. */
const localityReading = createLocalityReading();

/** A request that cannot be answered, and why. */
interface Refusal {
	readonly ok: false;
	readonly status: number;
	readonly code?: string;
	readonly error: string;
}

/** What a request asks for, or why it cannot be answered. */
type Asked =
	| {
			readonly ok: true;
			readonly board: SemanticBoard;
			readonly variant: SemanticVariant;
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
		error: `"${name}" was stated but names one value; state it once or leave it out`,
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
			error: "Name the board: /api/semantic-boards/locality?board=<name>",
		};
	}
	if (since !== undefined && !PeriodStartSchema.safeParse(since).success) {
		return {
			ok: false,
			status: 400,
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
 * The variant the lens reads: the current one, or the draft that was named.
 * @param board The board.
 * @param asked The variant's id or name, or undefined for the current one.
 * @returns The variant, or why the lens does not read it.
 */
function readableVariant(
	board: SemanticBoard,
	asked: string | undefined,
): { readonly ok: true; readonly variant: SemanticVariant } | Refusal {
	const variant = resolveVariant(board, asked);
	if (variant === undefined) {
		const error =
			asked === undefined
				? `"${board.name}" has no current variant: nothing it describes is built. Name a draft with the variant option.`
				: `"${board.name}" has no variant called "${asked}".`;
		return { ok: false, status: 400, error };
	}
	if (variant.lifecycle === "current" || variant.lifecycle === "draft") {
		return { ok: true, variant };
	}
	return {
		ok: false,
		status: 400,
		error: `"${variant.name}" is ${variant.lifecycle}: the lens reads only the current variant and a draft.`,
	};
}

/**
 * Read what a request asks for.
 * @param request The request.
 * @returns The board, its variant and the start of the period, or the refusal.
 */
function askedLocality(request: Request): Asked {
	const query = statedQuery(request);
	if (!query.ok) return query;
	const read = readSemanticBoard(query.query.board);
	if (!read.ok) {
		const status = read.code === "BOARD_MISSING" ? 404 : 422;
		return { ok: false, status, code: read.code, error: read.problem };
	}
	const chosen = readableVariant(read.board, query.query.variant);
	if (!chosen.ok) return chosen;
	const { since } = query.query;
	return {
		ok: true,
		board: read.board,
		variant: chosen.variant,
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
			response.status(asked.status).json({
				success: false,
				...(asked.code === undefined ? {} : { code: asked.code }),
				error: asked.error,
			});
			return;
		}
		const answer = await dependencies.runCheckout(
			request,
			response,
			"GET /api/semantic-boards/locality",
			(signal) => dependencies.read(asked.board, asked.variant, asked.since, signal),
		);
		if (!callerGone(request, response)) response.json({ success: true, ...answer });
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
		 * @param board The board.
		 * @param variant The variant.
		 * @param since The start of the period.
		 * @param signal Cancels the reading.
		 * @returns The answer.
		 */
		read: (board, variant, since, signal) => localityReading.read(board, variant, since, signal),
		...overrides,
	};
	app.get("/api/semantic-boards/locality", (request, response) => {
		void answerLocality(dependencies, request, response);
	});
}

export { type LocalityRouteDependencies, mountLocalityRoute };
