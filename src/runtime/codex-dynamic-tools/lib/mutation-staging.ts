import { WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256 } from "@/runtime/codex-instructions";
import type { EpochTransaction } from "@/runtime/codex-epoch";
import { CodexSessionMutationError } from "@/runtime/codex-session";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "@/runtime/codex-thread-tools";
import type { OperationId, ThreadId, TurnId } from "@/shared/codex-workbench-identity";
import {
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicCallerAuthority,
	type DynamicRefusalReason,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import type { DynamicOperationSettlement } from "@/runtime/codex-dynamic-tools/lib/effects";

/** The refusal codes an authority port may raise that the boundary passes through as its own. */
const PASSTHROUGH_CODES = [
	"stale_child",
	"prior_epoch",
	"unknown_provenance",
	"not_loaded",
	"not_controllable",
	"system_error",
] as const;

/** The refusal codes the epoch ledger raises that the boundary passes through as its own. */
const EPOCH_CODES = ["stale_child", "prior_epoch", "unknown_provenance"] as const;

/** The refusal reasons a dynamic mutation reports under its own name. */
const REFUSAL_REASONS = [
	"invalid_call",
	"not_ready",
	"not_loaded",
	"not_controllable",
	"system_error",
	"stale_child",
	"prior_epoch",
	"unknown_provenance",
	"approval_declined",
	"cycle",
	"busy",
	"expired",
	"unsupported",
] as const;

/** Which RPC each mutation tool is carried out by, and the kind it is staged under. */
const MUTATION_KINDS = {
	create_thread: { kind: "create_thread", rpc: "thread/start" },
	fork_thread: { kind: "fork_thread", rpc: "thread/fork" },
	send_message_to_thread: { kind: "send_message_to_thread", rpc: "turn/start" },
} as const;

type MutationExecution =
	| { readonly kind: "ok"; readonly operationId: string; readonly value: unknown }
	| { readonly kind: "outcome_unknown"; readonly operationId: string }
	| { readonly kind: "refused"; readonly reason: DynamicRefusalReason; readonly message: string };

interface StageOptions {
	readonly options: CodexDynamicToolsOptions;
	readonly caller: DynamicCallerAuthority;
	readonly operationId: OperationId;
	readonly kind: string;
	readonly rpc: string;
}

/**
 * Freeze a value and everything inside it, so what a mutation reports cannot be changed after
 * it is reported.
 * @param value The value.
 * @returns The same value, frozen through.
 */
function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

/**
 * Cut a string to fit a byte budget, marking what was cut with an ellipsis.
 * @param value The text.
 * @param maximum The byte budget.
 * @returns The text that fits.
 */
function truncateUtf8(value: string, maximum: number): string {
	if (Buffer.byteLength(value, "utf8") <= maximum) {
		return value;
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
	return `${result}${ellipsis}`;
}

/**
 * Validate an operation identity and serialize it for the wire field it goes in.
 * @param options The dynamic tools options.
 * @param operationId The identity.
 * @returns The serialized identity.
 */
function operationWire(options: CodexDynamicToolsOptions, operationId: OperationId): string {
	try {
		options.operationId.validateCurrentUnconsumedOperationId(operationId);
		const serialized = options.operationId.serializeForOwnedWireFields(operationId);
		if (typeof serialized !== "string" || serialized.length === 0) {
			throw new Error("the operation serializer returned an empty value");
		}
		return serialized;
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The host could not validate a canonical dynamic operation identity.",
			error,
		);
	}
}

/**
 * Write one mutation into the local epoch ledger before it is carried out, so the ledger names
 * the operation whatever happens to the call after this.
 * @param options What is being staged, and for whom.
 * @returns The staged transaction.
 */
function stage(options: StageOptions): EpochTransaction {
	try {
		const expected = options.options.epoch.snapshot().cas;
		return options.options.epoch.stageOperation({
			childId: options.caller.childId,
			epoch: options.caller.epoch,
			operationId: operationWire(options.options, options.operationId),
			kind: options.kind,
			rpc: options.rpc,
			workspaceRoot: options.options.checkoutRoot,
			instructionHash: WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
			manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
			expected,
		});
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		throw epochError(error, "The local dynamic operation could not be staged.");
	}
}

/**
 * The code a thrown value carries, when it carries one.
 * @param error Thrown value.
 * @returns The code, or null.
 */
function codeOf(error: unknown): string | null {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return null;
	}
	const code: unknown = Reflect.get(error, "code");
	return typeof code === "string" ? code : null;
}

