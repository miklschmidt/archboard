import {
	CODEX_SESSION_THREAD_SOURCE,
	CodexSessionMutationError,
} from "../../codex-session/index.js";
import type { SessionNotificationHandler } from "../../codex-session/index.js";
import type { TransportServerNotification } from "../../codex-transport/server-requests.js";
import type { ThreadId } from "../../../shared/codex-workbench-identity/index.js";
import { CODEX_REQUEST_SETTLEMENT_MS } from "../../../shared/timing/timing.js";
import {
	CodexCoordinatorError,
	type CodexCoordinatorOptions,
	type CoordinatorConfiguredSettings,
	type CoordinatorEffectiveSettings,
	type CoordinatorEpochSnapshot,
	type CoordinatorEpochTransaction,
	type CoordinatorPersistedState,
	type CoordinatorReviewHashes,
	type CoordinatorSettings,
	type CoordinatorSnapshot,
	type CoordinatorStartResponse,
	type CoordinatorThreadSettings,
} from "./contract.js";
import {
	COORDINATOR_EFFORT,
	COORDINATOR_MODEL,
	createCoordinatorSettingsUpdateParams,
	createCoordinatorThreadStartParams,
	type CoordinatorModelSelection,
} from "./model.js";
import { hashCoordinatorSettings, reviewedCoordinatorHashes } from "./review.js";
import { COORDINATOR_OPERATION_KIND, COORDINATOR_RPC } from "./reuse.js";
import {
	coordinatorError,
	errorMessage,
	failedSnapshot,
	freezePersistence,
	inspectSnapshot,
	readySnapshot,
	sameValue,
	startingSnapshot,
} from "./state.js";

const COORDINATOR_THREAD_SOURCE = CODEX_SESSION_THREAD_SOURCE;

interface PendingSettingsNotification {
	readonly threadId: ThreadId;
	readonly started: CoordinatorStartResponse;
	readonly configured: CoordinatorConfiguredSettings;
	readonly resolve: (outcome: SettingsNotificationOutcome) => void;
	readonly cancel: () => void;
}

type SettingsNotificationOutcome =
	| { readonly kind: "matched"; readonly settings: CoordinatorThreadSettings }
	| { readonly kind: "expired"; readonly error: CodexCoordinatorError };

export interface CoordinatorStartHooks {
	readonly setSnapshot: (snapshot: CoordinatorSnapshot) => void;
	readonly snapshot: () => CoordinatorSnapshot;
	readonly setPersistence: (persistence: CoordinatorPersistedState | null) => void;
}

