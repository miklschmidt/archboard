// The thread link's typed inputs and outputs: the one explicit link from a
// pane to its workhorse, the host's joined candidate inventory, readiness and
// its recoveries, the supported sign-in forms, and how one action settles.

import type {
	BrowserThreadCandidate,
	BrowserThreadCandidates,
	BrowserThreadLink,
} from "@/shared/codex-browser-model";
import type { LoginId, ThreadId } from "@/shared/codex-workbench-identity";
import type {
	ThreadLinkCommandName,
	ThreadLinkLoginParams,
	ThreadLinkTransportPort,
	WorkbenchCommandTarget,
	WorkbenchTransportCapabilities,
	WorkbenchTransportState,
} from "@/ui/workbench-thread-link/transport-port";

type ListedThreadLink = Exclude<BrowserThreadLink, { readonly state: "unbound" }>;

/**
 * Every browser command this module can issue. One list, so a fixture and the
 * module cannot disagree about what the workbench must support.
 */
const THREAD_LINK_MODULE_COMMANDS = [
	"threadLinkCreate",
	"threadLinkRefresh",
	"threadLinkAttach",
	"threadLinkRelink",
	"accountLogin",
	"accountLoginCancel",
	"accountLogout",
] as const satisfies readonly ThreadLinkCommandName[];

/** The four Codex thread statuses a listed record can carry. */
type ThreadLinkListedStatus = ListedThreadLink["status"];

type ThreadLinkAccountFormId = ThreadLinkLoginParams["type"];

/**
 * The host's own joined inventory, exactly as the workbench snapshot publishes
 * it. The host owns the join and the classification; this module renders that
 * verdict and never re-derives one.
 */
type ThreadLinkInventory = BrowserThreadCandidates;
type ThreadLinkInventoryRecord = BrowserThreadCandidate;

type ThreadLinkRecoveryIntent =
	| "refresh_snapshot"
	| "read_account"
	/** Runs the threadLinkRefresh command; the host owns discovery itself. */
	| "refresh_inventory"
	| "start_workbench"
	| "choose_binary"
	| "unlock_home"
	| "repair_storage"
	| "retry_login"
	| "cancel_login"
	| "sign_out";

/**
 * The recovery intents the controller performs itself. Retrying, cancelling
 * or ending a sign-in are account controls with their own arguments, so they
 * are offered through the account section rather than as a generic recovery.
 */
type ThreadLinkControllerRecoveryIntent = Exclude<
	ThreadLinkRecoveryIntent,
	"retry_login" | "cancel_login" | "sign_out" | "refresh_inventory"
>;

/** Who can actually perform a recovery, so a dead control is never rendered. */
type ThreadLinkRecoveryOwner = "transport" | "host" | "none";

/** One recovery a person may take. */
interface ThreadLinkRecovery {
	readonly intent: ThreadLinkRecoveryIntent;
	readonly label: string;
	readonly description: string;
	readonly owner: ThreadLinkRecoveryOwner;
	readonly available: boolean;
}

type ThreadLinkReadinessArm =
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
	| "coordinator_failed"
	| "account_ready"
	| "thread_capable";

type ThreadLinkReadinessTone = "ready" | "progress" | "blocked" | "failed";

/** Where the workbench stands, with its recoveries. */
interface ThreadLinkReadinessDisclosure {
	readonly arm: ThreadLinkReadinessArm;
	readonly tone: ThreadLinkReadinessTone;
	readonly label: string;
	readonly detail: string;
	/** Present only on the backoff arm, which is the one arm carrying an instant. */
	readonly retryAtMs: number | null;
	readonly recoveries: readonly ThreadLinkRecovery[];
}

type ThreadLinkRowIntent = "attach" | "relink" | "current";

/** What binding this record would disclose before anybody binds it. */
type ThreadLinkRowOutcome = "executable" | "inspect_only";

