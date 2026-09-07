import {
	Router,
	json,
	type ErrorRequestHandler,
	type NextFunction,
	type Request,
	type RequestHandler,
	type Response,
} from "express";

import {
	CodeBindingSchema,
	CodeTargetOpenRequestSchema,
	OpenerSelectionSchema,
	OpenerSettingsTestRequestSchema,
	type CodeBinding,
	type CodeTargetFailureCode,
	type CodeTargetOpenRequest,
	type OpenerSelection,
} from "@/shared/code-target";
import {
	resolveLocalCodeTarget,
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
	type LocalCodeTargetResult,
} from "@/runtime/code-target";
import { githubUrlForBinding } from "@/runtime/code-target/presentation";
import { resolveBoard } from "@/runtime/engine/board-io";
import { readElementMetadata } from "@/runtime/engine/metadata";
import { checkBrowserCsrf, type BrowserCsrfKind } from "@/server/code-opener/lib/browser-csrf";
import {
	readOpenerSelection,
	resetOpenerSelection,
	saveOpenerSelection,
} from "@/server/code-opener/lib/configuration";
import {
	launchOpener,
	resolveOpenerCommand,
	type LaunchResult,
} from "@/server/code-opener/lib/launch";
import {
	planOpenerCommand,
	validateOpenerSelection,
	type OpenerPlan,
} from "@/server/code-opener/lib/planning";

type BindingLookup =
	| { ok: true; binding: CodeBinding }
	| {
			ok: false;
			code: "BOARD_NOT_FOUND" | "ELEMENT_NOT_FOUND" | "BINDING_UNAVAILABLE";
			error: string;
	  };

interface RouteFailure {
	code: CodeTargetFailureCode;
	error: string;
}

type ActivationRequest =
	| { ok: true; request: CodeTargetOpenRequest }
	| { ok: false; failure: RouteFailure };

const BODY_PARSER_FAILURES: ReadonlySet<string> = new Set([
	"charset.unsupported",
	"encoding.unsupported",
	"entity.parse.failed",
	"entity.too.large",
	"entity.verify.failed",
	"request.aborted",
	"request.size.invalid",
	"stream.encoding.set",
	"stream.not.readable",
]);

/** HTTP statuses for the failure codes that are not a plain 422 refusal. */
const FAILURE_STATUSES: Readonly<Partial<Record<CodeTargetFailureCode, number>>> = {
	CROSS_ORIGIN_REFUSED: 403,
	BOARD_NOT_FOUND: 404,
	ELEMENT_NOT_FOUND: 404,
	CHECKOUT_IDENTITY_CHANGED: 409,
	OPENER_SPAWN_FAILED: 500,
	OPENER_CONFIG_INVALID: 500,
};

/**
 * Hands the request to the next handler; the preguard only refuses, it never answers a success.
 * @param _request The request, unused here.
 * @param _response The response, unused here.
 * @param next Continues to the canvas's own handler.
 */
const pass: RequestHandler = (_request, _response, next) => {
	next();
};

export interface CodeOpenerRouteDependencies {
	bindingForElement(board: string, element: string): BindingLookup;
	resolveTarget(
		binding: CodeBinding,
		signal?: AbortSignal,
	): Promise<LocalCodeTargetResult> | LocalCodeTargetResult;
	launch(command: { executable: string; argv: string[] }): Promise<LaunchResult>;
	runCheckout<T>(
		request: Request,
		response: Response,
		name: string,
		work: (signal: AbortSignal) => Promise<T>,
	): Promise<T>;
	runMutation<T>(
		request: Request,
		name: string,
		work: (signal: AbortSignal) => Promise<T> | T,
	): Promise<T>;
}

/**
 * Renders a thrown value as the message a route answers with.
 * @param error The thrown value.
 * @returns The error's message, or the value's string form when it is not an Error.
 */
function failureMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Reads the code binding an element on a held board carries.
 * @param boardKey The board the element lives on.
 * @param elementId The element whose binding is wanted.
 * @returns The binding, or which of board, element or binding was missing.
 */
