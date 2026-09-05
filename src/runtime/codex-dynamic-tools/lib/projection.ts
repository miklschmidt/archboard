import type {
	SessionParams,
	SessionThread,
	SessionThreadItem,
	SessionThreadPageResult,
	SessionThreadTurnPageResult,
	SessionThreadItemPageResult,
	SessionLoadedThreadPageResult,
	SessionTurn,
	CodexSession,
} from "../../codex-session/index.js";
import type { ThreadId } from "../../../shared/codex-workbench-identity/index.js";
import {
	CodexDynamicToolsError,
	type DynamicCallerAuthority,
	type DynamicObservedTarget,
	type DynamicTargetAuthority,
} from "./contract.js";

export const THREAD_SOURCE_KINDS = Object.freeze(["cli", "vscode", "exec", "appServer"] as const);
export const AUTHORITY_PAGE_LIMIT = 100 as const;

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

type TargetClassifier = (
	threadId: unknown,
	observed?: DynamicObservedTarget,
) => Promise<DynamicTargetAuthority>;

export interface ListedThreadProjection {
	readonly threadId: string;
	readonly title: string | null;
	readonly status: SessionThread["status"]["type"];
	readonly source: "cli" | "vscode" | "exec" | "appServer";
	readonly epoch: DynamicTargetAuthority["epochState"];
	readonly ownership: DynamicTargetAuthority["ownership"];
	readonly loaded: boolean;
	readonly canAcceptDirectInput: boolean | null;
}

export interface ListProjection {
	readonly threads: readonly ListedThreadProjection[];
	readonly nextCursor: string | null;
}

export interface ReadTurnProjection {
	readonly turnId: string;
	readonly status: SessionTurn["status"];
	readonly summary: string;
	readonly outputsIncluded: boolean;
	readonly outputsTruncated: boolean;
}

