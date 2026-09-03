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

const RECONNECT_RECOVERY = "Wait for a fresh host snapshot before relying on this value.";
const SETTINGS_RECOVERY = "Reconnect the Codex workbench so the host can publish it.";
const SNAPSHOT_RECOVERY = "Wait for the Codex workbench to reconnect and publish a fresh snapshot.";
const HANDSHAKE_RECOVERY = "Wait for the coordinator settings handshake to finish.";
const HISTORY_RECOVERY = "Open the coordinator task separately to inspect its history.";

function freezeField(value: WorkbenchCoordinatorField): WorkbenchCoordinatorField {
	return Object.freeze(value);
}

function field(
	label: string,
	value: string,
	state: WorkbenchCoordinatorField["state"] = "confirmed",
	recovery: string | null = null,
): WorkbenchCoordinatorField {
	return freezeField({ label, value, state, recovery });
}

function unavailable(
	label: string,
	hostFact: string,
	recovery = SETTINGS_RECOVERY,
): WorkbenchCoordinatorField {
	return field(
		label,
		`Unavailable: the host did not publish ${hostFact}.`,
		"unavailable",
		recovery,
	);
}

function section(
	label: string,
	fields: readonly WorkbenchCoordinatorField[],
): WorkbenchCoordinatorSection {
	return Object.freeze({ label, fields: Object.freeze([...fields]) });
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

function sandboxPolicy(value: BrowserSettings["sandboxPolicy"]): string {
	switch (value.type) {
		case "dangerFullAccess":
			return "Danger full access";
		case "readOnly":
			return `Read only, network ${value.networkAccess ? "enabled" : "blocked"}`;
		case "externalSandbox":
			return `External sandbox, network ${value.networkAccess}`;
		case "workspaceWrite":
			return `Workspace write, ${value.writableRoots.length} writable root${value.writableRoots.length === 1 ? "" : "s"}, network ${value.networkAccess ? "enabled" : "blocked"}`;
	}
}

function permissionProfile(value: BrowserSettings["activePermissionProfile"]): string {
	if (value === null) return "No active permission profile";
	return value.extends === null ? value.id : `${value.id}, extends ${value.extends}`;
}

function settingsFields(
	settings: BrowserSettings | null,
	effective: BrowserSnapshot["coordinator"],
): readonly WorkbenchCoordinatorField[] {
	const missingRecovery = effective.state === "starting" ? HANDSHAKE_RECOVERY : SETTINGS_RECOVERY;
	if (settings === null) {
		return [
			effective.configuredModel === null
				? unavailable("Configured model", "the coordinator's configured model", missingRecovery)
				: field("Configured model", effective.configuredModel),
			effective.configuredEffort === null
				? unavailable(
						"Configured reasoning effort",
						"the coordinator's configured reasoning effort",
						missingRecovery,
					)
				: field("Configured reasoning effort", effective.configuredEffort),
			unavailable("Effective model", "the coordinator's effective model", missingRecovery),
			unavailable(
				"Effective reasoning effort",
				"the coordinator's effective reasoning effort",
				missingRecovery,
			),
			unavailable(
				"Effective service tier",
				"the coordinator's effective service tier",
				missingRecovery,
			),
			unavailable("Approval policy", "approvalPolicy", missingRecovery),
			unavailable("Approvals reviewer", "approvalsReviewer", missingRecovery),
			unavailable("Sandbox policy", "sandboxPolicy", missingRecovery),
			unavailable("Active permission profile", "activePermissionProfile", missingRecovery),
		];
	}
	return [
		effective.configuredModel === null
			? unavailable("Configured model", "the coordinator's configured model")
			: field("Configured model", effective.configuredModel),
		effective.configuredEffort === null
			? unavailable("Configured reasoning effort", "the coordinator's configured reasoning effort")
			: field("Configured reasoning effort", effective.configuredEffort),
		effective.model === null
			? unavailable("Effective model", "the coordinator's effective model")
			: field("Effective model", effective.model),
		effective.effort === null
			? unavailable("Effective reasoning effort", "the coordinator's effective reasoning effort")
			: field("Effective reasoning effort", effective.effort),
		effective.serviceTier === null
			? field(
					"Effective service tier",
					"Standard host tier; priority was not advertised",
					"fallback",
					"Use the host-selected tier, or choose a model that advertises priority.",
				)
			: field("Effective service tier", effective.serviceTier),
		field("Approval policy", approvalPolicy(settings.approvalPolicy)),
		field("Approvals reviewer", words(settings.approvalsReviewer)),
		field("Sandbox policy", sandboxPolicy(settings.sandboxPolicy)),
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
			"The coordinator identity and settings are not available from the host.",
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
			"The host is starting the read-only voice coordinator and confirming its settings.",
			"Wait for the settings handshake to finish.",
		);
	}
	if (coordinator.state === "reconnecting") {
		return status(
			"stale",
			coordinator.reason ?? "The coordinator is reconnecting with its last confirmed identity.",
			RECONNECT_RECOVERY,
		);
	}
	if (coordinator.state !== "ready" && coordinator.state !== "active") {
		return status(
			"unavailable",
			coordinator.reason ?? "The host has no usable coordinator identity.",
			SETTINGS_RECOVERY,
		);
	}
	if (
		settings === null ||
		coordinator.configuredModel === null ||
		coordinator.configuredEffort === null
	) {
		return status(
			"unavailable",
			"The coordinator is linked, but the host did not publish one confirmed coordinator settings record.",
			SETTINGS_RECOVERY,
		);
	}
	if (coordinator.serviceTier === null) {
		return status(
			"priority_fallback",
			"The host confirmed the coordinator. Its model did not advertise the priority tier, so Codex selected the standard tier.",
			null,
		);
	}
	return status(
		"confirmed",
		"The host confirmed this coordinator identity and its effective settings.",
		null,
	);
}

