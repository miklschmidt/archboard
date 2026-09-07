import {
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
	type ResponsePayloads,
} from "@/runtime/codex-protocol";
import type { CodexTransport } from "@/runtime/codex-transport";
import type { TransportServerRequest } from "@/runtime/codex-transport/server-requests";
import { CodexSessionError, type SessionServerRequest } from "@/runtime/codex-session/lib/contract";
import type { IdentityAuthority } from "@/shared/codex-workbench-identity";

const INVALID_PARAMS_CODE = -32602;

/** What the reverse-request handlers need from the session that owns them. */
interface ReverseRequestContext {
	readonly transport: CodexTransport;
	readonly identity: IdentityAuthority;
	/** The session's clock, so a test can settle `currentTime/read` deterministically. */
	readonly now: () => number;
	/** Whether the session has been disposed, read at each request. */
	readonly isDisposed: () => boolean;
}

/** The reverse requests this session answers, plus the listener that routes them. */
interface ReverseRequestHandlers {
	readonly respondCurrentTime: (
		request: Extract<SessionServerRequest, { method: "currentTime/read" }>,
	) => Promise<void>;
	readonly respondUnsupportedTokenRefresh: (
		request: Extract<SessionServerRequest, { method: "account/chatgptAuthTokens/refresh" }>,
	) => Promise<void>;
	readonly respondUnsupportedAttestation: (
		request: Extract<SessionServerRequest, { method: "attestation/generate" }>,
	) => Promise<void>;
	readonly onServerRequest: (request: TransportServerRequest) => void;
}

/**
 * Check that a reverse request is the one the handler answers and belongs to the current child
 * epoch, so a request left over from a previous child is never answered. Ownership is settled
 * before this point, by the listener that routes only this session's requests here.
 * @param identity - The identity authority for the current child.
 * @param request - The reverse request.
 * @param method - The method the handler answers.
 */
function validateReverseRequest(
	identity: IdentityAuthority,
	request: SessionServerRequest,
	method: SessionServerRequest["method"],
): void {
	if (request.method !== method) {
		throw new CodexSessionError(
			"invalid_request",
			"The reverse request is not owned by this session.",
		);
	}
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
}

/**
 * Check that a `currentTime/read` names a thread identity issued to this child; the clock is
 * answered only for a thread this session could have started.
 * @param identity - The identity authority for the current child.
 * @param request - The clock request.
 */
function validateCurrentThread(
	identity: IdentityAuthority,
	request: Extract<SessionServerRequest, { method: "currentTime/read" }>,
): void {
	const threadId = request.params.threadId;
	if (typeof threadId !== "string" || threadId.length === 0 || threadId.includes("\0")) {
		throw new CodexSessionError(
			"invalid_identity",
			"currentTime/read requires a nonempty current ThreadId.",
		);
	}
	try {
		identity.decoder.parseThreadId(threadId);
	} catch (error) {
		throw new CodexSessionError(
			"invalid_identity",
			"currentTime/read ThreadId is not valid for this child.",
			error,
		);
	}
}

/**
 * Build the handlers for the three reverse requests the app-server may send this session: the
 * clock it answers, and the two authentication requests Archboard refuses by policy.
 * @param context - The transport, identity authority, clock and disposal flag.
 * @returns The handlers and the transport listener that routes to them.
 */
function createReverseRequestHandlers(context: ReverseRequestContext): ReverseRequestHandlers {
	const { transport, identity } = context;

	/**
	 * Answer the app-server's clock request with this session's own time, in whole seconds.
	 * @param request - The clock request.
	 */
	const respondCurrentTime = async (
		request: Extract<SessionServerRequest, { method: "currentTime/read" }>,
	): Promise<void> => {
		validateReverseRequest(identity, request, "currentTime/read");
		validateCurrentThread(identity, request);
		const result: ResponsePayloads["currentTime/read"] = {
			currentTimeAt: Math.floor(context.now() / 1000),
		};
		await transport.respond(request, "codex-session", { result });
	};

	/**
	 * Refuse a ChatGPT token refresh: Archboard signs in on its own and never refreshes tokens
	 * on the app-server's behalf.
	 * @param request - The refresh request.
	 */
	const respondUnsupportedTokenRefresh = async (
		request: Extract<SessionServerRequest, { method: "account/chatgptAuthTokens/refresh" }>,
	): Promise<void> => {
		validateReverseRequest(identity, request, "account/chatgptAuthTokens/refresh");
		await transport.respond(request, "codex-session", { error: UNSUPPORTED_TOKEN_REFRESH_ERROR });
	};

	/**
	 * Refuse an attestation request, which the reviewed session does not implement.
	 * @param request - The attestation request.
	 */
	const respondUnsupportedAttestation = async (
		request: Extract<SessionServerRequest, { method: "attestation/generate" }>,
	): Promise<void> => {
		validateReverseRequest(identity, request, "attestation/generate");
		await transport.respond(request, "codex-session", { error: UNSUPPORTED_ATTESTATION_ERROR });
	};

	/**
	 * Answer a reverse request this session refused with a JSON-RPC error, so the app-server is
	 * not left waiting; a failure to send that error changes nothing and is dropped.
	 * @param request - The refused request.
	 */
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

	/**
	 * Route one server request to the handler that owns it and ignore every request this session
	 * does not own.
	 * @param request - Any server request from the transport.
	 */
	const onServerRequest = (request: TransportServerRequest): void => {
		if (context.isDisposed() || request.owner !== "codex-session") {
			return;
		}
		const operation =
			request.method === "currentTime/read"
				? respondCurrentTime(request)
				: request.method === "account/chatgptAuthTokens/refresh"
					? respondUnsupportedTokenRefresh(request)
					: respondUnsupportedAttestation(request);
		void operation.catch((error: unknown) => {
			if (error instanceof CodexSessionError) {
				respondInvalidReverseRequest(request);
			}
		});
	};

	return Object.freeze({
		respondCurrentTime,
		respondUnsupportedTokenRefresh,
		respondUnsupportedAttestation,
		onServerRequest,
	});
}

export { createReverseRequestHandlers, type ReverseRequestHandlers };
