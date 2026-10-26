// The code check's route,
// `GET /api/vault/code-check[?variant=<draft> | ?every-draft=true][&plan=<file>]...`
// (ADR 0046).
//
// `archboard check code` and `archboard check all` ask it. It reads code and
// Git, which takes seconds, so it runs only on a request and never inside
// `/api/vault/check`, which every open canvas polls every 5 seconds. It runs as
// checkout work, the admission the code opener uses: a caller that hangs up
// cancels it, and a stop cancels it and waits for it to settle, so a stop
// never refuses because of it. A pass changes nothing, so the route is a GET.
//
// The code pass (`packages/code-intel/src/runtime/operations/code-check`) reads every board at its current
// variant, or at the draft `variant` names, and gives `boards`, `findings` and
// `skipped`. `every-draft=true` reads every draft of every board instead, and
// a `variant` beside it is not read (TASK-488). Behind (ADR 0045, TASK-369.02)
// reads the current variant of each board once, whatever the pass reads. A `variant` that names no draft on any board
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
import { createCodeCheck } from "@archboard/code-intel/code-check-run";
import { queryString, requireVault, vaultOfRequest } from "@archboard/workbench/host";
import {
	createCodeFindingsMemory,
	type CodeFindingsMemory,
} from "#server/state/code-findings/code-findings-memory.ts";
import { checkoutWork } from "#server/wiring/owners/server-owners.ts";
import { errorMessage } from "@archboard/diagnostics/errno";

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
	readonly check: ReturnType<typeof createCodeCheck>["run"];
	/** What the finished passes found, which the panes read. */
	readonly memory: CodeFindingsMemory;
}

/** The server's one code check, so its memory of behind serves every request. */
const codeCheck = createCodeCheck();

/** The server's one memory of the last passes, so every pane reads what any pass found. */
const codeFindings = createCodeFindingsMemory();

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
	const vault = vaultOfRequest(request);
	const variant = variantOf(request);
	const everyDraft = queryString(request, "every-draft") === "true";
	const plans = plansOf(request);
	const checkedAt = new Date();
	try {
		const answer = await dependencies.runCheckout(
			request,
			response,
			"GET /api/vault/code-check",
			async (signal) => {
				const checked = await dependencies.check({ vault, variant, everyDraft, plans, signal });
				// A cancelled pass may have stopped short, so it is nobody's news.
				if ("boards" in checked && !signal.aborted) {
					dependencies.memory.remember(vault, checked, checkedAt);
				}
				return checked;
			},
		);
		if (callerGone(request, response)) return;
		if ("boards" in answer) response.json({ success: true, ...answer });
		else response.status(422).json({ success: false, ...answer });
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
		/**
		 * Run the server's one code check.
		 * @param request What to read, and the signal that cancels it.
		 * @returns The answer, or why the run is refused.
		 */
		check: (request) => codeCheck.run(request),
		memory: codeFindings,
		...overrides,
	};
	app.get("/api/vault/code-check", requireVault, (request, response) => {
		void answerCodeCheck(dependencies, request, response);
	});
	app.get("/api/vault/code-findings", requireVault, (request, response) => {
		response.json({ success: true, ...dependencies.memory.recall(vaultOfRequest(request)) });
	});
}

export { type CodeCheckRouteDependencies, mountCodeCheckRoute };
