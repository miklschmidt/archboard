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
	type OpenerSelection,
} from "../../../shared/code-target/index.js";
import {
	resolveLocalCodeTarget,
	resolveRegisteredCheckout,
	type LocalCodeTargetResult,
} from "../../../runtime/code-target/index.js";
import { readBoardContent } from "../../../runtime/engine/board-io.js";
import { resolveBoard } from "../../../runtime/engine/board-store.js";
import { readElementMetadata } from "../../../runtime/engine/metadata.js";
import { listRepos } from "../../../runtime/engine/repo-registry.js";
import { checkBrowserCsrf, type BrowserCsrfKind } from "./browser-csrf.js";
import { readOpenerSelection, resetOpenerSelection, saveOpenerSelection } from "./configuration.js";
import { launchOpener, resolveOpenerCommand, type LaunchResult } from "./launch.js";
import { planOpenerCommand, validateOpenerSelection, type OpenerPlan } from "./planning.js";

type BindingLookup =
	| { ok: true; binding: CodeBinding }
	| {
			ok: false;
			code: "BOARD_NOT_FOUND" | "ELEMENT_NOT_FOUND" | "BINDING_UNAVAILABLE";
			error: string;
	  };

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

export interface CodeOpenerRouteDependencies {
	bindingForElement(board: string, element: string): BindingLookup;
	resolveTarget(binding: CodeBinding): LocalCodeTargetResult;
	launch(command: { executable: string; argv: string[] }): Promise<LaunchResult>;
}

function canonicalBinding(boardKey: string, elementId: string): BindingLookup {
	let board;
	try {
		board = resolveBoard(boardKey, "A code-target activation").board;
	} catch {
		return { ok: false, code: "BOARD_NOT_FOUND", error: `Board ${boardKey} is not open.` };
	}
	const element = readBoardContent(board).elements.get(elementId);
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
	resolveTarget: resolveLocalCodeTarget,
	launch: launchOpener,
};

function guard(kind: BrowserCsrfKind) {
	return (request: Request, response: Response, next: NextFunction): void => {
		response.removeHeader("Access-Control-Allow-Origin");
		const result = checkBrowserCsrf(kind, {
			host: request.get("host"),
			origin: request.get("origin"),
			referer: request.get("referer"),
			secFetchSite: request.get("sec-fetch-site"),
		});
		if (!result.ok) {
			response.status(403).json({ success: false, code: result.code, error: result.error });
			return;
		}
		next();
	};
}

function asyncEndpoint(
	handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
	return (request, response, next) => {
		void handler(request, response).catch((error) => setImmediate(next, error));
	};
}

function statusFor(code: CodeTargetFailureCode): number {
	if (code === "CROSS_ORIGIN_REFUSED") return 403;
	if (code === "BOARD_NOT_FOUND" || code === "ELEMENT_NOT_FOUND") return 404;
	if (code === "CHECKOUT_IDENTITY_CHANGED") return 409;
	if (code === "OPENER_SPAWN_FAILED" || code === "OPENER_CONFIG_INVALID") return 500;
	return 422;
}

function sendFailure(
	response: Response,
	failure: { code: CodeTargetFailureCode; error: string },
	status = statusFor(failure.code),
): void {
	const actions = failure.code.startsWith("OPENER_")
		? [{ kind: "settings" as const, label: "Opener settings" as const }]
		: undefined;
	response.status(status).json({
		success: false,
		code: failure.code,
		error: failure.error,
		...(actions ? { actions } : {}),
	});
}

async function planAndLaunch(
	selection: OpenerSelection,
	target: string,
	launch: CodeOpenerRouteDependencies["launch"],
): Promise<OpenerPlan | LaunchResult> {
	const plan = planOpenerCommand(selection, target);
	return plan.ok ? launch(plan.command) : plan;
}

export function createCodeOpenerRouter(
	overrides: Partial<CodeOpenerRouteDependencies> = {},
): Router {
	const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
	const router = Router();
	const body = json({ limit: "32kb" });

	router.get("/api/settings/opener", guard("settings-read"), (_request, response) => {
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
		const repositories = listRepos().map((entry) => {
			const resolved = resolveRegisteredCheckout(entry.repo);
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
	});

	router.put("/api/settings/opener", guard("mutation"), body, (request, response) => {
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

	router.delete("/api/settings/opener", guard("mutation"), (_request, response) => {
		const reset = resetOpenerSelection();
		if (!reset.ok) return sendFailure(response, reset);
		response.json({ success: true, selection: reset.selection });
	});

	router.post(
		"/api/settings/opener/test",
		guard("mutation"),
		body,
		asyncEndpoint(async (request, response) => {
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
			const checkout = resolveRegisteredCheckout(parsed.data.repository);
			if (!checkout.ok) return sendFailure(response, checkout);
			const launched = await planAndLaunch(
				parsed.data.selection,
				checkout.root,
				dependencies.launch,
			);
			if (!launched.ok) return sendFailure(response, launched);
			response.json({ success: true, code: "OPENER_TESTED", repository: checkout.repository });
		}),
	);

	router.post(
		"/api/code-targets/open",
		guard("mutation"),
		body,
		asyncEndpoint(async (request, response) => {
			if (request.url.includes("?")) {
				return sendFailure(
					response,
					{ code: "REQUEST_INVALID", error: "Activation query parameters are not accepted." },
					400,
				);
			}
			const parsed = CodeTargetOpenRequestSchema.safeParse(request.body);
			if (!parsed.success) {
				return sendFailure(
					response,
					{ code: "REQUEST_INVALID", error: "The activation request is invalid." },
					400,
				);
			}
			const found = dependencies.bindingForElement(parsed.data.board, parsed.data.element);
			if (!found.ok) return sendFailure(response, found);
			const target = dependencies.resolveTarget(found.binding);
			if (!target.ok) return sendFailure(response, target);
			const current = readOpenerSelection();
			if (!current.ok) return sendFailure(response, current);
			const launched = await planAndLaunch(current.selection, target.target, dependencies.launch);
			if (!launched.ok) return sendFailure(response, launched);
			response.json({
				success: true,
				code: "CODE_TARGET_OPENED",
				repository: target.repository,
				path: target.path,
				kind: target.kind,
			});
		}),
	);

	router.use(((error: unknown, _request: Request, response: Response, next: NextFunction) => {
		const kind =
			typeof error === "object" && error !== null && "type" in error
				? (error as { type?: unknown }).type
				: undefined;
		if (typeof kind !== "string" || !BODY_PARSER_FAILURES.has(kind)) return next(error);
		sendFailure(response, { code: "REQUEST_INVALID", error: "The request body is invalid." }, 400);
	}) as ErrorRequestHandler);

	return router;
}
