import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
	GeneralThreadToolNameSchema,
	parseToolArguments,
} from "@/runtime/codex-thread-tools";
import type { ToolArguments } from "@/runtime/codex-thread-tools";
import { CodexDynamicToolsError } from "@/runtime/codex-dynamic-tools/lib/errors";
import type { CodexDynamicToolsOptions } from "@/runtime/codex-dynamic-tools/lib/contract";
import type {
	DynamicMutationToolName,
	DynamicReadToolName,
	DynamicRefusalReason,
	DynamicToolName,
} from "@/runtime/codex-dynamic-tools/lib/vocabulary";
import { hasExactKeys, isRecord } from "@/runtime/codex-dynamic-tools/lib/value-shape";

const DYNAMIC_PARAMS_KEYS = Object.freeze([
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"arguments",
] as const);
const DYNAMIC_REQUEST_KEYS = Object.freeze([
	"child",
	"epoch",
	"requestId",
	"correlation",
	"method",
	"params",
	"owner",
	"logicalCall",
] as const);
const WIRE_CORRELATION_KEYS = Object.freeze(["child", "epoch", "requestId"] as const);
const LOGICAL_CALL_KEYS = Object.freeze([
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
] as const);

type ValidatedDynamicCall = {
	[Name in DynamicToolName]: {
		readonly name: Name;
		readonly arguments: ToolArguments[Name];
	};
}[DynamicToolName];

type CatalogueOptions = {
	readonly [Key in keyof Pick<CodexDynamicToolsOptions, "catalogue">]?: unknown;
};

type ExactRecord = Readonly<Record<string, unknown>>;

interface ExactEnvelope {
	readonly request: ExactRecord;
	readonly correlation: ExactRecord;
	readonly params: ExactRecord;
	readonly logicalCall: ExactRecord;
}

/**
 * Build a refusal for the request boundary.
 * @param code Refusal reason.
 * @param message Human-readable explanation.
 * @param cause The underlying thrown value, if any.
 * @returns The refusal error.
 */
function dynamicError(
	code: DynamicRefusalReason,
	message: string,
	cause?: unknown,
): CodexDynamicToolsError {
	return new CodexDynamicToolsError(code, message, cause);
}

/**
 * Refuse a catalogue that is not byte-for-byte the reviewed manifest.
 * @param catalogue Catalogue option supplied by the host, if any.
 */
function exactCatalogue(catalogue: unknown): void {
	const candidate = catalogue ?? ARCHBOARD_APP_NAMESPACE;
	if (JSON.stringify(candidate) !== JSON.stringify(ARCHBOARD_APP_NAMESPACE)) {
		throw dynamicError("invalid_call", "The archboard_app catalogue is not the reviewed manifest.");
	}
}

/**
 * Validate the catalogue, converting an unexpected failure into a refusal.
 * @param catalogue Catalogue option supplied by the host, if any.
 */
function assertReviewedCatalogue(catalogue: unknown): void {
	try {
		exactCatalogue(catalogue);
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		throw dynamicError("invalid_call", "The archboard_app catalogue could not be validated.", error);
	}
}

/**
 * Refuse a value that is not a record with exactly the expected keys.
 * @param value Candidate of unknown origin.
 * @param keys The complete expected key list.
 * @param message Refusal message.
 * @returns The value as an exact record.
 */
function exactRecord(value: unknown, keys: readonly string[], message: string): ExactRecord {
	if (!isRecord(value) || !hasExactKeys(value, keys)) {
		throw dynamicError("invalid_call", message);
	}
	return value;
}

/**
 * Refuse a value that is not a non-empty string.
 * @param value Candidate of unknown origin.
 * @param label Field name used in the refusal.
 * @returns The string.
 */
function exactString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw dynamicError("invalid_call", `${label} must be a non-empty string.`);
	}
	return value;
}

/**
 * Split an untrusted request into its four exact records.
 * @param request Untrusted dynamic request received from the transport.
 * @returns The envelope, correlation, params and logical call records.
 */
function exactEnvelope(request: unknown): ExactEnvelope {
	const envelope = exactRecord(
		request,
		DYNAMIC_REQUEST_KEYS,
		"The dynamic request envelope is not exact.",
	);
	const correlation = exactRecord(
		envelope["correlation"],
		WIRE_CORRELATION_KEYS,
		"The dynamic wire correlation is not exact.",
	);
	const params = exactRecord(
		envelope["params"],
		DYNAMIC_PARAMS_KEYS,
		"The dynamic call parameters contain an unexpected field.",
	);
	const logicalCall = exactRecord(
		envelope["logicalCall"],
		LOGICAL_CALL_KEYS,
		"The dynamic call correlation contains an unexpected field.",
	);
	return { request: envelope, correlation, params, logicalCall };
}

/**
 * Refuse a request whose owner, method, or wire correlation does not name
 * this child epoch.
 * @param envelope The exact request records.
 */
function assertWireOwnership(envelope: ExactEnvelope): void {
	const { request, correlation } = envelope;
	if (
		request["owner"] !== "codex-dynamic-tools" ||
		request["method"] !== "item/tool/call" ||
		request["child"] !== correlation["child"] ||
		request["epoch"] !== correlation["epoch"] ||
		request["requestId"] !== correlation["requestId"]
	) {
		throw dynamicError("invalid_call", "The dynamic call is not owned by this child epoch.");
	}
}

