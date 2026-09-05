import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";

import type {
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchState,
	ThreadLinkReadinessArm,
	ThreadLinkReadinessDisclosure,
	ThreadLinkReadinessTone,
	ThreadLinkRecovery,
	ThreadLinkRecoveryIntent,
} from "./contract.js";

const HOST_INTENTS = [
	"start_workbench",
	"choose_binary",
	"unlock_home",
	"repair_storage",
] as const satisfies readonly ThreadLinkRecoveryIntent[];

type HostRecoveryIntent = (typeof HOST_INTENTS)[number];

const RECOVERY_TEXT = {
	refresh_snapshot: {
		label: "Refresh status",
		description: "Check the latest status from Codex.",
	},
	read_account: {
		label: "Check sign-in",
		description: "Check whether Codex is signed in.",
	},
	refresh_inventory: {
		label: "Refresh conversations",
		description: "Load the available conversations.",
	},
	start_workbench: {
		label: "Start Codex",
		description: "Start Codex, then try again.",
	},
	choose_binary: {
		label: "Correct the Codex binary",
		description:
			"Install or select the pinned Codex app-server binary this workbench requires, then start it again.",
	},
	unlock_home: {
		label: "Release the Codex home lock",
		description:
			"Stop the other owner holding the dedicated Codex home, then start this workbench again.",
	},
	repair_storage: {
		label: "Repair the Codex storage configuration",
		description:
			"Correct the dedicated Codex home and SQLite configuration, then start the workbench again.",
	},
	retry_login: {
		label: "Sign in again",
		description: "Submit a supported sign-in form again from the account section below.",
	},
	cancel_login: {
		label: "Cancel the pending sign-in",
		description: "Cancel the sign-in Codex is still waiting on, then choose a form again.",
	},
	sign_out: {
		label: "Sign out",
		description: "Sign this Codex workbench out, then sign in with a supported form.",
	},
} as const satisfies Record<
	ThreadLinkRecoveryIntent,
	{ readonly label: string; readonly description: string }
>;

const ARM_LABELS = {
	stopped: "Codex is not running",
	backoff: "Codex is waiting before its next start",
	incompatible_contract: "The Codex binary is missing, wrong, or incompatible",
	storage_mismatch: "The dedicated Codex storage was refused",
	reconnecting: "Reconnecting to Codex",
	stale_snapshot: "The workbench snapshot is stale",
	initialized: "Checking sign-in",
	login_capable: "Sign-in available",
	signed_out: "Codex is signed out",
	login_pending: "A Codex sign-in is in progress",
	login_failed: "The last Codex sign-in failed",
	coordinator_failed: "Agent setup failed",
	account_ready: "Preparing the agent",
	thread_capable: "Ready to connect",
} as const satisfies Record<ThreadLinkReadinessArm, string>;

const ARM_TONES = {
	stopped: "failed",
	backoff: "blocked",
	incompatible_contract: "failed",
	storage_mismatch: "failed",
	reconnecting: "progress",
	stale_snapshot: "blocked",
	initialized: "progress",
	login_capable: "blocked",
	signed_out: "blocked",
	login_pending: "progress",
	login_failed: "failed",
	coordinator_failed: "failed",
	account_ready: "progress",
	thread_capable: "ready",
} as const satisfies Record<ThreadLinkReadinessArm, ThreadLinkReadinessTone>;

const ARM_INTENTS = {
	stopped: ["start_workbench"],
	backoff: ["start_workbench", "refresh_snapshot"],
	// The closed browser contract folds every binary_* refusal into this one arm,
	// so the host's own reason is the only thing that separates missing from wrong.
	incompatible_contract: ["choose_binary", "start_workbench"],
	// It also folds a locked dedicated home and a rejected storage configuration
	// into one arm, so both recoveries are offered together.
	storage_mismatch: ["unlock_home", "repair_storage"],
	reconnecting: ["refresh_snapshot"],
	stale_snapshot: ["refresh_snapshot"],
	initialized: ["read_account", "refresh_snapshot"],
	login_capable: ["retry_login", "read_account"],
	signed_out: ["retry_login"],
	login_pending: ["cancel_login"],
	login_failed: ["retry_login", "cancel_login"],
	coordinator_failed: ["refresh_snapshot"],
	account_ready: ["refresh_snapshot"],
	thread_capable: [],
} as const satisfies Record<ThreadLinkReadinessArm, readonly ThreadLinkRecoveryIntent[]>;

