import {
	Router,
	json,
	type ErrorRequestHandler,
	type Request,
	type RequestHandler,
	type Response,
} from "express";

import { CodeBindingSchema, type CodeBinding } from "@archboard/code-binding/bindings";
import {
	CodeTargetOpenRequestSchema,
	type CodeTargetOpenSuccess,
	type CodeTargetFailureCode,
	type CodeTargetOpenRequest,
} from "#shared/schemas/code-target-open.ts";
import {
	LINE_TOKEN,
	OpenerSelectionSchema,
	OpenerSettingsTestRequestSchema,
	PATH_TOKEN,
	type OpenerSelection,
} from "#shared/schemas/opener-settings.ts";
import {
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
	type LocalCodeTarget,
	type LocalCodeTargetResult,
	type OtherRef,
} from "@archboard/code-binding/resolution";
import { githubUrlForBinding } from "#server/projections/github-link.ts";
import { addressedVariant } from "@archboard/board/document";
import { readSemanticBoard } from "@archboard/board/store-read";
import { createBrowserOriginGuard } from "#server/middleware/browser-origin-guard.ts";
import {
	readOpenerSelection,
	resetOpenerSelection,
	saveOpenerSelection,
} from "#server/store/configuration.ts";
import { launchOpener, resolveOpenerCommand, type LaunchResult } from "#server/lifecycle/launch.ts";
import { resolveInVault } from "#server/projections/resolve-target.ts";
import { symbolLine } from "@archboard/code-intel/code-facts";
import {
	planOpenerCommand,
	validateOpenerSelection,
	type OpenerPlan,
	type PlanOptions,
} from "#server/projections/planning.ts";

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
	CHECKOUT_ON_OTHER_REF: 409,
	OPENER_SPAWN_FAILED: 500,
	OPENER_CONFIG_INVALID: 500,
};

/**
 * Hands the request to the next handler; the preguard only refuses, it never answers a success.
 * @param _request The request, unused here.
 * @param _response The response, unused here.
 * @param next Continues to the Archboard server's own handler.
 */
const pass: RequestHandler = (_request, _response, next) => {
	next();
};

