import { z } from "zod";

import {
	ConversationTextRoleSchema,
	FunctionCallOutputBodySchema,
	MessagePhaseSchema,
	ReasoningEffortSchema,
	UserInputSchema,
} from "./core-schemas.js";
import { FiniteNumberSchema, JsonValueSchema, looseObject } from "./scalars.js";

const HookPromptFragmentSchema = looseObject({ text: z.string(), hookRunId: z.string() });

export const CommandActionSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("read"), command: z.string(), name: z.string(), path: z.string() }),
	looseObject({ type: z.literal("listFiles"), command: z.string(), path: z.string().nullable() }),
	looseObject({
		type: z.literal("search"),
		command: z.string(),
		query: z.string().nullable(),
		path: z.string().nullable(),
	}),
	looseObject({ type: z.literal("unknown"), command: z.string() }),
]);

export const FileChangeSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("add"), content: z.string() }),
	looseObject({ type: z.literal("delete"), content: z.string() }),
	looseObject({
		type: z.literal("update"),
		unified_diff: z.string(),
		move_path: z.string().nullable(),
	}),
]);

export const FileUpdateChangeSchema = looseObject({
	path: z.string(),
	kind: z.discriminatedUnion("type", [
		looseObject({ type: z.literal("add") }),
		looseObject({ type: z.literal("delete") }),
		looseObject({ type: z.literal("update"), move_path: z.string().nullable() }),
	]),
	diff: z.string(),
});

export const DynamicToolCallOutputContentItemSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("inputText"), text: z.string() }),
	looseObject({ type: z.literal("inputImage"), imageUrl: z.string() }),
	looseObject({ type: z.literal("inputAudio"), audioUrl: z.string() }),
]);

const FunctionCallOutputItemSchema = looseObject({
	type: z.literal("functionCallOutput"),
	id: z.string(),
	name: z.string(),
	namespace: z.string().nullable(),
	output: FunctionCallOutputBodySchema,
});

const WebSearchActionSchema = z.discriminatedUnion("type", [
	looseObject({
		type: z.literal("search"),
		query: z.string().nullable(),
		queries: z.array(z.string()).nullable(),
	}),
	looseObject({ type: z.literal("openPage"), url: z.string().nullable() }),
	looseObject({
		type: z.literal("findInPage"),
		url: z.string().nullable(),
		pattern: z.string().nullable(),
	}),
	looseObject({ type: z.literal("other") }),
]);

const ImageGenerationFailureSchema = looseObject({
	type: z.literal("usageLimitExceeded"),
	limitId: z.string(),
	resetsAt: FiniteNumberSchema.nullable(),
});

const MemoryCitationSchema = looseObject({
	entries: z.array(
		looseObject({
			path: z.string(),
			lineStart: FiniteNumberSchema,
			lineEnd: FiniteNumberSchema,
			note: z.string(),
		}),
	),
	threadIds: z.array(z.string()),
});

const McpToolCallAppContextSchema = looseObject({
	connectorId: z.string(),
	linkId: z.string().nullable(),
	resourceUri: z.string().nullable(),
	appName: z.string().nullable(),
	actionName: z.string().nullable(),
});
const McpToolCallResultSchema = looseObject({
	/** MCP servers choose the content item shapes at runtime. */
	content: z.array(JsonValueSchema),
	/** MCP structured results and metadata are generated JSON extension points. */
	structuredContent: JsonValueSchema.nullable(),
	/** MCP structured results and metadata are generated JSON extension points. */
	_meta: JsonValueSchema.nullable(),
});
const CollabAgentStateSchema = looseObject({
	status: z.enum([
		"pendingInit",
		"running",
		"interrupted",
		"completed",
		"errored",
		"shutdown",
		"notFound",
	]),
	message: z.string().nullable(),
});