function workhorseFields(snapshot: BrowserSnapshot | null): readonly WorkbenchCoordinatorField[] {
	if (snapshot === null) {
		return [
			unavailable("Workhorse identity", "the linked workhorse identity"),
			unavailable("Workhorse history", "the linked workhorse history"),
			unavailable("Workhorse settings", "the linked workhorse settings"),
		];
	}
	const link = snapshot.threadLink;
	const settings = ownerSettings(snapshot, "workhorse");
	const history = snapshot.timeline;
	return [
		link.threadId === null
			? unavailable("Workhorse identity", "the linked workhorse identity")
			: field("Workhorse identity", link.threadId),
		history === null
			? field("Workhorse history", "No workhorse activity is loaded")
			: field("Workhorse history", `Current task activity for ${history.threadId}`),
		settings === null
			? unavailable("Workhorse settings", "the linked workhorse settings")
			: field(
					"Workhorse settings",
					`${settings.model}, ${settings.effort ?? "host-default effort"}, ${settings.serviceTier ?? "host-default tier"}`,
				),
	];
}

export function projectWorkbenchCoordinator(
	state: BrowserWorkbenchState,
): WorkbenchCoordinatorSnapshot {
	const snapshot = state.snapshot;
	const settings = snapshot === null ? null : ownerSettings(snapshot, "coordinator");
	const identityFields: readonly WorkbenchCoordinatorField[] =
		snapshot?.coordinator.threadId === null || snapshot?.coordinator.threadId === undefined
			? [
					unavailable("Coordinator identity", "the coordinator thread identity"),
					unavailable("Coordinator history", "the read-only coordinator history", HISTORY_RECOVERY),
				]
			: [
					field("Coordinator identity", snapshot.coordinator.threadId),
					unavailable("Coordinator history", "the read-only coordinator history", HISTORY_RECOVERY),
				];
	return Object.freeze({
		status: disclosureState(state, snapshot, settings),
		coordinatorIdentity: section("Coordinator identity and history", identityFields),
		coordinatorSettings: section(
			"Coordinator settings",
			settingsFields(
				settings,
				snapshot?.coordinator ?? {
					kind: "coordinator",
					state: "unbound",
					threadId: null,
					activeTurnId: null,
					configuredModel: null,
					configuredEffort: null,
					model: null,
					effort: null,
					serviceTier: null,
					reason: null,
				},
			),
		),
		workhorse: section(
			"Linked workhorse identity, history, and settings",
			workhorseFields(snapshot),
		),
	});
}
