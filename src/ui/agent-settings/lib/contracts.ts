// The typed inputs and outputs of the agent settings dialog. Every state it
// shows is a shared browser-model record, named after that record; the dialog
// adds only busy and error inputs per section and the callbacks the host
// satisfies.

import type {
	BrowserAccount,
	BrowserCoordinator,
	BrowserLogin,
	BrowserSettings,
	BrowserThreadCandidates,
	BrowserThreadLink,
} from "@/shared/codex-browser-model";
import type { DialogError } from "@/ui/board-dialogs";

/** A sign-in variant the account model can be pending on. */
type LoginVariant = Extract<BrowserAccount, { state: "login_pending" }>["variant"];

/** A login's identity, as the login model carries it. */
type LoginId = Extract<BrowserLogin, { state: "pending" }>["loginId"];

/** A pending login, for the cancel action. */
type PendingLogin = Extract<BrowserLogin, { state: "pending" }>;

/** The dialog's actions, each with its own in-flight state. */
interface AgentSettingsBusy {
	signIn: boolean;
	cancelLogin: boolean;
	link: boolean;
	unlink: boolean;
}

/** The host's errors, one per section, each staying until it clears it. */
interface AgentSettingsErrors {
	account: DialogError | null;
	threadLink: DialogError | null;
	coordinator: DialogError | null;
}

/** Inputs for the agent settings dialog. */
interface AgentSettingsDialogProps {
	open: boolean;
	account: BrowserAccount;
	login: BrowserLogin;
	threadLink: BrowserThreadLink;
	threadCandidates: BrowserThreadCandidates;
	/** The published settings, one record per owner. */
	settings: readonly BrowserSettings[];
	coordinator: BrowserCoordinator;
	busy: AgentSettingsBusy;
	errors: AgentSettingsErrors;
	onSignIn: (variant: LoginVariant) => void;
	onCancelLogin: (loginId: LoginId) => void;
	/** Bind the pane to one listed candidate by its one-shot selection id. */
	onLinkThread: (selectionId: string) => void;
	onUnlinkThread: () => void;
	onOpenChange: (open: boolean) => void;
	/** Where focus returns when the dialog closes: the control that opened it. */
	finalFocus?: () => HTMLElement | null;
}

export type {
	AgentSettingsBusy,
	AgentSettingsDialogProps,
	AgentSettingsErrors,
	LoginId,
	LoginVariant,
	PendingLogin,
};
