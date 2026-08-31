import type {
	CodexSession,
	SessionLoadedThreadPageResult,
	SessionThread,
	SessionThreadPageResult,
} from "../../codex-session/index.js";
import type { EpochOperationRecord } from "../../codex-epoch/index.js";
import type { ThreadLinkReason } from "../../codex-instructions/index.js";
import type { ChildEpoch, ChildId } from "../../../shared/codex-workbench-identity/index.js";
import { isEpochOperationRecord } from "./provenance.js";
import {
	CodexThreadLinkError,
	type CodexThreadLinkClassifier,
	type CodexThreadLinkClassifierOptions,
	type ThreadLinkClassification,
	type ThreadLinkCurrentEpoch,
	type ThreadLinkAllowedSource,
	type ThreadLinkExecutableStatus,
	type ThreadLinkObservation,
	type ThreadLinkSource,
	type ThreadLink,
	type ThreadLinkTarget,
} from "./contract.js";

const PAGE_LIMIT = 100;
const ALLOWED_SOURCES = Object.freeze(["cli", "vscode", "exec", "appServer"] as const);
const ALLOWED_SOURCE_SET = new Set<string>(ALLOWED_SOURCES);
const STATUS_VALUES = new Set(["notLoaded", "idle", "systemError", "active"]);
const THREAD_CREATION_KINDS = new Set([
	"create",
	"create_thread",
	"thread_create",
	"fork",
	"fork_thread",
	"thread_fork",
	"create_thread_initial_turn",
	"fork_thread_initial_turn",
	"thread_start",
]);
type ThreadListSession = Pick<CodexSession, "threadListPage" | "threadLoadedListPage">;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidResult(message: string, cause?: unknown): CodexThreadLinkError {
	return new CodexThreadLinkError("invalid_result", message, cause);
}

function listFailure(message: string, cause?: unknown): CodexThreadLinkError {
	return new CodexThreadLinkError("list_exhaustion_failure", message, cause);
}

function currentEpochOf(options: CodexThreadLinkClassifierOptions): ThreadLinkCurrentEpoch | null {
	try {
		if (options.currentEpoch !== undefined) {
			const value =
				typeof options.currentEpoch === "function" ? options.currentEpoch() : options.currentEpoch;
			if (value === null) return null;
			if (
				!isRecord(value) ||
				typeof value.childId !== "string" ||
				value.childId.length === 0 ||
				typeof value.epoch !== "string" ||
				value.epoch.length === 0
			) {
				throw new Error("the current epoch source returned an invalid child/epoch pair");
			}
			return Object.freeze({
				childId: value.childId as ChildId,
				epoch: value.epoch as ChildEpoch,
			});
		}
		if (options.epoch !== undefined) {
			const active = options.epoch.snapshot().manifest.activeEpoch;
			return active === null
				? null
				: Object.freeze({ childId: active.childId, epoch: active.epoch });
		}
	} catch (error) {
		throw new CodexThreadLinkError(
			"current_epoch_unavailable",
			"The current Codex child epoch could not be read; the thread link was not classified.",
			error,
		);
	}
	throw new CodexThreadLinkError(
		"current_epoch_unavailable",
		"Thread-link classification requires a live current epoch or an epoch store.",
	);
}

function validateTarget(target: ThreadLinkTarget): void {
	if (!isRecord(target) || typeof target.threadId !== "string" || target.threadId.length === 0) {
		throw new CodexThreadLinkError(
			"invalid_input",
			"A thread-link target requires one non-empty issued ThreadId.",
		);
	}
	if (
		target.childId !== null &&
		(typeof target.childId !== "string" || target.childId.length === 0)
	) {
		throw new CodexThreadLinkError(
			"invalid_input",
			"A thread-link childId must be an identity or null.",
		);
	}
	if (target.epoch !== null && (typeof target.epoch !== "string" || target.epoch.length === 0)) {
		throw new CodexThreadLinkError(
			"invalid_input",
			"A thread-link epoch must be an identity or null.",
		);
	}
	if (
		target.operationId !== undefined &&
		(typeof target.operationId !== "string" || target.operationId.length === 0)
	) {
		throw new CodexThreadLinkError("invalid_input", "A thread-link operationId must be a string.");
	}
}