export interface CodeOpenerRouteDependencies {
	/** Reads the binding a node carries, off the board of the vault the call names. */
	bindingForElement(board: string, element: string, vault: string): BindingLookup;
	/** Resolves a binding to the code it opens, in the checkout the vault the call names reads. */
	resolveTarget(
		binding: CodeBinding,
		signal: AbortSignal | undefined,
		vault: string,
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
 * Reads the code binding a node on a board carries.
 *
 * The variant the pane is showing is part of the board key it sends, so a
 * proposal's binding is read off the proposal rather than off whatever is
 * current: a person following code from a draft lands in the code that draft
 * names (ADR 0023).
 * @param vault The vault root the board lives in.
 * @param boardKey The board the node is on, variant and all.
 * @param subjectId The node whose binding is wanted.
 * @returns The binding, or which of board, node or binding was missing.
 */
function canonicalBinding(vault: string, boardKey: string, subjectId: string): BindingLookup {
	const address = boardAddressOf(boardKey);
	const read = readSemanticBoard(vault, address.board);
	if (!read.ok) {
		return { ok: false, code: "BOARD_NOT_FOUND", error: read.problem };
	}
	const opened = addressedVariant(read.board, address.variant);
	if (!opened.ok) {
		return { ok: false, code: "BOARD_NOT_FOUND", error: `${opened.problem}.` };
	}
	const node = opened.variant.content.nodes.find((one) => one.id === subjectId);
	if (node === undefined) {
		return {
			ok: false,
			code: "ELEMENT_NOT_FOUND",
			error: `${subjectId} is not a node on this board.`,
		};
	}
	// The binding keeps its `symbol`: the opener opens the bound file at the line that
	// defines it where code facts find one (ADR 0046).
	const parsed = CodeBindingSchema.safeParse(node.binding);
	return parsed.success
		? { ok: true, binding: parsed.data }
		: { ok: false, code: "BINDING_UNAVAILABLE", error: "This node is not bound to code." };
}

/**
 * What a pane board key names: the board, and which of its variants.
 *
 * Split at the first `@`, which is the one spelling a pane and an address use
 * (`apps/web/src/ui/rules/semantic-board-canvas/board/address.ts` holds the browser's half of it).
 * @param key The board key.
 * @returns The board name and the variant, when it names one.
 */
function boardAddressOf(key: string): { board: string; variant: string | undefined } {
	const mark = key.indexOf("@");
	if (mark <= 0) {
		return { board: key, variant: undefined };
	}
	const variant = key.slice(mark + 1);
	return { board: key.slice(0, mark), variant: variant === "" ? undefined : variant };
}

const DEFAULT_DEPENDENCIES: Omit<CodeOpenerRouteDependencies, "bindingForElement"> = {
	/**
	 * Resolves a binding against a fresh checkout snapshot limited to that binding.
	 * @param binding The code binding to resolve.
	 * @param signal Cancels the snapshot when the request is abandoned.
	 * @param vault The vault the binding was read from.
	 * @returns The local code target, or why it could not be resolved.
	 */
	resolveTarget: (binding, signal, vault) => resolveInVault(vault, binding, signal),
	launch: launchOpener,
	/**
	 * Runs checkout work directly; the Archboard server supplies request-scoped scheduling in production.
	 * @param _request The request, unused here.
	 * @param _response The response, unused here.
	 * @param _name The work's name, unused here.
	 * @param work The checkout work.
	 * @returns The work's result.
	 */
	runCheckout: async (_request, _response, _name, work) => work(new AbortController().signal),
	/**
	 * Runs mutation work directly; the Archboard server supplies request-scoped scheduling in production.
	 * @param _request The request, unused here.
	 * @param _name The work's name, unused here.
	 * @param work The mutation work.
	 * @returns The work's result.
	 */
	runMutation: async (_request, _name, work) => work(new AbortController().signal),
};

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
 * @param line The line of its symbol in the checkout's working tree, which the link names.
 */
function sendFailure(
	response: Response,
	failure: RouteFailure,
	status = statusFor(failure.code),
	binding?: CodeBinding,
	line?: number,
): void {
	const github = binding ? githubUrlForBinding(binding, line) : undefined;
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
 * The local target to open, or why none is. A checkout on another ref would open another
 * version of the code, and the checkout is never switched: when GitHub has the bound ref the
 * person is sent there, and a repository with no such fallback opens locally and says so.
 * @param target How the binding resolved on this machine.
 * @param binding The binding.
 * @returns The target, or the failure and its status.
 */
function openable(
	target: LocalCodeTargetResult,
	binding: CodeBinding,
):
	| { readonly ok: true; readonly target: LocalCodeTarget }
	| { readonly ok: false; readonly failure: RouteFailure; readonly status: number } {
	if (!target.ok) {
		return { ok: false, failure: target, status: statusFor(target.code) };
	}
	const { otherRef } = target;
	if (otherRef !== undefined && githubUrlForBinding(binding) !== undefined) {
		return { ok: false, failure: otherRefFailure(target.repository, otherRef), status: 409 };
	}
	return { ok: true, target };
}

/**
 * What the browser is told about code that was opened.
 * @param target The local target that was opened.
 * @returns The success reply, with the two refs when the checkout was on another one.
 */
function openedReply(target: LocalCodeTarget): CodeTargetOpenSuccess {
	return {
		success: true,
		code: "CODE_TARGET_OPENED",
		repository: target.repository,
		path: target.path,
		kind: target.kind,
		...(target.otherRef === undefined ? {} : { otherRef: target.otherRef }),
	};
}

/**
 * The refusal for a local target whose checkout is on another ref than the binding names.
 * @param repository The repository the checkout is of.
 * @param otherRef The ref the binding names and the one the checkout has out.
 * @returns The failure the person is shown, with both refs.
 */
function otherRefFailure(repository: string, otherRef: OtherRef): RouteFailure {
	return {
		code: "CHECKOUT_ON_OTHER_REF",
		error: `The checkout of ${repository} is on ${otherRef.checkedOut}, and this binding names ${otherRef.named}.`,
	};
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
 * Builds the router mounted ahead of the Archboard server that guards and parses the opener routes.
 * @returns The preguard router.
 */
export function createCodeOpenerPreguard(): Router {
	const router = Router();
	const body = json({ limit: "32kb" });
	router.get("/api/settings/opener", createBrowserOriginGuard("settings-read"), pass);
	router.put("/api/settings/opener", createBrowserOriginGuard("mutation"), body, pass);
	router.delete("/api/settings/opener", createBrowserOriginGuard("mutation"), pass);
	router.post("/api/settings/opener/test", createBrowserOriginGuard("mutation"), body, pass);
	router.post("/api/code-targets/open", createBrowserOriginGuard("mutation"), body, pass);
	router.use(bodyFailure());
	return router;
}

/**
 * The command a selection runs, as the opener settings show it: with `{path}` and
 * `{line}` where they go, as a custom command is written.
 * @param selection The opener selection.
 * @returns The planned command, or why the selection cannot be planned here.
 */
function shownCommand(selection: OpenerSelection): OpenerPlan {
	return planOpenerCommand(selection, PATH_TOKEN, { line: LINE_TOKEN });
}

/**
 * Opens a target in the person's editor: plans the command the selection makes for it and
 * launches that command when the plan succeeds.
 * @param selection The opener selection to plan with.
 * @param target The path to open.
 * @param options The line to open at when the opener can, the platform to plan for, and the
 * launcher that runs the command, the real one unless a test replaces it.
 * @returns The launch result, or the plan failure that prevented a launch.
 */
export async function openInEditor(
	selection: OpenerSelection,
	target: string,
	options: PlanOptions & { readonly launch?: CodeOpenerRouteDependencies["launch"] } = {},
): Promise<OpenerPlan | LaunchResult> {
	const { launch = launchOpener, ...planning } = options;
	const plan = planOpenerCommand(selection, target, planning);
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
	// The vault the call names is the server's own requirement and is read from the call
	// before this route runs (ADR 0049); what is left is the board and the element.
	const { vault: _named, ...link } = typeof request.body === "object" ? (request.body ?? {}) : {};
	const parsed = CodeTargetOpenRequestSchema.safeParse(link);
	return parsed.success
		? { ok: true, request: parsed.data }
		: {
				ok: false,
				failure: { code: "REQUEST_INVALID", error: "The activation request is invalid." },
			};
}

/**
 * Builds the opener routes: settings read, save, reset and test, and code-target activation.
 * @param vault Names the vault root whose boards carry the bindings a request opens; asked
 * per request, because every call names its own vault (ADR 0049).
 * @param overrides Dependencies replaced by the Archboard server or by tests.
 * @returns The opener router.
 */
export function createCodeOpenerRouter(
	vault: (request: Request) => string,
	overrides: Partial<CodeOpenerRouteDependencies> = {},
): Router {
	const dependencies = {
		...DEFAULT_DEPENDENCIES,
		/**
		 * Reads the binding off the board of the vault.
		 * @param board The board the node is on.
		 * @param element The node whose binding is wanted.
		 * @param vaultRoot The vault the call named.
		 * @returns The binding, or which of board, node or binding was missing.
		 */
		bindingForElement: (board: string, element: string, vaultRoot: string) =>
			canonicalBinding(vaultRoot, board, element),
		...overrides,
	};
	const router = Router();

	router.get(
		"/api/settings/opener",
		asyncEndpoint(async (request, response) => {
			const current = readOpenerSelection();
			if (!current.ok) return sendFailure(response, current);
			const plannedCurrent = shownCommand(current.selection);
			const effective = plannedCurrent.ok
				? resolveOpenerCommand(plannedCurrent.command)
				: plannedCurrent;
			const native = shownCommand({ version: 1, kind: "platform" });
			const presets = (["vscode", "cursor", "zed"] as const).map((preset) => {
				const planned = shownCommand({ version: 1, kind: "preset", preset });
				if (!planned.ok) throw new Error(planned.error);
				return { preset, command: planned.command };
			});
			const snapshot = await dependencies.runCheckout(
				request,
				response,
				"GET /api/settings/opener checkout snapshot",
				(signal) => snapshotCheckoutAccess({ vault: null, signal }),
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
					await snapshotCheckoutAccess({ vault: null, signal }),
				);
				if (!checkout.ok) return sendFailure(response, checkout);
				const launched = await openInEditor(parsed.data.selection, checkout.root, {
					launch: dependencies.launch,
				});
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
				const vaultRoot = vault(request);
				const found = dependencies.bindingForElement(
					activation.request.board,
					activation.request.element,
					vaultRoot,
				);
				if (!found.ok) return sendFailure(response, found);
				const opening = openable(
					await dependencies.resolveTarget(found.binding, signal, vaultRoot),
					found.binding,
				);
				if (!opening.ok)
					return sendFailure(response, opening.failure, opening.status, found.binding);
				const { target } = opening;
				// The line is read from the working tree. A checkout on another ref than the
				// binding pins never gets here with a GitHub link, because it was refused above,
				// so the link names the line only where the checkout is on the pinned ref or the
				// binding pins none (its link is GitHub's default branch).
				const line = await symbolLine(found.binding, target, signal);
				const current = readOpenerSelection();
				if (!current.ok)
					return sendFailure(response, current, statusFor(current.code), found.binding, line);
				const launched = await openInEditor(current.selection, target.target, {
					line,
					launch: dependencies.launch,
				});
				if (!launched.ok)
					return sendFailure(response, launched, statusFor(launched.code), found.binding, line);
				response.json(openedReply(target));
			}),
		),
	);

	return router;
}
