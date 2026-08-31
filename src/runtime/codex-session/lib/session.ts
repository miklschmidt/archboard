import {
	INITIALIZE_CAPABILITIES,
	LOGIN_POLICIES,
	SupportedLoginAccountParamsSchema,
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
} from "../../../shared/codex-browser-model/index.js";
import type { TurnId } from "../../../shared/codex-workbench-identity/index.js";
import {
	decodeInitializeParams,
	decodeLoginAccountParams,
	decodeResponse,
	ProtocolDecodeError,
	type ResponseMethod,
	type ResponsePayloads,
} from "../../codex-protocol/index.js";
import type { CodexTransport } from "../../codex-transport/index.js";
import type {
	TransportServerRequest,
	TransportServerNotification,
} from "../../codex-transport/server-requests.js";
import {
	CodexSessionError,
	CodexSessionMutationError,
	type CodexSession,
	type CodexSessionOptions,
	type SessionParams,
	type SessionServerRequest,
} from "./contract.js";
import { proveCodexStorage } from "./storage-proof.js";

const CLIENT_INFO = Object.freeze({
	name: "archboard",
	title: "archboard canvas",
	version: "0.1.0",
});
const INITIALIZE_OPTIONS = Object.freeze({ idempotent: false, retryEligible: false });
const READ_OPTIONS = Object.freeze({ idempotent: true, retryEligible: false });
const MUTATION_OPTIONS = Object.freeze({ idempotent: false, retryEligible: false });
const INVALID_PARAMS_CODE = -32602;

type SessionPhase =
	| "transport-connected"
	| "initializing"
	| "initialize-accepted"
	| "initialized-written"
	| "login-capable"
	| "thread-capable"
	| "failed";
type SessionGate = "login-capable" | "thread-capable";

