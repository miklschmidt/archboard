// What a `claude -p --output-format stream-json` call said about itself:
// the session it ran in, every file it opened and whether it got it, any read
// it was refused, and the result line with this call's own usage, cost and
// structured answer.
//
// Claude Code 2.1 prints one JSON object per line: a `system`/`init` with the
// session id and tool list, `assistant` messages whose content holds
// `tool_use` blocks (Read, Grep, Glob with a `file_path` or `path` input),
// `user` messages carrying the matching `tool_result` (an image read answers
// with an image block and `tool_use_result.type` "image"; a refusal carries
// `is_error`), `system`/`permission_denied` for a read outside the working
// directory, and one `result` line: `session_id`, `usage` for this call,
// `total_cost_usd`, `modelUsage` by model, and `structured_output` when a
// `--json-schema` answer was given. Only fields the harness reports are
// read; everything else stays in the retained raw file.

import path from "node:path";
import type { Usage } from "@/runtime/skill-evaluation/lib/events";

type Json = Record<string, unknown>;

/** One file the grader asked a tool to open. */
interface ToolRead {
	readonly tool: string;
	/** The path as the tool was given it, resolved against the working directory. */
	readonly file: string;
	/** Whether the tool answered with content rather than an error. */
	readonly ok: boolean;
	/** Whether the answer was an image. */
	readonly image: boolean;
}

/** What the stream said. */
interface ClaudeTrace {
	readonly sessionId: string | null;
	readonly reads: readonly ToolRead[];
	/** Reads Claude Code itself refused, by path. */
	readonly denied: readonly string[];
	/** This call's own usage, normalized. */
	readonly usage: Usage | null;
	readonly rawUsage: unknown;
	readonly modelUsage: unknown;
	readonly costUsd: number | null;
	/** The structured answer, as JSON text, when the result carried one. */
	readonly structuredOutput: string | null;
	readonly failure: string | null;
	readonly events: number;
	readonly malformedLines: number;
}

/**
 * Whether a value is a JSON object.
 * @param value The value.
 * @returns True for a non-null object.
 */
function isJson(value: unknown): value is Json {
	return typeof value === "object" && value !== null;
}

/**
 * A number field, or null.
 * @param record The object.
 * @param key The field.
 * @returns The number or null.
 */
