import type { SessionNotificationHandler } from "@/runtime/codex-session";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import { CODEX_REQUEST_SETTLEMENT_MS } from "@/shared/timing/timing";
import {
	CodexCoordinatorError,
	type CodexCoordinatorOptions,
	type CoordinatorConfiguredSettings,
	type CoordinatorEpochSnapshot,
	type CoordinatorEpochTransaction,
	type CoordinatorPersistedState,
	type CoordinatorReviewHashes,
	type CoordinatorSnapshot,
	type CoordinatorStartResponse,
	type CoordinatorThreadSettings,
} from "@/runtime/codex-coordinator/lib/contract";
import {
	createCoordinatorSettingsUpdateParams,
	createCoordinatorThreadStartParams,
	type CoordinatorModelSelection,
} from "@/runtime/codex-coordinator/lib/model";
import {
	hashCoordinatorSettings,
	reviewedCoordinatorHashes,
} from "@/runtime/codex-coordinator/lib/review";
import { COORDINATOR_OPERATION_KIND, COORDINATOR_RPC } from "@/runtime/codex-coordinator/lib/reuse";
import {
	coordinatorError,
	errorMessage,
	failedSnapshot,
	freezePersistence,
	inspectSnapshot,
	readySnapshot,
	startingSnapshot,
} from "@/runtime/codex-coordinator/lib/state";
import {
	assertStartedResponse,
	coordinatorSettings,
	COORDINATOR_THREAD_SOURCE,
	isCurrentNotification,
	mutationOutcome,
	settingsMismatch,
	startedThreadIdOrNull,
} from "@/runtime/codex-coordinator/lib/start-profile";

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

/**
 * Whether a settings notification is the confirmation the pending handshake is waiting for: the
 * same thread, carrying exactly the settings the start was made with. A notification for
 * another thread, or one whose settings differ, is not the confirmation and is ignored.
 * @param pending - The pending handshake.
 * @param params - The notification's thread and confirmed settings.
 * @param starterOptions - The coordinator options carrying the identity decoder.
 * @returns True when the notification settles the handshake.
 */
function settlesPendingSettings(
	pending: PendingSettingsNotification,
	params: SettingsUpdatedParams,
	starterOptions: CodexCoordinatorOptions,
): boolean {
	let threadId: ThreadId;
	try {
		threadId = starterOptions.identity.decoder.resolveThreadId(params.threadId);
	} catch {
		return false;
	}
	if (threadId !== pending.threadId) {
		return false;
	}
	return settingsMismatch(pending.started, pending.configured, params.threadSettings) === null;
}

/** The fields of a settings/updated notification this handshake reads. */
interface SettingsUpdatedParams {
	readonly threadId: unknown;
	readonly threadSettings: CoordinatorThreadSettings;
}

/** A created coordinator thread, or the snapshot the start settled as instead. */
type CreatedCoordinatorThread =
	| {
			readonly ok: true;
			readonly started: CoordinatorStartResponse;
			readonly startedThreadId: ThreadId;
	  }
	| { readonly ok: false; readonly snapshot: CoordinatorSnapshot };

interface CoordinatorStartHooks {
	readonly setSnapshot: (snapshot: CoordinatorSnapshot) => void;
	readonly snapshot: () => CoordinatorSnapshot;
	readonly setPersistence: (persistence: CoordinatorPersistedState | null) => void;
}

/**
 * Build the step that starts one coordinator thread and proves it is the reviewed one: stage the
 * durable operation, start the thread, apply the reviewed settings, wait for Codex to confirm
 * them, then commit ownership. Every step that cannot prove what happened leaves the thread
 * inspect-only rather than claiming a coordinator Archboard cannot drive.
 * @param options - The session, epoch store and identity authority.
 * @param hooks - How the starter publishes snapshots and retains durable state.
 * @returns The start step and the notification handler its settings handshake needs.
 */