function canonicalBinding(boardKey: string, elementId: string): BindingLookup {
	let content;
	try {
		content = resolveBoard(boardKey, "A code-target activation").content;
	} catch (error) {
		return { ok: false, code: "BOARD_NOT_FOUND", error: failureMessage(error) };
	}
	const element = content.elements.get(elementId);
	if (!element) {
		return {
			ok: false,
			code: "ELEMENT_NOT_FOUND",
			error: `Element ${elementId} is not on the board.`,
		};
	}
	const parsed = CodeBindingSchema.safeParse(readElementMetadata(element).archboard?.binding);
	return parsed.success
		? { ok: true, binding: parsed.data }
		: { ok: false, code: "BINDING_UNAVAILABLE", error: "The element has no resolvable binding." };
}

const DEFAULT_DEPENDENCIES: CodeOpenerRouteDependencies = {
	bindingForElement: canonicalBinding,
	/**
	 * Resolves a binding against a fresh checkout snapshot limited to that binding.
	 * @param binding The code binding to resolve.
	 * @param signal Cancels the snapshot when the request is abandoned.
	 * @returns The local code target, or why it could not be resolved.
	 */
	resolveTarget: async (binding, signal) =>
		resolveLocalCodeTarget(
			binding,
			await snapshotCheckoutAccess({ ...(signal ? { signal } : {}), bindings: [binding] }),
		),
	launch: launchOpener,
	/**
	 * Runs checkout work directly; the canvas supplies request-scoped scheduling in production.
	 * @param _request The request, unused here.
	 * @param _response The response, unused here.
	 * @param _name The work's name, unused here.
	 * @param work The checkout work.
	 * @returns The work's result.
	 */
	runCheckout: async (_request, _response, _name, work) => work(new AbortController().signal),
	/**
	 * Runs mutation work directly; the canvas supplies request-scoped scheduling in production.
	 * @param _request The request, unused here.
	 * @param _name The work's name, unused here.
	 * @param work The mutation work.
	 * @returns The work's result.
	 */
	runMutation: async (_request, _name, work) => work(new AbortController().signal),
};

/**
 * Builds the middleware that refuses cross-origin browser requests before any body is read.
 * @param kind Whether the guarded route reads settings or mutates state.
 * @returns The Express guard middleware.
 */
function guard(kind: BrowserCsrfKind) {
	return (request: Request, response: Response, next: NextFunction): void => {
		response.removeHeader("Access-Control-Allow-Origin");
		const host = request.get("host");
		const origin = request.get("origin");
		const referer = request.get("referer");
		const secFetchSite = request.get("sec-fetch-site");
		const result = checkBrowserCsrf(kind, {
			...(host ? { host } : {}),
			...(origin ? { origin } : {}),
			...(referer ? { referer } : {}),
			...(secFetchSite ? { secFetchSite } : {}),
		});
		if (!result.ok) {
			response.status(403).json({ success: false, code: result.code, error: result.error });
			return;
		}
		next();
	};
}

/**
 * Adapts an async handler so a rejection reaches Express's error pipeline instead of hanging.
 * @param handler The async route handler.
 * @returns A request handler Express can mount.
 */
function asyncEndpoint(
	handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
	return (request, response, next) => {
		void handler(request, response).catch((error) => setImmediate(next, error));
	};
}

/**
 * Maps a failure code to the HTTP status a route answers with.
 * @param code The failure code.
 * @returns The status; refusals without a specific status are 422.
 */
function statusFor(code: CodeTargetFailureCode): number {
	return FAILURE_STATUSES[code] ?? 422;
}

/**
 * Answers a failure, attaching the actions a person can take next.
 * @param response The response to write.
 * @param failure The failure code and message.
 * @param status The HTTP status; defaults to the code's status.
 * @param binding The binding whose GitHub link is offered as a fallback, when known.
 */
function sendFailure(
	response: Response,
	failure: RouteFailure,
	status = statusFor(failure.code),
	binding?: CodeBinding,
): void {
	const github = binding ? githubUrlForBinding(binding) : undefined;
	const actions = [
		...(failure.code.startsWith("OPENER_")
			? [{ kind: "settings" as const, label: "Opener settings" as const }]
			: []),
		...(github ? [{ kind: "github" as const, label: "Open on GitHub", href: github }] : []),
	];
	response.status(status).json({
		success: false,
		code: failure.code,
		error: failure.error,
		...(actions.length > 0 ? { actions } : {}),
	});
}

