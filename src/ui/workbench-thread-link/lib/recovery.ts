// One recovery a person may take, with the owner that can actually perform
// it: the transport, the host where Archboard runs, or nobody.

import type {
	ThreadLinkRecovery,
	ThreadLinkRecoveryIntent,
} from "@/ui/workbench-thread-link/contracts";
import type { WorkbenchTransportCapabilities } from "@/ui/workbench-thread-link/transport-port";

const HOST_INTENTS: ReadonlySet<ThreadLinkRecoveryIntent> = new Set([
	"start_workbench",
	"choose_binary",
	"unlock_home",
	"repair_storage",
]);

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

/** Whether the transport can perform one transport-owned recovery. */
type Availability = (capabilities: WorkbenchTransportCapabilities) => boolean;

const TRANSPORT_AVAILABILITY: Record<
	Exclude<
		ThreadLinkRecoveryIntent,
		"start_workbench" | "choose_binary" | "unlock_home" | "repair_storage"
	>,
	Availability
> = {
	/**
	 * A refresh needs a socket.
	 * @param capabilities The transport capabilities.
	 * @returns True while connected.
	 */
	refresh_snapshot: (capabilities) => capabilities.connected,
	/**
	 * An account read needs the transport to allow one.
	 * @param capabilities The transport capabilities.
	 * @returns True when allowed.
	 */
	read_account: (capabilities) => capabilities.canReadAccount,
	/**
	 * An inventory refresh is a thread-link command.
	 * @param capabilities The transport capabilities.
	 * @returns True when accepted.
	 */
	refresh_inventory: (capabilities) => capabilities.supportsCommand("threadLinkRefresh"),
	/**
	 * A retry is a login command.
	 * @param capabilities The transport capabilities.
	 * @returns True when accepted.
	 */
	retry_login: (capabilities) => capabilities.supportsCommand("accountLogin"),
	/**
	 * A cancel is a login-cancel command.
	 * @param capabilities The transport capabilities.
	 * @returns True when accepted.
	 */
	cancel_login: (capabilities) => capabilities.supportsCommand("accountLoginCancel"),
	/**
	 * A sign-out is a logout command.
	 * @param capabilities The transport capabilities.
	 * @returns True when accepted.
	 */
	sign_out: (capabilities) => capabilities.supportsCommand("accountLogout"),
};

/**
 * Whether an intent is one the host performs where Archboard runs.
 * @param intent The intent.
 * @returns True for the four host intents.
 */
function isHostIntent(
	intent: ThreadLinkRecoveryIntent,
): intent is "start_workbench" | "choose_binary" | "unlock_home" | "repair_storage" {
	return HOST_INTENTS.has(intent);
}

/**
 * One recovery, with its owner.
 * @param intent The intent.
 * @param capabilities The transport capabilities.
 * @param hostRecoveryIntents The host intents this pane has an owner for.
 * @returns The recovery.
 */
function threadLinkRecovery(
	intent: ThreadLinkRecoveryIntent,
	capabilities: WorkbenchTransportCapabilities,
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
	const available = TRANSPORT_AVAILABILITY[intent](capabilities);
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

export { threadLinkRecovery };
