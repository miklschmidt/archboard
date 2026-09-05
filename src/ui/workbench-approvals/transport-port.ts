// What the approvals surface needs from a workbench transport, and nothing
// more. `@/ui/workbench-transport` implements this port (TASK-150.07). The
// surface never owns or starts a transport: it reads one authoritative state,
// captures the target a decision is offered against, and sends exactly one
// response per decision. Every shape here is the transport's own contract
// spelled structurally, so the real transport satisfies it without an adapter.

import type {
	BrowserGatewayCommandResult,
	BrowserGatewayErrorCode,
} from "@/shared/codex-browser-gateway";
import type { CodexServerResponseByMethod } from "@/shared/codex-app-server-contract";
import type {
	BrowserApproval,
	BrowserCommand,
	BrowserCommandLease,
	BrowserReadiness,
	BrowserSnapshot,
	BrowserThreadLink,
	DeliveryOutcome,
} from "@/shared/codex-browser-model";

/** Every command name the browser contract publishes. */
type WorkbenchCommandName = BrowserCommand["command"];

type ApprovalKind = BrowserApproval["approvalKind"];

/** One family's wire response, tagged with the family it answers. */
type ApprovalResponseFor<
	Kind extends ApprovalKind,
	Method extends keyof CodexServerResponseByMethod,
> = Readonly<{ approvalKind: Kind }> & CodexServerResponseByMethod[Method];

/** The typed response of every ordinary approval family. */
type ApprovalResponse =
	| ApprovalResponseFor<"command_execution", "item/commandExecution/requestApproval">
	| ApprovalResponseFor<"file_change", "item/fileChange/requestApproval">
	| ApprovalResponseFor<"user_input", "item/tool/requestUserInput">
	| ApprovalResponseFor<"elicitation", "mcpServer/elicitation/request">
	| ApprovalResponseFor<"permissions", "item/permissions/requestApproval">
	| ApprovalResponseFor<"apply_patch", "applyPatchApproval">
	| ApprovalResponseFor<"exec_command", "execCommandApproval">;

/** A command without the envelope the transport adds on dispatch. */
type Draft<Name extends WorkbenchCommandName> = Omit<
	Extract<BrowserCommand, { readonly command: Name }>,
	"kind" | "commandId" | "paneId" | "childId" | "epoch"
>;

/** The ordinary approval response, with the typed response the transport requires. */
type ApprovalRespondDraft = Omit<Draft<"approvalRespond">, "response"> & {
	readonly response: ApprovalResponse;
};

/** The dynamic coordination approval response. */
type DynamicApprovalRespondDraft = Draft<"dynamicApprovalRespond">;

/** The two commands this surface sends. */
type ApprovalCommandDraft = ApprovalRespondDraft | DynamicApprovalRespondDraft;

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
 * Exact authority, when present, is retained only for request-bound decisions.
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

/** The capability facts the surface reads; the transport publishes more. */
interface WorkbenchTransportCapabilities {
	/** The linked workbench can accept a human action and acquire its authority. */
	readonly canCommand: boolean;
	readonly supportsCommand: (command: WorkbenchCommandName) => boolean;
}

/** The transport surface the approvals use. */
interface WorkbenchApprovalsTransportPort {
	readonly state: () => WorkbenchTransportState;
	readonly capabilities: () => WorkbenchTransportCapabilities;
	readonly captureCommandIntent: () => WorkbenchCommandIntent;
	/** Human actions acquire fresh authority once, revalidate the intent, then dispatch once. */
	readonly executeCommand: (
		draft: ApprovalCommandDraft,
		intent?: WorkbenchCommandIntent,
	) => Promise<WorkbenchCommandResult>;
	/** Request-bound decisions dispatch under the exact lease they were offered under. */
	readonly command: (
		draft: ApprovalCommandDraft,
		target?: WorkbenchCommandTarget,
	) => Promise<WorkbenchCommandResult>;
}

export type {
	ApprovalCommandDraft,
	ApprovalRespondDraft,
	ApprovalResponse,
	DynamicApprovalRespondDraft,
	WorkbenchApprovalsTransportPort,
	WorkbenchCommandIntent,
	WorkbenchCommandName,
	WorkbenchCommandResult,
	WorkbenchCommandTarget,
	WorkbenchTransportCapabilities,
	WorkbenchTransportErrorCode,
	WorkbenchTransportErrorFacts,
	WorkbenchTransportState,
};
