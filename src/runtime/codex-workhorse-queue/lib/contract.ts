import type { CodexSession, SessionQueuedSubmission } from "@/runtime/codex-session";
import type {
	ChildEpoch,
	ChildId,
	IdentityValidator,
	QueuedSubmissionId,
	ThreadId,
	TurnId,
} from "@/shared/codex-workbench-identity";

/** The only queue operations exposed to Archboard callers. */
const WORKHORSE_QUEUE_OPERATIONS = Object.freeze([
	"list",
	"add",
	"update",
	"delete",
	"reorder",
	"start",
] as const);

type WorkhorseQueueOperation = (typeof WORKHORSE_QUEUE_OPERATIONS)[number];
type WorkhorseQueueMutation = Exclude<WorkhorseQueueOperation, "list">;

/** The exact child/epoch and two thread links a queue request is allowed to use. */
interface WorkhorseQueueBinding {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly coordinatorThreadId: ThreadId;
	readonly workhorseThreadId: ThreadId;
}

/** The composition root owns the live link and can revoke it between calls. */
type CurrentWorkhorseQueueBinding = () => WorkhorseQueueBinding | null;

interface WorkhorseQueueIdentityPort {
	readonly validator: Pick<IdentityValidator, "isCurrentEpoch">;
}

/**
 * Narrow capability for the shared host-owned operation identity.
 *
 * The queue never issues, adopts, or invents an operation identity. The
 * eventual shared OperationId authority supplies this capability at the
 * composition boundary.
 */
interface WorkhorseQueueOperationIdPort<OperationIdValue extends string> {
	readonly assertCurrent: (operationId: OperationIdValue) => void;
	readonly serialize: (operationId: OperationIdValue) => string;
}

type WorkhorseQueueSessionPort = Pick<
	CodexSession,
	"queueAdd" | "queueListPage" | "queueUpdate" | "queueDelete" | "queueReorder" | "queueStart"
>;

interface WorkhorseQueueOptions<OperationIdValue extends string> {
	readonly session: WorkhorseQueueSessionPort;
	readonly currentBinding: CurrentWorkhorseQueueBinding;
	readonly identity: WorkhorseQueueIdentityPort;
	readonly operationIds: WorkhorseQueueOperationIdPort<OperationIdValue>;
}

interface QueueListResult {
	readonly operation: "list";
	readonly queue: QueueSnapshot;
}

interface QueueEffectContext {
	readonly operation: WorkhorseQueueMutation;
	readonly target: SessionQueuedSubmission | null;
}

type QueueBeforeEffect = (context: QueueEffectContext) => void | Promise<void>;

interface QueueAddRequest<OperationIdValue extends string> {
	readonly operationId: OperationIdValue;
	readonly prompt: string;
	readonly beforeEffect?: QueueBeforeEffect;
}

interface QueueUpdateRequest<OperationIdValue extends string> {
	readonly operationId: OperationIdValue;
	readonly submissionId: QueuedSubmissionId;
	readonly prompt: string;
	readonly beforeEffect?: QueueBeforeEffect;
}

interface QueueDeleteRequest<OperationIdValue extends string> {
	readonly operationId: OperationIdValue;
	readonly submissionId: QueuedSubmissionId;
	readonly beforeEffect?: QueueBeforeEffect;
}

interface QueueReorderRequest<OperationIdValue extends string> {
	readonly operationId: OperationIdValue;
	readonly orderedSubmissionIds: readonly QueuedSubmissionId[];
	readonly beforeEffect?: QueueBeforeEffect;
}

interface QueueStartRequest<OperationIdValue extends string> {
	readonly operationId: OperationIdValue;
	readonly submissionId: QueuedSubmissionId;
	readonly beforeEffect?: QueueBeforeEffect;
}

type QueueSnapshot = readonly SessionQueuedSubmission[];
type QueueMutationOutcome = "delivered" | "not_delivered" | "outcome_unknown";

interface QueueMutationResult<
	Operation extends WorkhorseQueueMutation,
	OperationIdValue extends string,
> {
	readonly operation: Operation;
	readonly operationId: OperationIdValue;
	readonly outcome: QueueMutationOutcome;
	readonly queue: QueueSnapshot;
}

type QueueAddResult<OperationIdValue extends string> = QueueMutationResult<"add", OperationIdValue>;
type QueueUpdateResult<OperationIdValue extends string> = QueueMutationResult<
	"update",
	OperationIdValue
