import type {
	BrowserThreadLink,
	BrowserThreadLinkSourcePresentation,
} from "../../../shared/codex-browser-model/index.js";
import type { LoginId, ThreadId } from "../../../shared/codex-workbench-identity/index.js";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";

type ListedThreadLink = Exclude<BrowserThreadLink, { readonly state: "unbound" }>;

/** The four Codex thread statuses a listed record can carry. */
export type ThreadLinkListedStatus = ListedThreadLink["status"];

/**
 * The account/login/start parameters the closed browser contract admits. Taken
 * from the transport draft rather than redeclared, so a Codex upgrade that
 * changes a supported form is a compile error in this module.
 */
export type ThreadLinkLoginParams = Extract<
	BrowserCommandDraft,
	{ readonly command: "accountLogin" }
>["login"];

export type ThreadLinkAccountFormId = ThreadLinkLoginParams["type"];

/**
 * One host-discovered thread record, already joined against both exhausted
 * lists by the owner that discovered it.
 *
 * The closed workbench gateway publishes the pane's own `threadLink` and no
 * candidate route, so the inventory reaches the browser as data rather than as
 * a call this module can make. The shape mirrors the runtime thread-link
 * candidate projection plus the two join counts from its observation, so the
 * host has nothing to invent when it supplies one.
 */
export interface ThreadLinkInventoryRecord {
	/** The opaque host-retained selection handle; never a thread id. */
	readonly selectionId: string;
	readonly threadId: ThreadId;
	readonly state: ListedThreadLink["state"];
	readonly reason: string | null;
	readonly source: BrowserThreadLinkSourcePresentation;
	readonly status: ThreadLinkListedStatus;
	readonly loaded: boolean;
	/** Null is an unknown capability, which is not a controllable thread. */
	readonly canAcceptDirectInput: boolean | null;
	/** Rows for this thread in the exhausted persisted list. Exactly one joins. */
	readonly persistedRows: number;
	/** Occurrences of this thread in the exhausted current loaded list. */
	readonly loadedOccurrences: number;
}

export type ThreadLinkInventory =
	| { readonly state: "loading" }
	| { readonly state: "unavailable"; readonly reason: string }
	| {
			readonly state: "listed";
			readonly records: readonly ThreadLinkInventoryRecord[];
			/** When the host exhausted both lists in one uninterrupted generation. */
			readonly exhausted: boolean;
	  };

export type ThreadLinkRecoveryIntent =
	| "refresh_snapshot"
	| "read_account"
	| "refresh_inventory"
	| "start_workbench"
	| "choose_binary"
	| "unlock_home"
	| "repair_storage"
	| "retry_login"
	| "cancel_login"
	| "sign_out";

/**
 * The recovery intents the controller performs itself. Retrying, cancelling, or
 * ending a sign-in are account controls with their own arguments, so they are
 * offered through the account section rather than as a generic recovery.
 */
export type ThreadLinkControllerRecoveryIntent = Exclude<
	ThreadLinkRecoveryIntent,
	"retry_login" | "cancel_login" | "sign_out"
>;

/** Who can actually perform a recovery, so a dead control is never rendered. */
export type ThreadLinkRecoveryOwner = "transport" | "host" | "none";

export interface ThreadLinkRecovery {
	readonly intent: ThreadLinkRecoveryIntent;
	readonly label: string;
	readonly description: string;
	readonly owner: ThreadLinkRecoveryOwner;
	readonly available: boolean;
}

export type ThreadLinkReadinessArm =
	| "stopped"
	| "backoff"
	| "incompatible_contract"
	| "storage_mismatch"
	| "reconnecting"
	| "stale_snapshot"
	| "initialized"
	| "login_capable"
	| "signed_out"
	| "login_pending"
	| "login_failed"
	| "account_ready"
	| "thread_capable";

export type ThreadLinkReadinessTone = "ready" | "progress" | "blocked" | "failed";

export interface ThreadLinkReadinessDisclosure {
	readonly arm: ThreadLinkReadinessArm;
	readonly tone: ThreadLinkReadinessTone;
	readonly label: string;
	readonly detail: string;
	/** Present only on the backoff arm, which is the one arm carrying an instant. */
	readonly retryAtMs: number | null;
	readonly recoveries: readonly ThreadLinkRecovery[];
}

