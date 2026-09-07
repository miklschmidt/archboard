import type { OperationId } from "@/shared/codex-workbench-identity";
import {
	CodexDynamicOperationTerminalizationError,
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicOperationIdPort,
	type DynamicOperationTerminalDisposition,
	type DynamicOperationTerminalResult,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import { hasExactKeys } from "@/runtime/codex-dynamic-tools/lib/effect-values";

/** How many times the terminal boundary is crossed before it is called unprovable. */
const TERMINALIZATION_ATTEMPTS = 2;

/** The operation identities one dynamic call was issued. */
interface DynamicIssuedOperations {
	readonly resultOperationId: OperationId;
	readonly mutationOperationId: OperationId;
	readonly initialTurnOperationId: OperationId | null;
}

/** How one call's issued operation identities are brought to a terminal state. */
interface DynamicOperationSettlement {
	readonly consume: (operationId: OperationId) => void;
	readonly retire: (operationId: OperationId) => void;
	readonly retireUnsettled: () => void;
	readonly unresolvedOperationCount: () => number;
}

/**
 * Every identity one call must account for before it can be called terminal.
 * @param operations The issued identities.
 * @returns The identities, frozen.
 */
function operationIdsForRetirement(operations: DynamicIssuedOperations): readonly OperationId[] {
	return Object.freeze(
		operations.initialTurnOperationId === null
			? [operations.mutationOperationId]
			: [operations.mutationOperationId, operations.initialTurnOperationId],
	);
}

/**
 * Serialize an operation identity for a wire field the host owns, refusing an empty
 * serialization since nothing downstream could name the operation by it.
 * @param options The dynamic tools options.
 * @param operationId The identity.
 * @returns The serialized identity.
 */
function operationWireForResult(
	options: CodexDynamicToolsOptions,
	operationId: OperationId,
): string {
	try {
		const serialized = options.operationId.serializeForOwnedWireFields(operationId);
		if (typeof serialized !== "string" || serialized.length === 0) {
			throw new Error("the operation serializer returned an empty value");
		}
		return serialized;
	} catch (error) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The host could not serialize the canonical dynamic operation identity.",
			error,
		);
	}
}

/**
 * Serialize a newly issued result identity before it is exposed on the wire.
 * @param options The dynamic tools options.
 * @param operationId The identity.
 * @returns The serialized identity.
 */
function operationWireForIssuedResult(
	options: CodexDynamicToolsOptions,
	operationId: OperationId,
): string {
	try {
		options.operationId.validateCurrentUnconsumedOperationId(operationId);
	} catch (error) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The host could not validate a canonical dynamic operation identity.",
			error,
		);
	}
	return operationWireForResult(options, operationId);
}

/**
 * Validate an identity and serialize it, which is what a mutation's own wire fields carry.
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
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The host could not validate a canonical dynamic operation identity.",
			error,
		);
	}
}

/**
 * Cross-check a terminal result the host returned: it must be exactly the reviewed shape, name
 * the identity that was settled, and say it is terminal.
 * @param value What the host returned.
 * @param operationId The identity that was settled.
 * @returns The terminal result.
 */
function exactTerminalResult(
	value: unknown,
	operationId: OperationId,
): DynamicOperationTerminalResult {
	if (typeof value !== "object" || value === null) {
		throw new Error("the terminal operation result shape is not exact");
	}
	if (!hasExactKeys(value, ["operationId", "disposition", "terminal"])) {
		throw new Error("the terminal operation result shape is not exact");
	}
	const disposition = terminalDisposition(value);
	if (Reflect.get(value, "operationId") !== operationId || disposition === null) {
		throw new Error("the terminal operation result does not match the issued identity");
	}
	return Object.freeze({ operationId, disposition, terminal: true });
}

/**
 * The disposition a terminal result reports, when it reports one the boundary knows and says
 * the operation is terminal under it.
 * @param value What the host returned.
 * @returns The disposition, or null.
 */
function terminalDisposition(value: object): DynamicOperationTerminalDisposition | null {
	if (Reflect.get(value, "terminal") !== true) {
		return null;
	}
	const disposition = Reflect.get(value, "disposition");
	if (disposition !== "consumed" && disposition !== "retired") {
		return null;
	}
	return disposition;
}

