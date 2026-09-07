import type { SessionThread, SessionThreadItem, SessionTurn } from "@/runtime/codex-session";
import { isRecord, projectionError } from "@/runtime/codex-dynamic-tools/lib/projection-pages";

/**
 * The authored read projection keeps each rendered output entry within 256
 * UTF-8 bytes, the output group within 1024 bytes, the visible output section
 * within 256 bytes, and the complete summary within the documented 512-byte
 * response bound.
 */
const SUMMARY_MAX_UTF8_BYTES = 512 as const;
const OUTPUT_ENTRY_MAX_UTF8_BYTES = 256 as const;
const OUTPUT_AGGREGATE_MAX_UTF8_BYTES = 1024 as const;
const OUTPUT_SUMMARY_MAX_UTF8_BYTES = 256 as const;
const OUTPUT_MARKER = " · outputs: " as const;

/** The longest thread title a listing carries. */
const TITLE_MAX_UTF8_BYTES = 512 as const;

/** What one output entry contributes to a turn's summary. */
interface OutputEntry {
	readonly kind: "commandExecution" | "fileChange" | "functionCallOutput" | "mcpToolCall";
	readonly body: string;
}

/** A turn's outputs, and whether anything was cut to fit. */
interface OutputProjection {
	readonly value: string | null;
	readonly truncated: boolean;
}

/** A piece of rendered text, and whether it was cut to fit. */
interface BoundedText {
	readonly value: string;
	readonly truncated: boolean;
}

/**
 * Cut a string to fit a byte budget, marking what was cut with an ellipsis so a reader can see
 * that there was more. The budget is in UTF-8 bytes because that is what the response bound is.
 * @param value The text.
 * @param maximum The byte budget.
 * @returns The text that fits, and whether anything was cut.
 */
function truncateUtf8(value: string, maximum: number): BoundedText {
	if (Buffer.byteLength(value, "utf8") <= maximum) {
		return { value, truncated: false };
	}
	const ellipsis = "…";
	const budget = maximum - Buffer.byteLength(ellipsis, "utf8");
	let result = "";
	for (const character of value) {
		if (Buffer.byteLength(result + character, "utf8") > budget) {
			break;
		}
		result += character;
	}
	return { value: `${result}${ellipsis}`, truncated: true };
}

/**
 * Collapse every run of whitespace to one space, so a summary reads as one line however the
 * text was laid out.
 * @param value The text.
 * @returns The collapsed text.
 */
function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/gu, " ").trim();
}

/**
 * What to call a thread in a listing: its own name, or failing that its preview.
 * @param thread The thread.
 * @returns The title, or null when the thread has nothing to be called by.
 */
function threadTitle(thread: SessionThread): string | null {
	const value = thread.name ?? (thread.preview.length === 0 ? null : thread.preview);
	if (value === null || value.length === 0) {
		return null;
	}
	return truncateUtf8(value, TITLE_MAX_UTF8_BYTES).value;
}

/** What a user's message was found to contain. */
interface UserContent {
	readonly text: string | null;
	readonly sawText: boolean;
	readonly sawMedia: boolean;
}

/**
 * Read a user message's content, keeping the first piece of text that says anything and noting
 * whether there was text or media at all.
 * @param item The thread item.
 * @returns What the message contained.
 */
function readUserContent(item: SessionThreadItem & { type: "userMessage" }): UserContent {
	let sawText = false;
	let sawMedia = false;
	for (const content of item.content) {
		if (content.type !== "text") {
			sawMedia = true;
			continue;
		}
		sawText = true;
		const text = normalizeWhitespace(content.text);
		if (text.length > 0) {
			return { text, sawText, sawMedia };
		}
	}
	return { text: null, sawText, sawMedia };
}

/**
 * What a user said in one turn, as one line. A message that carried only media is reported as
 * media rather than as silence, so a summary never implies the user said nothing.
 * @param item The thread item.
 * @returns The line, or null when the item is not a user message that says anything.
 */
function userContentText(item: SessionThreadItem): string | null {
	if (item.type !== "userMessage") {
		return null;
	}
	const content = readUserContent(item);
	if (content.text !== null) {
		return content.text;
	}
	if (content.sawMedia) {
		return "[media]";
	}
	if (content.sawText) {
		return null;
	}
	return item.content.length > 0 ? "[media]" : null;
}

/**
 * What the assistant said in one item, as one line.
 * @param item The thread item.
 * @returns The line, or null when the item is not an assistant message that says anything.
 */
function assistantText(item: SessionThreadItem): string | null {
	if (item.type !== "agentMessage") {
		return null;
	}
	const text = normalizeWhitespace(item.text);
	return text.length === 0 ? null : text;
}

/**
 * The text a function call's output carries, in whichever of the two shapes it came in.
 * @param value The raw output.
 * @returns The text bodies.
 */
function textBodiesFromFunctionOutput(value: unknown): readonly string[] {
	if (typeof value === "string") {
		return [value];
	}
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((item) => (isInputText(item) ? [item["text"]] : []));
}

/**
 * Whether a value is a function-output entry carrying text.
 * @param item The entry.
 * @returns Whether it carries text.
 */
function isInputText(item: unknown): item is { readonly text: string } {
	if (!isRecord(item) || item["type"] !== "input_text") {
		return false;
	}
	return typeof item["text"] === "string";
}

/**
 * The text an MCP tool result carries.
 * @param value The raw result.
 * @returns The text bodies.
 */
function textBodiesFromMcpResult(value: unknown): readonly string[] {
	if (!isRecord(value) || !Array.isArray(value["content"])) {
		return [];
	}
	return value["content"].flatMap((item) => (isTextContent(item) ? [item["text"]] : []));
}

