// The code check's route, `GET /api/vault/code-check` (ADR 0046).
//
// `archboard check --code` asks it after the plain check. It reads code and
// Git, which takes seconds, so it runs only on a request and never inside
// `/api/vault/check`, which every open canvas polls every 5 seconds. It runs as
// checkout work, the admission the code opener uses: a caller that hangs up
// cancels it, and a stop cancels it and waits for it to settle, so a stop
// never refuses because of it. A pass changes nothing, so the route is a GET.
//
// The answer has four parts. This route fills `boards`, the board-level
// `skipped`, and `behind` (ADR 0045, TASK-369.02). `findings` stays empty
// until the code pass of TASK-367.05 joins it.

import type { Express, Request, Response } from "express";
import { requireVaultRoot } from "@/runtime/engine/board";
import { createBehindReading, type BoardToRead } from "@/runtime/history-lens/index";
import { listSemanticBoards, readSemanticBoardAt } from "@/runtime/semantic-board-store/index";
import { checkoutWork } from "@/server/archboard/lib/server-owners";
import {
	CodeCheckAnswerSchema,
	type CodeCheckAnswer,
	type CodeCheckBoard,
	type CodeCheckSkip,
} from "@/shared/code-check/index";
import { currentVariant } from "@/shared/semantic-board/index";
import { errorMessage } from "@/shared/thrown-error/index";

/** What the route needs, which the Archboard server supplies and a test can replace. */
interface CodeCheckRouteDependencies {
	/** Run the pass as checkout work for one request. */
	runCheckout<T>(
		request: Request,
		response: Response,
		name: string,
		work: (signal: AbortSignal) => Promise<T>,
	): Promise<T>;
	/** Run the code check. */
	readonly check: (signal: AbortSignal) => Promise<CodeCheckAnswer>;
}

/** The server's one reading of behind, so its memory serves every request. */
const behindReading = createBehindReading();

/**
 * Run the code check over every board of the vault, at its current variant.
 * @param signal Cancels the check and every Git command it runs.
 * @returns The answer.
 */
async function runCodeCheck(signal: AbortSignal): Promise<CodeCheckAnswer> {
	const vault = requireVaultRoot();
	const boards: CodeCheckBoard[] = [];
	const skipped: CodeCheckSkip[] = [];
	const toRead: BoardToRead[] = [];
	for (const location of listSemanticBoards(vault)) {
		const read = readSemanticBoardAt(location);
		if (!read.ok) {
			skipped.push({ reason: "board-unreadable", board: location.name, detail: read.problem });
			continue;
		}
		const variant = currentVariant(read.board);
		if (variant === undefined) {
			skipped.push({ reason: "no-current-variant", board: read.board.name });
			continue;
		}
		boards.push({ board: read.board.name, variant: variant.id, version: read.board.version });
		toRead.push({ board: read.board, file: location.file });
	}
	const behind = await behindReading.read(vault, toRead, signal);
	return CodeCheckAnswerSchema.parse({ boards, findings: [], skipped, behind });
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
	try {
		const answer = await dependencies.runCheckout(
			request,
			response,
			"GET /api/vault/code-check",
			dependencies.check,
		);
		if (!callerGone(request, response)) response.json({ success: true, ...answer });
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
