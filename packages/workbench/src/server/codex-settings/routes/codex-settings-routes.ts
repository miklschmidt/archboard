import { Router, type Express, type Request, type RequestHandler, type Response } from "express";
import {
	defaultCodexSettingsService,
	type CodexSettingsResult,
	type CodexSettingsService,
} from "#server/codex-settings/services/codex-settings.ts";
import {
	CodexSettingsCancelLoginRequestSchema,
	CodexSettingsLoginRequestSchema,
	CodexSettingsSaveRequestSchema,
	type CodexSettingsFailureCode,
} from "#shared/codex-settings/schemas/codex-settings.ts";

interface CodexSettingsRouteHost {
	readonly read: RequestHandler;
	readonly mutation: RequestHandler;
	readonly mutationEndpoint: typeof asyncEndpoint;
}

/**
 * No-op middleware used when a test mounts the router without host origin guards.
 * @param _request Unused Express request.
 * @param _response Unused Express response.
 * @param next Continues to the route handler.
 */
const PASS_THROUGH: RequestHandler = (_request, _response, next) => {
	next();
};

const FAILURE_STATUSES: Readonly<Record<CodexSettingsFailureCode, number>> = {
	REQUEST_INVALID: 400,
	CODEX_UNAUTHENTICATED: 409,
	MODEL_SELECTION_INVALID: 422,
	CODEX_CONFIG_INVALID: 500,
	MODEL_LIST_FAILED: 502,
	LOGIN_FAILED: 502,
	LOGOUT_FAILED: 502,
	CODEX_UNAVAILABLE: 503,
};

/**
 * Adapt an async route handler so rejections flow into Express error middleware.
 * @param handler Async route handler.
 * @returns Express request handler.
 */
function asyncEndpoint(
	handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
	return (request, response, next) => {
		void handler(request, response).catch((error) => setImmediate(next, error));
	};
}

const TEST_ROUTE_HOST: CodexSettingsRouteHost = {
	read: PASS_THROUGH,
	mutation: PASS_THROUGH,
	mutationEndpoint: asyncEndpoint,
};

/**
 * Write a structured Codex settings service result as an HTTP JSON response.
 * @param response Express response.
 * @param result Service result.
 */
function sendResult(response: Response, result: CodexSettingsResult): void {
	if (result.ok) {
		response.json(result.reply);
		return;
	}
	response.status(FAILURE_STATUSES[result.code]).json({
		success: false,
		code: result.code,
		error: result.error,
	});
}

/**
 * Build the Express router for Codex authentication and model selection settings.
 * @param service Settings service implementation (defaults to the live workbench service).
 * @param host Origin guards and mutation tracking supplied by the server host.
 * @returns Express router mounting /api/settings/codex endpoints.
 */
function createCodexSettingsRouter(
	service: CodexSettingsService = defaultCodexSettingsService,
	host: CodexSettingsRouteHost = TEST_ROUTE_HOST,
): Router {
	const router = Router();
	const { read: readGuard, mutation: mutationGuard, mutationEndpoint } = host;

	router.get(
		"/api/settings/codex",
		readGuard,
		asyncEndpoint(async (_request, response) => {
			sendResult(response, await service.readSettings());
		}),
	);

	router.put(
		"/api/settings/codex",
		mutationGuard,
		mutationEndpoint(async (request, response) => {
			const parsed = CodexSettingsSaveRequestSchema.safeParse(request.body);
			if (!parsed.success) {
				sendResult(response, {
					ok: false,
					code: "REQUEST_INVALID",
					error: "The Codex settings request is invalid.",
				});
				return;
			}
			sendResult(response, await service.saveSettings(parsed.data));
		}),
	);

	router.delete(
		"/api/settings/codex",
		mutationGuard,
		mutationEndpoint(async (_request, response) => {
			sendResult(response, await service.resetSettings());
		}),
	);

	router.post(
		"/api/settings/codex/login",
		mutationGuard,
		mutationEndpoint(async (request, response) => {
			const parsed = CodexSettingsLoginRequestSchema.safeParse(request.body);
			if (!parsed.success) {
				sendResult(response, {
					ok: false,
					code: "REQUEST_INVALID",
					error: "The Codex sign-in request is invalid.",
				});
				return;
			}
			sendResult(response, await service.startLogin(parsed.data));
		}),
	);

	router.post(
		"/api/settings/codex/login/cancel",
		mutationGuard,
		mutationEndpoint(async (request, response) => {
			const parsed = CodexSettingsCancelLoginRequestSchema.safeParse(request.body);
			if (!parsed.success) {
				sendResult(response, {
					ok: false,
					code: "REQUEST_INVALID",
					error: "The Codex sign-in cancellation request is invalid.",
				});
				return;
			}
			sendResult(response, await service.cancelLogin(parsed.data.loginId));
		}),
	);

	router.post(
		"/api/settings/codex/logout",
		mutationGuard,
		mutationEndpoint(async (_request, response) => {
			sendResult(response, await service.logout());
		}),
	);

	return router;
}

/**
 * Mount Codex authentication and model selection settings routes on the Archboard server.
 * @param app Express application.
 * @param host Origin guards and mutation tracking supplied by the server host.
 */
function mountCodexSettingsRoutes(app: Express, host: CodexSettingsRouteHost): void {
	app.use(createCodexSettingsRouter(defaultCodexSettingsService, host));
}

export { createCodexSettingsRouter, mountCodexSettingsRoutes };
