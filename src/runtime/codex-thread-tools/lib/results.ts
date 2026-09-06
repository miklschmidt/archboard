import { z } from "zod";

import {
	CodexThreadStatusTypeSchema,
	CodexTurnStatusSchema,
} from "@/shared/codex-app-server-contract";

import {
	GeneralThreadToolNameSchema,
	type GeneralThreadToolName,
} from "@/runtime/codex-thread-tools/lib/manifest";
import { parseStrictJson } from "@/runtime/codex-thread-tools/lib/json";
import {
	boundedText,
	boundedUtf8Text,
	nullableUtf8Text,
} from "@/runtime/codex-thread-tools/lib/limits";

const IdentitySchema = boundedText(128);
const CursorSchema = boundedUtf8Text(1024);
const ReasonSchema = nullableUtf8Text(512);

export const ToolDeliverySchema = z.enum(["delivered", "not_delivered", "outcome_unknown"]);

const DeliveredInitialTurnSchema = z.strictObject({
	delivery: z.literal("delivered"),
	turnId: IdentitySchema,
	operationId: IdentitySchema,
	reason: z.null(),
});

const NotDeliveredInitialTurnSchema = z.strictObject({
	delivery: z.literal("not_delivered"),
	turnId: z.null(),
	operationId: IdentitySchema,
	reason: ReasonSchema,
});

const OutcomeUnknownInitialTurnSchema = z.strictObject({
	delivery: z.literal("outcome_unknown"),
	turnId: z.null(),
	operationId: IdentitySchema,
	reason: ReasonSchema,
});

const NotRequestedInitialTurnSchema = z.strictObject({
	delivery: z.literal("not_requested"),
	turnId: z.null(),
	operationId: z.null(),
	reason: z.null(),
});

const CreateThreadValueSchema = z.union([
	z.strictObject({
		threadId: IdentitySchema,
		state: z.literal("executable"),
		initialTurn: z.discriminatedUnion("delivery", [
			DeliveredInitialTurnSchema,
			NotDeliveredInitialTurnSchema,
		]),
	}),
	z.strictObject({
		threadId: IdentitySchema,
		state: z.literal("inspect_only"),
		initialTurn: OutcomeUnknownInitialTurnSchema,
	}),
]);

const ForkThreadValueSchema = z.union([
	z.strictObject({
		threadId: IdentitySchema,
		state: z.literal("executable"),
		initialTurn: z.discriminatedUnion("delivery", [
			NotRequestedInitialTurnSchema,
			DeliveredInitialTurnSchema,
			NotDeliveredInitialTurnSchema,
		]),
	}),
	z.strictObject({
		threadId: IdentitySchema,
		state: z.literal("inspect_only"),
		initialTurn: OutcomeUnknownInitialTurnSchema,
	}),
]);

const ListedThreadSchema = z.strictObject({
	threadId: IdentitySchema,
	title: nullableUtf8Text(512),
	status: CodexThreadStatusTypeSchema,
	source: z.enum(["cli", "vscode", "exec", "appServer"]),
	epoch: z.enum(["current", "prior", "unknown"]),
	ownership: z.enum(["created", "attached", "foreign"]),
	loaded: z.boolean(),
	canAcceptDirectInput: z.boolean().nullable(),
});

const ListThreadsValueSchema = z.strictObject({
	threads: z.array(ListedThreadSchema).max(100),
	nextCursor: CursorSchema.nullable(),
});

const ReadTurnSchema = z.strictObject({
	turnId: IdentitySchema,
	status: CodexTurnStatusSchema,
	summary: boundedUtf8Text(512),
	outputsIncluded: z.boolean(),
	outputsTruncated: z.boolean(),
});

const ReadThreadValueSchema = z.strictObject({
	threadId: IdentitySchema,
	turns: z.array(ReadTurnSchema).max(20),
	nextCursor: CursorSchema.nullable(),
});

const SendMessageValueSchema = z.strictObject({
	threadId: IdentitySchema,
	delivery: ToolDeliverySchema,
});

const WaitThreadsValueSchema = z.strictObject({
	event: z.enum(["completed", "attention", "timeout"]),
	threadId: IdentitySchema.nullable(),
	cursor: CursorSchema.nullable(),
});

const RefusedEnvelopeSchema = z.strictObject({
	tag: z.literal("refused"),
	reason: z.enum([
		"invalid_call",
		"not_ready",
		"not_loaded",
		"not_controllable",
		"system_error",
		"stale_child",
		"prior_epoch",
		"unknown_provenance",
		"approval_declined",
		"cycle",
		"busy",
		"expired",
		"unsupported",
	]),
	message: boundedUtf8Text(512),
});