function createCoordinatorStarter(
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

	/**
	 * Take one session notification and settle the pending settings handshake when it is the
	 * confirmation that handshake is waiting for. Every other notification is ignored: the
	 * handshake is about one thread's settings, not about the session at large.
	 * @param event - The transport notification.
	 */
	const onNotification: SessionNotificationHandler = (event) => {
		const pending = pendingSettings;
		if (pending === null || !isCurrentNotification(event, options)) {
			return;
		}
		const notification = event.notification;
		if (notification.method !== "thread/settings/updated") {
			return;
		}
		if (!settlesPendingSettings(pending, notification.params, options)) {
			return;
		}
		pending.cancel();
		pending.resolve({ kind: "matched", settings: notification.params.threadSettings });
	};

	/**
	 * Start one coordinator thread end to end.
	 * @param operationId - The host operation identity the start runs under.
	 * @param selection - The chosen model and service tier.
	 * @param configured - The settings the coordinator is asked for.
	 * @param reviewed - The reviewed instruction and manifest hashes.
	 * @param epochSnapshot - The durable epoch the start is staged against.
	 * @returns The snapshot the start settled as.
	 */
	const start = async (
		operationId: string,
		selection: CoordinatorModelSelection,
		configured: CoordinatorConfiguredSettings,
		reviewed: CoordinatorReviewHashes,
		epochSnapshot: CoordinatorEpochSnapshot,
	): Promise<CoordinatorSnapshot> => {
		hooks.setPersistence(null);
		const transaction = stageStart(operationId, configured, reviewed, epochSnapshot);
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

		const created = await createCoordinatorThread(
			transaction,
			operationId,
			selection,
			configured,
			startParams,
		);
		if (!created.ok) {
			return created.snapshot;
		}
		const { started, startedThreadId } = created;

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

	/**
	 * Create the coordinator thread and prove the response is the authored profile. A start the
	 * session says was never delivered is rolled back and can be retried; anything else leaves a
	 * thread that may exist, so the snapshot becomes inspect-only and nothing is retried.
	 * @param transaction - The staged transaction.
	 * @param operationId - The host operation identity.
	 * @param selection - The chosen model and service tier.
	 * @param configured - The settings the coordinator is asked for.
	 * @param startParams - The authored thread/start body.
	 * @returns The started thread, or the snapshot the start settled as.
	 */
	async function createCoordinatorThread(
		transaction: CoordinatorEpochTransaction,
		operationId: string,
		selection: CoordinatorModelSelection,
		configured: CoordinatorConfiguredSettings,
		startParams: ReturnType<typeof createCoordinatorThreadStartParams>,
	): Promise<CreatedCoordinatorThread> {
		let started: CoordinatorStartResponse;
		try {
			started = await options.session.threadStart(startParams);
		} catch (error) {
			return {
				ok: false,
				snapshot: settleFailedStart(transaction, operationId, configured, error),
			};
		}
		try {
			assertStartedResponse(started, options.checkoutRoot, selection.configuredServiceTier);
			return { ok: true, started, startedThreadId: started.thread.id };
		} catch (error) {
			const threadId = startedThreadIdOrNull(started);
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
			return { ok: false, snapshot: hooks.snapshot() };
		}
	}

	/**
	 * Settle a thread/start that threw: rolled back when the session proves it was never sent, and
	 * inspect-only otherwise, because a thread may exist that nothing has proven.
	 * @param transaction - The staged transaction.
	 * @param operationId - The host operation identity.
	 * @param configured - The settings the coordinator is asked for.
	 * @param error - What the session threw.
	 * @returns The snapshot the start settled as.
	 */
	function settleFailedStart(
		transaction: CoordinatorEpochTransaction,
		operationId: string,
		configured: CoordinatorConfiguredSettings,
		error: unknown,
	): CoordinatorSnapshot {
		hooks.setPersistence(null);
		if (mutationOutcome(error) === "not_delivered") {
			rollback(transaction, "coordinator thread/start was not delivered");
			hooks.setSnapshot(
				failedSnapshot("The coordinator thread/start was not delivered.", configured),
			);
			return hooks.snapshot();
		}
		markUnknown(transaction, "coordinator thread/start response was lost", null);
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

	/**
	 * Stage the durable start operation, so a thread is never created without a record of the
	 * attempt.
	 * @param operationId - The host operation identity.
	 * @param configured - The settings the coordinator is asked for.
	 * @param reviewed - The reviewed hashes.
	 * @param epochSnapshot - The epoch the operation is staged against.
	 * @returns The staged transaction.
	 * @throws {CodexCoordinatorError} When staging fails.
	 */
	function stageStart(
		operationId: string,
		configured: CoordinatorConfiguredSettings,
		reviewed: CoordinatorReviewHashes,
		epochSnapshot: CoordinatorEpochSnapshot,
	): CoordinatorEpochTransaction {
		try {
			return options.epoch.stageOperation({
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
	}

	/**
	 * Wait for Codex to confirm the coordinator's settings, or give up after the settlement window.
	 * Only one handshake may be pending: a second would make it ambiguous which start a
	 * notification confirms.
	 * @param threadId - The started thread.
	 * @param started - The thread/start response the settings must match.
	 * @param configured - The settings the coordinator was asked for.
	 * @returns The pending outcome and the cancel that stops waiting for it.
	 * @throws {CodexCoordinatorError} When a handshake is already pending.
	 */
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
			/**
			 * Stop waiting for this handshake, if it is still the pending one.
			 */
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

	/**
	 * Roll back a staged start. A rollback that itself fails changes nothing: the snapshot is
	 * already terminal and the rollback is never retried.
	 * @param transaction - The staged transaction.
	 * @param reason - Why the start is being rolled back.
	 */
	const rollback = (transaction: CoordinatorEpochTransaction, reason: string): void => {
		try {
			options.epoch.rollbackOperation(transaction, reason);
		} catch {
			// The failed state remains terminal; rollback is never retried.
		}
	};
	/**
	 * Record durably that a start's outcome could not be decided, naming the thread when one may
	 * exist. A quarantine that itself fails leaves the in-memory snapshot inspect-only.
	 * @param transaction - The staged transaction.
	 * @param reason - What could not be decided.
	 * @param threadId - The thread that may exist, or null.
	 */
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

export { type CoordinatorStartHooks, createCoordinatorStarter };
