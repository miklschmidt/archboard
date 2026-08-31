import type { EpochOperationRecord, EpochTransaction } from "../../codex-epoch/index.js";
import { CodexSessionMutationError } from "../../codex-session/index.js";
import type { ThreadLinkClassification } from "../../codex-thread-link/index.js";
import {
	CodexWorkhorseQueueError,
	type WorkhorseQueueMutation,
} from "../../codex-workhorse-queue/index.js";
import type { TransportServerNotification } from "../../codex-transport/server-requests.js";
import type {
	OperationId,
	QueuedSubmissionId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	CodexWorkhorseOperationsError,
	type WorkhorseCoordinatorCall,
	type WorkhorseOperationBinding,
	type WorkhorseOperationClassification,
	type WorkhorseOperationCorrelation,
	type WorkhorseOperationDelivery,
	type WorkhorseOperationEvent,
	type WorkhorseOperationEventListener,
	type WorkhorseOperationName,
	type WorkhorseOperationOptions,
	type WorkhorseOperationRpc,
	type WorkhorseOperationTarget,
} from "./contract.js";

export const INPUT_LIMIT_BYTES = 4_096;
export const WORKHORSE_CREATION_KIND = "create_thread";
export const WORKHORSE_THREAD_SOURCE = "archboard";
export const ATTENTION_FLAGS: ReadonlySet<string> = new Set([
	"waitingOnApproval",
	"waitingOnUserInput",
]);

export type MutationOperation = Exclude<WorkhorseOperationName, "inspect_workhorse">;
export type QueueMutation = WorkhorseQueueMutation;

export interface OperationState {
	readonly operationId: OperationId;
	readonly operationIdWire: string;
	readonly operation: MutationOperation;
	readonly queueOperation: QueueMutation | null;
	readonly rpc: WorkhorseOperationRpc;
	readonly call: WorkhorseCoordinatorCall;
	readonly binding: WorkhorseOperationBinding;
	readonly coordinatorThreadId: ThreadId;
	readonly workhorseThreadId: ThreadId;
	readonly transaction: EpochTransaction;
	readonly clientUserMessageId: string | null;
	queuedSubmissionId: QueuedSubmissionId | null;
	turnId: TurnId | null;
	outcome: WorkhorseOperationDelivery;
	durableSettled: boolean;
	startedEmitted: boolean;
	terminalEmitted: boolean;
}

export type RawNotification = TransportServerNotification["notification"];
export type TurnNotification = Extract<
	RawNotification,
	{ readonly method: "turn/started" | "turn/completed" }
>;

export interface StageInput {
	readonly operationId: OperationId;
	readonly operationIdWire: string;
	readonly operation: MutationOperation;
	readonly queueOperation: QueueMutation | null;
	readonly rpc?: WorkhorseOperationRpc;
	readonly call: WorkhorseCoordinatorCall;
	readonly binding: WorkhorseOperationBinding;
	readonly workhorse: ThreadLinkClassification;
	readonly clientUserMessageId: string | null;
}

export interface WorkhorseValidation {
	readonly currentBinding: () => WorkhorseOperationBinding;
	readonly assertCurrentBinding: (binding: WorkhorseOperationBinding) => void;
	readonly assertCall: (call: WorkhorseCoordinatorCall, tool: WorkhorseOperationName) => void;
	readonly classify: (
		binding: WorkhorseOperationBinding,
		call: WorkhorseCoordinatorCall,
		tool: WorkhorseOperationName,
	) => Promise<{
		readonly binding: WorkhorseOperationBinding;
		readonly coordinator: WorkhorseOperationClassification;
		readonly workhorse: WorkhorseOperationClassification;
	}>;
}

export interface WorkhorseEvents {
	readonly operations: Map<string, OperationState>;
	readonly activeTurns: Map<string, TurnId>;
	readonly listeners: Set<WorkhorseOperationEventListener>;
	readonly subscribe: (listener: WorkhorseOperationEventListener) => () => void;
	readonly correlation: (state: OperationState) => WorkhorseOperationCorrelation;
	readonly emit: (
		state: OperationState,
		type: WorkhorseOperationEvent["type"],
		outcome: WorkhorseOperationDelivery,
		queue?: readonly { readonly id: QueuedSubmissionId }[],
		detail?: string | null,
	) => void;
	readonly stage: (input: StageInput) => OperationState;
	readonly settleDurable: (
		state: OperationState,
		requested: Exclude<WorkhorseOperationDelivery, "pending">,
		detail: string | null,
	) => Exclude<WorkhorseOperationDelivery, "pending">;
	readonly terminal: (
		state: OperationState,
		type: "completed" | "failed",
		queue: readonly { readonly id: QueuedSubmissionId }[],
		detail: string | null,
	) => void;
	readonly clear: (state: OperationState) => void;
	readonly reconcileUnknownQueue: (
		queue: readonly { readonly id: QueuedSubmissionId; readonly clientUserMessageId: string }[],
	) => void;
	readonly scheduleQueueReconciliation: () => void;
}

