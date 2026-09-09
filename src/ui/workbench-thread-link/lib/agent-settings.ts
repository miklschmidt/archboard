// What the committed presentations need from the thread link: the workbench
// header's link actions (`@/ui/workbench/contracts`) and the agent settings
// dialog's busy, error and callback inputs (`@/ui/agent-settings`). Nothing
// here decides anything the controller does not; it only maps.

import type { LoginId } from "@/shared/codex-workbench-identity";
import type { AgentSettingsBusy, AgentSettingsErrors, LoginVariant } from "@/ui/agent-settings";
import type {
	ThreadLinkAccountFieldValues,
	ThreadLinkActionName,
	ThreadLinkActionSnapshot,
	ThreadLinkController,
} from "@/ui/workbench-thread-link/contracts";
import { buildThreadLinkLogin } from "@/ui/workbench-thread-link/lib/account-forms";
import type { WorkbenchThreadLinkActions } from "@/ui/workbench/contracts";
import { type DialogError } from "@/ui/dialog-parts";

const ACCOUNT_ACTIONS: ReadonlySet<ThreadLinkActionName> = new Set([
	"login",
	"cancel_login",
	"logout",
]);
const LINK_ACTIONS: ReadonlySet<ThreadLinkActionName> = new Set([
	"create",
	"attach",
	"relink",
	"refresh_inventory",
]);

/** The callbacks the agent settings dialog calls. */
interface AgentSettingsCallbacks {
	readonly onSignIn: (variant: LoginVariant) => void;
	readonly onCancelLogin: (loginId: LoginId) => void;
	readonly onLinkThread: (selectionId: string) => void;
	readonly onUnlinkThread: () => void;
}

/** What the header's chooser action opens. */
interface WorkbenchThreadLinkActionOptions {
	/** Open the candidate chooser, which lives in the agent settings dialog. */
	readonly openChooser: () => void;
}

/**
 * Which dialog actions are on the wire.
 * @param action The published action.
 * @returns The busy flags.
 */
function agentSettingsBusy(action: ThreadLinkActionSnapshot): AgentSettingsBusy {
	const pending = action.state === "pending" ? action.action : null;
	return Object.freeze({
		signIn: pending === "login",
		cancelLogin: pending === "cancel_login",
		link: pending !== null && LINK_ACTIONS.has(pending),
		unlink: false,
	});
}

/**
 * The error of one failed or inspect-only action.
 * @param action The published action.
 * @returns The error, or null.
 */
function actionError(action: ThreadLinkActionSnapshot): DialogError | null {
	if (action.state !== "failed" && action.state !== "inspect_only") {
		return null;
	}
	const recovery = action.recovery === null ? "" : ` ${action.recovery.description}`;
	return {
		title: action.state === "failed" ? "The action failed" : "The outcome is unconfirmed",
		message: `${action.announcement}${recovery}`,
	};
}

/**
 * The dialog's errors, one per section, from the published action.
 * @param action The published action.
 * @returns The errors.
 */
function agentSettingsErrors(action: ThreadLinkActionSnapshot): AgentSettingsErrors {
	const error = actionError(action);
	const section = action.state === "idle" ? null : sectionOf(action.action);
	return Object.freeze({
		account: section === "account" ? error : null,
		threadLink: section === "threadLink" ? error : null,
		coordinator: null,
	});
}

/**
 * The dialog section one action belongs to.
 * @param name The action.
 * @returns The section, or null for a recovery.
 */
function sectionOf(name: ThreadLinkActionName): "account" | "threadLink" | null {
	if (ACCOUNT_ACTIONS.has(name)) {
		return "account";
	}
	return LINK_ACTIONS.has(name) || name === "unlink" ? "threadLink" : null;
}

/**
 * The dialog's callbacks over one controller.
 * @param controller The controller.
 * @param credentials The field values of the chosen sign-in form; the dialog
 * carries none, so only ChatGPT can start without them.
 * @returns The callbacks.
 */
function agentSettingsCallbacks(
	controller: ThreadLinkController,
	credentials: ThreadLinkAccountFieldValues = {},
): AgentSettingsCallbacks {
	return Object.freeze({
		/**
		 * Start one sign-in with the chosen form.
		 * @param variant The form.
		 */
		onSignIn: (variant: LoginVariant): void => {
			const built = buildThreadLinkLogin(variant, credentials);
			if (built.ok) {
				void controller.login(built.login);
			}
		},
		/**
		 * Cancel one pending sign-in.
		 * @param loginId The sign-in.
		 */
		onCancelLogin: (loginId: LoginId): void => {
			void controller.cancelLogin(loginId);
		},
		/**
		 * Bind one listed candidate.
		 * @param selectionId The one-shot selection.
		 */
		onLinkThread: (selectionId: string): void => {
			void controller.bindSelection(selectionId);
		},
		/**
		 * Ask to drop the explicit link.
		 */
		onUnlinkThread: (): void => {
			void controller.unlink();
		},
	});
}

/**
 * The header's thread-link actions over one controller.
 * @param controller The controller.
 * @param options What the chooser opens.
 * @returns The actions.
 */
function workbenchThreadLinkActions(
	controller: ThreadLinkController,
	options: WorkbenchThreadLinkActionOptions,
): WorkbenchThreadLinkActions {
	return Object.freeze({
		/**
		 * Create a fresh workhorse.
		 */
		link: (): void => {
			void controller.create();
		},
		/**
		 * Ask to drop the explicit link.
		 */
		unlink: (): void => {
			void controller.unlink();
		},
		choose: options.openChooser,
		/**
		 * Ask the host to rediscover its inventory.
		 */
		refresh: (): void => {
			void controller.refreshInventory();
		},
	});
}

export {
	agentSettingsBusy,
	agentSettingsCallbacks,
	agentSettingsErrors,
	workbenchThreadLinkActions,
	type AgentSettingsCallbacks,
	type WorkbenchThreadLinkActionOptions,
};