/**
 * Tells whether a thrown value is one of the body parser's own failures.
 * @param error The value the body parser passed to the error pipeline.
 * @returns True when the error's type is a known body-parser failure.
 */
function isBodyParserFailure(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"type" in error &&
		typeof error.type === "string" &&
		BODY_PARSER_FAILURES.has(error.type)
	);
}

/**
 * Builds the error handler that turns a body-parser failure into a 400 refusal.
 * @returns The Express error handler.
 */
function bodyFailure(): ErrorRequestHandler {
	return (error, _request, response, next) => {
		if (!isBodyParserFailure(error)) {
			next(error);
			return;
		}
		sendFailure(response, { code: "REQUEST_INVALID", error: "The request body is invalid." }, 400);
	};
}

/**
 * Tells whether a request targets one of the opener routes that read a JSON body.
 * @param method The HTTP method.
 * @param pathname The request path.
 * @returns True for the body-carrying opener routes.
 */
export function isCodeOpenerBodyRoute(method: string, pathname: string): boolean {
	return (
		(method === "PUT" && pathname === "/api/settings/opener") ||
		(method === "POST" &&
			(pathname === "/api/settings/opener/test" || pathname === "/api/code-targets/open"))
	);
}

/**
 * Builds the router mounted ahead of the canvas that guards and parses the opener routes.
 * @returns The preguard router.
 */
export function createCodeOpenerPreguard(): Router {
	const router = Router();
	const body = json({ limit: "32kb" });
	router.get("/api/settings/opener", guard("settings-read"), pass);
	router.put("/api/settings/opener", guard("mutation"), body, pass);
	router.delete("/api/settings/opener", guard("mutation"), pass);
	router.post("/api/settings/opener/test", guard("mutation"), body, pass);
	router.post("/api/code-targets/open", guard("mutation"), body, pass);
	router.use(bodyFailure());
	return router;
}

/**
 * Plans the opener command for a target and launches it when the plan succeeds.
 * @param selection The opener selection to plan with.
 * @param target The path to open.
 * @param launch The launcher to run the planned command.
 * @returns The launch result, or the plan failure that prevented a launch.
 */
async function planAndLaunch(
	selection: OpenerSelection,
	target: string,
	launch: CodeOpenerRouteDependencies["launch"],
): Promise<OpenerPlan | LaunchResult> {
	const plan = planOpenerCommand(selection, target);
	return plan.ok ? launch(plan.command) : plan;
}

/**
 * Reads an activation request, refusing query parameters and malformed bodies.
 * @param request The incoming activation request.
 * @returns The typed request, or the 400 failure to answer with.
 */
function parseActivationRequest(request: Request): ActivationRequest {
	if (request.url.includes("?")) {
		return {
			ok: false,
			failure: { code: "REQUEST_INVALID", error: "Activation query parameters are not accepted." },
		};
	}
	const parsed = CodeTargetOpenRequestSchema.safeParse(request.body);
	return parsed.success
		? { ok: true, request: parsed.data }
		: {
				ok: false,
				failure: { code: "REQUEST_INVALID", error: "The activation request is invalid." },
			};
}

/**
 * Builds the opener routes: settings read, save, reset and test, and code-target activation.
 * @param overrides Dependencies replaced by the canvas or by tests.
 * @returns The opener router.
 */