export const ThreadItemSchema = z.discriminatedUnion("type", [
	looseObject({
		type: z.literal("userMessage"),
		id: z.string(),
		clientId: z.string().nullable(),
		content: z.array(UserInputSchema),
	}),
	looseObject({
		type: z.literal("hookPrompt"),
		id: z.string(),
		fragments: z.array(HookPromptFragmentSchema),
	}),
	looseObject({
		type: z.literal("agentMessage"),
		id: z.string(),
		text: z.string(),
		phase: z.union([MessagePhaseSchema, z.null()]),
		memoryCitation: MemoryCitationSchema.nullable(),
		delivery: z.union([z.literal("async"), z.null()]),
	}),
	FunctionCallOutputItemSchema,
	looseObject({ type: z.literal("plan"), id: z.string(), text: z.string() }),
	looseObject({
		type: z.literal("reasoning"),
		id: z.string(),
		summary: z.array(z.string()),
		content: z.array(z.string()),
	}),
	looseObject({
		type: z.literal("commandExecution"),
		id: z.string(),
		pluginId: z.string().nullable(),
		scriptPath: z.string().nullable(),
		command: z.string(),
		cwd: z.string(),
		processId: z.string().nullable(),
		source: z.enum(["agent", "userShell", "unifiedExecStartup", "unifiedExecInteraction"]),
		status: z.enum(["inProgress", "completed", "failed", "declined"]),
		commandActions: z.array(CommandActionSchema),
		aggregatedOutput: z.string().nullable(),
		exitCode: FiniteNumberSchema.nullable(),
		durationMs: FiniteNumberSchema.nullable(),
	}),
	looseObject({
		type: z.literal("fileChange"),
		id: z.string(),
		changes: z.array(FileUpdateChangeSchema),
		status: z.enum(["inProgress", "completed", "failed", "declined"]),
	}),
	looseObject({
		type: z.literal("mcpToolCall"),
		id: z.string(),
		server: z.string(),
		tool: z.string(),
		status: z.enum(["inProgress", "completed", "failed"]),
		/** Dynamic MCP arguments are intentionally open JSON in generated code. */
		arguments: JsonValueSchema,
		appContext: McpToolCallAppContextSchema.nullable(),
		mcpAppResourceUri: z.string().optional(),
		pluginId: z.string().nullable(),
		readOnlyHint: z.boolean().nullable(),
		result: McpToolCallResultSchema.nullable(),
		error: looseObject({ message: z.string() }).nullable(),
		durationMs: FiniteNumberSchema.nullable(),
	}),
	looseObject({
		type: z.literal("dynamicToolCall"),
		id: z.string(),
		namespace: z.string().nullable(),
		tool: z.string(),
		/** Dynamic tool arguments are intentionally open JSON in generated code. */
		arguments: JsonValueSchema,
		status: z.enum(["inProgress", "completed", "failed"]),
		contentItems: z.array(DynamicToolCallOutputContentItemSchema).nullable(),
		success: z.boolean().nullable(),
		durationMs: FiniteNumberSchema.nullable(),
	}),
	looseObject({
		type: z.literal("collabAgentToolCall"),
		id: z.string(),
		tool: z.enum([
			"spawnAgent",
			"sendInput",
			"resumeAgent",
			"wait",
			"closeAgent",
			"sendMessage",
			"followupTask",
			"interruptAgent",
			"listAgents",
		]),
		status: z.enum(["inProgress", "completed", "failed", "interrupted"]),
		senderThreadId: z.string(),
		receiverThreadIds: z.array(z.string()),
		prompt: z.string().nullable(),
		model: z.string().nullable(),
		reasoningEffort: ReasoningEffortSchema.nullable(),
		/** Agent ids are generated map keys; Codex supplies the key set at runtime. */
		agentsStates: z.record(z.string(), CollabAgentStateSchema),
	}),
	looseObject({
		type: z.literal("subAgentActivity"),
		id: z.string(),
		kind: z.enum(["started", "interacted", "interrupted", "completed"]),
		agentThreadId: z.string(),
		agentPath: z.string(),
	}),
	looseObject({
		type: z.literal("webSearch"),
		id: z.string(),
		query: z.string(),
		action: WebSearchActionSchema.nullable(),
		/** Search result records are provider-defined generated JSON. */
		results: z.array(JsonValueSchema).nullable(),
	}),
	looseObject({ type: z.literal("imageView"), id: z.string(), path: z.string() }),
	looseObject({ type: z.literal("sleep"), id: z.string(), durationMs: FiniteNumberSchema }),
	looseObject({
		type: z.literal("imageGeneration"),
		id: z.string(),
		status: z.string(),
		revisedPrompt: z.string().nullable(),
		result: z.string(),
		transparentBackground: z.boolean().optional(),
		failure: ImageGenerationFailureSchema.nullable(),
		savedPath: z.string().optional(),
	}),
	looseObject({ type: z.literal("enteredReviewMode"), id: z.string(), review: z.string() }),
	looseObject({ type: z.literal("exitedReviewMode"), id: z.string(), review: z.string() }),
	looseObject({ type: z.literal("contextCompaction"), id: z.string() }),
]);

export const ThreadItemEntrySchema = looseObject({
	turnId: z.string(),
	item: ThreadItemSchema,
});

export const QueuedSubmissionSchema = looseObject({
	id: z.string(),
	input: z.array(UserInputSchema),
	clientUserMessageId: z.string(),
});

export const RealtimeInitialItemSchema = looseObject({
	role: ConversationTextRoleSchema,
	text: z.string(),
});

export const RealtimeOutputAudioDeltaSchema = looseObject({
	data: z.string(),
	sampleRate: FiniteNumberSchema,
	numChannels: FiniteNumberSchema,
	samplesPerChannel: FiniteNumberSchema.nullable(),
	itemId: z.string().nullable(),
});
