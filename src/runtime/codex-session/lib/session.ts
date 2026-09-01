import {
	INITIALIZE_CAPABILITIES,
	InitializeCapabilitiesSchema,
	LOGIN_POLICIES,
	SupportedLoginAccountParamsSchema,
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
} from "../../../shared/codex-browser-model/index.js";
import {
	decodeClientRequestParams,
	decodeResponse,
	isClientRequestMethodWithoutParams,
	ProtocolDecodeError,
	type ClientRequestMethod,
	type ClientRequestParams,
	type ResponseMethod,
	type ResponsePayloads,
} from "../../codex-protocol/index.js";
import type { CodexTransport, CodexTransportResponse } from "../../codex-transport/index.js";
import type {
	TransportServerRequest,
	TransportServerNotification,
} from "../../codex-transport/server-requests.js";
import {
	CodexSessionError,
	CodexSessionMutationError,
	CODEX_SESSION_CONTROL,
	type CodexSession,
	type ControlledCodexSession,
	type CodexSessionOptions,
	type SessionParams,
	type SessionServerRequest,
	type SessionMutationOutcome,
} from "./contract.js";
import {
	adoptSessionResponse,
	SESSION_PROTOCOL_METHODS,
	type SessionRequestIdentityField,
	type SessionResponsePayloads,
} from "./results.js";
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

type OutboundMethod = Extract<ClientRequestMethod, ResponseMethod>;

type SessionPhase =
	| "transport-connected"
	| "initializing"
	| "initialize-accepted"
	| "initialized-written"
	| "login-capable"
	| "thread-capable"
	| "failed";
type SessionGate = "login-capable" | "thread-capable";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requestParams(value: unknown): Readonly<Record<string, unknown>> {
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
	if (error instanceof CodexSessionMutationError) return error;
	const outcome: SessionMutationOutcome = hasOutcome(error)
		? error.outcome
		: error instanceof ProtocolDecodeError
			? "outcome_unknown"
			: "not_delivered";
	const message =
		outcome === "outcome_unknown"
			? `Codex mutation ${method} has an unknown outcome; inspect authoritative state before retrying.`
			: `Codex mutation ${method} was not delivered.`;
	return new CodexSessionMutationError(method, outcome, message, error);
}

function mutationOutcome(error: unknown): SessionMutationOutcome | undefined {
	if (error instanceof CodexSessionMutationError) return error.outcome;
	return hasOutcome(error) ? error.outcome : undefined;
}

/** Applies the authored policy inside the session before the public wire decoder runs. */
function authoredSessionInitializeParams(): ClientRequestParams<"initialize"> {
	return {
		clientInfo: CLIENT_INFO,
		capabilities: InitializeCapabilitiesSchema.parse(INITIALIZE_CAPABILITIES),
	};
}

