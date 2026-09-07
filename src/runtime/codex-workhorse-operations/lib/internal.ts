import type { EpochTransaction } from "@/runtime/codex-epoch";
import type { ThreadLinkClassification } from "@/runtime/codex-thread-link";
import type { WorkhorseQueueMutation } from "@/runtime/codex-workhorse-queue";
import type { TransportServerNotification } from "@/runtime/codex-transport/server-requests";
import type {
	OperationId,
	QueuedSubmissionId,
	ThreadId,
	TurnId,
} from "@/shared/codex-workbench-identity";
import type {
	WorkhorseCoordinatorCall,
	WorkhorseOperationBinding,
	WorkhorseOperationClassification,
	WorkhorseOperationCorrelation,
	WorkhorseOperationDelivery,
	WorkhorseOperationEvent,
	WorkhorseOperationEventListener,
	WorkhorseOperationName,
	WorkhorseOperationOptions,
	WorkhorseOperationRpc,
	WorkhorseOperationTarget,
} from "@/runtime/codex-workhorse-operations/lib/contract";
import { operationError } from "@/runtime/codex-workhorse-operations/lib/operation-errors";

const INPUT_LIMIT_BYTES = 4_096;
const ATTENTION_FLAGS: ReadonlySet<string> = new Set(["waitingOnApproval", "waitingOnUserInput"]);

type MutationOperation = Exclude<WorkhorseOperationName, "inspect_workhorse">;
type QueueMutation = WorkhorseQueueMutation;
type SettledDelivery = Exclude<WorkhorseOperationDelivery, "pending">;

interface OperationState {
	readonly operationId: OperationId;
	readonly operationIdWire: string;
	readonly operation: MutationOperation;
	readonly queueOperation: QueueMutation | null;
	readonly rpc: WorkhorseOperationRpc;
	readonly call: WorkhorseCoordinatorCall;
	readonly binding: WorkhorseOperationBinding;
	readonly coordinatorThreadId: ThreadId;
	readonly workhorseThreadId: ThreadId;
	readonly workhorseThreadSource: string;
	readonly transaction: EpochTransaction;
	clientUserMessageId: string | null;
	queuedSubmissionId: QueuedSubmissionId | null;
	turnId: TurnId | null;
	outcome: WorkhorseOperationDelivery;
	durableSettled: boolean;
	queuedEmitted: boolean;
	startedEmitted: boolean;
	terminalEmitted: boolean;
}

type RawNotification = TransportServerNotification["notification"];
type TurnNotification = Extract<
	RawNotification,
	{ readonly method: "turn/started" | "turn/completed" }
>;

interface StageInput {
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

interface WorkhorseValidation {
	readonly currentBinding: () => WorkhorseOperationBinding;
	readonly assertCurrentBinding: (binding: WorkhorseOperationBinding) => void;
	readonly assertCall: (
		call: WorkhorseCoordinatorCall,
		tool: WorkhorseOperationName,
		binding?: WorkhorseOperationBinding,
	) => void;
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

interface WorkhorseEvents {
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
		requested: SettledDelivery,
		detail: string | null,
	) => SettledDelivery;
	readonly terminal: (
		state: OperationState,
		type: "completed" | "failed",
		queue: readonly { readonly id: QueuedSubmissionId }[],
		detail: string | null,
	) => void;
	readonly clear: (state: OperationState) => void;
	readonly correlateTurn: (
		state: OperationState,
		turnId: TurnId,
		queue?: readonly { readonly id: QueuedSubmissionId }[],
	) => void;
	readonly reconcileUnknownQueue: (
		queue: readonly { readonly id: QueuedSubmissionId; readonly clientUserMessageId: string }[],
	) => void;
	readonly scheduleQueueReconciliation: () => void;
}

interface WorkhorseRuntime extends WorkhorseValidation, WorkhorseEvents {
	readonly options: WorkhorseOperationOptions;
	readonly enqueue: <Value>(work: () => Promise<Value>) => Promise<Value>;
}

/** The fields that make two coordinator calls the same logical call. */
const CALL_IDENTITY_KEYS = [
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
] as const satisfies readonly (keyof WorkhorseCoordinatorCall)[];

/**
 * Freeze a value with its type preserved, so snapshots handed to callers stay immutable.
 * @param value - The value to freeze.
 * @returns The same value, frozen.
 */
function freeze<T>(value: T): T {
	return Object.freeze(value);
}

/**
 * Trim a detail string to the input byte budget so an event never carries unbounded text.
 * @param value - The detail text to bound.
 * @returns The text unchanged when it fits, otherwise a byte-bounded prefix with an ellipsis.
 */
function boundedDetail(value: string): string {
	if (Buffer.byteLength(value, "utf8") <= INPUT_LIMIT_BYTES) {
		return value;
	}
	const suffix = "...";
	const budget = INPUT_LIMIT_BYTES - Buffer.byteLength(suffix, "utf8");
	let bytes = 0;
	let prefix = "";
	for (const character of value) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (bytes + characterBytes > budget) {
			break;
		}
		prefix += character;
		bytes += characterBytes;
	}
	return `${prefix}${suffix}`;
}

