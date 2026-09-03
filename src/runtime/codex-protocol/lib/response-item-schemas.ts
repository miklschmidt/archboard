import { z } from "zod";

import {
	FunctionCallOutputBodySchema,
	ImageDetailSchema,
	MessagePhaseSchema,
} from "./core-schemas.js";
import { CodexSafeI64Schema, JsonValueSchema, looseObject } from "./scalars.js";

const InternalChatMessageMetadataPassthroughSchema = looseObject({
	turn_id: z.string().optional(),
});

const ContentItemSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("input_text"), text: z.string() }),
	looseObject({
		type: z.literal("input_image"),
		image_url: z.string(),
		detail: ImageDetailSchema.optional(),
	}),
	looseObject({ type: z.literal("input_audio"), audio_url: z.string() }),
	looseObject({ type: z.literal("output_text"), text: z.string() }),
]);

const AgentMessageInputContentSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("input_text"), text: z.string() }),
	looseObject({ type: z.literal("encrypted_content"), encrypted_content: z.string() }),
]);

const ReasoningItemReasoningSummarySchema = looseObject({
	type: z.literal("summary_text"),
	text: z.string(),
});
const ReasoningItemContentSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("reasoning_text"), text: z.string() }),
	looseObject({ type: z.literal("text"), text: z.string() }),
]);

const LocalShellActionSchema = looseObject({
	type: z.literal("exec"),
	command: z.array(z.string()),
	timeout_ms: CodexSafeI64Schema.nullable(),
	working_directory: z.string().nullable(),
	/** Environment variable names and values are intentionally open in the generated action. */
	env: z.record(z.string(), z.string()).nullable(),
	user: z.string().nullable(),
});

const WebSearchActionSchema = z.discriminatedUnion("type", [
	looseObject({
		type: z.literal("search"),
		query: z.string().optional(),
		queries: z.array(z.string()).optional(),
	}),
	looseObject({ type: z.literal("open_page"), url: z.string().optional() }),
	looseObject({
		type: z.literal("find_in_page"),
		url: z.string().optional(),
		pattern: z.string().optional(),
	}),
	looseObject({ type: z.literal("other") }),
]);

/** The Responses API leaves tool-search arguments open by generated contract. */
const OpenToolSearchValueSchema = JsonValueSchema;

export const ResponseItemSchema = z.discriminatedUnion("type", [
	looseObject({
		type: z.literal("message"),
		id: z.string().optional(),
		/** Responses API message roles are provider-defined strings. */
		role: z.string(),
		content: z.array(ContentItemSchema),
		phase: MessagePhaseSchema.optional(),
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("agent_message"),
		id: z.string().optional(),
		author: z.string(),
		recipient: z.string(),
		content: z.array(AgentMessageInputContentSchema),
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("reasoning"),
		id: z.string().optional(),
		summary: z.array(ReasoningItemReasoningSummarySchema),
		content: z.array(ReasoningItemContentSchema).optional(),
		encrypted_content: z.string().nullable(),
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("local_shell_call"),
		/** Legacy id is optional; Responses API uses call_id. */
		id: z.string().optional(),
		call_id: z.string().nullable(),
		status: z.enum(["completed", "in_progress", "incomplete"]),
		action: LocalShellActionSchema,
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("function_call"),
		id: z.string().optional(),
		name: z.string(),
		namespace: z.string().optional(),
		arguments: z.string(),
		encrypted_function_args: z.array(z.string()).optional(),
		call_id: z.string(),
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("tool_search_call"),
		id: z.string().optional(),
		call_id: z.string().nullable(),
		status: z.string().optional(),
		execution: z.string(),
		arguments: OpenToolSearchValueSchema,
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("function_call_output"),
		id: z.string().optional(),
		call_id: z.string().optional(),
		name: z.string().optional(),
		namespace: z.string().optional(),
		output: FunctionCallOutputBodySchema,
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("custom_tool_call"),
		id: z.string().optional(),
		status: z.string().optional(),
		call_id: z.string(),
		name: z.string(),
		namespace: z.string().optional(),
		input: z.string(),
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("custom_tool_call_output"),
		id: z.string().optional(),
		call_id: z.string(),
		name: z.string().optional(),
		output: FunctionCallOutputBodySchema,
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("tool_search_output"),
		id: z.string().optional(),
		call_id: z.string().nullable(),
		status: z.string(),
		execution: z.string(),
		/** Tool-search results are an open generated JSON array. */
		tools: z.array(OpenToolSearchValueSchema),
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("web_search_call"),
		id: z.string().optional(),
		status: z.string().optional(),
		action: WebSearchActionSchema.optional(),
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("image_generation_call"),
		id: z.string().optional(),
		status: z.string(),
		revised_prompt: z.string().optional(),
		result: z.string(),
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({
		type: z.literal("compaction"),
		id: z.string().optional(),
		encrypted_content: z.string(),
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({ type: z.literal("compaction_trigger") }),
	looseObject({
		type: z.literal("context_compaction"),
		id: z.string().optional(),
		encrypted_content: z.string().optional(),
		internal_chat_message_metadata_passthrough:
			InternalChatMessageMetadataPassthroughSchema.optional(),
	}),
	looseObject({ type: z.literal("other") }),
]);

export const ResponseUsageMetadataSchema = looseObject({ amount: z.string().nullable() });