/** One candidate as a bindable row. */
interface ThreadLinkRow {
	readonly selectionId: string;
	readonly threadId: ThreadId;
	readonly intent: ThreadLinkRowIntent;
	readonly outcome: ThreadLinkRowOutcome;
	readonly command: "threadLinkAttach" | "threadLinkRelink" | null;
	readonly stateLabel: string;
	readonly sourceLabel: string;
	readonly statusLabel: string;
	readonly loadedLabel: string;
	readonly controllabilityLabel: string;
	readonly reasonLabel: string;
	readonly enabled: boolean;
	readonly blockedReason: string | null;
}

/** The candidate inventory as rows. */
interface ThreadLinkSelection {
	readonly state: "unknown" | "unavailable" | "empty" | "listed";
	readonly summary: string;
	readonly rows: readonly ThreadLinkRow[];
	readonly recovery: ThreadLinkRecovery;
}

/** The offer to create a fresh workhorse. */
interface ThreadLinkCreateOffer {
	readonly command: "threadLinkCreate";
	readonly label: string;
	readonly enabled: boolean;
	readonly blockedReason: string | null;
}

/** One field of a sign-in form. */
interface ThreadLinkAccountField {
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly required: boolean;
	readonly secret: boolean;
}

/** One supported sign-in form. */
interface ThreadLinkAccountForm {
	readonly id: ThreadLinkAccountFormId;
	readonly label: string;
	readonly description: string;
	readonly fields: readonly ThreadLinkAccountField[];
}

type ThreadLinkUnavailableAccountMethodId =
	| "chatgptDeviceCode"
	| "chatgptAuthTokens"
	| "amazonBedrockProfile"
	| "amazonBedrockEnvironment";

/** A Codex sign-in method this workbench deliberately does not offer. */
interface ThreadLinkUnavailableAccountMethod {
	readonly id: ThreadLinkUnavailableAccountMethodId;
	readonly label: string;
	readonly explanation: string;
}

type ThreadLinkAccountFieldValues = Readonly<Record<string, string>>;

type ThreadLinkLoginBuild =
	| { readonly ok: true; readonly login: ThreadLinkLoginParams }
	| { readonly ok: false; readonly reason: string };

/** The account as the pane sees it. */
interface ThreadLinkAccountDisclosure {
	readonly state: "unknown" | "signed_out" | "login_pending" | "ready" | "failed";
	readonly label: string;
	readonly detail: string;
	readonly pendingLoginId: LoginId | null;
	/** Host-validated URL for the current pending ChatGPT sign-in only. */
	readonly authUrl: string | null;
	readonly forms: readonly ThreadLinkAccountForm[];
	readonly unavailable: readonly ThreadLinkUnavailableAccountMethod[];
	readonly canLogin: boolean;
	readonly canCancelLogin: boolean;
	readonly canLogout: boolean;
	readonly blockedReason: string | null;
}

type ThreadLinkActionName =
	| "create"
	| "refresh_inventory"
	| "attach"
	| "relink"
	| "unlink"
	| "login"
	| "cancel_login"
	| "logout"
	| "recover";

/**
 * The pane, epoch, lease, and link an action was offered against. The three
 * captured identities are null only when the workbench refused to hand out a
 * target at all, which is itself the reason the action failed.
 */
interface ThreadLinkActionTarget {
	readonly paneId: string;
	readonly childId: WorkbenchCommandTarget["childId"] | null;
	readonly epoch: WorkbenchCommandTarget["epoch"] | null;
	readonly commandId: WorkbenchCommandTarget["commandId"] | null;
	readonly threadId: ThreadId | null;
	readonly capturedLinkState: BrowserThreadLink["state"] | null;
	readonly capturedLinkThreadId: ThreadId | null;
}

/** The pane and intent a recovery was offered against. */
interface ThreadLinkRecoveryTarget {
	readonly paneId: string;
	readonly intent: ThreadLinkRecoveryIntent;
}

type ThreadLinkActionSnapshot =
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
interface ThreadLinkActionCompletion {
	readonly state: "applied" | "ignored";
	readonly revision: number;
}