/**
 * What the host already reports for an identity, or nothing when the host still reports it
 * current and unconsumed.
 * @param port The operation identity port.
 * @param operationId The identity.
 * @returns The terminal result, or null.
 */
function readTerminalResult(
	port: DynamicOperationIdPort,
	operationId: OperationId,
): DynamicOperationTerminalResult | null {
	const observed = port.readCanonicalOperationTerminalResult(operationId);
	if (observed !== null) {
		return exactTerminalResult(observed, operationId);
	}
	port.validateCurrentUnconsumedOperationId(operationId);
	return null;
}

/**
 * Ask the host to settle an identity, refusing a settlement under a disposition other than the
 * one asked for.
 * @param port The operation identity port.
 * @param operationId The identity.
 * @param disposition How it should be settled.
 * @returns The terminal result.
 */
function settleOnce(
	port: DynamicOperationIdPort,
	operationId: OperationId,
	disposition: DynamicOperationTerminalDisposition,
): DynamicOperationTerminalResult {
	const result = exactTerminalResult(
		port.terminalizeCanonicalOperationId({ operationId, disposition }),
		operationId,
	);
	if (result.disposition !== disposition) {
		throw new CodexDynamicOperationTerminalizationError(
			operationId,
			disposition,
			"The host terminalized the dynamic operation with another disposition.",
		);
	}
	return result;
}

/**
 * Read back what the host says about an identity after an attempt failed, refusing a terminal
 * disposition other than the one asked for.
 * @param port The operation identity port.
 * @param operationId The identity.
 * @param disposition How it should have been settled.
 * @param causes What the attempts have thrown so far.
 * @returns The terminal result, or null when the host still reports it current.
 */
function confirmSettlement(
	port: DynamicOperationIdPort,
	operationId: OperationId,
	disposition: DynamicOperationTerminalDisposition,
	causes: readonly unknown[],
): DynamicOperationTerminalResult | null {
	const observed = readTerminalResult(port, operationId);
	if (observed === null) {
		return null;
	}
	if (observed.disposition !== disposition) {
		throw new CodexDynamicOperationTerminalizationError(
			operationId,
			disposition,
			"The host reports another terminal disposition for the dynamic operation.",
			Object.freeze([...causes]),
		);
	}
	return observed;
}

/**
 * Make one attempt at the terminal boundary, keeping whatever it threw as a cause. A refusal
 * the boundary itself raised is final and passes straight through.
 * @param attempt What to try.
 * @param causes The causes so far, added to in place.
 * @returns The result, or null when the attempt did not settle anything.
 */
function attemptSettlement(
	attempt: () => DynamicOperationTerminalResult | null,
	causes: unknown[],
): DynamicOperationTerminalResult | null {
	try {
		return attempt();
	} catch (error) {
		if (error instanceof CodexDynamicOperationTerminalizationError) {
			throw error;
		}
		causes.push(error);
		return null;
	}
}

/**
 * Cross the host terminal boundary with an idempotent operation. A thrown
 * attempt is inspected and retried only while the host still reports the ID
 * current. Returning means the requested host disposition is proven.
 * @param port The operation identity port.
 * @param operationId The identity.
 * @param disposition How it should be settled.
 * @returns The proven terminal result.
 */
function terminalizeDynamicOperationId(
	port: DynamicOperationIdPort,
	operationId: OperationId,
	disposition: DynamicOperationTerminalDisposition,
): DynamicOperationTerminalResult {
	const causes: unknown[] = [];
	for (let attempt = 0; attempt < TERMINALIZATION_ATTEMPTS; attempt++) {
		const settled = attemptSettlement(() => settleOnce(port, operationId, disposition), causes);
		if (settled !== null) {
			return settled;
		}
		const observed = attemptSettlement(
			() => confirmSettlement(port, operationId, disposition, causes),
			causes,
		);
		if (observed !== null) {
			return observed;
		}
	}
	throw new CodexDynamicOperationTerminalizationError(
		operationId,
		disposition,
		"The host could not prove the dynamic operation terminal after idempotent settlement.",
		Object.freeze(causes),
	);
}

