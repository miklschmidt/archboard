// What the queue needs from a workbench transport, and nothing more.
//
// `@/ui/workbench-transport` implements this port (TASK-150.07). The queue
// never owns, starts or attaches a transport: it reads one authoritative state
// through the port it is handed and emits the five queue commands the gateway
// publishes, each against the target captured when the control was offered.
// Every shape here is the transport's own contract spelled structurally, so the
// real transport satisfies it without an adapter.

import type {
	BrowserGatewayCommandResult,
	BrowserGatewayErrorCode,
} from "@/shared/codex-browser-gateway";
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

/** The five gateway queue commands. */
type QueueCommandName = "queueAdd" | "queueUpdate" | "queueDelete" | "queueReorder" | "queueStart";

/** A queue command without the envelope the transport adds on dispatch. */
type QueueCommandDraft = {
	[Name in QueueCommandName]: Omit<
		Extract<BrowserCommand, { readonly command: Name }>,
		"kind" | "commandId" | "paneId" | "childId" | "epoch"
	>;
}[QueueCommandName];

/** The exact lease authority a command is dispatched under. */
interface WorkbenchCommandTarget {
	readonly commandId: BrowserCommandLease["commandId"];
	readonly paneId: BrowserCommandLease["paneId"];
	readonly childId: BrowserCommandLease["childId"];
	readonly epoch: BrowserCommandLease["epoch"];
	readonly capturedThreadLink: BrowserThreadLink;
}

/**
 * A displayed action's link, captured without acquiring command authority.
 * Capture and execute through the same transport; a copied or invented intent
 * is refused because it cannot prove the socket generation it came from.
 */
interface WorkbenchCommandIntent {
	readonly capturedThreadLink: BrowserThreadLink;
	readonly authority: WorkbenchCommandTarget | null;
}

/** The transport's answer to one command. */
type WorkbenchCommandResult = BrowserGatewayCommandResult;

/** Every error code a transport can carry, gateway and transport-local. */
type WorkbenchTransportErrorCode =
	| BrowserGatewayErrorCode
	| "gateway_error"
	| "socket_unavailable"
	| "response_lost"
	| "replaced"
	| "incompatible_contract";

/**
 * The facts a thrown transport error carries. The transport throws its own
 * error class; this module reads the facts structurally so it never depends
 * on that class.
 */
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

/** The capability facts the queue reads; the transport publishes more. */
interface WorkbenchTransportCapabilities {
	readonly connected: boolean;
	readonly readiness: BrowserReadiness["state"] | null;
	readonly supportsCommand: (command: WorkbenchCommandName) => boolean;
}

/** The transport surface the queue uses. */
interface WorkbenchQueueTransportPort {
	readonly state: () => WorkbenchTransportState;
	readonly capabilities: () => WorkbenchTransportCapabilities;
	readonly subscribe: (listener: () => void) => () => void;
	readonly captureCommandIntent: () => WorkbenchCommandIntent;
	/** Human actions acquire fresh authority once, revalidate the intent, then dispatch once. */
	readonly executeCommand: (
		draft: QueueCommandDraft,
		intent?: WorkbenchCommandIntent,
	) => Promise<WorkbenchCommandResult>;
	/** Re-reads the authoritative snapshot for the link this pane is on. */
	readonly refresh: () => Promise<unknown>;
}

export type {
	QueueCommandDraft,
	QueueCommandName,
	WorkbenchCommandIntent,
	WorkbenchCommandName,
	WorkbenchCommandResult,
	WorkbenchCommandTarget,
	WorkbenchQueueTransportPort,
	WorkbenchTransportCapabilities,
	WorkbenchTransportErrorCode,
	WorkbenchTransportErrorFacts,
	WorkbenchTransportState,
};