function threadListParams(cursor: string | null) {
	return {
		cursor,
		limit: PAGE_LIMIT,
		sortKey: "recency_at" as const,
		sortDirection: "desc" as const,
		sourceKinds: [...ALLOWED_SOURCES],
		archived: false,
		useStateDbOnly: false,
	};
}

function loadedListParams(cursor: string | null) {
	return { cursor, limit: PAGE_LIMIT };
}

function assertThreadPage(value: unknown): asserts value is SessionThreadPageResult {
	if (!isRecord(value) || !Array.isArray(value.data)) {
		throw listFailure("thread/list returned an invalid page before exhaustion.");
	}
	if (value.nextCursor !== null && typeof value.nextCursor !== "string") {
		throw listFailure("thread/list returned an invalid nextCursor before exhaustion.");
	}
	for (const row of value.data) {
		if (!isRecord(row) || typeof row.id !== "string" || row.id.length === 0) {
			throw invalidResult("thread/list returned a row without a valid ThreadId.");
		}
	}
}

function assertLoadedPage(value: unknown): asserts value is SessionLoadedThreadPageResult {
	if (!isRecord(value) || !Array.isArray(value.data)) {
		throw listFailure("thread/loaded/list returned an invalid page before exhaustion.");
	}
	if (value.nextCursor !== null && typeof value.nextCursor !== "string") {
		throw listFailure("thread/loaded/list returned an invalid nextCursor before exhaustion.");
	}
	for (const id of value.data) {
		if (typeof id !== "string" || id.length === 0) {
			throw invalidResult("thread/loaded/list returned a value that is not a ThreadId.");
		}
	}
}

async function exhaustThreadList(session: ThreadListSession): Promise<readonly SessionThread[]> {
	const rows: SessionThread[] = [];
	const seenCursors = new Set<string>();
	let cursor: string | null = null;
	while (true) {
		let page: SessionThreadPageResult;
		try {
			page = await session.threadListPage(threadListParams(cursor));
		} catch (error) {
			if (error instanceof CodexThreadLinkError) throw error;
			throw new CodexThreadLinkError(
				"transport_failure",
				"thread/list could not be exhausted; the thread link was not classified.",
				error,
			);
		}
		assertThreadPage(page);
		rows.push(...page.data);
		const next = page.nextCursor;
		if (next === null) return rows;
		if (next === cursor || seenCursors.has(next)) {
			throw new CodexThreadLinkError(
				"repeated_cursor",
				`thread/list repeated cursor ${JSON.stringify(next)} before exhaustion.`,
			);
		}
		seenCursors.add(next);
		cursor = next;
	}
}

async function exhaustLoadedList(session: ThreadListSession): Promise<readonly string[]> {
	const ids: string[] = [];
	const seenCursors = new Set<string>();
	let cursor: string | null = null;
	while (true) {
		let page: SessionLoadedThreadPageResult;
		try {
			page = await session.threadLoadedListPage(loadedListParams(cursor));
		} catch (error) {
			if (error instanceof CodexThreadLinkError) throw error;
			throw new CodexThreadLinkError(
				"transport_failure",
				"thread/loaded/list could not be exhausted; the thread link was not classified.",
				error,
			);
		}
		assertLoadedPage(page);
		ids.push(...page.data);
		const next = page.nextCursor;
		if (next === null) return ids;
		if (next === cursor || seenCursors.has(next)) {
			throw new CodexThreadLinkError(
				"repeated_cursor",
				`thread/loaded/list repeated cursor ${JSON.stringify(next)} before exhaustion.`,
			);
		}
		seenCursors.add(next);
		cursor = next;
	}
}

function sourceOf(thread: SessionThread): ThreadLinkSource {
	const source = thread.source as unknown;
	if (typeof source === "string") {
		if (ALLOWED_SOURCE_SET.has(source) || source === "unknown") return source as ThreadLinkSource;
		return "unknown";
	}
	if (isRecord(source) && (Object.hasOwn(source, "custom") || Object.hasOwn(source, "subAgent"))) {
		return source as ThreadLinkSource;
	}
	return "unknown";
}

