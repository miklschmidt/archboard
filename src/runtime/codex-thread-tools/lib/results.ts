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
 * The ok envelope schema for one tool, which differs between tools only by the value it carries.
 * @param value - That tool's result value schema.
 * @returns The envelope schema.
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
 * Freeze a value and everything reachable from it, so a parsed envelope cannot be changed by
 * anything that reads it.
 * @param value - The value to freeze.
 * @returns The same value, frozen.
 */
function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null) {
		return value;
	}
	for (const child of Object.values(value)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

/**
 * The reviewed tool name a caller supplied, refused when it is not one of the archboard_app
 * tools; every later step reads the name from here rather than trusting the caller's value.
 * @param name - The claimed tool name.
 * @returns The reviewed name.
 * @throws {TypeError} When the name is not a reviewed tool.
 */
function toolNameFor(name: unknown): GeneralThreadToolName {
	const parsedName = GeneralThreadToolNameSchema.safeParse(name);
	if (!parsedName.success) {
		throw new TypeError(`Unknown archboard_app tool: ${String(name)}.`);
	}
	return parsedName.data;
}

/**
 * The result envelope schema one tool's results are proven against.
 * @param name - The reviewed tool name.
 * @returns That tool's envelope schema.
 */
function schemaFor(name: GeneralThreadToolName): z.ZodTypeAny {
	return TOOL_RESULT_ENVELOPE_SCHEMAS[name];
}

/**
 * Refuse a result, naming every schema issue so a malformed envelope can be diagnosed from the
 * message alone.
 * @param label - What was being parsed.
 * @param issues - The schema issues.
 * @throws {TypeError} Always.
 */
function invalidResult(label: string, issues: readonly { readonly message: string }[]): never {
	throw new TypeError(`Invalid ${label}: ${issues.map((issue) => issue.message).join("; ")}`);
}

type JsonRecord = Record<string, unknown>;

/**
 * Read a schema-checked value as a JSON object. The canonical rewriters below run only on values
 * the tool's own schema has already accepted, so this is a proof of that, not a second parse.
 * @param value - The schema-checked value.
 * @returns The value as a record.
 * @throws {TypeError} When the value is not an object.
 */
function asJsonRecord(value: unknown): JsonRecord {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new TypeError("A schema-checked tool result field is not a JSON object.");
	}
	return { ...value };
}

/**
 * Read a schema-checked value as a JSON array, for the same reason as `asJsonRecord`.
 * @param value - The schema-checked value.
 * @returns The value as an array.
 * @throws {TypeError} When the value is not an array.
 */
function asJsonArray(value: unknown): readonly unknown[] {
	if (!Array.isArray(value)) {
		throw new TypeError("A schema-checked tool result field is not a JSON array.");
	}
	return value;
}

/**
 * Rebuild an object with exactly the reviewed keys in the reviewed order, so a canonical envelope
 * serializes to the same bytes whatever order the tool produced its fields in.
 * @param value - The source object.
 * @param keys - The reviewed keys, in order.
 * @param overrides - Fields to take from here instead of the source.
 * @returns The reordered object.
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
 * The canonical form of a thread result's initial turn.
 * @param value - The schema-checked initial turn.
 * @returns The reordered turn.
 */
function canonicalInitialTurn(value: unknown): JsonRecord {
	return orderedObject(asJsonRecord(value), ["delivery", "turnId", "operationId", "reason"]);
}

/**
 * The canonical form of a create or fork result.
 * @param value - The schema-checked result value.
 * @returns The reordered value.
 */
function canonicalThreadValue(value: unknown): JsonRecord {
	const record = asJsonRecord(value);
	return orderedObject(record, ["threadId", "state", "initialTurn"], {
		initialTurn: canonicalInitialTurn(record["initialTurn"]),
	});
}

/**
 * The canonical form of a list result, including each listed thread.
 * @param value - The schema-checked result value.
 * @returns The reordered value.
 */
function canonicalListValue(value: unknown): JsonRecord {
	const record = asJsonRecord(value);
	const threads = asJsonArray(record["threads"]).map((thread) =>
		orderedObject(asJsonRecord(thread), [
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
 * The canonical form of a read result, including each turn it carries.
 * @param value - The schema-checked result value.
 * @returns The reordered value.
 */
function canonicalReadValue(value: unknown): JsonRecord {
	const record = asJsonRecord(value);
	const turns = asJsonArray(record["turns"]).map((turn) =>
		orderedObject(asJsonRecord(turn), [
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
 * The canonical form of one tool's ok value, by tool.
 * @param name - The reviewed tool name.
 * @param value - The schema-checked result value.
 * @returns The reordered value.
 */
function canonicalToolValue(name: GeneralThreadToolName, value: unknown): JsonRecord {
	if (name === "create_thread" || name === "fork_thread") {
		return canonicalThreadValue(value);
	}
	if (name === "list_threads") {
		return canonicalListValue(value);
	}
	if (name === "read_thread") {
		return canonicalReadValue(value);
	}
	if (name === "send_message_to_thread") {
		return orderedObject(asJsonRecord(value), ["threadId", "delivery"]);
	}
	return orderedObject(asJsonRecord(value), ["event", "threadId", "cursor"]);
}

/**
 * The canonical form of one result envelope, by tag. Serializing this must reproduce the exact
 * text the tool sent: that is how a result is proven to be canonical compact JSON.
 * @param name - The reviewed tool name.
 * @param value - The schema-checked envelope.
 * @returns The reordered envelope.
 * @throws {TypeError} When the envelope carries an unreviewed tag.
 */
function canonicalEnvelope(name: GeneralThreadToolName, value: unknown): JsonRecord {
	const record = asJsonRecord(value);
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
 * Parse one tool result envelope from the exact text a tool sent: strict JSON, the tool's own
 * envelope schema, and then a proof that the text is already the canonical compact form. A result
 * that means the right thing but is spelled differently is refused, because the text is what the
 * coordinator's transcript will hold.
 * @param name - The tool the result belongs to.
 * @param text - The envelope text as sent.
 * @returns The frozen envelope.
 * @throws {TypeError} When the tool, the envelope or its spelling is not the reviewed one.
 */
export function parseToolResultEnvelope(
	name: unknown,
	text: string,
): ToolResultEnvelope<GeneralThreadToolName> {
	const toolName = toolNameFor(name);
	const label = `${toolName} result envelope`;
	const value = parseStrictJson(text, label);
	const parsed = schemaFor(toolName).safeParse(value);
	if (!parsed.success) {
		invalidResult(label, parsed.error.issues);
	}
	const canonicalText = JSON.stringify(canonicalEnvelope(toolName, parsed.data));
	if (canonicalText !== text) {
		throw new TypeError(`${label} must use canonical compact JSON.`);
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- schemaFor(toolName) is that tool's own envelope schema, so its parsed output is that tool's envelope by construction; the schema table is keyed by tool name and TypeScript cannot follow that through a ZodTypeAny lookup
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
 * Parse a dynamic tool call response as this tool's result: the response envelope first, then the
 * single text item it carries, parsed as that tool's result envelope. This is the only way a
 * tool's result enters Archboard.
 * @param name - The tool that was called.
 * @param response - The raw dynamic tool call response.
 * @returns The content items, the success flag, and the parsed envelope.
 * @throws {TypeError} When the response or its envelope is not the reviewed shape.
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
