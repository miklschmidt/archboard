// The voice client's public shape: what a host passes in, the one state it
// publishes, and the actions a page calls. The wire shapes come from the
// shared browser schemas and the transport contract, never a local copy.

import type { RealtimePhase } from "#shared/protocol/realtime-contract.ts";
import type { BrowserSnapshot } from "#shared/schemas/browser/snapshot.ts";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchCommandIntent,
	BrowserWorkbenchState,
} from "#ui/state/transport/contract.ts";

/**
 * How a host connects one page view to the voice server. The tab session id
 * lives in `sessionStorage`, so a reload keeps its conversation and another tab
 * gets its own.
 */
interface VoiceClientOptions {
	/**
	 * The server's socket path, or a full URL. A path resolves against the page
	 * location, and `http:` or `https:` becomes `ws:` or `wss:`.
	 */
	readonly socketPath: string;
	/** The view in the host page that shows this conversation. Defaults to `main`. */
	readonly paneId?: string;
}

/** Why the last action failed. */
interface VoiceClientFailure {
	/** Plain words for the failure. */
	readonly message: string;
	/**
	 * The action may have reached the server. Refresh before trying again,
	 * because a blind retry could do it twice.
	 */
	readonly uncertain: boolean;
}

/** The voice run of the coordinator, as the page shows it. */
interface VoiceClientVoice {
	/** Where the voice run stands; `idle` when none runs. */
	readonly phase: RealtimePhase;
	/** A new voice run can start in this browser and connection. */
	readonly available: boolean;
	/** Why voice cannot start or why the last run failed, or null. */
	readonly problem: string | null;
}

/** One ordinary approval request that the server shows. */
type VoiceApproval = BrowserSnapshot["approvals"][number];

/** The answer to one approval, spelled by the app-server method it settles. */
type VoiceApprovalResponse = Extract<
	BrowserCommandDraft,
	{ readonly command: "approvalRespond" }
>["response"];

/** How the account signs in. */
type VoiceSignIn = Extract<BrowserCommandDraft, { readonly command: "accountLogin" }>["login"];

/**
 * What the page showed when it offered an action. Pass the `intent` of the
 * state that rendered an approval back with its answer: the server refuses the
 * answer, rather than retargeting it, if the conversation moved since.
 */
type VoiceCommandIntent = BrowserWorkbenchCommandIntent;

/** The one state the client publishes. Each publication is a new frozen object. */
interface VoiceClientSnapshot {
	/** The socket to the server. */
	readonly connection: BrowserWorkbenchState["connection"];
	/**
	 * What the server last published: the account, the sign-in, the thread
	 * link, the workhorse timeline, approvals, queue and the voice transcript.
	 * Null before the first publication.
	 */
	readonly server: BrowserSnapshot | null;
	/** The coordinator's voice run. */
	readonly voice: VoiceClientVoice;
	/** An action is running. Only the two stops run during another action. */
	readonly busy: boolean;
	/** Why the last action failed, or null. The next action clears it when it starts. */
	readonly failure: VoiceClientFailure | null;
	/** The intent that binds an answer to the approvals of this state, or null while none can be sent. */
	readonly intent: VoiceCommandIntent | null;
}

/**
 * One page view's connection to the voice server. Every action resolves true
 * when it completed. It resolves false when it failed, and the failure is then
 * in the published state. It also resolves false, and changes nothing, after
 * `dispose` or while another action runs; only `stopVoice` and `stopWork` run
 * during another action.
 */
interface VoiceClient {
	/**
	 * Open the socket with the tab's session id, or open it again. After a
	 * socket that was open closes, the client reconnects by itself: `connection`
	 * reads `reconnecting`, the client opens a new socket after a short wait,
	 * and it tries again after each attempt that fails, until one opens or the
	 * client is disposed. A first `connect` that fails is not retried; the host
	 * calls `connect` again.
	 */
	readonly connect: () => Promise<boolean>;
	/** Read the server's current state again without repeating a command. */
	readonly refresh: () => Promise<boolean>;
	/** Start a sign-in. Defaults to the private ChatGPT sign-in. */
	readonly signIn: (login?: VoiceSignIn) => Promise<boolean>;
	/** Cancel the pending sign-in. */
	readonly cancelSignIn: () => Promise<boolean>;
	/** Sign the account out. */
	readonly signOut: () => Promise<boolean>;
	/** Send a message to the workhorse, creating its conversation on first use. */
	readonly send: (message: string) => Promise<boolean>;
	/** Start the coordinator's voice, creating the conversation on first use. */
	readonly startVoice: () => Promise<boolean>;
	/** Stop voice. The workhorse keeps working. Runs during another action. */
	readonly stopVoice: () => Promise<boolean>;
	/** Silence or restore the microphone of the running voice. */
	readonly setMuted: (muted: boolean) => Promise<boolean>;
	/** Interrupt the workhorse's running turn. Voice keeps running. Runs during another action. */
	readonly stopWork: () => Promise<boolean>;
	/**
	 * Answer one approval that the page showed.
	 * @param approval The request from the rendered state.
	 * @param response The answer.
	 * @param intent The `intent` of the state that rendered the request.
	 */
	readonly answerApproval: (
		approval: VoiceApproval,
		response: VoiceApprovalResponse,
		intent: VoiceCommandIntent,
	) => Promise<boolean>;
	/** The current state; the same object until the next publication. */
	readonly snapshot: () => VoiceClientSnapshot;
	/** Hear every publication. Returns the unsubscribe. */
	readonly subscribe: (listener: () => void) => () => void;
	/**
	 * Stop voice, release the socket and end every subscription. A disposed
	 * client never connects again, so a host that mounts twice, as React
	 * StrictMode does, creates a client for each mount.
	 */
	readonly dispose: () => Promise<void>;
}

export type {
	VoiceApproval,
	VoiceApprovalResponse,
	VoiceClient,
	VoiceClientFailure,
	VoiceClientOptions,
	VoiceClientSnapshot,
	VoiceClientVoice,
	VoiceCommandIntent,
	VoiceSignIn,
};