/**
 * Whether a value is an MCP content entry carrying text.
 * @param item The entry.
 * @returns Whether it carries text.
 */
function isTextContent(item: unknown): item is { readonly text: string } {
	if (!isRecord(item) || item["type"] !== "text") {
		return false;
	}
	return typeof item["text"] === "string";
}

/**
 * What one thread item contributes to a turn's outputs: a command's aggregated output, each of
 * a file change's diffs, or the text a tool call returned.
 * @param item The thread item.
 * @returns Its output entries.
 */
function outputEntries(item: SessionThreadItem): readonly OutputEntry[] {
	switch (item.type) {
		case "commandExecution":
			return item.aggregatedOutput === null
				? []
				: [{ kind: "commandExecution", body: item.aggregatedOutput }];
		case "fileChange":
			return item.changes.map((change) => ({ kind: "fileChange" as const, body: change.diff }));
		case "functionCallOutput":
			return textBodiesFromFunctionOutput(item.output).map((body) => ({
				kind: "functionCallOutput" as const,
				body,
			}));
		case "mcpToolCall":
			return textBodiesFromMcpResult(item.result).map((body) => ({
				kind: "mcpToolCall" as const,
				body,
			}));
		default:
			return [];
	}
}

/**
 * A turn's outputs as one bounded line, each entry cut to its own budget and the whole group
 * cut to the group's, so a reader is told what ran without the response outgrowing its bound.
 * @param items The turn's items.
 * @returns The outputs, and whether anything was cut.
 */
function outputProjection(items: readonly SessionThreadItem[]): OutputProjection {
	const rendered: string[] = [];
	let truncated = false;
	for (const entry of items.flatMap((item) => outputEntries(item))) {
		const body = normalizeWhitespace(entry.body);
		if (body.length === 0) {
			continue;
		}
		const renderedEntry = truncateUtf8(`${entry.kind}: ${body}`, OUTPUT_ENTRY_MAX_UTF8_BYTES);
		truncated ||= renderedEntry.truncated;
		rendered.push(renderedEntry.value);
	}
	if (rendered.length === 0) {
		return { value: null, truncated };
	}
	const aggregate = truncateUtf8(rendered.join(" | "), OUTPUT_AGGREGATE_MAX_UTF8_BYTES);
	return { value: aggregate.value, truncated: truncated || aggregate.truncated };
}

/**
 * What happened in one turn, before any of it is cut to fit: its status, what the user asked
 * and what the assistant last said.
 * @param turn The turn.
 * @returns The summary.
 */
function rawTurnSummary(turn: SessionTurn): string {
	let user: string | null = null;
	let assistant: string | null = null;
	for (const item of turn.items) {
		user ??= userContentText(item);
		const nextAssistant = assistantText(item);
		if (nextAssistant !== null) {
			assistant = nextAssistant;
		}
	}
	return `${turn.status} · user: ${user ?? "none"} · assistant: ${assistant ?? "none"}`;
}

/**
 * One turn as the line the read projection publishes. When outputs are included, the summary's
 * own budget is reduced by what the outputs take, so the whole line stays within the documented
 * response bound rather than the outputs pushing it over.
 * @param turn The turn.
 * @param outputs The turn's outputs, when they were asked for.
 * @returns The line, and whether anything was cut.
 */
function turnSummary(turn: SessionTurn, outputs: OutputProjection | null): BoundedText {
	const base = rawTurnSummary(turn);
	const outputValue = outputs?.value ?? null;
	const outputTruncated = outputs?.truncated === true;
	if (outputValue === null) {
		return truncateUtf8(base, SUMMARY_MAX_UTF8_BYTES);
	}
	const visibleOutput = truncateUtf8(outputValue, OUTPUT_SUMMARY_MAX_UTF8_BYTES);
	return joinOutputs(base, visibleOutput, outputTruncated);
}

/**
 * Put a turn's summary and its visible outputs together, cutting the summary to whatever budget
 * the outputs left it.
 * @param base The summary before anything is cut.
 * @param visibleOutput The outputs as they will be shown.
 * @param outputTruncated Whether the outputs were already cut before this.
 * @returns The line, and whether anything was cut.
 */
function joinOutputs(
	base: string,
	visibleOutput: BoundedText,
	outputTruncated: boolean,
): BoundedText {
	const baseBudget =
		SUMMARY_MAX_UTF8_BYTES -
		Buffer.byteLength(OUTPUT_MARKER, "utf8") -
		Buffer.byteLength(visibleOutput.value, "utf8");
	const visibleBase = truncateUtf8(base, baseBudget);
	return {
		value: `${visibleBase.value}${OUTPUT_MARKER}${visibleOutput.value}`,
		truncated: visibleBase.truncated || visibleOutput.truncated || outputTruncated,
	};
}

/**
 * The item an items page returned, refusing one that belongs to a different turn than the one
 * asked for, since that would attribute output to the wrong turn.
 * @param value What the page returned.
 * @param requestedTurnId The turn that was asked about.
 * @returns The item.
 */
function itemForRequestedTurn(value: unknown, requestedTurnId: string): SessionThreadItem {
	if (!isRecord(value) || value["turnId"] !== requestedTurnId) {
		throw projectionError("thread/items/list returned an item for a different or invalid turn.");
	}
	const item = value["item"];
	if (!isRecord(item) || typeof item["type"] !== "string") {
		throw projectionError("thread/items/list returned an item for a different or invalid turn.");
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the entry is a page row whose turn and item shape were both just checked; the item's own fields are read through the session's own union
	return item as SessionThreadItem;
}

export { type OutputProjection, itemForRequestedTurn, outputProjection, threadTitle, turnSummary };
