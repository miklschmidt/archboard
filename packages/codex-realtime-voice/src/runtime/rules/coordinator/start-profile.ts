import { CodexCoordinatorError } from "#runtime/protocol/coordinator/contract.ts";
import type {
	CodexCoordinatorOptions,
	CoordinatorConfiguredSettings,
	CoordinatorEffectiveSettings,
	CoordinatorSettings,
	CoordinatorStartResponse,
	CoordinatorThreadSettings,
} from "#runtime/protocol/coordinator/contract.ts";
import { COORDINATOR_EFFORT, COORDINATOR_MODEL } from "#runtime/services/coordinator/model.ts";
import { sameValue } from "#runtime/state/coordinator/state.ts";
import {
	CODEX_SESSION_THREAD_SOURCE,
	CodexSessionMutationError,
} from "@archboard/codex-app-server/session";
import type { ThreadId } from "@archboard/codex-app-server/identity";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";

const COORDINATOR_THREAD_SOURCE = CODEX_SESSION_THREAD_SOURCE;

/**
 * The thread a start response names, when the response is well-formed enough to carry one: a
 * refusal still records the thread so an unknown outcome can be inspected.
 * @param started - The thread/start response.
 * @returns The thread identity, or null.
 */
function startedThreadIdOrNull(started: CoordinatorStartResponse): ThreadId | null {
	// This runs from the catch of the very assertion that would have proved the
	// response's shape, so it reads unvalidated wire data and must not dereference
	// blindly: a second throw here escapes before the transaction is marked unknown,
	// which leaves the epoch staged and every later ensure inspect-only.
	return threadIdOrNull(started);
}

/** A thread/start response as the wire may actually have sent it, not as the contract declares it. */
type LooseStartResponse = { readonly thread?: { readonly id?: ThreadId } };

/**
 * The thread id a start response carries, reading the response as the wire may actually have
 * sent it rather than as the contract declares it.
 * @param response - The thread/start response.
 * @returns The thread identity, or null when the response names none.
 */
function threadIdOrNull(response: LooseStartResponse): ThreadId | null {
	const id = response.thread?.id;
	return id === undefined || id.length === 0 ? null : id;
}

/**
 * Prove a thread/start response is the authored coordinator profile, naming every field that does
 * not match so a refusal can be diagnosed from its message alone.
 * @param response - The thread/start response.
 * @param workingDirectory - The directory of its own the coordinator must be in.
 * @param serviceTier - The advertised priority tier, or null.
 * @throws {CodexCoordinatorError} When any field does not match the authored profile.
 * @param threadSource The host policy for this operation.
 */
