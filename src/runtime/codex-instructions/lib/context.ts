import { z } from "zod";

import {
	ADDITIONAL_CONTEXT_POLICY,
	type OperationOutcome,
} from "@/runtime/codex-instructions/lib/context-policy";
import {
	DiagramGrammarSchema,
	ReconciliationKindSchema,
	VariantLifecycleSchema,
} from "@/shared/semantic-board/index";
import { SemanticSubjectKindSchema } from "@/shared/semantic-pane-context/index";

/**
 * UTF-8 byte length of a string, the unit every context size limit is written in.
 * @param value - The text to measure.
 * @returns The number of UTF-8 bytes.
 */
const utf8Bytes = (value: string): number => Buffer.byteLength(value, "utf8");

/**
 * A string schema capped by UTF-8 byte length rather than character count, because the byte
 * budget is what the app-server context slot enforces.
 * @param maxBytes - The inclusive byte limit.
 * @param label - Names the field in the validation message.
 * @returns The bounded string schema.
 */
function boundedUtf8Text(maxBytes: number, label: string) {
	return z.string().refine((value) => utf8Bytes(value) <= maxBytes, {
		message: `${label} must be at most ${maxBytes} UTF-8 bytes`,
	});
}

/**
 * Like boundedUtf8Text but also refusing the empty string.
 * @param maxBytes - The inclusive byte limit.
 * @param label - Names the field in the validation message.
 * @returns The bounded non-empty string schema.
 */
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
const SubjectIdSchema = nonEmptyBoundedUtf8Text(64, "semantic subject id");
const SubjectNameSchema = boundedUtf8Text(160, "semantic subject name");
const AmbiguitySchema = boundedUtf8Text(256, "ambiguity entry");
const DoingSchema = boundedUtf8Text(512, "doing");

/**
 * What kind of thing a selected identity names.
 *
 * The board contract's own vocabulary, reused rather than restated: an agent
 * handed one of these can put it straight into an edit or a resolution, which is
 * only true while this list and the one commands take are the same list. There
 * is no spelling here for anything that was merely drawn, because there is
 * nothing an agent could be asked to do about a lane or a label (ADR 0023).
 */
const SubjectKindSchema = SemanticSubjectKindSchema;

const SelectedSubjectSchema = z.strictObject({
	kind: SubjectKindSchema,
	id: SubjectIdSchema,
	name: SubjectNameSchema.nullable(),
});

/**
 * One disagreement the proposal in front of the agent is holding.
 *
 * Carried at the top of the context rather than left inside the brief, because
 * it is the one thing in a context that names work: a parent edit that landed
 * and left drafts needing somebody says so here, with the reconciliation's own
 * repair sentence, so the agent settles the issue instead of replaying an edit
 * that has already been applied.
 */
const ReconciliationIssueSchema = z.strictObject({
	subject: SubjectIdSchema,
	what: SubjectNameSchema,
	kind: ReconciliationKindSchema,
	field: SubjectNameSchema.nullable(),
	repair: boundedUtf8Text(512, "repair"),
});

const threadLinkStateValues = [
	...ADDITIONAL_CONTEXT_POLICY.threadLink.reasonNullStates,
	...ADDITIONAL_CONTEXT_POLICY.threadLink.reasonRequiredStates,
];
const threadLinkReasonValues = ADDITIONAL_CONTEXT_POLICY.threadLink.reasonPrecedence.map(
	({ reason }) => reason,
);
const operationKindValues = ADDITIONAL_CONTEXT_POLICY.operation.producers.map(({ kind }) => kind);
const operationRpcValues = [
	...new Set(ADDITIONAL_CONTEXT_POLICY.operation.producers.flatMap(({ rpcs }) => rpcs)),
];
const deliveredOutcomeSchema = z.literal("delivered" satisfies OperationOutcome);
const notDeliveredOutcomeSchema = z.literal("not_delivered" satisfies OperationOutcome);
const outcomeUnknownSchema = z.literal("outcome_unknown" satisfies OperationOutcome);

