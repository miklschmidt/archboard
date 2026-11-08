// The code check's route,
// `GET /api/vault/code-check[?variant=<draft> | ?every-draft=true][&plan=<file>]...`
// (ADR 0046).
//
// `archboard check code` and `archboard check all` ask it, and so does the code view
// of Measures when it opens on a reading that no remembered pass read (ADR 0046,
// amendment of 2026-11-08). It reads code and Git, which takes seconds, so it runs
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
//
// Only the code view of Measures starts a pass from a page; the panes read (TASK-367.24).
// Each pass that finishes leaves its findings in the server's memory, and
// `GET /api/vault/code-findings` answers from that memory alone, so the panes that
// read it on a timer never cost a reading of code. A pass the caller cancelled, or a refusal, leaves the memory
// as it was.
//
// `GET /api/code/source-lines?repo=<repo>&path=<path>&line=<line>` answers the
// source excerpt of one piece of evidence that the memory holds for the vault
// (TASK-590.06): the evidence line with up to 3 lines on each side. It is the
// one route that quotes text of a file (ADR 0046, amendment of 2026-11-07), so
// only a page of Archboard's own origin reads it, and it reads only a place
// that the memory names. A place that no remembered finding names, or whose
// file or line is gone or never quoted, is a 404.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { createBrowserOriginGuard } from "@archboard/code-opener/browser-origin";
import { createCodeCheck } from "@archboard/code-intel/code-check-run";
import { queryString, requireVault, vaultOfRequest } from "@archboard/workbench/host";
import {
	createCodeFindingsMemory,
	type CodeFindingsMemory,
} from "#server/http/handlers/code-checks/state/code-findings-memory.ts";
import { readSourceLines } from "#server/http/handlers/code-checks/operations/source-lines.ts";
import { checkoutWork } from "#server/wiring/server-owners.ts";
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
	/** Run the code check, or say that no document has the named draft or that a plan is refused. */
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
	const asked = queryString(request, "state")?.trim();
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
				if ("states" in checked && !signal.aborted) {
					dependencies.memory.remember(vault, checked, checkedAt);
				}
				return checked;
			},
		);
		if (callerGone(request, response)) return;
		if ("states" in answer) response.json({ success: true, ...answer });
		else response.status(422).json({ success: false, ...answer });
	} catch (error) {
		if (!callerGone(request, response)) {
			response.status(500).json({ success: false, error: errorMessage(error) });
		}
	}
}

/** The place a source excerpt is asked for, as a piece of evidence names it. */
const SourcePlaceQuerySchema = z.object({
	repo: z.string().min(1),
	path: z.string().min(1),
	line: z
		.string()
		.regex(/^[1-9][0-9]{0,8}$/u)
		.transform(Number),
});

/**
 * Answer one request for the source excerpt of a remembered piece of evidence.
 * @param dependencies How checkout work runs, and what the passes found.
 * @param request The request.
 * @param response Its response.
 */
async function answerSourceLines(
	dependencies: CodeCheckRouteDependencies,
	request: Request,
	response: Response,
): Promise<void> {
	const place = SourcePlaceQuerySchema.safeParse(request.query);
	if (!place.success) {
		response
			.status(400)
			.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(place.error) });
		return;
	}
	const vault = vaultOfRequest(request);
	try {
		const outcome = await dependencies.runCheckout(
			request,
			response,
			"GET /api/code/source-lines",
			(signal) =>
				readSourceLines({
					vault,
					place: place.data,
					findings: dependencies.memory.recall(vault),
					signal,
				}),
		);
		if (callerGone(request, response)) return;
		if (outcome.ok) response.json({ success: true, ...outcome.answer });
		else response.status(404).json({ success: false, code: outcome.code, error: outcome.error });
	} catch (error) {
		if (!callerGone(request, response)) {
			response.status(500).json({ success: false, error: errorMessage(error) });
		}
	}
}

/**
 * Mount `GET /api/vault/code-check`, `GET /api/vault/code-findings`, which
 * answers what the finished passes found from memory and never starts one, and
 * `GET /api/code/source-lines`, which quotes the source of one remembered piece
 * of evidence.
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
	app.get(
		"/api/code/source-lines",
		createBrowserOriginGuard("settings-read"),
		requireVault,
		(request, response) => {
			void answerSourceLines(dependencies, request, response);
		},
	);
}

export { type CodeCheckRouteDependencies, mountCodeCheckRoute };