function assertStartedResponse(
	response: CoordinatorStartResponse,
	workingDirectory: string,
	serviceTier: "priority" | null,
	threadSource: string,
): void {
	const mismatches = Object.entries({
		"thread.id": response.thread.id.length === 0,
		model: response.model !== COORDINATOR_MODEL,
		modelProvider: response.modelProvider.length === 0,
		"thread.modelProvider": response.thread.modelProvider !== response.modelProvider,
		serviceTier: serviceTier === "priority" && response.serviceTier !== "priority",
		cwd: response.cwd !== workingDirectory,
		runtimeWorkspaceRoots:
			response.runtimeWorkspaceRoots.length !== 1 ||
			response.runtimeWorkspaceRoots[0] !== workingDirectory,
		"thread.cwd": response.thread.cwd !== workingDirectory,
		"thread.historyMode": response.thread.historyMode !== "paginated",
		"thread.source": response.thread.source !== COORDINATOR_THREAD_SOURCE,
		"thread.threadSource": response.thread.threadSource !== threadSource,
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

/**
 * The coordinator's settings as they will be retained: what the workbench asked for, what Codex
 * applied, and the permissions the thread runs under.
 * @param configured - The settings the coordinator was asked for.
 * @param settings - The settings Codex confirmed.
 * @returns The frozen settings.
 */
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

/**
 * What a failed start proved about delivery. Only the session's own assertion that it was never
 * delivered is trusted; anything else leaves a thread that may exist.
 * @param error - The thrown value.
 * @returns The settled outcome.
 */
function mutationOutcome(error: unknown): "not_delivered" | "outcome_unknown" {
	return error instanceof CodexSessionMutationError && error.outcome === "not_delivered"
		? "not_delivered"
		: "outcome_unknown";
}

/**
 * Whether a notification belongs to the current Codex child epoch.
 * @param event - The transport notification.
 * @param options - The coordinator options carrying the identity authority.
 * @returns True when it is the current child's.
 */
function isCurrentNotification(
	event: TransportServerNotification,
	options: CodexCoordinatorOptions,
): boolean {
	return (
		event.correlation.child === options.identity.validator.childId &&
		event.correlation.epoch === options.identity.validator.epoch
	);
}

/**
 * Why the confirmed model settings are not the reviewed selection: the wrong model or effort, a
 * provider or tier that changed since the start, or a priority tier that was advertised but not
 * applied.
 * @param started - The thread/start response.
 * @param configured - The settings the coordinator was asked for.
 * @param settings - The settings Codex confirmed.
 * @returns The mismatch, or null when the model settings match.
 */
function modelSettingsMismatch(
	started: CoordinatorStartResponse,
	configured: CoordinatorConfiguredSettings,
	settings: CoordinatorThreadSettings,
): string | null {
	if (settings.cwd !== started.cwd) {
		return "Coordinator settings changed its working directory.";
	}
	if (settings.model !== COORDINATOR_MODEL) {
		return `Coordinator settings did not confirm ${COORDINATOR_MODEL}.`;
	}
	if (settings.modelProvider !== started.modelProvider) {
		return "Coordinator settings changed the provider selected at start.";
	}
	if (settings.effort !== COORDINATOR_EFFORT) {
		return `Coordinator settings did not confirm ${COORDINATOR_EFFORT} effort.`;
	}
	return tierMismatch(started, configured, settings);
}

/**
 * Why the confirmed service tier is not the one the thread started with, or not the advertised
 * priority tier the coordinator asked for.
 * @param started - The thread/start response.
 * @param configured - The settings the coordinator was asked for.
 * @param settings - The settings Codex confirmed.
 * @returns The mismatch, or null when the tier matches.
 */
function tierMismatch(
	started: CoordinatorStartResponse,
	configured: CoordinatorConfiguredSettings,
	settings: CoordinatorThreadSettings,
): string | null {
	if (settings.serviceTier !== started.serviceTier) {
		return "Coordinator settings did not confirm the effective service tier.";
	}
	return configured.serviceTier === "priority" && settings.serviceTier !== "priority"
		? "Coordinator settings did not confirm advertised priority."
		: null;
}

/**
 * Why the confirmed permission settings are not the ones the thread started with. These decide
 * what the coordinator may do, so a settings update that changes any of them silently is refused.
 * @param started - The thread/start response.
 * @param settings - The settings Codex confirmed.
 * @returns The mismatch, or null when the permissions are unchanged.
 */
function permissionSettingsMismatch(
	started: CoordinatorStartResponse,
	settings: CoordinatorThreadSettings,
): string | null {
	if (!sameValue(settings.approvalPolicy, started.approvalPolicy)) {
		return "Coordinator settings changed the start approval policy.";
	}
	if (!sameValue(settings.approvalsReviewer, started.approvalsReviewer)) {
		return "Coordinator settings changed the start approvals reviewer.";
	}
	if (!sameValue(settings.sandboxPolicy, started.sandbox)) {
		return "Coordinator settings changed the start sandbox policy.";
	}
	return sameValue(settings.activePermissionProfile, started.activePermissionProfile)
		? null
		: "Coordinator settings changed the start permission profile.";
}

/**
 * Why the settings Codex confirmed are not the ones the coordinator was started with and asked
 * for. Only an exact match settles the handshake, because these settings are what the reviewed
 * settings hash is taken over.
 * @param started - The thread/start response.
 * @param configured - The settings the coordinator was asked for.
 * @param settings - The settings Codex confirmed.
 * @returns The mismatch, or null when they match.
 */
function settingsMismatch(
	started: CoordinatorStartResponse,
	configured: CoordinatorConfiguredSettings,
	settings: CoordinatorThreadSettings,
): string | null {
	return (
		modelSettingsMismatch(started, configured, settings) ??
		permissionSettingsMismatch(started, settings)
	);
}

export {
	COORDINATOR_THREAD_SOURCE,
	assertStartedResponse,
	coordinatorSettings,
	isCurrentNotification,
	mutationOutcome,
	settingsMismatch,
	startedThreadIdOrNull,
};