/**
 * Issue the identities one mutation needs. If issuing the second one fails, the first is
 * retired rather than left current, because a call that never ran must own nothing.
 * @param options The dynamic tools options.
 * @param hasInitialTurn Whether the mutation also starts a turn.
 * @returns The issued identities.
 */
function issueMutationOperations(
	options: CodexDynamicToolsOptions,
	hasInitialTurn: boolean,
): DynamicIssuedOperations {
	const mutationOperationId = options.operationId.issueCanonicalOperationId();
	try {
		return Object.freeze({
			resultOperationId: mutationOperationId,
			mutationOperationId,
			initialTurnOperationId: hasInitialTurn
				? options.operationId.issueCanonicalOperationId()
				: null,
		});
	} catch (error) {
		retirePartialIssue(options, mutationOperationId);
		throw error;
	}
}

/**
 * Retire the identity a partly issued mutation already holds.
 * @param options The dynamic tools options.
 * @param mutationOperationId The identity to retire.
 */
function retirePartialIssue(
	options: CodexDynamicToolsOptions,
	mutationOperationId: OperationId,
): void {
	try {
		terminalizeDynamicOperationId(options.operationId, mutationOperationId, "retired");
	} catch (retirementError) {
		if (retirementError instanceof CodexDynamicOperationTerminalizationError) {
			throw retirementError;
		}
		throw new CodexDynamicToolsError(
			"system_error",
			"The partially issued dynamic operation could not be retired.",
			retirementError,
		);
	}
}

/**
 * Issue the one identity a read needs.
 * @param options The dynamic tools options.
 * @returns The issued identity.
 */
function issueReadOperation(options: CodexDynamicToolsOptions): {
	readonly resultOperationId: OperationId;
} {
	return Object.freeze({ resultOperationId: options.operationId.issueCanonicalOperationId() });
}

/**
 * Refuse a call whose authority issued the same identity twice, retiring what it did issue so
 * nothing is left current.
 * @param options The dynamic tools options.
 * @param owned The identities the call was issued.
 */
function assertDistinctIdentities(
	options: CodexDynamicToolsOptions,
	owned: readonly OperationId[],
): void {
	const distinct = new Set(owned);
	if (distinct.size === owned.length) {
		return;
	}
	for (const operationId of distinct) {
		terminalizeDynamicOperationId(options.operationId, operationId, "retired");
	}
	throw new CodexDynamicToolsError(
		"system_error",
		"The dynamic operation authority issued duplicate identities for one call.",
	);
}

/**
 * Refuse a settlement that changes its mind about what was asked for, since the first request
 * is the one the host may already have acted on.
 * @param requested What each identity was asked to be settled as.
 * @param operationId The identity.
 * @param disposition What it is being asked to be settled as now.
 */
function assertUnchangedRequest(
	requested: ReadonlyMap<OperationId, DynamicOperationTerminalDisposition>,
	operationId: OperationId,
	disposition: DynamicOperationTerminalDisposition,
): void {
	const priorRequest = requested.get(operationId);
	if (priorRequest !== undefined && priorRequest !== disposition) {
		throw new CodexDynamicToolsError(
			"system_error",
			"The dynamic operation settlement changed its requested disposition.",
		);
	}
}

/**
 * How one call's identities are settled: each exactly once, under one disposition, and never
 * one the settlement does not own. A settlement the host cannot prove is deferred rather than
 * raised, so the caller's own path decides whether the call can still be called terminal.
 * @param options The dynamic tools options.
 * @param operations The identities the call was issued.
 * @returns The settlement.
 */
