// What a Codex exec run said about itself, read from its `--json` event
// stream: the commands it ran, what it said at the end, and what it cost.
//
// Codex 0.154 prints one JSON object per line: thread.started, turn.started,
// item.started/updated/completed (agent_message, reasoning, command_execution,
// file_change, mcp_tool_call, web_search, todo_list), turn.completed with
// usage, and turn.failed or error. Only fields this harness reports are read;
// everything else stays in the retained raw file.

/** One shell command the author ran. */
interface CommandRecord {
	readonly command: string;
	readonly exitCode: number | null;
	readonly status: string;
	/** What the command printed, as Codex aggregated it; empty when it was not reported. */
	readonly output: string;
}

/** Token usage as the producer reports it. `cached` is a subset of `input`; `total` is input plus output. */
interface Usage {
	readonly input: number;
	readonly cached: number;
	readonly cacheWrite: number | null;
	readonly output: number;
	readonly reasoning: number | null;
	readonly total: number;
}

/** One file the author changed through Codex's editing tool rather than a command. */
interface FileChange {
	readonly path: string;
	/** What Codex says it did: add, update or delete. */
	readonly kind: string;
}

/** Everything a run's event stream said that the reports read. */
interface AuthorTrace {
	readonly threadId: string | null;
	readonly commands: readonly CommandRecord[];
	readonly fileChanges: readonly FileChange[];
	readonly messages: readonly string[];
	readonly usage: Usage | null;
	readonly failure: string | null;
	readonly events: number;
	readonly malformedLines: number;
}
type Json = Record<string, unknown>;

/**
 * Whether a value is a JSON object.
 * @param value The value.
 * @returns True for a non-null object.
 */
function isJson(value: unknown): value is Json {
	return typeof value === "object" && value !== null;
}

/**
 * A number field, or null when the producer did not say.
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
 * Usage from a turn.completed event, under the producer's semantics: cached
 * input is part of input, so the total is input plus output and never adds
 * cached again.
 * @param raw The usage object.
 * @returns The usage, or null when the input and output counts are absent.
 */
function usageFrom(raw: unknown): Usage | null {
	if (!isJson(raw)) return null;
	const input = numberField(raw, "input_tokens");
	const output = numberField(raw, "output_tokens");
	if (input === null || output === null) return null;
	return {
		input,
		cached: Math.min(numberField(raw, "cached_input_tokens") ?? 0, input),
		cacheWrite: numberField(raw, "cache_write_input_tokens"),
		output,
		reasoning: numberField(raw, "reasoning_output_tokens"),
		total: input + output,
	};
}

/**
 * The command text of a command_execution item, whichever spelling it has.
 * @param item The item.
 * @returns The command as one line.
 */
function commandText(item: Json): string {
	const command = item["command"];
	if (Array.isArray(command)) return command.map(String).join(" ");
	return typeof command === "string" ? command : "";
}

/**
 * A command record from a completed command_execution item.
 * @param item The item.
 * @returns The record.
 */
function commandRecord(item: Json): CommandRecord {
	return {
		command: commandText(item),
		exitCode: numberField(item, "exit_code"),
		status: stringField(item, "status") ?? "unknown",
		output: stringField(item, "aggregated_output") ?? "",
	};
}

/**
 * The file changes of a completed file_change item.
 * @param item The item.
 * @returns One record per changed file.
 */
function fileChanges(item: Json): FileChange[] {
	const changes = item["changes"];
	if (!Array.isArray(changes)) return [];
	return changes.flatMap((change: unknown) => {
		if (!isJson(change)) return [];
		const changed = stringField(change, "path");
		return changed === null
			? []
			: [{ path: changed, kind: stringField(change, "kind") ?? "unknown" }];
	});
}

/** A trace under construction. */
interface TraceBuilder {
	threadId: string | null;
	commands: CommandRecord[];
	fileChanges: FileChange[];
	messages: string[];
	usage: Usage | null;
	failure: string | null;
	events: number;
	malformedLines: number;
}

