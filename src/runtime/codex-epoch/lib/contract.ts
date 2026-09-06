import type {
	ChildEpoch,
	ChildId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { ActiveEpoch, EpochManifest, EpochOperationRecord } from "./manifest.js";
import type { CodexEpochFileSystem } from "./storage.js";

type CodexEpochErrorCode =
	| "invalid_input"
	| "outside_codex_storage"
	| "closed"
	| "storage_failure"
	| "conflict"
	| "not_initialized"
	| "stale_child"
	| "prior_epoch"
	| "unknown_provenance"
	| "inspect_only"
	| "not_executable"
	| "invalid_transition";

class CodexEpochError extends Error {
	readonly code: CodexEpochErrorCode;
	override readonly cause: unknown;

	constructor(code: CodexEpochErrorCode, message: string, cause?: unknown) {
		super(message);
		this.name = "CodexEpochError";
		this.code = code;
		this.cause = cause;
	}
}

interface EpochCasToken {
	readonly revision: number;
	readonly bytesHash: string | null;
}

interface EpochSnapshot {
	readonly manifest: EpochManifest;
	readonly cas: EpochCasToken;
	readonly manifestPath: string;
}

interface EpochStageInput {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
	readonly kind: string;
	readonly rpc?: string | null;
	readonly workspaceRoot: string;
	readonly instructionHash: string;
	readonly manifestHash: string;
	readonly expected?: EpochCasToken;
}

interface EpochConfirmation {
	readonly threadId?: ThreadId | null;
	readonly turnId?: TurnId | null;
	readonly threadSource?: string | null;
	readonly confirmedAtMs?: number;
}

interface EpochTransaction {
	readonly record: EpochOperationRecord;
	readonly cas: EpochCasToken;
}

interface EpochExecutionRequest {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
	readonly threadId?: ThreadId | null;
}

interface EpochExecutionProof {
	readonly record: EpochOperationRecord;
	readonly manifestRevision: number;
}

interface CodexEpochStoreOptions {
	readonly rootDirectory: string;
	readonly codexHome: string;
	readonly sqliteHome: string;
	readonly fileSystem?: CodexEpochFileSystem;
	readonly now?: () => number;
}

interface CodexEpochStore {
	readonly rootDirectory: string;
	readonly manifestPath: string;
	readonly snapshot: () => EpochSnapshot;
	readonly stageEpoch: (input: EpochStageInput) => EpochTransaction;
	readonly startEpoch: (input: EpochStageInput) => EpochOperationRecord;
	readonly commitEpoch: (
		transaction: EpochTransaction,
		confirmation?: EpochConfirmation,
	) => EpochOperationRecord;
	readonly stageOperation: (input: EpochStageInput) => EpochTransaction;
	readonly commitOperation: (
		transaction: EpochTransaction,
		confirmation?: EpochConfirmation,
	) => EpochOperationRecord;
	readonly rollbackOperation: (
		transaction: EpochTransaction,
		reason: string,
	) => EpochOperationRecord;
	readonly markOutcomeUnknown: (
		transaction: EpochTransaction,
		reason: string,
		confirmation?: EpochConfirmation,
	) => EpochOperationRecord;
	readonly confirmOutcome: (
		transaction: EpochTransaction,
		confirmation: EpochConfirmation,
	) => EpochOperationRecord;
	readonly assertCurrent: (request: EpochExecutionRequest) => EpochExecutionProof;
	readonly canExecute: (request: EpochExecutionRequest) => boolean;
	readonly close: () => void;
}

interface DiskState {
	readonly manifest: EpochManifest;
	readonly bytesHash: string | null;
}

interface Mutation<T> {
	readonly payload: {
		readonly activeEpoch: ActiveEpoch | null;
		readonly records: readonly EpochOperationRecord[];
	};
	readonly result: (manifest: EpochManifest) => T;
}

export {
	type CodexEpochErrorCode,
	CodexEpochError,
	type EpochCasToken,
	type EpochSnapshot,
	type EpochStageInput,
	type EpochConfirmation,
	type EpochTransaction,
	type EpochExecutionRequest,
	type EpochExecutionProof,
	type CodexEpochStoreOptions,
	type CodexEpochStore,
	type DiskState,
	type Mutation,
};