function isHostIntent(intent: ThreadLinkRecoveryIntent): intent is HostRecoveryIntent {
	return (HOST_INTENTS as readonly ThreadLinkRecoveryIntent[]).includes(intent);
}

export function threadLinkRecovery(
	intent: ThreadLinkRecoveryIntent,
	capabilities: BrowserWorkbenchCapabilities,
	hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[],
): ThreadLinkRecovery {
	const text = RECOVERY_TEXT[intent];
	if (isHostIntent(intent)) {
		const available = hostRecoveryIntents.includes(intent);
		return Object.freeze({
			intent,
			label: text.label,
			description: available
				? text.description
				: `${text.description} Do this where Archboard is running.`,
			owner: available ? "host" : "none",
			available,
		});
	}
	const available =
		intent === "refresh_snapshot"
			? capabilities.connected
			: intent === "read_account"
				? capabilities.canReadAccount
				: intent === "refresh_inventory"
					? capabilities.supportsCommand("threadLinkRefresh")
					: intent === "retry_login"
						? capabilities.supportsCommand("accountLogin")
						: intent === "cancel_login"
							? capabilities.supportsCommand("accountLoginCancel")
							: capabilities.supportsCommand("accountLogout");
	return Object.freeze({
		intent,
		label: text.label,
		description: available
			? text.description
			: `${text.description} Reconnect before trying again.`,
		owner: available ? "transport" : "none",
		available,
	});
}

function armOf(
	state: BrowserWorkbenchState,
	snapshot: BrowserSnapshot | null,
): {
	readonly arm: ThreadLinkReadinessArm;
	readonly detail: string;
	readonly retryAtMs: number | null;
} {
	if (state.kind === "stream")
		return {
			arm: "stale_snapshot",
			detail: `${state.reason} Expected sequence ${state.expectedSequence}, received ${state.receivedSequence}.`,
			retryAtMs: null,
		};
	if (state.kind === "connection")
		return {
			arm:
				state.state === "incompatible_contract"
					? "incompatible_contract"
					: state.state === "reconnecting"
						? "reconnecting"
						: state.state === "backoff"
							? "backoff"
							: "stopped",
			detail: state.reason,
			retryAtMs: state.state === "backoff" ? state.retryAtMs : null,
		};
	const readiness: BrowserSnapshot["readiness"] = snapshot?.readiness ?? {
		kind: "readiness",
		state: "reconnecting",
		reason: "The workbench has published no readiness for this pane yet.",
	};
	if (readiness.state === "backoff")
		return { arm: "backoff", detail: readiness.reason, retryAtMs: readiness.retryAtMs };
	if (
		readiness.state === "stopped" ||
		readiness.state === "incompatible_contract" ||
		readiness.state === "storage_mismatch" ||
		readiness.state === "reconnecting"
	)
		return { arm: readiness.state, detail: readiness.reason, retryAtMs: null };
	if (snapshot?.login.state === "failed")
		return { arm: "login_failed", detail: snapshot.login.reason, retryAtMs: null };
	if (readiness.state === "account_ready" && snapshot?.coordinator.state === "failed")
		return {
			arm: "coordinator_failed",
			detail: `Agent setup failed. ${snapshot.coordinator.reason ?? "Codex could not start the coordinator."} Restart Codex after resolving this error.`,
			retryAtMs: null,
		};
	const detail = {
		initialized: "Check sign-in before starting an agent.",
		login_capable: "Sign in below to start an agent.",
		signed_out: "Sign in below to start an agent.",
		login_pending: "Finish signing in to continue.",
		account_ready: "Codex is preparing the agent. Refresh the connection if this continues.",
		thread_capable: "Ready to start an agent or choose a conversation.",
	}[readiness.state];
	return { arm: readiness.state, detail, retryAtMs: null };
}

export function projectThreadLinkReadiness(input: {
	readonly state: BrowserWorkbenchState;
	readonly capabilities: BrowserWorkbenchCapabilities;
	readonly hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[];
}): ThreadLinkReadinessDisclosure {
	const { arm, detail, retryAtMs } = armOf(input.state, input.state.snapshot);
	return Object.freeze({
		arm,
		tone: ARM_TONES[arm],
		label: ARM_LABELS[arm],
		detail,
		retryAtMs,
		recoveries: Object.freeze(
			ARM_INTENTS[arm].map((intent) =>
				threadLinkRecovery(intent, input.capabilities, input.hostRecoveryIntents),
			),
		),
	});
}
