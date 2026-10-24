import type { CodexSession } from "@archboard/codex-app-server/session";
import type {
	CodexTransport,
	DynamicServerRequest,
	TransportServerNotification,
} from "@archboard/codex-app-server/transport";
import type {
	ChildId,
	ChildEpoch,
	IdentityAuthorities,
} from "@archboard/codex-app-server/identity";
import type { CodexEpochStore } from "#runtime/store/epoch/contract.ts";
import type { CodexThreadLinkPort } from "#runtime/rules/thread-link/contract.ts";
import type { CodexApprovalBroker } from "#runtime/services/approvals/contract.ts";
import type { WorkbenchDomainApprovals } from "#server/protocol/projection/domain-approvals.ts";
import type { CodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";

/** Capabilities granted to an installed domain. The core retains generation and process ownership. */
export interface CodexWorkbenchDomainScope {
	readonly identity: IdentityAuthorities;
	readonly epoch: CodexEpochStore;
	readonly transport: CodexTransport;
	readonly session: CodexSession;
	readonly threadLink: CodexThreadLinkPort;
	readonly approvals: CodexApprovalBroker;
	readonly sessions: Pick<
		CodexWorkbenchSessions,
		"open" | "list" | "require" | "forThread" | "workhorseForThread" | "end" | "onChange"
	>;
	readonly assertCurrent: () => void;
	readonly shutdown: () => Promise<
		import("#server/services/generation/lifecycle.ts").CodexWorkbenchSnapshot
	>;
	readonly publish: () => void;
}

/** A host owns its domain tools, their visual approvals, and their cleanup together. */
export interface CodexWorkbenchDomain {
	readonly dispatch: (request: DynamicServerRequest) => Promise<unknown>;
	readonly approvals?: WorkbenchDomainApprovals;
	readonly onNotification?: (event: TransportServerNotification) => void;
	readonly endSession?: (id: TabSessionId) => void;
	readonly childExit?: (child: ChildId, epoch: ChildEpoch) => Promise<void> | void;
	readonly shutdown?: (cause: "server_shutdown" | "child_disconnected") => Promise<void> | void;
	readonly dispose: () => void;
}

export interface CodexWorkbenchDomainTools {
	readonly registrations: readonly { readonly namespace: string; readonly manifestHash: string }[];
	readonly install: (scope: CodexWorkbenchDomainScope) => CodexWorkbenchDomain;
}