/**
 * Compare two coordinator calls field by field; a call is trusted only when every identity
 * component matches the one the host is currently executing.
 * @param left - One coordinator call.
 * @param right - The other coordinator call.
 * @returns Whether both calls name the same logical tool call.
 */
function sameCall(left: WorkhorseCoordinatorCall, right: WorkhorseCoordinatorCall): boolean {
	return CALL_IDENTITY_KEYS.every((key) => left[key] === right[key]);
}

/**
 * Compare two operation targets by child, epoch, thread and operation identity.
 * @param left - One target.
 * @param right - The other target.
 * @returns Whether both targets name the same linked thread under the same ownership.
 */
function sameTarget(left: WorkhorseOperationTarget, right: WorkhorseOperationTarget): boolean {
	return (
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.threadId === right.threadId &&
		left.operationId === right.operationId
	);
}

/**
 * Compare two bindings, including both linked targets.
 * @param left - One binding.
 * @param right - The other binding.
 * @returns Whether both bindings link the same coordinator and workhorse under the same epoch.
 */
function sameBinding(left: WorkhorseOperationBinding, right: WorkhorseOperationBinding): boolean {
	return (
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		sameTarget(left.coordinator, right.coordinator) &&
		sameTarget(left.workhorse, right.workhorse)
	);
}

/**
 * Copy a target so later changes by the composition root cannot alter a captured operation.
 * @param target - The live target.
 * @returns A frozen copy.
 */
function snapshotTarget(target: WorkhorseOperationTarget): WorkhorseOperationTarget {
	return freeze({ ...target });
}

/**
 * Copy a binding and both of its targets for the lifetime of one operation.
 * @param binding - The live binding.
 * @returns A frozen copy with frozen targets.
 */
function snapshotBinding(binding: WorkhorseOperationBinding): WorkhorseOperationBinding {
	return freeze({
		childId: binding.childId,
		epoch: binding.epoch,
		coordinator: snapshotTarget(binding.coordinator),
		workhorse: snapshotTarget(binding.workhorse),
	});
}

/**
 * Copy a coordinator call so the event correlation keeps the call as it was accepted.
 * @param call - The live call.
 * @returns A frozen copy.
 */
function snapshotCall(call: WorkhorseCoordinatorCall): WorkhorseCoordinatorCall {
	return freeze({ ...call });
}

/**
 * Resolve the wire RPC an operation will issue, which the durable record must name exactly.
 * @param operation - The mutating workhorse operation.
 * @param queueOperation - The queue mutation when the operation goes through the queue.
 * @param rpcOverride - An explicit RPC when the caller already decided the route.
 * @returns The RPC method name recorded for the operation.
 */
function operationRpc(
	operation: MutationOperation,
	queueOperation?: QueueMutation,
	rpcOverride?: WorkhorseOperationRpc,
): WorkhorseOperationRpc {
	if (rpcOverride !== undefined) {
		return rpcOverride;
	}
	if (operation === "delegate_to_workhorse") {
		return "turn/start";
	}
	if (operation === "steer_workhorse") {
		return "turn/steer";
	}
	if (queueOperation === undefined) {
		throw new TypeError("queue mutation is required");
	}
	return `thread/queue/${queueOperation}`;
}

/**
 * Refuse caller text that is empty or larger than the input byte budget.
 * @param value - The caller-supplied text.
 * @param label - How the text is named in the refusal.
 * @param allowEmpty - Whether an empty string is acceptable.
 */
function validateBoundedInput(value: string, label: string, allowEmpty = false): void {
	if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
		throw operationError("invalid_input", `${label} must be nonempty text.`);
	}
	if (Buffer.byteLength(value, "utf8") > INPUT_LIMIT_BYTES) {
		throw operationError(
			"invalid_input",
			`${label} must be at most ${INPUT_LIMIT_BYTES} UTF-8 bytes.`,
		);
	}
}

