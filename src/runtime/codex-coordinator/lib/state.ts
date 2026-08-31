import {
	CodexCoordinatorError,
	COORDINATOR_CAPABILITY_POLICY,
	type CoordinatorConfiguredSettings,
	type CoordinatorPersistedState,
	type CoordinatorReviewHashes,
	type CoordinatorSettings,
	type CoordinatorSnapshot,
} from "./contract.js";

export function emptySnapshot(
	state: "unbound" | "failed",
	reason: string | null,
): CoordinatorSnapshot {
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

export function startingSnapshot(
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

export function failedSnapshot(
	reason: string,
	configured: CoordinatorConfiguredSettings | null,
): CoordinatorSnapshot {
	return Object.freeze({ ...emptySnapshot("failed", reason), configured });
}

export function inspectSnapshot(
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
		effective: settings?.effective ?? null,
		approvalPolicy: settings?.approvalPolicy ?? null,
		approvalsReviewer: settings?.approvalsReviewer ?? null,
		sandboxPolicy: settings?.sandboxPolicy ?? null,
		activePermissionProfile: settings?.activePermissionProfile ?? null,
		review,
		capabilities: COORDINATOR_CAPABILITY_POLICY,
		persistence: null,
		reason,
	});
}

export function readySnapshot(persistence: CoordinatorPersistedState): CoordinatorSnapshot {
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

export function freezePersistence(value: CoordinatorPersistedState): CoordinatorPersistedState {
	return deepFreeze(structuredClone(value));
}

export function sameValue(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		return (
			Array.isArray(left) &&
			Array.isArray(right) &&
			left.length === right.length &&
			left.every((value, index) => sameValue(value, right[index]))
		);
	}
	if (isRecord(left) && isRecord(right)) {
		const leftKeys = Object.keys(left);
		const rightKeys = Object.keys(right);
		return (
			leftKeys.length === rightKeys.length &&
			leftKeys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
		);
	}
	return false;
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "unknown error";
}

export function coordinatorError(
	error: unknown,
	code: ConstructorParameters<typeof CodexCoordinatorError>[0],
	prefix: string,
): CodexCoordinatorError {
	if (error instanceof CodexCoordinatorError) return error;
	return new CodexCoordinatorError(code, `${prefix} ${errorMessage(error)}`, error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<Value>(value: Value): Value {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key));
	return Object.freeze(value);
}
