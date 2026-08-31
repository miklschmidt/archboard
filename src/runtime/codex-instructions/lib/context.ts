import { z } from "zod";

import {
	ADDITIONAL_CONTEXT_POLICY,
	type OperationKind,
	type OperationOutcome,
	type OperationRpc,
	type ThreadLinkReason,
	type ThreadLinkState,
} from "./context-policy.js";

const utf8Bytes = (value: string): number => Buffer.byteLength(value, "utf8");

function boundedUtf8Text(maxBytes: number, label: string) {
	return z.string().refine((value) => utf8Bytes(value) <= maxBytes, {
		message: `${label} must be at most ${maxBytes} UTF-8 bytes`,
	});
}

function nonEmptyBoundedUtf8Text(maxBytes: number, label: string) {
	return z
		.string()
		.min(1, `${label} must not be empty`)
		.refine((value) => utf8Bytes(value) <= maxBytes, {
			message: `${label} must be at most ${maxBytes} UTF-8 bytes`,
		});
}

const NonEmptyStringSchema = z.string().min(1, "value must not be empty");
const CursorSchema = nonEmptyBoundedUtf8Text(1_024, "cursor");
const SelectionIdSchema = nonEmptyBoundedUtf8Text(64, "selection element id");
const AmbiguitySchema = boundedUtf8Text(256, "ambiguity entry");
const DoingSchema = boundedUtf8Text(512, "doing");

const threadLinkStateValues = [
	...ADDITIONAL_CONTEXT_POLICY.threadLink.reasonNullStates,
	...ADDITIONAL_CONTEXT_POLICY.threadLink.reasonRequiredStates,
] as [ThreadLinkState, ...ThreadLinkState[]];
const threadLinkReasonValues = ADDITIONAL_CONTEXT_POLICY.threadLink.reasonPrecedence.map(
	({ reason }) => reason,
) as [ThreadLinkReason, ...ThreadLinkReason[]];
const operationKindValues = ADDITIONAL_CONTEXT_POLICY.operation.producers.map(
	({ kind }) => kind,
) as [OperationKind, ...OperationKind[]];
const operationRpcValues = [
	...new Set(ADDITIONAL_CONTEXT_POLICY.operation.producers.flatMap(({ rpcs }) => rpcs)),
] as [OperationRpc, ...OperationRpc[]];
const operationOutcomeValues = ADDITIONAL_CONTEXT_POLICY.operation.tupleStates
	.filter(({ outcome }) => outcome !== "null")
	.map(({ outcome }) => outcome) as [OperationOutcome, ...OperationOutcome[]];
const deliveredOutcomeSchema = z.literal(operationOutcomeValues[0]);
const notDeliveredOutcomeSchema = z.literal(operationOutcomeValues[1]);
const outcomeUnknownSchema = z.literal(operationOutcomeValues[2]);

function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null) return value;
	for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
	Object.freeze(value);
	return value;
}

const ArchboardContextRawSchema = z.strictObject({
	schema: z.literal(1),
	paneId: NonEmptyStringSchema,
	board: z.strictObject({
		note: NonEmptyStringSchema,
		version: z.number().finite().int().nonnegative(),
		cursor: CursorSchema.nullable(),
	}),
	threadLink: z
		.strictObject({
			state: z.enum(threadLinkStateValues),
			reason: z.enum(threadLinkReasonValues).nullable(),
		})
		.superRefine((value, refinementContext) => {
			const reasonNullStates = ADDITIONAL_CONTEXT_POLICY.threadLink
				.reasonNullStates as readonly string[];
			if (reasonNullStates.includes(value.state)) {
				if (value.reason !== null)
					refinementContext.addIssue({
						code: "custom",
						path: ["reason"],
						message: `threadLink state ${value.state} requires null reason`,
					});
				return;
			}
			if (value.reason === null)
				refinementContext.addIssue({
					code: "custom",
					path: ["reason"],
					message: `threadLink state ${value.state} requires a non-null reason`,
				});
		}),
	child: z.strictObject({
		id: NonEmptyStringSchema,
		epoch: NonEmptyStringSchema,
	}),
	workhorse: z.strictObject({
		threadId: NonEmptyStringSchema.nullable(),
		turnId: NonEmptyStringSchema.nullable(),
	}),
	coordinator: z.strictObject({
		threadId: NonEmptyStringSchema.nullable(),
		realtimeSessionId: NonEmptyStringSchema.nullable(),
	}),
	semantic: z.strictObject({
		brief: boundedUtf8Text(8_192, "semantic brief"),
		capturedAtMs: z.number().finite().int().nonnegative(),
		freshUntilMs: z.number().finite().int().nonnegative(),
		truncated: z.boolean(),
	}),
	focus: z.strictObject({
		paneId: NonEmptyStringSchema.nullable(),
		capturedAtMs: z.number().finite().int().nonnegative(),
	}),
	selection: z.strictObject({
		elementIds: z.array(SelectionIdSchema).max(128),
		capturedAtMs: z.number().finite().int().nonnegative(),
	}),
	claim: z.strictObject({
		holder: z.enum(["human", "agent", "none"]),
		doing: DoingSchema.nullable(),
	}),
	ambiguity: z.array(AmbiguitySchema).max(16),
	operation: z
		.union([
			z.strictObject({
				id: z.null(),
				kind: z.null(),
				rpc: z.null(),
				outcome: z.null(),
			}),
			z.strictObject({
				id: NonEmptyStringSchema,
				kind: z.enum(operationKindValues),
				rpc: z.enum(operationRpcValues),
				outcome: z.null(),
			}),
			z.strictObject({
				id: NonEmptyStringSchema,
				kind: z.enum(operationKindValues),
				rpc: z.enum(operationRpcValues),
				outcome: deliveredOutcomeSchema,
			}),
			z.strictObject({
				id: NonEmptyStringSchema,
				kind: z.enum(operationKindValues),
				rpc: z.enum(operationRpcValues),
				outcome: notDeliveredOutcomeSchema,
			}),
			z.strictObject({
				id: NonEmptyStringSchema,
				kind: z.enum(operationKindValues),
				rpc: z.enum(operationRpcValues),
				outcome: outcomeUnknownSchema,
			}),
		])
		.superRefine((value, refinementContext) => {
			if (value.id === null) return;
			const producer = ADDITIONAL_CONTEXT_POLICY.operation.producers.find(
				({ kind }) => kind === value.kind,
			);
			if (producer !== undefined && (producer.rpcs as readonly string[]).includes(value.rpc))
				return;
			refinementContext.addIssue({
				code: "custom",
				path: ["rpc"],
				message: `operation kind ${value.kind} does not allow rpc ${value.rpc}`,
			});
		}),
});

