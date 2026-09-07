import type {
	ApprovalBinding,
	ApprovalOwnerView,
	ApprovalSnapshot,
	CodexApprovalBrokerOptions,
	SpokenApprovalEffectPresentation,
	SpokenEligibility,
	SpokenEligibilityFacts,
} from "@/runtime/codex-approvals/lib/contract";
import { CodexApprovalError as ApprovalError } from "@/runtime/codex-approvals/lib/contract";
import type { ApprovalRecord } from "@/runtime/codex-approvals/lib/approval-record";
import { isTerminal, sameBinding, snapshotOf } from "@/runtime/codex-approvals/lib/approval-record";
import { spokenEligibility as assessSpokenEligibility } from "@/runtime/codex-approvals/lib/response";
import type { JsonRpcRequestId } from "@/shared/codex-workbench-identity";

/** What the read-only surface needs from the broker that owns the approvals. */
export interface ApprovalViewContext {
	/** Every approval the broker holds, which acknowledging one removes it from. */
	readonly records: Map<JsonRpcRequestId, ApprovalRecord>;
	/** Prove a request identity is one this workbench session issued. */
	readonly requireRequestId: (value: JsonRpcRequestId) => JsonRpcRequestId;
	/** The record for one approval, refused when the broker does not know it. */
	readonly requireRecord: (value: JsonRpcRequestId) => ApprovalRecord;
	/** The binding the approval would have right now, or null when it can no longer be built. */
	readonly currentBinding: (record: ApprovalRecord) => ApprovalBinding | null;
	/** What the host says it knows about answering this approval aloud. */
	readonly getSpokenEligibilityFacts: CodexApprovalBrokerOptions["getSpokenEligibilityFacts"];
}

/** Everything a broker owner may read or acknowledge without settling anything. */
export interface ApprovalViews {
	readonly get: (requestId: JsonRpcRequestId) => ApprovalSnapshot | undefined;
	readonly inspect: () => readonly ApprovalSnapshot[];
	readonly acknowledge: (requestId: JsonRpcRequestId) => void;
	readonly view: (requestId: JsonRpcRequestId) => ApprovalOwnerView;
	readonly inspectViews: () => readonly ApprovalOwnerView[];
	readonly spokenPresentation: (requestId: JsonRpcRequestId) => SpokenApprovalEffectPresentation;
	readonly spoken: (requestId: JsonRpcRequestId) => SpokenEligibility;
}

/**
 * Build the broker's read-only surface: what an owner may look at, and the one thing it may forget.
 * Nothing here settles an approval or answers Codex.
 * @param context - The records and the identity, binding and host lookups over them.
 * @returns The read-only surface.
 */
export function createApprovalViews(context: ApprovalViewContext): ApprovalViews {
	/**
	 * Whether one approval may be answered aloud right now. A host that cannot say what it knows
	 * about the approval is treated as reporting an unsupported schema, which keeps voice off
	 * rather than on.
	 * @param record - The record.
	 * @returns The eligibility.
	 */
	const spokenForRecord = (record: ApprovalRecord): SpokenEligibility => {
		if (record.state !== "pending") {
			return { eligible: false, reason: "not_pending" };
		}
		const live = context.currentBinding(record);
		return assessSpokenEligibility(
			record.request,
			live !== null && sameBinding(live, record.request.binding),
			hostFacts(context, record),
			record.spokenEffectPresentation,
		);
	};

	/**
	 * The owner's view of one approval: its request, its snapshot, whether it can be spoken, and
	 * what its terminal settlement delivered.
	 * @param requestId - The approval.
	 * @returns The frozen view.
	 */
	const view = (requestId: JsonRpcRequestId): ApprovalOwnerView => {
		const record = context.requireRecord(requestId);
		return Object.freeze({
			kind: "approval_owner" as const,
			request: record.request,
			snapshot: snapshotOf(record),
			spoken: spokenForRecord(record),
			terminalDelivery: record.terminalDelivery,
		});
	};

	return Object.freeze({
		/**
		 * The snapshot of one approval, or undefined when the broker does not know it.
		 * @param requestId - The approval.
		 * @returns The snapshot, or undefined.
		 */
		get: (requestId: JsonRpcRequestId): ApprovalSnapshot | undefined => {
			try {
				const record = context.records.get(context.requireRequestId(requestId));
				return record === undefined ? undefined : snapshotOf(record);
			} catch {
				return undefined;
			}
		},

		/**
		 * Every approval the broker currently holds.
		 * @returns The frozen snapshots.
		 */
		inspect: (): readonly ApprovalSnapshot[] =>
			Object.freeze(Array.from(context.records.values(), snapshotOf)),

		/**
		 * Forget a terminal approval, which is how the owner says it has shown the outcome. Only a
		 * terminal approval may be forgotten: a pending one still owes Codex an answer.
		 * @param requestId - The approval.
		 * @throws {ApprovalError} When the approval has not settled.
		 */
		acknowledge: (requestId: JsonRpcRequestId): void => {
			const record = context.requireRecord(requestId);
			if (!isTerminal(record.state)) {
				throw new ApprovalError(
					"invalid_state",
					"Only a terminal approval may be acknowledged.",
					requestId,
				);
			}
			if (record.timer !== undefined) {
				clearTimeout(record.timer);
			}
			context.records.delete(requestId);
		},

		view,

		/**
		 * The owner's view of every approval the broker holds.
		 * @returns The frozen views.
		 */
		inspectViews: (): readonly ApprovalOwnerView[] =>
			Object.freeze(
				Array.from(context.records.values(), (record) => view(record.request.requestId)),
			),

		/**
		 * The line a person would be read before answering this approval aloud.
		 * @param requestId - The approval.
		 * @returns The spoken effect presentation.
		 * @throws {ApprovalError} When the approval has no safe one-line presentation.
		 */
		spokenPresentation: (requestId: JsonRpcRequestId): SpokenApprovalEffectPresentation => {
			const record = context.requireRecord(requestId);
			if (record.spokenEffectPresentation === null) {
				throw new ApprovalError(
					"unsupported_schema",
					"The approval has no safe one-line spoken effect presentation.",
					requestId,
				);
			}
			return record.spokenEffectPresentation;
		},

		/**
		 * Whether one approval may be answered aloud, and when not, why.
		 * @param requestId - The approval.
		 * @returns The eligibility.
		 */
		spoken: (requestId: JsonRpcRequestId): SpokenEligibility =>
			spokenForRecord(context.requireRecord(requestId)),
	});
}

/**
 * What the host says it knows about answering this approval aloud. A host that throws is treated as
 * reporting an unsupported schema, which keeps voice off rather than on.
 * @param context - The broker context carrying the host lookup.
 * @param record - The record.
 * @returns The facts.
 */
function hostFacts(context: ApprovalViewContext, record: ApprovalRecord): SpokenEligibilityFacts {
	try {
		return context.getSpokenEligibilityFacts?.(record.request) ?? {};
	} catch {
		return { unsupportedSchema: true };
	}
}
