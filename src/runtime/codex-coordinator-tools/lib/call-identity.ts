import {
	ARCHBOARD_VOICE_MANIFEST_SHA256,
	ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	COORDINATOR_NAMESPACE_NAMES,
	type NamespaceName,
} from "@/runtime/codex-coordinator-tool-contract";
import {
	COORDINATOR_TOOLS_OWNER,
	type CodexCoordinatorToolsOptions,
} from "@/runtime/codex-coordinator-tools/lib/contract";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import type { LogicalToolCallCorrelation } from "@/shared/codex-workbench-identity";
import { IdentityValidationError } from "@/shared/codex-workbench-identity";
import { z } from "zod";

class CoordinatorToolValidationError extends Error {
	override readonly name = "CoordinatorToolValidationError";
	readonly reason:
		| "invalid_call"
		| "not_ready"
		| "stale_child"
		| "prior_epoch"
		| "unknown_provenance"
		| "not_loaded"
		| "not_controllable"
		| "system_error"
		| "busy";

	/**
	 * Build a validation failure that carries the dynamic-tool refusal reason to report.
	 * @param reason - The refusal reason the response will name.
	 * @param message - The diagnostic for the caller.
	 * @param cause - The underlying failure, when there is one.
	 */
	constructor(reason: CoordinatorToolValidationError["reason"], message: string, cause?: unknown) {
		super(message, { cause });
		this.reason = reason;
	}
}

/**
 * Throw a validation failure; exists so each check reads as one line.
 * @param reason - The refusal reason the response will name.
 * @param message - The diagnostic for the caller.
 * @param cause - The underlying failure, when there is one.
 */
function fail(
	reason: CoordinatorToolValidationError["reason"],
	message: string,
	cause?: unknown,
): never {
	throw new CoordinatorToolValidationError(reason, message, cause);
}

const LOGICAL_CALL_FIELDS = [
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
] as const satisfies readonly (keyof LogicalToolCallCorrelation)[];

/**
 * Compare two logical call correlations field by field.
 * @param left - One correlation.
 * @param right - The other correlation.
 * @returns Whether every field matches.
 */
function sameCall(left: LogicalToolCallCorrelation, right: LogicalToolCallCorrelation): boolean {
	return LOGICAL_CALL_FIELDS.every((field) => left[field] === right[field]);
}

interface IdentityRefusal {
	readonly reason: CoordinatorToolValidationError["reason"];
	readonly message: string;
}

const IDENTITY_REFUSALS: Readonly<
	Partial<Record<IdentityValidationError["code"], IdentityRefusal>>
> = Object.freeze({
	"wrong-child": {
		reason: "stale_child",
		message: "The coordinator tool call belongs to another Codex child.",
	},
	"stale-epoch": {
		reason: "prior_epoch",
		message: "The coordinator tool call belongs to a prior child epoch.",
	},
	"wrong-domain": {
		reason: "unknown_provenance",
		message: "The coordinator tool call contains an identity from the wrong domain.",
	},
});

/**
 * Translate an identity-authority failure into the refusal reason the coordinator reports.
 * @param error - Whatever the identity authority threw.
 * @returns The validation failure to throw, carrying the original as its cause.
 */
function mapIdentityFailure(error: unknown): CoordinatorToolValidationError {
	const refusal =
		error instanceof IdentityValidationError ? IDENTITY_REFUSALS[error.code] : undefined;
	if (refusal !== undefined) {
		return new CoordinatorToolValidationError(refusal.reason, refusal.message, error);
	}
	return new CoordinatorToolValidationError(
		"invalid_call",
		"The coordinator tool call identity is not a current issued correlation.",
		error,
	);
}

/**
 * Rethrow a validation failure as-is and wrap any other error as an identity failure.
 * @param error - Whatever a check threw.
 */
function rethrowAsIdentityFailure(error: unknown): never {
	if (error instanceof CoordinatorToolValidationError) {
		throw error;
	}
	throw mapIdentityFailure(error);
}

/**
 * Check that the wire request is internally consistent before any identity is trusted.
 * @param request - The dynamic request from the transport.
 */
function assertWireShape(request: DynamicServerRequest): void {
	if (request.owner !== COORDINATOR_TOOLS_OWNER) {
		fail(
			"invalid_call",
			"Only coordinator-owned item/tool/call requests may enter this dispatcher.",
		);
	}
	if (request.correlation.requestId !== request.requestId) {
		fail("invalid_call", "The dynamic request and wire correlation use different request ids.");
	}
	if (request.correlation.child !== request.child || request.correlation.epoch !== request.epoch) {
		fail("invalid_call", "The dynamic request correlation is not internally consistent.");
	}
}

/**
 * Check that the wire correlation decodes to the request's own child, epoch and request id.
 * @param options - The dispatcher options carrying the identity authority.
 * @param request - The dynamic request from the transport.
 */