/** Everything one action is captured against, read once when it is offered. */
interface ThreadLinkPaneCapture {
	readonly paneId: string;
	readonly transport: ThreadLinkTransportPort;
	readonly hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[];
}

/** A host-owned recovery this pane may run. */
interface ThreadLinkHostRecovery {
	readonly paneId: string;
	readonly intent: ThreadLinkRecoveryIntent;
	readonly recover: () => Promise<void>;
}

/** How the controller reaches its pane. */
interface ThreadLinkControllerOptions {
	/** Read once per action; a later focus change cannot reach a running action. */
	readonly capturePane: () => ThreadLinkPaneCapture;
	readonly captureHostRecovery?: (
		target: ThreadLinkRecoveryTarget,
	) => ThreadLinkHostRecovery | null;
}

/** The thread-link action controller. */
interface ThreadLinkController {
	readonly snapshot: () => ThreadLinkActionSnapshot;
	readonly subscribe: (listener: () => void) => () => void;
	readonly create: () => Promise<ThreadLinkActionCompletion>;
	readonly bind: (row: ThreadLinkRow) => Promise<ThreadLinkActionCompletion>;
	/** Bind the row the host listed under one selection id. */
	readonly bindSelection: (selectionId: string) => Promise<ThreadLinkActionCompletion>;
	/**
	 * Ask to drop the explicit link. The closed browser contract publishes no
	 * unbind command, so this settles as a refusal naming the two ways a pane
	 * can move on: link another conversation, or start a new agent.
	 */
	readonly unlink: () => Promise<ThreadLinkActionCompletion>;
	readonly refreshInventory: () => Promise<ThreadLinkActionCompletion>;
	readonly login: (login: ThreadLinkLoginParams) => Promise<ThreadLinkActionCompletion>;
	readonly cancelLogin: (loginId: LoginId) => Promise<ThreadLinkActionCompletion>;
	readonly logout: () => Promise<ThreadLinkActionCompletion>;
	readonly recover: (
		intent: ThreadLinkControllerRecoveryIntent,
	) => Promise<ThreadLinkActionCompletion>;
}

/** What the panel projection reads. */
interface ThreadLinkPanelInput {
	readonly paneId: string;
	readonly state: WorkbenchTransportState;
	readonly capabilities: WorkbenchTransportCapabilities;
	readonly hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[];
	readonly action: ThreadLinkActionSnapshot;
}

/** Everything the thread-link panel shows. */
interface ThreadLinkPanelSnapshot {
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

export {
	THREAD_LINK_MODULE_COMMANDS,
	type ThreadLinkAccountDisclosure,
	type ThreadLinkAccountField,
	type ThreadLinkAccountFieldValues,
	type ThreadLinkAccountForm,
	type ThreadLinkAccountFormId,
	type ThreadLinkActionCompletion,
	type ThreadLinkActionName,
	type ThreadLinkActionSnapshot,
	type ThreadLinkActionTarget,
	type ThreadLinkController,
	type ThreadLinkControllerOptions,
	type ThreadLinkControllerRecoveryIntent,
	type ThreadLinkCreateOffer,
	type ThreadLinkHostRecovery,
	type ThreadLinkInventory,
	type ThreadLinkInventoryRecord,
	type ThreadLinkListedStatus,
	type ThreadLinkLoginBuild,
	type ThreadLinkPaneCapture,
	type ThreadLinkPanelInput,
	type ThreadLinkPanelSnapshot,
	type ThreadLinkReadinessArm,
	type ThreadLinkReadinessDisclosure,
	type ThreadLinkReadinessTone,
	type ThreadLinkRecovery,
	type ThreadLinkRecoveryIntent,
	type ThreadLinkRecoveryOwner,
	type ThreadLinkRecoveryTarget,
	type ThreadLinkRow,
	type ThreadLinkRowIntent,
	type ThreadLinkRowOutcome,
	type ThreadLinkSelection,
	type ThreadLinkUnavailableAccountMethod,
	type ThreadLinkUnavailableAccountMethodId,
};