function isRecord(value: unknown): value is SessionParams {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requestParams(value: unknown): SessionParams {
	if (value === undefined) return {};
	if (!isRecord(value))
		throw new CodexSessionError(
			"invalid_request",
			"Codex session request parameters must be a JSON object.",
		);
	return value;
}

function hasOutcome(
	value: unknown,
): value is { readonly outcome: "not_delivered" | "outcome_unknown" } {
	return (
		isRecord(value) && (value.outcome === "not_delivered" || value.outcome === "outcome_unknown")
	);
}

function mutationFailure(method: string, error: unknown): CodexSessionMutationError {
	if (hasOutcome(error)) return error as unknown as CodexSessionMutationError;
	const outcome: "not_delivered" | "outcome_unknown" =
		error instanceof ProtocolDecodeError ? "outcome_unknown" : "not_delivered";
	const message =
		outcome === "outcome_unknown"
			? `Codex mutation ${method} has an unknown outcome; inspect authoritative state before retrying.`
			: `Codex mutation ${method} was not delivered.`;
	return new CodexSessionMutationError(method, outcome, message, error);
}

function isCanonicalIdentity(value: unknown): value is string {
	return typeof value === "string" && value.startsWith("archboard:");
}

export function createCodexSession(options: CodexSessionOptions): CodexSession {
	const transport: CodexTransport = options.transport;
	const identity = options.identity;
	const lifecycle = options.lifecycle;
	const notificationSink = options.onNotification ?? options.onServerNotification;
	const now = options.now ?? Date.now;
	let phase: SessionPhase = "transport-connected";
	let accountReady = false;
	let notificationsPublished = false;
	let notificationsStopped = false;
	let publishingNotifications = false;
	const bufferedNotifications: TransportServerNotification[] = [];

	const deliverNotification = (event: TransportServerNotification): void => {
		if (!notificationSink) return;
		try {
			notificationSink(event);
		} catch {
			/* A consumer cannot change the session's decoded event boundary. */
		}
	};

	const onNotification = (event: TransportServerNotification): void => {
		if (notificationsStopped) return;
		if (!notificationsPublished || publishingNotifications) {
			bufferedNotifications.push(event);
			return;
		}
		deliverNotification(event);
	};

	const publishNotifications = (): void => {
		notificationsPublished = true;
		publishingNotifications = true;
		while (bufferedNotifications.length > 0) {
			const event = bufferedNotifications.shift();
			if (event !== undefined) deliverNotification(event);
		}
		publishingNotifications = false;
	};

	const requireGate = (gate: SessionGate): void => {
		if (phase === "failed")
			throw new CodexSessionError(
				"not_initialized",
				"The Codex session failed during initialization and must be replaced.",
			);
		if (phase !== "login-capable" && phase !== "thread-capable")
			throw new CodexSessionError(
				"not_initialized",
				"The Codex session has not completed initialization and storage proof.",
			);
		if (gate === "thread-capable" && !accountReady)
			throw new CodexSessionError(
				"not_account_ready",
				"The Codex account is not ready for thread operations.",
			);
	};

	const requestDecoded = async <Method extends ResponseMethod>(
		method: Method,
		params: SessionParams,
		requestOptions: typeof READ_OPTIONS | typeof MUTATION_OPTIONS | typeof INITIALIZE_OPTIONS,
		mutation: boolean,
	): Promise<ResponsePayloads[Method]> => {
		let response: { readonly result: unknown };
		try {
			response = await transport.request(method, params, requestOptions);
		} catch (error) {
			if (mutation) throw mutationFailure(method, error);
			throw error;
		}
		try {
			return decodeResponse(method, response.result) as ResponsePayloads[Method];
		} catch (error) {
			if (mutation) throw mutationFailure(method, error);
			throw error;
		}
	};

	const read = async <Method extends ResponseMethod>(
		method: Method,
		params: unknown,
		gate: SessionGate,
	): Promise<ResponsePayloads[Method]> => {
		requireGate(gate);
		return requestDecoded(method, requestParams(params), READ_OPTIONS, false);
	};

	const mutate = async <Method extends ResponseMethod>(
		method: Method,
		params: unknown,
		gate: SessionGate | undefined,
		prepare: (value: unknown) => SessionParams = requestParams,
	): Promise<ResponsePayloads[Method]> => {
		try {
			if (gate !== undefined) requireGate(gate);
			return await requestDecoded(method, prepare(params), MUTATION_OPTIONS, true);
		} catch (error) {
			if (error instanceof CodexSessionMutationError || hasOutcome(error)) throw error;
			throw mutationFailure(method, error);
		}
	};

	const validateLogin = (value: unknown): SessionParams => {
		const variant = isRecord(value) && typeof value.type === "string" ? value.type : undefined;
		const policy = LOGIN_POLICIES.find((candidate) => candidate.variant === variant);
		if (policy?.policy === "refused")
			throw new CodexSessionError(
				"unsupported_login",
				`The reviewed login variant ${JSON.stringify(variant)} is refused before RPC.`,
			);
		if (variant === "profile" || variant === "environment")
			throw new CodexSessionError(
				"unsupported_login",
				`The reviewed Bedrock ${variant} setup is refused before RPC.`,
			);
		try {
			const decoded = decodeLoginAccountParams(value);
			const supported = SupportedLoginAccountParamsSchema.parse(decoded);
			return supported as unknown as SessionParams;
		} catch {
			throw new CodexSessionError(
				"unsupported_login",
				"The login variant is not supported by the reviewed Archboard session.",
			);
		}
	};

	const prepareSteer = (value: unknown): SessionParams => {
		const params = requestParams(value);
		if (!Object.prototype.hasOwnProperty.call(params, "expectedTurnId"))
			throw new CodexSessionError(
				"invalid_identity",
				"turn/steer requires an issued current expectedTurnId.",
			);
		let turnId: TurnId;
		try {
			turnId = identity.decoder.parseTurnId(params.expectedTurnId);
		} catch (error) {
			throw new CodexSessionError(
				"invalid_identity",
				"turn/steer expectedTurnId is not an issued current TurnId.",
				error,
			);
		}
		const expectedTurnId = identity.decoder.serializeCodexIdentity(turnId);
		const threadValue = params.threadId;
		if (!isCanonicalIdentity(threadValue)) return { ...params, expectedTurnId };
		try {
			const threadId = identity.decoder.parseThreadId(threadValue);
			return {
				...params,
				threadId: identity.decoder.serializeCodexIdentity(threadId),
				expectedTurnId,
			};
		} catch (error) {
			throw new CodexSessionError(
				"invalid_identity",
				"turn/steer threadId is not an issued current ThreadId.",
				error,
			);
		}
	};

	const validateReverseRequest = (
		request: SessionServerRequest,
		method: SessionServerRequest["method"],
	): void => {
		if (request.owner !== "codex-session" || request.method !== method)
			throw new CodexSessionError(
				"invalid_request",
				"The reverse request is not owned by this session.",
			);
		try {
			identity.validator.assertCurrentEpoch(request.child, request.epoch);
			identity.validator.assertCurrentEpoch(request.correlation.child, request.correlation.epoch);
		} catch (error) {
			throw new CodexSessionError(
				"invalid_identity",
				"The reverse request is not from the current Codex child epoch.",
				error,
			);
		}
	};

	const validateCurrentThread = (
		request: Extract<SessionServerRequest, { method: "currentTime/read" }>,
	): void => {
		const threadId = request.params.threadId;
		if (typeof threadId !== "string" || threadId.length === 0 || threadId.includes("\0"))
			throw new CodexSessionError(
				"invalid_identity",
				"currentTime/read requires a nonempty current ThreadId.",
			);
		try {
			if (isCanonicalIdentity(threadId)) identity.decoder.parseThreadId(threadId);
			else identity.decoder.adoptThreadId(threadId);
		} catch (error) {
			throw new CodexSessionError(
				"invalid_identity",
				"currentTime/read ThreadId is not valid for this child.",
				error,
			);
		}
	};

	const respondCurrentTime = async (
		request: Extract<SessionServerRequest, { method: "currentTime/read" }>,
	): Promise<void> => {
		validateReverseRequest(request, "currentTime/read");
		validateCurrentThread(request);
		await transport.respond(request, "codex-session", {
			result: { currentTimeAt: Math.floor(now() / 1000) },
		});
	};

	const respondUnsupportedTokenRefresh = async (
		request: Extract<SessionServerRequest, { method: "account/chatgptAuthTokens/refresh" }>,
	): Promise<void> => {
		validateReverseRequest(request, "account/chatgptAuthTokens/refresh");
		await transport.respond(request, "codex-session", { error: UNSUPPORTED_TOKEN_REFRESH_ERROR });
	};

	const respondUnsupportedAttestation = async (
		request: Extract<SessionServerRequest, { method: "attestation/generate" }>,
	): Promise<void> => {
		validateReverseRequest(request, "attestation/generate");
		await transport.respond(request, "codex-session", { error: UNSUPPORTED_ATTESTATION_ERROR });
	};

	const respondInvalidReverseRequest = (request: SessionServerRequest): void => {
		void transport
			.respond(request, "codex-session", {
				error: {
					code: INVALID_PARAMS_CODE,
					message: "The reverse request is not valid for the current Codex child epoch.",
				},
			})
			.catch(() => undefined);
	};

	const onServerRequest = (request: TransportServerRequest): void => {
		if (request.owner !== "codex-session") return;
		const operation =
			request.method === "currentTime/read"
				? respondCurrentTime(request)
				: request.method === "account/chatgptAuthTokens/refresh"
					? respondUnsupportedTokenRefresh(request)
					: respondUnsupportedAttestation(request);
		void operation.catch((error: unknown) => {
			if (error instanceof CodexSessionError) respondInvalidReverseRequest(request);
		});
	};

	transport.onServerNotification(onNotification);
	transport.onServerRequest(onServerRequest);

	const initialize = async (): Promise<ResponsePayloads["initialize"]> => {
		if (phase !== "transport-connected")
			throw new CodexSessionError(
				"already_initialized",
				"This Codex session has already started initialization and cannot be initialized again.",
			);
		phase = "initializing";
		try {
			const params = decodeInitializeParams({
				clientInfo: CLIENT_INFO,
				capabilities: INITIALIZE_CAPABILITIES,
			});
			const initialized = await requestDecoded("initialize", params, INITIALIZE_OPTIONS, false);
			phase = "initialize-accepted";
			await transport.sendNotification("initialized");
			phase = "initialized-written";
			const requirements = await requestDecoded("configRequirements/read", {}, READ_OPTIONS, false);
			const config = await requestDecoded(
				"config/read",
				{ includeLayers: true },
				READ_OPTIONS,
				false,
			);
			proveCodexStorage({
				storage: options.storage,
				initialize: initialized,
				config,
				requirements,
			});
			phase = "login-capable";
			lifecycle?.markAppServerReady();
			publishNotifications();
			return initialized;
		} catch (error) {
			phase = "failed";
			notificationsStopped = true;
			bufferedNotifications.length = 0;
			try {
				lifecycle?.markTerminalFailure("Codex session initialization failed.");
			} catch {
				/* The process lifecycle remains the owner of callback failures. */
			}
			throw error;
		}
	};

	const configRead = (params?: SessionParams) => read("config/read", params, "login-capable");
	const accountRead = async (params?: SessionParams) => {
		const result = await read("account/read", params, "login-capable");
		if (result.account === null) {
			accountReady = false;
			phase = "login-capable";
		} else {
			accountReady = true;
			phase = "thread-capable";
			lifecycle?.markAccountReady();
		}
		return result;
	};
	const accountLogin = (params: Parameters<CodexSession["accountLogin"]>[0]) =>
		mutate("account/login/start", params, "login-capable", validateLogin);
	const accountLoginCancel = (params?: SessionParams) =>
		mutate("account/login/cancel", params, "login-capable");
	const accountLogout = async (params?: SessionParams) => {
		const result = await mutate("account/logout", params, "login-capable");
		accountReady = false;
		phase = "login-capable";
		return result;
	};
	const modelList = (params?: SessionParams) => read("model/list", params, "login-capable");
	const threadStart = (params: SessionParams) => mutate("thread/start", params, "thread-capable");
	const threadFork = (params: SessionParams) => mutate("thread/fork", params, "thread-capable");
	const threadListPage = (params?: SessionParams) => read("thread/list", params, "thread-capable");
	const threadLoadedListPage = (params?: SessionParams) =>
		read("thread/loaded/list", params, "thread-capable");
	const threadRead = (params: SessionParams) => read("thread/read", params, "thread-capable");
	const threadTurnsListPage = (params?: SessionParams) =>
		read("thread/turns/list", params, "thread-capable");
	const threadItemsListPage = (params?: SessionParams) =>
		read("thread/items/list", params, "thread-capable");
	const threadDelete = (params: SessionParams) => mutate("thread/delete", params, "thread-capable");
	const threadSettingsUpdate = (params: SessionParams) =>
		mutate("thread/settings/update", params, "thread-capable");
	const turnStart = (params: SessionParams) => mutate("turn/start", params, "thread-capable");
	const turnSteer = (params: SessionParams) =>
		mutate("turn/steer", params, "thread-capable", prepareSteer);
	const turnInterrupt = (params: SessionParams) =>
		mutate("turn/interrupt", params, "thread-capable");
	const queueAdd = (params: SessionParams) => mutate("thread/queue/add", params, "thread-capable");
	const queueListPage = (params?: SessionParams) =>
		read("thread/queue/list", params, "thread-capable");
	const queueUpdate = (params: SessionParams) =>
		mutate("thread/queue/update", params, "thread-capable");
	const queueDelete = (params: SessionParams) =>
		mutate("thread/queue/delete", params, "thread-capable");
	const queueReorder = (params: SessionParams) =>
		mutate("thread/queue/reorder", params, "thread-capable");
	const queueStart = (params: SessionParams) =>
		mutate("thread/queue/start", params, "thread-capable");
	const threadInjectItems = (params: SessionParams) =>
		mutate("thread/inject_items", params, "thread-capable");
	const realtimeStart = (params: SessionParams) =>
		mutate("thread/realtime/start", params, "thread-capable");
	const realtimeAppendText = (params: SessionParams) =>
		mutate("thread/realtime/appendText", params, "thread-capable");
	const realtimeAppendSpeech = (params: SessionParams) =>
		mutate("thread/realtime/appendSpeech", params, "thread-capable");
	const realtimeStop = (params: SessionParams) =>
		mutate("thread/realtime/stop", params, "thread-capable");
	const timelineListPage = (params?: SessionParams) =>
		read("thread/timeline/list", params, "thread-capable");

	return Object.freeze({
		initialize,
		configRead,
		accountRead,
		accountLogin,
		accountLoginCancel,
		accountLogout,
		modelList,
		threadStart,
		threadFork,
		threadListPage,
		threadLoadedListPage,
		threadRead,
		threadTurnsListPage,
		threadItemsListPage,
		threadDelete,
		threadSettingsUpdate,
		turnStart,
		turnSteer,
		turnInterrupt,
		queueAdd,
		queueListPage,
		queueUpdate,
		queueDelete,
		queueReorder,
		queueStart,
		threadInjectItems,
		realtimeStart,
		realtimeAppendText,
		realtimeAppendSpeech,
		realtimeStop,
		timelineListPage,
		respondCurrentTime,
		respondUnsupportedTokenRefresh,
		respondUnsupportedAttestation,
	});
}
