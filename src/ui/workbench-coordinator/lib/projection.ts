import type {
	BrowserSettings,
	BrowserSnapshot,
} from "../../../shared/codex-browser-model/index.js";
import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import type {
	WorkbenchCoordinatorField,
	WorkbenchCoordinatorSection,
	WorkbenchCoordinatorSnapshot,
	WorkbenchCoordinatorState,
	WorkbenchCoordinatorStatus,
} from "../contract.js";

const RECONNECT_RECOVERY = "Wait for updated details before relying on these values.";
const SETTINGS_RECOVERY = "Reconnect Codex to load the details.";
const SNAPSHOT_RECOVERY = "Wait for Codex to reconnect.";

function field(
	label: string,
	value: string | null,
	state: WorkbenchCoordinatorField["state"] = "confirmed",
): WorkbenchCoordinatorField | null {
	return value === null ? null : Object.freeze({ label, value, state });
}

function section(
	label: string,
	fields: readonly (WorkbenchCoordinatorField | null)[],
): WorkbenchCoordinatorSection {
	return Object.freeze({ label, fields: Object.freeze(fields.filter((item) => item !== null)) });
}

function ownerSettings(
	snapshot: BrowserSnapshot,
	owner: BrowserSettings["owner"],
): BrowserSettings | null {
	const matches = snapshot.settings.filter((candidate) => candidate.owner === owner);
	return matches.length === 1 ? matches[0]! : null;
}

function words(value: string): string {
	return value.replaceAll("_", " ").replaceAll("-", " ");
}

function approvalPolicy(value: BrowserSettings["approvalPolicy"]): string {
	if (typeof value === "string") return words(value);
	const enabled = Object.entries(value.granular)
		.filter((entry) => entry[1])
		.map((entry) => words(entry[0]));
	return enabled.length === 0
		? "Granular, no approval classes enabled"
		: `Granular: ${enabled.join(", ")}`;
}

function sandboxPolicy(value: BrowserSettings["sandbox"]): string {
	switch (value.mode) {
		case "full_access":
			return "Danger full access";
		case "read_only":
			return `Read only, network ${words(value.network)}`;
		case "external":
			return `External sandbox, network ${words(value.network)}`;
		case "workspace_write":
			return `Workspace write, network ${words(value.network)}`;
	}
}

function permissionProfile(value: BrowserSettings["activePermissionProfile"]): string {
	if (value === null) return "No active permission profile";
	return value.extends === null ? value.id : `${value.id}, extends ${value.extends}`;
}

function settingsFields(
	settings: BrowserSettings | null,
	effective: BrowserSnapshot["coordinator"] | null,
): readonly (WorkbenchCoordinatorField | null)[] {
	if (effective === null) return [];
	const configured = [
		field("Configured model", effective.configuredModel),
		field("Configured reasoning effort", effective.configuredEffort),
	];
	if (settings === null) return configured;
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

function status(
	state: WorkbenchCoordinatorState,
	detail: string,
	recovery: string | null,
): WorkbenchCoordinatorStatus {
	const labels = {
		loading: "Loading coordinator",
		confirmed: "Coordinator confirmed",
		stale: "Coordinator data is stale",
		unavailable: "Coordinator unavailable",
		priority_fallback: "Coordinator confirmed on the standard tier",
	} as const satisfies Record<WorkbenchCoordinatorState, string>;
	return Object.freeze({ state, label: labels[state], detail, recovery });
}

function disclosureState(
	state: BrowserWorkbenchState,
	snapshot: BrowserSnapshot | null,
	settings: BrowserSettings | null,
): WorkbenchCoordinatorStatus {
	if (snapshot === null) {
		return status(
			"unavailable",
			"Coordinator details are unavailable.",
			state.connection === "reconnecting" ? SNAPSHOT_RECOVERY : SETTINGS_RECOVERY,
		);
	}
	if (state.state === "stale_snapshot" || state.connection === "reconnecting") {
		return status("stale", state.reason, RECONNECT_RECOVERY);
	}
	const coordinator = snapshot.coordinator;
	if (coordinator.state === "starting") {
		return status(
			"loading",
			"The voice coordinator is starting.",
			"Wait for its settings to be confirmed.",
		);
	}
	if (coordinator.state === "reconnecting") {
		return status(
			"stale",
			coordinator.reason ?? "The voice coordinator is reconnecting.",
			RECONNECT_RECOVERY,
		);
	}
	if (coordinator.state !== "ready" && coordinator.state !== "active") {
		return status(
			"unavailable",
			coordinator.reason ?? "The voice coordinator is not connected.",
			SETTINGS_RECOVERY,
		);
	}
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

function workhorseFields(
	snapshot: BrowserSnapshot | null,
): readonly (WorkbenchCoordinatorField | null)[] {
	if (snapshot === null) return [];
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

export function projectWorkbenchCoordinator(
	state: BrowserWorkbenchState,
): WorkbenchCoordinatorSnapshot {
	const snapshot = state.snapshot;
	const settings = snapshot === null ? null : ownerSettings(snapshot, "coordinator");
	return Object.freeze({
		status: disclosureState(state, snapshot, settings),
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