export function createCoordinatorStarter(
	options: CodexCoordinatorOptions,
	hooks: CoordinatorStartHooks,
): {
	readonly start: (
		operationId: string,
		selection: CoordinatorModelSelection,
		configured: CoordinatorConfiguredSettings,
		reviewed: CoordinatorReviewHashes,
		epochSnapshot: CoordinatorEpochSnapshot,
	) => Promise<CoordinatorSnapshot>;
	readonly onNotification: SessionNotificationHandler;
} {
	let pendingSettings: PendingSettingsNotification | null = null;

	const onNotification: SessionNotificationHandler = (event) => {
		const pending = pendingSettings;
		if (pending === null || !isCurrentNotification(event, options)) {
			return;
		}
		const notification = event.notification;
		if (notification.method !== "thread/settings/updated") {
			return;
		}
		let threadId: ThreadId;
		try {
			threadId = options.identity.decoder.resolveThreadId(notification.params.threadId);
		} catch {
			return;
		}
		if (threadId !== pending.threadId) {
			return;
		}
		const mismatch = settingsMismatch(
			pending.started,
			pending.configured,
			notification.params.threadSettings,
		);
		if (mismatch !== null) {
			return;
		}
		pending.cancel();
		pending.resolve({ kind: "matched", settings: notification.params.threadSettings });
	};

	const start = async (
		operationId: string,
		selection: CoordinatorModelSelection,
		configured: CoordinatorConfiguredSettings,
		reviewed: CoordinatorReviewHashes,
		epochSnapshot: CoordinatorEpochSnapshot,
	): Promise<CoordinatorSnapshot> => {
		hooks.setPersistence(null);
		let transaction: CoordinatorEpochTransaction;
		try {
			transaction = options.epoch.stageOperation({
				childId: options.identity.validator.childId,
				epoch: options.identity.validator.epoch,
				operationId,
				kind: COORDINATOR_OPERATION_KIND,
				rpc: COORDINATOR_RPC,
				workspaceRoot: options.checkoutRoot,
				instructionHash: reviewed.instructionHash,
				manifestHash: reviewed.catalogueHash,
				expected: epochSnapshot.cas,
			});
		} catch (error) {
			const failure = coordinatorError(
				error,
				"transaction_failed",
				"The coordinator start transaction could not be staged.",
			);
			hooks.setSnapshot(failedSnapshot(failure.message, configured));
			throw failure;
		}

		const startParams = createCoordinatorThreadStartParams(
			options.checkoutRoot,
			selection.configuredServiceTier,
		);
		hooks.setSnapshot(
			startingSnapshot(
				null,
				options.identity.validator.childId,
				options.identity.validator.epoch,
				operationId,
				configured,
			),
		);

		let started: CoordinatorStartResponse;
		try {
			started = await options.session.threadStart(startParams);
		} catch (error) {
			if (mutationOutcome(error) === "not_delivered") {
				rollback(transaction, "coordinator thread/start was not delivered");
				hooks.setPersistence(null);
				hooks.setSnapshot(
					failedSnapshot("The coordinator thread/start was not delivered.", configured),
				);
				return hooks.snapshot();
			}
			markUnknown(transaction, "coordinator thread/start response was lost", null);
			hooks.setPersistence(null);
			hooks.setSnapshot(
				inspectSnapshot(
					null,
					operationId,
					configured,
					null,
					null,
					"The coordinator thread/start outcome is unknown; inspect the authoritative thread list.",
				),
			);
			return hooks.snapshot();
		}

		let startedThreadId: ThreadId;
		try {
			assertStartedResponse(started, options.checkoutRoot, selection.configuredServiceTier);
			startedThreadId = started.thread.id;
		} catch (error) {
			const threadId = started?.thread?.id ?? null;
			markUnknown(
				transaction,
				"coordinator thread/start returned an invalid confirmation",
				threadId,
			);
			hooks.setPersistence(null);
			hooks.setSnapshot(
				inspectSnapshot(
					threadId,
					operationId,
					configured,
					null,
					null,
					`The coordinator thread/start confirmation was invalid: ${errorMessage(error)}`,
				),
			);
			return hooks.snapshot();
		}

		const waiting = waitForSettings(startedThreadId, started, configured);
		try {
			await options.session.threadSettingsUpdate(
				createCoordinatorSettingsUpdateParams(startedThreadId, selection.configuredServiceTier),
			);
		} catch (error) {
			waiting.cancel();
			markUnknown(transaction, "coordinator settings/update response was lost", startedThreadId);
			hooks.setPersistence(null);
			hooks.setSnapshot(
				inspectSnapshot(
					startedThreadId,
					operationId,
					configured,
					null,
					null,
					`The coordinator settings update did not confirm: ${errorMessage(error)}`,
				),
			);
			return hooks.snapshot();
		}

		const notificationOutcome = await waiting.promise;
		if (notificationOutcome.kind === "expired") {
			markUnknown(
				transaction,
				"coordinator settings notification settlement expired",
				startedThreadId,
			);
			hooks.setPersistence(null);
			hooks.setSnapshot(
				inspectSnapshot(
					startedThreadId,
					operationId,
					configured,
					null,
					null,
					errorMessage(notificationOutcome.error),
				),
			);
			return hooks.snapshot();
		}

		const settings = coordinatorSettings(configured, notificationOutcome.settings);
		let review: CoordinatorReviewHashes;
		try {
			review = reviewedCoordinatorHashes(hashCoordinatorSettings(settings));
		} catch (error) {
			markUnknown(transaction, "coordinator review hashes drifted after start", startedThreadId);
			hooks.setPersistence(null);
			hooks.setSnapshot(
				inspectSnapshot(
					startedThreadId,
					operationId,
					configured,
					settings,
					null,
					`The coordinator review could not be confirmed: ${errorMessage(error)}`,
				),
			);
			return hooks.snapshot();
		}

		try {
			options.epoch.commitOperation(transaction, {
				threadId: startedThreadId,
				threadSource: COORDINATOR_THREAD_SOURCE,
			});
		} catch (error) {
			markUnknown(transaction, "coordinator start could not be durably committed", startedThreadId);
			hooks.setPersistence(null);
			hooks.setSnapshot(
				inspectSnapshot(
					startedThreadId,
					operationId,
					configured,
					settings,
					review,
					`The coordinator started but its durable ownership proof failed: ${errorMessage(error)}`,
				),
			);
			return hooks.snapshot();
		}

		const persistence = freezePersistence({
			childId: options.identity.validator.childId,
			epoch: options.identity.validator.epoch,
			threadId: startedThreadId,
			operationId,
			review,
			settings,
		});
		hooks.setPersistence(persistence);
		hooks.setSnapshot(readySnapshot(persistence));
		return hooks.snapshot();
	};

	function waitForSettings(
		threadId: ThreadId,
		started: CoordinatorStartResponse,
		configured: CoordinatorConfiguredSettings,
	): { readonly promise: Promise<SettingsNotificationOutcome>; readonly cancel: () => void } {
		if (pendingSettings !== null) {
			throw new CodexCoordinatorError(
				"transaction_failed",
				"A coordinator settings handshake is already pending.",
			);
		}
		let resolve!: (outcome: SettingsNotificationOutcome) => void;
		const promise = new Promise<SettingsNotificationOutcome>((promiseResolve) => {
			resolve = promiseResolve;
		});
		let timer: ReturnType<typeof setTimeout> | undefined;
		const pending: PendingSettingsNotification = {
			threadId,
			started,
			configured,
			resolve,
			cancel: () => {
				if (pendingSettings !== pending) {
					return;
				}
				pendingSettings = null;
				if (timer !== undefined) {
					clearTimeout(timer);
				}
			},
		};
		pendingSettings = pending;
		timer = setTimeout(() => {
			if (pendingSettings !== pending) {
				return;
			}
			pendingSettings = null;
			resolve({
				kind: "expired",
				error: new CodexCoordinatorError(
					"settings_timeout",
					`The coordinator settings notification did not match within ${CODEX_REQUEST_SETTLEMENT_MS} ms; inspect the authoritative thread list.`,
				),
			});
		}, CODEX_REQUEST_SETTLEMENT_MS);
		return {
			promise,
			cancel: pending.cancel,
		};
	}

	const rollback = (transaction: CoordinatorEpochTransaction, reason: string): void => {
		try {
			options.epoch.rollbackOperation(transaction, reason);
		} catch {
			// The failed state remains terminal; rollback is never retried.
		}
	};
	const markUnknown = (
		transaction: CoordinatorEpochTransaction,
		reason: string,
		threadId: ThreadId | null,
	): void => {
		try {
			options.epoch.markOutcomeUnknown(
				transaction,
				reason,
				threadId === null ? undefined : { threadId, threadSource: COORDINATOR_THREAD_SOURCE },
			);
		} catch {
			// The in-memory result remains inspect-only if durable quarantine also fails.
		}
	};

	return Object.freeze({ start, onNotification });
}

