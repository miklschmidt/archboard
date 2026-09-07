import path from "node:path";
import { z } from "zod";

import type { UserInputSchema } from "@/runtime/codex-protocol";
import {
	ArchboardContextSchema,
	canonicalContext,
	decodeCanonicalContext,
	encodeCanonicalContext,
	type ArchboardContext,
} from "@/runtime/codex-instructions/lib/context";
import { WORKHORSE_DEVELOPER_INSTRUCTIONS } from "@/runtime/codex-instructions/lib/authored";

/**
 * UTF-8 byte length of a string, the unit the prompt budget is written in.
 * @param value - The text to measure.
 * @returns The number of UTF-8 bytes.
 */
const utf8Bytes = (value: string): number => Buffer.byteLength(value, "utf8");
const boundedPrompt = z
	.string()
	.min(1, "prompt must not be empty")
	.refine((value) => utf8Bytes(value) <= 16_384, {
		message: "Prompt must be at most 16,384 UTF-8 bytes",
	});
const NonEmptyIdentitySchema = z.string().min(1, "identity must not be empty");

const TextUserInputSchema = z.strictObject({
	type: z.literal("text"),
	text: boundedPrompt,
	text_elements: z.tuple([]),
});
type GeneratedUserInput = z.infer<typeof UserInputSchema>;
type TextUserInput = Extract<GeneratedUserInput, { type: "text" }>;
const CanonicalContextValueSchema = z.string().superRefine((value, issueContext) => {
	try {
		decodeCanonicalContext(value);
	} catch (error) {
		issueContext.addIssue({
			code: "custom",
			message: error instanceof Error ? error.message : String(error),
		});
	}
});
const AdditionalContextEntrySchema = z.strictObject({
	kind: z.literal("application"),
	value: CanonicalContextValueSchema,
});

/**
 * Freeze a parsed value and everything reachable from it so a built request body cannot be
 * edited between validation and the wire.
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

/**
 * Wrap a schema so its parsed output is deep-frozen.
 * @param schema - The schema whose output to freeze.
 * @returns The freezing schema.
 */
function frozenSchema<T extends z.ZodTypeAny>(schema: T) {
	return schema.transform((value) => freezeDeep(value));
}

const AdditionalContextRawSchema = z.strictObject({
	archboard: AdditionalContextEntrySchema,
});
const AdditionalContextSchema = frozenSchema(AdditionalContextRawSchema);
type AdditionalContext = z.infer<typeof AdditionalContextSchema>;

const TurnStartBuilderInputSchema = z.strictObject({
	threadId: NonEmptyIdentitySchema,
	clientUserMessageId: NonEmptyIdentitySchema,
	prompt: boundedPrompt,
	context: ArchboardContextSchema,
});
const TurnSteerBuilderInputSchema = z.strictObject({
	threadId: NonEmptyIdentitySchema,
	clientUserMessageId: NonEmptyIdentitySchema,
	prompt: boundedPrompt,
	context: ArchboardContextSchema,
	expectedTurnId: NonEmptyIdentitySchema,
});

const TurnStartParamsRawSchema = z.strictObject({
	threadId: NonEmptyIdentitySchema,
	clientUserMessageId: NonEmptyIdentitySchema,
	input: z.tuple([TextUserInputSchema]),
	turnTrigger: z.literal("archboard"),
	additionalContext: AdditionalContextSchema,
});
const TurnStartParamsSchema = frozenSchema(TurnStartParamsRawSchema);
type TurnStartParams = z.infer<typeof TurnStartParamsSchema>;

const TurnSteerParamsRawSchema = z.strictObject({
	threadId: NonEmptyIdentitySchema,
	clientUserMessageId: NonEmptyIdentitySchema,
	input: z.tuple([TextUserInputSchema]),
	additionalContext: AdditionalContextSchema,
	expectedTurnId: NonEmptyIdentitySchema,
});
const TurnSteerParamsSchema = frozenSchema(TurnSteerParamsRawSchema);
type TurnSteerParams = z.infer<typeof TurnSteerParamsSchema>;

const SemanticDeveloperMessageSchema = z.strictObject({
	type: z.literal("message"),
	role: z.literal("developer"),
	content: z.tuple([
		z.strictObject({ type: z.literal("input_text"), text: CanonicalContextValueSchema }),
	]),
});

const ThreadInjectItemsParamsRawSchema = z.strictObject({
	threadId: NonEmptyIdentitySchema,
	items: z.tuple([SemanticDeveloperMessageSchema]),
});
const ThreadInjectItemsParamsSchema = frozenSchema(ThreadInjectItemsParamsRawSchema);
type ThreadInjectItemsParams = z.infer<typeof ThreadInjectItemsParamsSchema>;