function statusOf(thread: SessionThread): SessionThread["status"]["type"] {
	const status = thread.status as unknown;
	if (!isRecord(status) || typeof status.type !== "string" || !STATUS_VALUES.has(status.type)) {
		throw invalidResult("thread/list returned a row with an invalid thread status.");
	}
	return status.type as SessionThread["status"]["type"];
}

function observedDirectInput(thread: SessionThread): boolean | null {
	return thread.canAcceptDirectInput === true
		? true
		: thread.canAcceptDirectInput === false
			? false
			: null;
}

function sourceReason(source: ThreadLinkSource): ThreadLinkReason | null {
	if (typeof source === "object" && source !== null) {
		if (Object.hasOwn(source, "custom")) return "thread_source_custom";
		if (Object.hasOwn(source, "subAgent")) return "thread_source_subagent";
		return "thread_source_unknown";
	}
	return ALLOWED_SOURCE_SET.has(source) ? null : "thread_source_unknown";
}

function recordFromProof(target: ThreadLinkTarget): EpochOperationRecord | null {
	if (target.provenance === undefined || target.provenance === null) return null;
	const value = target.provenance as unknown;
	const record = isRecord(value) && Object.hasOwn(value, "record") ? value.record : value;
	return isEpochOperationRecord(record) ? record : null;
}

function recordFromEpoch(
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
): EpochOperationRecord | null {
	if (target.provenance !== undefined) return recordFromProof(target);
	if (options.epoch === undefined || target.operationId === undefined) return null;
	try {
		return (
			options.epoch
				.snapshot()
				.manifest.records.find((record) => record.correlation.operationId === target.operationId) ??
			null
		);
	} catch (error) {
		throw new CodexThreadLinkError(
			"current_epoch_unavailable",
			"The epoch provenance could not be read; the thread link was not classified.",
			error,
		);
	}
}

function epochChangeReason(
	started: ThreadLinkCurrentEpoch | null,
	ended: ThreadLinkCurrentEpoch | null,
): ThreadLinkReason | null {
	if (started === null && ended === null) return null;
	if (started === null || ended === null) return "unknown_provenance";
	if (started.childId !== ended.childId) return "stale_child";
	if (started.epoch !== ended.epoch) return "prior_epoch";
	return null;
}

function ownershipReason(
	target: ThreadLinkTarget,
	started: ThreadLinkCurrentEpoch | null,
	ended: ThreadLinkCurrentEpoch | null,
	record: EpochOperationRecord | null,
): ThreadLinkReason | null {
	const changed = epochChangeReason(started, ended);
	if (changed !== null) return changed;
	if (ended === null) return "unknown_provenance";
	if (target.childId === null || target.epoch === null) return "unknown_provenance";
	if (target.childId !== ended.childId) return "stale_child";
	if (target.epoch !== ended.epoch) return "prior_epoch";
	if (record === null) return "unknown_provenance";
	if (record.correlation.childId !== ended.childId || record.provenance.childId !== ended.childId) {
		return "stale_child";
	}
	if (record.correlation.epoch !== ended.epoch || record.provenance.epoch !== ended.epoch) {
		return "prior_epoch";
	}
	if (target.operationId !== undefined && record.correlation.operationId !== target.operationId) {
		return "unknown_provenance";
	}
	const creationUnknown =
		record.outcome === "outcome_unknown" && THREAD_CREATION_KINDS.has(record.operation.kind);
	if (creationUnknown) return "thread_start_outcome_unknown";
	if (record.provenance.threadId !== target.threadId) return "unknown_provenance";
	if (record.status !== "committed" || record.outcome !== "delivered") {
		return "unknown_provenance";
	}
	return null;
}