/**
 * Refuse a call outside the reviewed namespace and manifest, or whose logical
 * tool differs from its parameters.
 * @param envelope The exact request records.
 */
function assertReviewedManifest(envelope: ExactEnvelope): void {
	const { params, logicalCall } = envelope;
	if (params["namespace"] !== ARCHBOARD_APP_NAMESPACE.name) {
		throw dynamicError("invalid_call", "The dynamic call namespace is not archboard_app.");
	}
	if (logicalCall["namespace"] !== ARCHBOARD_APP_NAMESPACE.name) {
		throw dynamicError("invalid_call", "The logical call namespace is not archboard_app.");
	}
	if (logicalCall["manifestHash"] !== ARCHBOARD_APP_MANIFEST_SHA256) {
		throw dynamicError("invalid_call", "The dynamic call manifest hash is not the reviewed hash.");
	}
	if (logicalCall["tool"] !== params["tool"]) {
		throw dynamicError("invalid_call", "The logical call tool does not match its parameters.");
	}
}

/**
 * Refuse any identity field that is not a non-empty string.
 * @param envelope The exact request records.
 */
function assertIdentityStrings(envelope: ExactEnvelope): void {
	const { request, correlation, params, logicalCall } = envelope;
	const fields: readonly (readonly [unknown, string])[] = [
		[request["child"], "child"],
		[request["epoch"], "epoch"],
		[request["requestId"], "requestId"],
		[correlation["child"], "correlation child"],
		[correlation["epoch"], "correlation epoch"],
		[correlation["requestId"], "correlation requestId"],
		[params["threadId"], "threadId"],
		[params["turnId"], "turnId"],
		[params["callId"], "callId"],
		[params["tool"], "tool"],
		[logicalCall["child"], "logical child"],
		[logicalCall["epoch"], "logical epoch"],
		[logicalCall["threadId"], "logical threadId"],
		[logicalCall["turnId"], "logical turnId"],
		[logicalCall["callId"], "logical callId"],
	];
	for (const [value, label] of fields) {
		exactString(value, label);
	}
}

/**
 * Refuse a logical call whose child, epoch or tool differs from the wire
 * request and parameters.
 * @param envelope The exact request records.
 */
function assertLogicalCorrelation(envelope: ExactEnvelope): void {
	const { request, params, logicalCall } = envelope;
	if (
		logicalCall["child"] !== request["child"] ||
		logicalCall["epoch"] !== request["epoch"] ||
		logicalCall["tool"] !== params["tool"]
	) {
		throw dynamicError("invalid_call", "The dynamic call correlation is not exact.");
	}
}

/**
 * Narrow the tool field to a reviewed tool name.
 * @param tool Tool field of the parameters.
 * @returns The tool name.
 */
function reviewedToolName(tool: unknown): DynamicToolName {
	const parsedName = GeneralThreadToolNameSchema.safeParse(tool);
	if (!parsedName.success) {
		throw dynamicError("unsupported", `The archboard_app tool ${String(tool)} is unsupported.`);
	}
	return parsedName.data;
}

/**
 * Parse mutation arguments so the name and arguments narrow together.
 * @param name Mutation tool name.
 * @param rawArguments Untrusted arguments.
 * @returns The correlated call.
 */
function correlatedMutationCall(
	name: DynamicMutationToolName,
	rawArguments: unknown,
): ValidatedDynamicCall {
	switch (name) {
		case "create_thread":
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
		case "fork_thread":
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
		case "send_message_to_thread":
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
	}
}

/**
 * Parse read or wait arguments so the name and arguments narrow together.
 * @param name Read or wait tool name.
 * @param rawArguments Untrusted arguments.
 * @returns The correlated call.
 */
function correlatedObservationCall(
	name: DynamicReadToolName | "wait_threads",
	rawArguments: unknown,
): ValidatedDynamicCall {
	switch (name) {
		case "list_threads":
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
		case "read_thread":
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
		case "wait_threads":
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
	}
}

/**
 * Parse the arguments of a call through the tool's reviewed schema.
 * @param name Tool name.
 * @param rawArguments Untrusted arguments.
 * @returns The correlated call.
 */
function correlatedCall(name: DynamicToolName, rawArguments: unknown): ValidatedDynamicCall {
	switch (name) {
		case "create_thread":
		case "fork_thread":
		case "send_message_to_thread":
			return correlatedMutationCall(name, rawArguments);
		default:
			return correlatedObservationCall(name, rawArguments);
	}
}

/**
 * Validate the transport correlation, registered namespace, and strict tool arguments once.
 * @param request Untrusted dynamic request received from the transport.
 * @param options Reviewed dynamic-tool catalogue options.
 * @returns The correlated tool name and validated arguments.
 */
function validateDynamicCall(request: unknown, options: CatalogueOptions): ValidatedDynamicCall {
	assertReviewedCatalogue(options.catalogue);
	const envelope = exactEnvelope(request);
	assertWireOwnership(envelope);
	assertReviewedManifest(envelope);
	assertIdentityStrings(envelope);
	assertLogicalCorrelation(envelope);
	const name = reviewedToolName(envelope.params["tool"]);
	try {
		return correlatedCall(name, envelope.params["arguments"]);
	} catch (error) {
		throw dynamicError("invalid_call", "The dynamic tool arguments failed the reviewed schema.", error);
	}
}

export { validateDynamicCall };
export type { ValidatedDynamicCall };