/**
 * Freeze a parsed value and everything reachable from it so a canonical context cannot be edited
 * after validation.
 * @param value - The value to freeze in place.
 * @returns The same value, now frozen at every level.
 */
function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null) {
		return value;
	}
	const children: readonly unknown[] = Object.values(value);
	for (const child of children) {
		freezeDeep(child);
	}
	Object.freeze(value);
	return value;
}

const ArchboardContextRawSchema = z.strictObject({
	schema: z.literal(1),
	paneId: NonEmptyStringSchema,
	board: z.strictObject({
		/** The name every command spells this board with. */
		name: NonEmptyStringSchema,
		/** Its comparison form, which is what a claim and a broadcast agree on. */
		key: NonEmptyStringSchema,
		version: z.number().finite().int().nonnegative(),
		cursor: CursorSchema.nullable(),
	}),
	threadLink: z
		.strictObject({
			state: z.enum(threadLinkStateValues),
			reason: z.enum(threadLinkReasonValues).nullable(),
		})
		.superRefine((value, refinementContext) => {
			const reasonNullStates: readonly string[] =
				ADDITIONAL_CONTEXT_POLICY.threadLink.reasonNullStates;
			if (reasonNullStates.includes(value.state)) {
				if (value.reason !== null) {
					refinementContext.addIssue({
						code: "custom",
						path: ["reason"],
						message: `threadLink state ${value.state} requires null reason`,
					});
				}
				return;
			}
			if (value.reason === null) {
				refinementContext.addIssue({
					code: "custom",
					path: ["reason"],
					message: `threadLink state ${value.state} requires a non-null reason`,
				});
			}
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
	/** Which architectural state the pane is reading, or null before one is drawn. */
	variant: z
		.strictObject({
			id: SubjectIdSchema,
			name: SubjectNameSchema,
			lifecycle: VariantLifecycleSchema,
		})
		.nullable(),
	/** Which of its views, or null when the variant is read whole. */
	view: z
		.strictObject({
			id: SubjectIdSchema,
			name: SubjectNameSchema,
			grammar: DiagramGrammarSchema,
		})
		.nullable(),
	/**
	 * What was picked out. `count` is how many there were and `subjects` is as
	 * many as the brief had room for; a selection too long to carry still says
	 * that something was selected, because "nothing is selected" is an answer an
	 * agent gives confidently and wrongly.
	 */
	selection: z.strictObject({
		count: z.number().finite().int().nonnegative(),
		subjects: z.array(SelectedSubjectSchema).max(128),
		capturedAtMs: z.number().finite().int().nonnegative(),
	}),
	/**
	 * What this proposal is waiting on, and what the reconciliation said to do.
	 *
	 * `required` and `count` are the fact; `issues` is as much of the detail as
	 * the brief had room for. They can disagree — a brief under byte pressure
	 * drops issues before it drops anything else — and when they do, `required`
	 * is the one to believe. An agent told `required` with no issues listed reads
	 * the board; an agent told neither does not know there is work.
	 */
	reconciliation: z.strictObject({
		required: z.boolean(),
		count: z.number().finite().int().nonnegative(),
		blockedBy: SubjectIdSchema.nullable(),
		issues: z.array(ReconciliationIssueSchema).max(32),
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
			if (value.id === null) {
				return;
			}
			const producer = ADDITIONAL_CONTEXT_POLICY.operation.producers.find(
				({ kind }) => kind === value.kind,
			);
			const allowedRpcs: readonly string[] = producer?.rpcs ?? [];
			if (allowedRpcs.includes(value.rpc)) {
				return;
			}
			refinementContext.addIssue({
				code: "custom",
				path: ["rpc"],
				message: `operation kind ${value.kind} does not allow rpc ${value.rpc}`,
			});
		}),
});

const ArchboardContextSchema = ArchboardContextRawSchema.transform((value) => freezeDeep(value));

type ArchboardContext = z.infer<typeof ArchboardContextSchema>;

/**
 * Rebuild the operation tuple in its reviewed field order so the encoded JSON is byte-stable
 * whatever order the caller's object had.
 * @param value - A validated operation tuple.
 * @returns An equal tuple with fields in policy order.
 */
function orderedOperation(value: ArchboardContext["operation"]): ArchboardContext["operation"] {
	if (value.id === null) {
		return { id: null, kind: null, rpc: null, outcome: null };
	}
	if (value.outcome === null) {
		return { id: value.id, kind: value.kind, rpc: value.rpc, outcome: null };
	}
	if (value.outcome === "delivered") {
		return { id: value.id, kind: value.kind, rpc: value.rpc, outcome: "delivered" };
	}
	if (value.outcome === "not_delivered") {
		return { id: value.id, kind: value.kind, rpc: value.rpc, outcome: "not_delivered" };
	}
	return { id: value.id, kind: value.kind, rpc: value.rpc, outcome: "outcome_unknown" };
}

/**
 * Rebuild a context with every field in its reviewed order and every array copied, so the
 * canonical encoding depends only on values.
 * @param value - A validated context.
 * @returns An equal context in canonical field order.
 */
function orderedContext(value: ArchboardContext): ArchboardContext {
	return {
		schema: value.schema,
		paneId: value.paneId,
		board: {
			name: value.board.name,
			key: value.board.key,
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
		variant:
			value.variant === null
				? null
				: {
						id: value.variant.id,
						name: value.variant.name,
						lifecycle: value.variant.lifecycle,
					},
		view:
			value.view === null
				? null
				: { id: value.view.id, name: value.view.name, grammar: value.view.grammar },
		selection: {
			count: value.selection.count,
			subjects: value.selection.subjects.map((subject) => ({
				kind: subject.kind,
				id: subject.id,
				name: subject.name,
			})),
			capturedAtMs: value.selection.capturedAtMs,
		},
		reconciliation: {
			required: value.reconciliation.required,
			count: value.reconciliation.count,
			blockedBy: value.reconciliation.blockedBy,
			issues: value.reconciliation.issues.map((issue) => ({
				subject: issue.subject,
				what: issue.what,
				kind: issue.kind,
				field: issue.field,
				repair: issue.repair,
			})),
		},
		claim: {
			holder: value.claim.holder,
			doing: value.claim.doing,
		},
		ambiguity: [...value.ambiguity],
		operation: orderedOperation(value.operation),
	};
}

/**
 * Validate untrusted input as an Archboard context and return the frozen canonical form.
 * @param input - Any value claiming to be a context.
 * @returns The frozen, canonically ordered context.
 */
function validateContext(input: unknown): ArchboardContext {
	const parsed = ArchboardContextSchema.safeParse(input);
	if (!parsed.success) {
		throw new TypeError(`Invalid Archboard context: ${parsed.error.message}`);
	}
	return freezeDeep(orderedContext(parsed.data));
}

/**
 * The canonical (validated, ordered, frozen) form of a context the caller already typed.
 * @param input - A context value.
 * @returns The canonical context.
 */
function canonicalContext(input: ArchboardContext): ArchboardContext {
	return validateContext(input);
}

/**
 * Encode a context as the one compact JSON text the app-server context slot carries.
 * @param input - A context value.
 * @returns The canonical JSON text.
 */
function encodeCanonicalContext(input: ArchboardContext): string {
	return JSON.stringify(canonicalContext(input));
}

/**
 * Parse only the exact compact field order emitted by encodeCanonicalContext.
 * @param encoded - The JSON text to decode.
 * @returns The decoded canonical context.
 */
function decodeCanonicalContext(encoded: string): ArchboardContext {
	let parsed: unknown;
	try {
		parsed = JSON.parse(encoded) as unknown;
	} catch (error) {
		throw new TypeError("Canonical context is not valid JSON.", { cause: error });
	}
	const context = validateContext(parsed);
	if (JSON.stringify(context) !== encoded) {
		throw new TypeError("Canonical context JSON has unexpected whitespace, order, or escaping.");
	}
	return context;
}

export {
	ArchboardContextSchema,
	type ArchboardContext,
	canonicalContext,
	encodeCanonicalContext,
	decodeCanonicalContext,
};