export function createCodeOpenerRouter(
	overrides: Partial<CodeOpenerRouteDependencies> = {},
): Router {
	const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
	const router = Router();

	router.get(
		"/api/settings/opener",
		asyncEndpoint(async (request, response) => {
			const current = readOpenerSelection();
			if (!current.ok) return sendFailure(response, current);
			const plannedCurrent = planOpenerCommand(current.selection, "{path}");
			const effective = plannedCurrent.ok
				? resolveOpenerCommand(plannedCurrent.command)
				: plannedCurrent;
			const native = planOpenerCommand({ version: 1, kind: "platform" }, "{path}");
			const presets = (["vscode", "cursor", "zed"] as const).map((preset) => {
				const planned = planOpenerCommand({ version: 1, kind: "preset", preset }, "{path}");
				if (!planned.ok) throw new Error(planned.error);
				return { preset, command: planned.command };
			});
			const snapshot = await dependencies.runCheckout(
				request,
				response,
				"GET /api/settings/opener checkout snapshot",
				(signal) => snapshotCheckoutAccess({ signal }),
			);
			const repositories = snapshot.entries.map((entry) => {
				const resolved = resolveRegisteredCheckout(entry.repo, snapshot);
				return {
					repository: entry.repo,
					root: entry.root,
					exists: entry.exists,
					identityMatches: resolved.ok,
				};
			});
			response.json({
				success: true,
				selection: current.selection,
				effectiveCommand: effective.ok ? effective.command : null,
				availability: effective.ok
					? { available: true }
					: { available: false, code: effective.code, error: effective.error },
				platformDefault: native.ok ? native.command : null,
				presets,
				repositories,
			});
		}),
	);

	router.put("/api/settings/opener", (request, response) => {
		const current = readOpenerSelection();
		if (!current.ok) return sendFailure(response, current);
		const parsed = OpenerSelectionSchema.safeParse(request.body);
		if (!parsed.success) {
			return sendFailure(
				response,
				{ code: "REQUEST_INVALID", error: "The opener selection is invalid." },
				400,
			);
		}
		const validated = validateOpenerSelection(parsed.data);
		if ("ok" in validated) return sendFailure(response, validated, 422);
		const saved = saveOpenerSelection(parsed.data);
		if (!saved.ok) return sendFailure(response, saved);
		response.json({ success: true, selection: saved.selection });
	});

	router.delete("/api/settings/opener", (_request, response) => {
		const reset = resetOpenerSelection();
		if (!reset.ok) return sendFailure(response, reset);
		response.json({ success: true, selection: reset.selection });
	});

	router.post(
		"/api/settings/opener/test",
		asyncEndpoint((request, response) =>
			dependencies.runMutation(request, "POST /api/settings/opener/test launch", async (signal) => {
				const current = readOpenerSelection();
				if (!current.ok) return sendFailure(response, current);
				const parsed = OpenerSettingsTestRequestSchema.safeParse(request.body);
				if (!parsed.success) {
					return sendFailure(
						response,
						{ code: "REQUEST_INVALID", error: "The opener test is invalid." },
						400,
					);
				}
				const checkout = resolveRegisteredCheckout(
					parsed.data.repository,
					await snapshotCheckoutAccess({ signal }),
				);
				if (!checkout.ok) return sendFailure(response, checkout);
				const launched = await planAndLaunch(
					parsed.data.selection,
					checkout.root,
					dependencies.launch,
				);
				if (!launched.ok) return sendFailure(response, launched);
				response.json({ success: true, code: "OPENER_TESTED", repository: checkout.repository });
			}),
		),
	);

	router.post(
		"/api/code-targets/open",
		asyncEndpoint((request, response) =>
			dependencies.runMutation(request, "POST /api/code-targets/open launch", async (signal) => {
				const activation = parseActivationRequest(request);
				if (!activation.ok) return sendFailure(response, activation.failure, 400);
				const found = dependencies.bindingForElement(
					activation.request.board,
					activation.request.element,
				);
				if (!found.ok) return sendFailure(response, found);
				const target = await dependencies.resolveTarget(found.binding, signal);
				if (!target.ok) return sendFailure(response, target, statusFor(target.code), found.binding);
				const current = readOpenerSelection();
				if (!current.ok)
					return sendFailure(response, current, statusFor(current.code), found.binding);
				const launched = await planAndLaunch(current.selection, target.target, dependencies.launch);
				if (!launched.ok)
					return sendFailure(response, launched, statusFor(launched.code), found.binding);
				response.json({
					success: true,
					code: "CODE_TARGET_OPENED",
					repository: target.repository,
					path: target.path,
					kind: target.kind,
				});
			}),
		),
	);

	return router;
}
