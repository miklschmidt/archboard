import {
	decodeClientRequestParams,
	decodeResponse,
	INITIALIZE_CAPABILITIES,
	InitializeCapabilitiesSchema,
	type ClientRequestParams,
	type ResponsePayloads,
} from "@/runtime/codex-protocol";
import type { CodexTransport, CodexTransportResponse } from "@/runtime/codex-transport";
import type { TransportServerNotification } from "@/runtime/codex-transport/server-requests";
import {
	CodexSessionError,
	CodexSessionMutationError,
	CODEX_SESSION_CONTROL,
	type ControlledCodexSession,
	type CodexSessionOptions,
} from "@/runtime/codex-session/lib/contract";
import {
	createRequestParamsSerializer,
	type OutboundMethod,
} from "@/runtime/codex-session/lib/request-identities";
import {
	adoptSessionResponse,
	type SessionResponsePayloads,
} from "@/runtime/codex-session/lib/results";
import { createReverseRequestHandlers } from "@/runtime/codex-session/lib/reverse-requests";
import { mutationFailure } from "@/runtime/codex-session/lib/session-failures";
import {
	createSessionOperations,
	type SessionGate,
} from "@/runtime/codex-session/lib/session-operations";
import { proveCodexStorage } from "@/runtime/codex-session/lib/storage-proof";

const CLIENT_INFO = Object.freeze({
	name: "archboard",
	title: "archboard canvas",
	version: "0.1.0",
});
const INITIALIZE_OPTIONS = Object.freeze({ idempotent: false, retryEligible: false });
const READ_OPTIONS = Object.freeze({ idempotent: true, retryEligible: false });
const MUTATION_OPTIONS = Object.freeze({ idempotent: false, retryEligible: false });

/**
 * How far this session has got. Every phase before `login-capable` is part of initialization, and
 * `failed` is terminal: a failed session is replaced, never retried.
 */
type SessionPhase =
	| "transport-connected"
	| "initializing"
	| "initialize-accepted"
	| "initialized-written"
	| "login-capable"
	| "thread-capable"
	| "failed";

/** The request options one call is sent with, which say whether it may be retried. */
type RequestOptions = typeof READ_OPTIONS | typeof MUTATION_OPTIONS | typeof INITIALIZE_OPTIONS;

/**
 * The initialize parameters Archboard sends, built from the authored capability policy inside
 * the session so the public wire decoder still checks what this session asked for.
 * @returns The initialize parameters.
 */
function authoredSessionInitializeParams(): ClientRequestParams<"initialize"> {
	return {
		clientInfo: CLIENT_INFO,
		capabilities: InitializeCapabilitiesSchema.parse(INITIALIZE_CAPABILITIES),
	};
}

/**
 * Turn a transport failure on a mutation into a mutation error that states the outcome, and
 * leave a read's failure as it is.
 * @param method - The method that failed.
 * @param error - The thrown value.
 * @param mutation - Whether the call was a mutation.
 */
function rethrowRequestFailure(method: string, error: unknown, mutation: boolean): never {
	throw mutation ? mutationFailure(method, error) : error;
}