>;
type QueueDeleteResult<OperationIdValue extends string> = QueueMutationResult<
	"delete",
	OperationIdValue
>;
type QueueReorderResult<OperationIdValue extends string> = QueueMutationResult<
	"reorder",
	OperationIdValue
>;
type QueueStartResult<OperationIdValue extends string> = QueueMutationResult<
	"start",
	OperationIdValue
> & {
	readonly clientUserMessageId: string;
	readonly turnId: TurnId | null;
};

type WorkhorseQueueResult<OperationIdValue extends string> =
	| QueueListResult
	| QueueAddResult<OperationIdValue>
	| QueueUpdateResult<OperationIdValue>
	| QueueDeleteResult<OperationIdValue>
	| QueueReorderResult<OperationIdValue>
	| QueueStartResult<OperationIdValue>;

type WorkhorseQueueErrorCode =
	| "closed"
	| "not_ready"
	| "stale_link"
	| "invalid_input"
	| "authorization_failed"
	| "invalid_result"
	| "repeated_cursor"
	| "transport_failure"
	| "reconciliation_failed";

/** What is known about a queue failure beyond its code and message. */
interface WorkhorseQueueErrorFacts {
	readonly operation?: WorkhorseQueueOperation;
	readonly outcome?: QueueMutationOutcome;
	readonly queue?: QueueSnapshot | null;
	readonly cause?: unknown;
}

class CodexWorkhorseQueueError extends Error {
	override readonly name = "CodexWorkhorseQueueError";
	readonly code: WorkhorseQueueErrorCode;
	readonly operation: WorkhorseQueueOperation | null;
	readonly outcome: QueueMutationOutcome | null;
	readonly queue: QueueSnapshot | null;
	override readonly cause: unknown;

	/**
	 * Build the error, defaulting every optional fact to null so a caller can always ask what the
	 * failure proved about delivery and about the queue without checking whether the field exists.
	 * @param code - Why the queue refused.
	 * @param message - The diagnostic for the caller.
	 * @param options - The operation, settled outcome, queue snapshot and underlying cause, as far
	 * as they are known at the point of failure.
	 */
	constructor(
		code: WorkhorseQueueErrorCode,
		message: string,
		options: WorkhorseQueueErrorFacts = {},
	) {
		super(message);
		this.code = code;
		this.operation = options.operation ?? null;
		this.outcome = options.outcome ?? null;
		this.queue = options.queue ?? null;
		this.cause = options.cause;
	}
}

interface CodexWorkhorseQueue<OperationIdValue extends string> {
	readonly list: () => Promise<QueueListResult>;
	readonly add: (
		request: QueueAddRequest<OperationIdValue>,
	) => Promise<QueueAddResult<OperationIdValue>>;
	readonly update: (
		request: QueueUpdateRequest<OperationIdValue>,
	) => Promise<QueueUpdateResult<OperationIdValue>>;
	readonly delete: (
		request: QueueDeleteRequest<OperationIdValue>,
	) => Promise<QueueDeleteResult<OperationIdValue>>;
	readonly reorder: (
		request: QueueReorderRequest<OperationIdValue>,
	) => Promise<QueueReorderResult<OperationIdValue>>;
	readonly start: (
		request: QueueStartRequest<OperationIdValue>,
	) => Promise<QueueStartResult<OperationIdValue>>;
	/** Close admission and wait for every operation accepted before this call. */
	readonly shutdown: () => Promise<void>;
}

export {
	WORKHORSE_QUEUE_OPERATIONS,
	type WorkhorseQueueOperation,
	type WorkhorseQueueMutation,
	type WorkhorseQueueBinding,
	type CurrentWorkhorseQueueBinding,
	type WorkhorseQueueIdentityPort,
	type WorkhorseQueueOperationIdPort,
	type WorkhorseQueueSessionPort,
	type WorkhorseQueueOptions,
	type QueueListResult,
	type QueueEffectContext,
	type QueueBeforeEffect,
	type QueueAddRequest,
	type QueueUpdateRequest,
	type QueueDeleteRequest,
	type QueueReorderRequest,
	type QueueStartRequest,
	type QueueSnapshot,
	type QueueMutationOutcome,
	type QueueMutationResult,
	type QueueAddResult,
	type QueueUpdateResult,
	type QueueDeleteResult,
	type QueueReorderResult,
	type QueueStartResult,
	type WorkhorseQueueResult,
	type WorkhorseQueueErrorCode,
	CodexWorkhorseQueueError,
	type CodexWorkhorseQueue,
};
