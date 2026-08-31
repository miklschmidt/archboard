import { z } from "zod";

import { GeneralThreadToolNameSchema, type GeneralThreadToolName } from "./manifest.js";
import { parseCompactJson } from "./json.js";
import { boundedText, nullableText } from "./limits.js";

const IdentitySchema = boundedText(128);
const CursorSchema = boundedText(1024);
const ReasonSchema = nullableText(512);

export const ToolDeliverySchema = z.enum(["delivered", "not_delivered", "outcome_unknown"]);

const CreateInitialTurnSchema = z.strictObject({
	delivery: ToolDeliverySchema,
	turnId: IdentitySchema.nullable(),
	operationId: IdentitySchema.nullable(),
	reason: ReasonSchema,
});

const ForkInitialTurnSchema = z.strictObject({
	delivery: z.enum(["not_requested", ...ToolDeliverySchema.options]),
	turnId: IdentitySchema.nullable(),
	operationId: IdentitySchema.nullable(),
	reason: ReasonSchema,
});

const CreateThreadValueSchema = z.strictObject({
	threadId: IdentitySchema,
	state: z.enum(["executable", "inspect_only"]),
	initialTurn: CreateInitialTurnSchema,
});

const ForkThreadValueSchema = z.strictObject({
	threadId: IdentitySchema,
	state: z.enum(["executable", "inspect_only"]),
	initialTurn: ForkInitialTurnSchema,
});

const ListedThreadSchema = z.strictObject({
	threadId: IdentitySchema,
	title: nullableText(512),
	status: z.enum(["notLoaded", "idle", "systemError", "active"]),
	source: z.enum(["cli", "vscode", "exec", "appServer"]),
	epoch: z.enum(["current", "prior", "unknown"]),
	ownership: z.enum(["created", "attached", "foreign"]),
	loaded: z.boolean(),
	canAcceptDirectInput: z.boolean().nullable(),
});

const ListThreadsValueSchema = z.strictObject({
	threads: z.array(ListedThreadSchema),
	nextCursor: CursorSchema.nullable(),
});

const ReadTurnSchema = z.strictObject({
	turnId: IdentitySchema,
	status: z.enum(["inProgress", "completed", "interrupted", "failed"]),
	summary: boundedText(512),
	outputsIncluded: z.boolean(),
	outputsTruncated: z.boolean(),
});

const ReadThreadValueSchema = z.strictObject({
	threadId: IdentitySchema,
	turns: z.array(ReadTurnSchema),
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
	message: boundedText(512),
});

const ApprovalRequiredEnvelopeSchema = z.strictObject({
	tag: z.literal("approval_required"),
	operationId: IdentitySchema,
	summary: boundedText(512),
});

const OutcomeUnknownEnvelopeSchema = z.strictObject({
	tag: z.literal("outcome_unknown"),
	operationId: IdentitySchema,
	message: z.literal(
		"The request may have taken effect. Inspect authoritative state before another mutation.",
	),
});

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
	text: z.string().min(1),
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

function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null) return value;
	for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
	return Object.freeze(value);
}

function schemaFor(name: unknown): z.ZodTypeAny {
	const parsedName = GeneralThreadToolNameSchema.safeParse(name);
	if (!parsedName.success) throw new TypeError(`Unknown archboard_app tool: ${String(name)}.`);
	return TOOL_RESULT_ENVELOPE_SCHEMAS[parsedName.data];
}

function invalidResult(label: string, issues: readonly { readonly message: string }[]): never {
	throw new TypeError(`Invalid ${label}: ${issues.map((issue) => issue.message).join("; ")}`);
}

export function parseToolResultEnvelope<Name extends GeneralThreadToolName>(
	name: Name,
	text: string,
): ToolResultEnvelope<Name>;
export function parseToolResultEnvelope(
	name: unknown,
	text: string,
): ToolResultEnvelope<GeneralThreadToolName>;
export function parseToolResultEnvelope(
	name: unknown,
	text: string,
): ToolResultEnvelope<GeneralThreadToolName> {
	const value = parseCompactJson(text, `${String(name)} result envelope`);
	const parsed = schemaFor(name).safeParse(value);
	if (!parsed.success) invalidResult(`${String(name)} result envelope`, parsed.error.issues);
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
export function parseDynamicToolCallResponse(
	name: unknown,
	response: unknown,
): ParsedDynamicToolCallResponse<GeneralThreadToolName> {
	const parsed = DynamicToolCallResponseSchema.safeParse(response);
	if (!parsed.success) invalidResult(`${String(name)} dynamic tool response`, parsed.error.issues);
	const envelope = parseToolResultEnvelope(name, parsed.data.contentItems[0].text);
	if (!parsed.data.success && envelope.tag !== "refused")
		throw new TypeError(
			`${String(name)} dynamic tool response must use a refused envelope when success is false.`,
		);
	return freezeDeep({
		contentItems: parsed.data.contentItems,
		success: parsed.data.success,
		envelope,
	}) as ParsedDynamicToolCallResponse<GeneralThreadToolName>;
}
