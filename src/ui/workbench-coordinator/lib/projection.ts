// The separate voice coordinator's settings, authority and disclosure state,
// projected from the transport's published state. The coordinator is never
// the workhorse: its identity, its settings and the linked workhorse are three
// distinct sections, and every value is the host's own.

import type { BrowserSettings, BrowserSnapshot } from "@/shared/codex-browser-model";
import type { BrowserWorkbenchState } from "@/ui/workbench-transport";

/** Where the disclosure stands. */
type WorkbenchCoordinatorState =
	| "loading"
	| "confirmed"
	| "stale"
	| "unavailable"
	| "priority_fallback";

/** Whether a field is the host's confirmed value or a fallback it named. */
type WorkbenchCoordinatorFieldState = "confirmed" | "fallback";

/** One labelled value. */
interface WorkbenchCoordinatorField {
	readonly label: string;
	readonly value: string;
	readonly state: WorkbenchCoordinatorFieldState;
}

/** One labelled section of fields. */
interface WorkbenchCoordinatorSection {
	readonly label: string;
	readonly fields: readonly WorkbenchCoordinatorField[];
}

/** The disclosure's own state, with its words. */
interface WorkbenchCoordinatorStatus {
	readonly state: WorkbenchCoordinatorState;
	readonly label: string;
	readonly detail: string;
	readonly recovery: string | null;
}

/** The whole projection. */
interface WorkbenchCoordinatorSnapshot {
	readonly status: WorkbenchCoordinatorStatus;
	readonly coordinatorIdentity: WorkbenchCoordinatorSection;
	readonly coordinatorSettings: WorkbenchCoordinatorSection;
	readonly workhorse: WorkbenchCoordinatorSection;
}

const RECONNECT_RECOVERY = "Wait for updated details before relying on these values.";
const SETTINGS_RECOVERY = "Reconnect Codex to load the details.";
const SNAPSHOT_RECOVERY = "Wait for Codex to reconnect.";

const STATUS_LABELS: Readonly<Record<WorkbenchCoordinatorState, string>> = {
	loading: "Loading coordinator",
	confirmed: "Coordinator confirmed",
	stale: "Coordinator data is stale",
	unavailable: "Coordinator unavailable",
	priority_fallback: "Coordinator confirmed on the standard tier",
};

type Coordinator = BrowserSnapshot["coordinator"];

/**
 * A field, or nothing when the host published no value.
 * @param label The label.
 * @param value The value, or null.
 * @param state Confirmed or fallback.
 * @returns The frozen field, or null.
 */
function field(
	label: string,
	value: string | null,
	state: WorkbenchCoordinatorFieldState = "confirmed",
): WorkbenchCoordinatorField | null {
	return value === null ? null : Object.freeze({ label, value, state });
}

/**
 * A section of the fields that exist.
 * @param label The label.
 * @param fields The fields, some absent.
 * @returns The frozen section.
 */
function section(
	label: string,
	fields: readonly (WorkbenchCoordinatorField | null)[],
): WorkbenchCoordinatorSection {
	return Object.freeze({
		label,
		fields: Object.freeze(fields.filter((item) => item !== null)),
	});
}

/**
 * The one settings record an owner published, or null when there is not exactly one.
 * @param snapshot The snapshot.
 * @param owner The settings owner.
 * @returns The settings, or null.
 */
function ownerSettings(
	snapshot: BrowserSnapshot,
	owner: BrowserSettings["owner"],
): BrowserSettings | null {
	const matches = snapshot.settings.filter((candidate) => candidate.owner === owner);
	return matches.length === 1 ? (matches[0] ?? null) : null;
}

/**
 * A host token as words.
 * @param value The token.
 * @returns The words.
 */
function words(value: string): string {
	return value.replaceAll("_", " ").replaceAll("-", " ");
}

/**
 * An approval policy as words.
 * @param value The policy.
 * @returns The words.
 */
function approvalPolicy(value: BrowserSettings["approvalPolicy"]): string {
	if (typeof value === "string") {
		return words(value);
	}
	const enabled = Object.entries(value.granular)
		.filter((entry) => entry[1])
		.map((entry) => words(entry[0]));
	return enabled.length === 0
		? "Granular, no approval classes enabled"
		: `Granular: ${enabled.join(", ")}`;
}

const SANDBOX_LABELS: Readonly<Record<BrowserSettings["sandbox"]["mode"], string>> = {
	full_access: "Danger full access",
	read_only: "Read only",
	external: "External sandbox",
	workspace_write: "Workspace write",
};

/**
 * A sandbox policy as words.
 * @param value The policy.
 * @returns The words.
 */
function sandboxPolicy(value: BrowserSettings["sandbox"]): string {
	const label = SANDBOX_LABELS[value.mode];
	return value.mode === "full_access" ? label : `${label}, network ${words(value.network)}`;
}

/**
 * A permission profile as words.
 * @param value The profile, or null.
 * @returns The words.
 */
function permissionProfile(value: BrowserSettings["activePermissionProfile"]): string {
	if (value === null) {
		return "No active permission profile";
	}
	return value.extends === null ? value.id : `${value.id}, extends ${value.extends}`;
}

/**
 * The coordinator settings fields: the configured facts always, the effective
 * facts once the host confirmed its settings.
 * @param settings The coordinator settings, or null.
 * @param effective The coordinator, or null.
 * @returns The fields.
 */