function numberField(record: Json, key: string): number | null {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * A string field, or null.
 * @param record The object.
 * @param key The field.
 * @returns The string or null.
 */
function stringField(record: Json, key: string): string | null {
	const value = record[key];
	return typeof value === "string" ? value : null;
}

/**
 * Usage from a result line, normalized to the shared shape: Claude reports
 * uncached input, cache reads and cache writes apart, so input is their sum,
 * cached is what was read from cache, and the total is input plus output.
 * @param raw The usage object.
 * @returns The usage, or null when the input and output counts are absent.
 */
function claudeUsageFrom(raw: unknown): Usage | null {
	if (!isJson(raw)) return null;
	const uncached = numberField(raw, "input_tokens");
	const output = numberField(raw, "output_tokens");
	if (uncached === null || output === null) return null;
	const cached = numberField(raw, "cache_read_input_tokens") ?? 0;
	const cacheWrite = numberField(raw, "cache_creation_input_tokens");
	const input = uncached + cached + (cacheWrite ?? 0);
	return { input, cached, cacheWrite, output, reasoning: thinkingOf(raw), total: input + output };
}

/**
 * The thinking tokens a result line reports, when it does.
 * @param raw The usage object.
 * @returns The count or null.
 */
function thinkingOf(raw: Json): number | null {
	const details = raw["output_tokens_details"];
	return isJson(details) ? numberField(details, "thinking_tokens") : null;
}

/** A trace under construction. */
interface TraceBuilder {
	sessionId: string | null;
	reads: Map<string, { tool: string; file: string; ok: boolean; image: boolean }>;
	order: string[];
	denied: string[];
	usage: Usage | null;
	rawUsage: unknown;
	modelUsage: unknown;
	costUsd: number | null;
	structuredOutput: string | null;
	failure: string | null;
	events: number;
	malformedLines: number;
}

/**
 * The content blocks of a message event.
 * @param event The event.
 * @returns The blocks, or none.
 */
function contentBlocks(event: Json): Json[] {
	const message = event["message"];
	const content = isJson(message) ? message["content"] : undefined;
	return Array.isArray(content) ? content.filter(isJson) : [];
}

/**
 * A tool use that names a file, when the block is one.
 * @param block The content block.
 * @returns Its id, tool and path, or null.
 */
function fileToolUse(block: Json): { id: string; tool: string; file: string } | null {
	const id = stringField(block, "id");
	const input = toolInput(block);
	if (id === null || input === null) return null;
	const file = stringField(input, "file_path") ?? stringField(input, "path");
	return file === null ? null : { id, tool: stringField(block, "name") ?? "unknown", file };
}

/**
 * The input of a tool_use block, when the block is one.
 * @param block The content block.
 * @returns The input object, or null.
 */
function toolInput(block: Json): Json | null {
	const input = block["type"] === "tool_use" ? block["input"] : undefined;
	return isJson(input) ? input : null;
}

/**
 * Remembers each tool use that names a file.
 * @param trace The trace so far.
 * @param workspace The working directory paths resolve against.
 * @param event The assistant event.
 */
function takeAssistant(trace: TraceBuilder, workspace: string, event: Json): void {
	for (const block of contentBlocks(event)) {
		const use = fileToolUse(block);
		if (use === null) continue;
		trace.reads.set(use.id, {
			tool: use.tool,
			file: path.resolve(workspace, use.file),
			ok: false,
			image: false,
		});
		trace.order.push(use.id);
	}
}

/**
 * Whether a tool result answered with an image.
 * @param block The tool_result block.
 * @param answer The event's tool_use_result.
 * @returns True for an image answer.
 */
function answeredWithImage(block: Json, answer: unknown): boolean {
	if (isJson(answer) && answer["type"] === "image") return true;
	const content = block["content"];
	return (
		Array.isArray(content) &&
		content.some((item: unknown) => isJson(item) && item["type"] === "image")
	);
}

/**
 * Marks each tool result against its tool use.
 * @param trace The trace so far.
 * @param event The user event.
 */
function takeUser(trace: TraceBuilder, event: Json): void {
	for (const block of contentBlocks(event)) {
		const id = block["type"] === "tool_result" ? stringField(block, "tool_use_id") : null;
		const read = id === null ? undefined : trace.reads.get(id);
		if (read === undefined) continue;
		read.ok = block["is_error"] !== true;
		read.image = read.ok && answeredWithImage(block, event["tool_use_result"]);
	}
}

/**
 * Records a read Claude Code refused, by the path it was asked for.
 * @param trace The trace so far.
 * @param event The permission_denied event.
 */
function takeDenied(trace: TraceBuilder, event: Json): void {
	const id = stringField(event, "tool_use_id");
	const read = id === null ? undefined : trace.reads.get(id);
	trace.denied.push(read?.file ?? stringField(event, "message") ?? "unknown");
}

/**
 * Takes the session id and any refusal.
 * @param trace The trace so far.
 * @param event The system event.
 */
function takeSystem(trace: TraceBuilder, event: Json): void {
	const subtype = stringField(event, "subtype");
	if (subtype === "init") trace.sessionId = stringField(event, "session_id") ?? trace.sessionId;
	if (subtype === "permission_denied") takeDenied(trace, event);
}

/**
 * Takes the result line: usage, cost, the structured answer, or the failure.
 * @param trace The trace so far.
 * @param event The result event.
 */
function takeResult(trace: TraceBuilder, event: Json): void {
	trace.sessionId = stringField(event, "session_id") ?? trace.sessionId;
	trace.rawUsage = event["usage"] ?? null;
	trace.modelUsage = event["modelUsage"] ?? null;
	trace.usage = claudeUsageFrom(event["usage"]);
	trace.costUsd = numberField(event, "total_cost_usd");
	const structured = event["structured_output"];
	trace.structuredOutput = structured === undefined ? null : JSON.stringify(structured);
	trace.failure = resultFailure(event);
}

/**
 * Why a result line says the call failed, when it does.
 * @param event The result event.
 * @returns The failure text, or null.
 */
function resultFailure(event: Json): string | null {
	if (event["is_error"] !== true) return null;
	const subtype = stringField(event, "subtype") ?? "error";
	const text = stringField(event, "result");
	return text === null ? subtype : `${subtype}: ${text}`;
}

/**
 * Folds one event into the trace.
 * @param trace The trace so far.
 * @param workspace The working directory.
 * @param event The event.
 */
function takeEvent(trace: TraceBuilder, workspace: string, event: Json): void {
	trace.events += 1;
	switch (stringField(event, "type")) {
		case "assistant":
			takeAssistant(trace, workspace, event);
			break;
		case "user":
			takeUser(trace, event);
			break;
		case "system":
			takeSystem(trace, event);
			break;
		case "result":
			takeResult(trace, event);
			break;
		default:
			break;
	}
}

/**
 * Reads a whole stream. A line that is not JSON is counted, never fatal.
 * @param text The stream's text.
 * @param workspace The working directory the grader ran in.
 * @returns The trace.
 */
function parseClaudeTrace(text: string, workspace: string): ClaudeTrace {
	const trace: TraceBuilder = {
		sessionId: null,
		reads: new Map(),
		order: [],
		denied: [],
		usage: null,
		rawUsage: null,
		modelUsage: null,
		costUsd: null,
		structuredOutput: null,
		failure: null,
		events: 0,
		malformedLines: 0,
	};
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue;
		try {
			const event: unknown = JSON.parse(line);
			if (isJson(event)) takeEvent(trace, workspace, event);
			else trace.malformedLines += 1;
		} catch {
			trace.malformedLines += 1;
		}
	}
	const { reads, order, ...rest } = trace;
	return { ...rest, reads: order.map((id) => reads.get(id)).filter((read) => read !== undefined) };
}

