import {
	CodexCoordinatorError,
	COORDINATOR_CAPABILITY_POLICY,
	type CoordinatorConfiguredSettings,
	type CoordinatorPersistedState,
	type CoordinatorReviewHashes,
	type CoordinatorSettings,
	type CoordinatorSnapshot,
} from "@/runtime/codex-coordinator/lib/contract";

/**
 * The snapshot of a workbench with no coordinator: every fact absent, which every other snapshot
 * is built from.
 * @param state - Whether there is simply no coordinator, or the last attempt failed.
 * @param reason - Why it failed, when it did.
 * @returns The frozen snapshot.
 */
function emptySnapshot(state: "unbound" | "failed", reason: string | null): CoordinatorSnapshot {
	return Object.freeze({
		state,
		threadId: null,
		childId: null,
		epoch: null,
		operationId: null,
		configured: null,
		effective: null,
		approvalPolicy: null,
		approvalsReviewer: null,
		sandboxPolicy: null,
		activePermissionProfile: null,
		review: null,
		capabilities: COORDINATOR_CAPABILITY_POLICY,
		persistence: null,
		reason,
	});
}

/**
 * The snapshot while a coordinator is being started: its thread and operation are known and the
 * settings it was asked for are recorded, but nothing about it is proven yet.
 * @param threadId - The thread being started or adopted.
 * @param childId - The Codex child it runs on.
 * @param epoch - That child's epoch.
 * @param operationId - The issued operation identity.
 * @param configured - The settings Archboard asked for.
 * @returns The frozen snapshot.
 */
function startingSnapshot(
	threadId: CoordinatorSnapshot["threadId"],
	childId: CoordinatorSnapshot["childId"],
	epoch: CoordinatorSnapshot["epoch"],
	operationId: string | null,
	configured: CoordinatorConfiguredSettings,
): CoordinatorSnapshot {
	return Object.freeze({
		...emptySnapshot("unbound", null),
		state: "starting" as const,
		threadId,
		childId,
		epoch,
		operationId,
		configured,
	});
}

/**
 * The snapshot for a start that provably did nothing, so the workbench may try again.
 * @param reason - Why the start failed.
 * @param configured - The settings it was asked for, when they are known.
 * @returns The frozen snapshot.
 */
function failedSnapshot(
	reason: string,
	configured: CoordinatorConfiguredSettings | null,
): CoordinatorSnapshot {
	return Object.freeze({ ...emptySnapshot("failed", reason), configured });
}

/** The settings fields a snapshot carries, all absent when the settings were never read. */
type SnapshotSettings = Pick<
	CoordinatorSnapshot,
	"effective" | "approvalPolicy" | "approvalsReviewer" | "sandboxPolicy" | "activePermissionProfile"
>;

/**
 * The settings fields of a snapshot, absent as a group when the coordinator's settings were never
 * read: a snapshot never shows some of them and not others.
 * @param settings - The settings that were read, or null.
 * @returns The snapshot's settings fields.
 */
function snapshotSettings(settings: CoordinatorSettings | null): SnapshotSettings {
	return settings === null
		? {
				effective: null,
				approvalPolicy: null,
				approvalsReviewer: null,
				sandboxPolicy: null,
				activePermissionProfile: null,
			}
		: {
				effective: settings.effective,
				approvalPolicy: settings.approvalPolicy,
				approvalsReviewer: settings.approvalsReviewer,
				sandboxPolicy: settings.sandboxPolicy,
				activePermissionProfile: settings.activePermissionProfile,
			};
}

/**
 * The snapshot for a coordinator thread that exists but must not be driven: it could not be
 * proven to be Archboard's own. It keeps everything that was read so a person can inspect it.
 * @param threadId - The thread that was inspected.
 * @param operationId - The issued operation identity.
 * @param configured - The settings Archboard asked for.
 * @param settings - The settings that were read, when they were.
 * @param review - The reviewed instruction and manifest hashes, when they are known.
 * @param reason - Why the thread cannot be driven.
 * @returns The frozen snapshot.
 */
