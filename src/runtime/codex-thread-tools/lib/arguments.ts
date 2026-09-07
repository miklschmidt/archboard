import { z } from "zod";

import {
	GeneralThreadToolNameSchema,
	type GeneralThreadToolName,
} from "@/runtime/codex-thread-tools/lib/manifest";
import {
	WAIT_THREADS_TIMEOUT_MAX_MS,
	JsonValueSchema,
	boundedText,
} from "@/runtime/codex-thread-tools/lib/limits";

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

/**
 * Freeze a value and everything reachable from it, so parsed arguments cannot be changed by the
 * code that acts on them.
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
 * Refuse arguments, naming every schema issue so a malformed call can be diagnosed from the
 * message alone.
 * @param label - What was being parsed.
 * @param issues - The schema issues.
 * @throws {TypeError} Always.
 */
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
/**
 * Parse one tool call's arguments: the tool must be a reviewed one, the value must be plain JSON,
 * and it must satisfy that tool's own argument schema. The result is frozen, so the code that
 * acts on a call cannot change what the call said.
 * @param name - The tool being called.
 * @param value - The raw arguments.
 * @returns The frozen, parsed arguments.
 * @throws {TypeError} When the tool or its arguments are not reviewed ones.
 */
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
	return freezeDeep(parsed.data);
}
