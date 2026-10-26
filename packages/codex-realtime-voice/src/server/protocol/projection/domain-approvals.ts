import type { BrowserDynamicApprovalActions } from "#server/protocol/gateway/contract.ts";
import type { BrowserDynamicApproval } from "#shared/schemas/dynamic-approval/approval.ts";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
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