/**
 * The message of a failure event.
 * @param event The event.
 * @returns The message, or the event's type when it carries none.
 */
function failureText(event: Json): string {
	const error = event["error"];
	const nested = isJson(error) ? stringField(error, "message") : null;
	return nested ?? stringField(event, "message") ?? String(event["type"]);
}

/**
 * Folds one completed item into the trace.
 * @param trace The trace so far.
 * @param item The item.
 */
function takeItem(trace: TraceBuilder, item: unknown): void {
	if (!isJson(item)) return;
	if (item["type"] === "command_execution") trace.commands.push(commandRecord(item));
	if (item["type"] === "file_change") trace.fileChanges.push(...fileChanges(item));
	const text = stringField(item, "text");
	if (item["type"] === "agent_message" && text !== null) trace.messages.push(text);
}

/**
 * Remembers the thread, for resuming.
 * @param trace The trace so far.
 * @param event The event.
 */
function takeThreadStarted(trace: TraceBuilder, event: Json): void {
	trace.threadId = stringField(event, "thread_id") ?? trace.threadId;
}

/**
 * Takes a finished command or message.
 * @param trace The trace so far.
 * @param event The event.
 */
function takeItemCompleted(trace: TraceBuilder, event: Json): void {
	takeItem(trace, event["item"]);
}

/**
 * Takes the turn's usage.
 * @param trace The trace so far.
 * @param event The event.
 */
function takeTurnCompleted(trace: TraceBuilder, event: Json): void {
	trace.usage = usageFrom(event["usage"]) ?? trace.usage;
}

/**
 * Records why the turn, or the stream, failed.
 * @param trace The trace so far.
 * @param event The event.
 */
function takeFailure(trace: TraceBuilder, event: Json): void {
	trace.failure = failureText(event);
}

const TAKERS: Record<string, (trace: TraceBuilder, event: Json) => void> = {
	"thread.started": takeThreadStarted,
	"item.completed": takeItemCompleted,
	"turn.completed": takeTurnCompleted,
	"turn.failed": takeFailure,
	error: takeFailure,
};

/**
 * Folds one event into the trace.
 * @param trace The trace so far.
 * @param event The event.
 */
function takeEvent(trace: TraceBuilder, event: Json): void {
	trace.events += 1;
	TAKERS[stringField(event, "type") ?? ""]?.(trace, event);
}

/**
 * Folds one line of the stream into the trace; a line that is not an event is counted.
 * @param trace The trace so far.
 * @param line The line.
 */
function takeLine(trace: TraceBuilder, line: string): void {
	try {
		const event: unknown = JSON.parse(line);
		if (isJson(event)) takeEvent(trace, event);
		else trace.malformedLines += 1;
	} catch {
		trace.malformedLines += 1;
	}
}

/**
 * Reads a whole JSONL stream. A line that is not JSON is counted, never fatal:
 * Codex may print a warning to stdout before the first event.
 * @param text The stream's text.
 * @returns The trace.
 */
function parseTrace(text: string): AuthorTrace {
	const trace: TraceBuilder = {
		threadId: null,
		commands: [],
		fileChanges: [],
		messages: [],
		usage: null,
		failure: null,
		events: 0,
		malformedLines: 0,
	};
	for (const line of text.split("\n")) {
		if (line.trim() !== "") takeLine(trace, line);
	}
	return trace;
}

export { parseTrace, usageFrom, type AuthorTrace, type CommandRecord, type FileChange, type Usage };
export {
	classCounts,
	classifyCommands,
	exposureCounts,
	guidanceFilesRead,
	guidanceStanding,
	simpleCommands,
	unwrapped,
	type ClassificationContext,
	type ClassifiedCommand,
	type CommandClass,
	type ExposureKind,
	type ExposureRoots,
	type GuidanceStanding,
} from "@/runtime/skill-evaluation/lib/classify";