function classifyReason(
	target: ThreadLinkTarget,
	started: ThreadLinkCurrentEpoch | null,
	ended: ThreadLinkCurrentEpoch | null,
	record: EpochOperationRecord | null,
	persistedRows: number,
	loadedOccurrences: number,
	thread: SessionThread | null,
): ThreadLinkReason | null {
	const ownership = ownershipReason(target, started, ended, record);
	if (ownership !== null) return ownership;
	if (persistedRows === 0) return "thread_list_missing";
	if (persistedRows > 1) return "thread_list_ambiguous";
	if (loadedOccurrences > 1) return "thread_loaded_list_ambiguous";
	if (thread === null) return "thread_list_missing";
	const source = sourceOf(thread);
	const sourceRefusal = sourceReason(source);
	if (sourceRefusal !== null) return sourceRefusal;
	const status = statusOf(thread);
	if (status === "notLoaded") return "thread_status_not_loaded";
	if (status === "systemError") return "thread_status_system_error";
	if (loadedOccurrences === 0) return "thread_loaded_list_missing";
	const directInput = observedDirectInput(thread);
	if (directInput === false) return "direct_input_false";
	if (directInput === null) return "direct_input_unknown";
	return null;
}

function observationFor(
	thread: SessionThread | null,
	loadedOccurrences: number,
	persistedRows: number,
): ThreadLinkObservation {
	if (thread === null) {
		return Object.freeze({
			persisted: persistedRows > 0,
			persistedRows,
			loaded: loadedOccurrences > 0,
			loadedOccurrences,
			source: "unknown",
			status: "notLoaded",
			canAcceptDirectInput: null,
		});
	}
	return Object.freeze({
		persisted: true,
		persistedRows,
		loaded: loadedOccurrences > 0,
		loadedOccurrences,
		source: sourceOf(thread),
		status: statusOf(thread),
		canAcceptDirectInput: observedDirectInput(thread),
	});
}

function linkFor(
	target: ThreadLinkTarget,
	current: ThreadLinkCurrentEpoch | null,
	observation: ThreadLinkObservation,
	refusal: ThreadLinkReason | null,
): ThreadLink {
	if (refusal === null) {
		if (current === null) throw new Error("an executable link must have a current epoch");
		return Object.freeze({
			kind: "thread_link" as const,
			state: "executable" as const,
			childId: current.childId,
			epoch: current.epoch,
			threadId: target.threadId,
			source: observation.source as ThreadLinkAllowedSource,
			status: observation.status as ThreadLinkExecutableStatus,
			loaded: true as const,
			canAcceptDirectInput: true as const,
			reason: null,
		});
	}
	return Object.freeze({
		kind: "thread_link" as const,
		state: "inspect_only" as const,
		childId: null,
		epoch: null,
		threadId: target.threadId,
		source: observation.source,
		status: observation.status,
		loaded: observation.loaded,
		canAcceptDirectInput: false as const,
		reason: refusal,
	});
}

export function createCodexThreadLinkClassifier(
	options: CodexThreadLinkClassifierOptions,
): CodexThreadLinkClassifier {
	if (options.currentEpoch === undefined && options.epoch === undefined) {
		throw new CodexThreadLinkError(
			"invalid_input",
			"Thread-link classification needs a current epoch source.",
		);
	}
	const session = options.session;
	const classify = async (target: ThreadLinkTarget): Promise<ThreadLinkClassification> => {
		validateTarget(target);
		const started = currentEpochOf(options);
		// The two result sets are deliberately exhausted in authored order. A
		// partial persisted or loaded page can never decide a stable link state.
		const persisted = await exhaustThreadList(session);
		const loaded = await exhaustLoadedList(session);
		const ended = currentEpochOf(options);
		const record = recordFromEpoch(options, target);
		const matchingThreads = persisted.filter((thread) => thread.id === target.threadId);
		const matchingLoaded = loaded.filter((threadId) => threadId === target.threadId);
		const thread = matchingThreads.length === 1 ? matchingThreads[0]! : null;
		const observation = observationFor(thread, matchingLoaded.length, matchingThreads.length);
		const refusal = classifyReason(
			target,
			started,
			ended,
			record,
			matchingThreads.length,
			matchingLoaded.length,
			thread,
		);
		return Object.freeze({
			link: linkFor(target, ended, observation, refusal),
			thread,
			observation,
			currentEpoch: ended,
		});
	};
	return Object.freeze({ classify });
}

export async function classifyCodexThreadLink(
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
): Promise<ThreadLinkClassification> {
	return createCodexThreadLinkClassifier(options).classify(target);
}
