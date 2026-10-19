import type { ChildEpoch, ChildId, ThreadId, TurnId } from "@archboard/codex-app-server/identity";

const CODEX_EPOCH_MANIFEST_SCHEMA = 1 as const;

const EPOCH_OPERATION_STATUSES = ["staged", "committed", "rolled_back", "inspect_only"] as const;
const EPOCH_OPERATION_OUTCOMES = [
	"pending",
	"delivered",
	"not_delivered",
	"outcome_unknown",
] as const;

/** The outcome each status must carry; any other pairing is a corrupt record. */
const STATUS_OUTCOME: Readonly<Record<EpochOperationStatus, EpochOperationOutcome>> = Object.freeze(
	{
		staged: "pending",
		committed: "delivered",
		rolled_back: "not_delivered",
		inspect_only: "outcome_unknown",
	},
);

const THREAD_PROVENANCE_KINDS = new Set([
	"link",
	"thread_link",
	"attached",
	"create",
	"create_thread",
	"thread_create",
	"fork",
	"fork_thread",
	"thread_fork",
	"initial_turn",
	"create_thread_initial_turn",
	"fork_thread_initial_turn",
	"send_message_to_thread",
]);

type EpochOperationStatus = (typeof EPOCH_OPERATION_STATUSES)[number];

type EpochOperationOutcome = (typeof EPOCH_OPERATION_OUTCOMES)[number];

interface EpochOperationCorrelation {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
}

interface EpochOperationDescriptor {
	readonly id: string;
	readonly kind: string;
	readonly rpc: string | null;
}

interface EpochProvenance {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId | null;
	readonly turnId: TurnId | null;
	readonly threadSource: string | null;
	readonly workspaceRoot: string;
	readonly instructionHash: string;
	readonly manifestHash: string;
	readonly confirmedAtMs: number | null;
}

interface EpochOperationRecord {
	readonly correlation: EpochOperationCorrelation;
	readonly operation: EpochOperationDescriptor;
	readonly status: EpochOperationStatus;
	readonly outcome: EpochOperationOutcome;
	readonly provenance: EpochProvenance;
	readonly reason: string | null;
	readonly createdAtMs: number;
	readonly updatedAtMs: number;
}

interface ActiveEpoch {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
}

interface EpochManifestPayload {
	readonly schema: typeof CODEX_EPOCH_MANIFEST_SCHEMA;
	readonly revision: number;
	readonly activeEpoch: ActiveEpoch | null;
	readonly records: readonly EpochOperationRecord[];
}

interface EpochManifest extends EpochManifestPayload {
	readonly integrity: {
		readonly algorithm: "sha256";
		readonly digest: string;
	};
}

/**
 * Whether an operation of this kind must record which thread it touched, which is what makes
 * a committed thread effect resolvable back to its thread.
 * @param kind - The operation kind.
 * @returns True when thread provenance is required.
 */
function operationRequiresThreadProvenance(kind: string): boolean {
	return THREAD_PROVENANCE_KINDS.has(kind);
}

export {
	CODEX_EPOCH_MANIFEST_SCHEMA,
	EPOCH_OPERATION_OUTCOMES,
	EPOCH_OPERATION_STATUSES,
	STATUS_OUTCOME,
	THREAD_PROVENANCE_KINDS,
	operationRequiresThreadProvenance,
	type ActiveEpoch,
	type EpochManifest,
	type EpochManifestPayload,
	type EpochOperationCorrelation,
	type EpochOperationDescriptor,
	type EpochOperationOutcome,
	type EpochOperationRecord,
	type EpochOperationStatus,
	type EpochProvenance,
};