const ThreadForkBuilderInputSchema = z.strictObject({
	threadId: NonEmptyIdentitySchema,
	cwd: NonEmptyIdentitySchema,
	beforeTurnId: NonEmptyIdentitySchema.optional(),
});

const ThreadForkParamsRawSchema = z
	.strictObject({
		threadId: NonEmptyIdentitySchema,
		beforeTurnId: NonEmptyIdentitySchema.optional(),
		cwd: NonEmptyIdentitySchema,
		runtimeWorkspaceRoots: z.tuple([NonEmptyIdentitySchema]),
		developerInstructions: z.literal(WORKHORSE_DEVELOPER_INSTRUCTIONS),
		ephemeral: z.literal(false),
		threadSource: z.literal("archboard"),
		excludeTurns: z.literal(true),
	})
	.superRefine((value, issueContext) => {
		if (!isCanonicalCheckoutRoot(value.cwd)) {
			issueContext.addIssue({
				code: "custom",
				path: ["cwd"],
				message: "cwd must be absolute and lexically canonical for this platform",
			});
		}
		if (value.runtimeWorkspaceRoots[0] !== value.cwd) {
			issueContext.addIssue({
				code: "custom",
				path: ["runtimeWorkspaceRoots"],
				message: "runtimeWorkspaceRoots must contain the same checkout as cwd",
			});
		}
	});
const ThreadForkParamsSchema = frozenSchema(ThreadForkParamsRawSchema);
type ThreadForkParams = z.infer<typeof ThreadForkParamsSchema>;

/**
 * Whether a path is absolute and already in its lexically resolved form, the only spelling a
 * forked workhorse may receive as its checkout root.
 * @param value - The candidate path.
 * @returns True when the path needs no normalisation.
 */
function isCanonicalCheckoutRoot(value: string): boolean {
	return path.isAbsolute(value) && path.resolve(value) === value;
}

/**
 * Validate a body this module built against its own output schema and freeze it, so a builder
 * bug surfaces here rather than as an app-server rejection.
 * @param schema - The output schema.
 * @param value - The body to check.
 * @param label - Names the body in the thrown error.
 * @returns The frozen, validated body.
 */
function parseOutput<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
	const parsed = schema.safeParse(value);
	if (!parsed.success) {
		throw new TypeError(`Invalid ${label}: ${parsed.error.message}`);
	}
	return freezeDeep(parsed.data);
}

/**
 * Build the one user input shape Archboard sends: plain text with no text elements.
 * @param text - The prompt text.
 * @returns The validated text input item.
 */
function createTextUserInput(text: string): TextUserInput {
	return parseOutput(
		TextUserInputSchema,
		{ type: "text", text, text_elements: [] },
		"text user input",
	);
}

/**
 * Wrap a context as the `additionalContext` entry that rides on turn/start and turn/steer.
 * @param context - The context to encode.
 * @returns The validated additional-context body.
 */
function createAdditionalContext(context: ArchboardContext): AdditionalContext {
	const value = encodeCanonicalContext(context);
	return parseOutput(
		AdditionalContextSchema,
		{ archboard: { kind: "application", value } },
		"additionalContext",
	);
}

interface TurnStartBuilderInput {
	readonly threadId: string;
	readonly clientUserMessageId: string;
	readonly prompt: string;
	readonly context: ArchboardContext;
}

/**
 * Build turn/start parameters carrying the prompt and the canonical context.
 * @param input - The thread, message id, prompt and context.
 * @returns The validated turn/start parameters.
 */
function createTurnStartParams(input: TurnStartBuilderInput): TurnStartParams {
	const validated = TurnStartBuilderInputSchema.parse(input);
	return parseOutput(
		TurnStartParamsSchema,
		{
			threadId: validated.threadId,
			clientUserMessageId: validated.clientUserMessageId,
			input: [createTextUserInput(validated.prompt)],
			turnTrigger: "archboard",
			additionalContext: createAdditionalContext(validated.context),
		},
		"turn/start parameters",
	);
}

interface TurnSteerBuilderInput extends TurnStartBuilderInput {
	readonly expectedTurnId: string;
}

/**
 * Build turn/steer parameters carrying the prompt, the canonical context and the turn expected
 * to still be running.
 * @param input - The thread, message id, prompt, context and expected turn.
 * @returns The validated turn/steer parameters.
 */
function createTurnSteerParams(input: TurnSteerBuilderInput): TurnSteerParams {
	const validated = TurnSteerBuilderInputSchema.parse(input);
	return parseOutput(
		TurnSteerParamsSchema,
		{
			threadId: validated.threadId,
			clientUserMessageId: validated.clientUserMessageId,
			input: [createTextUserInput(validated.prompt)],
			additionalContext: createAdditionalContext(validated.context),
			expectedTurnId: validated.expectedTurnId,
		},
		"turn/steer parameters",
	);
}