/**
 * The refusal an epoch ledger failure becomes, keeping the ledger's own code when it raised one
 * the boundary passes through and reporting anything else as a system error.
 * @param error What the ledger threw.
 * @param message Human-readable explanation.
 * @returns The refusal error.
 */
function epochError(error: unknown, message: string): CodexDynamicToolsError {
	const raised = codeOf(error);
	const code = EPOCH_CODES.find((known) => known === raised) ?? "system_error";
	return new CodexDynamicToolsError(code, message, error);
}

/**
 * Whether a failed mutation reached the remote at all. Anything that does not say otherwise is
 * treated as not delivered, because that is the outcome a caller can act on safely.
 * @param error What the session threw.
 * @returns The outcome.
 */
function remoteOutcome(error: unknown): "not_delivered" | "outcome_unknown" {
	if (error instanceof CodexSessionMutationError) {
		return error.outcome;
	}
	if (typeof error !== "object" || error === null) {
		return "not_delivered";
	}
	const outcome: unknown = Reflect.get(error, "outcome");
	return outcome === "outcome_unknown" ? "outcome_unknown" : "not_delivered";
}

/** What the remote confirmed about a mutation the ledger is being told about. */
interface SettlementConfirmation {
	readonly threadId?: ThreadId | null;
	readonly turnId?: TurnId | null;
	readonly threadSource?: string | null;
}

interface DurableSettlementResult {
	readonly durable: boolean;
}

/**
 * Write what a mutation did into the local ledger and settle the operation identity it ran
 * under. A settlement the ledger could not record leaves the identity retired rather than
 * consumed, so nothing claims an undelivered mutation was accounted for.
 * @param options The dynamic tools options.
 * @param settlement How the call's identities are settled.
 * @param operationId The identity this mutation ran under.
 * @param transaction The staged transaction.
 * @param outcome What the mutation did.
 * @param confirmation What the remote confirmed, when it confirmed anything.
 * @returns Whether the local record is durable.
 */
function settle(
	options: CodexDynamicToolsOptions,
	settlement: DynamicOperationSettlement,
	operationId: OperationId,
	transaction: EpochTransaction,
	outcome: "delivered" | "not_delivered" | "outcome_unknown",
	confirmation?: SettlementConfirmation,
): DurableSettlementResult {
	let durable = true;
	try {
		if (outcome === "delivered") {
			options.epoch.commitOperation(transaction, confirmation);
		} else if (outcome === "not_delivered") {
			options.epoch.rollbackOperation(transaction, "dynamic mutation was not delivered");
		} else {
			options.epoch.markOutcomeUnknown(
				transaction,
				"dynamic mutation settlement is unknown",
				confirmation,
			);
		}
	} catch {
		durable = false;
	}
	if (durable || outcome !== "not_delivered") {
		settlement.consume(operationId);
	} else {
		settlement.retire(operationId);
	}
	return { durable };
}

/**
 * The reason a refusal is reported under, keeping the boundary's own code when it raised one a
 * caller can act on and reporting anything else as a system error.
 * @param error What was thrown.
 * @returns The refusal reason.
 */
function dynamicReason(error: unknown): DynamicRefusalReason {
	if (!(error instanceof CodexDynamicToolsError)) {
		return "system_error";
	}
	return REFUSAL_REASONS.find((known) => known === error.code) ?? "system_error";
}

/**
 * What to say about a failure: its own message when it has one, and the caller's fallback when
 * it does not.
 * @param error What was thrown.
 * @param fallback What to say when the failure says nothing.
 * @returns The message.
 */
function refusalMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

/**
 * Refuse a call that is no longer executing, checked once more immediately before its effect so
 * nothing runs on behalf of a caller that has since gone away.
 * @param options The dynamic tools options.
 * @param request The server request.
 * @param caller The caller's authority.
 */
async function assertBeforeEffect(
	options: CodexDynamicToolsOptions,
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
): Promise<void> {
	try {
		await options.lifecycle.assertCallExecuting({ request, caller, phase: "before_effect" });
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		const raised = codeOf(error);
		const passthrough = PASSTHROUGH_CODES.find((known) => known === raised);
		if (passthrough !== undefined) {
			throw new CodexDynamicToolsError(
				passthrough,
				"The dynamic call is no longer executable.",
				error,
			);
		}
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The dynamic call is no longer executing before its effect.",
			error,
		);
	}
}

export {
	MUTATION_KINDS,
	type DurableSettlementResult,
	type SettlementConfirmation,
	type MutationExecution,
	assertBeforeEffect,
	dynamicReason,
	epochError,
	freezeDeep,
	operationWire,
	refusalMessage,
	remoteOutcome,
	settle,
	stage,
	truncateUtf8,
};
