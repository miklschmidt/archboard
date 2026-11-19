// The code check's route,
// `GET /api/vault/code-check[?variant=<draft> | ?every-draft=true][&plan=<file>]...[&base=<ref>][&touched=true]`
// (ADR 0046).
//
// `archboard check code` and `archboard check all` ask it, and so does the code view
// of Measures when it opens on a reading that no remembered pass read (ADR 0046,
// "Where the pass runs"). It reads code and Git, which takes seconds, so it runs
// only on a request and never inside `/api/vault/check`, which every open canvas
// reads. It runs as
// checkout work, the admission the code opener uses: a caller that hangs up
// cancels it, and a stop cancels it and waits for it to settle, so a stop
// never refuses because of it. A pass changes nothing, so the route is a GET.
//
// The code pass (`packages/code-intel/src/runtime/code-check`) reads every document at its current
// variant, or at the draft `variant` names, and gives `states`, `findings` and
// `skipped`. `every-draft=true` reads every draft of every document instead, and
// a `variant` beside it is not read (TASK-488). Behind (ADR 0045, TASK-369.02)
// reads the current variant of each document once, whatever the pass reads. A `variant` that names no draft on any model
// is refused with the drafts that exist. Each `plan` names a Terraform or
// OpenTofu plan JSON by its absolute path (TASK-367.17); one outside every
// registered checkout, one the check never reads or one that is not a plan
// JSON refuses the check, as `PLAN_REFUSED`, before the pass starts.
// `base` names the base that the modules the branch touched are read from,
// and `touched=true` asks for them from the default base (TASK-646.04); a base
// that does not resolve is refused, as `BASE_UNRESOLVED`. Neither changes a
// severity, so the memory holds the same findings whoever ran the pass.
//
// Only the code view of Measures starts a pass from a page; the panes read (TASK-367.24).
// Each pass that finishes leaves its findings in the server's memory, and
// `GET /api/vault/code-findings` answers from that memory alone, so the panes that
// read it on a timer never cost a reading of code. A pass the caller cancelled, or a refusal, leaves the memory
// as it was.
//
// `GET /api/vault/code-exports?model=<model>[&state=<state>]&revision=<digest>&module=<module>`
// answers how the last pass over that exact reading measured one module, with the names of its
// exports, as the `depth` of a code-check answer that holds that module alone, from the same memory
// (TASK-646.08). The findings answer and the code check's own answer leave the names out, because
// every canvas reads the one, `archboard check` prints the other on every run, and only the About
// page of one module shows them. No remembered pass of that version that measured the
// module is a 404.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { queryString, requireVault, vaultOfRequest } from "@archboard/workbench/host";
import {
	createCodeFindingsMemory,
	type CodeFindingsMemory,
} from "#server/http/handlers/code-checks/state/code-findings-memory.ts";
import { callerGone } from "#server/http/middleware/caller-gone.ts";
import { checkoutWork, codeCheck } from "#server/wiring/server-owners.ts";
import { errorMessage } from "@archboard/diagnostics/errno";
import type { CodeCheckAnswer, CodeCheckResult } from "@archboard/code-intel/code-check";

/** What the route needs, which the Archboard server supplies and a test can replace. */
interface CodeCheckRouteDependencies {
	/** Run the pass as checkout work for one request. */
	runCheckout<T>(
		request: Request,
		response: Response,
		name: string,
		work: (signal: AbortSignal) => Promise<T>,
	): Promise<T>;
	/** Run the code check, or say that no document has the named draft or that a plan is refused. */
	readonly check: typeof codeCheck.run;
	/** What the finished passes found, which the panes read. */
	readonly memory: CodeFindingsMemory;
}

/** The server's one memory of the last passes, so every pane reads what any pass found. */
const codeFindings = createCodeFindingsMemory();

/**
 * The draft a request names.
 * @param request The request.
 * @returns Its `variant`, or undefined when it is absent or blank.
 */
function variantOf(request: Request): string | undefined {
	const asked = queryString(request, "state")?.trim();
	return asked === "" ? undefined : asked;
}

/**
 * The base a request names for the modules the branch touched.
 * @param request The request.
 * @returns Its `base`, or undefined when it is absent or blank.
 */
function baseOf(request: Request): string | undefined {
	const asked = queryString(request, "base")?.trim();
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
 * A pass's answer as the route gives it: each measured module without the names of its exports,
 * which the memory keeps for `GET /api/vault/code-exports` (TASK-646.08).
 * @param answer The pass's answer.
 * @returns The answer without the names.
 */
function withoutNames(answer: CodeCheckAnswer): CodeCheckResult {
	const { depth, ...rest } = answer;
	return depth === undefined
		? rest
		: { ...rest, depth: depth.map(({ names: _names, ...counts }) => counts) };
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
	const base = baseOf(request);
	const touched = queryString(request, "touched") === "true";
	const checkedAt = new Date();
	try {
		const answer = await dependencies.runCheckout(
			request,
			response,
			"GET /api/vault/code-check",
			async (signal) => {
				const checked = await dependencies.check({
					vault,
					variant,
					everyDraft,
					plans,
					base,
					touched,
					signal,
				});
				// A cancelled pass may have stopped short, so it is nobody's news.
				if ("states" in checked && !signal.aborted) {
					dependencies.memory.remember(vault, checked, checkedAt);
				}
				return checked;
			},
		);
		if (callerGone(request, response)) return;
		if ("states" in answer) response.json({ success: true, ...withoutNames(answer) });
		else response.status(422).json({ success: false, ...answer });
	} catch (error) {
		if (!callerGone(request, response)) {
			response.status(500).json({ success: false, error: errorMessage(error) });
		}
	}
}

/** The exact reading and module whose exports are asked for. A reading with no state names none. */
const ExportsQuerySchema = z.object({
	model: z.string().min(1),
	state: z.string().min(1).optional(),
	revision: z.string().min(1),
	module: z.string().min(1),
});

/**
 * Answer one request for how the remembered pass measured one module, with its exports.
 * @param memory What the finished passes found.
 * @param request The request.
 * @param response Its response.
 */
function answerExports(memory: CodeFindingsMemory, request: Request, response: Response): void {
	const asked = ExportsQuerySchema.safeParse(request.query);
	if (!asked.success) {
		response
			.status(400)
			.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(asked.error) });
		return;
	}
	const { state, ...rest } = asked.data;
	const exports = memory.exportsOf(vaultOfRequest(request), { ...rest, state: state ?? null });
	if (exports === null) {
		response.status(404).json({
			success: false,
			code: "CODE_EXPORTS_UNREAD",
			error: "No remembered code check measured this module on this version of the reading.",
		});
		return;
	}
	response.json({ success: true, depth: [exports] });
}

/**
 * Mount `GET /api/vault/code-check`, `GET /api/vault/code-findings`, which
 * answers what the finished passes found from memory and never starts one, and
 * `GET /api/vault/code-exports`, which answers one module's exports from the same memory.
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
	app.get("/api/vault/code-exports", requireVault, (request, response) => {
		answerExports(dependencies.memory, request, response);
	});
}

export { type CodeCheckRouteDependencies, mountCodeCheckRoute };