interface ThreadInjectItemsBuilderInput {
	readonly threadId: string;
	readonly context: ArchboardContext;
}

const ThreadInjectItemsBuilderInputSchema = z.strictObject({
	threadId: NonEmptyIdentitySchema,
	context: ArchboardContextSchema,
});

/**
 * Build thread/inject_items parameters that deliver a canonical context as one developer message.
 * @param input - The thread and context.
 * @returns The validated thread/inject_items parameters.
 */
function createThreadInjectItemsParams(
	input: ThreadInjectItemsBuilderInput,
): ThreadInjectItemsParams {
	const validated = ThreadInjectItemsBuilderInputSchema.parse(input);
	const context = canonicalContext(validated.context);
	return parseOutput(
		ThreadInjectItemsParamsSchema,
		{
			threadId: validated.threadId,
			items: [
				{
					type: "message",
					role: "developer",
					content: [{ type: "input_text", text: encodeCanonicalContext(context) }],
				},
			],
		},
		"thread/inject_items parameters",
	);
}

interface ThreadForkBuilderInput {
	readonly threadId: string;
	readonly cwd: string;
	readonly beforeTurnId?: string;
}

/**
 * Build thread/fork parameters for a workhorse: the reviewed developer instructions, the checkout
 * as the single workspace root, and no inherited turns.
 * @param input - The source thread, checkout and optional fork boundary.
 * @returns The validated thread/fork parameters.
 */
function createThreadForkParams(input: ThreadForkBuilderInput): ThreadForkParams {
	const validated = ThreadForkBuilderInputSchema.parse(input);
	return parseOutput(
		ThreadForkParamsSchema,
		{
			threadId: validated.threadId,
			...(validated.beforeTurnId === undefined ? {} : { beforeTurnId: validated.beforeTurnId }),
			cwd: validated.cwd,
			runtimeWorkspaceRoots: [validated.cwd],
			developerInstructions: WORKHORSE_DEVELOPER_INSTRUCTIONS,
			ephemeral: false,
			threadSource: "archboard",
			excludeTurns: true,
		},
		"thread/fork parameters",
	);
}

/**
 * Build thread/fork parameters for a thread forking itself mid-turn: the boundary is always the
 * executing turn, and any caller-supplied boundary is ignored on purpose.
 * @param input - The source thread, checkout and executing turn.
 * @returns The validated thread/fork parameters.
 */
function createSelfThreadForkParams(
	input: Omit<ThreadForkBuilderInput, "beforeTurnId"> & {
		readonly executingTurnId: string;
		readonly beforeTurnId?: string;
	},
): ThreadForkParams {
	const { executingTurnId, ...fork } = z
		.strictObject({
			threadId: NonEmptyIdentitySchema,
			cwd: NonEmptyIdentitySchema,
			executingTurnId: NonEmptyIdentitySchema,
			beforeTurnId: NonEmptyIdentitySchema.optional(),
		})
		.parse(input);
	const { beforeTurnId: ignoredCallerBoundary, ...selfFork } = fork;
	void ignoredCallerBoundary;
	return createThreadForkParams({ ...selfFork, beforeTurnId: executingTurnId });
}

/**
 * Decode the context carried by an `additionalContext` body, refusing any other shape.
 * @param value - The body to decode.
 * @returns The decoded canonical context.
 */
function parseCanonicalAdditionalContext(value: unknown): ArchboardContext {
	const parsed = AdditionalContextSchema.safeParse(value);
	if (!parsed.success) {
		throw new TypeError(`Invalid additionalContext: ${parsed.error.message}`);
	}
	return decodeCanonicalContext(parsed.data.archboard.value);
}

export {
	type TextUserInput,
	AdditionalContextSchema,
	type AdditionalContext,
	TurnStartParamsSchema,
	type TurnStartParams,
	TurnSteerParamsSchema,
	type TurnSteerParams,
	ThreadInjectItemsParamsSchema,
	type ThreadInjectItemsParams,
	ThreadForkParamsSchema,
	type ThreadForkParams,
	createTextUserInput,
	createAdditionalContext,
	type TurnStartBuilderInput,
	createTurnStartParams,
	type TurnSteerBuilderInput,
	createTurnSteerParams,
	type ThreadInjectItemsBuilderInput,
	createThreadInjectItemsParams,
	type ThreadForkBuilderInput,
	createThreadForkParams,
	createSelfThreadForkParams,
	parseCanonicalAdditionalContext,
};
