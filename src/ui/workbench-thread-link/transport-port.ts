// What the thread link needs from a workbench transport, and nothing more.
//
// `@/ui/workbench-transport` implements this port (TASK-150.07). The thread
// link never owns or starts a transport: it reads one authoritative state,
// captures the target an action is offered against, and sends the seven
// account and thread-link commands the gateway publishes. Every shape here is
// the transport's own contract spelled structurally, so the real transport
// satisfies it without an adapter.

import type {
	BrowserGatewayAccountReadResult,
	BrowserGatewayCommandResult,
	BrowserGatewayErrorCode,
} from "@/shared/codex-browser-gateway";
import type { CodexLoginAccountParams } from "@/shared/codex-app-server-contract";
import type {
	BrowserCommand,
	BrowserCommandLease,
	BrowserReadiness,
	BrowserSnapshot,
	BrowserThreadLink,
	DeliveryOutcome,
} from "@/shared/codex-browser-model";

/** Every command name the browser contract publishes. */
type WorkbenchCommandName = BrowserCommand["command"];

/** The sign-in variants the closed browser contract admits. */
type SupportedLoginVariant = "apiKey" | "chatgpt" | "amazonBedrock" | "amazonBedrockAccessKeys";

/** The account/login/start parameters a browser may send. */
type ThreadLinkLoginParams = Extract<
	CodexLoginAccountParams,
	{ readonly type: SupportedLoginVariant }
>;

/** The seven commands this module can issue. */
type ThreadLinkCommandName =
	| "threadLinkCreate"
	| "threadLinkRefresh"
	| "threadLinkAttach"
	| "threadLinkRelink"
	| "accountLogin"
	| "accountLoginCancel"
	| "accountLogout";

/** A command without the envelope the transport adds on dispatch. */
type Draft<Name extends WorkbenchCommandName> = Omit<
	Extract<BrowserCommand, { readonly command: Name }>,
	"kind" | "commandId" | "paneId" | "childId" | "epoch"
>;

/** The login command, with the typed login the transport requires. */
type AccountLoginDraft = Omit<Draft<"accountLogin">, "login"> & {
	readonly login: ThreadLinkLoginParams;
};

/** The drafts this module sends. */
type ThreadLinkCommandDraft =
	| Draft<"threadLinkCreate">
	| Draft<"threadLinkRefresh">
	| Draft<"threadLinkAttach">
	| Draft<"threadLinkRelink">
	| AccountLoginDraft
	| Draft<"accountLoginCancel">
	| Draft<"accountLogout">;

/** The exact lease authority a command is dispatched under. */
interface WorkbenchCommandTarget {
	readonly commandId: BrowserCommandLease["commandId"];
	readonly paneId: BrowserCommandLease["paneId"];
	readonly childId: BrowserCommandLease["childId"];
	readonly epoch: BrowserCommandLease["epoch"];
	readonly capturedThreadLink: BrowserThreadLink;
}

/** A displayed action's link, captured without acquiring command authority. */
interface WorkbenchCommandIntent {
	readonly capturedThreadLink: BrowserThreadLink;
	readonly authority: WorkbenchCommandTarget | null;
}

/** The transport's answer to one command. */
type WorkbenchCommandResult = BrowserGatewayCommandResult;

/** The transport's answer to an account read. */
type WorkbenchAccountReadResult = BrowserGatewayAccountReadResult;

/** Every error code a transport can carry, gateway and transport-local. */
type WorkbenchTransportErrorCode =
	| BrowserGatewayErrorCode
	| "gateway_error"
	| "socket_unavailable"
	| "response_lost"
	| "replaced"
	| "incompatible_contract";

/** The facts a thrown transport error carries, read structurally. */
interface WorkbenchTransportErrorFacts {
	readonly code: WorkbenchTransportErrorCode;
	readonly outcome: DeliveryOutcome;
	readonly message: string;
}

/** The one state a transport publishes, as its stream, connection or readiness owner reports it. */
type WorkbenchTransportState =
	| {
			readonly kind: "connection";
			readonly state: "stopped";
			readonly connection: "stopped";
			readonly snapshot: null;
			readonly sequence: null;
			readonly reason: string;
	  }
	| {
			readonly kind: "connection";
			readonly state: "reconnecting";
			readonly connection: "reconnecting";
			readonly snapshot: BrowserSnapshot | null;
			readonly sequence: number | null;
			readonly reason: string;
	  }
	| {
			readonly kind: "connection";
			readonly state: "backoff";
			readonly connection: "reconnecting";
			readonly snapshot: BrowserSnapshot | null;
			readonly sequence: number | null;
			readonly retryAtMs: number;
			readonly reason: string;
	  }
	| {
			readonly kind: "stream";
			readonly state: "stale_snapshot";
			readonly connection: "connected";
			readonly snapshot: BrowserSnapshot | null;
			readonly sequence: number | null;
			readonly expectedSequence: number;
			readonly receivedSequence: number;
			readonly reason: string;
	  }
	| {
			readonly kind: "connection";
			readonly state: "incompatible_contract";
			readonly connection: "stopped";
			readonly snapshot: null;
			readonly sequence: null;
			readonly reason: string;
	  }
	| {
			readonly kind: "readiness";
			readonly state: BrowserReadiness["state"];
			readonly connection: "connected";
			readonly snapshot: BrowserSnapshot;
			readonly sequence: number;
	  };

/** The capability facts the thread link reads; the transport publishes more. */
interface WorkbenchTransportCapabilities {
	readonly connected: boolean;
	readonly canReadAccount: boolean;
	readonly supportsCommand: (command: WorkbenchCommandName) => boolean;
}

/** The transport surface the thread link uses. */
interface ThreadLinkTransportPort {
	readonly state: () => WorkbenchTransportState;
	readonly capabilities: () => WorkbenchTransportCapabilities;
	readonly captureCommandIntent: () => WorkbenchCommandIntent;
	/** Human actions acquire fresh authority once, revalidate the intent, then dispatch once. */
	readonly executeCommand: (
		draft: ThreadLinkCommandDraft,
		intent?: WorkbenchCommandIntent,
	) => Promise<WorkbenchCommandResult>;
	/** Re-reads the authoritative snapshot for the link this pane is on. */
	readonly refresh: () => Promise<unknown>;
	/** Re-reads the Codex account. */
	readonly accountRead: () => Promise<WorkbenchAccountReadResult>;
}

export type {
	ThreadLinkCommandDraft,
	ThreadLinkCommandName,
	ThreadLinkLoginParams,
	ThreadLinkTransportPort,
	WorkbenchAccountReadResult,
	WorkbenchCommandIntent,
	WorkbenchCommandName,
	WorkbenchCommandResult,
	WorkbenchCommandTarget,
	WorkbenchTransportCapabilities,
	WorkbenchTransportErrorCode,
	WorkbenchTransportErrorFacts,
	WorkbenchTransportState,
};
