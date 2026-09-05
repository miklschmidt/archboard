import { randomUUID } from "node:crypto";
import {
	CodexEpochError,
	resolveThreadOwnershipProvenance,
	type EpochExecutionProof,
	type EpochOperationRecord,
} from "../../codex-epoch/index.js";
import { ADDITIONAL_CONTEXT_POLICY } from "../../codex-instructions/index.js";
import type {
	CodexSession,
	SessionLoadedThreadPageResult,
	SessionThread,
	SessionThreadPageResult,
} from "../../codex-session/index.js";
import { CODEX_SESSION_THREAD_SOURCE } from "../../codex-session/index.js";
import { CODEX_THREAD_STATUS_TYPES } from "../../../shared/codex-app-server-contract/index.js";
import type { ThreadId } from "../../../shared/codex-workbench-identity/index.js";
import {
	cloneAndFreeze,
	deepEqual,
	isEpochExecutionProof,
	isEpochOperationRecord,
	proofMatchesManifest,
} from "./provenance.js";
import {
	CodexThreadLinkError,
	type CodexThreadLinkClassifier,
	type CodexThreadLinkClassifierOptions,
	type ThreadLinkClassification,
	type ThreadLinkCandidate,
	type ThreadLinkCandidateDiscovery,
	type ThreadLinkCandidateSource,
	type ThreadLinkCondition,
	type ThreadLinkCurrentEpoch,
	type ThreadLinkEpochAuthority,
	type ThreadLinkAllowedSource,
	type ThreadLinkExecutableStatus,
	type ThreadLinkObservation,
	type ThreadLinkReason,
	type ThreadLinkSource,
	type ThreadLinkStatus,
	type ThreadLink,
	type ThreadLinkTarget,
} from "./contract.js";

const PAGE_LIMIT = 100;
const ALLOWED_SOURCES = Object.freeze([
	"cli",
	"vscode",
	"exec",
	"appServer",
] satisfies readonly ThreadLinkAllowedSource[]);
const ALLOWED_SOURCE_SET = new Set<string>(ALLOWED_SOURCES);
const STATUS_VALUES = new Set<string>(CODEX_THREAD_STATUS_TYPES);
const NON_EXECUTABLE_STATUS_SET = new Set<string>(
	ADDITIONAL_CONTEXT_POLICY.threadLink.nonExecutableStatuses,
);
const REASON_PRECEDENCE = ADDITIONAL_CONTEXT_POLICY.threadLink.reasonPrecedence;
type ThreadListSession = Pick<CodexSession, "threadListPage" | "threadLoadedListPage">;

function assertPolicyConformance(): void {
	const conditions = new Set(REASON_PRECEDENCE.map(({ condition }) => condition));
	const reasons = new Set(REASON_PRECEDENCE.map(({ reason }) => reason));
	if (
		conditions.size !== REASON_PRECEDENCE.length ||
		reasons.size !== REASON_PRECEDENCE.length ||
		NON_EXECUTABLE_STATUS_SET.size !== 1 ||
		!NON_EXECUTABLE_STATUS_SET.has("systemError") ||
		[...NON_EXECUTABLE_STATUS_SET].some((status) => !STATUS_VALUES.has(status))
	) {
		throw new Error(
			"additional-context thread-link policy has drifted from its classifier contract",
		);
	}
}

assertPolicyConformance();

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function authoredReason(condition: ThreadLinkCondition): ThreadLinkReason {
	const entry = REASON_PRECEDENCE.find((candidate) => candidate.condition === condition);
	if (entry === undefined) {
		throw new Error(`additional-context policy is missing condition ${condition}`);
	}
	return entry.reason;
}

function invalidResult(message: string, cause?: unknown): CodexThreadLinkError {
	return new CodexThreadLinkError("invalid_result", message, cause);
}

function isCurrentEpoch(value: unknown): value is ThreadLinkCurrentEpoch {
	return (
		isRecord(value) &&
		typeof value["childId"] === "string" &&
		value["childId"].length > 0 &&
		typeof value["epoch"] === "string" &&
		value["epoch"].length > 0
	);
}