/**
 * Replaces one string field with a note of its size, when it is a string.
 * @param holder The object.
 * @param key The field.
 */
function omitPayload(holder: unknown, key: string): void {
	if (!isJson(holder)) return;
	const value = holder[key];
	if (typeof value === "string") holder[key] = `<${value.length} base64 characters omitted>`;
}

/**
 * Replaces the image payloads of one tool_result block.
 * @param block The block.
 */
function redactBlock(block: Json): void {
	const content = block["type"] === "tool_result" ? block["content"] : undefined;
	if (!Array.isArray(content)) return;
	for (const item of content) {
		if (isJson(item) && item["type"] === "image") omitPayload(item["source"], "data");
	}
}

/**
 * Replaces base64 image payloads in one event with their size, so the
 * retained stream does not carry every picture a second time.
 * @param event The event.
 * @returns The event, with payloads replaced in place.
 */
function redactImages(event: Json): Json {
	const answer = event["tool_use_result"];
	if (isJson(answer)) omitPayload(answer["file"], "base64");
	for (const block of contentBlocks(event)) redactBlock(block);
	return event;
}

/**
 * The stream as retained: every line kept, image bytes replaced by their
 * size. The pictures themselves stay in the workspace.
 * @param text The stream's text.
 * @returns The redacted text.
 */
function redactedClaudeStream(text: string): string {
	return text
		.split("\n")
		.map((line) => {
			if (line.trim() === "") return line;
			try {
				const event: unknown = JSON.parse(line);
				return isJson(event) ? JSON.stringify(redactImages(event)) : line;
			} catch {
				return line;
			}
		})
		.join("\n");
}

export { claudeUsageFrom, parseClaudeTrace, redactedClaudeStream, type ClaudeTrace, type ToolRead };