export type ThreadLinkRowIntent = "attach" | "relink" | "current";

/** What binding this record would disclose before anybody binds it. */
export type ThreadLinkRowOutcome = "executable" | "inspect_only";

export interface ThreadLinkRow {
	readonly selectionId: string;
	readonly threadId: ThreadId;
	readonly intent: ThreadLinkRowIntent;
	readonly outcome: ThreadLinkRowOutcome;
	readonly command:
		| Extract<
				BrowserCommandDraft,
				{ readonly command: "threadLinkAttach" | "threadLinkRelink" }
		  >["command"]
		| null;
	readonly stateLabel: string;
	readonly sourceLabel: string;
	readonly statusLabel: string;
	readonly loadedLabel: string;
	readonly controllabilityLabel: string;
	readonly reasonLabel: string;
	readonly enabled: boolean;
	readonly blockedReason: string | null;
	readonly persistedRows: number;
	readonly loadedOccurrences: number;
}

export type ThreadLinkExclusion =
	| "not_persisted"
	| "persisted_ambiguous"
	| "loaded_ambiguous"
	| "duplicate_row";

export interface ThreadLinkExcludedRow {
	readonly selectionId: string;
	readonly threadId: ThreadId;
	readonly exclusion: ThreadLinkExclusion;
	readonly explanation: string;
}

export interface ThreadLinkSelection {
	readonly state: "loading" | "unavailable" | "empty" | "listed";
	readonly summary: string;
	readonly rows: readonly ThreadLinkRow[];
	readonly excluded: readonly ThreadLinkExcludedRow[];
	readonly recovery: ThreadLinkRecovery;
}

export interface ThreadLinkCreateOffer {
	readonly command: Extract<
		BrowserCommandDraft,
		{ readonly command: "threadLinkCreate" }
	>["command"];
	readonly label: string;
	readonly prerequisite: string;
	readonly enabled: boolean;
	readonly blockedReason: string | null;
}

export interface ThreadLinkAccountField {
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly required: boolean;
	readonly secret: boolean;
}

export interface ThreadLinkAccountForm {
	readonly id: ThreadLinkAccountFormId;
	readonly label: string;
	readonly description: string;
	readonly fields: readonly ThreadLinkAccountField[];
}

export type ThreadLinkUnavailableAccountMethodId =
	| "chatgptDeviceCode"
	| "chatgptAuthTokens"
	| "amazonBedrockProfile"
	| "amazonBedrockEnvironment";

export interface ThreadLinkUnavailableAccountMethod {
	readonly id: ThreadLinkUnavailableAccountMethodId;
	readonly label: string;
	readonly explanation: string;
}

export type ThreadLinkAccountFieldValues = Readonly<Record<string, string>>;

export type ThreadLinkLoginBuild =
	| { readonly ok: true; readonly login: ThreadLinkLoginParams }
	| { readonly ok: false; readonly reason: string };

export interface ThreadLinkAccountDisclosure {
	readonly state: "unknown" | "signed_out" | "login_pending" | "ready" | "failed";
	readonly label: string;
	readonly detail: string;
	readonly pendingLoginId: LoginId | null;
	readonly forms: readonly ThreadLinkAccountForm[];
	readonly unavailable: readonly ThreadLinkUnavailableAccountMethod[];
	readonly canLogin: boolean;
	readonly canCancelLogin: boolean;
	readonly canLogout: boolean;
	readonly blockedReason: string | null;
}

export type ThreadLinkActionName =
	| "create"
	| "attach"
	| "relink"
	| "login"
	| "cancel_login"
	| "logout"
	| "recover";

/**
 * The pane, epoch, lease, and link an action was offered against. The three
 * captured identities are null only when the workbench refused to hand out a
 * target at all, which is itself the reason the action failed.
 */