const OUTER_FAILURE_REASONS = new Set(["invalid_call", "unsupported"]);

const ApprovalRequiredEnvelopeSchema = z.strictObject({
	tag: z.literal("approval_required"),
	operationId: IdentitySchema,
	summary: boundedUtf8Text(512),
});

const OutcomeUnknownEnvelopeSchema = z.strictObject({
	tag: z.literal("outcome_unknown"),
	operationId: IdentitySchema,
	message: z.literal(
		"The request may have taken effect. Inspect authoritative state before another mutation.",
	),
});

/**
 *
 */
function okEnvelope(value: z.ZodTypeAny) {
	return z.strictObject({
		tag: z.literal("ok"),
		operationId: IdentitySchema,
		value,
	});
}

const SharedEnvelopeSchemas = [
	RefusedEnvelopeSchema,
	ApprovalRequiredEnvelopeSchema,
	OutcomeUnknownEnvelopeSchema,
] as const;

export const TOOL_RESULT_ENVELOPE_SCHEMAS = Object.freeze({
	create_thread: z.union([okEnvelope(CreateThreadValueSchema), ...SharedEnvelopeSchemas]),
	fork_thread: z.union([okEnvelope(ForkThreadValueSchema), ...SharedEnvelopeSchemas]),
	list_threads: z.union([okEnvelope(ListThreadsValueSchema), ...SharedEnvelopeSchemas]),
	read_thread: z.union([okEnvelope(ReadThreadValueSchema), ...SharedEnvelopeSchemas]),
	send_message_to_thread: z.union([okEnvelope(SendMessageValueSchema), ...SharedEnvelopeSchemas]),
	wait_threads: z.union([okEnvelope(WaitThreadsValueSchema), ...SharedEnvelopeSchemas]),
} as const satisfies Record<GeneralThreadToolName, z.ZodTypeAny>);

const InputTextResultSchema = z.strictObject({
	type: z.literal("inputText"),
	text: boundedText(16_384),
});

export const DynamicToolCallResponseSchema = z.strictObject({
	contentItems: z.tuple([InputTextResultSchema]),
	success: z.boolean(),
});

export type DynamicToolCallResponse = z.infer<typeof DynamicToolCallResponseSchema>;
export type ToolResultEnvelope<Name extends GeneralThreadToolName> = z.infer<
	(typeof TOOL_RESULT_ENVELOPE_SCHEMAS)[Name]
>;

export interface ParsedDynamicToolCallResponse<Name extends GeneralThreadToolName> {
	readonly contentItems: DynamicToolCallResponse["contentItems"];
	readonly success: boolean;
	readonly envelope: ToolResultEnvelope<Name>;
}

/**
 *
 */