/**
 * Build the one Codex app-server session Archboard holds: it owns initialization and the storage
 * proof, gates every call on how far initialization got, proves each request's identities against
 * the current child, and reports a failed mutation as delivered, not delivered, or unknown.
 * @param options - The transport, identity authority, storage paths, lifecycle callbacks,
 * notification sink and clock this session runs on.
 * @returns The session, together with the control channel its owner drives it through.
 */
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
	const serializeRequestParams = createRequestParamsSerializer(identity);

	/**
	 * Adopt what the account says about readiness, keeping the phase and the account flag in step
	 * unless initialization already failed.
	 * @param ready - Whether thread operations are allowed.
	 */
	const setAccountReadiness = (ready: boolean): void => {
		accountReady = ready;
		if (phase !== "failed") {
			phase = ready ? "thread-capable" : "login-capable";
		}
	};

	/**
	 * Hand one notification to the consumer. A consumer that throws is ignored, because this
	 * session, not its consumer, owns the decoded event boundary.
	 * @param event - The decoded notification.
	 */
	const deliverNotification = (event: TransportServerNotification): void => {
		if (!notificationSink) {
			return;
		}
		try {
			notificationSink(event);
		} catch {
			/* A consumer cannot change the session's decoded event boundary. */
		}
	};

	/**
	 * Take one notification from the transport, buffering it until initialization has finished so
	 * a consumer never sees an event from a session that is not yet usable.
	 * @param event - The decoded notification.
	 */
	const onNotification = (event: TransportServerNotification): void => {
		if (disposed || notificationsStopped) {
			return;
		}
		if (!notificationsPublished || publishingNotifications) {
			bufferedNotifications.push(event);
			return;
		}
		deliverNotification(event);
	};

	/**
	 * Open the notification channel and drain what initialization buffered, in arrival order.
	 */
	const publishNotifications = (): void => {
		notificationsPublished = true;
		publishingNotifications = true;
		while (bufferedNotifications.length > 0) {
			const event = bufferedNotifications.shift();
			if (event !== undefined) {
				deliverNotification(event);
			}
		}
		publishingNotifications = false;
	};

	/**
	 * Refuse a call the session is not far enough along to make, naming which of the two reasons
	 * it is: initialization has not finished, or the account is not ready for thread work.
	 * @param gate - The readiness the call requires.
	 */
	const requireGate = (gate: SessionGate): void => {
		if (phase === "failed") {
			throw new CodexSessionError(
				"not_initialized",
				"The Codex session failed during initialization and must be replaced.",
			);
		}
		if (phase !== "login-capable" && phase !== "thread-capable") {
			throw new CodexSessionError(
				"not_initialized",
				"The Codex session has not completed initialization and storage proof.",
			);
		}
		if (gate === "thread-capable" && !accountReady) {
			throw new CodexSessionError(
				"not_account_ready",
				"The Codex account is not ready for thread operations.",
			);
		}
	};

	/**
	 * Prove that a response came back from the child epoch the request was sent to; a mutation
	 * whose correlation cannot be trusted has an unknown outcome, because it may have happened.
	 * @param method - The method that answered.
	 * @param response - The transport response.
	 * @param mutation - Whether the call was a mutation.
	 */
	const assertResponseEpoch = (
		method: OutboundMethod,
		response: CodexTransportResponse<OutboundMethod>,
		mutation: boolean,
	): void => {
		try {
			identity.validator.assertCurrentEpoch(response.correlation.child, response.correlation.epoch);
		} catch (error) {
			const failure = new CodexSessionError(
				"invalid_identity",
				`Codex response ${method} is not from the current child epoch.`,
				error,
			);
			if (mutation) {
				throw new CodexSessionMutationError(
					method,
					"outcome_unknown",
					`Codex mutation ${method} returned with an invalid child correlation.`,
					failure,
				);
			}
			throw failure;
		}
	};

	/**
	 * Adopt the identities a decoded response carries as issued to this child. A mutation whose
	 * identities cannot be trusted has an unknown outcome for the same reason as a bad epoch.
	 * @param method - The method that answered.
	 * @param decoded - The decoded response payload.
	 * @param mutation - Whether the call was a mutation.
	 * @returns The response with its identities adopted.
	 */
	const adoptResponse = <Method extends OutboundMethod>(
		method: Method,
		decoded: ResponsePayloads[Method],
		mutation: boolean,
	): SessionResponsePayloads[Method] => {
		try {
			return adoptSessionResponse(method, decoded, identity.decoder);
		} catch (error) {
			const failure = new CodexSessionError(
				"invalid_identity",
				`Codex response ${method} contains an invalid server identity.`,
				error,
			);
			if (mutation) {
				throw new CodexSessionMutationError(
					method,
					"outcome_unknown",
					`Codex mutation ${method} returned identities that could not be trusted.`,
					failure,
				);
			}
			throw failure;
		}
	};

	/**
	 * Send one request and return its decoded, identity-adopted result. This is the single path
	 * every session call takes, so each failure point states the same thing about delivery.
	 * @param method - The protocol method.
	 * @param params - The caller's parameters.
	 * @param requestOptions - Whether the call is idempotent or retry-eligible.
	 * @param mutation - Whether a failure must be reported as a mutation outcome.
	 * @returns The decoded response.
	 */
	const requestDecoded = async <Method extends OutboundMethod>(
		method: Method,
		params: unknown,
		requestOptions: RequestOptions,
		mutation: boolean,
	): Promise<SessionResponsePayloads[Method]> => {
		let decodedParams: ClientRequestParams<Method>;
		try {
			decodedParams = decodeClientRequestParams(method, serializeRequestParams(method, params));
		} catch (error) {
			if (mutation) {
				throw new CodexSessionMutationError(
					method,
					"not_delivered",
					`Codex mutation ${method} was rejected before delivery.`,
					error,
				);
			}
			throw error;
		}
		let response: CodexTransportResponse<Method>;
		try {
			response = await transport.request(method, decodedParams, requestOptions);
		} catch (error) {
			return rethrowRequestFailure(method, error, mutation);
		}
		assertResponseEpoch(method, response, mutation);
		let decoded: ResponsePayloads[Method];
		try {
			decoded = decodeResponse(method, response.result);
		} catch (error) {
			return rethrowRequestFailure(method, error, mutation);
		}
		return adoptResponse(method, decoded, mutation);
	};

	/**
	 * Make one read: gate it, send it, and let its failure travel as it is. Asynchronous even
	 * where it only throws, so a closed gate reaches the caller as a rejection like every other
	 * failure rather than as a synchronous throw.
	 * @param method - The protocol method.
	 * @param params - The caller's parameters.
	 * @param gate - The readiness the read requires.
	 * @returns The decoded response.
	 */
	const read = async <Method extends OutboundMethod>(
		method: Method,
		params: unknown,
		gate: SessionGate,
	): Promise<SessionResponsePayloads[Method]> => {
		requireGate(gate);
		return requestDecoded(method, params, READ_OPTIONS, false);
	};

	/**
	 * Make one mutation: gate it, prepare its parameters, send it, and report every failure as a
	 * mutation error so the caller always learns what happened to the remote effect.
	 * @param method - The protocol method.
	 * @param params - The caller's parameters.
	 * @param gate - The readiness the mutation requires, if any.
	 * @param prepare - A last check on the parameters before they are sent.
	 * @returns The decoded response.
	 */
	const mutate = async <Method extends OutboundMethod>(
		method: Method,
		params: unknown,
		gate: SessionGate | undefined,
		prepare: (value: unknown) => unknown = (value) => value,
	): Promise<SessionResponsePayloads[Method]> => {
		try {
			if (gate !== undefined) {
				requireGate(gate);
			}
			return await requestDecoded(method, prepare(params), MUTATION_OPTIONS, true);
		} catch (error) {
			if (error instanceof CodexSessionMutationError) {
				throw error;
			}
			throw mutationFailure(method, error);
		}
	};

	const reverseRequests = createReverseRequestHandlers({
		transport,
		identity,
		now,
		/**
		 * Whether this session has been disposed.
		 * @returns True once dispose has run.
		 */
		isDisposed: () => disposed,
	});

	/**
	 * Stop this session for good: no further notification is published, nothing buffered is
	 * delivered, and every transport listener it installed is removed in reverse order.
	 */
	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		notificationsStopped = true;
		bufferedNotifications.length = 0;
		for (const unsubscribe of unsubscribers.splice(0).toReversed()) {
			unsubscribe();
		}
	};

	if ((options.listenerOwnership ?? "self") === "self") {
		unsubscribers.push(transport.onServerNotification(onNotification));
		unsubscribers.push(transport.onServerRequest(reverseRequests.onServerRequest));
	}

	/**
	 * Run the app-server handshake exactly once: initialize, write `initialized`, read the config
	 * requirements and config, and prove that the child is using Archboard's own storage before
	 * any call is allowed out. A failure here is terminal for the session.
	 * @returns The initialize result.
	 */
	const initialize = async (): Promise<SessionResponsePayloads["initialize"]> => {
		if (phase !== "transport-connected") {
			throw new CodexSessionError(
				"already_initialized",
				"This Codex session has already started initialization and cannot be initialized again.",
			);
		}
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

	const operations = createSessionOperations({
		read,
		mutate,
		setAccountReadiness,
		/**
		 * Whether thread operations are open right now.
		 * @returns True while the account is ready and the session is thread-capable.
		 */
		isThreadReady: () => accountReady && phase === "thread-capable",
		lifecycle,
	});

	return Object.freeze({
		[CODEX_SESSION_CONTROL]: Object.freeze({
			onNotification,
			onServerRequest: reverseRequests.onServerRequest,
			dispose,
		}),
		initialize,
		...operations,
		respondCurrentTime: reverseRequests.respondCurrentTime,
		respondUnsupportedTokenRefresh: reverseRequests.respondUnsupportedTokenRefresh,
		respondUnsupportedAttestation: reverseRequests.respondUnsupportedAttestation,
	});
}
