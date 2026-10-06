// The code check's route, `GET /api/vault/code-check[?variant=<draft>]`
// (ADR 0046).
//
// `archboard check --code` asks it after the plain check. It reads code and
// Git, which takes seconds, so it runs only on a request and never inside
// `/api/vault/check`, which every open canvas polls every 5 seconds. It runs as
// checkout work, the admission the code opener uses: a caller that hangs up
// cancels it, and a stop cancels it and waits for it to settle, so a stop
// never refuses because of it. A pass changes nothing, so the route is a GET.
//
// The code pass (`src/runtime/code-check`) reads every board at its current
// variant, or at the draft `variant` names, and gives `boards`, `findings` and
// `skipped`. Behind (ADR 0045, TASK-369.02) reads the current variant of each
// board, whatever the pass reads. A `variant` that names no draft on any board
// is refused with the drafts that exist.

import type { Express, Request, Response } from "express";
import { checkCode, readBoardsToCheck, type NoSuchDraft } from "@/runtime/code-check/index";
import { requireVaultRoot } from "@/runtime/engine/board";
import { createBehindReading } from "@/runtime/history-lens/index";
import { queryString } from "@/server/archboard/lib/request-board";
import { checkoutWork } from "@/server/archboard/lib/server-owners";
import { CodeCheckAnswerSchema, type CodeCheckAnswer } from "@/shared/code-check/index";
import { errorMessage } from "@/shared/thrown-error/index";

/** What one request asks for: the draft to read where a board has one, and how to cancel. */
interface CodeCheckRequest {
	readonly variant: string | undefined;
	readonly signal: AbortSignal;
}

/** What the route needs, which the Archboard server supplies and a test can replace. */
interface CodeCheckRouteDependencies {
	/** Run the pass as checkout work for one request. */
	runCheckout<T>(
		request: Request,
		response: Response,
		name: string,
		work: (signal: AbortSignal) => Promise<T>,
	): Promise<T>;
	/** Run the code check, or say that no board has the named draft. */
	readonly check: (request: CodeCheckRequest) => Promise<CodeCheckAnswer | NoSuchDraft>;
}

/** The server's one reading of behind, so its memory serves every request. */
const behindReading = createBehindReading();

/**
 * Run the code check over every board of the vault, at its current variant or
 * the named draft, with behind beside it.
 * @param request The draft to read, and the signal that cancels the check and
 * every Git command it runs.
 * @returns The answer, or the drafts that exist when no board has the named one.
 */
async function runCodeCheck(request: CodeCheckRequest): Promise<CodeCheckAnswer | NoSuchDraft> {
	const vault = requireVaultRoot();
	const read = readBoardsToCheck(vault, request.variant);
	if (!read.ok) return read;
	const [code, behind] = await Promise.all([
		checkCode(read.boards, request.signal),
		behindReading.read(
			vault,
			read.boards.map(({ board, file }) => ({ board, file })),
			request.signal,
		),
	]);
	return CodeCheckAnswerSchema.parse({
		boards: read.boards.map(({ board, variant }) => ({
			board: board.name,
			variant: variant.id,
			version: board.version,
		})),
		findings: code.findings,
		skipped: [...read.skipped, ...code.skipped],
		behind,
	});
}

/**
 * The refusal of a variant that names no draft.
 * @param refused The variant asked for and the drafts that exist.
 * @returns The refusal's body.
 */
function noSuchDraft(refused: NoSuchDraft): { code: string; error: string } {
	const drafts =
		refused.drafts.length === 0
			? "No board has a draft."
			: `The drafts that exist: ${refused.drafts.map((name) => JSON.stringify(name)).join(", ")}.`;
	return {
		code: "NO_SUCH_DRAFT",
		error: `No board has a draft named ${JSON.stringify(refused.variant)}, so there is nothing to read at it. ${drafts}`,
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
 * The draft a request names.
 * @param request The request.
 * @returns Its `variant`, or undefined when it is absent or blank.
 */
function variantOf(request: Request): string | undefined {
	const asked = queryString(request, "variant")?.trim();
	return asked === "" ? undefined : asked;
}

/**
 * Answer one request with a code check run as checkout work.
 * @param dependencies How the pass runs.
 * @param request The request.
 * @param response Its response.
 */
async function answerCodeCheck(
	dependencies: CodeCheckRouteDependencies,
	request: Request,
	response: Response,
): Promise<void> {
	const variant = variantOf(request);
	try {
		const answer = await dependencies.runCheckout(
			request,
			response,
			"GET /api/vault/code-check",
			(signal) => dependencies.check({ variant, signal }),
		);
		if (callerGone(request, response)) return;
		if ("boards" in answer) response.json({ success: true, ...answer });
		else response.status(422).json({ success: false, ...noSuchDraft(answer) });
	} catch (error) {
		if (!callerGone(request, response)) {
			response.status(500).json({ success: false, error: errorMessage(error) });
		}
	}
}

/**
 * Mount `GET /api/vault/code-check`.
 * @param app The application.
 * @param overrides Dependencies a test replaces.
 */
function mountCodeCheckRoute(
	app: Express,
	overrides: Partial<CodeCheckRouteDependencies> = {},
): void {
	const dependencies: CodeCheckRouteDependencies = {
		/**
		 * Run the pass as the server's checkout work for this request.
		 * @param request The request.
		 * @param response Its response.
		 * @param name What the work is.
		 * @param work The pass.
		 * @returns Its answer.
		 */
		runCheckout: (request, response, name, work) =>
			checkoutWork.trackRequest(request, response, name, work),
		check: runCodeCheck,
		...overrides,
	};
	app.get("/api/vault/code-check", (request, response) => {
		void answerCodeCheck(dependencies, request, response);
	});
}

export { type CodeCheckRouteDependencies, mountCodeCheckRoute };