export function createCodexSession(options: CodexSessionOptions): ControlledCodexSession {
	const transport: CodexTransport = options.transport;
	const identity = options.identity;
	const lifecycle = options.lifecycle;
	const notificationSink = options.onNotification;
	const now = options.now ?? Date.now;
	let phase: SessionPhase = options.adoptedReadiness ?? "transport-connected";
	let accountReady = options.adoptedReadiness === "thread-capable";
	let notificationsPublished = options.adoptedReadiness !== undefined;
	let notificationsStopped = false;
	let publishingNotifications = false;
	const bufferedNotifications: TransportServerNotification[] = [];
	const unsubscribers: Array<() => void> = [];
	let disposed = false;
	const requestIdentitySerializers = {
		threadId: (value: unknown) =>
			identity.decoder.serializeCodexIdentity(identity.decoder.parseThreadId(value)),
		parentThreadId: (value: unknown) =>
			identity.decoder.serializeCodexIdentity(identity.decoder.parseThreadId(value)),
		ancestorThreadId: (value: unknown) =>
			identity.decoder.serializeCodexIdentity(identity.decoder.parseThreadId(value)),
		turnId: (value: unknown) =>
			identity.decoder.serializeCodexIdentity(identity.decoder.parseTurnId(value)),
		lastTurnId: (value: unknown) =>
			identity.decoder.serializeCodexIdentity(identity.decoder.parseTurnId(value)),
		beforeTurnId: (value: unknown) =>
			identity.decoder.serializeCodexIdentity(identity.decoder.parseTurnId(value)),
		expectedTurnId: (value: unknown) =>
			identity.decoder.serializeCodexIdentity(identity.decoder.parseTurnId(value)),
		queuedSubmissionId: (value: unknown) =>
			identity.decoder.serializeCodexIdentity(identity.decoder.parseQueuedSubmissionId(value)),
		queuedSubmissionIds: (value: unknown) => {
			if (!Array.isArray(value))
				throw new TypeError("queuedSubmissionIds must be an array of issued identities.");
			return value.map((candidate) =>
				identity.decoder.serializeCodexIdentity(
					identity.decoder.parseQueuedSubmissionId(candidate),
				),
			);
		},
		loginId: (value: unknown) =>
			identity.decoder.serializeCodexIdentity(identity.decoder.parseLoginId(value)),
		realtimeSessionId: (value: unknown) => identity.decoder.parseRealtimeSessionId(value),
	} satisfies Record<SessionRequestIdentityField, (value: unknown) => unknown>;
	const serializeIdentityField = (field: SessionRequestIdentityField, value: unknown): unknown => {
		if (value === undefined || value === null) return value;
		try {
			return requestIdentitySerializers[field](value);
		} catch (error) {
			throw new CodexSessionError(
				"invalid_identity",
				`Codex request field ${field} is not an issued identity for this child.`,
				error,
			);
		}
	};

	const serializeRequestParams = <Method extends OutboundMethod>(
		method: Method,
		value: unknown,
	): ClientRequestParams<Method> => {
		if (isClientRequestMethodWithoutParams(method)) return value as ClientRequestParams<Method>;
		const params = requestParams(value);
		const fields = SESSION_PROTOCOL_METHODS[method].requestIdentities;
		if (fields.length === 0) return params as ClientRequestParams<Method>;
		const serialized = { ...params };
		for (const field of fields) serialized[field] = serializeIdentityField(field, params[field]);
		return serialized as ClientRequestParams<Method>;
	};

	const setAccountReadiness = (ready: boolean): void => {
		accountReady = ready;
		if (phase !== "failed") phase = ready ? "thread-capable" : "login-capable";
	};

	const deliverNotification = (event: TransportServerNotification): void => {
		if (!notificationSink) return;
		try {
			notificationSink(event);
		} catch {
			/* A consumer cannot change the session's decoded event boundary. */
		}
	};

	const onNotification = (event: TransportServerNotification): void => {
		if (disposed || notificationsStopped) return;
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

	const requestDecoded = async <Method extends OutboundMethod>(
		method: Method,
		params: unknown,
		requestOptions: typeof READ_OPTIONS | typeof MUTATION_OPTIONS | typeof INITIALIZE_OPTIONS,
		mutation: boolean,
	): Promise<SessionResponsePayloads[Method]> => {
		let decodedParams: ClientRequestParams<Method>;
		try {
			decodedParams = decodeClientRequestParams(method, serializeRequestParams(method, params));
		} catch (error) {
			if (mutation)
				throw new CodexSessionMutationError(
					method,
					"not_delivered",
					`Codex mutation ${method} was rejected before delivery.`,
					error,
				);
			throw error;
		}
		let response: CodexTransportResponse<Method>;
		try {
			response = await transport.request(method, decodedParams, requestOptions);
		} catch (error) {
			if (mutation) throw mutationFailure(method, error);
			throw error;
		}
		try {
			identity.validator.assertCurrentEpoch(response.correlation.child, response.correlation.epoch);
		} catch (error) {
			const failure = new CodexSessionError(
				"invalid_identity",
				`Codex response ${method} is not from the current child epoch.`,
				error,
			);
			if (mutation)
				throw new CodexSessionMutationError(
					method,
					"outcome_unknown",
					`Codex mutation ${method} returned with an invalid child correlation.`,
					failure,
				);
			throw failure;
		}
		let decoded: ResponsePayloads[Method];
		try {
			decoded = decodeResponse(method, response.result) as ResponsePayloads[Method];
		} catch (error) {
			if (mutation) throw mutationFailure(method, error);
			throw error;
		}
		try {
			return adoptSessionResponse(method, decoded, identity.decoder);
		} catch (error) {
			const failure = new CodexSessionError(
				"invalid_identity",
				`Codex response ${method} contains an invalid server identity.`,
				error,
			);
			if (mutation)
				throw new CodexSessionMutationError(
					method,
					"outcome_unknown",
					`Codex mutation ${method} returned identities that could not be trusted.`,
					failure,
				);
			throw failure;
		}
	};

	const read = async <Method extends OutboundMethod>(
		method: Method,
		params: unknown,
		gate: SessionGate,
	): Promise<SessionResponsePayloads[Method]> => {
		requireGate(gate);
		return requestDecoded(method, params, READ_OPTIONS, false);
	};

	const mutate = async <Method extends OutboundMethod>(
		method: Method,
		params: unknown,
		gate: SessionGate | undefined,
		prepare: (value: unknown) => unknown = (value) => value,
	): Promise<SessionResponsePayloads[Method]> => {
		try {
			if (gate !== undefined) requireGate(gate);
			return await requestDecoded(method, prepare(params), MUTATION_OPTIONS, true);
		} catch (error) {
			if (error instanceof CodexSessionMutationError) throw error;
			throw mutationFailure(method, error);
		}
	};

	const validateLogin = (value: unknown): unknown => {
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
		const supported = SupportedLoginAccountParamsSchema.safeParse(value);
		if (!supported.success) {
			throw new CodexSessionError(
				"unsupported_login",
				"The login variant is not supported by the reviewed Archboard session.",
			);
		}
		return supported.data;
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
			identity.decoder.parseThreadId(threadId);
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
		const result: ResponsePayloads["currentTime/read"] = {
			currentTimeAt: Math.floor(now() / 1000),
		};
		await transport.respond(request, "codex-session", {
			result,
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
		if (disposed) return;
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

	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		notificationsStopped = true;
		bufferedNotifications.length = 0;
		for (const unsubscribe of unsubscribers.splice(0).toReversed()) unsubscribe();
	};

	if ((options.listenerOwnership ?? "self") === "self") {
		unsubscribers.push(transport.onServerNotification(onNotification));
		unsubscribers.push(transport.onServerRequest(onServerRequest));
	}

	const initialize = async (): Promise<SessionResponsePayloads["initialize"]> => {
		if (phase !== "transport-connected")
			throw new CodexSessionError(
				"already_initialized",
				"This Codex session has already started initialization and cannot be initialized again.",
			);
		phase = "initializing";
		try {
			const initialized = await requestDecoded(
				"initialize",
				authoredSessionInitializeParams(),
				INITIALIZE_OPTIONS,
				false,
			);
			phase = "initialize-accepted";
			await transport.sendNotification("initialized");
			phase = "initialized-written";
			const requirements = await requestDecoded(
				"configRequirements/read",
				undefined,
				READ_OPTIONS,
				false,
			);
			const config = await requestDecoded(
				"config/read",
				{ includeLayers: true, cwd: options.checkoutRoot },
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

	const configRead = (params?: SessionParams<"config/read">) =>
		read("config/read", params, "login-capable");
	const accountRead = async (params?: SessionParams<"account/read">) => {
		const result = await read("account/read", params, "login-capable");
		if (result.account === null) {
			setAccountReadiness(false);
		} else {
			setAccountReadiness(true);
			lifecycle?.markAccountReady();
		}
		return result;
	};
	const accountLogin = (params: Parameters<CodexSession["accountLogin"]>[0]) =>
		mutate("account/login/start", params, "login-capable", validateLogin);
	const accountLoginCancel = (params: SessionParams<"account/login/cancel">) =>
		mutate("account/login/cancel", params, "login-capable");
	const accountLogout = async () => {
		const restoreReady = accountReady && phase === "thread-capable";
		if (restoreReady) setAccountReadiness(false);
		try {
			const result = await mutate("account/logout", undefined, "login-capable");
			setAccountReadiness(false);
			return result;
		} catch (error) {
			if (restoreReady && mutationOutcome(error) === "not_delivered") setAccountReadiness(true);
			else setAccountReadiness(false);
			throw error;
		}
	};
	const modelList = (params?: SessionParams<"model/list">) =>
		read("model/list", params, "login-capable");
	const threadStart = (params: SessionParams<"thread/start">) =>
		mutate("thread/start", params, "thread-capable");
	const threadFork = (params: SessionParams<"thread/fork">) =>
		mutate("thread/fork", params, "thread-capable");
	const threadListPage = (params?: SessionParams<"thread/list">) =>
		read("thread/list", params, "thread-capable");
	const threadLoadedListPage = (params?: SessionParams<"thread/loaded/list">) =>
		read("thread/loaded/list", params, "thread-capable");
	const threadRead = (params: SessionParams<"thread/read">) =>
		read("thread/read", params, "thread-capable");
	const threadTurnsListPage = (params: SessionParams<"thread/turns/list">) =>
		read("thread/turns/list", params, "thread-capable");
	const threadItemsListPage = (params: SessionParams<"thread/items/list">) =>
		read("thread/items/list", params, "thread-capable");
	const threadDelete = (params: SessionParams<"thread/delete">) =>
		mutate("thread/delete", params, "thread-capable");
	const threadSettingsUpdate = (params: SessionParams<"thread/settings/update">) =>
		mutate("thread/settings/update", params, "thread-capable");
	const turnStart = (params: SessionParams<"turn/start">) =>
		mutate("turn/start", params, "thread-capable");
	const turnSteer = (params: SessionParams<"turn/steer">) =>
		mutate("turn/steer", params, "thread-capable");
	const turnInterrupt = (params: SessionParams<"turn/interrupt">) =>
		mutate("turn/interrupt", params, "thread-capable");
	const queueAdd = (params: SessionParams<"thread/queue/add">) =>
		mutate("thread/queue/add", params, "thread-capable");
	const queueListPage = (params: SessionParams<"thread/queue/list">) =>
		read("thread/queue/list", params, "thread-capable");
	const queueUpdate = (params: SessionParams<"thread/queue/update">) =>
		mutate("thread/queue/update", params, "thread-capable");
	const queueDelete = (params: SessionParams<"thread/queue/delete">) =>
		mutate("thread/queue/delete", params, "thread-capable");
	const queueReorder = (params: SessionParams<"thread/queue/reorder">) =>
		mutate("thread/queue/reorder", params, "thread-capable");
	const queueStart = (params: SessionParams<"thread/queue/start">) =>
		mutate("thread/queue/start", params, "thread-capable");
	const threadInjectItems = (params: SessionParams<"thread/inject_items">) =>
		mutate("thread/inject_items", params, "thread-capable");
	const realtimeStart = (params: SessionParams<"thread/realtime/start">) =>
		mutate("thread/realtime/start", params, "thread-capable");
	const realtimeAppendText = (params: SessionParams<"thread/realtime/appendText">) =>
		mutate("thread/realtime/appendText", params, "thread-capable");
	const realtimeAppendSpeech = (params: SessionParams<"thread/realtime/appendSpeech">) =>
		mutate("thread/realtime/appendSpeech", params, "thread-capable");
	const realtimeStop = (params: SessionParams<"thread/realtime/stop">) =>
		mutate("thread/realtime/stop", params, "thread-capable");
	const timelineListPage = (params: SessionParams<"thread/timeline/list">) =>
		read("thread/timeline/list", params, "thread-capable");

	return Object.freeze({
		[CODEX_SESSION_CONTROL]: Object.freeze({ onNotification, onServerRequest, dispose }),
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
