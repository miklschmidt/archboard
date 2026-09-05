import { z } from "zod";

import { GeneralThreadToolNameSchema, type GeneralThreadToolName } from "./manifest.js";
import { WAIT_THREADS_TIMEOUT_MAX_MS, JsonValueSchema, boundedText } from "./limits.js";

const ThreadIdSchema = boundedText(128);
const CursorSchema = boundedText(1024);
const PromptSchema = boundedText(16_384);

const CreateThreadArgumentsSchema = z.strictObject({
	prompt: PromptSchema,
});

const ForkThreadArgumentsSchema = z.strictObject({
	threadId: ThreadIdSchema,
	beforeTurnId: ThreadIdSchema.optional(),
	prompt: PromptSchema.optional(),
});

const ListThreadsArgumentsSchema = z.strictObject({
	cursor: CursorSchema.optional(),
	limit: z.number().finite().int().min(1).max(100).optional(),
});

const ReadThreadArgumentsSchema = z.strictObject({
	threadId: ThreadIdSchema,
	cursor: CursorSchema.optional(),
	turnLimit: z.number().finite().int().min(1).max(20).optional(),
	includeOutputs: z.boolean().optional(),
});

const SendMessageArgumentsSchema = z.strictObject({
	threadId: ThreadIdSchema,
	prompt: PromptSchema,
});

const WaitThreadIdsSchema = z
	.array(ThreadIdSchema)
	.min(1)
	.max(8)
	.superRefine((threadIds, context) => {
		if (new Set(threadIds).size !== threadIds.length) {
			context.addIssue({ code: "custom", message: "threadIds must be unique" });
		}
	});

const WaitThreadsArgumentsSchema = z.strictObject({
	threadIds: WaitThreadIdsSchema,
	timeoutMs: z.number().finite().int().min(0).max(WAIT_THREADS_TIMEOUT_MAX_MS).optional(),
	cursor: CursorSchema.optional(),
});

export const TOOL_ARGUMENT_SCHEMAS = Object.freeze({
	create_thread: CreateThreadArgumentsSchema,
	fork_thread: ForkThreadArgumentsSchema,
	list_threads: ListThreadsArgumentsSchema,
	read_thread: ReadThreadArgumentsSchema,
	send_message_to_thread: SendMessageArgumentsSchema,
	wait_threads: WaitThreadsArgumentsSchema,
} as const satisfies Record<GeneralThreadToolName, z.ZodTypeAny>);

export type ToolArguments = {
	[Name in GeneralThreadToolName]: z.infer<(typeof TOOL_ARGUMENT_SCHEMAS)[Name]>;
};

export type ToolArgument<Name extends GeneralThreadToolName> = ToolArguments[Name];

function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null) {
		return value;
	}
	for (const child of Object.values(value as Record<string, unknown>)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

function invalid(label: string, issues: readonly { readonly message: string }[]): never {
	throw new TypeError(`Invalid ${label}: ${issues.map((issue) => issue.message).join("; ")}`);
}

export function parseToolArguments<Name extends GeneralThreadToolName>(
	name: Name,
	value: unknown,
): ToolArgument<Name>;
export function parseToolArguments(
	name: unknown,
	value: unknown,
): ToolArguments[GeneralThreadToolName];
export function parseToolArguments(
	name: unknown,
	value: unknown,
): ToolArguments[GeneralThreadToolName] {
	const parsedName = GeneralThreadToolNameSchema.safeParse(name);
	if (!parsedName.success) {
		throw new TypeError(`Unknown archboard_app tool: ${String(name)}.`);
	}
	const json = JsonValueSchema.safeParse(value);
	if (!json.success) {
		invalid(`${parsedName.data} arguments`, json.error.issues);
	}
	const parsed = TOOL_ARGUMENT_SCHEMAS[parsedName.data].safeParse(json.data);
	if (!parsed.success) {
		invalid(`${parsedName.data} arguments`, parsed.error.issues);
	}
	return freezeDeep(parsed.data) as ToolArguments[GeneralThreadToolName];
}