function createDynamicOperationSettlement(
	options: CodexDynamicToolsOptions,
	operations: DynamicIssuedOperations,
): DynamicOperationSettlement {
	const owned = Object.freeze(operationIdsForRetirement(operations));
	assertDistinctIdentities(options, owned);
	const requested = new Map<OperationId, DynamicOperationTerminalDisposition>();
	const terminal = new Map<OperationId, DynamicOperationTerminalDisposition>();

	/**
	 * Refuse a settlement of an identity this one does not own, or one it has already settled.
	 * @param operationId The identity.
	 */
	const assertSettleable = (operationId: OperationId): void => {
		if (!owned.includes(operationId)) {
			throw new CodexDynamicToolsError(
				"system_error",
				"The dynamic operation settlement received an identity it does not own.",
			);
		}
		if (terminal.has(operationId)) {
			throw new CodexDynamicToolsError(
				"system_error",
				"The dynamic operation identity was settled more than once.",
			);
		}
	};

	/**
	 * Settle one identity, remembering the disposition it was asked for so a later settlement
	 * cannot change its mind about what happened.
	 * @param operationId The identity.
	 * @param kind Whether the operation ran or not.
	 * @param deferUnresolved Whether an unprovable settlement is deferred rather than raised.
	 */
	const terminalize = (
		operationId: OperationId,
		kind: "consume" | "retire",
		deferUnresolved: boolean,
	): void => {
		assertSettleable(operationId);
		const disposition = kind === "consume" ? "consumed" : "retired";
		assertUnchangedRequest(requested, operationId, disposition);
		requested.set(operationId, disposition);
		try {
			const result = terminalizeDynamicOperationId(options.operationId, operationId, disposition);
			terminal.set(operationId, result.disposition);
		} catch (error) {
			if (deferUnresolved && error instanceof CodexDynamicOperationTerminalizationError) {
				return;
			}
			throw error;
		}
	};

	/**
	 * Settle everything still outstanding, raising the first failure once all of it has been
	 * tried, so one unprovable identity does not leave the rest unsettled.
	 */
	const retireUnsettled = (): void => {
		let firstError: unknown = null;
		for (const operationId of owned.filter((identity) => !terminal.has(identity))) {
			try {
				const kind = requested.get(operationId) === "consumed" ? "consume" : "retire";
				terminalize(operationId, kind, false);
			} catch (error) {
				firstError ??= error;
			}
		}
		if (firstError !== null) {
			throw firstError;
		}
	};

	return Object.freeze({
		/**
		 * Settle one identity as having been carried out.
		 * @param operationId The identity.
		 */
		consume: (operationId: OperationId): void => {
			terminalize(operationId, "consume", true);
		},
		/**
		 * Settle one identity as not having been carried out.
		 * @param operationId The identity.
		 */
		retire: (operationId: OperationId): void => {
			terminalize(operationId, "retire", true);
		},
		retireUnsettled,
		/**
		 * How many of the call's identities are still not proven terminal.
		 * @returns The count.
		 */
		unresolvedOperationCount: (): number => owned.length - terminal.size,
	});
}

/**
 * The settlement a call is left with when its own settlement could not be proven: it owns one
 * identity and one disposition, and retrying is the only thing it can do.
 * @param options The dynamic tools options.
 * @param error What the failed settlement raised.
 * @returns The recovery settlement.
 */
function createDynamicOperationRecoverySettlement(
	options: CodexDynamicToolsOptions,
	error: CodexDynamicOperationTerminalizationError,
): DynamicOperationSettlement {
	let terminal = false;
	/**
	 * Try again to settle the identity under the disposition it was asked for.
	 * @param deferUnresolved Whether an unprovable settlement is deferred rather than raised.
	 */
	const retry = (deferUnresolved: boolean): void => {
		if (terminal) {
			return;
		}
		try {
			terminalizeDynamicOperationId(options.operationId, error.operationId, error.disposition);
			terminal = true;
		} catch (retryError) {
			if (deferUnresolved && retryError instanceof CodexDynamicOperationTerminalizationError) {
				return;
			}
			throw retryError;
		}
	};
	return Object.freeze({
		/** Try again to settle the identity. */
		consume: (): void => {
			retry(true);
		},
		/** Try again to settle the identity. */
		retire: (): void => {
			retry(true);
		},
		/** Try again to settle the identity, raising whatever the attempt could not prove. */
		retireUnsettled: (): void => {
			retry(false);
		},
		/**
		 * Whether the identity is still not proven terminal.
		 * @returns One while it is unresolved, zero once it is settled.
		 */
		unresolvedOperationCount: (): number => (terminal ? 0 : 1),
	});
}

export {
	type DynamicIssuedOperations,
	type DynamicOperationSettlement,
	createDynamicOperationRecoverySettlement,
	createDynamicOperationSettlement,
	issueMutationOperations,
	issueReadOperation,
	operationIdsForRetirement,
	operationWire,
	operationWireForIssuedResult,
	operationWireForResult,
	terminalizeDynamicOperationId,
};