function settingsMismatch(
	started: CoordinatorStartResponse,
	configured: CoordinatorConfiguredSettings,
	settings: CoordinatorThreadSettings,
): string | null {
	if (settings.cwd !== started.cwd) {
		return "Coordinator settings changed the checkout root.";
	}
	if (settings.model !== COORDINATOR_MODEL) {
		return "Coordinator settings did not confirm gpt-5.6-luna.";
	}
	if (settings.modelProvider !== started.modelProvider) {
		return "Coordinator settings changed the provider selected at start.";
	}
	if (settings.effort !== COORDINATOR_EFFORT) {
		return "Coordinator settings did not confirm medium effort.";
	}
	if (settings.serviceTier !== started.serviceTier) {
		return "Coordinator settings did not confirm the effective service tier.";
	}
	if (configured.serviceTier === "priority" && settings.serviceTier !== "priority") {
		return "Coordinator settings did not confirm advertised priority.";
	}
	if (!sameValue(settings.approvalPolicy, started.approvalPolicy)) {
		return "Coordinator settings changed the start approval policy.";
	}
	if (!sameValue(settings.approvalsReviewer, started.approvalsReviewer)) {
		return "Coordinator settings changed the start approvals reviewer.";
	}
	if (!sameValue(settings.sandboxPolicy, started.sandbox)) {
		return "Coordinator settings changed the start sandbox policy.";
	}
	if (!sameValue(settings.activePermissionProfile, started.activePermissionProfile)) {
		return "Coordinator settings changed the start permission profile.";
	}
	return null;
}