/**
 * Choose the operation identity for a mutation: the caller's when the dispatcher already owns
 * the effect, otherwise a freshly minted one, and prove it is current before any effect.
 * @param runtime - The operations runtime holding the operation authority.
 * @param operation - The operation being identified, for the refusal message.
 * @param candidate - The caller-supplied identity, if any.
 * @returns The validated identity with its wire serialization.
 */
function selectOperationIdentity(
	runtime: WorkhorseRuntime,
	operation: MutationOperation,
	candidate: OperationId | undefined,
): { readonly operationId: OperationId; readonly operationIdWire: string } {
	try {
		const operationId = candidate ?? runtime.options.operation.issuer.mintOperationId();
		runtime.options.operation.validator.assertCurrentOperationId(operationId);
		return Object.freeze({
			operationId,
			operationIdWire: runtime.options.operation.decoder.serializeOperationId(operationId),
		});
	} catch (error) {
		throw operationError("invalid_input", `A current ${operation} identity was unavailable.`, {
			operation,
			cause: error,
		});
	}
}

/**
 * Read the single in-progress turn from a classification, if exactly one exists.
 * @param classification - The classified linked thread.
 * @returns The active turn identity, or null when none or several turns are in progress.
 */
function activeTurnFromClassification(
	classification: WorkhorseOperationClassification,
): TurnId | null {
	if (classification.thread === null) {
		return null;
	}
	const active = classification.thread.turns.filter((turn) => turn.status === "inProgress");
	return active.length === 1 ? active[0]!.id : null;
}

/**
 * Serialize a thread identity to the wire form used as a map key and in notifications.
 * @param options - The operation options holding the identity decoder.
 * @param threadId - The trusted thread identity.
 * @returns The wire string.
 */
function threadIdWire(options: WorkhorseOperationOptions, threadId: ThreadId): string {
	return options.identity.decoder.serializeCodexIdentity(threadId);
}

/**
 * Serialize a turn identity to the wire form found in notifications.
 * @param options - The operation options holding the identity decoder.
 * @param turnId - The trusted turn identity.
 * @returns The wire string.
 */
function turnIdWire(options: WorkhorseOperationOptions, turnId: TurnId): string {
	return options.identity.decoder.serializeCodexIdentity(turnId);
}

/**
 * Adopt a raw turn identity from a notification through the trusted decoder.
 * @param options - The operation options holding the identity decoder.
 * @param value - The raw wire turn identity.
 * @returns The trusted turn identity.
 */
function turnIdFromRaw(options: WorkhorseOperationOptions, value: string): TurnId {
	const adopted = options.identity.decoder.adoptCodexResponseIdentities({ turnIds: [value] });
	const turnId = adopted.turnIds[0];
	if (turnId === undefined) {
		throw new TypeError("notification did not contain a turn identity");
	}
	return turnId;
}

/**
 * Collect the client identities of the user messages in a turn; they are how a queued or
 * started submission is matched back to the operation that sent it.
 * @param turn - The turn from a turn lifecycle notification.
 * @returns The client identities present on user messages.
 */
function userMessageClientIds(turn: TurnNotification["params"]["turn"]): readonly string[] {
	return turn.items.flatMap((item) =>
		item.type === "userMessage" && item.clientId !== null ? [item.clientId] : [],
	);
}

/**
 * Project a queue snapshot to its submission identities.
 * @param queue - The queue entries.
 * @returns A frozen list of identities in queue order.
 */
function queueIds(
	queue: readonly { readonly id: QueuedSubmissionId }[],
): readonly QueuedSubmissionId[] {
	return freeze(queue.map(({ id }) => id));
}

export {
	INPUT_LIMIT_BYTES,
	ATTENTION_FLAGS,
	type MutationOperation,
	type QueueMutation,
	type SettledDelivery,
	type OperationState,
	type RawNotification,
	type TurnNotification,
	type StageInput,
	type WorkhorseValidation,
	type WorkhorseEvents,
	type WorkhorseRuntime,
	freeze,
	boundedDetail,
	sameCall,
	sameTarget,
	sameBinding,
	snapshotTarget,
	snapshotBinding,
	snapshotCall,
	operationRpc,
	validateBoundedInput,
	selectOperationIdentity,
	activeTurnFromClassification,
	threadIdWire,
	turnIdWire,
	turnIdFromRaw,
	userMessageClientIds,
	queueIds,
};