function settingsFields(
	settings: BrowserSettings | null,
	effective: Coordinator | null,
): readonly (WorkbenchCoordinatorField | null)[] {
	if (effective === null) {
		return [];
	}
	const configured = [
		field("Configured model", effective.configuredModel),
		field("Configured reasoning effort", effective.configuredEffort),
	];
	if (settings === null) {
		return configured;
	}
	return [
		...configured,
		field("Effective model", effective.model),
		field("Effective reasoning effort", effective.effort),
		field(
			"Effective service tier",
			effective.serviceTier ?? "Standard; priority was not advertised",
			effective.serviceTier === null ? "fallback" : "confirmed",
		),
		field("Approval policy", approvalPolicy(settings.approvalPolicy)),
		field("Approvals reviewer", words(settings.approvalsReviewer)),
		field("Sandbox policy", sandboxPolicy(settings.sandbox)),
		field("Active permission profile", permissionProfile(settings.activePermissionProfile)),
	];
}

/**
 * A status.
 * @param state The state.
 * @param detail The words.
 * @param recovery The next action, or null.
 * @returns The frozen status.
 */
function status(
	state: WorkbenchCoordinatorState,
	detail: string,
	recovery: string | null,
): WorkbenchCoordinatorStatus {
	return Object.freeze({ state, label: STATUS_LABELS[state], detail, recovery });
}

/**
 * The status while the coordinator itself is connected.
 * @param coordinator The coordinator.
 * @param settings Its settings, or null.
 * @returns The status.
 */
function connectedStatus(
	coordinator: Coordinator,
	settings: BrowserSettings | null,
): WorkbenchCoordinatorStatus {
	if (
		settings === null ||
		coordinator.configuredModel === null ||
		coordinator.configuredEffort === null
	) {
		return status("unavailable", "Some coordinator settings are unavailable.", SETTINGS_RECOVERY);
	}
	if (coordinator.serviceTier === null) {
		return status(
			"priority_fallback",
			"The coordinator is using the standard service tier because priority is not available.",
			null,
		);
	}
	return status("confirmed", "Coordinator details are up to date.", null);
}

/**
 * The coordinator's own reason, or a fallback sentence.
 * @param coordinator The coordinator.
 * @param fallback The sentence when the host gave no reason.
 * @returns The words.
 */
function reasonOr(coordinator: Coordinator, fallback: string): string {
	return coordinator.reason ?? fallback;
}

/**
 * The status the coordinator's own lifecycle state gives.
 * @param coordinator The coordinator.
 * @param settings Its settings, or null.
 * @returns The status.
 */
function coordinatorStatus(
	coordinator: Coordinator,
	settings: BrowserSettings | null,
): WorkbenchCoordinatorStatus {
	switch (coordinator.state) {
		case "starting":
			return status(
				"loading",
				"The voice coordinator is starting.",
				"Wait for its settings to be confirmed.",
			);
		case "reconnecting":
			return status(
				"stale",
				reasonOr(coordinator, "The voice coordinator is reconnecting."),
				RECONNECT_RECOVERY,
			);
		case "ready":
		case "active":
			return connectedStatus(coordinator, settings);
		default:
			return status(
				"unavailable",
				reasonOr(coordinator, "The voice coordinator is not connected."),
				SETTINGS_RECOVERY,
			);
	}
}

/**
 * The disclosure status for a transport state.
 * @param state The transport state.
 * @param settings The coordinator settings, or null.
 * @returns The status.
 */
function disclosureStatus(
	state: BrowserWorkbenchState,
	settings: BrowserSettings | null,
): WorkbenchCoordinatorStatus {
	if (state.snapshot === null) {
		return status(
			"unavailable",
			"Coordinator details are unavailable.",
			state.connection === "reconnecting" ? SNAPSHOT_RECOVERY : SETTINGS_RECOVERY,
		);
	}
	if (state.state === "stale_snapshot" || state.connection === "reconnecting") {
		return status("stale", state.reason, RECONNECT_RECOVERY);
	}
	return coordinatorStatus(state.snapshot.coordinator, settings);
}

/**
 * The linked workhorse's identity, history and settings.
 * @param snapshot The snapshot, or null.
 * @returns The fields.
 */
function workhorseFields(
	snapshot: BrowserSnapshot | null,
): readonly (WorkbenchCoordinatorField | null)[] {
	if (snapshot === null) {
		return [];
	}
	const settings = ownerSettings(snapshot, "workhorse");
	return [
		field("Workhorse identity", snapshot.threadLink.threadId),
		field(
			"Workhorse history",
			snapshot.timeline === null ? null : `Current task activity for ${snapshot.timeline.threadId}`,
		),
		field(
			"Workhorse settings",
			settings === null
				? null
				: `${settings.model}, ${settings.effort ?? "host-default effort"}, ${settings.serviceTier ?? "host-default tier"}`,
		),
	];
}

/**
 * Project the coordinator disclosure.
 * @param state The transport state.
 * @returns The frozen projection.
 */
function projectWorkbenchCoordinator(state: BrowserWorkbenchState): WorkbenchCoordinatorSnapshot {
	const snapshot = state.snapshot;
	const settings = snapshot === null ? null : ownerSettings(snapshot, "coordinator");
	return Object.freeze({
		status: disclosureStatus(state, settings),
		coordinatorIdentity: section("Coordinator identity", [
			field("Conversation", snapshot?.coordinator.threadId ?? null),
		]),
		coordinatorSettings: section(
			"Coordinator settings",
			settingsFields(settings, snapshot?.coordinator ?? null),
		),
		workhorse: section("Linked conversation", workhorseFields(snapshot)),
	});
}

export {
	projectWorkbenchCoordinator,
	type WorkbenchCoordinatorField,
	type WorkbenchCoordinatorFieldState,
	type WorkbenchCoordinatorSection,
	type WorkbenchCoordinatorSnapshot,
	type WorkbenchCoordinatorState,
	type WorkbenchCoordinatorStatus,
};