function assertStartedResponse(
	response: CoordinatorStartResponse,
	checkoutRoot: string,
	serviceTier: "priority" | null,
): void {
	const mismatches = Object.entries({
		"thread.id": response.thread.id.length === 0,
		model: response.model !== COORDINATOR_MODEL,
		modelProvider: response.modelProvider.length === 0,
		"thread.modelProvider": response.thread.modelProvider !== response.modelProvider,
		serviceTier: serviceTier === "priority" && response.serviceTier !== "priority",
		cwd: response.cwd !== checkoutRoot,
		runtimeWorkspaceRoots:
			response.runtimeWorkspaceRoots.length !== 1 ||
			response.runtimeWorkspaceRoots[0] !== checkoutRoot,
		"thread.cwd": response.thread.cwd !== checkoutRoot,
		"thread.historyMode": response.thread.historyMode !== "paginated",
		"thread.source": response.thread.source !== COORDINATOR_THREAD_SOURCE,
		"thread.threadSource": response.thread.threadSource !== "archboard",
		"thread.ephemeral": response.thread.ephemeral,
	})
		.filter(([, mismatched]) => mismatched)
		.map(([field]) => field);
	if (mismatches.length > 0) {
		throw new CodexCoordinatorError(
			"invalid_start_response",
			`The coordinator thread/start response does not match the authored profile: ${mismatches.join(", ")}.`,
		);
	}
}

function coordinatorSettings(
	configured: CoordinatorConfiguredSettings,
	settings: CoordinatorThreadSettings,
): CoordinatorSettings {
	const effective: CoordinatorEffectiveSettings = Object.freeze({
		model: settings.model,
		effort: settings.effort,
		serviceTier: settings.serviceTier,
	});
	return Object.freeze({
		configured,
		effective,
		approvalPolicy: settings.approvalPolicy,
		approvalsReviewer: settings.approvalsReviewer,
		sandboxPolicy: settings.sandboxPolicy,
		activePermissionProfile: settings.activePermissionProfile,
	});
}

function mutationOutcome(error: unknown): "not_delivered" | "outcome_unknown" {
	return error instanceof CodexSessionMutationError && error.outcome === "not_delivered"
		? "not_delivered"
		: "outcome_unknown";
}

function isCurrentNotification(
	event: TransportServerNotification,
	options: CodexCoordinatorOptions,
): boolean {
	return (
		event.correlation.child === options.identity.validator.childId &&
		event.correlation.epoch === options.identity.validator.epoch
	);
}