export interface WorkhorseRuntime extends WorkhorseValidation, WorkhorseEvents {
	readonly options: WorkhorseOperationOptions;
	readonly enqueue: <Value>(work: () => Promise<Value>) => Promise<Value>;
}

export function freeze<T>(value: T): T {
	return Object.freeze(value);
}

export function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : "unknown error";
}

export function boundedDetail(value: string): string {
	if (Buffer.byteLength(value, "utf8") <= INPUT_LIMIT_BYTES) return value;
	const suffix = "...";
	const budget = INPUT_LIMIT_BYTES - Buffer.byteLength(suffix, "utf8");
	let bytes = 0;
	let prefix = "";
	for (const character of value) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (bytes + characterBytes > budget) break;
		prefix += character;
		bytes += characterBytes;
	}
	return `${prefix}${suffix}`;
}

export function sameCall(left: WorkhorseCoordinatorCall, right: WorkhorseCoordinatorCall): boolean {
	return (
		left.child === right.child &&
		left.epoch === right.epoch &&
		left.threadId === right.threadId &&
		left.turnId === right.turnId &&
		left.callId === right.callId &&
		left.namespace === right.namespace &&
		left.tool === right.tool &&
		left.manifestHash === right.manifestHash
	);
}

export function sameTarget(
	left: WorkhorseOperationTarget,
	right: WorkhorseOperationTarget,
): boolean {
	return (
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.threadId === right.threadId &&
		left.operationId === right.operationId
	);
}

export function sameBinding(
	left: WorkhorseOperationBinding,
	right: WorkhorseOperationBinding,
): boolean {
	return (
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		sameTarget(left.coordinator, right.coordinator) &&
		sameTarget(left.workhorse, right.workhorse)
	);
}

export function snapshotTarget(target: WorkhorseOperationTarget): WorkhorseOperationTarget {
	return freeze({ ...target });
}

export function snapshotBinding(binding: WorkhorseOperationBinding): WorkhorseOperationBinding {
	return freeze({
		childId: binding.childId,
		epoch: binding.epoch,
		coordinator: snapshotTarget(binding.coordinator),
		workhorse: snapshotTarget(binding.workhorse),
	});
}

export function snapshotCall(call: WorkhorseCoordinatorCall): WorkhorseCoordinatorCall {
	return freeze({ ...call });
}

export function operationRpc(
	operation: MutationOperation,
	queueOperation?: QueueMutation,
	rpcOverride?: WorkhorseOperationRpc,
): WorkhorseOperationRpc {
	if (rpcOverride !== undefined) return rpcOverride;
	if (operation === "delegate_to_workhorse") return "turn/start";
	if (operation === "steer_workhorse") return "turn/steer";
	if (queueOperation === undefined) throw new TypeError("queue mutation is required");
	return `thread/queue/${queueOperation}`;
}

export function operationError(
	code: ConstructorParameters<typeof CodexWorkhorseOperationsError>[0],
	message: string,
	options: ConstructorParameters<typeof CodexWorkhorseOperationsError>[2] = {},
): CodexWorkhorseOperationsError {
	return new CodexWorkhorseOperationsError(code, message, options);
}

export function mapLinkReason(
	reason: string,
): ConstructorParameters<typeof CodexWorkhorseOperationsError>[0] {
	switch (reason) {
		case "stale_child":
			return "stale_child";
		case "prior_epoch":
			return "prior_epoch";
		case "thread_status_not_loaded":
			return "not_loaded";
		case "thread_status_system_error":
			return "system_error";
		case "direct_input_false":
		case "direct_input_unknown":
			return "not_controllable";
		case "thread_start_outcome_unknown":
		case "unknown_provenance":
		case "thread_list_missing":
		case "thread_list_ambiguous":
		case "thread_loaded_list_ambiguous":
		case "thread_source_custom":
		case "thread_source_subagent":
		case "thread_source_unknown":
		case "thread_loaded_list_missing":
			return "unknown_provenance";
		default:
			return "not_ready";
	}
}