function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null) {
		return value;
	}
	for (const child of Object.values(value as Record<string, unknown>)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

/**
 *
 */
function schemaFor(name: unknown): z.ZodTypeAny {
	const parsedName = GeneralThreadToolNameSchema.safeParse(name);
	if (!parsedName.success) {
		throw new TypeError(`Unknown archboard_app tool: ${String(name)}.`);
	}
	return TOOL_RESULT_ENVELOPE_SCHEMAS[parsedName.data];
}

/**
 *
 */
function invalidResult(label: string, issues: readonly { readonly message: string }[]): never {
	throw new TypeError(`Invalid ${label}: ${issues.map((issue) => issue.message).join("; ")}`);
}

type JsonRecord = Record<string, unknown>;

/**
 *
 */
function orderedObject(
	value: JsonRecord,
	keys: readonly string[],
	overrides: Readonly<JsonRecord> = {},
): JsonRecord {
	const result: JsonRecord = {};
	for (const key of keys) {
		result[key] = Object.prototype.hasOwnProperty.call(overrides, key)
			? overrides[key]
			: value[key];
	}
	return result;
}

/**
 *
 */
function canonicalInitialTurn(value: unknown): JsonRecord {
	return orderedObject(value as JsonRecord, ["delivery", "turnId", "operationId", "reason"]);
}

/**
 *
 */
function canonicalThreadValue(value: unknown): JsonRecord {
	const record = value as JsonRecord;
	return orderedObject(record, ["threadId", "state", "initialTurn"], {
		initialTurn: canonicalInitialTurn(record["initialTurn"]),
	});
}

/**
 *
 */
function canonicalListValue(value: unknown): JsonRecord {
	const record = value as JsonRecord;
	const threads = (record["threads"] as readonly unknown[]).map((thread) =>
		orderedObject(thread as JsonRecord, [
			"threadId",
			"title",
			"status",
			"source",
			"epoch",
			"ownership",
			"loaded",
			"canAcceptDirectInput",
		]),
	);
	return orderedObject(record, ["threads", "nextCursor"], { threads });
}

/**
 *
 */
function canonicalReadValue(value: unknown): JsonRecord {
	const record = value as JsonRecord;
	const turns = (record["turns"] as readonly unknown[]).map((turn) =>
		orderedObject(turn as JsonRecord, [
			"turnId",
			"status",
			"summary",
			"outputsIncluded",
			"outputsTruncated",
		]),
	);
	return orderedObject(record, ["threadId", "turns", "nextCursor"], { turns });
}

/**
 *
 */
function canonicalToolValue(name: GeneralThreadToolName, value: unknown): JsonRecord {
	switch (name) {
		case "create_thread":
		case "fork_thread":
			return canonicalThreadValue(value);
		case "list_threads":
			return canonicalListValue(value);
		case "read_thread":
			return canonicalReadValue(value);
		case "send_message_to_thread":
			return orderedObject(value as JsonRecord, ["threadId", "delivery"]);
		case "wait_threads":
			return orderedObject(value as JsonRecord, ["event", "threadId", "cursor"]);
	}
}

/**
 *
 */
function canonicalEnvelope(name: GeneralThreadToolName, value: unknown): JsonRecord {
	const record = value as JsonRecord;
	switch (record["tag"]) {
		case "ok":
			return orderedObject(record, ["tag", "operationId", "value"], {
				value: canonicalToolValue(name, record["value"]),
			});
		case "refused":
			return orderedObject(record, ["tag", "reason", "message"]);
		case "approval_required":
			return orderedObject(record, ["tag", "operationId", "summary"]);
		case "outcome_unknown":
			return orderedObject(record, ["tag", "operationId", "message"]);
		default:
			throw new TypeError(`Unknown ${name} result envelope tag.`);
	}
}

export function parseToolResultEnvelope<Name extends GeneralThreadToolName>(
	name: Name,
	text: string,
): ToolResultEnvelope<Name>;
export function parseToolResultEnvelope(
	name: unknown,
	text: string,
): ToolResultEnvelope<GeneralThreadToolName>;
/**
 *
 */
export function parseToolResultEnvelope(
	name: unknown,
	text: string,
): ToolResultEnvelope<GeneralThreadToolName> {
	const label = `${String(name)} result envelope`;
	const value = parseStrictJson(text, label);
	const parsed = schemaFor(name).safeParse(value);
	if (!parsed.success) {
		invalidResult(label, parsed.error.issues);
	}
	const canonicalText = JSON.stringify(
		canonicalEnvelope(name as GeneralThreadToolName, parsed.data),
	);
	if (canonicalText !== text) {
		throw new TypeError(`${label} must use canonical compact JSON.`);
	}
	return freezeDeep(parsed.data) as ToolResultEnvelope<GeneralThreadToolName>;
}

export function parseDynamicToolCallResponse<Name extends GeneralThreadToolName>(
	name: Name,
	response: unknown,
): ParsedDynamicToolCallResponse<Name>;
export function parseDynamicToolCallResponse(
	name: unknown,
	response: unknown,
): ParsedDynamicToolCallResponse<GeneralThreadToolName>;
/**
 *
 */
export function parseDynamicToolCallResponse(
	name: unknown,
	response: unknown,
): ParsedDynamicToolCallResponse<GeneralThreadToolName> {
	const parsed = DynamicToolCallResponseSchema.safeParse(response);
	if (!parsed.success) {
		invalidResult(`${String(name)} dynamic tool response`, parsed.error.issues);
	}
	const envelope = parseToolResultEnvelope(name, parsed.data.contentItems[0].text);
	if (!parsed.data.success) {
		if (envelope.tag !== "refused" || !OUTER_FAILURE_REASONS.has(envelope.reason)) {
			throw new TypeError(
				`${String(name)} dynamic tool response must use a boundary-refusal envelope when success is false.`,
			);
		}
	}
	return freezeDeep({
		contentItems: parsed.data.contentItems,
		success: parsed.data.success,
		envelope,
	});
}