function assertWireCorrelation(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): void {
	try {
		const correlation = options.identity.decoder.parseWireRequestCorrelation(request.correlation);
		if (
			correlation.child !== request.child ||
			correlation.epoch !== request.epoch ||
			correlation.requestId !== request.requestId
		) {
			fail("invalid_call", "The dynamic wire correlation is not internally consistent.");
		}
	} catch (error) {
		rethrowAsIdentityFailure(error);
	}
}

/**
 * Check the request envelope: owner, internal consistency, current epoch and wire correlation.
 * @param options - The dispatcher options carrying the identity authority.
 * @param request - The dynamic request from the transport.
 */
function assertRequestEnvelope(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): void {
	assertWireShape(request);
	try {
		options.identity.validator.assertCurrentEpoch(request.child, request.epoch);
	} catch (error) {
		throw mapIdentityFailure(error);
	}
	assertWireCorrelation(options, request);
}

/**
 * Check that the logical call's issued identities are the ones the app-server named in its
 * tool-call parameters.
 * @param options - The dispatcher options carrying the identity authority.
 * @param call - The decoded logical call.
 * @param request - The dynamic request from the transport.
 */
function assertCallIdentitiesMatchParams(
	options: CodexCoordinatorToolsOptions,
	call: LogicalToolCallCorrelation,
	request: DynamicServerRequest,
): void {
	const { serializeCodexIdentity } = options.identity.decoder;
	try {
		if (serializeCodexIdentity(call.threadId) !== request.params.threadId) {
			fail(
				"unknown_provenance",
				"The caller thread identity is not the issued logical-call target.",
			);
		}
		if (serializeCodexIdentity(call.turnId) !== request.params.turnId) {
			fail("unknown_provenance", "The caller turn identity is not the issued logical-call target.");
		}
		if (serializeCodexIdentity(call.callId) !== request.params.callId) {
			fail("unknown_provenance", "The dynamic call identity is not the issued logical-call id.");
		}
	} catch (error) {
		rethrowAsIdentityFailure(error);
	}
}

const MANIFEST_HASHES: Readonly<Record<NamespaceName, string>> = Object.freeze({
	archboard_workhorse: ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	archboard_voice: ARCHBOARD_VOICE_MANIFEST_SHA256,
});

const NamespaceNameSchema = z.enum(COORDINATOR_NAMESPACE_NAMES);

/**
 * Check that the call names a reviewed namespace with that namespace's reviewed manifest hash.
 * @param call - The decoded logical call.
 */
function assertReviewedManifest(call: LogicalToolCallCorrelation): void {
	const namespace = NamespaceNameSchema.safeParse(call.namespace);
	const expectedHash = namespace.success ? MANIFEST_HASHES[namespace.data] : null;
	if (expectedHash === null || call.manifestHash !== expectedHash) {
		fail("invalid_call", "The dynamic call does not carry the reviewed namespace manifest hash.");
	}
}

/**
 * Decode the logical call the app-server attached, mapping an identity failure to its refusal.
 * @param options - The dispatcher options carrying the identity authority.
 * @param request - The dynamic request from the transport.
 * @returns The decoded logical call.
 */
function parseLogicalCall(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): LogicalToolCallCorrelation {
	try {
		return options.identity.decoder.parseLogicalToolCallCorrelation(request.logicalCall);
	} catch (error) {
		throw mapIdentityFailure(error);
	}
}

/**
 * Check that the logical call belongs to the request's epoch and names the same namespace and
 * tool as the app-server's tool-call fields.
 * @param call - The decoded logical call.
 * @param request - The dynamic request from the transport.
 */
function assertCallMatchesRequest(
	call: LogicalToolCallCorrelation,
	request: DynamicServerRequest,
): void {
	if (call.child !== request.child || call.epoch !== request.epoch) {
		fail("invalid_call", "The logical call does not belong to the dynamic request epoch.");
	}
	if (typeof request.params.namespace !== "string") {
		fail("invalid_call", "The dynamic tool namespace must be present.");
	}
	if (call.namespace !== request.params.namespace || call.tool !== request.params.tool) {
		fail("invalid_call", "The logical call does not match the app-server tool-call fields.");
	}
}

/**
 * Decode the logical call and check that it belongs to this request, matches the app-server's
 * tool-call fields, carries the reviewed manifest hash and is the call the host is executing now.
 * @param options - The dispatcher options carrying the identity and host authorities.
 * @param request - The dynamic request from the transport.
 * @returns The decoded logical call.
 */
function assertLogicalCall(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): LogicalToolCallCorrelation {
	const call = parseLogicalCall(options, request);
	assertCallMatchesRequest(call, request);
	assertCallIdentitiesMatchParams(options, call, request);
	assertReviewedManifest(call);
	const current = options.authority.currentCall();
	if (current === null || !sameCall(current, call)) {
		fail("invalid_call", "The coordinator call is no longer the current executing call.");
	}
	return call;
}

export {
	CoordinatorToolValidationError,
	fail,
	mapIdentityFailure,
	assertRequestEnvelope,
	assertLogicalCall,
};
