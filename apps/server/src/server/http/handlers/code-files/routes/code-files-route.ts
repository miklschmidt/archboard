// The code browser's two routes (TASK-648, ADR 0080):
//
// `GET /api/code/files?vault=<vault>[&repo=<identity>]` answers the files that Git lists in a
// checkout: the vault's own, or the chosen checkout of the registered repository `repo` names.
//
// `GET /api/code/file?vault&repo&path[&model][&state][&checkpoint][&ref]` answers one whole file of a
// registered checkout, with the modules of the reading that own it where `model` is named, and
// reads no model otherwise. `model`, `state`, `checkpoint` and
// `ref` select the reading as `GET /api/architecture/model` takes them, and a refusal of
// that read is answered as that route answers it. A file the route does not quote is no HTTP
// error: the answer is 200 with a refused source, because its owners are still useful.
//
// The file route is the one route that quotes text (ADR 0046, ADR 0080), so only a page of
// Archboard's own origin reads either route. A repository this machine has no checkout of is a 404,
// `REPOSITORY_UNAVAILABLE`. Both run as checkout work, as the code check does: a caller that
// hangs up cancels them. Neither logs a path or any text of a file.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { createBrowserOriginGuard } from "@archboard/code-opener/browser-origin";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { errorMessage } from "@archboard/diagnostics/errno";
import { listCheckoutFiles } from "#server/http/handlers/code-files/operations/checkout-files.ts";
import { readCodeFile } from "#server/http/handlers/code-files/operations/read-code-file.ts";
import { callerGone } from "#server/http/middleware/caller-gone.ts";
import { respond } from "#server/http/handlers/routes/model-response.ts";
import { checkoutWork } from "#server/wiring/server-owners.ts";

/** What the routes need, which the Archboard server supplies and a test can replace. */
interface CodeFilesRouteDependencies {
	/** Run the work as checkout work for one request. */
	runCheckout<T>(
		request: Request,
		response: Response,
		name: string,
		work: (signal: AbortSignal) => Promise<T>,
	): Promise<T>;
}

const FilesQuerySchema = z
	.object({ vault: z.string(), repo: z.string().min(1).optional() })
	.strict();

const FileQuerySchema = z
	.object({
		vault: z.string(),
		repo: z.string().min(1),
		path: z.string().min(1),
		model: z.string().min(1).optional(),
		state: z.string().min(1).optional(),
		checkpoint: z.string().min(1).optional(),
		ref: z.string().min(1).optional(),
	})
	.strict()
	.refine((query) => query.state === undefined || query.checkpoint === undefined, {
		message: "Select either state or checkpoint.",
	});

/**
 * Answer a request that failed after the work started.
 * @param request The request.
 * @param response Its response.
 * @param error What failed.
 */
function failed(request: Request, response: Response, error: unknown): void {
	if (!callerGone(request, response)) {
		response.status(500).json({ success: false, error: errorMessage(error) });
	}
}

/**
 * Refuse a query that does not parse.
 * @param response The response.
 * @param error What is wrong with it.
 */
function invalid(response: Response, error: z.ZodError): void {
	response
		.status(400)
		.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(error) });
}

/**
 * Refuse a request for a repository this machine has no checkout of.
 * @param response The response.
 * @param error What to do next.
 */
function unavailable(response: Response, error: string): void {
	response.status(404).json({ success: false, code: "REPOSITORY_UNAVAILABLE", error });
}

/**
 * Answer one request for the files of a checkout.
 * @param dependencies How checkout work runs.
 * @param request The request.
 * @param response Its response.
 */
async function answerFiles(
	dependencies: CodeFilesRouteDependencies,
	request: Request,
	response: Response,
): Promise<void> {
	const query = FilesQuerySchema.safeParse(request.query);
	if (!query.success) {
		invalid(response, query.error);
		return;
	}
	const vault = vaultOfRequest(request);
	try {
		const outcome = await dependencies.runCheckout(
			request,
			response,
			"GET /api/code/files",
			(signal) => listCheckoutFiles(vault, query.data.repo, signal),
		);
		if (callerGone(request, response)) return;
		if (outcome.ok) response.json({ success: true, ...outcome.answer });
		else unavailable(response, outcome.error);
	} catch (error) {
		failed(request, response, error);
	}
}

/**
 * Answer one request for a file and its owners.
 * @param dependencies How checkout work runs.
 * @param request The request.
 * @param response Its response.
 */
async function answerFile(
	dependencies: CodeFilesRouteDependencies,
	request: Request,
	response: Response,
): Promise<void> {
	const query = FileQuerySchema.safeParse(request.query);
	if (!query.success) {
		invalid(response, query.error);
		return;
	}
	const { vault: _vault, ...asked } = query.data;
	const vault = vaultOfRequest(request);
	try {
		const outcome = await dependencies.runCheckout(
			request,
			response,
			"GET /api/code/file",
			(signal) => readCodeFile({ ...asked, vault, signal }),
		);
		if (callerGone(request, response)) return;
		if (outcome.kind === "answer") response.json({ success: true, ...outcome.answer });
		else if (outcome.kind === "model-refused") respond(response, outcome.refusal);
		else unavailable(response, outcome.error);
	} catch (error) {
		failed(request, response, error);
	}
}

/**
 * Mount `GET /api/code/files` and `GET /api/code/file`.
 * @param app The application.
 * @param overrides Dependencies a test replaces.
 */
function mountCodeFilesRoute(
	app: Express,
	overrides: Partial<CodeFilesRouteDependencies> = {},
): void {
	const dependencies: CodeFilesRouteDependencies = {
		/**
		 * Run the work as the server's checkout work for this request.
		 * @param request The request.
		 * @param response Its response.
		 * @param name What the work is.
		 * @param work The work.
		 * @returns Its result.
		 */
		runCheckout: (request, response, name, work) =>
			checkoutWork.trackRequest(request, response, name, work),
		...overrides,
	};
	app.get(
		"/api/code/files",
		createBrowserOriginGuard("settings-read"),
		requireVault,
		(request, response) => {
			void answerFiles(dependencies, request, response);
		},
	);
	app.get(
		"/api/code/file",
		createBrowserOriginGuard("settings-read"),
		requireVault,
		(request, response) => {
			void answerFile(dependencies, request, response);
		},
	);
}

export { type CodeFilesRouteDependencies, mountCodeFilesRoute };