export const ArchboardContextSchema = ArchboardContextRawSchema.transform((value) =>
	freezeDeep(value),
);

export type ArchboardContext = z.infer<typeof ArchboardContextSchema>;

function orderedOperation(value: ArchboardContext["operation"]): ArchboardContext["operation"] {
	if (value.id === null) return { id: null, kind: null, rpc: null, outcome: null };
	if (value.outcome === null)
		return { id: value.id, kind: value.kind, rpc: value.rpc, outcome: null };
	if (value.outcome === "delivered")
		return { id: value.id, kind: value.kind, rpc: value.rpc, outcome: "delivered" };
	if (value.outcome === "not_delivered")
		return { id: value.id, kind: value.kind, rpc: value.rpc, outcome: "not_delivered" };
	return { id: value.id, kind: value.kind, rpc: value.rpc, outcome: "outcome_unknown" };
}

function orderedContext(value: ArchboardContext): ArchboardContext {
	return {
		schema: value.schema,
		paneId: value.paneId,
		board: {
			note: value.board.note,
			version: value.board.version,
			cursor: value.board.cursor,
		},
		threadLink: {
			state: value.threadLink.state,
			reason: value.threadLink.reason,
		},
		child: {
			id: value.child.id,
			epoch: value.child.epoch,
		},
		workhorse: {
			threadId: value.workhorse.threadId,
			turnId: value.workhorse.turnId,
		},
		coordinator: {
			threadId: value.coordinator.threadId,
			realtimeSessionId: value.coordinator.realtimeSessionId,
		},
		semantic: {
			brief: value.semantic.brief,
			capturedAtMs: value.semantic.capturedAtMs,
			freshUntilMs: value.semantic.freshUntilMs,
			truncated: value.semantic.truncated,
		},
		focus: {
			paneId: value.focus.paneId,
			capturedAtMs: value.focus.capturedAtMs,
		},
		selection: {
			elementIds: [...value.selection.elementIds],
			capturedAtMs: value.selection.capturedAtMs,
		},
		claim: {
			holder: value.claim.holder,
			doing: value.claim.doing,
		},
		ambiguity: [...value.ambiguity],
		operation: orderedOperation(value.operation),
	};
}

function validateContext(input: unknown): ArchboardContext {
	const parsed = ArchboardContextSchema.safeParse(input);
	if (!parsed.success) throw new TypeError(`Invalid Archboard context: ${parsed.error.message}`);
	return freezeDeep(orderedContext(parsed.data));
}

export function canonicalContext(input: ArchboardContext): ArchboardContext {
	return validateContext(input);
}

export function encodeCanonicalContext(input: ArchboardContext): string {
	const encoded = JSON.stringify(canonicalContext(input));
	if (encoded === undefined) throw new TypeError("Archboard context could not be encoded as JSON.");
	return encoded;
}

/** Parse only the exact compact field order emitted by encodeCanonicalContext. */
export function decodeCanonicalContext(encoded: string): ArchboardContext {
	if (typeof encoded !== "string") throw new TypeError("Canonical context must be a string.");
	let parsed: unknown;
	try {
		parsed = JSON.parse(encoded) as unknown;
	} catch (error) {
		throw new TypeError("Canonical context is not valid JSON.", { cause: error });
	}
	const context = validateContext(parsed);
	if (JSON.stringify(context) !== encoded)
		throw new TypeError("Canonical context JSON has unexpected whitespace, order, or escaping.");
	return context;
}
