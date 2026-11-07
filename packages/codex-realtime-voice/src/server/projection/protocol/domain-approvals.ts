import type { BrowserDynamicApprovalActions } from "#server/chat-conversations/gateway/protocol/contract.ts";
import type { BrowserDynamicApproval } from "#shared/dynamic-approval/schemas/approval.ts";
import type { TabSessionId } from "#server/tab-session/rules/tab-session.ts";
import type { BrowserCommandId } from "@archboard/codex-app-server/identity";

/** Host-owned approvals that the workbench presents and answers. */
interface WorkbenchDomainApprovals {
	readonly browser: BrowserDynamicApprovalActions;
	readonly pending: (tabSessionId: TabSessionId) => readonly BrowserDynamicApproval[];
	readonly bindLease: (
		tabSessionId: TabSessionId,
		chatId: string,
		commandId: BrowserCommandId,
	) => void;
}

export type { WorkbenchDomainApprovals };
