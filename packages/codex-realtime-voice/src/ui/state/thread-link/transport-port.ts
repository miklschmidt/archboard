// What the thread link needs from a workbench transport, and nothing more.
//
// `ui/clients/transport` implements this port (TASK-150.07). The thread
// link never owns or starts a transport: it captures the target an action is
// offered against, and sends the four
// account and thread-link commands the gateway publishes. Every shape here is
// the transport's own contract spelled structurally, so the real transport
// satisfies it without an adapter.

import type {
	BrowserGatewayCommandResult,
	BrowserGatewayErrorCode,
} from "#shared/protocol/gateway-envelope.ts";
import type {
	BrowserCommand,
	BrowserCommandLease,
	BrowserThreadLink,
	DeliveryOutcome,
} from "#shared/schemas/browser/snapshot.ts";
import type { CodexLoginAccountParams } from "@archboard/codex-app-server/contract";

/** Every command name the browser contract publishes. */
type WorkbenchCommandName = BrowserCommand["command"];

/** The sign-in variants the closed browser contract admits. */
type SupportedLoginVariant = "apiKey" | "chatgpt" | "amazonBedrock" | "amazonBedrockAccessKeys";

/** The account/login/start parameters a browser may send. */
type ThreadLinkLoginParams = Extract<
	CodexLoginAccountParams,
	{ readonly type: SupportedLoginVariant }
>;

/** The four commands this module can issue. */
type ThreadLinkCommandName =
	| "threadLinkCreate"
	| "accountLogin"
	| "accountLoginCancel"
	| "accountLogout";

/** A command without the envelope the transport adds on dispatch. */
type Draft<Name extends WorkbenchCommandName> = Omit<
	Extract<BrowserCommand, { readonly command: Name }>,
	"kind" | "commandId" | "chatId" | "childId" | "epoch"
>;

/** The login command, with the typed login the transport requires. */
type AccountLoginDraft = Omit<Draft<"accountLogin">, "login"> & {
	readonly login: ThreadLinkLoginParams;
};

/** The drafts this module sends. */
type ThreadLinkCommandDraft =
	| Draft<"threadLinkCreate">
	| AccountLoginDraft
	| Draft<"accountLoginCancel">
	| Draft<"accountLogout">;

/** The exact lease authority a command is dispatched under. */
interface WorkbenchCommandTarget {
	readonly commandId: BrowserCommandLease["commandId"];
	readonly chatId: BrowserCommandLease["chatId"];
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

/** The capability facts the thread link reads; the transport publishes more. */
interface WorkbenchTransportCapabilities {
	readonly supportsCommand: (command: WorkbenchCommandName) => boolean;
}

/** The transport surface the thread link uses. */
interface ThreadLinkTransportPort {
	readonly capabilities: () => WorkbenchTransportCapabilities;
	readonly captureCommandIntent: () => WorkbenchCommandIntent;
	/** Human actions acquire fresh authority once, revalidate the intent, then dispatch once. */
	readonly executeCommand: (
		draft: ThreadLinkCommandDraft,
		intent?: WorkbenchCommandIntent,
	) => Promise<WorkbenchCommandResult>;
}

export type {
	ThreadLinkCommandDraft,
	ThreadLinkCommandName,
	ThreadLinkLoginParams,
	ThreadLinkTransportPort,
	WorkbenchCommandIntent,
	WorkbenchCommandName,
	WorkbenchCommandResult,
	WorkbenchCommandTarget,
	WorkbenchTransportCapabilities,
	WorkbenchTransportErrorCode,
	WorkbenchTransportErrorFacts,
};
