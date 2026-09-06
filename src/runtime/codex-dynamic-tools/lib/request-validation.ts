import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
	GeneralThreadToolNameSchema,
	parseToolArguments,
} from "@/runtime/codex-thread-tools";
import type { ToolArguments } from "@/runtime/codex-thread-tools";
import { CodexDynamicToolsError } from "@/runtime/codex-dynamic-tools/lib/contract";
import type {
	CodexDynamicToolsOptions,
	DynamicRefusalReason,
	DynamicToolName,
} from "@/runtime/codex-dynamic-tools/lib/contract";

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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
	return (
		Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key)) &&
		keys.every((key) => Object.hasOwn(value, key))
	);
}

function dynamicError(
	code: DynamicRefusalReason,
	message: string,
	cause?: unknown,
): CodexDynamicToolsError {
	return new CodexDynamicToolsError(code, message, cause);
}

function exactCatalogue(catalogue: unknown): void {
	const candidate = catalogue ?? ARCHBOARD_APP_NAMESPACE;
	if (JSON.stringify(candidate) !== JSON.stringify(ARCHBOARD_APP_NAMESPACE)) {
		throw dynamicError("invalid_call", "The archboard_app catalogue is not the reviewed manifest.");
	}
}

function exactString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw dynamicError("invalid_call", `${label} must be a non-empty string.`);
	}
	return value;
}

function correlatedCall(name: DynamicToolName, rawArguments: unknown): ValidatedDynamicCall {
	switch (name) {
		case "create_thread": {
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
		}
		case "fork_thread": {
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
		}
		case "list_threads": {
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
		}
		case "read_thread": {
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
		}
		case "send_message_to_thread": {
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
		}
		case "wait_threads": {
			return Object.freeze({ name, arguments: parseToolArguments(name, rawArguments) });
		}
		default: {
			const exhaustiveName: never = name;
			return exhaustiveName;
		}
	}
}

/**
 * Validate the transport correlation, registered namespace, and strict tool arguments once.
 * @param request Untrusted dynamic request received from the transport.
 * @param options Reviewed dynamic-tool catalogue options.
 * @returns The correlated tool name and validated arguments.
 */
function validateDynamicCall(request: unknown, options: CatalogueOptions): ValidatedDynamicCall {
	try {
		exactCatalogue(options.catalogue);
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		throw dynamicError(
			"invalid_call",
			"The archboard_app catalogue could not be validated.",
			error,
		);
	}
	if (!isRecord(request) || !hasExactKeys(request, DYNAMIC_REQUEST_KEYS)) {
		throw dynamicError("invalid_call", "The dynamic request envelope is not exact.");
	}
	const { correlation } = request;
	if (!isRecord(correlation) || !hasExactKeys(correlation, WIRE_CORRELATION_KEYS)) {
		throw dynamicError("invalid_call", "The dynamic wire correlation is not exact.");
	}
	if (
		request["owner"] !== "codex-dynamic-tools" ||
		request["method"] !== "item/tool/call" ||
		request["child"] !== correlation["child"] ||
		request["epoch"] !== correlation["epoch"] ||
		request["requestId"] !== correlation["requestId"]
	) {
		throw dynamicError("invalid_call", "The dynamic call is not owned by this child epoch.");
	}
	const { params } = request;
	if (!isRecord(params) || !hasExactKeys(params, DYNAMIC_PARAMS_KEYS)) {
		throw dynamicError("invalid_call", "The dynamic call parameters contain an unexpected field.");
	}
	const { logicalCall } = request;
	if (!isRecord(logicalCall) || !hasExactKeys(logicalCall, LOGICAL_CALL_KEYS)) {
		throw dynamicError(
			"invalid_call",
			"The dynamic call correlation contains an unexpected field.",
		);
	}
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
	for (const [value, label] of [
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
	] as const) {
		exactString(value, label);
	}
	if (
		logicalCall["child"] !== request["child"] ||
		logicalCall["epoch"] !== request["epoch"] ||
		logicalCall["namespace"] !== params["namespace"] ||
		logicalCall["tool"] !== params["tool"]
	) {
		throw dynamicError("invalid_call", "The dynamic call correlation is not exact.");
	}
	const parsedName = GeneralThreadToolNameSchema.safeParse(params["tool"]);
	if (!parsedName.success) {
		throw dynamicError(
			"unsupported",
			`The archboard_app tool ${String(params["tool"])} is unsupported.`,
		);
	}
	try {
		return correlatedCall(parsedName.data, params["arguments"]);
	} catch (error) {
		throw dynamicError(
			"invalid_call",
			"The dynamic tool arguments failed the reviewed schema.",
			error,
		);
	}
}

export { validateDynamicCall };
export type { ValidatedDynamicCall };
