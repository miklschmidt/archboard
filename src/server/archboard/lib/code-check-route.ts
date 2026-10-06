// The code check's route,
// `GET /api/vault/code-check[?variant=<draft>][&plan=<file>]...` (ADR 0046).
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
// is refused with the drafts that exist. Each `plan` names a Terraform or
// OpenTofu plan JSON by its absolute path (TASK-367.17); one outside every
// registered checkout, one the check never reads or one that is not a plan
// JSON refuses the check, as `PLAN_REFUSED`, before the pass starts.
//
// A pane never starts a pass (TASK-367.24). Each pass that finishes leaves its
// findings in the server's memory, and `GET /api/vault/code-findings` answers
// from that memory alone, so the panes that read it on a timer never cost a
// reading of code. A pass the caller cancelled, or a refusal, leaves the memory
// as it was.

import type { Express, Request, Response } from "express";
import {
	checkCode,
	readBoardsToCheck,
	readPlans,
	type NoSuchDraft,
	type PlanRefused,
} from "@/runtime/code-check/index";
import { requireVaultRoot } from "@/runtime/engine/board";
import { createBehindReading } from "@/runtime/history-lens/index";
import { queryString } from "@/server/archboard/lib/request-board";
import {
	createCodeFindingsMemory,
	type CodeFindingsMemory,
} from "@/server/archboard/lib/code-findings-memory";
import { checkoutWork } from "@/server/archboard/lib/server-owners";
import { CodeCheckAnswerSchema, type CodeCheckAnswer } from "@/shared/code-check/index";
import { errorMessage } from "@/shared/thrown-error/index";

/**
 * What one request asks for: the draft to read where a board has one, the
 * plans an agent named, and how to cancel.
 */
interface CodeCheckRequest {
	readonly variant: string | undefined;
	readonly plans: readonly string[];
	readonly signal: AbortSignal;
}

/** Why a request is refused: a draft no board has, or a plan the check does not read. */
type CodeCheckRefusal = NoSuchDraft | PlanRefused;

/** What the route needs, which the Archboard server supplies and a test can replace. */
interface CodeCheckRouteDependencies {
	/** Run the pass as checkout work for one request. */
	runCheckout<T>(
		request: Request,
		response: Response,
		name: string,
		work: (signal: AbortSignal) => Promise<T>,
	): Promise<T>;
	/** Run the code check, or say that no board has the named draft or that a plan is refused. */
	readonly check: (request: CodeCheckRequest) => Promise<CodeCheckAnswer | CodeCheckRefusal>;
	/** What the finished passes found, which the panes read. */
	readonly memory: CodeFindingsMemory;
}

/** The server's one reading of behind, so its memory serves every request. */
const behindReading = createBehindReading();

/** The server's one memory of the last passes, so every pane reads what any pass found. */
const codeFindings = createCodeFindingsMemory();

/**
 * Run the code check over every board of the vault, at its current variant or
 * the named draft, with behind beside it.
 * @param request The draft to read, the plans named, and the signal that
 * cancels the check and every Git command it runs.
 * @returns The answer, the drafts that exist when no board has the named one,
 * or the plan the check refuses.
 */
async function runCodeCheck(
	request: CodeCheckRequest,
): Promise<CodeCheckAnswer | CodeCheckRefusal> {
	const vault = requireVaultRoot();
	const read = readBoardsToCheck(vault, request.variant);
	if (!read.ok) return read;
	const plans = await readPlans(request.plans, request.signal);
	if (!plans.ok) return plans;
	const [code, behind] = await Promise.all([
		checkCode(read.boards, request.signal, undefined, plans.plans),
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
 * The refusal's body.
 * @param refused The draft or the plan refused.
 * @returns Its code and what it says.
 */
function refusalOf(refused: CodeCheckRefusal): { code: string; error: string } {
	if (!("refused" in refused)) return noSuchDraft(refused);
	return {
		code: "PLAN_REFUSED",
		error:
			`The check does not read the plan ${JSON.stringify(refused.plan)}: ${refused.reason}. ` +
			"Name a plan JSON that terraform show -json or tofu show -json wrote inside a " +
			"registered checkout, by its path.",
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
 * The plans a request names.
 * @param request The request.
 * @returns Each `plan`, in order.
 */
function plansOf(request: Request): string[] {
	const named = request.query["plan"];
	const each = Array.isArray(named) ? named : [named];
	return each.filter((plan): plan is string => typeof plan === "string" && plan.trim() !== "");
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
	const plans = plansOf(request);
	const checkedAt = new Date();
	try {
		const answer = await dependencies.runCheckout(
			request,
			response,
			"GET /api/vault/code-check",
			async (signal) => {
				const checked = await dependencies.check({ variant, plans, signal });
				// A cancelled pass may have stopped short, so it is nobody's news.
				if ("boards" in checked && !signal.aborted) {
					dependencies.memory.remember(checked, checkedAt);
				}
				return checked;
			},
		);
		if (callerGone(request, response)) return;
		if ("boards" in answer) response.json({ success: true, ...answer });
		else response.status(422).json({ success: false, ...refusalOf(answer) });
	} catch (error) {
		if (!callerGone(request, response)) {
			response.status(500).json({ success: false, error: errorMessage(error) });
		}
	}
}

/**
 * Mount `GET /api/vault/code-check`, and `GET /api/vault/code-findings`, which
 * answers what the finished passes found from memory and never starts one.
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
		memory: codeFindings,
		...overrides,
	};
	app.get("/api/vault/code-check", (request, response) => {
		void answerCodeCheck(dependencies, request, response);
	});
	app.get("/api/vault/code-findings", (_request, response) => {
		response.json({ success: true, ...dependencies.memory.recall() });
	});
}

export { type CodeCheckRouteDependencies, mountCodeCheckRoute };