export interface ThreadLinkActionTarget {
	readonly paneId: string;
	readonly childId: BrowserWorkbenchCommandTarget["childId"] | null;
	readonly epoch: BrowserWorkbenchCommandTarget["epoch"] | null;
	readonly commandId: BrowserWorkbenchCommandTarget["commandId"] | null;
	readonly threadId: ThreadId | null;
	readonly capturedLinkState: BrowserThreadLink["state"] | null;
	readonly capturedLinkThreadId: ThreadId | null;
}

export interface ThreadLinkRecoveryTarget {
	readonly paneId: string;
	readonly intent: ThreadLinkRecoveryIntent;
}

export type ThreadLinkActionSnapshot =
	| { readonly state: "idle"; readonly revision: number }
	| {
			readonly state: "pending";
			readonly revision: number;
			readonly action: ThreadLinkActionName;
			readonly target: ThreadLinkActionTarget | ThreadLinkRecoveryTarget;
			readonly announcement: string;
	  }
	| {
			readonly state: "succeeded" | "inspect_only" | "failed";
			readonly revision: number;
			readonly action: ThreadLinkActionName;
			readonly target: ThreadLinkActionTarget | ThreadLinkRecoveryTarget;
			readonly announcement: string;
			readonly recovery: ThreadLinkRecovery | null;
	  };

/** Applied means this settlement is the published one; ignored means superseded. */
export interface ThreadLinkActionCompletion {
	readonly state: "applied" | "ignored";
	readonly revision: number;
}

/** Everything one action is captured against, read once when it is offered. */
export interface ThreadLinkPaneCapture {
	readonly paneId: string;
	readonly transport: BrowserWorkbenchTransport;
	readonly hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[];
}

export interface ThreadLinkHostRecovery {
	readonly paneId: string;
	readonly intent: ThreadLinkRecoveryIntent;
	readonly recover: () => Promise<void>;
}

export interface ThreadLinkControllerOptions {
	/** Read once per action; a later focus change cannot reach a running action. */
	readonly capturePane: () => ThreadLinkPaneCapture;
	readonly captureHostRecovery?: (
		target: ThreadLinkRecoveryTarget,
	) => ThreadLinkHostRecovery | null;
}

export interface ThreadLinkController {
	readonly snapshot: () => ThreadLinkActionSnapshot;
	readonly subscribe: (listener: () => void) => () => void;
	readonly create: () => Promise<ThreadLinkActionCompletion>;
	readonly bind: (row: ThreadLinkRow) => Promise<ThreadLinkActionCompletion>;
	readonly login: (login: ThreadLinkLoginParams) => Promise<ThreadLinkActionCompletion>;
	readonly cancelLogin: (loginId: LoginId) => Promise<ThreadLinkActionCompletion>;
	readonly logout: () => Promise<ThreadLinkActionCompletion>;
	readonly recover: (
		intent: ThreadLinkControllerRecoveryIntent,
	) => Promise<ThreadLinkActionCompletion>;
}

export interface ThreadLinkPanelInput {
	readonly paneId: string;
	readonly state: BrowserWorkbenchState;
	readonly capabilities: BrowserWorkbenchCapabilities;
	readonly inventory: ThreadLinkInventory;
	readonly hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[];
	readonly action: ThreadLinkActionSnapshot;
}

export interface ThreadLinkPanelSnapshot {
	readonly paneId: string;
	readonly readiness: ThreadLinkReadinessDisclosure;
	readonly currentLink: {
		readonly state: BrowserThreadLink["state"];
		readonly label: string;
		readonly detail: string;
		readonly threadId: ThreadId | null;
	};
	readonly create: ThreadLinkCreateOffer;
	readonly selection: ThreadLinkSelection;
	readonly account: ThreadLinkAccountDisclosure;
	readonly action: ThreadLinkActionSnapshot;
}

export interface WorkbenchThreadLinkProps {
	readonly paneId: string;
	readonly transport: BrowserWorkbenchTransport;
	readonly controller: ThreadLinkController;
	readonly inventory: ThreadLinkInventory;
	readonly hostRecoveryIntents?: readonly ThreadLinkRecoveryIntent[];
	/** Which supported sign-in form opens first; every form stays reachable. */
	readonly initialAccountForm?: ThreadLinkAccountFormId;
	readonly className?: string;
}

export type { BrowserWorkbenchCapabilities, BrowserWorkbenchState };