export function sessionMutationOutcome(
	error: unknown,
): Exclude<WorkhorseOperationDelivery, "pending"> {
	return error instanceof CodexSessionMutationError ? error.outcome : "outcome_unknown";
}

export function queueMutationOutcome(
	error: unknown,
	effectStarted = true,
): Exclude<WorkhorseOperationDelivery, "pending"> {
	if (error instanceof CodexWorkhorseOperationsError)
		return effectStarted ? "outcome_unknown" : "not_delivered";
	if (
		error instanceof CodexWorkhorseQueueError &&
		(error.code === "reconciliation_failed" || error.code === "stale_link")
	)
		return effectStarted ? "outcome_unknown" : "not_delivered";
	if (error instanceof CodexWorkhorseQueueError && error.outcome !== null) return error.outcome;
	return "not_delivered";
}

export function validateBoundedInput(value: string, label: string, allowEmpty = false): void {
	if (typeof value !== "string" || (!allowEmpty && value.length === 0))
		throw operationError("invalid_input", `${label} must be nonempty text.`);
	if (Buffer.byteLength(value, "utf8") > INPUT_LIMIT_BYTES)
		throw operationError(
			"invalid_input",
			`${label} must be at most ${INPUT_LIMIT_BYTES} UTF-8 bytes.`,
		);
}

export function activeTurnFromClassification(
	classification: WorkhorseOperationClassification,
): TurnId | null {
	if (classification.thread === null) return null;
	const active = classification.thread.turns.filter((turn) => turn.status === "inProgress");
	return active.length === 1 ? active[0]!.id : null;
}

export function threadIdWire(options: WorkhorseOperationOptions, threadId: ThreadId): string {
	return options.identity.decoder.serializeCodexIdentity(threadId);
}

export function turnIdWire(options: WorkhorseOperationOptions, turnId: TurnId): string {
	return options.identity.decoder.serializeCodexIdentity(turnId);
}

export function turnIdFromRaw(options: WorkhorseOperationOptions, value: string): TurnId {
	const adopted = options.identity.decoder.adoptCodexResponseIdentities({ turnIds: [value] });
	const turnId = adopted.turnIds[0];
	if (turnId === undefined) throw new TypeError("notification did not contain a turn identity");
	return turnId;
}

export function userMessageClientIds(turn: TurnNotification["params"]["turn"]): readonly string[] {
	return turn.items.flatMap((item) =>
		item.type === "userMessage" && item.clientId !== null ? [item.clientId] : [],
	);
}

export function queueIds(
	queue: readonly { readonly id: QueuedSubmissionId }[],
): readonly QueuedSubmissionId[] {
	return freeze(queue.map(({ id }) => id));
}

export function recordMatchesTarget(
	record: EpochOperationRecord,
	target: WorkhorseOperationTarget,
): boolean {
	return (
		record.correlation.childId === target.childId &&
		record.correlation.epoch === target.epoch &&
		record.provenance.childId === target.childId &&
		record.provenance.epoch === target.epoch &&
		record.provenance.threadId === target.threadId &&
		record.correlation.operationId === target.operationId &&
		record.provenance.threadSource !== null
	);
}

export function assertExecutableClassification(
	classification: ThreadLinkClassification,
	target: WorkhorseOperationTarget,
	label: string,
): void {
	if (classification.link.state !== "executable") {
		const reason = classification.link.reason ?? "unknown_provenance";
		throw operationError(
			mapLinkReason(reason),
			`${label} is inspect-only: ${reason}. Re-read the current linked state before retrying.`,
		);
	}
	if (
		classification.link.childId !== target.childId ||
		classification.link.epoch !== target.epoch ||
		classification.link.threadId !== target.threadId ||
		!classification.link.loaded ||
		!classification.link.canAcceptDirectInput ||
		classification.proof === null ||
		!recordMatchesTarget(classification.proof.record, target) ||
		classification.proof.record.status !== "committed" ||
		classification.proof.record.outcome !== "delivered"
	)
		throw operationError(
			"unknown_provenance",
			`${label} lost its current executable provenance; inspect the link before retrying.`,
		);
}

export function assertCreatedWorkhorse(classification: ThreadLinkClassification): void {
	if (
		classification.link.state !== "executable" ||
		classification.link.source !== "appServer" ||
		classification.proof === null ||
		classification.proof.record.operation.kind !== WORKHORSE_CREATION_KIND ||
		classification.proof.record.provenance.threadSource !== WORKHORSE_THREAD_SOURCE
	)
		throw operationError(
			"unknown_provenance",
			"Queue access is restricted to the created Archboard workhorse with proven ownership.",
		);
}