export interface ReadProjection {
	readonly threadId: string;
	readonly turns: readonly ReadTurnProjection[];
	readonly nextCursor: string | null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function projectionError(message: string, cause?: unknown): CodexDynamicToolsError {
	return new CodexDynamicToolsError("system_error", message, cause);
}

function assertCursorPage(
	value: unknown,
	label: string,
): asserts value is {
	readonly data: readonly unknown[];
	readonly nextCursor: string | null;
} {
	if (!isRecord(value) || !Array.isArray(value["data"])) {
		throw projectionError(`${label} returned an invalid page.`);
	}
	if (value["nextCursor"] !== null && typeof value["nextCursor"] !== "string") {
		throw projectionError(`${label} returned an invalid nextCursor.`);
	}
}

function threadListParams(cursor: string | null, limit: number): SessionParams<"thread/list"> {
	return {
		cursor,
		limit,
		sortKey: "recency_at",
		sortDirection: "desc",
		sourceKinds: [...THREAD_SOURCE_KINDS],
		archived: false,
		useStateDbOnly: false,
	};
}

function loadedListParams(cursor: string | null): SessionParams<"thread/loaded/list"> {
	return { cursor, limit: AUTHORITY_PAGE_LIMIT };
}

async function exhaustThreadList(
	session: Pick<CodexSession, "threadListPage">,
): Promise<readonly SessionThread[]> {
	const rows: SessionThread[] = [];
	const seen = new Set<string>();
	let cursor: string | null = null;
	while (true) {
		let page: SessionThreadPageResult;
		try {
			page = await session.threadListPage(threadListParams(cursor, AUTHORITY_PAGE_LIMIT));
		} catch (error) {
			throw projectionError("thread/list could not be exhausted.", error);
		}
		assertCursorPage(page, "thread/list");
		for (const row of page.data) {
			if (!isRecord(row) || typeof row.id !== "string" || row.id.length === 0) {
				throw projectionError("thread/list returned a row without a ThreadId.");
			}
			rows.push(row as SessionThread);
		}
		if (page.nextCursor === null) {
			return rows;
		}
		if (page.nextCursor === cursor || seen.has(page.nextCursor)) {
			throw projectionError("thread/list repeated a cursor before exhaustion.");
		}
		seen.add(page.nextCursor);
		cursor = page.nextCursor;
	}
}

async function exhaustLoadedList(
	session: Pick<CodexSession, "threadLoadedListPage">,
): Promise<readonly ThreadId[]> {
	const ids: ThreadId[] = [];
	const seen = new Set<string>();
	let cursor: string | null = null;
	while (true) {
		let page: SessionLoadedThreadPageResult;
		try {
			page = await session.threadLoadedListPage(loadedListParams(cursor));
		} catch (error) {
			throw projectionError("thread/loaded/list could not be exhausted.", error);
		}
		assertCursorPage(page, "thread/loaded/list");
		for (const id of page.data) {
			if (typeof id !== "string" || id.length === 0) {
				throw projectionError("thread/loaded/list returned an invalid ThreadId.");
			}
			ids.push(id as ThreadId);
		}
		if (page.nextCursor === null) {
			return ids;
		}
		if (page.nextCursor === cursor || seen.has(page.nextCursor)) {
			throw projectionError("thread/loaded/list repeated a cursor before exhaustion.");
		}
		seen.add(page.nextCursor);
		cursor = page.nextCursor;
	}
}

function countIds(ids: readonly ThreadId[]): ReadonlyMap<string, number> {
	const counts = new Map<string, number>();
	for (const id of ids) {
		counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return counts;
}

function sourceOf(thread: SessionThread): ListedThreadProjection["source"] {
	if (
		typeof thread.source === "string" &&
		(THREAD_SOURCE_KINDS as readonly string[]).includes(thread.source)
	) {
		return thread.source as ListedThreadProjection["source"];
	}
	throw projectionError("thread/list returned a source outside the reviewed sourceKinds filter.");
}

function truncateUtf8(
	value: string,
	maximum: number,
): { readonly value: string; readonly truncated: boolean } {
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

function threadTitle(thread: SessionThread): string | null {
	const value = thread.name ?? (thread.preview.length === 0 ? null : thread.preview);
	if (value === null || value.length === 0) {
		return null;
	}
	return truncateUtf8(value, 512).value;
}

function observationFor(
	thread: SessionThread | null,
	persistedRows: number,
	loadedOccurrences: number,
): DynamicObservedTarget {
	return Object.freeze({ thread, persistedRows, loadedOccurrences });
}

export async function projectList(
	input: { readonly cursor: string | null; readonly limit: number },
	caller: DynamicCallerAuthority,
	options: {
		readonly session: Pick<CodexSession, "threadListPage" | "threadLoadedListPage">;
		readonly classifyTarget: TargetClassifier;
	},
): Promise<ListProjection> {
	let page: SessionThreadPageResult;
	try {
		page = await options.session.threadListPage(threadListParams(input.cursor, input.limit));
	} catch (error) {
		throw projectionError("thread/list could not be read.", error);
	}
	assertCursorPage(page, "thread/list");
	const loaded = countIds(await exhaustLoadedList(options.session));
	const persisted = countIds(page.data.map((thread) => thread.id));
	const rows: ListedThreadProjection[] = [];
	for (const thread of page.data) {
		if (!isRecord(thread) || typeof thread.id !== "string" || thread.id.length === 0) {
			throw projectionError("thread/list returned a row without a ThreadId.");
		}
		const occurrences = loaded.get(thread.id) ?? 0;
		const target = await options.classifyTarget(
			thread.id,
			observationFor(thread, persisted.get(thread.id) ?? 0, occurrences),
		);
		if (target.threadId !== thread.id) {
			throw projectionError("target authority changed the listed ThreadId.");
		}
		rows.push({
			threadId: target.wireThreadId,
			title: threadTitle(thread),
			status: target.status,
			source: sourceOf({ ...thread, source: target.source }),
			epoch: target.epochState,
			ownership: target.ownership,
			loaded: target.loaded,
			canAcceptDirectInput: target.directInput,
		});
	}
	void caller;
	return Object.freeze({
		threads: Object.freeze(rows),
		nextCursor: page.nextCursor,
	});
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/gu, " ").trim();
}

function userContentText(item: SessionThreadItem): string | null {
	if (item.type !== "userMessage") {
		return null;
	}
	let sawText = false;
	let sawMedia = false;
	for (const content of item.content) {
		if (content.type === "text") {
			sawText = true;
			const text = normalizeWhitespace(content.text);
			if (text.length > 0) {
				return text;
			}
		} else {
			sawMedia = true;
		}
	}
	return sawMedia ? "[media]" : sawText ? null : item.content.length > 0 ? "[media]" : null;
}

function assistantText(item: SessionThreadItem): string | null {
	if (item.type !== "agentMessage") {
		return null;
	}
	const text = normalizeWhitespace(item.text);
	return text.length === 0 ? null : text;
}

type OutputKind = "commandExecution" | "fileChange" | "functionCallOutput" | "mcpToolCall";

interface OutputEntry {
	readonly kind: OutputKind;
	readonly body: string;
}

interface OutputProjection {
	readonly value: string | null;
	readonly truncated: boolean;
}

function textBodiesFromFunctionOutput(value: unknown): readonly string[] {
	if (typeof value === "string") {
		return [value];
	}
	if (!Array.isArray(value)) {
		return [];
	}
	const bodies: string[] = [];
	for (const item of value) {
		if (!isRecord(item) || item["type"] !== "input_text" || typeof item["text"] !== "string") {
			continue;
		}
		bodies.push(item["text"]);
	}
	return bodies;
}

function textBodiesFromMcpResult(value: unknown): readonly string[] {
	if (!isRecord(value) || !Array.isArray(value["content"])) {
		return [];
	}
	const bodies: string[] = [];
	for (const item of value["content"]) {
		if (!isRecord(item) || item["type"] !== "text" || typeof item["text"] !== "string") {
			continue;
		}
		bodies.push(item["text"]);
	}
	return bodies;
}

function outputEntries(item: SessionThreadItem): readonly OutputEntry[] {
	switch (item.type) {
		case "commandExecution":
			return item.aggregatedOutput === null
				? []
				: [{ kind: "commandExecution", body: item.aggregatedOutput }];
		case "fileChange":
			return item.changes.map((change) => ({ kind: "fileChange", body: change.diff }));
		case "functionCallOutput":
			return textBodiesFromFunctionOutput(item.output).map((body) => ({
				kind: "functionCallOutput",
				body,
			}));
		case "mcpToolCall":
			return textBodiesFromMcpResult(item.result).map((body) => ({
				kind: "mcpToolCall",
				body,
			}));
		default:
			return [];
	}
}

function outputProjection(items: readonly SessionThreadItem[]): OutputProjection {
	const rendered: string[] = [];
	let truncated = false;
	for (const item of items) {
		for (const entry of outputEntries(item)) {
			const body = normalizeWhitespace(entry.body);
			if (body.length === 0) {
				continue;
			}
			const renderedEntry = truncateUtf8(`${entry.kind}: ${body}`, OUTPUT_ENTRY_MAX_UTF8_BYTES);
			truncated ||= renderedEntry.truncated;
			rendered.push(renderedEntry.value);
		}
	}
	if (rendered.length === 0) {
		return { value: null, truncated };
	}
	const aggregate = truncateUtf8(rendered.join(" | "), OUTPUT_AGGREGATE_MAX_UTF8_BYTES);
	return { value: aggregate.value, truncated: truncated || aggregate.truncated };
}

function rawTurnSummary(turn: SessionTurn): string {
	let user: string | null = null;
	let assistant: string | null = null;
	for (const item of turn.items) {
		if (user === null) {
			user = userContentText(item);
		}
		const nextAssistant = assistantText(item);
		if (nextAssistant !== null) {
			assistant = nextAssistant;
		}
	}
	return `${turn.status} · user: ${user ?? "none"} · assistant: ${assistant ?? "none"}`;
}

function turnSummary(
	turn: SessionTurn,
	outputs: OutputProjection | null,
): { readonly value: string; readonly truncated: boolean } {
	const base = rawTurnSummary(turn);
	const outputValue = outputs?.value;
	const outputWasTruncated = outputs?.truncated === true;
	if (outputValue === undefined || outputValue === null) {
		return truncateUtf8(base, SUMMARY_MAX_UTF8_BYTES);
	}
	const visibleOutput = truncateUtf8(outputValue, OUTPUT_SUMMARY_MAX_UTF8_BYTES);
	const baseBudget =
		SUMMARY_MAX_UTF8_BYTES -
		Buffer.byteLength(OUTPUT_MARKER, "utf8") -
		Buffer.byteLength(visibleOutput.value, "utf8");
	const visibleBase = truncateUtf8(base, baseBudget);
	return {
		value: `${visibleBase.value}${OUTPUT_MARKER}${visibleOutput.value}`,
		truncated: visibleBase.truncated || visibleOutput.truncated || outputWasTruncated,
	};
}

function itemForRequestedTurn(value: unknown, requestedTurnId: string): SessionThreadItem {
	if (
		!isRecord(value) ||
		typeof value["turnId"] !== "string" ||
		value["turnId"] !== requestedTurnId ||
		!isRecord(value["item"]) ||
		typeof value["item"]["type"] !== "string"
	) {
		throw projectionError("thread/items/list returned an item for a different or invalid turn.");
	}
	return value["item"] as SessionThreadItem;
}

export async function projectRead(
	input: {
		readonly targetThreadId: unknown;
		readonly cursor: string | null;
		readonly turnLimit: number;
		readonly includeOutputs: boolean;
	},
	caller: DynamicCallerAuthority,
	options: {
		readonly session: Pick<
			CodexSession,
			"threadListPage" | "threadLoadedListPage" | "threadTurnsListPage" | "threadItemsListPage"
		>;
		readonly classifyTarget: TargetClassifier;
	},
): Promise<ReadProjection> {
	const persisted = await exhaustThreadList(options.session);
	const loadedIds = await exhaustLoadedList(options.session);
	const loadedOccurrences = countIds(loadedIds);
	const requestedThreadId = String(input.targetThreadId);
	const persistedOccurrences = countIds(persisted.map((thread) => thread.id));
	let target: DynamicTargetAuthority | null = null;
	for (const thread of persisted) {
		const candidate = await options.classifyTarget(
			thread.id,
			observationFor(
				thread,
				persistedOccurrences.get(thread.id) ?? 0,
				loadedOccurrences.get(thread.id) ?? 0,
			),
		);
		if (
			candidate.wireThreadId !== requestedThreadId &&
			candidate.threadId !== input.targetThreadId
		) {
			continue;
		}
		if (target !== null) {
			if (
				candidate.authority !== target.authority ||
				candidate.threadId !== target.threadId ||
				candidate.wireThreadId !== target.wireThreadId
			) {
				throw projectionError(
					"thread/list returned ambiguous authority for the requested ThreadId.",
				);
			}
			continue;
		}
		target = candidate;
	}
	if (target === null) {
		target = await options.classifyTarget(input.targetThreadId, observationFor(null, 0, 0));
	}
	if (target.wireThreadId !== requestedThreadId && target.threadId !== input.targetThreadId) {
		throw projectionError("The target authority changed the requested ThreadId.");
	}
	let page: SessionThreadTurnPageResult;
	try {
		page = await options.session.threadTurnsListPage({
			threadId: target.threadId,
			cursor: input.cursor,
			limit: input.turnLimit,
			sortDirection: "desc",
			itemsView: "summary",
		});
	} catch (error) {
		throw projectionError("thread/turns/list could not be read.", error);
	}
	assertCursorPage(page, "thread/turns/list");
	const turns: ReadTurnProjection[] = [];
	for (const turn of page.data) {
		let outputs: OutputProjection | null = null;
		let pageTruncated = false;
		if (input.includeOutputs) {
			let itemPage: SessionThreadItemPageResult;
			try {
				itemPage = await options.session.threadItemsListPage({
					threadId: target.threadId,
					turnId: turn.id,
					cursor: null,
					limit: AUTHORITY_PAGE_LIMIT,
					sortDirection: "asc",
				});
			} catch (error) {
				throw projectionError("thread/items/list could not be read.", error);
			}
			assertCursorPage(itemPage, "thread/items/list");
			const items = itemPage.data.map((entry) => itemForRequestedTurn(entry, String(turn.id)));
			outputs = outputProjection(items);
			pageTruncated = itemPage.nextCursor !== null;
		}
		const summary = turnSummary(turn, outputs);
		turns.push({
			turnId: String(turn.id),
			status: turn.status,
			summary: summary.value,
			outputsIncluded: input.includeOutputs,
			outputsTruncated: summary.truncated || pageTruncated,
		});
	}
	void caller;
	return Object.freeze({
		threadId: target.wireThreadId,
		turns: Object.freeze(turns),
		nextCursor: page.nextCursor,
	});
}