function currentEpochOf(options: CodexThreadLinkClassifierOptions): ThreadLinkCurrentEpoch | null {
	try {
		if (options.currentEpoch !== undefined) {
			const value =
				typeof options.currentEpoch === "function" ? options.currentEpoch() : options.currentEpoch;
			if (value === null) {
				return null;
			}
			if (!isCurrentEpoch(value)) {
				throw new Error("the current epoch source returned an invalid child/epoch pair");
			}
			return Object.freeze({ childId: value.childId, epoch: value.epoch });
		}
		if (options.epoch !== undefined) {
			const active = options.epoch.snapshot().manifest.activeEpoch;
			if (active === null) {
				return null;
			}
			if (!isCurrentEpoch(active)) {
				throw new Error("the epoch store returned an invalid active child/epoch pair");
			}
			return Object.freeze({ childId: active.childId, epoch: active.epoch });
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
	if (!isRecord(value) || !Array.isArray(value["data"])) {
		throw new CodexThreadLinkError(
			"list_exhaustion_failure",
			"thread/list returned an invalid page before exhaustion.",
		);
	}
	if (value["nextCursor"] !== null && typeof value["nextCursor"] !== "string") {
		throw new CodexThreadLinkError(
			"list_exhaustion_failure",
			"thread/list returned an invalid nextCursor before exhaustion.",
		);
	}
	for (const row of value["data"]) {
		if (!isRecord(row) || typeof row["id"] !== "string" || row["id"].length === 0) {
			throw invalidResult("thread/list returned a row without a valid ThreadId.");
		}
	}
}

function assertLoadedPage(value: unknown): asserts value is SessionLoadedThreadPageResult {
	if (!isRecord(value) || !Array.isArray(value["data"])) {
		throw new CodexThreadLinkError(
			"list_exhaustion_failure",
			"thread/loaded/list returned an invalid page before exhaustion.",
		);
	}
	if (value["nextCursor"] !== null && typeof value["nextCursor"] !== "string") {
		throw new CodexThreadLinkError(
			"list_exhaustion_failure",
			"thread/loaded/list returned an invalid nextCursor before exhaustion.",
		);
	}
	for (const id of value["data"]) {
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
		let page: unknown;
		try {
			page = await session.threadListPage(threadListParams(cursor));
		} catch (error) {
			if (error instanceof CodexThreadLinkError) {
				throw error;
			}
			throw new CodexThreadLinkError(
				"transport_failure",
				"thread/list could not be exhausted; the thread link was not classified.",
				error,
			);
		}
		assertThreadPage(page);
		rows.push(...page.data);
		const next = page.nextCursor;
		if (next === null) {
			return rows;
		}
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

async function exhaustLoadedList(session: ThreadListSession): Promise<readonly ThreadId[]> {
	const ids: ThreadId[] = [];
	const seenCursors = new Set<string>();
	let cursor: string | null = null;
	while (true) {
		let page: unknown;
		try {
			page = await session.threadLoadedListPage(loadedListParams(cursor));
		} catch (error) {
			if (error instanceof CodexThreadLinkError) {
				throw error;
			}
			throw new CodexThreadLinkError(
				"transport_failure",
				"thread/loaded/list could not be exhausted; the thread link was not classified.",
				error,
			);
		}
		assertLoadedPage(page);
		ids.push(...page.data);
		const next = page.nextCursor;
		if (next === null) {
			return ids;
		}
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

export function isAllowedThreadLinkSource(value: unknown): value is ThreadLinkAllowedSource {
	return typeof value === "string" && ALLOWED_SOURCE_SET.has(value);
}

export function allowedThreadLinkSources(): readonly ThreadLinkAllowedSource[] {
	return ALLOWED_SOURCES;
}

function isThreadLinkSource(value: unknown): value is ThreadLinkSource {
	if (typeof value === "string") {
		return isAllowedThreadLinkSource(value) || value === "unknown";
	}
	if (!isRecord(value)) {
		return false;
	}
	return Object.hasOwn(value, "custom") || Object.hasOwn(value, "subAgent");
}

function sourceOf(thread: SessionThread): ThreadLinkSource {
	const source: unknown = thread.source;
	return isThreadLinkSource(source) ? source : "unknown";
}

export function isThreadLinkStatus(value: unknown): value is ThreadLinkStatus {
	return typeof value === "string" && STATUS_VALUES.has(value);
}

export function isExecutableThreadLinkStatus(value: unknown): value is ThreadLinkExecutableStatus {
	return (
		isThreadLinkStatus(value) && value !== "notLoaded" && !NON_EXECUTABLE_STATUS_SET.has(value)
	);
}

function statusOf(thread: SessionThread): SessionThread["status"]["type"] {
	const status: unknown = thread.status;
	if (!isRecord(status) || !isThreadLinkStatus(status["type"])) {
		throw invalidResult("thread/list returned a row with an invalid thread status.");
	}
	return status["type"];
}

function observedDirectInput(thread: SessionThread): boolean | null {
	const capability: unknown = thread.canAcceptDirectInput;
	return capability === true ? true : capability === false ? false : null;
}

function sourceReason(source: ThreadLinkSource): ThreadLinkReason | null {
	if (typeof source === "object" && source !== null) {
		if (Object.hasOwn(source, "custom")) {
			return authoredReason("thread_source_is_custom");
		}
		if (Object.hasOwn(source, "subAgent")) {
			return authoredReason("thread_source_is_subagent");
		}
		return authoredReason("thread_source_is_unknown");
	}
	return isAllowedThreadLinkSource(source) ? null : authoredReason("thread_source_is_unknown");
}

function statusReason(status: SessionThread["status"]["type"]): ThreadLinkReason | null {
	if (status === "notLoaded") {
		return authoredReason("thread_status_is_not_loaded");
	}
	if (NON_EXECUTABLE_STATUS_SET.has(status)) {
		return authoredReason("thread_status_is_system_error");
	}
	return null;
}

interface SuppliedEvidence {
	readonly record: EpochOperationRecord;
	readonly manifestRevision: number | null;
}

function suppliedEvidence(target: ThreadLinkTarget): SuppliedEvidence | null {
	const value = target.provenance;
	if (value === undefined || value === null) {
		return null;
	}
	if (isEpochExecutionProof(value)) {
		return { record: value.record, manifestRevision: value.manifestRevision };
	}
	if (isEpochOperationRecord(value)) {
		return { record: value, manifestRevision: null };
	}
	return null;
}

function hasMalformedEvidence(target: ThreadLinkTarget): boolean {
	return (
		target.provenance !== undefined &&
		target.provenance !== null &&
		suppliedEvidence(target) === null
	);
}

/** The authored special reason requires only the typed settlement state and wire boundary. */
function isThreadStartOutcomeUnknown(record: EpochOperationRecord): boolean {
	return (
		record.status === "inspect_only" &&
		record.outcome === "outcome_unknown" &&
		record.operation.rpc === "thread/start"
	);
}

interface DurableEvidence {
	readonly record: EpochOperationRecord | null;
	readonly proof: EpochExecutionProof | null;
	readonly reason: ThreadLinkReason | null;
}

function epochUnavailable(message: string, cause?: unknown): CodexThreadLinkError {
	return new CodexThreadLinkError("current_epoch_unavailable", message, cause);
}

function recordForOperation(
	manifest: { readonly records: readonly EpochOperationRecord[] },
	operationId: string,
): EpochOperationRecord | null {
	const matches = manifest.records.filter(
		(record) => record.correlation.operationId === operationId,
	);
	return matches.length === 1 ? (matches[0] ?? null) : null;
}

function reasonForEpochError(
	error: unknown,
	record: EpochOperationRecord | null,
): ThreadLinkReason {
	if (!(error instanceof CodexEpochError)) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (error.code === "stale_child") {
		return authoredReason("link_child_is_not_current_child");
	}
	if (error.code === "prior_epoch") {
		return authoredReason("link_or_provenance_epoch_is_prior");
	}
	if (error.code === "inspect_only" && record !== null && isThreadStartOutcomeUnknown(record)) {
		return authoredReason("thread_start_settlement_was_lost");
	}
	if (
		error.code === "unknown_provenance" ||
		error.code === "inspect_only" ||
		error.code === "not_executable" ||
		error.code === "not_initialized" ||
		error.code === "invalid_input"
	) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	throw epochUnavailable(
		"The live epoch proof could not be read; the thread link was not classified.",
		error,
	);
}

function durableEvidence(
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
): DurableEvidence {
	const unknown = authoredReason("current_epoch_ownership_is_unproven");
	const evidence = suppliedEvidence(target);
	if (hasMalformedEvidence(target)) {
		return { record: null, proof: null, reason: unknown };
	}
	if (
		options.epoch === undefined ||
		target.operationId === undefined ||
		target.childId === null ||
		target.epoch === null
	) {
		return { record: null, proof: null, reason: unknown };
	}

	let observedRecord: EpochOperationRecord | null;
	try {
		observedRecord = recordForOperation(options.epoch.snapshot().manifest, target.operationId);
	} catch (error) {
		throw epochUnavailable(
			"The durable epoch manifest could not be read; the thread link was not classified.",
			error,
		);
	}
	if (observedRecord === null || !isEpochOperationRecord(observedRecord)) {
		return { record: null, proof: null, reason: unknown };
	}

	let proof: EpochExecutionProof;
	try {
		proof = options.epoch.assertCurrent({
			childId: target.childId,
			epoch: target.epoch,
			operationId: target.operationId,
			threadId: target.threadId,
		});
	} catch (error) {
		return {
			record: observedRecord,
			proof: null,
			reason: reasonForEpochError(error, observedRecord),
		};
	}

	let currentManifest: ReturnType<
		NonNullable<CodexThreadLinkClassifierOptions["epoch"]>["snapshot"]
	>["manifest"];
	try {
		currentManifest = options.epoch.snapshot().manifest;
	} catch (error) {
		throw epochUnavailable(
			"The durable epoch manifest changed before proof adoption; the thread link was not classified.",
			error,
		);
	}
	if (
		!isEpochExecutionProof(proof) ||
		!proofMatchesManifest(proof, currentManifest) ||
		proof.record.correlation.operationId !== target.operationId ||
		!deepEqual(observedRecord, proof.record)
	) {
		return { record: observedRecord, proof: null, reason: unknown };
	}
	const activeEpoch = currentManifest.activeEpoch;
	if (activeEpoch === null) {
		return { record: proof.record, proof: null, reason: unknown };
	}
	if (activeEpoch.childId !== target.childId) {
		return {
			record: proof.record,
			proof: null,
			reason: authoredReason("link_child_is_not_current_child"),
		};
	}
	if (activeEpoch.epoch !== target.epoch) {
		return {
			record: proof.record,
			proof: null,
			reason: authoredReason("link_or_provenance_epoch_is_prior"),
		};
	}
	if (evidence !== null) {
		if (
			!deepEqual(evidence.record, proof.record) ||
			(evidence.manifestRevision !== null && evidence.manifestRevision !== proof.manifestRevision)
		) {
			return { record: proof.record, proof: null, reason: unknown };
		}
	}
	return { record: proof.record, proof: cloneAndFreeze(proof), reason: null };
}

function epochChangeReason(
	started: ThreadLinkCurrentEpoch | null,
	ended: ThreadLinkCurrentEpoch | null,
): ThreadLinkReason | null {
	if (started === null && ended === null) {
		return null;
	}
	if (started === null || ended === null) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (started.childId !== ended.childId) {
		return authoredReason("link_child_is_not_current_child");
	}
	if (started.epoch !== ended.epoch) {
		return authoredReason("link_or_provenance_epoch_is_prior");
	}
	return null;
}

function ownershipReason(
	target: ThreadLinkTarget,
	started: ThreadLinkCurrentEpoch | null,
	ended: ThreadLinkCurrentEpoch | null,
	record: EpochOperationRecord | null,
	durableReason: ThreadLinkReason | null,
): ThreadLinkReason | null {
	const changed = epochChangeReason(started, ended);
	if (changed !== null) {
		return changed;
	}
	if (ended === null) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (target.childId === null || target.epoch === null) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (target.childId !== ended.childId) {
		return authoredReason("link_child_is_not_current_child");
	}
	if (target.epoch !== ended.epoch) {
		return authoredReason("link_or_provenance_epoch_is_prior");
	}
	if (record === null) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (record.correlation.childId !== ended.childId || record.provenance.childId !== ended.childId) {
		return authoredReason("link_child_is_not_current_child");
	}
	if (record.correlation.epoch !== ended.epoch || record.provenance.epoch !== ended.epoch) {
		return authoredReason("link_or_provenance_epoch_is_prior");
	}
	if (target.operationId !== undefined && record.correlation.operationId !== target.operationId) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (durableReason !== null) {
		return durableReason;
	}
	if (record.provenance.threadId !== target.threadId) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (record.status !== "committed" || record.outcome !== "delivered") {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	return null;
}

function classifyReason(
	target: ThreadLinkTarget,
	started: ThreadLinkCurrentEpoch | null,
	ended: ThreadLinkCurrentEpoch | null,
	record: EpochOperationRecord | null,
	durableReason: ThreadLinkReason | null,
	persistedRows: number,
	loadedOccurrences: number,
	thread: SessionThread | null,
	ownedCreatedRoot: boolean,
): ThreadLinkReason | null {
	const ownership = ownershipReason(target, started, ended, record, durableReason);
	const source = thread === null ? "unknown" : sourceOf(thread);
	const status = thread === null ? null : statusOf(thread);
	const directInput = thread === null ? null : observedDirectInput(thread);
	const conditions = new Map<ThreadLinkCondition, boolean>([
		[
			"link_child_is_not_current_child",
			ownership === authoredReason("link_child_is_not_current_child"),
		],
		[
			"link_or_provenance_epoch_is_prior",
			ownership === authoredReason("link_or_provenance_epoch_is_prior"),
		],
		[
			"thread_start_settlement_was_lost",
			ownership === authoredReason("thread_start_settlement_was_lost"),
		],
		[
			"current_epoch_ownership_is_unproven",
			ownership === authoredReason("current_epoch_ownership_is_unproven"),
		],
		["persisted_target_row_is_missing", persistedRows === 0 && !ownedCreatedRoot],
		["persisted_target_rows_conflict", persistedRows > 1],
		["loaded_target_membership_is_duplicate_or_conflicting", loadedOccurrences > 1],
		["thread_source_is_custom", sourceReason(source) === authoredReason("thread_source_is_custom")],
		[
			"thread_source_is_subagent",
			sourceReason(source) === authoredReason("thread_source_is_subagent"),
		],
		[
			"thread_source_is_unknown",
			sourceReason(source) === authoredReason("thread_source_is_unknown"),
		],
		[
			"thread_status_is_not_loaded",
			status !== null && statusReason(status) === authoredReason("thread_status_is_not_loaded"),
		],
		[
			"thread_status_is_system_error",
			status !== null && statusReason(status) === authoredReason("thread_status_is_system_error"),
		],
		["loaded_target_membership_is_missing", loadedOccurrences === 0],
		["direct_input_capability_is_false", directInput === false],
		["direct_input_capability_is_null", directInput === null && thread !== null],
	]);
	if (
		conditions.size !== REASON_PRECEDENCE.length ||
		REASON_PRECEDENCE.some((entry) => !conditions.has(entry.condition))
	) {
		throw new Error("additional-context thread-link policy has an unimplemented refusal condition");
	}
	for (const entry of REASON_PRECEDENCE) {
		if (conditions.get(entry.condition) === true) {
			return entry.reason;
		}
	}
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
		persisted: persistedRows > 0,
		persistedRows,
		loaded: loadedOccurrences > 0,
		loadedOccurrences,
		source: sourceOf(thread),
		status: statusOf(thread),
		canAcceptDirectInput: observedDirectInput(thread),
	});
}

function isExecutableStatus(
	value: ThreadLinkObservation["status"],
): value is ThreadLinkExecutableStatus {
	return isExecutableThreadLinkStatus(value);
}

function linkFor(
	target: ThreadLinkTarget,
	current: ThreadLinkCurrentEpoch | null,
	observation: ThreadLinkObservation,
	refusal: ThreadLinkReason | null,
): ThreadLink {
	if (refusal === null) {
		if (
			current === null ||
			!isAllowedThreadLinkSource(observation.source) ||
			!isExecutableStatus(observation.status)
		) {
			throw new Error("an executable link failed its final source, status, or epoch guard");
		}
		return Object.freeze({
			kind: "thread_link" as const,
			state: "executable" as const,
			childId: current.childId,
			epoch: current.epoch,
			threadId: target.threadId,
			source: observation.source,
			status: observation.status,
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
		// Both result sets are exhausted before precedence is evaluated. A partial
		// page can never decide a stable link state.
		const persisted = await exhaustThreadList(session);
		let loaded = await exhaustLoadedList(session);
		const ownedRoot = await readOwnedCreatedRoot(options, target, persisted, loaded);
		// A direct read is another await: prove loaded membership again before binding.
		if (ownedRoot !== null) {
			loaded = await exhaustLoadedList(session);
		}
		const ended = currentEpochOf(options);
		return classifyFromExhausted(options, target, persisted, loaded, started, ended, ownedRoot);
	};
	return Object.freeze({ classify });
}

/** Empty roots are hidden by Codex's preview-filtered history list before the first turn. */
async function readOwnedCreatedRoot(
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
	persisted: readonly SessionThread[],
	loaded: readonly ThreadId[],
): Promise<SessionThread | null> {
	if (
		persisted.some((row) => row.id === target.threadId) ||
		loaded.filter((id) => id === target.threadId).length !== 1
	) {
		return null;
	}
	const evidence = durableEvidence(options, target);
	const record = evidence.record;
	const current = currentEpochOf(options);
	if (
		evidence.reason !== null ||
		evidence.proof === null ||
		record === null ||
		record.operation.rpc !== "thread/start" ||
		record.status !== "committed" ||
		record.outcome !== "delivered" ||
		record.provenance.threadSource !== CODEX_SESSION_THREAD_SOURCE ||
		record.provenance.workspaceRoot === null ||
		ownershipReason(target, current, current, record, evidence.reason) !== null
	) {
		return null;
	}
	let thread: SessionThread;
	try {
		({ thread } = await options.session.threadRead({
			threadId: target.threadId,
			includeTurns: false,
		}));
	} catch (error) {
		throw new CodexThreadLinkError(
			"transport_failure",
			"The owned thread could not be read; the thread link was not classified.",
			error,
		);
	}
	if (
		thread.id !== target.threadId ||
		thread.source !== CODEX_SESSION_THREAD_SOURCE ||
		thread.threadSource !== "archboard" ||
		thread.cwd !== record.provenance.workspaceRoot ||
		thread.modelProvider.length === 0 ||
		thread.historyMode !== "paginated" ||
		thread.ephemeral ||
		thread.parentThreadId !== null ||
		thread.forkedFromId !== null
	) {
		return null;
	}
	return cloneAndFreeze(thread);
}

function classifyFromExhausted(
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
	persisted: readonly SessionThread[],
	loaded: readonly ThreadId[],
	started: ThreadLinkCurrentEpoch | null,
	ended: ThreadLinkCurrentEpoch | null,
	ownedRoot: SessionThread | null = null,
): ThreadLinkClassification {
	validateTarget(target);
	const evidence = durableEvidence(options, target);
	const matchingThreads = persisted.filter((thread) => thread.id === target.threadId);
	const matchingLoaded = loaded.filter((threadId) => threadId === target.threadId);
	const thread = matchingThreads.length === 1 ? cloneAndFreeze(matchingThreads[0]!) : ownedRoot;
	const observation = observationFor(thread, matchingLoaded.length, matchingThreads.length);
	const refusal = classifyReason(
		target,
		started,
		ended,
		evidence.record,
		evidence.reason,
		matchingThreads.length,
		matchingLoaded.length,
		thread,
		ownedRoot !== null,
	);
	return Object.freeze({
		link: linkFor(target, ended, observation, refusal),
		thread,
		observation,
		currentEpoch: ended,
		proof: evidence.proof,
	});
}

function sameEpoch(
	left: ThreadLinkCurrentEpoch | null,
	right: ThreadLinkCurrentEpoch | null,
): boolean {
	return (
		(left === null && right === null) ||
		(left !== null &&
			right !== null &&
			left.childId === right.childId &&
			left.epoch === right.epoch)
	);
}

function epochFromSnapshot(
	snapshot: ReturnType<ThreadLinkEpochAuthority["snapshot"]>,
): ThreadLinkCurrentEpoch | null {
	const active = snapshot.manifest.activeEpoch;
	return active === null ? null : { childId: active.childId, epoch: active.epoch };
}

function candidateSource(source: ThreadLinkSource): ThreadLinkCandidateSource {
	if (typeof source === "string") {
		return source;
	}
	if (Object.hasOwn(source, "custom")) {
		return "custom";
	}
	if (Object.hasOwn(source, "subAgent")) {
		return "subAgent";
	}
	return "unknown";
}

interface ThreadLinkCandidateInventory {
	readonly result: ThreadLinkCandidateDiscovery;
	readonly targets: Map<
		string,
		{
			readonly target: ThreadLinkTarget;
			readonly epochRevision: number;
			readonly epochBytesHash: string | null;
		}
	>;
}

function assertSameDiscoveryGeneration(
	started: ReturnType<ThreadLinkEpochAuthority["snapshot"]>,
	current: ReturnType<ThreadLinkEpochAuthority["snapshot"]>,
	startedEpoch: ThreadLinkCurrentEpoch | null,
	currentEpoch: ThreadLinkCurrentEpoch | null,
	phase: "exhausted" | "classified",
): void {
	if (
		!sameEpoch(startedEpoch, currentEpoch) ||
		!sameEpoch(startedEpoch, epochFromSnapshot(started)) ||
		!sameEpoch(currentEpoch, epochFromSnapshot(current)) ||
		started.cas.revision !== current.cas.revision ||
		started.cas.bytesHash !== current.cas.bytesHash
	) {
		throw new CodexThreadLinkError(
			"conflict",
			`The current Codex authority changed while thread candidates were being ${phase}; refresh the candidate list.`,
		);
	}
}

/** Publish one complete persisted/loaded join owned by one durable epoch generation. */
export async function discoverCodexThreadLinkCandidates(
	options: CodexThreadLinkClassifierOptions & { readonly epoch: ThreadLinkEpochAuthority },
): Promise<ThreadLinkCandidateInventory> {
	const startedSnapshot = options.epoch.snapshot();
	const startedEpoch = epochFromSnapshot(startedSnapshot);
	const persisted = await exhaustThreadList(options.session);
	const loaded = await exhaustLoadedList(options.session);
	const exhaustedSnapshot = options.epoch.snapshot();
	const exhaustedEpoch = epochFromSnapshot(exhaustedSnapshot);
	assertSameDiscoveryGeneration(
		startedSnapshot,
		exhaustedSnapshot,
		startedEpoch,
		exhaustedEpoch,
		"exhausted",
	);

	const targets = new Map<
		string,
		{
			readonly target: ThreadLinkTarget;
			readonly epochRevision: number;
			readonly epochBytesHash: string | null;
		}
	>();
	const candidates: ThreadLinkCandidate[] = [...new Set(persisted.map(({ id }) => id))].map(
		(threadId) => {
			const record =
				resolveThreadOwnershipProvenance(exhaustedSnapshot.manifest, threadId)?.record ?? null;
			const target: ThreadLinkTarget = Object.freeze({
				threadId,
				childId: record?.correlation.childId ?? exhaustedEpoch?.childId ?? null,
				epoch: record?.correlation.epoch ?? exhaustedEpoch?.epoch ?? null,
				...(record === null
					? {}
					: {
							operationId: record.correlation.operationId,
							provenance: cloneAndFreeze(record),
						}),
			});
			const classification = classifyFromExhausted(
				options,
				target,
				persisted,
				loaded,
				startedEpoch,
				exhaustedEpoch,
			);
			let selectionId = randomUUID();
			while (targets.has(selectionId)) {
				selectionId = randomUUID();
			}
			targets.set(
				selectionId,
				Object.freeze({
					target,
					epochRevision: exhaustedSnapshot.cas.revision,
					epochBytesHash: exhaustedSnapshot.cas.bytesHash,
				}),
			);
			return Object.freeze({
				selectionId,
				threadId,
				state: classification.link.state,
				reason: classification.link.reason,
				source: candidateSource(classification.observation.source),
				status: classification.observation.status,
				loaded: classification.observation.loaded,
				canAcceptDirectInput: classification.observation.canAcceptDirectInput,
			});
		},
	);

	const finishedSnapshot = options.epoch.snapshot();
	assertSameDiscoveryGeneration(
		exhaustedSnapshot,
		finishedSnapshot,
		exhaustedEpoch,
		epochFromSnapshot(finishedSnapshot),
		"classified",
	);
	return Object.freeze({
		result: Object.freeze({ candidates: Object.freeze(candidates) }),
		targets,
	});
}

export async function classifyCodexThreadLink(
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
): Promise<ThreadLinkClassification> {
	return createCodexThreadLinkClassifier(options).classify(target);
}