function inspectSnapshot(
	threadId: CoordinatorSnapshot["threadId"],
	operationId: string | null,
	configured: CoordinatorConfiguredSettings,
	settings: CoordinatorSettings | null,
	review: CoordinatorReviewHashes | null,
	reason: string,
): CoordinatorSnapshot {
	return Object.freeze({
		state: "inspect_only" as const,
		threadId,
		childId: null,
		epoch: null,
		operationId,
		configured,
		...snapshotSettings(settings),
		review,
		capabilities: COORDINATOR_CAPABILITY_POLICY,
		persistence: null,
		reason,
	});
}

/**
 * The snapshot for a coordinator that started, was proven to be Archboard's own, and is bound to
 * the workbench.
 * @param persistence - The durable state the coordinator was proven against.
 * @returns The frozen snapshot.
 */
function readySnapshot(persistence: CoordinatorPersistedState): CoordinatorSnapshot {
	return Object.freeze({
		state: "ready" as const,
		threadId: persistence.threadId,
		childId: persistence.childId,
		epoch: persistence.epoch,
		operationId: persistence.operationId,
		configured: persistence.settings.configured,
		effective: persistence.settings.effective,
		approvalPolicy: persistence.settings.approvalPolicy,
		approvalsReviewer: persistence.settings.approvalsReviewer,
		sandboxPolicy: persistence.settings.sandboxPolicy,
		activePermissionProfile: persistence.settings.activePermissionProfile,
		review: persistence.review,
		capabilities: COORDINATOR_CAPABILITY_POLICY,
		persistence,
		reason: null,
	});
}

/**
 * An independent, deeply frozen copy of the durable coordinator state, so what is retained cannot
 * be changed by whoever handed it over.
 * @param value - The durable state.
 * @returns The frozen copy.
 */
function freezePersistence(value: CoordinatorPersistedState): CoordinatorPersistedState {
	return deepFreeze(structuredClone(value));
}

/**
 * Whether two arrays hold the same values in the same order.
 * @param left - One array.
 * @param right - The other value, which may not be an array.
 * @returns True when both are arrays that agree element for element.
 */
function sameArray(left: readonly unknown[], right: unknown): boolean {
	return (
		Array.isArray(right) &&
		left.length === right.length &&
		left.every((value, index) => sameValue(value, right[index]))
	);
}

/**
 * Whether two objects carry the same keys with the same values.
 * @param left - One object.
 * @param right - The other object.
 * @returns True when both agree key for key.
 */
function sameRecord(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
	const leftKeys = Object.keys(left);
	return (
		leftKeys.length === Object.keys(right).length &&
		leftKeys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
	);
}

/**
 * Structural equality over the JSON shapes coordinator settings are made of. Settings are
 * compared by value, not by reference, because they are read back from Codex as fresh objects.
 * @param left - One value.
 * @param right - The other value.
 * @returns True when the two are the same value.
 */
function sameValue(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) {
		return true;
	}
	if (Array.isArray(left)) {
		return sameArray(left, right);
	}
	if (isRecord(left) && isRecord(right)) {
		return sameRecord(left, right);
	}
	return false;
}

/**
 * A diagnostic from any thrown value.
 * @param error - Whatever was thrown.
 * @returns Its message, or a placeholder.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "unknown error";
}

/**
 * Wrap a failure as a coordinator error, keeping one that already is: the code a step chose is
 * more specific than the one its caller would give it.
 * @param error - Whatever was thrown.
 * @param code - The code to use when the error is not already a coordinator error.
 * @param prefix - What the caller was doing, prepended to the message.
 * @returns The coordinator error.
 */
function coordinatorError(
	error: unknown,
	code: ConstructorParameters<typeof CodexCoordinatorError>[0],
	prefix: string,
): CodexCoordinatorError {
	if (error instanceof CodexCoordinatorError) {
		return error;
	}
	return new CodexCoordinatorError(code, `${prefix} ${errorMessage(error)}`, error);
}

/**
 * Whether a value is a plain object whose keys can be compared.
 * @param value - Any value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Freeze a value and everything reachable from it, stopping at anything already frozen.
 * @param value - The value to freeze.
 * @returns The same value, frozen.
 */
function deepFreeze<Value>(value: Value): Value {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}
	for (const key of Reflect.ownKeys(value)) {
		deepFreeze(Reflect.get(value, key));
	}
	return Object.freeze(value);
}

export {
	emptySnapshot,
	startingSnapshot,
	failedSnapshot,
	inspectSnapshot,
	readySnapshot,
	freezePersistence,
	sameValue,
	errorMessage,
	coordinatorError,
};
