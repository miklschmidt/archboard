import type { CodexSession, SessionQueuedSubmission } from "../../codex-session/index.js";
import type {
	ChildEpoch,
	ChildId,
	IdentityValidator,
	QueuedSubmissionId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";

/** The only queue operations exposed to Archboard callers. */
export const WORKHORSE_QUEUE_OPERATIONS = Object.freeze([
	"list",
	"add",
	"update",
	"delete",
	"reorder",
	"start",
] as const);

export type WorkhorseQueueOperation = (typeof WORKHORSE_QUEUE_OPERATIONS)[number];
export type WorkhorseQueueMutation = Exclude<WorkhorseQueueOperation, "list">;

/** The exact child/epoch and two thread links a queue request is allowed to use. */
export interface WorkhorseQueueBinding {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly coordinatorThreadId: ThreadId;
	readonly workhorseThreadId: ThreadId;
}

/** The composition root owns the live link and can revoke it between calls. */
export type CurrentWorkhorseQueueBinding = () => WorkhorseQueueBinding | null;

export interface WorkhorseQueueIdentityPort {
	readonly validator: Pick<IdentityValidator, "isCurrentEpoch">;
}

/**
 * Narrow capability for the shared host-owned operation identity.
 *
 * The queue never issues, adopts, or invents an operation identity. The
 * eventual shared OperationId authority supplies this capability at the
 * composition boundary.
 */
export interface WorkhorseQueueOperationIdPort<OperationIdValue extends string> {
	readonly assertCurrent: (operationId: OperationIdValue) => void;
	readonly serialize: (operationId: OperationIdValue) => string;
}

export type WorkhorseQueueSessionPort = Pick<
	CodexSession,
	"queueAdd" | "queueListPage" | "queueUpdate" | "queueDelete" | "queueReorder" | "queueStart"
>;

export interface WorkhorseQueueOptions<OperationIdValue extends string> {
	readonly session: WorkhorseQueueSessionPort;
	readonly currentBinding: CurrentWorkhorseQueueBinding;
	readonly identity: WorkhorseQueueIdentityPort;
	readonly operationIds: WorkhorseQueueOperationIdPort<OperationIdValue>;
}

export interface QueueListResult {
	readonly operation: "list";
	readonly queue: QueueSnapshot;
}

export interface QueueAddRequest<OperationIdValue extends string> {
	readonly operationId: OperationIdValue;
	readonly prompt: string;
}

export interface QueueUpdateRequest<OperationIdValue extends string> {
	readonly operationId: OperationIdValue;
	readonly submissionId: QueuedSubmissionId;
	readonly prompt: string;
}

export interface QueueDeleteRequest<OperationIdValue extends string> {
	readonly operationId: OperationIdValue;
	readonly submissionId: QueuedSubmissionId;
}

export interface QueueReorderRequest<OperationIdValue extends string> {
	readonly operationId: OperationIdValue;
	readonly orderedSubmissionIds: readonly QueuedSubmissionId[];
}

export interface QueueStartRequest<OperationIdValue extends string> {
	readonly operationId: OperationIdValue;
	readonly submissionId: QueuedSubmissionId;
}

export type QueueSnapshot = readonly SessionQueuedSubmission[];
export type QueueMutationOutcome = "delivered" | "not_delivered" | "outcome_unknown";

export interface QueueMutationResult<
	Operation extends WorkhorseQueueMutation,
	OperationIdValue extends string,
> {
	readonly operation: Operation;
	readonly operationId: OperationIdValue;
	readonly outcome: QueueMutationOutcome;
	readonly queue: QueueSnapshot;
}

export type QueueAddResult<OperationIdValue extends string> = QueueMutationResult<
	"add",
	OperationIdValue
>;
export type QueueUpdateResult<OperationIdValue extends string> = QueueMutationResult<
	"update",
	OperationIdValue
>;
export type QueueDeleteResult<OperationIdValue extends string> = QueueMutationResult<
	"delete",
	OperationIdValue
>;
export type QueueReorderResult<OperationIdValue extends string> = QueueMutationResult<
	"reorder",
	OperationIdValue
>;
export type QueueStartResult<OperationIdValue extends string> = QueueMutationResult<
	"start",
	OperationIdValue
>;

export type WorkhorseQueueResult<OperationIdValue extends string> =
	| QueueListResult
	| QueueAddResult<OperationIdValue>
	| QueueUpdateResult<OperationIdValue>
	| QueueDeleteResult<OperationIdValue>
	| QueueReorderResult<OperationIdValue>
	| QueueStartResult<OperationIdValue>;

export type WorkhorseQueueErrorCode =
	| "not_ready"
	| "stale_link"
	| "invalid_input"
	| "invalid_result"
	| "repeated_cursor"
	| "transport_failure"
	| "reconciliation_failed";

export class CodexWorkhorseQueueError extends Error {
	override readonly name = "CodexWorkhorseQueueError";
	readonly code: WorkhorseQueueErrorCode;
	readonly operation: WorkhorseQueueOperation | null;
	readonly outcome: QueueMutationOutcome | null;
	readonly queue: QueueSnapshot | null;
	override readonly cause: unknown;

	constructor(
		code: WorkhorseQueueErrorCode,
		message: string,
		options: {
			readonly operation?: WorkhorseQueueOperation;
			readonly outcome?: QueueMutationOutcome;
			readonly queue?: QueueSnapshot | null;
			readonly cause?: unknown;
		} = {},
	) {
		super(message);
		this.code = code;
		this.operation = options.operation ?? null;
		this.outcome = options.outcome ?? null;
		this.queue = options.queue ?? null;
		this.cause = options.cause;
	}
}

export interface CodexWorkhorseQueue<OperationIdValue extends string> {
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
}
