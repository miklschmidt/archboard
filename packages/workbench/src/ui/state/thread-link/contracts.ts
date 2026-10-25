// The thread link's typed inputs and outputs: the browser tab's one link to its
// workhorse, and how one action settles.

import type { BrowserThreadLink } from "@archboard/codex-realtime-voice/contract";
import type { LoginId, ThreadId } from "@archboard/codex-app-server/identity";
import type {
	ThreadLinkCommandName,
	ThreadLinkLoginParams,
	ThreadLinkTransportPort,
	WorkbenchCommandTarget,
} from "#ui/state/thread-link/transport-port.ts";

/**
 * Every browser command this module can issue. One list, so a fixture and the
 * module cannot disagree about what the workbench must support.
 */
const THREAD_LINK_MODULE_COMMANDS = [
	"threadLinkCreate",
	"accountLogin",
	"accountLoginCancel",
	"accountLogout",
] as const satisfies readonly ThreadLinkCommandName[];

type ThreadLinkActionName = "create" | "login" | "cancel_login" | "logout";

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
	readonly capturedLinkState: BrowserThreadLink["state"] | null;
	readonly capturedLinkThreadId: ThreadId | null;
}

type ThreadLinkActionSnapshot =
	| { readonly state: "idle"; readonly revision: number }
	| {
			readonly state: "pending";
			readonly revision: number;
			readonly action: ThreadLinkActionName;
			readonly target: ThreadLinkActionTarget;
			readonly announcement: string;
	  }
	| {
			readonly state: "succeeded" | "inspect_only" | "failed";
			readonly revision: number;
			readonly action: ThreadLinkActionName;
			readonly target: ThreadLinkActionTarget;
			readonly announcement: string;
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
}

/** How the controller reaches its pane. */
interface ThreadLinkControllerOptions {
	/** Read once per action; a later focus change cannot reach a running action. */
	readonly capturePane: () => ThreadLinkPaneCapture;
}

/** The thread-link action controller. */
interface ThreadLinkController {
	readonly snapshot: () => ThreadLinkActionSnapshot;
	readonly subscribe: (listener: () => void) => () => void;
	readonly create: () => Promise<ThreadLinkActionCompletion>;
	readonly login: (login: ThreadLinkLoginParams) => Promise<ThreadLinkActionCompletion>;
	readonly cancelLogin: (loginId: LoginId) => Promise<ThreadLinkActionCompletion>;
	readonly logout: () => Promise<ThreadLinkActionCompletion>;
}

export {
	THREAD_LINK_MODULE_COMMANDS,
	type ThreadLinkActionCompletion,
	type ThreadLinkActionName,
	type ThreadLinkActionSnapshot,
	type ThreadLinkActionTarget,
	type ThreadLinkController,
	type ThreadLinkControllerOptions,
	type ThreadLinkPaneCapture,
};
