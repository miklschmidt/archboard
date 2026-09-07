import {
	isClientRequestMethodWithoutParams,
	type ClientRequestMethod,
	type ClientRequestParams,
	type ResponseMethod,
} from "@/runtime/codex-protocol";
import { CodexSessionError } from "@/runtime/codex-session/lib/contract";
import {
	SESSION_PROTOCOL_METHODS,
	type SessionRequestIdentityField,
} from "@/runtime/codex-session/lib/results";
import { requestParams } from "@/runtime/codex-session/lib/session-failures";
import type { IdentityAuthority } from "@/shared/codex-workbench-identity";

/** The methods this session sends and reads an answer to. */
type OutboundMethod = Extract<ClientRequestMethod, ResponseMethod>;

/**
 * Build the per-field serializers that turn a caller's identity value into the wire text Codex
 * expects. Each one parses the value as an identity issued to this child first, so an identity
 * from another child or epoch never reaches the wire.
 * @param identity - The identity authority for the current child.
 * @returns One serializer per request identity field the protocol declares.
 */
function createIdentitySerializers(
	identity: IdentityAuthority,
): Record<SessionRequestIdentityField, (value: unknown) => unknown> {
	const { decoder } = identity;
	/**
	 * Serialize one issued thread identity.
	 * @param value - The caller's value.
	 * @returns Its wire text.
	 */
	const threadId = (value: unknown): unknown =>
		decoder.serializeCodexIdentity(decoder.parseThreadId(value));
	/**
	 * Serialize one issued turn identity.
	 * @param value - The caller's value.
	 * @returns Its wire text.
	 */
	const turnId = (value: unknown): unknown =>
		decoder.serializeCodexIdentity(decoder.parseTurnId(value));
	/**
	 * Serialize one issued queued-submission identity.
	 * @param value - The caller's value.
	 * @returns Its wire text.
	 */
	const queuedSubmissionId = (value: unknown): unknown =>
		decoder.serializeCodexIdentity(decoder.parseQueuedSubmissionId(value));
	return {
		threadId,
		parentThreadId: threadId,
		ancestorThreadId: threadId,
		turnId,
		lastTurnId: turnId,
		beforeTurnId: turnId,
		expectedTurnId: turnId,
		queuedSubmissionId,
		/**
		 * Serialize a list of issued queued-submission identities, refusing a non-list outright so
		 * a reorder never sends a partially trusted order.
		 * @param value - The caller's value.
		 * @returns The wire text of every entry.
		 */
		queuedSubmissionIds: (value: unknown): unknown => {
			if (!Array.isArray(value)) {
				throw new TypeError("queuedSubmissionIds must be an array of issued identities.");
			}
			return value.map((candidate) => queuedSubmissionId(candidate));
		},
		/**
		 * Serialize one issued login identity.
		 * @param value - The caller's value.
		 * @returns Its wire text.
		 */
		loginId: (value: unknown): unknown =>
			decoder.serializeCodexIdentity(decoder.parseLoginId(value)),
		/**
		 * Accept a realtime session identity, which Codex names rather than Archboard issues.
		 * @param value - The caller's value.
		 * @returns The parsed identity.
		 */
		realtimeSessionId: (value: unknown): unknown => decoder.parseRealtimeSessionId(value),
	};
}

/**
 * Build the step that rewrites a request's identity-bearing fields before the wire decoder runs.
 * It exists so every outbound request proves its identities against this child in one place,
 * rather than each session method remembering which of its fields carry identities.
 * @param identity - The identity authority for the current child.
 * @returns The serializer for one method's parameters.
 */
function createRequestParamsSerializer(
	identity: IdentityAuthority,
): <Method extends OutboundMethod>(method: Method, value: unknown) => ClientRequestParams<Method> {
	const serializers = createIdentitySerializers(identity);
	/**
	 * Serialize one identity field, reporting a value that is not an issued identity as such
	 * rather than letting the decoder report a shape failure.
	 * @param field - The field being serialized.
	 * @param value - Its value, which may be absent.
	 * @returns The wire value, or the absent value unchanged.
	 */
	const serializeIdentityField = (field: SessionRequestIdentityField, value: unknown): unknown => {
		if (value === undefined || value === null) {
			return value;
		}
		try {
			return serializers[field](value);
		} catch (error) {
			throw new CodexSessionError(
				"invalid_identity",
				`Codex request field ${field} is not an issued identity for this child.`,
				error,
			);
		}
	};
	return <Method extends OutboundMethod>(
		method: Method,
		value: unknown,
	): ClientRequestParams<Method> => {
		if (isClientRequestMethodWithoutParams(method)) {
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a method the protocol declares as taking no parameters has `undefined` for its parameter type, and the caller passes nothing; there is no object here to narrow
			return value as ClientRequestParams<Method>;
		}
		const params = requestParams(value);
		const serialized = Object.fromEntries(
			Object.entries(params).filter(([, fieldValue]) => fieldValue !== undefined),
		);
		for (const field of SESSION_PROTOCOL_METHODS[method].requestIdentities) {
			if (Object.hasOwn(serialized, field)) {
				serialized[field] = serializeIdentityField(field, serialized[field]);
			}
		}
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fields were copied from the caller's object and only identity fields were rewritten, so the shape is unchanged; the wire decoder immediately afterwards is what proves it against the method's schema
		return serialized as ClientRequestParams<Method>;
	};
}

export { createRequestParamsSerializer, type OutboundMethod };
